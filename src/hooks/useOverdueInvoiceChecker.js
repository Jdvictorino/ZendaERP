import { useEffect, useRef } from 'react';
import { invoices as invoicesApi, alerts as alertsApi } from '../api/client.js';

import { invoiceBalance } from '../utils/withholdings.js';
import { nextDue } from '../utils/paymentTerms.js';
import { todayRD } from '../utils/tax.js';
const STORAGE_KEY = 'overdue_alerted_ids';
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // cada 5 minutos

/**
 * Hook que detecta facturas vencidas en cuentas por cobrar y crea alertas automáticas.
 * Solo activo para roles admin/manager cuando el usuario está autenticado.
 *
 * Una factura se considera vencida si:
 * - Tiene `dueDate` en el pasado (con plazo por cuotas: alguna cuota vencida y sin cobrar)
 * - Tiene `amountPaid < total` (hay saldo pendiente)
 * - Su estado no es Cancelado, Anulado ni Pagado
 *
 * Registra en localStorage los IDs ya alertados para no duplicar notificaciones.
 */
function useOverdueInvoiceChecker(user) {
  const timerRef = useRef(null);

  useEffect(() => {
    const role = user?.role;
    if (!user || !['admin', 'manager'].includes(role)) return;

    const getAlertedIds = () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    };

    const addAlertedId = (id) => {
      const ids = getAlertedIds();
      if (!ids.includes(id)) {
        ids.push(id);
        // Mantener solo los últimos 500 para no crecer indefinidamente
        const trimmed = ids.slice(-500);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      }
    };

    const checkOverdue = async () => {
      try {
        // Obtener facturas activas (sin límite de paginación para revisión completa)
        const response = await invoicesApi.list({ limit: 200 });
        const allInvoices = response?.data || [];

        const now = new Date();
        const alertedIds = getAlertedIds();

        const today = todayRD();
        // Con plazo guardado vence la primera cuota con saldo (hora RD); sin él, el dueDate de siempre.
        const termDue = (inv) => (inv.paymentTerm?.schedule?.length ? nextDue(inv, today) : null);
        const alertKey = (inv) => { const t = termDue(inv); return t ? `${inv.id}:${t.dueDate}` : inv.id; };

        const overdueInvoices = allInvoices.filter(inv => {
          if (inv.paymentTerm?.schedule?.length) {
            if (!(termDue(inv)?.overdueDays > 0)) return false;
          } else {
            if (!inv.dueDate) return false;
            const due = new Date(inv.dueDate);
            if (due >= now) return false;
          }
          // Excluir estados terminales
          if (['Cancelado', 'Anulado', 'Pagado'].includes(inv.status)) return false;
          // Verificar si tiene saldo pendiente
          if (invoiceBalance(inv) <= 0) return false;
          // Ya fue alertada en esta sesión
          if (alertedIds.includes(alertKey(inv))) return false;
          return true;
        });

        // Crear alertas para cada factura vencida nueva
        for (const inv of overdueInvoices) {
          try {
            const daysOverdue = termDue(inv)?.overdueDays ?? Math.floor((now - new Date(inv.dueDate)) / 86400000);
            const outstanding = invoiceBalance(inv).toFixed(2);
            await alertsApi.create({
              type: 'overdue_invoice',
              title: `Factura Vencida - ${inv.orderNumber || inv.invoiceNumber || inv.id}`,
              message: `${daysOverdue} día${daysOverdue !== 1 ? 's' : ''} de atraso. Saldo pendiente: RD$${Number(outstanding).toLocaleString('es-DO')}`,
              data: {
                invoiceId: inv.id,
                orderNumber: inv.orderNumber,
                invoiceNumber: inv.invoiceNumber,
                daysOverdue,
                outstanding: parseFloat(outstanding),
                customerName: inv.customerName || inv.customer?.name || 'Cliente General'
              }
            });
            addAlertedId(alertKey(inv));
          } catch (alertErr) {
            console.warn('No se pudo crear alerta de factura vencida:', alertErr);
          }
        }
      } catch (err) {
        console.warn('Error revisando facturas vencidas:', err);
      }
    };

    // Ejecutar inmediatamente y luego cada 5 minutos
    checkOverdue();
    timerRef.current = setInterval(checkOverdue, CHECK_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [user?.id, user?.role]);
}

export default useOverdueInvoiceChecker;
