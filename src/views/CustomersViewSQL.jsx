/**
 * CustomersView - Versión migrada a PostgreSQL API
 */

import React, { useState, useMemo } from 'react';
import { Trash2, Users, PlusCircle, Download, TrendingUp, Award, UserPlus, Clock, Settings, Power, Loader2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { playSuccessSound, playErrorSound } from '../utils/soundPlayer.js';
import ConfirmationModal from '../components/modals/ConfirmationModal.jsx';
import CustomerModal from '../components/modals/CustomerModal.jsx';
import Button from '../components/ui/Button.jsx';
import Card, { CardBody } from '../components/ui/Card.jsx';
import { formatCurrency } from '../utils/formatCurrency.js';

// API PostgreSQL
import { useApiCrud } from '../hooks/useApi.js';

const parseTimestamp = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (value?.seconds) return new Date(value.seconds * 1000);
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getCustomerCreatedDate = (customer) => {
    if (!customer) return null;
    const source = customer.createdAt
        ?? customer.createdDate
        ?? customer.created_at
        ?? customer.registrationDate
        ?? customer.registeredAt
        ?? customer.createdOn
        ?? customer.created
        ?? customer.date;
    return parseTimestamp(source);
};

const formatDate = (date) => {
    if (!date) return '—';
    return date.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
};

const CustomersViewSQL = ({ companyProfile }) => {
    // Datos de la API
    const { data: customers, loading, error, create, update, remove, refetch } = useApiCrud('/customers');
    const { data: invoices } = useApiCrud('/invoices');

    const [editingCustomer, setEditingCustomer] = useState(null);
    const [showInactive, setShowInactive] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [q, setQ] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const currency = companyProfile?.currency || 'USD';

    const handleSave = async (customerData) => {
        try {
            if (editingCustomer && editingCustomer.id) {
                await update(editingCustomer.id, customerData);
            } else {
                await create({
                    ...customerData,
                    status: 'active',
                    customerCode: `CLI-${Date.now()}`,
                });
            }
            playSuccessSound();
            toast.success('¡Cliente guardado con éxito!');
            setEditingCustomer(null);
        } catch (err) {
            playErrorSound();
            toast.error('No se pudo guardar el cliente.');
            console.error(err);
        }
    };
    
    const handleDelete = async () => {
        if (!confirmDelete) return;
        try {
            await remove(confirmDelete.id);
            playSuccessSound();
            toast.success('¡Cliente eliminado!');
            setConfirmDelete(null);
        } catch (err) {
            playErrorSound();
            toast.error('No se pudo eliminar el cliente.');
        }
    };

    const toggleStatus = async (customer) => {
        const newStatus = customer.status === 'active' ? 'inactive' : 'active';
        try {
            await update(customer.id, { status: newStatus });
            playSuccessSound();
            toast.success('¡Estado actualizado!');
        } catch (err) {
            playErrorSound();
            toast.error('No se pudo actualizar el estado.');
        }
    };

    const safeCustomers = customers || [];
    const safeInvoices = invoices || [];

    const customerMap = useMemo(() => new Map(safeCustomers.map(c => [c.id, c])), [safeCustomers]);

    const categoryOptions = useMemo(() => {
        const unique = new Set(companyProfile?.customerCategories || []);
        safeCustomers.forEach(customer => {
            const category = customer?.category && customer.category.trim() ? customer.category : null;
            if (category) unique.add(category);
        });
        if (unique.size === 0) {
            ['Retail', 'Mayorista', 'VIP'].forEach(defaultCat => unique.add(defaultCat));
        }
        unique.add('Sin categoría');
        return Array.from(unique);
    }, [companyProfile, safeCustomers]);

    const customerAnalytics = useMemo(() => {
        const totalCustomers = safeCustomers.length;
        const activeCustomers = safeCustomers.filter(c => c.status !== 'inactive').length;
        const inactiveCustomers = totalCustomers - activeCustomers;

        const now = new Date();
        const newThreshold = new Date(now);
        newThreshold.setDate(newThreshold.getDate() - 30);
        newThreshold.setHours(0, 0, 0, 0);

        let newCustomers30 = 0;
        const categoryCounts = new Map();
        safeCustomers.forEach(customer => {
            const category = customer?.category && customer.category.trim() ? customer.category : 'Sin categoría';
            categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
            const created = getCustomerCreatedDate(customer);
            if (created && created >= newThreshold) {
                newCustomers30 += 1;
            }
        });

        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        startOfMonth.setHours(0, 0, 0, 0);

        let monthRevenue = 0;
        let totalRevenue = 0;
        let invoiceCount = 0;

        const perCustomer = new Map();

        safeInvoices.forEach(inv => {
            if (!inv?.customerId || inv.customerId === 'guest') return;
            if (inv.status === 'Cancelado') return;
            const amount = Number(inv.total ?? inv.paidAmount ?? 0) || 0;
            if (amount <= 0) return;
            const invDate = parseTimestamp(inv.date);
            const name = inv.customerName || customerMap.get(inv.customerId)?.name || 'Cliente sin nombre';
            const current = perCustomer.get(inv.customerId) || { customerId: inv.customerId, name, total: 0, monthTotal: 0, count: 0, lastDate: null };
            current.total += amount;
            current.count += 1;
            if (invDate && invDate >= startOfMonth) {
                current.monthTotal += amount;
                monthRevenue += amount;
            }
            if (invDate && (!current.lastDate || invDate > current.lastDate)) {
                current.lastDate = invDate;
            }
            perCustomer.set(inv.customerId, current);
            totalRevenue += amount;
            invoiceCount += 1;
        });

        const topCustomers = Array.from(perCustomer.values())
            .sort((a, b) => b.total - a.total)
            .slice(0, 5);
        const topCustomer = topCustomers[0] || null;
        const averageTicket = invoiceCount ? totalRevenue / invoiceCount : 0;

        const recentInvoices = safeInvoices
            .filter(inv => inv?.customerId && inv.customerId !== 'guest' && inv.status !== 'Cancelado')
            .map(inv => {
                const date = parseTimestamp(inv.date);
                return {
                    id: inv.id,
                    customer: inv.customerName || customerMap.get(inv.customerId)?.name || 'Cliente sin nombre',
                    amount: Number(inv.total ?? inv.paidAmount ?? 0) || 0,
                    date,
                    status: inv.status || '',
                    reference: inv.invoiceNumber || inv.orderNumber || inv.ncf?.sequential || '',
                };
            })
            .filter(item => item.date)
            .sort((a, b) => b.date - a.date)
            .slice(0, 5);

        const categoryBreakdown = Array.from(categoryCounts.entries())
            .map(([category, count]) => ({
                category,
                count,
                percent: totalCustomers ? (count / totalCustomers) * 100 : 0,
            }))
            .sort((a, b) => b.count - a.count);

        return {
            totalCustomers,
            activeCustomers,
            inactiveCustomers,
            newCustomers30,
            monthRevenue,
            averageTicket,
            topCustomer,
            topCustomers,
            recentInvoices,
            categoryBreakdown,
        };
    }, [safeCustomers, safeInvoices, customerMap]);

    const filteredCustomers = useMemo(() => {
        const normalizedFilter = typeFilter || '';
        let rows = safeCustomers.filter(c => (showInactive ? c.status === 'inactive' : c.status !== 'inactive'));
        if (q.trim()) {
            const s = q.toLowerCase();
            rows = rows.filter(c => (c.name || '').toLowerCase().includes(s) || (c.customerCode || '').toLowerCase().includes(s) || (c.phone || '').includes(q));
        }
        if (normalizedFilter) {
            rows = rows.filter(c => {
                const category = c?.category && c.category.trim() ? c.category : 'Sin categoría';
                return category === normalizedFilter;
            });
        }
        return rows;
    }, [safeCustomers, showInactive, q, typeFilter]);

    const exportCSV = () => {
        const headers = ['Código','Nombre','Categoría','Tipo Cuenta','Identificación','Teléfono','Email','Estado'];
        const escape = (v) => {
            const s = String(v ?? '');
            const needsQuotes = /[",\n]/.test(s);
            const e = s.replace(/"/g, '""');
            return needsQuotes ? `"${e}"` : e;
        };
        const lines = [headers.join(',')];
        filteredCustomers.forEach(c => {
            lines.push([
                c.customerCode || '', c.name || '', c.category || '', (c.accountType || 'contado'), c.identificationNumber || '', c.phone || '', c.email || '', c.status || ''
            ].map(escape).join(','));
        });
        const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `clientes_${Date.now()}.csv`; a.click(); URL.revokeObjectURL(url);
    };

    // Estados de carga y error
    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <Loader2 className="animate-spin text-indigo-500" size={48} />
                <p className="ml-4 text-gray-500">Cargando clientes...</p>
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

    if (editingCustomer) {
        return (
            <div className="space-y-6">
                <CustomerModal
                    customer={editingCustomer}
                    onClose={() => { setEditingCustomer(null); refetch(); }}
                    onSave={handleSave}
                    companyProfile={companyProfile}
                    fullPage
                />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center gap-3">
                <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                    Cartera de Clientes
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="secondary" onClick={() => setShowInactive(!showInactive)}>
                        {showInactive ? 'Ver Activos' : 'Ver Inactivos'}
                    </Button>
                    <Button variant="secondary" onClick={exportCSV}><Download size={16} className="mr-2"/> Exportar CSV</Button>
                    <Button variant="primary" onClick={() => setEditingCustomer({})}><PlusCircle size={16} className="mr-2"/> Añadir Cliente</Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <Card>
                    <CardBody>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-500">Clientes activos</p>
                                <p className="text-2xl font-semibold text-gray-900">{customerAnalytics.activeCustomers} / {customerAnalytics.totalCustomers}</p>
                            </div>
                            <Users size={28} className="text-indigo-500" />
                        </div>
                        <p className="text-xs text-gray-500 mt-3">{customerAnalytics.inactiveCustomers} inactivos</p>
                    </CardBody>
                </Card>
                <Card>
                    <CardBody>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-500">Clientes nuevos (30 días)</p>
                                <p className="text-2xl font-semibold text-gray-900">{customerAnalytics.newCustomers30}</p>
                            </div>
                            <UserPlus size={28} className="text-teal-500" />
                        </div>
                        <p className="text-xs text-gray-500 mt-3">Incremento reciente de tu cartera</p>
                    </CardBody>
                </Card>
                <Card>
                    <CardBody>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-500">Facturación del mes</p>
                                <p className="text-2xl font-semibold text-gray-900">{formatCurrency(customerAnalytics.monthRevenue, currency)}</p>
                            </div>
                            <TrendingUp size={28} className="text-emerald-500" />
                        </div>
                        <p className="text-xs text-gray-500 mt-3">Basado en facturas del período</p>
                    </CardBody>
                </Card>
                <Card>
                    <CardBody>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-500">Cliente destacado</p>
                                <p className="text-lg font-semibold text-gray-900">{customerAnalytics.topCustomer?.name || 'Sin registros'}</p>
                                <p className="text-sm text-gray-500">{customerAnalytics.topCustomer ? formatCurrency(customerAnalytics.topCustomer.total, currency) : ''}</p>
                            </div>
                            <Award size={28} className="text-amber-500" />
                        </div>
                        {customerAnalytics.topCustomer?.lastDate && (
                            <p className="text-xs text-gray-500 mt-3">Última compra: {formatDate(customerAnalytics.topCustomer.lastDate)}</p>
                        )}
                    </CardBody>
                </Card>
            </div>

            <Card>
                <CardBody className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2">
                        <label className="block text-sm text-gray-600 mb-1">Buscar cliente</label>
                        <input className="input-base" placeholder="Nombre, código o teléfono" value={q} onChange={e => setQ(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-600 mb-1">Categoría</label>
                        <select className="input-base" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                            <option value="">Todas las categorías</option>
                            {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <div className="md:col-span-3 flex justify-between text-sm text-gray-500">
                        <span>Mostrando {filteredCustomers.length} de {safeCustomers.length} clientes</span>
                        <span>Ticket promedio: {formatCurrency(customerAnalytics.averageTicket, currency)}</span>
                    </div>
                </CardBody>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                    <CardBody>
                        <h3 className="text-lg font-semibold text-gray-800 mb-4">Top 5 clientes por facturación</h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="text-xs uppercase tracking-wide text-gray-500 border-b">
                                        <th className="py-2">Cliente</th>
                                        <th className="py-2">Total vendido</th>
                                        <th className="py-2">Última compra</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {customerAnalytics.topCustomers.length === 0 && (
                                        <tr>
                                            <td colSpan="3" className="py-3 text-sm text-gray-500 text-center">Aún no hay ventas registradas.</td>
                                        </tr>
                                    )}
                                    {customerAnalytics.topCustomers.map(item => (
                                        <tr key={item.customerId} className="border-b last:border-0">
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
                    <CardBody className="space-y-4">
                        <div>
                            <h3 className="text-lg font-semibold text-gray-800 mb-2">Actividad reciente</h3>
                            <ul className="space-y-3">
                                {customerAnalytics.recentInvoices.length === 0 && <li className="text-sm text-gray-500">Sin movimientos recientes.</li>}
                                {customerAnalytics.recentInvoices.map(item => (
                                    <li key={item.id || `${item.customer}-${item.date?.toISOString()}`}
                                        className="flex items-center justify-between text-sm">
                                        <div>
                                            <p className="font-medium text-gray-800">{item.customer}</p>
                                            <p className="text-xs text-gray-500 flex items-center gap-1"><Clock size={14} /> {formatDate(item.date)}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-semibold text-gray-900">{formatCurrency(item.amount, currency)}</p>
                                            {item.reference && <p className="text-xs text-gray-500">Ref. {item.reference}</p>}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="border-t border-gray-100 pt-3">
                            <h4 className="text-sm font-semibold text-gray-700 mb-2">Distribución por categoría</h4>
                            {customerAnalytics.categoryBreakdown.length === 0 ? (
                                <p className="text-sm text-gray-500">Sin datos de categorías.</p>
                            ) : (
                                <ul className="space-y-1 text-sm text-gray-600">
                                    {customerAnalytics.categoryBreakdown.map(item => (
                                        <li key={item.category} className="flex justify-between">
                                            <span>{item.category}</span>
                                            <span>{item.count} ({item.percent.toFixed(1)}%)</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </CardBody>
                </Card>
            </div>

            {safeCustomers.length === 0 ? (
                <Card>
                    <CardBody className="text-center py-12">
                        <Users size={48} className="mx-auto text-gray-400" />
                        <h3 className="mt-4 text-xl font-semibold text-gray-900">No tienes clientes</h3>
                        <p className="mt-2 text-gray-500">Aún no has añadido ningún cliente. ¡Empieza por aquí!</p>
                        <Button onClick={() => setEditingCustomer({})} className="mt-6">
                            <PlusCircle size={20} className="mr-2"/> Crear mi primer cliente
                        </Button>
                    </CardBody>
                </Card>
            ) : (
                <Card>
                    <CardBody className="p-0 sm:p-6 overflow-x-auto">
                        {/* Desktop Table View */}
                        <table className="hidden lg:table w-full text-left min-w-[900px]">
                            <thead>
                                <tr className="border-b bg-gray-50/60 dark:bg-gray-800">
                                    <th className="p-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Código</th>
                                    <th className="p-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Nombre</th>
                                    <th className="p-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Categoría</th>
                                    <th className="p-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Tipo Cuenta</th>
                                    <th className="p-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Identificación</th>
                                    <th className="p-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Teléfono</th>
                                    <th className="p-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                                {filteredCustomers.map(c => (
                                    <tr key={c.id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                        <td className="p-3 text-sm font-mono dark:text-gray-400">{c.customerCode}</td>
                                        <td className="p-3 text-sm font-medium dark:text-gray-100">{c.name}</td>
                                        <td className="p-3 text-sm text-gray-600 dark:text-gray-400">{c.category || 'Sin categoría'}</td>
                                        <td className="p-3 text-sm text-gray-600 dark:text-gray-400">{(c.accountType || 'contado') === 'credito' ? 'Crédito' : 'Contado'}</td>
                                        <td className="p-3 text-sm dark:text-gray-400">{c.identificationNumber}{c.type ? ` (${c.type})` : ''}</td>
                                        <td className="p-3 text-sm dark:text-gray-400">{c.phone}</td>
                                        <td className="p-3 flex flex-wrap gap-2 items-center">
                                            <Button variant="ghost" size="sm" onClick={() => setEditingCustomer(c)} title="Editar cliente">
                                                <Settings size={18} className="text-indigo-600" />
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={() => toggleStatus(c)} title={c.status !== 'inactive' ? 'Desactivar' : 'Activar'}>
                                                <Power size={18} className={c.status !== 'inactive' ? 'text-amber-600' : 'text-emerald-600'} />
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(c)} title="Eliminar">
                                                <Trash2 size={18} className="text-red-600" />
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {/* Mobile Card View */}
                        <div className="lg:hidden divide-y divide-gray-100 dark:divide-gray-800">
                            {filteredCustomers.map(c => (
                                <div key={c.id} className="p-4 active:bg-gray-50 dark:active:bg-gray-800 transition-colors">
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex flex-col">
                                            <span className="text-xs font-mono text-gray-500 uppercase">{c.customerCode}</span>
                                            <span className="font-bold text-gray-900 dark:text-gray-100 text-lg leading-tight">{c.name}</span>
                                            <span className="text-xs text-brand-600 dark:text-brand-400 font-medium mt-0.5">{c.category || 'Sin categoría'}</span>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                                                (c.accountType || 'contado') === 'credito' ? 'bg-amber-100 text-amber-800' : 'bg-teal-100 text-teal-800'
                                            }`}>
                                                {(c.accountType || 'contado') === 'credito' ? 'Crédito' : 'Contado'}
                                            </span>
                                            {c.phone && <span className="text-xs text-gray-500 mt-2">{c.phone}</span>}
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-50 dark:border-gray-800">
                                        <div className="flex gap-2">
                                            <button onClick={() => toggleStatus(c)} className={`p-2 rounded-lg transition-colors ${
                                                c.status !== 'inactive' ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'
                                            }`}>
                                                <Power size={18} />
                                            </button>
                                            <button onClick={() => setConfirmDelete(c)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                        <Button size="sm" variant="secondary" onClick={() => setEditingCustomer(c)}>
                                            <Settings size={14} className="mr-1.5" /> Gestionar
                                        </Button>
                                    </div>
                                </div>
                            ))}
                            {filteredCustomers.length === 0 && (
                                <div className="p-8 text-center text-gray-500">No se encontraron clientes</div>
                            )}
                        </div>
                    </CardBody>
                </Card>
            )}

            <ConfirmationModal 
                show={!!confirmDelete} 
                onClose={() => setConfirmDelete(null)} 
                onConfirm={handleDelete} 
                title="Eliminar Cliente" 
                message={`¿Estás seguro de que quieres eliminar a "${confirmDelete?.name}"? Esta acción es permanente.`} 
            />
        </div>
    );
};

export default CustomersViewSQL;
