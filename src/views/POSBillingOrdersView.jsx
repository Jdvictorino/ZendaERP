import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import api from '../api/client.js';
import { useApiCrud } from '../hooks/useApi.js';
import { 
  Search, Plus, Minus, Trash2, Receipt, ChevronDown, Check, ShoppingCart, Smartphone, XCircle, UserPlus
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import Button from '../components/ui/Button.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { badgeClass } from '../components/ui/Badge.jsx';
import { formatCurrency } from '../utils/formatCurrency.js';
import { ECF_TYPE_MAP } from '../utils/ecfConstants.js';
import toast from 'react-hot-toast';
import PaymentModal from '../components/modals/PaymentModal.jsx';
import ScannerLinkModal from '../components/modals/ScannerLinkModal.jsx';
import CustomerModal from '../components/modals/CustomerModal.jsx';
import OpenShiftModal from '../components/modals/OpenShiftModal.jsx';
import CloseShiftModal from '../components/modals/CloseShiftModal.jsx';
import CierreCajaModal from '../components/modals/CierreCajaModal.jsx';
import CierreCajaReportModal from '../components/modals/CierreCajaReportModal.jsx';
import AdminPinAuthModal from '../components/modals/AdminPinAuthModal.jsx';
import { useScanner } from '../context/ScannerContext.jsx';
import { generatePDF } from '../utils/pdfGenerator.js';
import { generateThermalReceiptHTML } from '../utils/escposGenerator.js';
import { printEscPosReceipt } from '../utils/printer.js';
import { playSuccessSound, playErrorSound } from '../utils/soundPlayer.js';
import { confirmDialog } from '../utils/confirmDialog.jsx';

const TAX_RATE = 0.18;

// shortcut: la moneda se toma del perfil en cada render del POS (ver posCurrency = ... abajo); si fmt se usa fuera de esta vista, pasar la moneda explícita
let posCurrency = 'DOP';
const fmt = (n) => formatCurrency(Number(n) || 0, posCurrency);

// Totales con ITBIS incluido en el precio (igual que el backend). El descuento general se aplica después del de cada línea.
// % de descuento a enviar por línea: combina el de la línea con el general (100 * (1 - (1-d)(1-g)))
export function combinedDiscount(lineDisc, globalDisc) {
  const d = (Number(lineDisc) || 0) / 100, g = (Number(globalDisc) || 0) / 100;
  return Math.min(100, Number((100 * (1 - (1 - d) * (1 - g))).toFixed(4)));
}

export function computeTotals(rows, globalDisc) {
  const g = 1 - (Number(globalDisc) || 0) / 100;
  let gross = 0, total = 0, tax = 0;
  for (const r of rows) {
    const line = r.price * r.qty * (1 - r.disc / 100);
    const lineNet = line * g;
    gross += line; total += lineNet;
    if (r.taxable) tax += lineNet - lineNet / (1 + TAX_RATE);
  }
  return { gross, discAmt: gross - total, tax, subtotal: total - tax, total };
}

const CONDICIONES = ['Contado', 'Crédito 30d', 'Crédito 60d'];

// ─── Sub-components ───────────────────────────────────────────────────────────

function TopBar({ children, badge }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 h-14 border-b border-line bg-surface">
      <div className="flex items-center gap-2 min-w-0">
        <Receipt size={18} className="text-brand-600 dark:text-brand-400 shrink-0" />
        <h2 className="text-base font-semibold text-ink truncate">Punto de venta</h2>
        {badge && <span className={badgeClass('brand', 'sm')}>{badge}</span>}
      </div>
      {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
    </div>
  );
}

function HeaderFields({ idPrefix, comprobante, setComprobante, options, ncfPreview, condicion, setCondicion }) {
  const today = new Date().toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {/* la fecha la asigna el servidor al guardar la venta; aquí solo se informa */}
      <Field label="Fecha">
        <div className="input-base flex items-center bg-surface-muted text-ink-soft tabular-nums">{today}</div>
      </Field>
      <Field label="Condición" htmlFor={`${idPrefix}-condicion`}>
        <select id={`${idPrefix}-condicion`} className="input-base" value={condicion} onChange={e => setCondicion(e.target.value)}>
          {CONDICIONES.map(c => <option key={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Comprobante" htmlFor={`${idPrefix}-comprobante`}>
        <select id={`${idPrefix}-comprobante`} className="input-base" value={comprobante} onChange={e => setComprobante(e.target.value)}>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>
      <Field label="Próximo NCF">
        <div className="input-base flex items-center bg-surface-muted font-mono text-ink-soft tabular-nums">{ncfPreview || '—'}</div>
      </Field>
    </div>
  );
}

function Field({ label, htmlFor, children }) {
  const Label = htmlFor ? 'label' : 'span';
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-medium text-ink-muted">{label}</Label>
      {children}
    </div>
  );
}

function SearchBar({ productRef, onAdd, catalog = [], barcodeScan, setBarcodeScan, handleBarcodeScan, isConnected, linkedDeviceName, disconnectDevice, initSession, setShowScannerModal }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const dropdownRef = useRef();

  useEffect(() => {
    const handler = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleInput = (v) => {
    setQuery(v);
    if (v.length < 2) { setResults([]); setOpen(false); return; }
    const r = catalog.filter(p =>
      (p.name && p.name.toLowerCase().includes(v.toLowerCase())) || 
      (p.barcode && p.barcode.includes(v)) || 
      (p.productCode && p.productCode.includes(v))
    );
    setResults(r);
    setOpen(r.length > 0);
    setHighlightIdx(0);
  };

  const pick = (p) => {
    if (!p) return;
    onAdd(p);
    setQuery("");
    setResults([]);
    setOpen(false);
    setHighlightIdx(-1);
  };

  const handleKeyDown = (e) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(prev => (results.length > 0 ? (prev + 1) % results.length : -1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(prev => (results.length > 0 ? (prev - 1 + results.length) % results.length : -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[highlightIdx]) pick(results[highlightIdx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="relative mt-2 flex flex-col sm:flex-row gap-2" ref={dropdownRef}>
      <div className="flex gap-2 flex-1 relative">
        <div className="relative flex-1">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"><Search size={18} /></div>
          <input aria-label="Buscar producto"
            ref={productRef}
            className="input-base pl-10"
            placeholder="Buscar producto…"
            value={query}
            onChange={e => handleInput(e.target.value)}
            onFocus={() => { if (results.length) setOpen(true); }}
            onKeyDown={handleKeyDown}
          />
        </div>
        <Button className="gap-1.5 shrink-0"
          onClick={() => {
            if (open && results[highlightIdx]) { pick(results[highlightIdx]); }
            else if (query.trim()) {
                const p = catalog.find(x => (x.name && x.name.toLowerCase().includes(query.toLowerCase())) || x.barcode === query || x.productCode === query);
                if (p) pick(p); else onAdd(null);
                setQuery(""); setOpen(false);
            } else { onAdd(null); }
          }}>
          <Plus size={16} /><span className="hidden sm:inline">Agregar</span>
        </Button>
        {open && (
          <div className="absolute top-[calc(100%+6px)] left-0 right-0 sm:right-32 bg-surface border border-line rounded-xl shadow-lg z-50 overflow-hidden max-h-60 overflow-y-auto">
            {results.map((p, i) => (
              <div key={p.id || i} className={`flex flex-col px-3 py-2.5 cursor-pointer transition-colors ${i === highlightIdx ? 'bg-brand-50 dark:bg-brand-900/50' : 'hover:bg-surface-muted dark:hover:bg-gray-700'}`} onClick={() => pick(p)} onMouseEnter={() => setHighlightIdx(i)}>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-ink">{p.name}</span>
                  {i === highlightIdx && <Check size={14} className="text-brand-600" />}
                </div>
                <span className="text-xs text-ink-muted dark:text-gray-400">{p.productCode || p.barcode || '-'} — {fmt(p.salePrice || p.price)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="hidden lg:flex gap-2">
         <input aria-label="Escanear código" type="text" placeholder="Escanear código..." value={barcodeScan || ''} onChange={e => setBarcodeScan(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleBarcodeScan(barcodeScan.trim()); }} className="input-base w-48" />
         {isConnected ? (
             <div className="flex items-center bg-success-100 text-success-800 dark:bg-success-900/30 dark:text-success-400 rounded-xl overflow-hidden shadow-sm shrink-0 border border-success-200 dark:border-success-800/50">
                 <button onClick={() => setShowScannerModal(true)} className="flex items-center gap-1.5 px-3 py-2.5 hover:bg-success-200 dark:hover:bg-success-800/50 transition-colors text-sm" title="Escáner remoto activo"><Smartphone size={16} /><span className="font-semibold hidden xl:inline">{linkedDeviceName || 'Conectado'}</span></button>
                 <button onClick={() => disconnectDevice()} className="px-2 py-2.5 hover:bg-success-200 dark:hover:bg-success-800/50 transition-colors border-l border-success-200/50 dark:border-success-800 text-sm" title="Desvincular"><XCircle size={16} /></button>
             </div>
         ) : (
             <Button variant="secondary" className="gap-1.5 shrink-0" onClick={() => { initSession(); setShowScannerModal(true); }} title="Vincular celular como escáner"><Smartphone size={16} /><span className="hidden xl:inline">Vincular</span></Button>
         )}
      </div>
    </div>
  );
}

function LineDesc({ row, onDesc, className = '' }) {
  if (row.originalId) return <span className={className}>{row.desc}</span>;
  return (
    <input aria-label="Descripción del artículo" className="input-base h-8" placeholder="Descripción del artículo"
      value={row.desc} onChange={e => onDesc(row.id, e.target.value)} />
  );
}

const qtyBtnCls = "w-8 h-8 flex justify-center items-center rounded-lg border border-line bg-surface text-ink-soft hover:bg-surface-muted font-semibold";

function MobileGridCard({ row, onQty, onPrice, onDelete, onDesc }) {
  const total = row.price * row.qty * (1 - row.disc / 100);
  return (
    <div className="flex items-start gap-3 p-3 bg-surface rounded-xl border border-line">
      <div className="flex-1 min-w-0">
        <LineDesc row={row} onDesc={onDesc} className="block text-sm font-semibold text-ink truncate" />
        <p className="text-xs text-ink-muted mt-0.5 font-mono">{row.code || '—'}</p>
        <div className="flex items-center gap-3 mt-2">
          <div className="flex items-center gap-1.5">
            <button aria-label="Disminuir cantidad" className={qtyBtnCls} onClick={() => onQty(row.id, -1)}><Minus size={14} /></button>
            <span className="text-sm font-semibold w-6 text-center tabular-nums">{row.qty}</span>
            <button aria-label="Aumentar cantidad" className={qtyBtnCls} onClick={() => onQty(row.id, 1)}><Plus size={14} /></button>
          </div>
          <span className="text-xs text-ink-muted">×</span>
          <input aria-label="Precio unitario" className="input-base w-24 h-8 text-right tabular-nums" type="number" min="0" step="0.01" value={row.price} onChange={e => onPrice(row.id, e.target.value)} />
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <span className="text-base font-semibold text-ink tabular-nums">{fmt(total)}</span>
        <button aria-label="Quitar línea" className="p-1.5 text-gray-400 hover:text-danger-600 rounded-lg" onClick={() => onDelete(row.id)}><Trash2 size={16} /></button>
      </div>
    </div>
  );
}

function GridRow({ row, index, onQty, onDisc, onPrice, onDelete, onDesc }) {
  const total = row.price * row.qty * (1 - row.disc / 100);
  const tax = row.taxable ? total - (total / (1 + TAX_RATE)) : 0;
  const cellInput = "input-base h-8 px-2 text-right tabular-nums";
  return (
    <tr className="border-b border-line hover:bg-surface-muted/60 transition-colors group">
      <td className="px-3 py-2 text-center text-xs text-ink-muted tabular-nums">{index + 1}</td>
      <td className="px-3 py-2 text-sm font-medium text-ink"><LineDesc row={row} onDesc={onDesc} /></td>
      <td className="px-3 py-2 text-xs text-ink-muted font-mono">{row.code}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <button aria-label="Disminuir cantidad" className="w-7 h-7 flex justify-center items-center rounded-md border border-line bg-surface text-ink-soft hover:bg-surface-muted" onClick={() => onQty(row.id, -1)}><Minus size={12} /></button>
          <span className="text-sm font-medium w-6 text-center tabular-nums">{row.qty}</span>
          <button aria-label="Aumentar cantidad" className="w-7 h-7 flex justify-center items-center rounded-md border border-line bg-surface text-ink-soft hover:bg-surface-muted" onClick={() => onQty(row.id, 1)}><Plus size={12} /></button>
        </div>
      </td>
      <td className="px-3 py-2"><input aria-label="Descuento de la línea (%)" className={`${cellInput} w-16`} type="number" min="0" max="100" value={row.disc} onChange={e => onDisc(row.id, e.target.value)} /></td>
      <td className="px-3 py-2 text-right"><input aria-label="Precio unitario" className={`${cellInput} w-24`} type="number" min="0" step="0.01" value={row.price} onChange={e => onPrice(row.id, e.target.value)} /></td>
      <td className="px-3 py-2 text-right text-xs text-ink-muted tabular-nums">{row.taxable ? fmt(tax) : 'Exento'}</td>
      <td className="px-3 py-2 text-right text-sm font-semibold text-ink tabular-nums">{fmt(total)}</td>
      <td className="px-3 py-2 text-center"><button aria-label="Quitar línea" className="p-1.5 text-gray-400 hover:text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-950/40 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => onDelete(row.id)}><Trash2 size={16} /></button></td>
    </tr>
  );
}

function DataGrid({ rows, onQty, onDisc, onPrice, onDelete, onDesc, onAddEmpty }) {
  const thCls = "px-3 py-2.5 text-xs font-semibold text-ink-muted uppercase tracking-wide";
  const empty = <EmptyState icon={ShoppingCart} title="Sin artículos" description="Busca un producto (F2) o escanea su código para añadirlo." />;
  return (
    <div className="flex flex-col flex-1 border border-line rounded-xl bg-surface overflow-hidden mt-3">
      <div className="flex-1 overflow-auto custom-scrollbar">
        {/* Móvil: tarjetas */}
        <div className="lg:hidden flex flex-col gap-2 p-3">
          {rows.length === 0 ? empty : rows.map(r => (
            <MobileGridCard key={r.id} row={r} onQty={onQty} onPrice={onPrice} onDelete={onDelete} onDesc={onDesc} />
          ))}
        </div>
        {/* Escritorio: tabla */}
        <table className="w-full text-left border-collapse hidden lg:table">
          <thead>
            <tr className="bg-surface-muted border-b border-line sticky top-0 z-10">
              <th className={`${thCls} w-[40px] text-center`}>#</th>
              <th className={thCls}>Producto / servicio</th>
              <th className={`${thCls} w-[110px]`}>Código</th>
              <th className={`${thCls} w-[120px]`}>Cant.</th>
              <th className={`${thCls} w-[90px]`}>Desc. %</th>
              <th className={`${thCls} w-[120px] text-right`}>Precio unit.</th>
              <th className={`${thCls} w-[100px] text-right`}>ITBIS</th>
              <th className={`${thCls} w-[120px] text-right`}>Total</th>
              <th className={`${thCls} w-[50px]`}><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan="9" className="p-0">{empty}</td></tr>
            ) : rows.map((r, i) => (
              <GridRow key={r.id} row={r} index={i} onQty={onQty} onDisc={onDisc} onPrice={onPrice} onDelete={onDelete} onDesc={onDesc} />
            ))}
          </tbody>
        </table>
      </div>
      <button className="flex items-center gap-2 px-4 py-2.5 border-t border-dashed border-line text-xs font-semibold text-brand-600 dark:text-brand-400 hover:bg-surface-muted transition-colors w-full" onClick={onAddEmpty}>
        <Plus size={14} /> Agregar línea libre
      </button>
    </div>
  );
}

function PayMethods({ active, setActive, disabled }) {
  const methods = ["Efectivo", "Tarjeta", "Transferencia", "Mixto"];
  return (
    <div role="radiogroup" aria-label="Forma de pago" className="grid grid-cols-2 gap-2">
      {methods.map(m => {
        const on = active === m;
        return (
          <button key={m} type="button" role="radio" aria-checked={on} disabled={disabled} onClick={() => setActive(m)}
            className={`h-9 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${on
              ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300'
              : 'border-line bg-surface text-ink-soft hover:bg-surface-muted'}`}>
            {m}
          </button>
        );
      })}
    </div>
  );
}

function Totals({ rows, globalDisc, onSubmit, isSubmitting, submitLabel }) {
  const t = computeTotals(rows, globalDisc);
  return (
    <div className="mt-auto flex flex-col pt-4">
      <TotalRow label="Subtotal" value={fmt(t.subtotal)} />
      {t.discAmt > 0 && <TotalRow label={`Descuento general (${globalDisc}%)`} value={`−${fmt(t.discAmt)}`} valueClass="text-danger-700 dark:text-danger-400" />}
      <TotalRow label="ITBIS (18%)" value={fmt(t.tax)} />
      <div className="flex justify-between items-baseline mt-3 px-4 py-3 bg-night-900 dark:bg-black/40 dark:ring-1 dark:ring-inset dark:ring-line rounded-xl">
        <span className="text-sm font-medium text-gray-300">Total</span>
        <span className="text-2xl font-semibold text-white tabular-nums">{fmt(t.total)}</span>
      </div>
      <Button size="lg" className="mt-3 w-full" onClick={onSubmit} disabled={rows.length === 0 || isSubmitting}>
        {isSubmitting ? 'Procesando…' : submitLabel}
      </Button>
      {rows.length === 0 && <p className="mt-2 text-xs text-center text-ink-muted">Agrega al menos un artículo para continuar.</p>}
    </div>
  );
}

function TotalRow({ label, value, valueClass = "" }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-line last:border-0">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className={`text-sm font-semibold text-ink tabular-nums ${valueClass}`}>{value}</span>
    </div>
  );
}

function StatusBar({ rows, payMethod, condicion, comprobanteLabel, userLabel }) {
  const isCredit = condicion !== 'Contado';
  return (
    <div className="hidden lg:flex items-center justify-between px-5 h-10 bg-surface-muted border-t border-line">
      <div className="flex gap-2">
        <span className={badgeClass('neutral', 'sm')}>{rows.length} artículo{rows.length !== 1 ? 's' : ''}</span>
        <span className={badgeClass('brand', 'sm')}>{comprobanteLabel}</span>
        <span className={badgeClass(isCredit ? 'warning' : 'success', 'sm')}>{isCredit ? condicion : `Contado · ${payMethod}`}</span>
      </div>
      {userLabel && <span className="text-xs text-ink-muted">{userLabel}</span>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function POSBillingOrdersView({ companyProfile, currentUserProfile, setView, adminUser }) {
  // Escritorio y móvil se renderizan a la vez (uno oculto por CSS): cada uno tiene su ref y los atajos eligen el visible
  const productRefDesktop = useRef(null);
  const productRefMobile = useRef(null);
  const customerRefDesktop = useRef(null);
  const customerRefMobile = useRef(null);
  const isDesktop = () => window.matchMedia('(min-width: 1024px)').matches;
  const focusProduct = () => (isDesktop() ? productRefDesktop : productRefMobile).current?.focus();
  const focusCustomer = () => (isDesktop() ? customerRefDesktop : customerRefMobile).current?.focus();

  const { data: pData } = useApiCrud('/products');
  const { data: cData } = useApiCrud('/customers');
  const { data: shiftsData, refetch: refetchShifts } = useApiCrud('/shifts');
  const catalog = Array.isArray(pData) ? pData : [];
  const customersList = Array.isArray(cData) ? cData : [];
  const { data: iData } = useApiCrud('/invoices');
  const invoicesData = Array.isArray(iData) ? iData : (iData?.data || []);

  const [rows, setRows] = useState([]);
  const [condicion, setCondicion] = useState("Contado");
  const [payMethod, setPayMethod] = useState("Efectivo");
  const [globalDisc, setGlobalDisc] = useState(0);
  const actionsRef = useRef({ submit: () => {}, cancel: () => {} });
  const [comprobante, setComprobante] = useState('NoFiscal');
  const [ecfInfo, setEcfInfo] = useState({ enabled: false, sequences: [] });
  const [ncfNextLocal, setNcfNextLocal] = useState({}); // avanza la vista previa tras cada venta (el perfil no se recarga aquí)
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);

  // Modal & Processing states
  const [paymentForOrder, setPaymentForOrder] = useState(null);
  const [isBillAndPayFlow, setIsBillAndPayFlow] = useState(false);

  // Modal states
  const [showOpenShift, setShowOpenShift] = useState(false);
  const [showCloseShift, setShowCloseShift] = useState(false);
  const [showCierreCajaModal, setShowCierreCajaModal] = useState(false);
  const [showCierreReports, setShowCierreReports] = useState(false);
  const [adminPinAction, setAdminPinAction] = useState(null); // 'openShift' | 'closeShift'
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [showAdminPinModal, setShowAdminPinModal] = useState(false);


  // Settings modes
  const isDistributor = companyProfile?.orderMode === 'distributor' || companyProfile?.settings?.orderMode === 'distributor';
  posCurrency = companyProfile?.currency || 'DOP';

  // ── Comprobantes disponibles: NCF tradicional configurado + e-CF con secuencia activa ──
  const loadEcf = useCallback(() => {
    Promise.all([api.ecf.getConfig(), api.ecf.getSequences()])
      .then(([cfg, seqs]) => setEcfInfo({ enabled: !!cfg?.ecfEnabled, sequences: Array.isArray(seqs) ? seqs : [] }))
      .catch(() => setEcfInfo({ enabled: false, sequences: [] })); // sin permiso o sin e-CF: solo comprobantes tradicionales
  }, []);
  useEffect(() => { loadEcf(); }, [loadEcf]);

  const comprobanteOptions = useMemo(() => {
    const p = companyProfile || {};
    const opts = [{ value: 'NoFiscal', label: 'Sin valor fiscal', requiresBuyer: false, preview: '' }];
    const traditional = [
      { value: 'B02', label: 'Consumo (B02)', prefix: p.ncfB02Prefix, next: p.ncfB02SequenceNext, end: p.ncfB02SequenceEnd, requiresBuyer: false },
      { value: 'B01', label: 'Crédito fiscal (B01)', prefix: p.ncfB01Prefix, next: p.ncfB01SequenceNext, end: p.ncfB01SequenceEnd, requiresBuyer: true },
    ];
    for (const t of traditional) {
      const next = ncfNextLocal[t.value] || t.next || 1;
      if (t.prefix && (!t.end || next <= t.end)) {
        opts.push({ value: t.value, label: t.label, requiresBuyer: t.requiresBuyer, preview: `${t.prefix}${String(next).padStart(8, '0')}` });
      }
    }
    if (ecfInfo.enabled) {
      const ECF_LABELS = { E32: 'e-CF Consumo (E32)', E31: 'e-CF Crédito fiscal (E31)', E44: 'e-CF Regímenes especiales (E44)', E45: 'e-CF Gubernamental (E45)' };
      for (const code of Object.keys(ECF_LABELS)) {
        const seq = ecfInfo.sequences.find(q => q.tipoEcf === code && q.estado === 'activa' && (!q.rangoHasta || q.secuencial <= q.rangoHasta));
        if (seq) opts.push({ value: code, label: ECF_LABELS[code], requiresBuyer: !!ECF_TYPE_MAP[code]?.requiresBuyer, preview: `${code}${String(seq.secuencial).padStart(10, '0')}` });
      }
    }
    return opts;
  }, [companyProfile, ecfInfo, ncfNextLocal]);

  const selectedComprobante = comprobanteOptions.find(o => o.value === comprobante) || comprobanteOptions[0];
  // si el comprobante elegido deja de estar disponible (secuencia agotada, e-CF deshabilitado), volver a "Sin valor fiscal"
  useEffect(() => {
    if (!comprobanteOptions.some(o => o.value === comprobante)) setComprobante('NoFiscal');
  }, [comprobanteOptions, comprobante]);
  const isCredit = condicion !== 'Contado';

  // Shifts logic
  const cashShifts = Array.isArray(shiftsData) ? shiftsData : (shiftsData?.data || []);
  const registers = companyProfile?.registers || [];
  const selectedRegisterId = registers[0]?.id || '';

  const openShift = useMemo(() => {
    const rowsList = (cashShifts || []).filter(s => s.status === 'open');
    if (!selectedRegisterId) return rowsList[0] || null;
    return rowsList.find(s => (s.registerId || '') === selectedRegisterId) || null;
  }, [cashShifts, selectedRegisterId]);

  const currentShiftMovements = useMemo(() => {
    if (!openShift) return [];
    return openShift.movements || [];
  }, [openShift]);

  // onClose(true) = PIN correcto; onClose(false) = cancelado. Solo se abre/cierra el turno con PIN válido.
  const handleAdminPinSuccess = useCallback(async (authorized) => {
    setShowAdminPinModal(false);
    if (authorized !== true) { setAdminPinAction(null); return; }
    if (adminPinAction === 'openShift') {
        setShowOpenShift(true);
    } else if (adminPinAction === 'closeTurno') {
        setShowCloseShift(true);
    }
    setAdminPinAction(null);
  }, [adminPinAction]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      const isModalOpen = !!(
        paymentForOrder || 
        showAddCustomerModal || 
        adminPinAction || 
        showScannerModal || 
        showAdminPinModal || 
        showOpenShift || 
        showCloseShift ||
        showCierreCajaModal ||
        showCierreReports
      );

      if (e.key === 'Escape') {
        if (paymentForOrder) setPaymentForOrder(null);
        else if (showAddCustomerModal) setShowAddCustomerModal(false);
        else if (showScannerModal) setShowScannerModal(false);
        else if (showCierreReports) setShowCierreReports(false);
        else if (adminPinAction) setAdminPinAction(null);
        // sin modales y sin estar escribiendo en un campo: Esc limpia la venta (pide confirmación si hay artículos)
        else if (!document.querySelector('[role=dialog]') && !e.target.closest?.('input, select, textarea')) actionsRef.current.cancel();
        return;
      }

      if (isModalOpen) return;

      if (e.key === 'F2') {
        e.preventDefault();
        focusProduct();
      } else if (e.key === 'F3') {
        e.preventDefault();
        focusCustomer();
      } else if (e.key === 'F9') {
        e.preventDefault();
        const next = condicion === 'Contado' ? 'Crédito 30d' : 'Contado';
        setCondicion(next);
        toast(`Condición: ${next}`, { icon: '💳' });
      } else if (e.key === 'F10') {
        e.preventDefault();
        actionsRef.current.submit();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [paymentForOrder, showAddCustomerModal, adminPinAction, showScannerModal, showAdminPinModal, showOpenShift, showCloseShift, showCierreCajaModal, showCierreReports, condicion]);

  // Focus product search on mount
  useEffect(() => {
    if (isDistributor) {
      setTimeout(focusProduct, 800);
    }
  }, [isDistributor]);

  const activeCustomers = useMemo(() => customersList.filter(c => c.status !== 'inactive'), [customersList]);

  // Set default customer
  useEffect(() => {
    if (activeCustomers.length > 0 && !selectedCustomer) {
      const defaultCustomer = activeCustomers.find(c => 
        (c.rnc === '00122558965') || 
        (c.identificationNumber === '00122558965') ||
        (c.name && c.name.toLowerCase().includes('walk-in'))
      );
      if (defaultCustomer) {
        handleCustomerSelect(defaultCustomer);
      }
    }
  }, [activeCustomers, selectedCustomer]);
  const formattedSearchTerm = customerSearchTerm.trim().toLowerCase();
  
  const customerOptions = useMemo(() => {
     if (!formattedSearchTerm) return activeCustomers.slice(0, 25);
     return activeCustomers.filter(c => {
         const searchArray = [c.name, c.rnc, c.identificationNumber, c.customerCode].filter(Boolean).map(v => v.toString().toLowerCase());
         return searchArray.some(s => s.includes(formattedSearchTerm));
     }).slice(0, 25);
  }, [activeCustomers, formattedSearchTerm]);

  const handleCustomerSearchChange = (value) => {
      setCustomerSearchTerm(value);
      setIsCustomerDropdownOpen(true);
      if (selectedCustomer) setSelectedCustomer(null);
  };
  
  const handleCustomerSelect = (customer) => {
      setSelectedCustomer(customer);
      setCustomerSearchTerm(customer.name + (customer.rnc ? ` - ${customer.rnc}` : ''));
      setIsCustomerDropdownOpen(false);
  };
  
  const clearCustomerSelection = () => {
      setSelectedCustomer(null);
      setCustomerSearchTerm('');
  };

  const { 
      isConnected, linkedDeviceName, disconnectDevice, registerScanHandler, unregisterScanHandler, initSession
  } = useScanner();
  const [barcodeScan, setBarcodeScan] = useState('');

  const handleBarcodeScan = useCallback((codeRaw) => {
      if (!codeRaw) return;
      const codeStr = String(codeRaw).trim();
      const codeNum = codeStr.replace(/\D/g, '');
      const found = catalog.find(p => {
          const pb = p.barcode ? String(p.barcode).trim() : '';
          const pc = p.productCode ? String(p.productCode).trim() : '';
          return pb === codeStr || pc === codeStr || (codeNum && (pb === codeNum || pc === codeNum));
      });
      
      if (found) {
          setRows(r => {
             const existing = r.find(x => x.originalId === found.id);
             if (existing) return r.map(x => x.originalId === found.id ? { ...x, qty: x.qty + 1 } : x);
             return [...r, {
               id: uuidv4(),  
               originalId: found.id,
               desc: found.name, 
               code: found.productCode || found.barcode || "-", 
               price: found.salePrice || found.price || 0, 
               qty: 1, 
               disc: 0, 
               taxable: found.hasTax ?? true 
             }];
          });
          toast.success(`Agregado: ${found.name}`);
      } else {
          toast.error(`No se encontró el código ${codeStr}`);
      }
      setBarcodeScan('');
  }, [catalog]);

  useEffect(() => {
      registerScanHandler(handleBarcodeScan);
      return () => unregisterScanHandler();
  }, [handleBarcodeScan, registerScanHandler, unregisterScanHandler]);

  const showToast = (msg, type = "ok") => (type === 'warn' ? toast.error(msg) : toast.success(msg));

  const addProduct = (p) => {
    if (!p) {
      setRows(r => [...r, { id: uuidv4(), desc: "", code: "", price: 0, qty: 1, disc: 0, taxable: true }]);
    } else {
      setRows(r => {
        const existing = r.find(x => x.originalId === p.id);
        if (existing) return r.map(x => x.originalId === p.id ? { ...x, qty: x.qty + 1 } : x);
        const codeStr = p.productCode || p.barcode || "-";
        const priceNum = p.salePrice || p.price || 0;
        const taxable = p.hasTax ?? true;
        return [...r, {
          id: uuidv4(),
          originalId: p.id,
          desc: p.name, 
          code: codeStr, 
          price: priceNum, 
          qty: 1, 
          disc: 0, 
          taxable: taxable 
        }];
      });
    }
  };

  const onQty = (id, d) => setRows(r => r.map(x => x.id === id ? { ...x, qty: Math.max(1, x.qty + d) } : x));
  const onDisc = (id, v) => setRows(r => r.map(x => x.id === id ? { ...x, disc: Math.min(100, Math.max(0, parseFloat(v) || 0)) } : x));
  const onPrice = (id, v) => setRows(r => r.map(x => x.id === id ? { ...x, price: Math.max(0, parseFloat(v) || 0) } : x));
  const onDelete = (id) => setRows(r => r.filter(x => x.id !== id));
  const onDesc = (id, v) => setRows(r => r.map(x => x.id === id ? { ...x, desc: v } : x));

  const handleNew = () => {
    setRows([]);
    setGlobalDisc(0);
    setSelectedCustomer(null);
  };

  const handleCancel = async () => {
    if (rows.length === 0 || await confirmDialog('Se perderán los cambios de esta factura.', { title: '¿Cancelar factura?', confirmText: 'Cancelar factura', cancelText: 'Seguir' })) {
      setRows([]);
      setSelectedCustomer(null);
      showToast("Factura cancelada", "warn");
    }
  };

  const handleProcessOrder = async () => {
    if (isSubmitting) return;
    if (rows.length === 0) { toast.error('Agrega al menos un artículo.'); return; }
    const invalid = rows.find(r => !String(r.desc || '').trim() || !(Number(r.price) > 0) || !(r.qty > 0));
    if (invalid) { toast.error('Revisa las líneas: cada artículo necesita descripción, cantidad y un precio mayor que 0.'); return; }

    const option = selectedComprobante;
    const buyerDoc = selectedCustomer?.rnc || selectedCustomer?.identificationNumber || '';
    if (option.requiresBuyer && !buyerDoc) { toast.error(`${option.label} requiere un cliente con RNC o cédula.`); focusCustomer(); return; }
    if (isCredit && !selectedCustomer) { toast.error('Las ventas a crédito requieren un cliente registrado.'); focusCustomer(); return; }

    setIsSubmitting(true);
    const itemsData = rows.map(r => ({
      productId: r.originalId || undefined,
      variantId: null,
      productName: String(r.desc).trim(),
      quantity: parseInt(r.qty, 10),
      unitPrice: Number(r.price) || 0,
      // el descuento general se combina con el de la línea para que el total facturado sea el mismo que ve el cajero
      discountPercent: combinedDiscount(r.disc, globalDisc),
      taxRate: r.taxable ? TAX_RATE * 100 : 0,
      customizationNotes: '',
      customImageUrls: [],
      variantInfo: null,
    }));

    const orderData = {
      customerId: selectedCustomer?.id || null,
      customerName: selectedCustomer?.name || 'Consumidor Final',
      ...(buyerDoc ? { customerRnc: buyerDoc } : {}),
      items: itemsData,
      paymentMethod: isCredit ? 'Crédito' : payMethod,
      amountPaid: 0,
      deliveryType: 'store',
      // "Crédito 30d" → 30 días; el backend calcula el vencimiento y CxC lo usa para la antigüedad
      ...(isCredit ? { paymentTermDays: parseInt(condicion.replace(/\D/g, ''), 10) || 30 } : {}),
      notes: '',
      status: 'Pendiente',
    };

    try {
      const created = await api.invoices.create(orderData);
      let finalOrder = { ...created, customerName: orderData.customerName };
      try {
        const billed = await api.invoices.bill(created.id, option.value, buyerDoc);
        finalOrder = { ...finalOrder, ...billed };
        const ecf = billed?.ecfResult;
        if (ecf) {
          const doc = ecf.ecfDocument || {};
          if (ecf.success) toast.success(`e-CF ${doc.eNcf || ''} enviado a la DGII (${doc.dgiiStatus || 'pendiente'}).`);
          else toast.error(`La DGII no aceptó el e-CF ${doc.eNcf || ''}: ${ecf.error || doc.dgiiMessage || 'error desconocido'}. Revísalo en Gestión Fiscal › e-CF.`);
          loadEcf(); // la secuencia avanzó
        } else if (billed?.ncfNumber && (option.value === 'B01' || option.value === 'B02')) {
          const used = parseInt(String(billed.ncfNumber).replace(/\D/g, '').slice(-8), 10);
          if (used) setNcfNextLocal(prev => ({ ...prev, [option.value]: used + 1 }));
        }
      } catch (billErr) {
        console.error('Error al facturar:', billErr);
        toast.error(`La venta ${created.orderNumber || ''} se guardó, pero no se pudo emitir el comprobante: ${billErr.message}. Puedes facturarla desde Pedidos/Facturas.`);
      }

      playSuccessSound();
      if (isCredit) {
        toast.success(`Venta a crédito ${finalOrder.orderNumber || ''} registrada en Cuentas por Cobrar.`);
        // sin ventana de cobro: el comprobante se imprime al registrar la venta
        handleDocumentPrint(finalOrder, 'invoice', selectedCustomer).catch(err => toast.error('No se pudo imprimir: ' + err.message));
      } else {
        setPaymentForOrder(finalOrder);
      }
      handleNew();
    } catch (err) {
      toast.error('No se pudo guardar la venta: ' + err.message);
      playErrorSound();
    } finally {
      setIsSubmitting(false);
    }
  };

  // los atajos globales (F10, Esc) llaman siempre a la versión actual de estas funciones
  actionsRef.current = { submit: handleProcessOrder, cancel: handleCancel };

  const handleDocumentPrint = async (orderData, type, customerDetails) => {
      const printMode = companyProfile?.cash?.printing?.mode;
      if (printMode === 'escpos') {
          const htmlString = generateThermalReceiptHTML(orderData, type, companyProfile, customerDetails, null);
          const printerName = companyProfile?.cash?.printing?.printerName || '';
          const success = await printEscPosReceipt(htmlString, printerName);
          if (!success) toast.error('Impresión de ticket fallida.');
      } else {
          generatePDF(orderData, type, companyProfile, customerDetails, null, type === 'quote' ? 'view' : 'download');
      }
  };

  // al cobrar, imprime el comprobante según la configuración de Caja (térmica o PDF)
  const handlePaymentSuccess = (paidInvoice) => {
      const invoice = paidInvoice || paymentForOrder;
      setPaymentForOrder(null);
      setIsBillAndPayFlow(false);
      if (invoice) {
          const customer = customersList.find(c => c.id === invoice.customerId);
          handleDocumentPrint(invoice, 'invoice', customer).catch(err => toast.error('No se pudo imprimir: ' + err.message));
      }
  };

  return (
    <div className="pb-4 h-full">

      {/* Shell — Desktop: 2-panel grid | Mobile: single scroll */}
      {/* Desktop Layout */}
      <div className="hidden lg:grid grid-rows-[auto_1fr_auto] h-[calc(100vh-8.5rem)] card overflow-hidden text-ink">
        <TopBar badge={isDistributor ? 'Distribuidor' : null}>
            {isDistributor && (
                <>
                    <span className={badgeClass(openShift ? 'success' : 'neutral', 'sm')}>{openShift ? 'Turno abierto' : 'Sin turno abierto'}</span>
                    <Button size="sm" variant="secondary" onClick={() => setAdminPinAction(openShift ? 'closeTurno' : 'openShift')}>{openShift ? 'Cerrar turno' : 'Abrir turno'}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowCierreReports(true)}>Reportes de caja</Button>
                </>
            )}
        </TopBar>

        <div className="grid grid-cols-[1fr_320px] overflow-hidden">
          <div className="flex flex-col p-4 pb-0 bg-surface-muted overflow-hidden">
            <HeaderFields idPrefix="pos-d" comprobante={selectedComprobante.value} setComprobante={setComprobante} options={comprobanteOptions} ncfPreview={selectedComprobante.preview} condicion={condicion} setCondicion={setCondicion} />
            {comprobanteOptions.length === 1 && (
              <p className="mt-2 text-xs text-ink-muted">
                Solo puedes emitir ventas sin valor fiscal: no hay talonarios NCF ni secuencias e-CF activas.{' '}
                <button type="button" className="font-medium text-brand-600 dark:text-brand-400 hover:underline" onClick={() => setView?.('settings')}>Configurar comprobantes</button>
              </p>
            )}
            <SearchBar productRef={productRefDesktop} onAdd={addProduct} catalog={catalog} barcodeScan={barcodeScan} setBarcodeScan={setBarcodeScan} handleBarcodeScan={handleBarcodeScan} isConnected={isConnected} linkedDeviceName={linkedDeviceName} disconnectDevice={disconnectDevice} initSession={initSession} setShowScannerModal={setShowScannerModal} />
            <DataGrid rows={rows} onQty={onQty} onDisc={onDisc} onPrice={onPrice} onDelete={onDelete} onDesc={onDesc} onAddEmpty={() => addProduct(null)} />
          </div>
          <div className="flex flex-col gap-5 p-5 bg-surface border-l border-line overflow-y-auto custom-scrollbar">
            {/* Cliente */}
            <div className="relative">
              <div className="flex justify-between items-center mb-2">
                 <label htmlFor="pos-d-cliente" className="text-xs font-medium text-ink-muted">Cliente <kbd className="ml-1 font-mono text-[11px] text-ink-muted">F3</kbd></label>
                 <button onClick={() => setShowAddCustomerModal(true)} aria-label="Nuevo cliente" title="Nuevo cliente" className="modal-close w-7 h-7 text-brand-600 dark:text-brand-400"><UserPlus size={16}/></button>
              </div>
              <div className="relative">
                 <input id="pos-d-cliente" ref={customerRefDesktop} type="text" value={customerSearchTerm} onChange={(e) => handleCustomerSearchChange(e.target.value)} onFocus={() => setIsCustomerDropdownOpen(true)} onBlur={() => setTimeout(() => setIsCustomerDropdownOpen(false), 150)} placeholder="Nombre, RNC o código" className="input-base pr-8" />
                 {customerSearchTerm && (<button type="button" onClick={clearCustomerSelection} className="absolute inset-y-0 right-0 px-2 text-ink-muted hover:text-gray-600"><XCircle size={16} /></button>)}
                 {isCustomerDropdownOpen && customerOptions.length > 0 && (
                     <ul className="absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-surface dark:bg-gray-800 border border-line dark:border-gray-700 rounded-xl shadow-lg">
                         <li key="unselected"><button type="button" onMouseDown={(e) => { e.preventDefault(); clearCustomerSelection(); setIsCustomerDropdownOpen(false); }} className="w-full text-left px-3 py-2.5 hover:bg-surface-muted dark:hover:bg-gray-700 border-b border-line dark:border-gray-700/50"><span className="text-sm font-medium text-ink-soft dark:text-gray-300">Consumidor final</span></button></li>
                         {customerOptions.map((customer) => (<li key={customer.id}><button type="button" onMouseDown={(e) => { e.preventDefault(); handleCustomerSelect(customer); }} className="w-full text-left px-3 py-2 hover:bg-brand-50 dark:hover:bg-brand-900/30 transition-colors"><p className="font-medium text-sm text-ink dark:text-white">{customer.name || 'Sin nombre'}</p><p className="text-xs text-ink-muted font-mono mt-0.5">{[customer.customerCode ? `Cod: ${customer.customerCode}` : null, customer.rnc ? `RNC: ${customer.rnc}` : null].filter(Boolean).join(' · ')}</p></button></li>))}
                     </ul>
                 )}
                 {isCustomerDropdownOpen && customerOptions.length === 0 && (<div className="absolute z-50 left-0 right-0 mt-1 bg-surface dark:bg-gray-800 border border-line dark:border-gray-700 rounded-xl shadow-md px-3 py-2 text-sm text-ink-muted">No se encontraron clientes.</div>)}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-ink-muted mb-2">Forma de pago</div>
              <PayMethods active={payMethod} setActive={setPayMethod} disabled={isCredit} />
              {isCredit && <p className="mt-2 text-xs text-ink-muted">Venta a crédito: el cobro se registra luego en Cuentas por Cobrar.</p>}
            </div>
            <div>
              <label htmlFor="pos-d-desc" className="block text-xs font-medium text-ink-muted mb-2">Descuento general</label>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <input id="pos-d-desc" className="input-base w-24 pr-7 text-right tabular-nums" type="number" min="0" max="100" value={globalDisc} onChange={e => setGlobalDisc(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))} />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-ink-muted font-bold">%</span>
                </div>
              </div>
            </div>
            <Totals rows={rows} globalDisc={globalDisc} onSubmit={handleProcessOrder} isSubmitting={isSubmitting} submitLabel={isCredit ? 'Registrar venta a crédito' : 'Cobrar y facturar'} />
          </div>
        </div>
        <StatusBar rows={rows} payMethod={payMethod} condicion={condicion} comprobanteLabel={selectedComprobante.label} userLabel={[currentUserProfile?.name, currentUserProfile?.role].filter(Boolean).join(' · ')} />
      </div>

      {/* Mobile Layout — single scrollable column */}
      <div className="lg:hidden flex flex-col h-full bg-surface text-ink -mx-4 -mt-4">
        {/* Mobile TopBar */}
        <TopBar>
          {isDistributor && (
            <Button size="sm" variant="secondary" onClick={() => setAdminPinAction(openShift ? 'closeTurno' : 'openShift')}>{openShift ? 'Cerrar turno' : 'Abrir turno'}</Button>
          )}
        </TopBar>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar pb-44">
          {/* Search */}
          <div className="p-3">
            <SearchBar productRef={productRefMobile} onAdd={addProduct} catalog={catalog} barcodeScan={barcodeScan} setBarcodeScan={setBarcodeScan} handleBarcodeScan={handleBarcodeScan} isConnected={isConnected} linkedDeviceName={linkedDeviceName} disconnectDevice={disconnectDevice} initSession={initSession} setShowScannerModal={setShowScannerModal} />
          </div>

          {/* Product cards */}
          <div className="px-3">
            <DataGrid rows={rows} onQty={onQty} onDisc={onDisc} onPrice={onPrice} onDelete={onDelete} onDesc={onDesc} onAddEmpty={() => addProduct(null)} />
          </div>

          {/* Compact options row */}
          <div className="px-3 mt-3 space-y-3">
            {/* Cliente inline */}
            <div className="relative">
              <div className="flex justify-between items-center mb-1.5">
                <label htmlFor="pos-m-cliente" className="text-xs font-medium text-ink-muted">Cliente</label>
                <button onClick={() => setShowAddCustomerModal(true)} aria-label="Nuevo cliente" title="Nuevo cliente" className="modal-close w-8 h-8 text-brand-600 dark:text-brand-400"><UserPlus size={16}/></button>
              </div>
              <div className="relative">
                <input id="pos-m-cliente" ref={customerRefMobile} type="text" value={customerSearchTerm} onChange={(e) => handleCustomerSearchChange(e.target.value)} onFocus={() => setIsCustomerDropdownOpen(true)} onBlur={() => setTimeout(() => setIsCustomerDropdownOpen(false), 150)} placeholder="Nombre, RNC o código" className="input-base pr-8" />
                {customerSearchTerm && (<button type="button" onClick={clearCustomerSelection} className="absolute inset-y-0 right-0 px-2 text-ink-muted"><XCircle size={16} /></button>)}
                {isCustomerDropdownOpen && customerOptions.length > 0 && (
                    <ul className="absolute z-50 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-surface dark:bg-gray-800 border border-line dark:border-gray-700 rounded-xl shadow-lg">
                        <li key="unselected"><button type="button" onMouseDown={(e) => { e.preventDefault(); clearCustomerSelection(); setIsCustomerDropdownOpen(false); }} className="w-full text-left px-3 py-2.5 hover:bg-surface-muted dark:hover:bg-gray-700 border-b border-line dark:border-gray-700/50"><span className="text-sm text-ink-soft dark:text-gray-300">Consumidor final</span></button></li>
                        {customerOptions.map((customer) => (<li key={customer.id}><button type="button" onMouseDown={(e) => { e.preventDefault(); handleCustomerSelect(customer); }} className="w-full text-left px-3 py-2 hover:bg-brand-50 dark:hover:bg-brand-900/30"><p className="font-bold text-sm text-ink dark:text-white">{customer.name}</p><p className="text-xs text-ink-muted font-mono">{customer.rnc ? `RNC: ${customer.rnc}` : ''}</p></button></li>))}
                    </ul>
                )}
              </div>
            </div>

            {/* Pay method + discount inline */}
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <div className="text-xs font-medium text-ink-muted mb-1.5">Forma de pago</div>
                <PayMethods active={payMethod} setActive={setPayMethod} disabled={isCredit} />
              </div>
              <div>
                <label htmlFor="pos-m-desc" className="block text-xs font-medium text-ink-muted mb-1.5">Desc.</label>
                <div className="relative">
                  <input id="pos-m-desc" className="input-base w-20 pr-6 text-right tabular-nums" type="number" min="0" max="100" value={globalDisc} onChange={e => setGlobalDisc(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))} />
                  <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-ink-muted font-bold">%</span>
                </div>
              </div>
            </div>

            {/* Header fields collapsed */}
            <details className="group">
              <summary className="text-sm font-medium text-ink-soft cursor-pointer select-none flex items-center gap-1">
                <ChevronDown size={12} className="transition-transform group-open:rotate-180" />
                Datos fiscales · {selectedComprobante.label}
              </summary>
              <div className="mt-2">
                <HeaderFields idPrefix="pos-m" comprobante={selectedComprobante.value} setComprobante={setComprobante} options={comprobanteOptions} ncfPreview={selectedComprobante.preview} condicion={condicion} setCondicion={setCondicion} />
              </div>
            </details>
          </div>
        </div>

        {/* Sticky bottom total bar */}
        <div className="sticky bottom-0 left-0 right-0 glass border-t border-line p-3 pb-safe z-30">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3 text-sm">
              <span className="text-ink-muted">{rows.length} artículo{rows.length !== 1 ? 's' : ''}</span>
              <span className="text-xl font-semibold text-ink tabular-nums">{fmt(computeTotals(rows, globalDisc).total)}</span>
            </div>
          </div>
          <Button size="lg" className="w-full" onClick={handleProcessOrder} disabled={rows.length === 0 || isSubmitting}>
            {isSubmitting ? 'Procesando…' : (isCredit ? 'Registrar venta a crédito' : 'Cobrar y facturar')}
          </Button>
        </div>
      </div>


            {paymentForOrder && (
          <PaymentModal 
              invoice={paymentForOrder} 
              customers={customersList}
              companyProfile={companyProfile} 
              onClose={() => {
                  setPaymentForOrder(null);
                  if (isBillAndPayFlow) setIsBillAndPayFlow(false);
              }} 
              onSuccess={handlePaymentSuccess}
              useApi={true}
          />
      )}
      
      {showScannerModal && (
          <ScannerLinkModal 
              onClose={() => setShowScannerModal(false)}
          />
      )}

      {showAddCustomerModal && (
          <CustomerModal 
              customer={{}}
              onClose={() => setShowAddCustomerModal(false)}
              onSave={async (newCustomer) => {
                  try {
                      const result = await api.customers.create(newCustomer);
                      setShowAddCustomerModal(false);
                      setSelectedCustomer(result);
                      setCustomerSearchTerm(result.name + (result.rnc ? ` - ${result.rnc}` : ''));
                      toast.success("Cliente añadido con éxito.");
                  } catch (err) {
                      toast.error("No se pudo crear el cliente.");
                  }
              }}
              companyProfile={companyProfile}
          />
      )}

      {adminPinAction && (
        <AdminPinAuthModal 
          adminUser={adminUser}
          currentUserProfile={currentUserProfile}
          onClose={handleAdminPinSuccess}
        />
      )}

      {showOpenShift && (
        <OpenShiftModal
          currentUserProfile={currentUserProfile}
          companyProfile={companyProfile}
          existingShifts={cashShifts}
          registerId={selectedRegisterId}
          onClose={(changed) => { setShowOpenShift(false); if (changed) refetchShifts(); }}
          useApi={true}
        />
      )}

      {showCierreCajaModal && (
        <CierreCajaModal 
          currentUserProfile={currentUserProfile} 
          companyProfile={companyProfile} 
          onClose={() => { setShowCierreCajaModal(false); refetchShifts(); }} 
          useApi={true}
        />
      )}

      {showCierreReports && (
        <CierreCajaReportModal 
          onClose={() => setShowCierreReports(false)} 
          currentUserProfile={currentUserProfile} 
          companyProfile={companyProfile} 
          useApi={true}
        />
      )}

      {showCloseShift && openShift && (
        <CloseShiftModal
          currentUserProfile={currentUserProfile}
          companyProfile={companyProfile}
          invoices={invoicesData}
          movements={currentShiftMovements}
          openShift={openShift}
          registerId={selectedRegisterId}
          onClose={(changed) => { setShowCloseShift(false); if (changed) refetchShifts(); }}
          useApi={true}
        />
      )}

      {/* Leyenda de atajos (siempre oscura) */}
      {isDistributor && (
        <div className="fixed bottom-0 left-0 right-0 bg-night-900/95 backdrop-blur-sm text-gray-300 py-1.5 px-4 hidden lg:flex justify-center items-center gap-6 text-xs z-[100] border-t border-gray-800">
          {[['F2', 'Buscar artículo'], ['F3', 'Buscar cliente'], ['F9', isCredit ? 'Cambiar a contado' : 'Cambiar a crédito'], ['F10', isCredit ? 'Registrar a crédito' : 'Cobrar y facturar'], ['Esc', 'Limpiar venta']].map(([k, label]) => (
            <div key={k} className={`flex items-center gap-1.5 ${k === 'F10' ? 'text-success-300 font-semibold' : ''}`}>
              <kbd className="bg-gray-800 text-gray-100 px-1.5 py-0.5 rounded border border-gray-700 min-w-[24px] text-center font-mono">{k}</kbd>
              <span>{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
