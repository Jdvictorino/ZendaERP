/**
 * SuppliersView - Versión migrada a PostgreSQL API
 */

import React, { useState, useMemo } from 'react';
import { Trash2, Download, PlusCircle, TrendingUp, Activity, Award, Clock, Settings, Power, Loader2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { playSuccessSound, playErrorSound } from '../utils/soundPlayer.js';
import SupplierModal from '../components/modals/SupplierModal.jsx';
import ConfirmationModal from '../components/modals/ConfirmationModal.jsx';
import Button from '../components/ui/Button.jsx';
import Card, { CardBody } from '../components/ui/Card.jsx';
import { formatCurrency } from '../utils/formatCurrency.js';

// API PostgreSQL
import { useApiCrud } from '../hooks/useApi.js';

const SuppliersViewSQL = ({ companyProfile }) => {
    // Datos de la API
    const { data: suppliers, loading, error, create, update, remove, refetch } = useApiCrud('/suppliers');
    const { data: expenses } = useApiCrud('/expenses');

    const [editingSupplier, setEditingSupplier] = useState(null);
    const [showInactive, setShowInactive] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [q, setQ] = useState('');
    const currency = companyProfile?.currency || 'USD';

    const handleSave = async (supplierData) => {
        try {
            if (editingSupplier && editingSupplier.id) {
                await update(editingSupplier.id, supplierData);
            } else {
                await create({ ...supplierData, status: 'active' });
            }
            playSuccessSound();
            toast.success('¡Proveedor guardado!');
            setEditingSupplier(null);
        } catch (err) {
            playErrorSound();
            toast.error('No se pudo guardar el proveedor.');
            console.error(err);
        }
    };

    const toggleStatus = async (supplier) => {
        const newStatus = supplier.status === 'active' ? 'inactive' : 'active';
        try {
            await update(supplier.id, { status: newStatus });
            playSuccessSound();
            toast.success('¡Estado actualizado!');
        } catch (err) {
            playErrorSound();
            toast.error('No se pudo actualizar el estado.');
        }
    };
    
    const handleDelete = async () => {
        if (!confirmDelete) return;
        try {
            await remove(confirmDelete.id);
            playSuccessSound();
            toast.success('¡Proveedor eliminado!');
            setConfirmDelete(null);
        } catch (err) {
            playErrorSound();
            toast.error('No se pudo eliminar.');
        }
    };

    const safeSuppliers = suppliers || [];
    const safeExpenses = expenses || [];

    const supplierAnalytics = useMemo(() => {
        const totalSuppliers = safeSuppliers.length;
        const activeSuppliers = safeSuppliers.filter(s => s.status !== 'inactive').length;
        const inactiveSuppliers = totalSuppliers - activeSuppliers;
        const supplierMap = new Map(safeSuppliers.map(s => [s.id, s]));

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        startOfMonth.setHours(0, 0, 0, 0);

        const parseDate = (value) => {
            if (!value) return null;
            if (value instanceof Date) return value;
            if (value?.seconds) return new Date(value.seconds * 1000);
            const parsed = new Date(value);
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        };

        const perSupplier = new Map();
        let monthSpend = 0;

        safeExpenses.forEach(exp => {
            if (!exp?.supplierId) return;
            const amount = Number(exp.totalMontoFacturado ?? exp.total ?? 0) || 0;
            if (amount <= 0) return;
            const expDate = parseDate(exp.date);
            const current = perSupplier.get(exp.supplierId) || { total: 0, monthTotal: 0, lastDate: null };
            current.total += amount;
            if (expDate && expDate >= startOfMonth) {
                current.monthTotal += amount;
                monthSpend += amount;
            }
            if (expDate && (!current.lastDate || expDate > current.lastDate)) {
                current.lastDate = expDate;
            }
            perSupplier.set(exp.supplierId, current);
        });

        const topSuppliers = Array.from(perSupplier.entries())
            .map(([supplierId, data]) => ({
                supplierId,
                name: supplierMap.get(supplierId)?.name || 'Proveedor sin nombre',
                total: data.total,
                monthTotal: data.monthTotal,
                lastDate: data.lastDate,
            }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 5);

        const topSupplier = topSuppliers[0] || null;

        const recentExpenses = safeExpenses
            .filter(exp => exp?.supplierId)
            .map(exp => ({
                id: exp.id,
                supplier: supplierMap.get(exp.supplierId)?.name || 'Proveedor sin nombre',
                amount: Number(exp.totalMontoFacturado ?? exp.total ?? 0) || 0,
                date: parseDate(exp.date),
                reference: exp.invoiceNumber || exp.reference || '',
            }))
            .sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0))
            .slice(0, 5);

        return {
            totalSuppliers,
            activeSuppliers,
            inactiveSuppliers,
            monthSpend,
            topSupplier,
            topSuppliers,
            recentExpenses,
        };
    }, [safeSuppliers, safeExpenses]);

    const formatDate = (date) => {
        if (!date) return '—';
        return date.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const filteredSuppliers = useMemo(() => {
        let rows = safeSuppliers.filter(s => showInactive ? s.status === 'inactive' : s.status !== 'inactive');
        if (q.trim()) {
            const s = q.toLowerCase();
            rows = rows.filter(r => (r.name || '').toLowerCase().includes(s) || (r.phone || '').includes(q) || (r.email || '').toLowerCase().includes(s));
        }
        return rows;
    }, [safeSuppliers, showInactive, q]);

    const exportCSV = () => {
        const headers = ['Nombre','Identificación','Teléfono','Email','Estado'];
        const escape = (v) => { const s = String(v ?? ''); const needsQuotes = /[",\n]/.test(s); const e = s.replace(/"/g, '""'); return needsQuotes ? `"${e}"` : e; };
        const lines = [headers.join(',')];
        filteredSuppliers.forEach(r => lines.push([r.name||'', r.identificationNumber||'', r.phone||'', r.email||'', r.status||''].map(escape).join(',')));
        const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `proveedores_${Date.now()}.csv`; a.click(); URL.revokeObjectURL(url);
    };

    // Estados de carga y error
    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <Loader2 className="animate-spin text-indigo-500" size={48} />
                <p className="ml-4 text-gray-500">Cargando proveedores...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex justify-center items-center h-64">
                <AlertTriangle className="text-red-500" size={48} />
                <p className="ml-4 text-red-500">Error: {error}</p>
                <Button variant="primary" onClick={refetch} className="ml-4">Reintentar</Button>
            </div>
        );
    }

    if (editingSupplier) {
        return (
            <div className="space-y-6">
                <SupplierModal
                    supplier={editingSupplier}
                    onClose={() => { setEditingSupplier(null); refetch(); }}
                    onSave={handleSave}
                    fullPage
                />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center gap-3">
                <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                    Gestión de Proveedores
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="secondary" onClick={() => setShowInactive(!showInactive)}>{showInactive ? 'Ver Activos' : 'Ver Inactivos'}</Button>
                    <Button variant="secondary" onClick={exportCSV}><Download size={16} className="mr-2"/> Exportar CSV</Button>
                    <Button variant="primary" onClick={() => setEditingSupplier({})}><PlusCircle size={16} className="mr-2"/> Añadir Proveedor</Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardBody>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-500">Proveedores activos</p>
                                <p className="text-2xl font-semibold text-gray-900">{supplierAnalytics.activeSuppliers} / {supplierAnalytics.totalSuppliers}</p>
                            </div>
                            <Activity className="text-indigo-500" size={28} />
                        </div>
                        <p className="text-xs text-gray-500 mt-3">{supplierAnalytics.inactiveSuppliers} inactivos</p>
                    </CardBody>
                </Card>
                <Card>
                    <CardBody>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-500">Compras del mes</p>
                                <p className="text-2xl font-semibold text-gray-900">{formatCurrency(supplierAnalytics.monthSpend, currency)}</p>
                            </div>
                            <TrendingUp className="text-emerald-500" size={28} />
                        </div>
                        <p className="text-xs text-gray-500 mt-3">Impacto directo en flujo de caja</p>
                    </CardBody>
                </Card>
                <Card>
                    <CardBody>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-500">Proveedor destacado</p>
                                <p className="text-lg font-semibold text-gray-900">{supplierAnalytics.topSupplier?.name || 'Sin registros'}</p>
                                <p className="text-sm text-gray-500">{supplierAnalytics.topSupplier ? formatCurrency(supplierAnalytics.topSupplier.total, currency) : ''}</p>
                            </div>
                            <Award className="text-amber-500" size={28} />
                        </div>
                        {supplierAnalytics.topSupplier?.lastDate && (
                            <p className="text-xs text-gray-500 mt-3">Última compra: {formatDate(supplierAnalytics.topSupplier.lastDate)}</p>
                        )}
                    </CardBody>
                </Card>
            </div>

            <Card>
                <CardBody className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2">
                        <label className="block text-sm text-gray-600 mb-1">Buscar proveedor</label>
                        <input className="input-base" placeholder="Nombre, teléfono o email" value={q} onChange={e => setQ(e.target.value)} />
                    </div>
                    <div className="flex items-end">
                        <p className="text-sm text-gray-500">Mostrando {filteredSuppliers.length} de {safeSuppliers.length}</p>
                    </div>
                </CardBody>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                    <CardBody>
                        <h3 className="text-lg font-semibold text-gray-800 mb-4">Top 5 proveedores por compras</h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="text-xs uppercase tracking-wide text-gray-500 border-b">
                                        <th className="py-2">Proveedor</th>
                                        <th className="py-2">Compras totales</th>
                                        <th className="py-2">Última compra</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {supplierAnalytics.topSuppliers.length === 0 && (
                                        <tr>
                                            <td colSpan="3" className="py-3 text-sm text-gray-500 text-center">Aún no hay compras asociadas a proveedores.</td>
                                        </tr>
                                    )}
                                    {supplierAnalytics.topSuppliers.map(item => (
                                        <tr key={item.supplierId} className="border-b last:border-0">
                                            <td className="py-2 text-sm font-medium text-gray-800">{item.name}</td>
                                            <td className="py-2 text-sm text-gray-600">{formatCurrency(item.total, currency)}</td>
                                            <td className="py-2 text-sm text-gray-500">{formatDate(item.lastDate)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardBody>
                </Card>
                <Card>
                    <CardBody>
                        <h3 className="text-lg font-semibold text-gray-800 mb-4">Últimas compras registradas</h3>
                        <ul className="space-y-3">
                            {supplierAnalytics.recentExpenses.length === 0 && <li className="text-sm text-gray-500">No hay movimientos recientes.</li>}
                            {supplierAnalytics.recentExpenses.map(item => (
                                <li key={item.id || `${item.supplier}-${item.date}`} className="flex items-center justify-between text-sm">
                                    <div>
                                        <p className="font-medium text-gray-800">{item.supplier}</p>
                                        <p className="text-xs text-gray-500 flex items-center gap-1"><Clock size={14} /> {formatDate(item.date)}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-semibold text-gray-900">{formatCurrency(item.amount, currency)}</p>
                                        {item.reference && <p className="text-xs text-gray-500">Ref. {item.reference}</p>}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </CardBody>
                </Card>
            </div>

            <Card>
                <CardBody className="overflow-x-auto">
                    <table className="w-full text-left min-w-[900px]">
                        <thead>
                            <tr className="border-b bg-gray-50/60">
                                <th className="p-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Nombre / Razón Social</th>
                                <th className="p-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Identificación</th>
                                <th className="p-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Teléfono</th>
                                <th className="p-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Email</th>
                                <th className="p-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredSuppliers.map(s => (
                                <tr key={s.id} className="border-b hover:bg-gray-50">
                                    <td className="p-3 text-sm font-medium">{s.name}</td>
                                    <td className="p-3 text-sm">{s.identificationNumber}</td>
                                    <td className="p-3 text-sm">{s.phone}</td>
                                    <td className="p-3 text-sm">{s.email}</td>
                                    <td className="p-3 flex flex-wrap gap-2 items-center">
                                        <Button variant="ghost" size="sm" onClick={() => setEditingSupplier(s)} title="Editar proveedor">
                                            <Settings size={18} className="text-indigo-600" />
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => toggleStatus(s)} title={s.status !== 'inactive' ? 'Desactivar' : 'Activar'}>
                                            <Power size={18} className={s.status !== 'inactive' ? 'text-amber-600' : 'text-emerald-600'} />
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(s)} title="Eliminar">
                                            <Trash2 size={18} className="text-red-600" />
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </CardBody>
            </Card>

            <ConfirmationModal 
                show={!!confirmDelete}
                onClose={() => setConfirmDelete(null)}
                onConfirm={handleDelete}
                title="Eliminar Proveedor"
                message={`¿Estás seguro de que quieres eliminar a "${confirmDelete?.name}" de forma permanente?`}
            />
        </div>
    );
};

export default SuppliersViewSQL;
