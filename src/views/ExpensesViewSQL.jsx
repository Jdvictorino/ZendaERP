/**
 * ExpensesView - Versión migrada a PostgreSQL API
 */



/**
 * ExpensesView - Versión migrada a PostgreSQL API
 */
import React, { useState, useMemo } from 'react';
import { Trash2, PlusCircle, Loader2, AlertTriangle, CreditCard, Calendar, Hash, DollarSign, ArrowDownRight, Edit3 } from 'lucide-react';
import toast from 'react-hot-toast';
import { playSuccessSound, playErrorSound } from '../utils/soundPlayer.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import ConfirmationModal from '../components/modals/ConfirmationModal.jsx';
import ExpenseModal from '../components/modals/ExpenseModal.jsx';
import Button from '../components/ui/Button.jsx';
import Card, { CardBody } from '../components/ui/Card.jsx';
import KpiCard from '../components/ui/KpiCard.jsx';
import { Table, TableHeader, TableRow, TableCell } from '../components/ui/Table.jsx';

// API PostgreSQL
import { useApiCrud } from '../hooks/useApi.js';
import PageSkeleton from '../components/ui/Skeleton.jsx';

const ExpensesViewSQL = ({ companyProfile }) => {
    // Datos de la API
    const { data: expenses, loading, error, create, update, remove, refetch } = useApiCrud('/expenses');
    const { data: suppliers } = useApiCrud('/suppliers');

    const [editingExpense, setEditingExpense] = useState(null);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const currency = companyProfile?.currency || 'USD';

    const handleSave = async (expenseData) => {
        try {
            const dataToSave = {
                ...expenseData,
                invoiceDate: new Date(expenseData.invoiceDate).toISOString(),
                paymentDate: new Date(expenseData.paymentDate).toISOString(),
                montoFacturado: parseFloat(expenseData.montoFacturado),
                itbisFacturado: parseFloat(expenseData.itbisFacturado),
            };
            
            if (editingExpense && editingExpense.id) {
                await update(editingExpense.id, dataToSave);
            } else {
                await create(dataToSave);
            }
            
            playSuccessSound();
            toast.success('¡Gasto guardado!');
            setEditingExpense(null);
        } catch (err) {
            playErrorSound();
            toast.error('No se pudo guardar el gasto.');
            console.error(err);
        }
    };
    
    const handleDelete = async () => {
        if (!confirmDelete) return;
        try {
            await remove(confirmDelete.id);
            playSuccessSound();
            toast.success('¡Gasto eliminado!');
            setConfirmDelete(null);
        } catch (err) {
            playErrorSound();
            toast.error('No se pudo eliminar el gasto.');
        }
    };

    const safeExpenses = expenses || [];

    // Función para parsear fechas
    const parseDate = (value) => {
        if (!value) return null;
        if (value instanceof Date) return value;
        if (value?.seconds) return new Date(value.seconds * 1000);
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    // Ordenar por fecha
    const sortedExpenses = useMemo(() => {
        return [...safeExpenses].sort((a, b) => {
            const dateA = parseDate(a.invoiceDate);
            const dateB = parseDate(b.invoiceDate);
            return (dateB?.getTime() || 0) - (dateA?.getTime() || 0);
        });
    }, [safeExpenses]);

    // Calcular estadísticas
    const expenseAnalytics = useMemo(() => {
        const totalCount = safeExpenses.length;
        let totalSpend = 0;
        let totalItbis = 0;

        safeExpenses.forEach(e => {
            totalSpend += Number(e.montoFacturado || 0);
            totalItbis += Number(e.itbisFacturado || 0);
        });

        const averageExpense = totalCount > 0 ? totalSpend / totalCount : 0;

        return {
            totalCount,
            totalSpend,
            totalItbis,
            averageExpense
        };
    }, [safeExpenses]);

    // Estados de carga y error
    if (loading) {
        return (
            <PageSkeleton label="Cargando gastos..." />
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

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center mb-6 gap-4">
                <div className="flex items-center gap-3">
                    <div>
                        <h2 className="page-title">
                            Registro de Compras y Gastos (606)
                        </h2>
                        <p className="page-subtitle">
                            Reporte de compras de bienes y servicios para la DGII
                        </p>
                    </div>
                </div>
                <div className="w-full sm:w-auto">
                    <Button onClick={() => setEditingExpense({})} className="w-full sm:w-auto justify-center">
                        <PlusCircle size={16} className="mr-2"/> Registrar Compra / Gasto
                    </Button>
                </div>
            </div>

            {/* Dashboard Analítico */}
            <div className="kpi-grid">
                <KpiCard label="Total Compras/Gastos" value={formatCurrency(expenseAnalytics.totalSpend, currency)} icon={ArrowDownRight} tone="danger" />
                <KpiCard label="Total ITBIS Reportado" value={formatCurrency(expenseAnalytics.totalItbis, currency)} icon={DollarSign} tone="info" />
                <KpiCard label="Transacciones (606)" value={expenseAnalytics.totalCount} icon={Hash} tone="brand" />
                <KpiCard label="Ticket Promedio" value={formatCurrency(expenseAnalytics.averageExpense, currency)} icon={CreditCard} tone="success" />
            </div>

            <Card>
                <CardBody className="p-0">
                    {/* Desktop Table View */}
                    <div className="hidden lg:block overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow hover={false}>
                                    <TableCell as="th" className="pl-6">Fecha Factura</TableCell>
                                    <TableCell as="th">RNC/Cédula</TableCell>
                                    <TableCell as="th">Proveedor</TableCell>
                                    <TableCell as="th">NCF</TableCell>
                                    <TableCell as="th">Monto</TableCell>
                                    <TableCell as="th">ITBIS</TableCell>
                                    <TableCell as="th" className="pr-6 text-right">Acciones</TableCell>
                                </TableRow>
                            </TableHeader>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-surface dark:bg-gray-900">
                                {sortedExpenses.length === 0 ? (
                                    <TableRow hover={false}>
                                        <TableCell colSpan="7" className="p-12 text-center text-ink-muted dark:text-gray-400">
                                            {/* sticky: en móvil la tabla es más ancha que la pantalla; el mensaje queda en la parte visible */}
                          <div className="sticky left-0 w-[calc(100vw-5rem)] sm:w-auto flex flex-col items-center gap-3">
                                                <CreditCard size={40} className="text-gray-300 dark:text-gray-700" />
                                                <p className="font-medium">No hay compras ni gastos registrados</p>
                                                <Button variant="secondary" size="sm" onClick={() => setEditingExpense({})} className="mt-1">
                                                    Registrar primer gasto
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    sortedExpenses.map(e => {
                                        const invoiceDate = parseDate(e.invoiceDate);
                                        return (
                                            <TableRow key={e.id}>
                                                <TableCell className="pl-6 text-sm dark:text-gray-400">
                                                    <div className="flex items-center gap-2">
                                                        <Calendar size={14} className="text-gray-400" />
                                                        <span>{invoiceDate ? invoiceDate.toLocaleDateString('es-DO', {day: '2-digit', month: 'short', year: 'numeric'}) : '—'}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="font-mono text-sm dark:text-gray-400 font-semibold">{e.rncCedula}</TableCell>
                                                <TableCell className="font-medium text-ink dark:text-gray-100">{e.supplierName}</TableCell>
                                                <TableCell className="font-mono text-sm dark:text-gray-400 font-semibold">{e.ncf || '—'}</TableCell>
                                                <TableCell className="font-bold text-ink dark:text-gray-100">{formatCurrency(e.montoFacturado, currency)}</TableCell>
                                                <TableCell className="font-bold text-blue-600 dark:text-blue-400">{formatCurrency(e.itbisFacturado, currency)}</TableCell>
                                                <TableCell className="pr-6 text-right">
                                                    <div className="flex justify-end gap-1">
                                                        <Button variant="ghost" size="sm" onClick={() => setEditingExpense(e)} title="Modificar">
                                                            <Edit3 size={16} className="text-ink-muted hover:text-brand-500" />
                                                        </Button>
                                                        <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(e)} title="Eliminar">
                                                            <Trash2 size={16} className="text-red-500 hover:text-red-700" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </tbody>
                        </Table>
                    </div>

                    {/* Mobile Card View */}
                    <div className="lg:hidden divide-y divide-gray-100 dark:divide-gray-800">
                        {sortedExpenses.map(e => {
                            const invoiceDate = parseDate(e.invoiceDate);
                            return (
                                <div key={e.id} className="p-4 active:bg-gray-50 dark:active:bg-gray-800 transition-colors">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex flex-col">
                                            <span className="text-xs uppercase font-bold text-gray-400 dark:text-gray-500 mb-0.5">
                                                {invoiceDate ? invoiceDate.toLocaleDateString() : '—'}
                                            </span>
                                            <span className="font-bold text-ink dark:text-gray-100 leading-tight">
                                                {e.supplierName}
                                            </span>
                                            <span className="text-xs font-mono text-ink-muted dark:text-gray-400 mt-1">
                                                {e.ncf || 'Sin NCF'}
                                            </span>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-bold text-ink dark:text-gray-100">
                                                {formatCurrency(e.montoFacturado, currency)}
                                            </div>
                                            <div className="text-xs font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                                                ITBIS: {formatCurrency(e.itbisFacturado, currency)}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-50 dark:border-gray-800">
                                        <span className="text-xs font-mono text-gray-400 dark:text-gray-500">{e.rncCedula}</span>
                                        <div className="flex gap-2">
                                            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(e)} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg p-1.5">
                                                <Trash2 size={16} />
                                            </Button>
                                            <Button size="sm" variant="secondary" onClick={() => setEditingExpense(e)}>
                                                Editar
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        {sortedExpenses.length === 0 && (
                            <div className="p-8 text-center text-ink-muted dark:text-gray-400">No hay gastos registrados</div>
                        )}
                    </div>
                </CardBody>
            </Card>

            {editingExpense && <ExpenseModal expense={editingExpense} onClose={() => setEditingExpense(null)} onSave={handleSave} suppliers={suppliers || []} />}
            <ConfirmationModal show={!!confirmDelete} onClose={() => setConfirmDelete(null)} onConfirm={handleDelete} title="Eliminar Gasto" message={`¿Estás seguro de que quieres eliminar el gasto con NCF "${confirmDelete?.ncf}"?`} />
        </div>
    );
};

export default ExpensesViewSQL;
