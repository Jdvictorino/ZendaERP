import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import api from '../api/client.js';
import { useApiCrud } from '../hooks/useApi.js';
import { 
  Search, Plus, Trash2, Receipt, ChevronDown, Check, X, Bell, User, ShoppingCart, Smartphone, XCircle, UserPlus, Archive 
} from 'lucide-react';
import toast from 'react-hot-toast';
import PostOrderActionsModal from '../components/modals/PostOrderActionsModal.jsx';
import BillingTypeModal from '../components/modals/BillingTypeModal.jsx';
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

const TAX_RATE = 0.18;

const fmt = (n) =>
  "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Sub-components ───────────────────────────────────────────────────────────

function TopBar({ children, invoiceNum }) {
  return (
    <div className="flex items-center justify-between px-3 sm:px-4 h-12 sm:h-14 glass border-b border-gray-200/50 dark:border-gray-800/50">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <div className="flex items-center gap-1.5 text-brand-600 dark:text-brand-400 flex-shrink-0">
          <Receipt size={18} />
          <span className="hidden sm:inline text-lg font-bold tracking-tight">Zenda ERP</span>
        </div>
        <span className="bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold flex-shrink-0">POS</span>
        {invoiceNum && (
          <span className="text-xs font-medium text-gray-400 dark:text-gray-500 truncate">#{invoiceNum}</span>
        )}
      </div>
      {children && (
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
              {children}
          </div>
      )}
    </div>
  );
}

function HeaderFields({ date, setDate, ncf, setNcf, condicion, setCondicion }) {
  const inputCls = "w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all";
  const selectCls = inputCls + " appearance-none";
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
      <Field label="Fecha">
        <input className={inputCls} type="date" value={date} onChange={e => setDate(e.target.value)} />
      </Field>
      <Field label="Condición">
        <div className="relative">
          <select className={selectCls} value={condicion} onChange={e => setCondicion(e.target.value)}>
            <option>Contado</option>
            <option>Crédito 30d</option>
            <option>Crédito 60d</option>
          </select>
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><ChevronDown size={14} /></div>
        </div>
      </Field>
      <Field label="Comprobante">
        <div className="relative">
          <select className={selectCls} value={ncf} onChange={(e) => setNcf(e.target.value)}>
            <option value="00">Sin comprobante</option>
            <option value="01">Crédito fiscal</option>
            <option value="02">Consumo</option>
            <option value="11">Régimen especial</option>
          </select>
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><ChevronDown size={14} /></div>
        </div>
      </Field>
      <Field label="NCF / Folio">
        <input className={inputCls} defaultValue={ncf} />
      </Field>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.08em]">{label}</label>
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
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><Search size={18} /></div>
          <input
            ref={productRef}
            className="w-full text-sm pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Buscar producto…"
            value={query}
            onChange={e => handleInput(e.target.value)}
            onFocus={() => { if (results.length) setOpen(true); }}
            onKeyDown={handleKeyDown}
          />
        </div>
        <button 
          className="flex items-center gap-1.5 px-4 py-2.5 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-xl transition-colors shrink-0 active:scale-95 shadow-sm"
          onClick={() => {
            if (open && results[highlightIdx]) { pick(results[highlightIdx]); }
            else if (query.trim()) {
                const p = catalog.find(x => (x.name && x.name.toLowerCase().includes(query.toLowerCase())) || x.barcode === query || x.productCode === query);
                if (p) pick(p); else onAdd(null);
                setQuery(""); setOpen(false);
            } else { onAdd(null); }
          }}>
          <Plus size={16} /><span className="hidden sm:inline">Agregar</span>
        </button>
        {open && (
          <div className="absolute top-[calc(100%+8px)] left-0 right-0 sm:right-32 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden max-h-60 overflow-y-auto">
            {results.map((p, i) => (
              <div key={p.id || i} className={`flex flex-col px-3 py-2.5 cursor-pointer transition-colors ${i === highlightIdx ? 'bg-brand-50 dark:bg-brand-900/50' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`} onClick={() => pick(p)} onMouseEnter={() => setHighlightIdx(i)}>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-gray-900 dark:text-white">{p.name}</span>
                  {i === highlightIdx && <Check size={14} className="text-brand-600" />}
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400">{p.productCode || p.barcode || '-'} — {fmt(p.salePrice || p.price)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="hidden lg:flex gap-2">
         <input type="text" placeholder="Escanear código..." value={barcodeScan || ''} onChange={e => setBarcodeScan(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleBarcodeScan(barcodeScan.trim()); }} className="w-48 text-sm p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-500 bg-white dark:bg-gray-800" />
         {isConnected ? (
             <div className="flex items-center bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 rounded-xl overflow-hidden shadow-sm shrink-0 border border-green-200 dark:border-green-800/50">
                 <button onClick={() => setShowScannerModal(true)} className="flex items-center gap-1.5 px-3 py-2.5 hover:bg-green-200 dark:hover:bg-green-800/50 transition-colors text-sm" title="Escáner remoto activo"><Smartphone size={16} /><span className="font-semibold hidden xl:inline">{linkedDeviceName || 'Conectado'}</span></button>
                 <button onClick={() => disconnectDevice()} className="px-2 py-2.5 hover:bg-green-200 dark:hover:bg-green-800/50 transition-colors border-l border-green-200/50 dark:border-green-800 text-sm" title="Desvincular"><XCircle size={16} /></button>
             </div>
         ) : (
             <button onClick={() => { initSession(); setShowScannerModal(true); }} className="flex items-center gap-1.5 bg-brand-50 border border-brand-200 text-brand-700 dark:bg-brand-900/30 dark:border-brand-800/50 dark:text-brand-400 px-3 py-2.5 rounded-xl hover:bg-brand-100 transition-colors shrink-0 text-sm"><Smartphone size={16} /><span className="hidden xl:inline">Vincular</span></button>
         )}
      </div>
    </div>
  );
}

function MobileGridCard({ row, index, onQty, onDisc, onPrice, onDelete }) {
  const total = row.price * row.qty * (1 - row.disc / 100);
  const qtyBtnCls = "w-8 h-8 flex justify-center items-center rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-bold active:scale-90 transition-transform";
  return (
    <div className="flex items-start gap-3 p-3 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{row.desc}</p>
        <p className="text-[11px] text-gray-400 mt-0.5 font-mono">{row.code || '—'}</p>
        <div className="flex items-center gap-3 mt-2">
          <div className="flex items-center gap-1.5">
            <button className={qtyBtnCls} onClick={() => onQty(row.id, -1)}>−</button>
            <span className="text-sm font-bold w-6 text-center">{row.qty}</span>
            <button className={qtyBtnCls} onClick={() => onQty(row.id, 1)}>+</button>
          </div>
          <span className="text-xs text-gray-400">×</span>
          <input className="w-20 text-sm font-medium bg-gray-50 dark:bg-gray-700 rounded-lg px-2 py-1 border-0 focus:ring-2 focus:ring-brand-500 text-right" type="number" min="0" value={row.price} onChange={e => onPrice(row.id, e.target.value)} />
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <span className="text-base font-bold text-brand-600 dark:text-brand-400">{fmt(total)}</span>
        <button className="p-1.5 text-red-400 hover:text-red-600 rounded-lg active:scale-90 transition-all" onClick={() => onDelete(row.id)}><Trash2 size={16} /></button>
      </div>
    </div>
  );
}

function GridRow({ row, index, onQty, onDisc, onPrice, onDelete }) {
  const total = row.price * row.qty * (1 - row.disc / 100);
  const tax = row.taxable ? total - (total / (1 + TAX_RATE)) : 0;
  return (
    <tr className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors group">
      <td className="p-3 text-center text-xs text-gray-400">{index + 1}</td>
      <td className="p-3 font-medium text-sm text-gray-800 dark:text-gray-200">{row.desc}</td>
      <td className="p-3 text-xs text-gray-500 dark:text-gray-400">{row.code}</td>
      <td className="p-3">
        <div className="flex items-center gap-2">
          <button className="w-6 h-6 flex justify-center items-center rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors" onClick={() => onQty(row.id, -1)}>−</button>
          <span className="text-sm font-medium w-6 text-center">{row.qty}</span>
          <button className="w-6 h-6 flex justify-center items-center rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors" onClick={() => onQty(row.id, 1)}>+</button>
        </div>
      </td>
      <td className="p-3"><div className="flex items-center"><input className="w-14 text-sm bg-transparent border border-transparent hover:border-gray-200 dark:hover:border-gray-600 focus:border-brand-500 rounded px-1.5 py-1 focus:outline-none transition-colors" type="number" min="0" max="100" value={row.disc} onChange={e => onDisc(row.id, e.target.value)} /><span className="text-xs text-gray-400 ml-0.5">%</span></div></td>
      <td className="p-3 text-right"><input className="w-20 text-sm text-right bg-transparent border border-transparent hover:border-gray-200 dark:hover:border-gray-600 focus:border-brand-500 rounded px-1.5 py-1 focus:outline-none transition-colors" type="number" min="0" value={row.price} onChange={e => onPrice(row.id, e.target.value)} /></td>
      <td className={"p-3 text-right text-xs " + (row.taxable ? "text-gray-500" : "text-gray-300 dark:text-gray-600")}>{row.taxable ? fmt(tax) : "—"}</td>
      <td className="p-3 text-right font-semibold text-brand-600 dark:text-brand-400">{fmt(total)}</td>
      <td className="p-3 text-center"><button className="p-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => onDelete(row.id)}><Trash2 size={16} /></button></td>
    </tr>
  );
}

function DataGrid({ rows, onQty, onDisc, onPrice, onDelete, onAddEmpty }) {
  const thCls = "px-3 py-2.5 text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider";
  return (
    <div className="flex flex-col flex-1 border border-gray-200 dark:border-gray-700 rounded-2xl bg-white dark:bg-gray-800 overflow-hidden mt-2">
      <div className="flex-1 overflow-auto custom-scrollbar">
        {/* Mobile cards */}
        <div className="lg:hidden flex flex-col gap-2 p-3">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-gray-400">
              <ShoppingCart size={32} className="text-gray-300 dark:text-gray-600" />
              <p className="text-sm">Sin productos agregados.</p>
            </div>
          ) : rows.map((r, i) => (
            <MobileGridCard key={r.id} row={r} index={i} onQty={onQty} onDisc={onDisc} onPrice={onPrice} onDelete={onDelete} />
          ))}
        </div>
        {/* Desktop table */}
        <table className="w-full text-left border-collapse hidden lg:table">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
              <th className={`${thCls} w-[40px] text-center`}>#</th>
              <th className={thCls}>Producto / Servicio</th>
              <th className={`${thCls} w-[100px]`}>Código</th>
              <th className={`${thCls} w-[110px]`}>Cant.</th>
              <th className={`${thCls} w-[80px]`}>Desc%</th>
              <th className={`${thCls} w-[100px] text-right`}>Precio unit.</th>
              <th className={`${thCls} w-[90px] text-right`}>ITBIS</th>
              <th className={`${thCls} w-[110px] text-right`}>Total</th>
              <th className={`${thCls} w-[50px] text-center`}></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan="9" className="p-8 text-center text-sm text-gray-400">
                <div className="flex flex-col items-center justify-center gap-2">
                  <ShoppingCart size={32} className="text-gray-300 dark:text-gray-600" />
                  <p>Sin productos agregados.</p>
                </div>
              </td></tr>
            ) : rows.map((r, i) => (
              <GridRow key={r.id} row={r} index={i} onQty={onQty} onDisc={onDisc} onPrice={onPrice} onDelete={onDelete} />
            ))}
          </tbody>
        </table>
      </div>
      <button className="flex items-center gap-2 px-4 py-2.5 border-t border-dashed border-gray-200 dark:border-gray-700 text-xs font-bold text-brand-600 dark:text-brand-400 hover:bg-gray-50 dark:hover:bg-gray-800/80 transition-colors w-full active:scale-[0.98]" onClick={onAddEmpty}>
        <Plus size={14} /> Agregar línea vacía
      </button>
    </div>
  );
}

function ClientCard({ customer }) {
  if (!customer) {
    return (
      <div className="flex items-center gap-3 p-2.5 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-lg cursor-pointer hover:border-indigo-300 transition-colors">
        <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-400 flex justify-center items-center font-bold text-sm">?</div>
        <div className="text-sm text-gray-500 italic">Consumidor Final</div>
      </div>
    );
  }

  const initials = customer.name?.substring(0, 2).toUpperCase() || "CL";
  const doc = customer.rnc || customer.identificationNumber || "";
  
  return (
    <div className="flex items-center gap-3 p-2.5 border border-indigo-100 dark:border-indigo-900/50 bg-indigo-50/50 dark:bg-indigo-900/20 rounded-lg cursor-pointer hover:border-indigo-300 transition-colors">
      <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300 flex justify-center items-center font-bold text-sm tracking-widest">{initials}</div>
      <div className="flex flex-col">
        <span className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">{customer.name}</span>
        {doc && <span className="text-[11px] text-gray-500 mt-0.5 font-mono">RNC/Doc: {doc}</span>}
      </div>
      <div className="ml-auto text-gray-400">
        <ChevronDown size={16} />
      </div>
    </div>
  );
}

function PayMethods({ active, setActive }) {
  const methods = ["Efectivo", "Tarjeta", "Transferencia", "Mixto"];
  return (
    <div className="grid grid-cols-4 sm:grid-cols-2 gap-1.5 sm:gap-2">
      {methods.map(m => (
        <button key={m} className={`py-2 text-[12px] sm:text-[13px] font-bold rounded-xl border transition-all active:scale-95 ${active === m ? "bg-brand-50 dark:bg-brand-900/30 border-brand-200 dark:border-brand-700 text-brand-700 dark:text-brand-300 shadow-sm" : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400"}`} onClick={() => setActive(m)}>{m}</button>
      ))}
    </div>
  );
}

function Totals({ rows, globalDisc, onSubmit, isSubmitting }) {
  const rawTotal = rows.reduce((a, r) => a + r.price * r.qty * (1 - r.disc / 100), 0);
  const discAmt = rawTotal * (globalDisc / 100);
  const finalTotal = rawTotal - discAmt;
  const tax = rows.filter(r => r.taxable).reduce((a, r) => { const rowTotal = r.price * r.qty * (1 - r.disc / 100); return a + (rowTotal - (rowTotal / (1 + TAX_RATE))); }, 0) * (1 - globalDisc / 100);
  const subtotal = finalTotal - tax;
  return (
    <div className="mt-auto flex flex-col pt-4">
      <TotalRow label="Subtotal" value={fmt(subtotal)} />
      <TotalRow label={`Desc. (${globalDisc}%)`} value={`-${fmt(discAmt)}`} valueClass="text-red-500" />
      <TotalRow label="ITBIS (18%)" value={fmt(tax)} />
      <div className="flex justify-between items-center mt-3 p-4 bg-gray-900 dark:bg-black rounded-2xl shadow-inner">
        <span className="text-gray-300 text-sm font-medium">Total</span>
        <span className="text-white text-2xl font-extrabold tracking-tight">{fmt(finalTotal)}</span>
      </div>
      <button id="pos-pay-button" onClick={onSubmit} disabled={rows.length === 0 || isSubmitting} className="mt-3 w-full bg-green-600 text-white py-3.5 rounded-2xl font-bold hover:bg-green-700 disabled:bg-gray-400 transition-colors active:scale-[0.98] shadow-lg shadow-green-600/20">
          {isSubmitting ? 'Procesando...' : 'Procesar Pedido'}
      </button>
    </div>
  );
}

function TotalRow({ label, value, valueClass = "" }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700/50 last:border-0">
      <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">{label}</span>
      <span className={`text-sm font-semibold text-gray-800 dark:text-gray-200 ${valueClass}`}>{value}</span>
    </div>
  );
}

function StatusBar({ rows, payMethod, condicion }) {
  return (
    <div className="hidden lg:flex items-center justify-between px-5 h-10 bg-gray-50 dark:bg-gray-800/80 border-t border-gray-200 dark:border-gray-700">
      <div className="flex gap-2">
        <Chip ok>{rows.length} item{rows.length !== 1 ? "s" : ""}</Chip>
        <Chip ok>Gravada</Chip>
        <Chip warn>{payMethod}</Chip>
        <Chip>{condicion}</Chip>
      </div>
      <span className="text-[11px] font-medium text-gray-400">Zenda ERP · Caja · Admin</span>
    </div>
  );
}

function Chip({ children, ok, warn }) {
  const baseClasses = "text-[10px] font-semibold px-2 py-0.5 rounded-full border";
  let classes = "bg-gray-100 border-gray-200 text-gray-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300";
  
  if (ok) {
    classes = "bg-green-50 border-green-200 text-green-700 dark:bg-green-900/30 dark:border-green-800/50 dark:text-green-400";
  } else if (warn) {
    classes = "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/30 dark:border-amber-800/50 dark:text-amber-400";
  }
  
  return (
    <span className={`${baseClasses} ${classes}`}>
      {children}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function POSBillingOrdersView({ companyProfile, currentUserProfile, setView, adminUser }) {
  const productSearchInputRef = useRef(null);
  const customerSearchInputRef = useRef(null);

  const { data: pData } = useApiCrud('/products');
  const { data: cData } = useApiCrud('/customers');
  const { data: shiftsData, refetch: refetchShifts } = useApiCrud('/shifts');
  const catalog = Array.isArray(pData) ? pData : [];
  const customersList = Array.isArray(cData) ? cData : [];
  const { data: iData } = useApiCrud('/invoices');
  const invoicesData = Array.isArray(iData) ? iData : (iData?.data || []);

  const [rows, setRows] = useState([]);
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [condicion, setCondicion] = useState("Contado");
  const [payMethod, setPayMethod] = useState("Efectivo");
  const [globalDisc, setGlobalDisc] = useState(0);
  const [invoiceNum, setInvoiceNum] = useState("FC-00000");
  const [ncfType, setNcfType] = useState("00");
  const [toastNotif, setToastNotif] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);

  // Modal & Processing states
  const [paymentForOrder, setPaymentForOrder] = useState(null);
  const [isBillAndPayFlow, setIsBillAndPayFlow] = useState(false);
  const [createdOrder, setCreatedOrder] = useState(null);
  const [billingOrder, setBillingOrder] = useState(null);

  // Modal states
  const [showOpenShift, setShowOpenShift] = useState(false);
  const [showCloseShift, setShowCloseShift] = useState(false);
  const [showCierreCajaModal, setShowCierreCajaModal] = useState(false);
  const [showCierreReports, setShowCierreReports] = useState(false);
  const [adminPinAction, setAdminPinAction] = useState(null); // 'openShift' | 'closeShift'
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showBillingModal, setShowBillingModal] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [showAdminPinModal, setShowAdminPinModal] = useState(false);

  // Sounds (stubs if not defined)
  const playSuccessSound = () => {};
  const playErrorSound = () => {};

  // Settings modes
  const isDistributor = companyProfile?.orderMode === 'distributor' || companyProfile?.settings?.orderMode === 'distributor';

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

  const handleAdminPinSuccess = useCallback(async () => {
    setShowAdminPinModal(false);
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
        return;
      }

      if (isModalOpen) return;

      if (e.key === 'F2') {
        e.preventDefault();
        productSearchInputRef.current?.focus();
      } else if (e.key === 'F3') {
        e.preventDefault();
        customerSearchInputRef.current?.focus();
      } else if (e.key === 'F9') {
        e.preventDefault();
        const next = condicion === 'Contado' ? 'Crédito 30d' : 'Contado';
        setCondicion(next);
        toast(`Condición: ${next}`, { icon: '💳' });
      } else if (e.key === 'F10') {
        e.preventDefault();
        const payBtn = document.getElementById('pos-pay-button');
        if (payBtn && !payBtn.disabled) {
            payBtn.click();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [paymentForOrder, showAddCustomerModal, adminPinAction, showScannerModal, showAdminPinModal, showOpenShift, showCloseShift, showCierreCajaModal, showCierreReports, condicion]);

  // Focus product search on mount
  useEffect(() => {
    if (isDistributor) {
      setTimeout(() => productSearchInputRef.current?.focus(), 800);
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
               id: Date.now(), 
               originalId: found.id,
               desc: found.name, 
               code: found.productCode || found.barcode || "-", 
               price: found.salePrice || found.price || 0, 
               qty: 1, 
               disc: 0, 
               taxable: found.hasTax ?? true 
             }];
          });
          setToastNotif({ msg: `Agregado: ${found.name}`, type: "ok" });
          setTimeout(() => setToastNotif(null), 3000);
      } else {
          setToastNotif({ msg: `No encontrado: ${codeStr}`, type: "warn" });
          setTimeout(() => setToastNotif(null), 3000);
      }
      setBarcodeScan('');
  }, [catalog]);

  useEffect(() => {
      registerScanHandler(handleBarcodeScan);
      return () => unregisterScanHandler();
  }, [handleBarcodeScan, registerScanHandler, unregisterScanHandler]);

  const showToast = (msg, type = "ok") => {
    setToastNotif({ msg, type });
    setTimeout(() => setToastNotif(null), 3000);
  };

  const addProduct = (p) => {
    if (!p) {
      setRows(r => [...r, { id: Date.now(), desc: "Nuevo producto", code: "", price: 0, qty: 1, disc: 0, taxable: true }]);
    } else {
      setRows(r => {
        const existing = r.find(x => x.originalId === p.id);
        if (existing) return r.map(x => x.originalId === p.id ? { ...x, qty: x.qty + 1 } : x);
        const codeStr = p.productCode || p.barcode || "-";
        const priceNum = p.salePrice || p.price || 0;
        const taxable = p.hasTax ?? true;
        return [...r, { 
          id: Date.now(), 
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

  const handleNew = () => {
    setRows([]);
    setInvoiceNum("FC-" + Math.floor(Math.random() * 90000) + 10000);
    setGlobalDisc(0);
    setSelectedCustomer(null);
    showToast("Nueva factura iniciada");
  };

  const handleCancel = () => {
    if (rows.length === 0 || window.confirm("¿Cancelar factura? Se perderán los cambios.")) {
      setRows([]);
      setSelectedCustomer(null);
      showToast("Factura cancelada", "warn");
    }
  };

  const handleProcessOrder = async () => {
    if (rows.length === 0) { showToast("Agrega al menos un producto", "warn"); return; }
    
    const ncfMap = { "00": "NoFiscal", "01": "B01", "02": "B02", "11": "NoFiscal" };
    const billingType = ncfMap[ncfType] || "NoFiscal";

    if (billingType === "B01") {
        if (!companyProfile?.ncfB01Prefix || (companyProfile.ncfB01SequenceEnd && companyProfile.ncfB01SequenceNext > companyProfile.ncfB01SequenceEnd)) {
            showToast("No hay NCF configurado o disponible para Crédito Fiscal.", "warn");
            return;
        }
        if (!selectedCustomer || (!selectedCustomer.identificationNumber && !selectedCustomer.rnc)) {
            showToast("El RNC es obligatorio para facturas de Crédito Fiscal.", "warn");
            return;
        }
    } else if (billingType === "B02") {
        if (!companyProfile?.ncfB02Prefix || (companyProfile.ncfB02SequenceEnd && companyProfile.ncfB02SequenceNext > companyProfile.ncfB02SequenceEnd)) {
            showToast("No hay NCF configurado o disponible para Consumo.", "warn");
            return;
        }
    }

    setIsSubmitting(true);
    
    // Calculate final actual tax logic
    const itemsData = rows.map(r => ({
      productId: r.originalId,
      variantId: null,
      productName: r.desc,
      quantity: parseInt(r.qty, 10),
      unitPrice: parseFloat(r.price) || 0,
      discountPercent: parseFloat(r.disc) || 0,
      taxRate: r.taxable ? (TAX_RATE * 100) : 0,
      customizationNotes: '',
      customImageUrls: [],
      variantInfo: null,
    }));

    const orderData = {
      customerId: selectedCustomer?.id || null,
      customerName: selectedCustomer ? selectedCustomer.name : 'Consumidor Final',
      items: itemsData,
      paymentMethod: payMethod,
      amountPaid: 0,
      deliveryType: 'store',
      notes: '',
      status: 'Pendiente',
    };

    try {
      showToast("Procesando pedido...");
      const result = await api.invoices.create(orderData);
      
      const finalOrder = { ...result, customerName: orderData.customerName };
      
      const rnc = selectedCustomer?.identificationNumber || selectedCustomer?.rnc || '';
      try {
          const billedResult = await api.invoices.bill(result.id, billingType, rnc);
          Object.assign(finalOrder, billedResult);
      } catch (billErr) {
          console.error("Error al facturar pedido automáticamente:", billErr);
          showToast("Pedido creado pero ocurrió un error al asignar NCF / Facturar.", "warn");
      }

      setPaymentForOrder(finalOrder);
      playSuccessSound();
      
      handleNew();
    } catch (err) {
      showToast("Error al procesar: " + err.message, "warn");
      playErrorSound();
    } finally {
      setIsSubmitting(false);
    }
  };

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

  const handleQuoteAction = () => {
      const customerDetails = customersList.find(c => c.id === createdOrder.customerId);
      handleDocumentPrint(createdOrder, 'quote', customerDetails);
      setCreatedOrder(null);
  };

  const handleBillAction = (andPay = false) => {
      setIsBillAndPayFlow(andPay);
      setBillingOrder(createdOrder);
      setCreatedOrder(null);
  };

  const handleFacturar = async (billingType, rnc) => {
      if (!billingOrder) return;
      
      try {
          await api.invoices.bill(billingOrder.id, billingType, rnc);
          playSuccessSound();
          toast.success('¡Pedido facturado!');

          if (isBillAndPayFlow) {
              const updatedInvoice = await api.invoices.get(billingOrder.id);
              setPaymentForOrder(updatedInvoice);
          } else {
              const customerDetails = customersList.find(c => c.id === billingOrder.customerId);
              handleDocumentPrint(billingOrder, 'invoice', customerDetails);
          }
      } catch (error) {
          console.error('Error al facturar:', error);
          playErrorSound();
          toast.error(error.message || 'No se pudo facturar.');
      }

      setBillingOrder(null);
      setIsBillAndPayFlow(false);
  };

  const handlePaymentSuccess = () => {
      setPaymentForOrder(null);
      setIsBillAndPayFlow(false);
  };

  return (
    <div className="pb-4 h-full">

      {/* Toast */}
      {toastNotif && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-sm font-medium shadow-lg border transition-all ${
          toastNotif.type === "warn" 
            ? "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-400" 
            : "bg-green-50 text-green-800 border-green-200 dark:bg-green-900/30 dark:border-green-800 dark:text-green-400"
        }`}>
          {toastNotif.msg}
        </div>
      )}

      {/* Shell — Desktop: 2-panel grid | Mobile: single scroll */}
      {/* Desktop Layout */}
      <div className="hidden lg:grid grid-rows-[auto_1fr_auto] h-[calc(100vh-6rem)] border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden bg-white dark:bg-gray-900 shadow-sm text-gray-800 dark:text-gray-200 font-sans">
        <TopBar invoiceNum={invoiceNum}>
            {isDistributor && (
                <>
                    {!openShift && (
                        <button className="bg-brand-50 dark:bg-brand-900/30 border border-brand-200 dark:border-brand-800 text-brand-700 dark:text-brand-400 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-brand-100 transition-colors" onClick={() => setAdminPinAction('openShift')}>Abrir Turno</button>
                    )}
                    {!!openShift && (
                      <button className="bg-brand-50 dark:bg-brand-900/30 border border-brand-200 dark:border-brand-800 text-brand-700 dark:text-brand-400 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-brand-100 transition-colors" onClick={() => setAdminPinAction('closeTurno')}>Cerrar Turno</button>
                    )}
                    <button className="text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white px-2 py-1.5 text-sm font-medium underline underline-offset-2" onClick={() => setShowCierreReports(true)}>Ver Reportes</button>
                </>
            )}
        </TopBar>

        <div className="grid grid-cols-[1fr_320px] overflow-hidden">
          <div className="flex flex-col p-4 pb-0 bg-gray-50/50 dark:bg-gray-900/50 overflow-hidden">
            <HeaderFields date={date} setDate={setDate} ncf={ncfType} setNcf={setNcfType} condicion={condicion} setCondicion={setCondicion} />
            <SearchBar productRef={productSearchInputRef} onAdd={addProduct} catalog={catalog} barcodeScan={barcodeScan} setBarcodeScan={setBarcodeScan} handleBarcodeScan={handleBarcodeScan} isConnected={isConnected} linkedDeviceName={linkedDeviceName} disconnectDevice={disconnectDevice} initSession={initSession} setShowScannerModal={setShowScannerModal} />
            <DataGrid rows={rows} onQty={onQty} onDisc={onDisc} onPrice={onPrice} onDelete={onDelete} onAddEmpty={() => addProduct(null)} />
          </div>
          <div className="flex flex-col gap-5 p-5 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 overflow-y-auto custom-scrollbar">
            {/* Cliente */}
            <div className="relative">
              <div className="flex justify-between items-center mb-2">
                 <div className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.08em]">Cliente</div>
                 <button onClick={() => setShowAddCustomerModal(true)} className="text-brand-600 hover:text-brand-700 dark:text-brand-400 active:scale-90 transition-transform"><UserPlus size={16}/></button>
              </div>
              <div className="relative">
                 <input ref={customerSearchInputRef} type="text" value={customerSearchTerm} onChange={(e) => handleCustomerSearchChange(e.target.value)} onFocus={() => setIsCustomerDropdownOpen(true)} onBlur={() => setTimeout(() => setIsCustomerDropdownOpen(false), 150)} placeholder="[F3] Buscar cliente…" className="w-full text-sm p-3 pr-8 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
                 {customerSearchTerm && (<button type="button" onClick={clearCustomerSelection} className="absolute inset-y-0 right-0 px-2 text-gray-400 hover:text-gray-600"><XCircle size={16} /></button>)}
                 {isCustomerDropdownOpen && customerOptions.length > 0 && (
                     <ul className="absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg">
                         <li key="unselected"><button type="button" onMouseDown={(e) => { e.preventDefault(); clearCustomerSelection(); setIsCustomerDropdownOpen(false); }} className="w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700/50"><span className="text-sm font-medium text-gray-700 dark:text-gray-300">Consumidor final</span></button></li>
                         {customerOptions.map((customer) => (<li key={customer.id}><button type="button" onMouseDown={(e) => { e.preventDefault(); handleCustomerSelect(customer); }} className="w-full text-left px-3 py-2 hover:bg-brand-50 dark:hover:bg-brand-900/30 transition-colors"><p className="font-medium text-sm text-gray-900 dark:text-white">{customer.name || 'Sin nombre'}</p><p className="text-[11px] text-gray-500 font-mono mt-0.5">{[customer.customerCode ? `Cod: ${customer.customerCode}` : null, customer.rnc ? `RNC: ${customer.rnc}` : null].filter(Boolean).join(' · ')}</p></button></li>))}
                     </ul>
                 )}
                 {isCustomerDropdownOpen && customerOptions.length === 0 && (<div className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-md px-3 py-2 text-sm text-gray-500">No se encontraron clientes.</div>)}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.08em] mb-2">Forma de pago</div>
              <PayMethods active={payMethod} setActive={setPayMethod} />
            </div>
            <div>
              <div className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.08em] mb-2">Descuento general</div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <input className="w-20 text-sm pl-3 pr-6 py-1.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500" type="number" min="0" max="100" value={globalDisc} onChange={e => setGlobalDisc(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))} />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 font-bold">%</span>
                </div>
              </div>
            </div>
            <Totals rows={rows} globalDisc={globalDisc} onSubmit={handleProcessOrder} isSubmitting={isSubmitting} />
          </div>
        </div>
        <StatusBar rows={rows} payMethod={payMethod} condicion={condicion} />
      </div>

      {/* Mobile Layout — single scrollable column */}
      <div className="lg:hidden flex flex-col h-full bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 font-sans -mx-4 -mt-4">
        {/* Mobile TopBar */}
        <TopBar invoiceNum={invoiceNum}>
          {isDistributor && (
            <>
              {!openShift && <button className="bg-brand-50 dark:bg-brand-900/30 border border-brand-200 dark:border-brand-800 text-brand-700 dark:text-brand-400 px-2 py-1 rounded-lg text-xs font-bold" onClick={() => setAdminPinAction('openShift')}>Turno</button>}
              {!!openShift && <button className="bg-brand-50 dark:bg-brand-900/30 border border-brand-200 dark:border-brand-800 text-brand-700 dark:text-brand-400 px-2 py-1 rounded-lg text-xs font-bold" onClick={() => setAdminPinAction('closeTurno')}>Cerrar</button>}
            </>
          )}
        </TopBar>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar pb-44">
          {/* Search */}
          <div className="p-3">
            <SearchBar productRef={productSearchInputRef} onAdd={addProduct} catalog={catalog} barcodeScan={barcodeScan} setBarcodeScan={setBarcodeScan} handleBarcodeScan={handleBarcodeScan} isConnected={isConnected} linkedDeviceName={linkedDeviceName} disconnectDevice={disconnectDevice} initSession={initSession} setShowScannerModal={setShowScannerModal} />
          </div>

          {/* Product cards */}
          <div className="px-3">
            <DataGrid rows={rows} onQty={onQty} onDisc={onDisc} onPrice={onPrice} onDelete={onDelete} onAddEmpty={() => addProduct(null)} />
          </div>

          {/* Compact options row */}
          <div className="px-3 mt-3 space-y-3">
            {/* Cliente inline */}
            <div className="relative">
              <div className="flex justify-between items-center mb-1.5">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.08em]">Cliente</div>
                <button onClick={() => setShowAddCustomerModal(true)} className="text-brand-600 active:scale-90 transition-transform"><UserPlus size={14}/></button>
              </div>
              <div className="relative">
                <input ref={customerSearchInputRef} type="text" value={customerSearchTerm} onChange={(e) => handleCustomerSearchChange(e.target.value)} onFocus={() => setIsCustomerDropdownOpen(true)} onBlur={() => setTimeout(() => setIsCustomerDropdownOpen(false), 150)} placeholder="Buscar cliente…" className="w-full text-sm p-2.5 pr-8 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
                {customerSearchTerm && (<button type="button" onClick={clearCustomerSelection} className="absolute inset-y-0 right-0 px-2 text-gray-400"><XCircle size={16} /></button>)}
                {isCustomerDropdownOpen && customerOptions.length > 0 && (
                    <ul className="absolute z-50 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg">
                        <li key="unselected"><button type="button" onMouseDown={(e) => { e.preventDefault(); clearCustomerSelection(); setIsCustomerDropdownOpen(false); }} className="w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700/50"><span className="text-sm text-gray-700 dark:text-gray-300">Consumidor final</span></button></li>
                        {customerOptions.map((customer) => (<li key={customer.id}><button type="button" onMouseDown={(e) => { e.preventDefault(); handleCustomerSelect(customer); }} className="w-full text-left px-3 py-2 hover:bg-brand-50 dark:hover:bg-brand-900/30"><p className="font-bold text-sm text-gray-900 dark:text-white">{customer.name}</p><p className="text-[11px] text-gray-400 font-mono">{customer.rnc ? `RNC: ${customer.rnc}` : ''}</p></button></li>))}
                    </ul>
                )}
              </div>
            </div>

            {/* Pay method + discount inline */}
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.08em] mb-1.5">Pago</div>
                <PayMethods active={payMethod} setActive={setPayMethod} />
              </div>
              <div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.08em] mb-1.5">Desc.</div>
                <div className="relative">
                  <input className="w-16 text-sm pl-2 pr-5 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 focus:ring-2 focus:ring-brand-500 text-center" type="number" min="0" max="100" value={globalDisc} onChange={e => setGlobalDisc(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))} />
                  <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 font-bold">%</span>
                </div>
              </div>
            </div>

            {/* Header fields collapsed */}
            <details className="group">
              <summary className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.08em] cursor-pointer select-none flex items-center gap-1">
                <ChevronDown size={12} className="transition-transform group-open:rotate-180" />
                Datos fiscales
              </summary>
              <div className="mt-2">
                <HeaderFields date={date} setDate={setDate} ncf={ncfType} setNcf={setNcfType} condicion={condicion} setCondicion={setCondicion} />
              </div>
            </details>
          </div>
        </div>

        {/* Sticky bottom total bar */}
        <div className="sticky bottom-0 left-0 right-0 glass border-t border-gray-200/50 dark:border-gray-800/50 p-3 pb-safe z-30">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3 text-sm">
              <span className="text-gray-400">{rows.length} items</span>
              {(() => {
                const rawTotal = rows.reduce((a, r) => a + r.price * r.qty * (1 - r.disc / 100), 0);
                const finalTotal = rawTotal - rawTotal * (globalDisc / 100);
                return <span className="text-xl font-extrabold text-gray-900 dark:text-white tracking-tight">{fmt(finalTotal)}</span>;
              })()}
            </div>
          </div>
          <button id="pos-pay-button" onClick={handleProcessOrder} disabled={rows.length === 0 || isSubmitting} className="w-full bg-green-600 text-white py-3.5 rounded-2xl font-bold active:scale-[0.97] disabled:bg-gray-400 transition-all shadow-lg shadow-green-600/20 text-base">
            {isSubmitting ? 'Procesando...' : 'Procesar Pedido'}
          </button>
        </div>
      </div>


      {/* Las opciones de PostOrderActionsModal y BillingTypeModal se omiten en este flujo */}
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

      {/* Keyboard Shortcuts Legend */}
      {isDistributor && (
        <div className="fixed bottom-0 left-0 right-0 bg-gray-900/90 backdrop-blur-sm text-white py-1.5 px-4 hidden lg:flex justify-center items-center gap-6 text-[11px] font-medium z-[100] border-t border-gray-700">
          <div className="flex items-center gap-1.5 opacity-80 hover:opacity-100 transition-opacity">
            <kbd className="bg-gray-700 text-gray-100 px-1.5 py-0.5 rounded border border-gray-600 shadow-sm min-w-[24px] text-center font-mono">F2</kbd> 
            <span>Buscar Artículo</span>
          </div>
          <div className="flex items-center gap-1.5 opacity-80 hover:opacity-100 transition-opacity">
            <kbd className="bg-gray-700 text-gray-100 px-1.5 py-0.5 rounded border border-gray-600 shadow-sm min-w-[24px] text-center font-mono">F3</kbd> 
            <span>Buscar Cliente</span>
          </div>
          <div className="flex items-center gap-1.5 opacity-80 hover:opacity-100 transition-opacity">
            <kbd className="bg-gray-700 text-gray-100 px-1.5 py-0.5 rounded border border-gray-600 shadow-sm min-w-[24px] text-center font-mono">F9</kbd> 
            <span>{condicion === 'Contado' ? 'Cambiar a Crédito' : 'Cambiar a Contado'}</span>
          </div>
          <div className="flex items-center gap-1.5 opacity-80 hover:opacity-100 transition-opacity text-green-400">
            <kbd className="bg-green-900/50 text-green-300 px-1.5 py-0.5 rounded border border-green-800/50 shadow-sm min-w-[24px] text-center font-mono">F10</kbd> 
            <span className="font-bold">Facturar / Guardar</span>
          </div>
          <div className="flex items-center gap-1.5 opacity-80 hover:opacity-100 transition-opacity text-gray-400">
            <kbd className="bg-gray-700 text-gray-200 px-1.5 py-0.5 rounded border border-gray-600 shadow-sm min-w-[24px] text-center font-mono">Esc</kbd> 
            <span>Limpiar / Cerrar</span>
          </div>
        </div>
      )}
    </div>
  );
}
