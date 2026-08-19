import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarClock,
  Building2,
  ChevronDown,
  Cpu,
  CreditCard,
  Clock3,
  Database,
  Eye,
  FileText,
  Filter,
  Globe,
  HardDrive,
  LayoutDashboard,
  Loader2,
  LockKeyhole,
  LogOut,
  Network,
  RefreshCw,
  Receipt,
  Search,
  Server,
  ShieldCheck,
  ShieldX,
  Terminal,
  Timer,
  TrendingUp,
  User,
  Mail,
  Printer,
  Wifi,
  Zap,
} from 'lucide-react';
import { platformBilling } from '../api/client.js';
import Button from '../components/ui/Button.jsx';
import ObservabilityDashboard from '../components/observability/ObservabilityDashboard.jsx';

const STATUS_OPTIONS = ['active', 'trial', 'past_due', 'suspended', 'blocked', 'cancelled'];
const BLOCK_MODE_OPTIONS = ['auto', 'write', 'hard'];

const STATUS_CONFIG = {
  active: { icon: ShieldCheck, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100', darkBg: 'dark:bg-emerald-900/20', darkBorder: 'dark:border-emerald-800/50', darkText: 'dark:text-emerald-400' },
  trial: { icon: Clock3, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100', darkBg: 'dark:bg-blue-900/20', darkBorder: 'dark:border-blue-800/50', darkText: 'dark:text-blue-400' },
  past_due: { icon: CalendarClock, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100', darkBg: 'dark:bg-amber-900/20', darkBorder: 'dark:border-amber-800/50', darkText: 'dark:text-amber-400' },
  suspended: { icon: ShieldX, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100', darkBg: 'dark:bg-orange-900/20', darkBorder: 'dark:border-orange-800/50', darkText: 'dark:text-orange-400' },
  blocked: { icon: LockKeyhole, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100', darkBg: 'dark:bg-red-900/20', darkBorder: 'dark:border-red-800/50', darkText: 'dark:text-red-400' },
  cancelled: { icon: LogOut, color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-100', darkBg: 'dark:bg-gray-900/20', darkBorder: 'dark:border-gray-800/50', darkText: 'dark:text-gray-400' },
};

const STATUS_BADGE = {
  active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  trial: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  past_due: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  suspended: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  blocked: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  cancelled: 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
};

const SESSION_STORAGE_KEY = 'platformBillingSession';
const BILLING_PLANS_STORAGE_KEY = 'platformBillingPlansV1';
const BILLING_ASSIGNMENTS_STORAGE_KEY = 'platformBillingAssignmentsV1';

const DEFAULT_BILLING_PLANS = [
  { id: 'plan-monthly', name: 'Mensual', cycle: 'Mensual', price: 49, graceDays: 7, description: 'Renovación mensual con cobro recurrente.' },
  { id: 'plan-quarterly', name: 'Trimestral', cycle: 'Trimestral', price: 129, graceDays: 10, description: 'Pago cada 90 días con mejor retención.' },
  { id: 'plan-yearly', name: 'Anual', cycle: 'Anual', price: 449, graceDays: 15, description: 'Descuento anual con estabilidad de caja.' },
];

function readStoredJson(storageKey, fallbackValue) {
  if (typeof window === 'undefined') return fallbackValue;

  try {
    const storedValue = localStorage.getItem(storageKey);
    if (!storedValue) return fallbackValue;
    return JSON.parse(storedValue);
  } catch {
    return fallbackValue;
  }
}

function createPlanId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function daysUntil(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const diffMs = date.getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function getBucketLabel(days) {
  if (days === null) return 'Sin vencimiento';
  if (days < 0) return 'Cortado';
  if (days <= 7) return 'Vence en 7 días';
  if (days <= 15) return 'Vence en 15 días';
  if (days <= 30) return 'Vence en 30 días';
  return 'Saludable';
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString();
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function formatMoney(value, currency = 'DOP') {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return '-';
  return new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: currency || 'DOP',
    minimumFractionDigits: 2,
  }).format(amount);
}

function toLocalDateTimeInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60000);
  return localDate.toISOString().slice(0, 16);
}

function getInitials(name) {
  if (!name) return 'EM';
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
}

function openPrintableDocument(title, bodyHtml) {
  const popup = window.open('', '_blank', 'width=900,height=700');
  if (!popup) {
    toast.error('El navegador bloqueó la ventana de impresión');
    return;
  }

  popup.document.write(`
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #111827; margin: 24px; }
          .header { margin-bottom: 18px; }
          .title { font-size: 24px; font-weight: 700; margin: 0; }
          .muted { color: #6b7280; font-size: 12px; }
          .section { border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; margin-bottom: 14px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; }
          .label { color: #6b7280; font-size: 12px; }
          .value { font-weight: 600; font-size: 13px; }
          .total { font-size: 20px; font-weight: 800; color: #059669; }
          .footer { margin-top: 16px; font-size: 11px; color: #6b7280; }
        </style>
      </head>
      <body>
        ${bodyHtml}
      </body>
    </html>
  `);
  popup.document.close();
  popup.focus();
  popup.print();
}

export default function PlatformBillingControlView() {
  const [sessionToken, setSessionToken] = useState(() => sessionStorage.getItem(SESSION_STORAGE_KEY) || '');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [authChecking, setAuthChecking] = useState(false);
  const [tenants, setTenants] = useState([]);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [eventLog, setEventLog] = useState([]);
  const [nextStatus, setNextStatus] = useState('active');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [dueDateInput, setDueDateInput] = useState('');
  const [graceUntilInput, setGraceUntilInput] = useState('');
  const [blockMode, setBlockMode] = useState('auto');
  const [graceDays, setGraceDays] = useState('5');
  const [reminderDaysInput, setReminderDaysInput] = useState('7,3,1');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [summary, setSummary] = useState(null);
  const [selectedModes, setSelectedModes] = useState(['craft']);
  const [modesLoading, setModesLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'config' | 'events'
  const [mainTab, setMainTab] = useState('dashboard'); // 'dashboard' | 'companies' | 'billing'
  const [billingDocuments, setBillingDocuments] = useState({ invoices: [], receipts: [] });
  const [invoicePeriodStart, setInvoicePeriodStart] = useState('');
  const [invoicePeriodEnd, setInvoicePeriodEnd] = useState('');
  const [invoiceDueDate, setInvoiceDueDate] = useState('');
  const [invoiceSubtotal, setInvoiceSubtotal] = useState('');
  const [invoiceTaxRate, setInvoiceTaxRate] = useState('18');
  const [invoiceCurrency, setInvoiceCurrency] = useState('DOP');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('transferencia');
  const [paymentReference, setPaymentReference] = useState('');
  const [plans, setPlans] = useState(() => readStoredJson(BILLING_PLANS_STORAGE_KEY, DEFAULT_BILLING_PLANS));
  const [planAssignments, setPlanAssignments] = useState(() => readStoredJson(BILLING_ASSIGNMENTS_STORAGE_KEY, {}));
  const [planDraftName, setPlanDraftName] = useState('');
  const [planDraftCycle, setPlanDraftCycle] = useState('Mensual');
  const [planDraftPrice, setPlanDraftPrice] = useState('');
  const [planDraftGraceDays, setPlanDraftGraceDays] = useState('7');
  const [planDraftDescription, setPlanDraftDescription] = useState('');
  const hasInitializedFilterAutoRefresh = useRef(false);

  const isAuthenticated = useMemo(() => sessionToken.trim().length > 0, [sessionToken]);
  const planById = useMemo(() => Object.fromEntries((plans || []).map((plan) => [plan.id, plan])), [plans]);

  const dashboardMetrics = useMemo(() => {
    const activeStatuses = new Set(['active', 'trial', 'past_due']);
    const assignedRecurringValues = Object.entries(planAssignments || {}).reduce((total, [companyId, planId]) => {
      const tenant = tenants.find((item) => item.id === companyId);
      const plan = planById[planId];
      if (!tenant || !plan || !activeStatuses.has(tenant.billingStatus)) return total;
      return total + Number(plan.price || 0);
    }, 0);

    const bucketCounts = { overdue: 0, seven: 0, fifteen: 0, thirty: 0, healthy: 0 };
    const expiringTenants = [];

    tenants.forEach((tenant) => {
      const remainingDays = daysUntil(tenant.billingDueDate);
      if (remainingDays === null) return;

      expiringTenants.push({
        id: tenant.id,
        name: tenant.name,
        status: tenant.billingStatus,
        remainingDays,
        dueDate: tenant.billingDueDate,
      });

      if (remainingDays < 0 || tenant.billingStatus === 'blocked' || tenant.billingStatus === 'suspended') {
        bucketCounts.overdue += 1;
      } else if (remainingDays <= 7) {
        bucketCounts.seven += 1;
      } else if (remainingDays <= 15) {
        bucketCounts.fifteen += 1;
      } else if (remainingDays <= 30) {
        bucketCounts.thirty += 1;
      } else {
        bucketCounts.healthy += 1;
      }
    });

    expiringTenants.sort((a, b) => a.remainingDays - b.remainingDays);

    const receiptsCount = (billingDocuments.receipts || []).length;
    const invoicesCount = (billingDocuments.invoices || []).length;
    const collectedAmount = (billingDocuments.receipts || []).reduce((total, receipt) => total + Number(receipt.amount || 0), 0);
    const exposedBalance = (billingDocuments.invoices || []).reduce((total, invoice) => total + Number(invoice.balance || 0), 0);

    return {
      activeCount: tenants.filter((tenant) => activeStatuses.has(tenant.billingStatus)).length,
      blockedCount: tenants.filter((tenant) => tenant.billingStatus === 'blocked').length,
      overdueCount: bucketCounts.overdue,
      expiringCounts: bucketCounts,
      expiringTenants,
      mrr: assignedRecurringValues,
      receiptsCount,
      invoicesCount,
      collectedAmount,
      exposedBalance,
    };
  }, [billingDocuments, planAssignments, planById, tenants]);

  const selectedTenantPlan = useMemo(() => {
    if (!selectedTenant) return null;
    const assignedPlanId = planAssignments[selectedTenant.id];
    return assignedPlanId ? planById[assignedPlanId] || null : null;
  }, [planAssignments, planById, selectedTenant]);

  useEffect(() => {
    if (!sessionToken) return;

    setAuthChecking(true);
    platformBilling.validateSession(sessionToken)
      .then((data) => {
        setOwnerEmail(data?.owner?.email || '');
      })
      .catch(() => {
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
        setSessionToken('');
        setOwnerEmail('');
      })
      .finally(() => setAuthChecking(false));
  }, [sessionToken]);

  useEffect(() => {
    if (!isAuthenticated || authChecking) return;
    loadTenants(undefined, { silent: true });
  }, [isAuthenticated, authChecking]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(BILLING_PLANS_STORAGE_KEY, JSON.stringify(plans));
  }, [plans]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(BILLING_ASSIGNMENTS_STORAGE_KEY, JSON.stringify(planAssignments));
  }, [planAssignments]);

  useEffect(() => {
    if (!isAuthenticated || authChecking) return;

    if (!hasInitializedFilterAutoRefresh.current) {
      hasInitializedFilterAutoRefresh.current = true;
      return;
    }

    const timeoutId = setTimeout(() => {
      loadTenants(undefined, { silent: true, includeSummary: false });
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [search, statusFilter, isAuthenticated, authChecking]);

  async function handleLogin(event) {
    event.preventDefault();
    setLoading(true);
    try {
      const data = await platformBilling.login(loginEmail.trim(), loginPassword);
      sessionStorage.setItem(SESSION_STORAGE_KEY, data.token);
      setSessionToken(data.token);
      setOwnerEmail(data?.owner?.email || loginEmail.trim());
      setLoginPassword('');
      toast.success('Acceso concedido');
      await loadTenants(data.token, { silent: true });
    } catch (error) {
      toast.error(error.message || 'No se pudo iniciar sesión');
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    setSessionToken('');
    setOwnerEmail('');
    setTenants([]);
    setSummary(null);
    setSelectedTenant(null);
    setEventLog([]);
    toast.success('Sesión cerrada');
  }

  async function loadTenants(tokenOverride, options = {}) {
    const { silent = false, includeSummary = true } = options;
    const token = tokenOverride || sessionToken;
    if (!token) {
      toast.error('Debes iniciar sesión para acceder al panel');
      return;
    }

    setLoading(true);
    try {
      const response = await platformBilling.listTenants(token, {
        search: search.trim() || undefined,
        status: statusFilter || undefined,
      });
      setTenants(response.data || []);

      if (includeSummary) {
        const summaryResponse = await platformBilling.getSummary(token);
        setSummary(summaryResponse);
      }

      if (!silent) {
        toast.success('Empresas cargadas');
      }
    } catch (error) {
      toast.error(error.message || 'No se pudo cargar el panel');
    } finally {
      setLoading(false);
    }
  }

  async function loadEvents(companyId) {
    if (!companyId || !sessionToken) return;

    setLoading(true);
    try {
      const response = await platformBilling.getEvents(sessionToken, companyId);
      setEventLog(response.data || []);
    } catch (error) {
      toast.error(error.message || 'No se pudieron cargar eventos');
    } finally {
      setLoading(false);
    }
  }

  async function loadDocuments(companyId) {
    if (!companyId || !sessionToken) return;

    setLoading(true);
    try {
      const response = await platformBilling.getDocuments(sessionToken, companyId);
      const documents = response?.data || { invoices: [], receipts: [] };
      setBillingDocuments(documents);
    } catch (error) {
      toast.error(error.message || 'No se pudieron cargar facturas y recibos');
    } finally {
      setLoading(false);
    }
  }

  async function issueInvoice() {
    if (!selectedTenant || !sessionToken) return;

    const subtotal = Number(invoiceSubtotal);
    const taxRate = Number(invoiceTaxRate || 0);
    if (!invoicePeriodStart || !invoicePeriodEnd || !invoiceDueDate) {
      toast.error('Completa periodo y fecha de vencimiento');
      return;
    }
    if (!Number.isFinite(subtotal) || subtotal < 0) {
      toast.error('Subtotal inválido');
      return;
    }
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
      toast.error('ITBIS inválido');
      return;
    }

    setLoading(true);
    try {
      await platformBilling.issueInvoice(sessionToken, selectedTenant.id, {
        periodStart: new Date(invoicePeriodStart).toISOString(),
        periodEnd: new Date(invoicePeriodEnd).toISOString(),
        dueDate: new Date(invoiceDueDate).toISOString(),
        subtotal,
        taxRate,
        currency: (invoiceCurrency || 'DOP').toUpperCase(),
        notes: notes || null,
        actor: `owner:${ownerEmail || 'unknown'}`,
      });

      toast.success('Factura emitida');
      await Promise.all([
        loadDocuments(selectedTenant.id),
        loadEvents(selectedTenant.id),
      ]);
      setInvoiceSubtotal('');
      setInvoiceTaxRate('18');
    } catch (error) {
      toast.error(error.message || 'No se pudo emitir la factura');
    } finally {
      setLoading(false);
    }
  }

  async function changeStatus() {
    if (!selectedTenant || !sessionToken) return;

    setLoading(true);
    try {
      const result = await platformBilling.updateTenantStatus(sessionToken, selectedTenant.id, {
        status: nextStatus,
        reason: reason || null,
        notes: notes || null,
        dueDate: dueDateInput ? new Date(dueDateInput).toISOString() : null,
        graceUntil: graceUntilInput ? new Date(graceUntilInput).toISOString() : null,
        billingPolicy: {
          blockMode,
          graceDays: Number(graceDays || 0),
          reminderDays: reminderDaysInput
            .split(',')
            .map((value) => Number(value.trim()))
            .filter((value) => Number.isFinite(value) && value >= 0),
        },
        actor: `owner:${ownerEmail || 'unknown'}`,
      });

      if (result?.company) {
        setSelectedTenant((prev) => (prev ? { ...prev, ...result.company } : prev));
      }

      toast.success('Estado actualizado');
      await loadTenants();
      await loadEvents(selectedTenant.id);
    } catch (error) {
      toast.error(error.message || 'No se pudo actualizar el estado');
    } finally {
      setLoading(false);
    }
  }

  async function saveOrderModes() {
    if (!selectedTenant || !sessionToken) return;

    setModesLoading(true);
    try {
      const result = await platformBilling.updateOrderModes(sessionToken, selectedTenant.id, selectedModes);
      if (result?.company) {
        setSelectedTenant(prev => ({ 
          ...prev, 
          orderMode: result.company.orderMode,
          availableOrderModes: result.company.availableOrderModes 
        }));
      }
      toast.success('Modos de pedido guardados');
      await loadTenants();
    } catch (error) {
      toast.error(error.message || 'No se pudieron guardar los modos');
    } finally {
      setModesLoading(false);
    }
  }

  async function registerPayment() {
    if (!selectedTenant || !sessionToken) return;

    const parsed = Number(paymentAmount);
    if (!paymentAmount || Number.isNaN(parsed) || parsed <= 0) {
      toast.error('Monto inválido');
      return;
    }

    setLoading(true);
    try {
      await platformBilling.registerPayment(sessionToken, selectedTenant.id, {
        amount: parsed,
        invoiceEventId: selectedInvoiceId || null,
        paymentMethod,
        reference: paymentReference || null,
        notes: notes || null,
        actor: `owner:${ownerEmail || 'unknown'}`,
      });

      toast.success('Pago registrado y empresa reactivada');
      await loadTenants();
      await Promise.all([
        loadEvents(selectedTenant.id),
        loadDocuments(selectedTenant.id),
      ]);
      setPaymentAmount('');
      setPaymentReference('');
    } catch (error) {
      toast.error(error.message || 'No se pudo registrar el pago');
    } finally {
      setLoading(false);
    }
  }

  function addPlan() {
    const price = Number(planDraftPrice);
    const graceDaysValue = Number(planDraftGraceDays);

    if (!planDraftName.trim()) {
      toast.error('Escribe un nombre de plan');
      return;
    }

    if (!Number.isFinite(price) || price < 0) {
      toast.error('Precio inválido');
      return;
    }

    const nextPlan = {
      id: createPlanId(),
      name: planDraftName.trim(),
      cycle: planDraftCycle,
      price,
      graceDays: Number.isFinite(graceDaysValue) ? graceDaysValue : 7,
      description: planDraftDescription.trim(),
    };

    setPlans((currentPlans) => [nextPlan, ...currentPlans]);
    setPlanDraftName('');
    setPlanDraftPrice('');
    setPlanDraftDescription('');
    setPlanDraftGraceDays('7');
    setPlanDraftCycle('Mensual');
    toast.success('Plan creado');
  }

  function removePlan(planId) {
    setPlans((currentPlans) => currentPlans.filter((plan) => plan.id !== planId));
    setPlanAssignments((currentAssignments) => {
      const nextAssignments = { ...currentAssignments };
      Object.keys(nextAssignments).forEach((companyId) => {
        if (nextAssignments[companyId] === planId) {
          delete nextAssignments[companyId];
        }
      });
      return nextAssignments;
    });
    toast.success('Plan eliminado');
  }

  function assignPlanToSelectedTenant(planId) {
    if (!selectedTenant) {
      toast.error('Selecciona una empresa primero');
      return;
    }

    setPlanAssignments((currentAssignments) => ({
      ...currentAssignments,
      [selectedTenant.id]: planId,
    }));
    toast.success('Plan asignado');
  }

  function printInvoiceDocument(invoice) {
    if (!selectedTenant || !invoice) return;
    const html = `
      <div class="header">
        <h1 class="title">Factura de Suscripción</h1>
        <p class="muted">${selectedTenant.name} | ${selectedTenant.email || 'Sin email'}</p>
      </div>

      <div class="section grid">
        <div>
          <div class="label">Número</div>
          <div class="value">${invoice.invoiceNumber}</div>
        </div>
        <div>
          <div class="label">Estado</div>
          <div class="value">${invoice.status}</div>
        </div>
        <div>
          <div class="label">Periodo</div>
          <div class="value">${formatDateTime(invoice.periodStart)} - ${formatDateTime(invoice.periodEnd)}</div>
        </div>
        <div>
          <div class="label">Vencimiento</div>
          <div class="value">${formatDateTime(invoice.dueDate)}</div>
        </div>
      </div>

      <div class="section grid">
        <div>
          <div class="label">Subtotal</div>
          <div class="value">${formatMoney(invoice.subtotal, invoice.currency)}</div>
        </div>
        <div>
          <div class="label">ITBIS</div>
          <div class="value">${Number(invoice.taxRate || 0).toFixed(2)}%</div>
        </div>
        <div>
          <div class="label">Pagado</div>
          <div class="value">${formatMoney(invoice.paidAmount, invoice.currency)}</div>
        </div>
        <div>
          <div class="label">Pendiente</div>
          <div class="value">${formatMoney(invoice.balance, invoice.currency)}</div>
        </div>
      </div>

      <div class="section">
        <div class="label">Total facturado</div>
        <div class="total">${formatMoney(invoice.totalAmount, invoice.currency)}</div>
      </div>

      <div class="footer">Emitido desde Zenda ERP Platform Billing el ${new Date().toLocaleString()}</div>
    `;

    openPrintableDocument(`Factura ${invoice.invoiceNumber}`, html);
  }

  function printReceiptDocument(receiptItem) {
    if (!selectedTenant || !receiptItem) return;
    const html = `
      <div class="header">
        <h1 class="title">Recibo de Pago</h1>
        <p class="muted">${selectedTenant.name} | ${selectedTenant.email || 'Sin email'}</p>
      </div>

      <div class="section grid">
        <div>
          <div class="label">Recibo</div>
          <div class="value">${receiptItem.receiptNumber}</div>
        </div>
        <div>
          <div class="label">Fecha de pago</div>
          <div class="value">${formatDateTime(receiptItem.paidAt)}</div>
        </div>
        <div>
          <div class="label">Método</div>
          <div class="value">${receiptItem.paymentMethod || '-'}</div>
        </div>
        <div>
          <div class="label">Referencia</div>
          <div class="value">${receiptItem.reference || '-'}</div>
        </div>
        <div>
          <div class="label">Factura asociada</div>
          <div class="value">${receiptItem.invoiceNumber || 'No asociada'}</div>
        </div>
      </div>

      <div class="section">
        <div class="label">Monto recibido</div>
        <div class="total">${formatMoney(receiptItem.amount, selectedTenant?.currency || 'DOP')}</div>
      </div>

      <div class="footer">Comprobante generado desde Zenda ERP Platform Billing el ${new Date().toLocaleString()}</div>
    `;

    openPrintableDocument(`Recibo ${receiptItem.receiptNumber}`, html);
  }

  async function sendInvoiceByEmail(invoice) {
    if (!selectedTenant || !invoice) return;
    const clientEmail = selectedTenant.email;
    if (!clientEmail) {
      toast.error('El tenant seleccionado no tiene un correo registrado.');
      return;
    }

    const html = `
      <div class="header" style="font-family: Arial, sans-serif; color: #111827; margin: 24px;">
        <h1 class="title" style="font-size: 24px; font-weight: 700; margin: 0;">Factura de Suscripción</h1>
        <p class="muted" style="color: #6b7280; font-size: 12px;">${selectedTenant.name} | ${selectedTenant.email || 'Sin email'}</p>
      </div>

      <div class="section grid" style="border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; margin-bottom: 14px; font-family: Arial, sans-serif; color: #111827;">
        <div style="margin-bottom: 8px;">
          <div class="label" style="color: #6b7280; font-size: 12px;">Número de Factura</div>
          <div class="value" style="font-weight: 600; font-size: 13px;">${invoice.invoiceNumber}</div>
        </div>
        <div style="margin-bottom: 8px;">
          <div class="label" style="color: #6b7280; font-size: 12px;">Estado</div>
          <div class="value" style="font-weight: 600; font-size: 13px; text-transform: uppercase;">${invoice.status}</div>
        </div>
        <div style="margin-bottom: 8px;">
          <div class="label" style="color: #6b7280; font-size: 12px;">Periodo de Suscripción</div>
          <div class="value" style="font-weight: 600; font-size: 13px;">${formatDateTime(invoice.periodStart)} - ${formatDateTime(invoice.periodEnd)}</div>
        </div>
        <div style="margin-bottom: 8px;">
          <div class="label" style="color: #6b7280; font-size: 12px;">Vencimiento</div>
          <div class="value" style="font-weight: 600; font-size: 13px;">${formatDateTime(invoice.dueDate)}</div>
        </div>
      </div>

      <div class="section grid" style="border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; margin-bottom: 14px; font-family: Arial, sans-serif; color: #111827;">
        <div style="margin-bottom: 8px;">
          <div class="label" style="color: #6b7280; font-size: 12px;">Subtotal</div>
          <div class="value" style="font-weight: 600; font-size: 13px;">${formatMoney(invoice.subtotal, invoice.currency)}</div>
        </div>
        <div style="margin-bottom: 8px;">
          <div class="label" style="color: #6b7280; font-size: 12px;">Impuesto (ITBIS)</div>
          <div class="value" style="font-weight: 600; font-size: 13px;">${Number(invoice.taxRate || 0).toFixed(2)}%</div>
        </div>
        <div style="margin-bottom: 8px;">
          <div class="label" style="color: #6b7280; font-size: 12px;">Pagado</div>
          <div class="value" style="font-weight: 600; font-size: 13px;">${formatMoney(invoice.paidAmount, invoice.currency)}</div>
        </div>
        <div style="margin-bottom: 8px;">
          <div class="label" style="color: #6b7280; font-size: 12px;">Pendiente</div>
          <div class="value" style="font-weight: 600; font-size: 13px; color: #dc2626;">${formatMoney(invoice.balance, invoice.currency)}</div>
        </div>
      </div>

      <div class="section" style="border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; margin-bottom: 14px; font-family: Arial, sans-serif; color: #111827;">
        <div class="label" style="color: #6b7280; font-size: 12px;">Total facturado</div>
        <div class="total" style="font-size: 20px; font-weight: 800; color: #059669;">${formatMoney(invoice.totalAmount, invoice.currency)}</div>
      </div>

      <div class="footer" style="margin-top: 16px; font-size: 11px; color: #6b7280; font-family: Arial, sans-serif;">
        Este es un comprobante de facturación emitido de forma automática por la plataforma Zenda ERP.
      </div>
    `;

    const payload = {
      to: clientEmail,
      subject: `Factura de Suscripción Zenda ERP - ${invoice.invoiceNumber}`,
      html,
    };

    const promise = platformBilling.sendEmail(sessionToken, payload);
    await toast.promise(promise, {
      loading: 'Enviando factura por correo...',
      success: '¡Factura enviada exitosamente por correo!',
      error: 'Error al enviar la factura por correo.',
    });
  }

  async function sendReceiptByEmail(receiptItem) {
    if (!selectedTenant || !receiptItem) return;
    const clientEmail = selectedTenant.email;
    if (!clientEmail) {
      toast.error('El tenant seleccionado no tiene un correo registrado.');
      return;
    }

    const html = `
      <div class="header" style="font-family: Arial, sans-serif; color: #111827; margin: 24px;">
        <h1 class="title" style="font-size: 24px; font-weight: 700; margin: 0;">Recibo de Pago</h1>
        <p class="muted" style="color: #6b7280; font-size: 12px;">${selectedTenant.name} | ${selectedTenant.email || 'Sin email'}</p>
      </div>

      <div class="section grid" style="border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; margin-bottom: 14px; font-family: Arial, sans-serif; color: #111827;">
        <div style="margin-bottom: 8px;">
          <div class="label" style="color: #6b7280; font-size: 12px;">Número de Recibo</div>
          <div class="value" style="font-weight: 600; font-size: 13px;">${receiptItem.receiptNumber}</div>
        </div>
        <div style="margin-bottom: 8px;">
          <div class="label" style="color: #6b7280; font-size: 12px;">Fecha de Pago</div>
          <div class="value" style="font-weight: 600; font-size: 13px;">${formatDateTime(receiptItem.paidAt)}</div>
        </div>
        <div style="margin-bottom: 8px;">
          <div class="label" style="color: #6b7280; font-size: 12px;">Método de Pago</div>
          <div class="value" style="font-weight: 600; font-size: 13px; text-transform: capitalize;">${receiptItem.paymentMethod || '-'}</div>
        </div>
        <div style="margin-bottom: 8px;">
          <div class="label" style="color: #6b7280; font-size: 12px;">Referencia</div>
          <div class="value" style="font-weight: 600; font-size: 13px;">${receiptItem.reference || '-'}</div>
        </div>
        <div style="margin-bottom: 8px;">
          <div class="label" style="color: #6b7280; font-size: 12px;">Factura Asociada</div>
          <div class="value" style="font-weight: 600; font-size: 13px;">${receiptItem.invoiceNumber || 'No asociada'}</div>
        </div>
      </div>

      <div class="section" style="border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; margin-bottom: 14px; font-family: Arial, sans-serif; color: #111827;">
        <div class="label" style="color: #6b7280; font-size: 12px;">Monto recibido</div>
        <div class="total" style="font-size: 20px; font-weight: 800; color: #059669;">${formatMoney(receiptItem.amount, selectedTenant?.currency || 'DOP')}</div>
      </div>

      <div class="footer" style="margin-top: 16px; font-size: 11px; color: #6b7280; font-family: Arial, sans-serif;">
        Este es un comprobante de pago emitido de forma automática por la plataforma Zenda ERP.
      </div>
    `;

    const payload = {
      to: clientEmail,
      subject: `Recibo de Pago Zenda ERP - ${receiptItem.receiptNumber}`,
      html,
    };

    const promise = platformBilling.sendEmail(sessionToken, payload);
    await toast.promise(promise, {
      loading: 'Enviando recibo por correo...',
      success: '¡Recibo enviado exitosamente por correo!',
      error: 'Error al enviar el recibo por correo.',
    });
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-xl mx-auto mt-8 card p-6">
        <Toaster position="top-center" />
        <div className="flex items-center gap-3 mb-5">
          <div className="h-11 w-11 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
            <LockKeyhole className="text-indigo-600 dark:text-indigo-300" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Acceso Propietario</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Solo la cuenta propietaria del código puede acceder al panel administrativo.</p>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Correo propietario</label>
            <input
              type="email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              className="input-base"
              placeholder="owner@empresa.com"
              required
              autoComplete="username"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contraseña</label>
            <input
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              className="input-base"
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>

          <Button type="submit" className="w-full gap-2" disabled={loading || authChecking}>
            {loading ? <Loader2 className="animate-spin" size={16} /> : <ShieldCheck size={16} />}
            Ingresar al panel
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Toaster position="top-center" />

      <div className="rounded-[2.5rem] bg-gradient-to-br from-indigo-600 via-indigo-700 to-blue-900 text-white p-8 md:p-10 shadow-2xl relative overflow-hidden group">
        <div className="absolute -right-16 -top-16 opacity-10 group-hover:scale-110 transition-transform duration-1000">
          <ShieldCheck size={280} />
        </div>
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>
        
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
          <div className="flex-1 space-y-4">
             <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs font-bold uppercase tracking-widest">
               <ShieldCheck size={14} className="text-emerald-400" />
               Security Enforcement Active
             </div>
            <h1 className="text-3xl md:text-5xl font-black tracking-tight leading-tight">
              Control Center <br/>
              <span className="text-indigo-200">Platform Billing</span>
            </h1>
            <p className="text-lg text-indigo-100/80 max-w-2xl font-medium leading-relaxed">
              Gestión centralizada de facturación multi-tenant. Monitorea estados, aplica bloqueos preventivos y administra ciclos de vida de empresas Zenda ERP.
            </p>
          </div>
          
          <div className="flex flex-col items-end gap-4">
            <div className="p-1 pr-4 bg-black/20 backdrop-blur-xl rounded-2xl flex items-center gap-3 border border-white/10 shadow-inner">
               <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-white/20 to-white/5 flex items-center justify-center border border-white/20">
                  <User size={24} className="text-white" />
               </div>
               <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">Administrator</span>
                  <span className="text-sm font-bold text-white">{ownerEmail || 'Admin Account'}</span>
               </div>
            </div>
            <Button 
              onClick={handleLogout} 
              variant="ghost" 
              className="!text-white hover:bg-white/10 rounded-xl px-6 py-2 border border-white/10 backdrop-blur-sm self-stretch lg:self-auto"
            >
              <LogOut size={18} className="mr-2" />
              Cerrar Sesión
            </Button>
          </div>
        </div>
      </div>

      {summary && (
        <section className="card p-4 md:p-5 bg-white/70 dark:bg-gray-900/60 backdrop-blur-sm shadow-sm border-gray-100 dark:border-gray-800">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <CalendarClock className="text-indigo-600 dark:text-indigo-400" size={20} />
                Vista general de la plataforma
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Actualizado: {formatDateTime(summary.timestamp)}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {(summary.counters || []).map((item) => (
                <span key={item.status} className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${STATUS_BADGE[item.status] || STATUS_BADGE.cancelled}`}>
                  <span className="w-2 h-2 rounded-full bg-current opacity-70"></span>
                  {item.status}: {item.count}
                </span>
              ))}
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-black bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300">
                { (summary.dueSoon || []).length } vencimientos cercanos
              </span>
            </div>
          </div>
        </section>
      )}

      <section className="card p-2 bg-white/80 dark:bg-gray-900/70 border border-gray-100 dark:border-gray-800">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { id: 'dashboard', label: 'DASHBOARD', icon: LayoutDashboard },
            { id: 'companies', label: 'Empresas', icon: Building2 },
            { id: 'billing', label: 'Facturación', icon: CreditCard },
            { id: 'observability', label: 'Observabilidad', icon: Activity },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setMainTab(item.id)}
              className={`h-12 rounded-xl border text-sm font-black uppercase tracking-[0.15em] transition-all flex items-center justify-center gap-2 ${
                mainTab === item.id
                  ? 'border-indigo-600 bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-indigo-300'
              }`}
            >
              <item.icon size={16} />
              {item.label}
            </button>
          ))}
        </div>
      </section>

      {mainTab === 'observability' && (
        <ObservabilityDashboard sessionToken={sessionToken} />
      )}

      {mainTab === 'dashboard' && (
        <section className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-stretch">
          <div className="card p-5 border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm h-full min-h-[520px] flex flex-col">
            <div className="flex items-start justify-between gap-3 mb-5">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">Pulso financiero</p>
                <h3 className="mt-2 text-lg font-bold text-gray-900 dark:text-white">Suscripciones y cobros</h3>
              </div>
              <div className="h-11 w-11 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-300">
                <CalendarClock size={22} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 flex-1 content-start">
              <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/40 p-3 min-h-[108px] flex flex-col justify-between">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">MRR observado</p>
                <p className="text-2xl font-black text-gray-900 dark:text-white">{formatMoney(dashboardMetrics.mrr)}</p>
              </div>
              <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/40 p-3 min-h-[108px] flex flex-col justify-between">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">Cobros</p>
                <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{formatMoney(dashboardMetrics.collectedAmount)}</p>
              </div>
              <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/40 p-3 min-h-[108px] flex flex-col justify-between">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">Pendiente</p>
                <p className="text-2xl font-black text-red-600 dark:text-red-400">{formatMoney(dashboardMetrics.exposedBalance)}</p>
              </div>
              <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/40 p-3 min-h-[108px] flex flex-col justify-between">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">Activos</p>
                <p className="text-2xl font-black text-gray-900 dark:text-white">{dashboardMetrics.activeCount}</p>
              </div>
            </div>
          </div>

          <div className="card p-5 border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm h-full min-h-[520px] flex flex-col">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">Semáforo de alertas</p>
                <h3 className="mt-2 text-lg font-bold text-gray-900 dark:text-white">Control de vencimientos</h3>
              </div>
              <div className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300">
                {dashboardMetrics.overdueCount} críticos
              </div>
            </div>
            <div className="space-y-2 flex-1">
              {[
                { label: 'Vence en 7 días', value: dashboardMetrics.expiringCounts.seven, tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300' },
                { label: 'Vence en 15 días', value: dashboardMetrics.expiringCounts.fifteen, tone: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300' },
                { label: 'Vence en 30 días', value: dashboardMetrics.expiringCounts.thirty, tone: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300' },
                { label: 'Cortados / en riesgo', value: dashboardMetrics.expiringCounts.overdue, tone: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300' },
              ].map((bucket) => (
                <div key={bucket.label} className={`flex items-center justify-between rounded-2xl px-4 py-3 ${bucket.tone} min-h-[64px]`}>
                  <span className="text-sm font-semibold">{bucket.label}</span>
                  <span className="text-lg font-black">{bucket.value}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 space-y-2">
              <h4 className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">Próximos vencimientos</h4>
              <div className="space-y-2 max-h-[170px] overflow-y-auto pr-1">
                {(dashboardMetrics.expiringTenants || []).slice(0, 6).map((tenant) => (
                  <div key={tenant.id} className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 dark:border-gray-800 px-3 py-2.5 bg-gray-50 dark:bg-gray-950/30">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{tenant.name}</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">{getBucketLabel(tenant.remainingDays)}</p>
                    </div>
                    <span className={`text-[10px] font-black uppercase tracking-[0.2em] px-2 py-1 rounded-full ${tenant.remainingDays < 0 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' : tenant.remainingDays <= 7 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : tenant.remainingDays <= 15 ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                      {tenant.remainingDays < 0 ? 'Cortado' : `${tenant.remainingDays}d`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card p-5 border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm h-full min-h-[520px] flex flex-col">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">Planes flexibles</p>
                <h3 className="mt-2 text-lg font-bold text-gray-900 dark:text-white">Catálogo de suscripciones</h3>
              </div>
            </div>
            <div className="space-y-3 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 p-4 bg-gray-50/70 dark:bg-gray-950/30 flex-1 flex flex-col">
              <div className="grid grid-cols-2 gap-3">
                <input value={planDraftName} onChange={(e) => setPlanDraftName(e.target.value)} className="input-base text-sm" placeholder="Nombre del plan" />
                <select value={planDraftCycle} onChange={(e) => setPlanDraftCycle(e.target.value)} className="input-base text-sm">
                  <option>Mensual</option>
                  <option>Trimestral</option>
                  <option>Anual</option>
                </select>
                <input value={planDraftPrice} onChange={(e) => setPlanDraftPrice(e.target.value)} type="number" className="input-base text-sm" placeholder="Precio" />
                <input value={planDraftGraceDays} onChange={(e) => setPlanDraftGraceDays(e.target.value)} type="number" className="input-base text-sm" placeholder="Días de gracia" />
              </div>
              <textarea value={planDraftDescription} onChange={(e) => setPlanDraftDescription(e.target.value)} rows={3} className="input-base text-sm" placeholder="Reglas o notas del plan" />
              <Button type="button" onClick={addPlan} className="w-full h-11">Crear plan rápido</Button>
              <div className="space-y-3 overflow-y-auto pr-1 mt-2 flex-1">
                {(plans || []).map((plan) => (
                  <div key={plan.id} className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-gray-900 dark:text-white">{plan.name}</p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">{plan.cycle} · {plan.graceDays} días de gracia</p>
                      </div>
                      <span className="text-sm font-black text-indigo-600 dark:text-indigo-300">{formatMoney(plan.price)}</span>
                    </div>
                    {plan.description && <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">{plan.description}</p>}
                    <div className="flex items-center gap-2">
                      <Button type="button" size="sm" variant="ghost" onClick={() => assignPlanToSelectedTenant(plan.id)} className="flex-1">Asignar</Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => removePlan(plan.id)} className="text-red-600 dark:text-red-300">Eliminar</Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {mainTab === 'companies' && (
        <section className="grid grid-cols-1 xl:grid-cols-[0.72fr_1.38fr] gap-6 items-stretch">
          <div className="card overflow-hidden h-full min-h-[760px] flex flex-col">
            <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex flex-col gap-3 flex-none">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Empresas</h3>
                <span className="text-sm text-gray-500 dark:text-gray-400">{tenants.length} resultado(s)</span>
              </div>

              <div className="space-y-3">
                <div className="relative min-w-0 group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-500 transition-colors" size={18} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Nombre, email o RNC..."
                    className="w-full h-10 pl-10 pr-4 rounded-xl border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all font-medium"
                  />
                </div>

                <div className="flex gap-2 items-center">
                  <div className="relative flex-1">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="w-full h-10 pl-9 pr-10 rounded-xl border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-bold appearance-none cursor-pointer focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
                    >
                      <option value="">Todos los estados</option>
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                  </div>

                  <button
                    type="button"
                    onClick={() => loadTenants(undefined, { silent: true, includeSummary: false })}
                    disabled={loading}
                    className="h-10 w-10 rounded-xl border border-indigo-300 dark:border-indigo-700 bg-indigo-100 dark:bg-indigo-900 shadow-sm hover:shadow-md transition-all active:scale-95 flex items-center justify-center hover:bg-indigo-200 dark:hover:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Actualizar listado"
                  >
                    {loading ? <Loader2 className="animate-spin text-indigo-700 dark:text-indigo-200" size={20} /> : <RefreshCw className="text-indigo-700 dark:text-indigo-200" size={20} />}
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/70 border-b border-gray-200 dark:border-gray-700">
                    <th className="p-3 text-sm font-semibold">Empresa</th>
                    <th className="p-3 text-sm font-semibold">Estado</th>
                    <th className="p-3 text-sm font-semibold">Vence</th>
                    <th className="p-3 text-sm font-semibold">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((tenant) => (
                    <tr key={tenant.id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/70 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          {tenant.logoUrl ? (
                            <img src={tenant.logoUrl} alt={tenant.name} className="w-9 h-9 rounded-xl object-cover border border-gray-200 dark:border-gray-700" />
                          ) : (
                            <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 flex items-center justify-center text-indigo-700 dark:text-indigo-300 text-[10px] font-bold">
                              {getInitials(tenant.name)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 dark:text-gray-100 truncate text-sm">{tenant.name}</p>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{tenant.email || 'sin email'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex text-[11px] px-2 py-1 rounded-full font-medium ${STATUS_BADGE[tenant.billingStatus] || STATUS_BADGE.cancelled}`}>
                          {tenant.billingStatus}
                        </span>
                      </td>
                      <td className="p-3 text-sm text-gray-700 dark:text-gray-300">{formatDate(tenant.billingDueDate)}</td>
                      <td className="p-4">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setSelectedTenant(tenant);
                            setNextStatus(tenant.billingStatus || 'active');
                            setReason(tenant.billingBlockedReason || '');
                            setDueDateInput(toLocalDateTimeInput(tenant.billingDueDate));
                            setGraceUntilInput(toLocalDateTimeInput(tenant.billingGraceUntil));
                            setBlockMode(tenant.billingPolicy?.blockMode || 'auto');
                            setGraceDays(String(tenant.billingPolicy?.graceDays ?? 5));
                            setReminderDaysInput((tenant.billingPolicy?.reminderDays || [7, 3, 1]).join(','));
                            setSelectedModes(tenant.availableOrderModes || ['craft']);
                            setNotes('');
                            setActiveTab('profile');
                            loadEvents(tenant.id);
                            loadDocuments(tenant.id);
                          }}
                          className="gap-2"
                        >
                          <ShieldCheck size={14} />
                          Gestionar
                        </Button>
                      </td>
                    </tr>
                  ))}

                  {!tenants.length && (
                    <tr>
                      <td className="p-6 text-center text-gray-500 dark:text-gray-400" colSpan={4}>
                        Sin resultados. Carga o filtra empresas.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card shadow-md flex flex-col h-[760px]">
            <div className="p-5 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Gestión de Empresa</h3>
            </div>

            {selectedTenant ? (
              <>
                <div className="p-5 bg-gray-50/50 dark:bg-gray-800/30 border-b border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-4">
                    {selectedTenant.logoUrl ? (
                      <img src={selectedTenant.logoUrl} alt={selectedTenant.name} className="w-14 h-14 rounded-2xl object-cover border-2 border-white dark:border-gray-700 shadow-sm" />
                    ) : (
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xl font-black shadow-lg shadow-indigo-500/20">
                        {getInitials(selectedTenant.name)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900 dark:text-white truncate text-lg">{selectedTenant.name}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tighter ${STATUS_BADGE[selectedTenant.billingStatus] || STATUS_BADGE.cancelled}`}>
                          {selectedTenant.billingStatus}
                        </span>
                        <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Vence: {formatDate(selectedTenant.billingDueDate)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-indigo-100 dark:border-indigo-900/40 bg-white dark:bg-gray-900 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">Plan actual</p>
                        <p className="mt-1 text-sm font-bold text-gray-900 dark:text-white">{selectedTenantPlan ? selectedTenantPlan.name : 'Sin asignar'}</p>
                      </div>
                      {selectedTenantPlan && <span className="text-xs font-black text-indigo-600 dark:text-indigo-300">{formatMoney(selectedTenantPlan.price)}</span>}
                    </div>

                    <select
                      value={planAssignments[selectedTenant.id] || ''}
                      onChange={(event) => {
                        const nextPlanId = event.target.value;
                        setPlanAssignments((currentAssignments) => ({ ...currentAssignments, [selectedTenant.id]: nextPlanId }));
                      }}
                      className="input-base bg-gray-50 dark:bg-gray-800 text-sm"
                    >
                      <option value="">Asignar un plan</option>
                      {(plans || []).map((plan) => (
                        <option key={plan.id} value={plan.id}>{plan.name} · {plan.cycle} · {formatMoney(plan.price)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex border-b border-gray-100 dark:border-gray-800 px-2 bg-white dark:bg-gray-900">
                  {[
                    { id: 'profile', label: 'Perfil', icon: ShieldCheck },
                    { id: 'config', label: 'Ajustes', icon: Filter },
                    { id: 'events', label: 'Log', icon: Clock3 },
                  ].map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold transition-all border-b-2 ${
                        activeTab === item.id
                          ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                          : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                      }`}
                    >
                      <item.icon size={16} />
                      {item.label}
                    </button>
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
                  {activeTab === 'profile' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                      <div className="bg-indigo-50/30 dark:bg-indigo-900/10 p-4 rounded-2xl border border-indigo-100/50 dark:border-indigo-900/30 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.15em] pl-1">Nuevo estado</label>
                            <select value={nextStatus} onChange={e => setNextStatus(e.target.value)} className="input-base bg-white dark:bg-gray-800 border-indigo-100 dark:border-indigo-900 focus:ring-indigo-500 transition-all font-bold">
                              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.15em] pl-1">Razón de cambio</label>
                            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Ej: Pago vencido" className="input-base bg-white dark:bg-gray-800" />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.15em] pl-1">Vencimiento</label>
                            <input type="datetime-local" value={dueDateInput} onChange={e => setDueDateInput(e.target.value)} className="input-base bg-white dark:bg-gray-800 text-xs font-medium" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.15em] pl-1 flex items-center justify-between">
                              Gracia
                              <button onClick={() => setGraceUntilInput('')} className="text-indigo-600 dark:text-indigo-400 lowercase font-bold text-[9px] hover:underline px-1">Limpiar</button>
                            </label>
                            <input type="datetime-local" value={graceUntilInput} onChange={e => setGraceUntilInput(e.target.value)} className="input-base bg-white dark:bg-gray-800 text-xs font-medium" />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] pl-1">Modo Enforcement</label>
                        <div className="grid grid-cols-3 gap-2">
                          {BLOCK_MODE_OPTIONS.map(m => (
                            <button key={m} onClick={() => setBlockMode(m)} className={`py-2.5 text-[10px] font-black uppercase tracking-wider rounded-xl border transition-all ${blockMode === m ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-indigo-900/40 translate-y-[-1px]' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-indigo-300'}`}>
                              {m}
                            </button>
                          ))}
                        </div>
                      </div>

                      <Button onClick={changeStatus} disabled={loading} className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 py-4 shadow-xl shadow-indigo-500/20 active:scale-[0.98] transition-all rounded-2xl">
                        {loading ? <Loader2 className="animate-spin" size={20} /> : <ShieldCheck size={20} />}
                        Actualizar Perfil de Facturación
                      </Button>
                    </div>
                  )}

                  {activeTab === 'config' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-2">
                      <div className="space-y-4">
                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Políticas de Gracia</h4>
                        <div className="grid grid-cols-1 gap-4 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-800">
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-700 dark:text-gray-300">Días de gracia automáticos</label>
                            <input type="number" value={graceDays} onChange={e => setGraceDays(e.target.value)} className="input-base font-bold" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-700 dark:text-gray-300">Alertas de vencimiento (días antes)</label>
                            <input value={reminderDaysInput} onChange={e => setReminderDaysInput(e.target.value)} placeholder="Ej: 7, 3, 1" className="input-base" />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Módulos Habilitados</h4>
                        <div className="space-y-3">
                          {[
                            { id: 'craft', label: '🏪 Tienda Craft (Ventas Minoristas)' },
                            { id: 'distributor', label: '📦 Distribuidor (Ventas Mayoristas)' }
                          ].map(m => (
                            <label key={m.id} className={`flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer ${selectedModes.includes(m.id) ? 'bg-indigo-50/50 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-800' : 'bg-white border-gray-100 dark:bg-gray-900 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700'}`}>
                              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{m.label}</span>
                              <input type="checkbox" checked={selectedModes.includes(m.id)} onChange={(e) => {
                                if (e.target.checked) setSelectedModes(p => [...p, m.id]);
                                else setSelectedModes(p => p.filter(old => old !== m.id));
                              }} className="w-5 h-5 rounded-md border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                            </label>
                          ))}
                        </div>
                        <Button variant="primary" onClick={saveOrderModes} className="w-full py-3" disabled={modesLoading || selectedModes.length === 0}>
                          {modesLoading ? <Loader2 className="animate-spin" size={18} /> : 'Guardar privilegios de módulo'}
                        </Button>
                      </div>

                      <div className="space-y-4">
                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Notas Administrativas</h4>
                        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={5} className="input-base text-sm" placeholder="Anotaciones privadas sobre la cuenta..." />
                      </div>
                    </div>
                  )}

                  {activeTab === 'events' && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-right-2 pr-1">
                      {eventLog.length > 0 ? (
                        eventLog.map((event) => (
                          <div key={event.id} className="relative pl-6 pb-6 last:pb-0 group">
                            <div className="absolute left-0 top-1 bottom-0 w-[2px] bg-gray-100 dark:bg-gray-800 group-last:bottom-auto group-last:h-1"></div>
                            <div className="absolute left-[-4px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-gray-900 bg-indigo-500 shadow-sm"></div>
                            <div className="bg-gray-50/80 dark:bg-gray-800/40 rounded-xl p-4 border border-gray-100 dark:border-gray-800/50 hover:border-indigo-100 transition-colors">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase">{event.eventType}</span>
                                <span className="text-[10px] text-gray-400 font-mono">{formatDateTime(event.createdAt)}</span>
                              </div>
                              <div className="flex items-center gap-2 text-sm">
                                <span className="font-semibold text-gray-600 dark:text-gray-400 italic line-through decoration-red-400/50">{event.fromStatus || '-'}</span>
                                <span className="text-gray-400">→</span>
                                <span className="font-black text-emerald-600 dark:text-emerald-400">{event.toStatus || '-'}</span>
                              </div>
                              {event.reason && <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 leading-relaxed bg-white/40 dark:bg-black/20 p-2 rounded">{event.reason}</p>}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                          <Clock3 size={48} className="opacity-20 mb-3" />
                          <p className="text-sm">Sin historial de eventos registrado</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-gray-50/30 dark:bg-gray-900/10">
                <div className="w-20 h-20 rounded-3xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-300 dark:text-gray-600 mb-4 border-2 border-dashed border-gray-300 dark:border-gray-700">
                  <ShieldCheck size={40} />
                </div>
                <h4 className="text-gray-900 dark:text-white font-bold text-lg">Control de Empresa</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-[280px]">Selecciona una empresa del listado para ver su perfil y gestionar su suscripción.</p>
              </div>
            )}
          </div>
        </section>
      )}

      {mainTab === 'billing' && (
        <section className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-stretch">
          {/* Bloque 1: Empresa y documentos */}
          <div className="card p-5 border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm h-full min-h-[520px] flex flex-col">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">Facturación</p>
                <h3 className="mt-2 text-lg font-bold text-gray-900 dark:text-white">Empresa y documentos</h3>
              </div>
              <div className="h-11 w-11 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-300">
                <FileText size={22} />
              </div>
            </div>

            <select
              value={selectedTenant?.id || ''}
              onChange={(event) => {
                const tenant = tenants.find((item) => item.id === event.target.value);
                if (!tenant) return;
                setSelectedTenant(tenant);
                setNextStatus(tenant.billingStatus || 'active');
                setReason(tenant.billingBlockedReason || '');
                setDueDateInput(toLocalDateTimeInput(tenant.billingDueDate));
                setGraceUntilInput(toLocalDateTimeInput(tenant.billingGraceUntil));
                loadDocuments(tenant.id);
                loadEvents(tenant.id);
              }}
              className="input-base mb-4"
            >
              <option value="">Selecciona empresa</option>
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
              ))}
            </select>

            <div className="space-y-3 flex-1 flex flex-col">
              <h4 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Facturas Emitidas</h4>
              {(billingDocuments.invoices || []).length > 0 ? (
                <div className="space-y-2 overflow-y-auto pr-1 flex-1">
                  {billingDocuments.invoices.map((invoice) => (
                    <div key={invoice.id} className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/40 p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{invoice.invoiceNumber}</p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400">{formatDateTime(invoice.periodStart)}</p>
                        </div>
                        <span className={`inline-flex text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wide whitespace-nowrap ${invoice.status === 'paid' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : invoice.status === 'partial' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200'}`}>{invoice.status}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="text-gray-500 dark:text-gray-400">Total</div>
                        <div className="text-right font-semibold text-gray-900 dark:text-white">{formatMoney(invoice.totalAmount, invoice.currency)}</div>
                        <div className="text-gray-500 dark:text-gray-400">Pendiente</div>
                        <div className="text-right font-black text-red-600 dark:text-red-400">{formatMoney(invoice.balance, invoice.currency)}</div>
                      </div>
                      <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-gray-200/50 dark:border-gray-800/50">
                        <button
                          onClick={() => printInvoiceDocument(invoice)}
                          className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                          title="Imprimir Factura"
                        >
                          <Printer size={15} />
                        </button>
                        <button
                          onClick={() => sendInvoiceByEmail(invoice)}
                          className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                          title="Enviar por Correo"
                        >
                          <Mail size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-4 text-center text-xs text-gray-500 dark:text-gray-400 flex-1 flex items-center justify-center">No hay facturas emitidas</div>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 space-y-2">
              <h4 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Recibos de Pago</h4>
              <div className="space-y-2 max-h-[130px] overflow-y-auto pr-1">
                {(billingDocuments.receipts || []).length > 0 ? (
                  billingDocuments.receipts.map((receiptItem) => (
                    <div key={receiptItem.id} className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 dark:border-gray-800 p-3 bg-gray-50 dark:bg-gray-950/30">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{receiptItem.receiptNumber}</p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">{formatDateTime(receiptItem.paidAt)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 whitespace-nowrap">{formatMoney(receiptItem.amount, selectedTenant?.currency || 'DOP')}</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => printReceiptDocument(receiptItem)}
                            className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800/80 transition-colors"
                            title="Imprimir Recibo"
                          >
                            <Printer size={14} />
                          </button>
                          <button
                            onClick={() => sendReceiptByEmail(receiptItem)}
                            className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800/80 transition-colors"
                            title="Enviar por Correo"
                          >
                            <Mail size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center text-xs text-gray-500 dark:text-gray-400 py-4">Sin recibos registrados</div>
                )}
              </div>
            </div>
          </div>

          {/* Bloque 2: Emitir Factura */}
          <div className="card p-5 border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm h-full min-h-[520px] flex flex-col">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">Operaciones</p>
                <h3 className="mt-2 text-lg font-bold text-gray-900 dark:text-white">Emitir Factura</h3>
              </div>
              <div className="h-11 w-11 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-300">
                <CreditCard size={22} />
              </div>
            </div>

            {!selectedTenant && (
              <div className="rounded-2xl border border-dashed border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 text-center text-sm text-amber-700 dark:text-amber-300 mb-4">
                Selecciona una empresa para emitir facturas
              </div>
            )}

            <div className="space-y-3 flex-1 flex flex-col">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Periodo desde</label>
                <input type="datetime-local" value={invoicePeriodStart} onChange={e => setInvoicePeriodStart(e.target.value)} className="input-base text-sm" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Periodo hasta</label>
                <input type="datetime-local" value={invoicePeriodEnd} onChange={e => setInvoicePeriodEnd(e.target.value)} className="input-base text-sm" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Vencimiento</label>
                <input type="datetime-local" value={invoiceDueDate} onChange={e => setInvoiceDueDate(e.target.value)} className="input-base text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Moneda</label>
                  <input value={invoiceCurrency} onChange={e => setInvoiceCurrency(e.target.value)} className="input-base text-sm uppercase" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Subtotal</label>
                  <input type="number" value={invoiceSubtotal} onChange={e => setInvoiceSubtotal(e.target.value)} className="input-base text-sm font-bold" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">ITBIS %</label>
                <input type="number" value={invoiceTaxRate} onChange={e => setInvoiceTaxRate(e.target.value)} className="input-base text-sm font-bold" />
              </div>
            </div>

            <Button variant="secondary" onClick={issueInvoice} disabled={loading || !selectedTenant} className="w-full h-11 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 mt-auto">
              Emitir Factura
            </Button>
          </div>

          {/* Bloque 3: Registrar Pago / Recibo */}
          <div className="card p-5 border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm h-full min-h-[520px] flex flex-col">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">Pagos</p>
                <h3 className="mt-2 text-lg font-bold text-gray-900 dark:text-white">Registrar Recibo</h3>
              </div>
              <div className="h-11 w-11 rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-300">
                <Receipt size={22} />
              </div>
            </div>

            {!selectedTenant && (
              <div className="rounded-2xl border border-dashed border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 text-center text-sm text-amber-700 dark:text-amber-300 mb-4">
                Selecciona una empresa para registrar pagos
              </div>
            )}

            <div className="space-y-3 flex-1 flex flex-col">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Factura asociada (opcional)</label>
                <select value={selectedInvoiceId} onChange={e => setSelectedInvoiceId(e.target.value)} className="input-base text-sm">
                  <option value="">Sin asociar</option>
                  {(billingDocuments.invoices || []).map((invoice) => (
                    <option key={invoice.id} value={invoice.id}>{invoice.invoiceNumber} - {formatMoney(invoice.balance, invoice.currency)}</option>
                  ))}
                </select>
              </div>

              <Button type="button" variant="ghost" onClick={() => setPaymentAmount(String(selectedTenantPlan?.price || ''))} className="w-full border border-gray-200 dark:border-gray-700 text-sm" disabled={!selectedTenantPlan}>
                {selectedTenantPlan ? `Cargar: ${formatMoney(selectedTenantPlan.price)}` : 'Cargar monto del plan'}
              </Button>

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Monto a abonar</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-gray-400">$</div>
                  <input value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} type="number" placeholder="0.00" className="input-base pl-8 text-lg font-bold" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Método</label>
                <input value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="input-base text-sm" placeholder="Ej: Transferencia" />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Referencia</label>
                <input value={paymentReference} onChange={e => setPaymentReference(e.target.value)} className="input-base text-sm" placeholder="Número de operación" />
              </div>
            </div>

            <Button variant="secondary" onClick={registerPayment} disabled={loading || !selectedTenant} className="w-full h-11 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 mt-auto">
              Completar Pago y Recibo
            </Button>
          </div>
        </section>
      )}

    </div>
  );
}
