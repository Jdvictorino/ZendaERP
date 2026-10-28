import React, { useMemo } from 'react';
import { formatCurrency } from '../../utils/formatCurrency.js';
import Card, { CardBody, CardHeader } from '../ui/Card.jsx';
import { ShoppingCart, TrendingUp, TrendingDown, Download, Package } from 'lucide-react';

export default function CostoDeVentas({ invoices = [], expenses = [], products = [], currency = 'DOP' }) {
  // Calcular COGS y métricas
  const metrics = useMemo(() => {
    // Ventas netas
    const salesTotal = invoices.reduce((s, inv) => s + Number(inv.total || 0), 0);
    const salesTax = invoices.reduce((s, inv) => s + Number(inv.taxAmount || 0), 0);
    const netSales = salesTotal - salesTax;

    // Costo directo de items vendidos (si tenemos costPrice en items)
    const directCost = invoices.reduce((sum, inv) => {
      return sum + (inv.items || []).reduce((s, item) => {
        const cost = Number(item.costPrice || 0);
        return s + (cost * (item.quantity || 1));
      }, 0);
    }, 0);

    // Compras de mercancía (gastos tipo compra/inventario)
    const purchases = expenses
      .filter(e => {
        const t = (e.expenseType || '').toLowerCase();
        return t.includes('compra') || t.includes('mercancia') || t.includes('inventario') || t.includes('proveedor');
      })
      .reduce((s, e) => s + Number(e.montoFacturado || e.totalMontoFacturado || e.total || 0), 0);

    // Inventario actual (valor total a costo)
    const inventoryValue = products.reduce((s, p) => {
      const cost = Number(p.costPrice || 0);
      const stock = Number(p.stock || 0);
      const variantsValue = (p.variants || []).reduce((vs, v) => {
        return vs + (Number(v.purchasePrice || 0) * Number(v.stock || 0));
      }, 0);
      return s + (cost * stock) + variantsValue;
    }, 0);

    // COGS = Inventario Inicial estimado + Compras - Inventario Final
    // Como no tenemos inventario inicial histórico, usamos el costo directo como proxy
    const cogs = directCost > 0 ? directCost : purchases;
    const grossProfit = netSales - cogs;
    const grossMarginPct = netSales > 0 ? ((grossProfit / netSales) * 100) : 0;

    // Unidades vendidas
    const unitsSold = invoices.reduce((s, inv) =>
      s + (inv.items || []).reduce((us, item) => us + (item.quantity || 1), 0), 0
    );

    // Costo promedio por unidad
    const avgCostPerUnit = unitsSold > 0 ? cogs / unitsSold : 0;

    return { netSales, cogs, purchases, inventoryValue, grossProfit, grossMarginPct, directCost, unitsSold, avgCostPerUnit };
  }, [invoices, expenses, products]);

  const exportCsv = () => {
    const rows = [
      ['Concepto', `Monto (${currency})`],
      ['Ventas Netas', metrics.netSales.toFixed(2)],
      ['(-) Costo de Ventas', metrics.cogs.toFixed(2)],
      ['= Utilidad Bruta', metrics.grossProfit.toFixed(2)],
      ['', ''],
      ['Compras del Período', metrics.purchases.toFixed(2)],
      ['Valor del Inventario Actual', metrics.inventoryValue.toFixed(2)],
      ['Unidades Vendidas', metrics.unitsSold],
      ['Costo Promedio/Unidad', metrics.avgCostPerUnit.toFixed(2)],
      ['Margen Bruto %', metrics.grossMarginPct.toFixed(1) + '%'],
    ];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `costo-de-ventas-${Date.now()}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card>
          <CardBody className="space-y-1">
            <p className="text-ink-muted text-sm flex items-center gap-1.5"><TrendingUp size={14} /> Ventas Netas</p>
            <p className="text-2xl font-bold text-success-600">{formatCurrency(metrics.netSales, currency)}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="space-y-1">
            <p className="text-ink-muted text-sm flex items-center gap-1.5"><ShoppingCart size={14} /> Costo de Ventas</p>
            <p className="text-2xl font-bold text-red-600">{formatCurrency(metrics.cogs, currency)}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="space-y-1">
            <p className="text-ink-muted text-sm flex items-center gap-1.5"><TrendingDown size={14} /> Utilidad Bruta</p>
            <p className={`text-2xl font-bold ${metrics.grossProfit >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
              {formatCurrency(metrics.grossProfit, currency)}
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="space-y-1">
            <p className="text-ink-muted text-sm flex items-center gap-1.5"><Package size={14} /> Margen Bruto</p>
            <p className={`text-2xl font-bold ${metrics.grossMarginPct >= 0 ? 'text-success-600' : 'text-red-600'}`}>
              {metrics.grossMarginPct.toFixed(1)}%
            </p>
          </CardBody>
        </Card>
      </div>

      {/* Estado de Costo de Ventas */}
      <Card>
        <CardHeader title="Estado de Costo de Ventas" icon={<ShoppingCart size={18} />} actions={
          <button onClick={exportCsv}
            className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-800 font-medium">
            <Download size={14} /> Exportar
          </button>
        } />
        <CardBody>
          <div className="max-w-lg mx-auto space-y-1">
            {/* Estado de resultados parcial */}
            <div className="flex justify-between items-center py-3 border-b border-line">
              <span className="text-ink-soft font-medium">Ventas Netas</span>
              <span className="font-bold text-ink">{formatCurrency(metrics.netSales, currency)}</span>
            </div>

            <div className="flex justify-between items-center py-3 border-b border-line pl-4">
              <span className="text-ink-soft">Compras del período</span>
              <span className="text-ink-soft">{formatCurrency(metrics.purchases, currency)}</span>
            </div>

            <div className="flex justify-between items-center py-3 border-b border-line pl-4">
              <span className="text-ink-soft">Costo directo de productos vendidos</span>
              <span className="text-ink-soft">{formatCurrency(metrics.directCost, currency)}</span>
            </div>

            <div className="flex justify-between items-center py-3 border-b-2 border-line">
              <span className="text-red-700 font-semibold">(−) Costo de Ventas</span>
              <span className="font-bold text-red-700">{formatCurrency(metrics.cogs, currency)}</span>
            </div>

            <div className={`flex justify-between items-center py-3 rounded-lg px-3 ${metrics.grossProfit >= 0 ? 'bg-success-50' : 'bg-red-50'}`}>
              <span className={`font-bold text-lg ${metrics.grossProfit >= 0 ? 'text-success-700' : 'text-red-700'}`}>
                = Utilidad Bruta
              </span>
              <span className={`font-bold text-lg ${metrics.grossProfit >= 0 ? 'text-success-700' : 'text-red-700'}`}>
                {formatCurrency(metrics.grossProfit, currency)}
              </span>
            </div>
          </div>

          {/* Métricas adicionales */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-surface-muted rounded-lg p-4 border text-center">
              <p className="text-xs uppercase text-ink-muted font-semibold">Unidades Vendidas</p>
              <p className="text-xl font-bold text-ink mt-1">{metrics.unitsSold.toLocaleString()}</p>
            </div>
            <div className="bg-surface-muted rounded-lg p-4 border text-center">
              <p className="text-xs uppercase text-ink-muted font-semibold">Costo Prom./Unidad</p>
              <p className="text-xl font-bold text-ink mt-1">{formatCurrency(metrics.avgCostPerUnit, currency)}</p>
            </div>
            <div className="bg-surface-muted rounded-lg p-4 border text-center">
              <p className="text-xs uppercase text-ink-muted font-semibold">Inventario Actual</p>
              <p className="text-xl font-bold text-ink mt-1">{formatCurrency(metrics.inventoryValue, currency)}</p>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
