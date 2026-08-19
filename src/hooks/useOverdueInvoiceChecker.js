import { useEffect, useRef } from 'react';
import { invoices as invoicesApi, alerts as alertsApi } from '../api/client.js';

const STORAGE_KEY = 'overdue_alerted_ids';
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // cada 5 minutos

/**
 * Hook que detecta facturas vencidas en cuentas por cobrar y crea alertas automáticas.
 * Solo activo para roles admin/manager cuando el usuario está autenticado.
 *
 * Una factura se considera vencida si:
 * - Tiene `dueDate` en el pasado
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

        const overdueInvoices = allInvoices.filter(inv => {
          if (!inv.dueDate) return false;
          const due = new Date(inv.dueDate);
          if (due >= now) return false;
          // Excluir estados terminales
          if (['Cancelado', 'Anulado', 'Pagado'].includes(inv.status)) return false;
          // Verificar si tiene saldo pendiente
          const total = parseFloat(inv.total) || 0;
          const paid = parseFloat(inv.amountPaid) || 0;
          if (paid >= total) return false;
          // Ya fue alertada en esta sesión
          if (alertedIds.includes(inv.id)) return false;
          return true;
        });

        // Crear alertas para cada factura vencida nueva
        for (const inv of overdueInvoices) {
          try {
            const daysOverdue = Math.floor((now - new Date(inv.dueDate)) / 86400000);
            const outstanding = (parseFloat(inv.total) - parseFloat(inv.amountPaid)).toFixed(2);
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
            addAlertedId(inv.id);
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
