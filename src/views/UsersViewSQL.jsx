/**
 * UsersView - Versión migrada a PostgreSQL API
 */

import React, { useEffect, useState } from 'react';
import { Trash2, UserPlus, Edit, AlertTriangle, Loader2, Users } from 'lucide-react';
import ConfirmationModal from '../components/modals/ConfirmationModal.jsx';
import UserModal from '../components/modals/UserModal.jsx';
import toast from 'react-hot-toast';
import { getRoleLabel } from '../utils/permissions.js';
import Button from '../components/ui/Button.jsx';

// API PostgreSQL
import { useApiCrud } from '../hooks/useApi.js';
import { PLACEHOLDER_IMG } from '../utils/placeholderImage.js';
import PageSkeleton from '../components/ui/Skeleton.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';

const UsersViewSQL = ({ companyProfile, isMasterUser, adminUser, onCurrentUserUpdate, autoEditUserId = null, onAutoEditClose }) => {
    // Datos de la API
    const { data: users, loading, error, remove, refetch } = useApiCrud('/users');
    
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [showUserModal, setShowUserModal] = useState(false);
    const [selectedUserToEdit, setSelectedUserToEdit] = useState(null);

    // ID del usuario actual para comparar
    const currentUserId = adminUser?.id;

    const handleDeleteUser = async () => {
        if (!confirmDelete) return;
        try {
            await remove(confirmDelete.id);
            toast.success('¡Usuario eliminado!');
            setConfirmDelete(null);
        } catch (err) {
            toast.error('No se pudo eliminar el usuario.');
            console.error(err);
        }
    };

    const openEditModal = (user) => {
        setSelectedUserToEdit(user);
        setShowUserModal(true);
    };

    const openCreateModal = () => {
        setSelectedUserToEdit(null); // null indica crear nuevo
        setShowUserModal(true);
    };

    const isAutoEditFlow = Boolean(autoEditUserId);

    const handleUserModalClose = () => {
        setShowUserModal(false);
        setSelectedUserToEdit(null);
        refetch(); // Recargar lista después de crear/editar
        if (isAutoEditFlow) {
            onAutoEditClose?.();
        }
    };

    const safeUsers = users || [];

    useEffect(() => {
        if (!isAutoEditFlow || loading) return;

        const currentUserRow = safeUsers.find(u => String(u.id) === String(autoEditUserId));
        if (currentUserRow) {
            setSelectedUserToEdit(currentUserRow);
            setShowUserModal(true);
            return;
        }

        if (!showUserModal) {
            toast.error('No se encontró el usuario actual para editar su perfil.');
            onAutoEditClose?.();
        }
    }, [isAutoEditFlow, loading, safeUsers, autoEditUserId, showUserModal, onAutoEditClose]);

    // Estados de carga y error
    if (loading) {
        return (
            <PageSkeleton kpis={0} label="Cargando usuarios..." />
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

    if (showUserModal) {
        return (
            <div className="space-y-6">
                <UserModal
                    onClose={handleUserModalClose}
                    companyProfile={companyProfile}
                    adminUser={adminUser}
                    userToEdit={selectedUserToEdit}
                    currentUserUid={currentUserId}
                    fullPage
                    onProfileUpdate={(updatedUser) => {
                        if (updatedUser && onCurrentUserUpdate && String(updatedUser.id) === String(currentUserId)) {
                            onCurrentUserUpdate(updatedUser);
                        }
                        refetch();
                        handleUserModalClose();
                    }}
                />
            </div>
        );
    }

    return (
        <div>
            <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center mb-6 gap-2">
                <h2 className="page-title">
                    Gestionar Equipo
                </h2>
                <button onClick={openCreateModal} className="bg-brand-600 text-white py-2 px-4 rounded-lg hover:bg-brand-700 flex items-center gap-2">
                    <UserPlus size={20}/> Añadir Nuevo Empleado
                </button>
            </div>
            <div className="bg-brand-50 border border-brand-100 text-brand-800 dark:bg-brand-950/40 dark:border-brand-900 dark:text-brand-200 rounded-lg p-4 mb-6">
                <p className="text-sm">
                    Define los permisos de cada usuario seleccionando un rol. Los empleados sin un rol asignado solo verán el panel principal.
                </p>
            </div>

            <div className="card p-4 overflow-x-auto">
                <table className="w-full text-left">
                    <thead>
                        <tr className="border-b bg-gray-50/60 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                            <th className="p-4">Empleado</th>
                            <th className="p-4">N° Empleado</th>
                            <th className="p-4">Cargo</th>
                            <th className="p-4">Rol</th>
                            <th className="p-4">Correo Electrónico</th>
                            <th className="p-4">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {safeUsers.length === 0 ? (
                            <tr>
                                <td colSpan="6" className="p-0"><EmptyState icon={Users} title="No hay usuarios registrados" description="Añade empleados y asígnales un rol para darles acceso." /></td>
                            </tr>
                        ) : (
                            safeUsers.map(u => (
                                <tr key={u.id} className="border-b hover:bg-surface-muted">
                                    <td className="p-4 font-medium"><div className="flex items-center gap-3">
                                        <img src={u.photoUrl || u.photoURL || PLACEHOLDER_IMG} alt="Foto" className="w-10 h-10 rounded-full object-cover" />
                                        {u.firstName} {u.lastName}
                                    </div></td>
                                    <td className="p-4 font-mono text-sm">{u.employeeId || 'N/A'}</td>
                                    <td className="p-4">{u.cargo || 'Sin cargo'}</td>
                                    <td className="p-4">
                                        {u.role ? (
                                            getRoleLabel(u.role)
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => openEditModal(u)}
                                                className="inline-flex items-center gap-2 text-amber-600 hover:text-amber-700"
                                            >
                                                <AlertTriangle size={16} />
                                                Asignar permisos
                                            </button>
                                        )}
                                    </td>
                                    <td className="p-4">{u.email}</td>
                                    <td className="p-4"><div className="flex gap-3">
                                        <button onClick={() => openEditModal(u)} className="text-blue-600 hover:text-blue-800" title="Modificar">
                                            <Edit size={18}/>
                                        </button>
                                        {u.role !== 'admin' && (
                                            <button onClick={() => setConfirmDelete(u)} className="text-red-600 hover:text-red-800" title="Eliminar">
                                                <Trash2 size={18}/>
                                            </button>
                                        )}
                                    </div></td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            
            <ConfirmationModal 
                show={!!confirmDelete} 
                onClose={() => setConfirmDelete(null)} 
                onConfirm={handleDeleteUser} 
                title="Eliminar Empleado" 
                message={`¿Estás seguro de que quieres eliminar a "${confirmDelete?.firstName}"?`} 
            />
        </div>
    );
};

export default UsersViewSQL;
