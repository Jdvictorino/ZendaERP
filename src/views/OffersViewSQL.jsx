/**
 * Vista de Ofertas y Cupones - Versión SQL
 * Migrada de Firebase a PostgreSQL API
 */
import React, { useState } from 'react';
import Button from '../components/ui/Button.jsx';
import Card, { CardBody } from '../components/ui/Card.jsx';
import Badge from '../components/ui/Badge.jsx';
import { Table, TableHeader, TableRow, TableCell } from '../components/ui/Table.jsx';
import { Trash2, Edit3, PlusCircle, Loader2, Tag, Percent, DollarSign, Calendar } from 'lucide-react';
import CouponModal from '../components/modals/CouponModal.jsx';
import toast from 'react-hot-toast';
import api from '../api/client.js';
import { useApiCrud } from '../hooks/useApi.js';

const OffersViewSQL = ({ companyProfile }) => {
  const { data: offersData, loading, refetch } = useApiCrud('/offers');
  // La API devuelve arrays directamente (el hook ya extrae .data de la respuesta)
  const offers = Array.isArray(offersData) ? offersData : (offersData?.data || []);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);

  const handleCreate = () => {
    setEditing(null);
    setShowModal(true);
  };

  const handleEdit = (offer) => {
    setEditing(offer);
    setShowModal(true);
  };

  const handleDelete = async (offer) => {
    if (!confirm(`¿Eliminar cupón ${offer.code}?`)) return;
    try {
      await api.offers.delete(offer.id);
      toast.success('Cupón eliminado');
      refetch();
    } catch (err) {
      console.error(err);
      toast.error('No se pudo eliminar el cupón');
    }
  };

  const toggleActive = async (offer) => {
    try {
      await api.offers.toggle(offer.id);
      toast.success(offer.active ? 'Cupón desactivado' : 'Cupón activado');
      refetch();
    } catch (err) {
      console.error(err);
      toast.error('No se pudo actualizar el estado');
    }
  };

  const handleModalClose = (changed) => {
    setShowModal(false);
    if (changed) refetch();
  };

  if (showModal) {
    return (
      <div className="space-y-6">
        <CouponModal 
          show={showModal}
          onClose={handleModalClose} 
          editing={editing}
          useApi={true}
          fullPage
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center gap-4 mb-2">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center shadow-sm">
            <Tag size={24} className="text-brand-600 dark:text-brand-400" />
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
              Ofertas y Cupones
            </h2>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-0.5">
              Administra los descuentos y promociones de la tienda
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button onClick={handleCreate} className="w-full sm:w-auto justify-center shadow-lg shadow-brand-500/20">
            <PlusCircle size={16} className="mr-2"/>
            Nuevo Cupón
          </Button>
        </div>
      </div>

      <Card>
        <CardBody className="p-0">
          {loading ? (
            <div className="flex flex-col justify-center items-center py-16 gap-3">
              <Loader2 className="animate-spin text-brand-500" size={40} />
              <p className="text-sm text-gray-500 dark:text-gray-400">Cargando ofertas y cupones...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow hover={false}>
                    <TableCell as="th" className="pl-6">Código</TableCell>
                    <TableCell as="th">Tipo</TableCell>
                    <TableCell as="th">Valor</TableCell>
                    <TableCell as="th">Alcance</TableCell>
                    <TableCell as="th">Vigencia</TableCell>
                    <TableCell as="th">Límite de Uso</TableCell>
                    <TableCell as="th" className="text-center">Estado</TableCell>
                    <TableCell as="th" className="pr-6 text-right">Acciones</TableCell>
                  </TableRow>
                </TableHeader>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
                  {offers.map(o => {
                    const isExpired = o.endAt && new Date(o.endAt) < new Date();
                    
                    return (
                      <TableRow key={o.id}>
                        <TableCell className="pl-6 font-mono font-bold text-brand-600 dark:text-brand-400 text-sm">
                          {o.code}
                        </TableCell>
                        <TableCell>
                          {o.type === 'percentage' ? (
                            <Badge variant="info" size="sm" className="gap-1">
                              <Percent size={10} /> Porcentaje
                            </Badge>
                          ) : (
                            <Badge variant="success" size="sm" className="gap-1">
                              <DollarSign size={10} /> Monto Fijo
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-bold text-gray-900 dark:text-gray-100">
                          {o.type === 'percentage' ? `${o.value}%` : `${o.value}`}
                        </TableCell>
                        <TableCell className="text-xs text-gray-600 dark:text-gray-400">
                          <span className="capitalize">{o.appliesTo === 'all' ? 'Todo el catálogo' : o.appliesTo}</span>
                        </TableCell>
                        <TableCell className="text-xs text-gray-500 dark:text-gray-400">
                          <div className="flex items-center gap-1.5">
                            <Calendar size={12} className="text-gray-400" />
                            <span>
                              {o.startAt ? new Date(o.startAt).toLocaleDateString('es-DO', {day: '2-digit', month: 'short'}) : '—'}
                              {' → '}
                              {o.endAt ? new Date(o.endAt).toLocaleDateString('es-DO', {day: '2-digit', month: 'short'}) : 'Sin límite'}
                            </span>
                            {isExpired && (
                              <Badge variant="danger" size="sm" className="ml-1.5 py-0 px-1.5 text-[10px]">Expirado</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-gray-600 dark:text-gray-400">
                          <span className="font-medium text-gray-900 dark:text-gray-200">{o.timesUsed || 0}</span>
                          {o.usageLimit ? ` / ${o.usageLimit}` : ' (Sin límite)'}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-3">
                            <Badge variant={o.active && !isExpired ? 'success' : 'default'} size="sm">
                              {o.active && !isExpired ? 'Activo' : 'Inactivo'}
                            </Badge>
                            
                            {/* Premium Custom Switch Toggle */}
                            <button 
                              onClick={() => toggleActive(o)}
                              disabled={isExpired}
                              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-30 disabled:cursor-not-allowed ${
                                o.active ? 'bg-brand-500' : 'bg-gray-200 dark:bg-gray-700'
                              }`}
                              title={o.active ? 'Desactivar cupón' : 'Activar cupón'}
                            >
                              <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                  o.active ? 'translate-x-6' : 'translate-x-1'
                                }`}
                              />
                            </button>
                          </div>
                        </TableCell>
                        <TableCell className="pr-6 text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => handleEdit(o)} title="Editar">
                              <Edit3 size={16} className="text-gray-500 hover:text-brand-500" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(o)} title="Eliminar">
                              <Trash2 size={16} className="text-red-500 hover:text-red-700" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  
                  {offers.length === 0 && (
                    <TableRow hover={false}>
                      <TableCell colSpan="8" className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                        <div className="flex flex-col items-center gap-3">
                          <Tag size={40} className="text-gray-300 dark:text-gray-700" />
                          <p className="font-medium">No hay cupones registrados</p>
                          <Button variant="secondary" size="sm" onClick={handleCreate} className="mt-1">
                            Crear mi primer cupón
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </tbody>
              </Table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
};

export default OffersViewSQL;

