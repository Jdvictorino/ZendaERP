/**
 * UsersView - Versión migrada a PostgreSQL API
 */

import React, { useEffect, useState } from 'react';
import { Trash2, UserPlus, Edit, AlertTriangle, Loader2 } from 'lucide-react';
import ConfirmationModal from '../components/modals/ConfirmationModal.jsx';
import UserModal from '../components/modals/UserModal.jsx';
import toast from 'react-hot-toast';
import { getRoleLabel } from '../utils/permissions.js';
import Button from '../components/ui/Button.jsx';

// API PostgreSQL
import { useApiCrud } from '../hooks/useApi.js';

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
            <div className="flex justify-center items-center h-64">
                <Loader2 className="animate-spin text-indigo-500" size={48} />
                <p className="ml-4 text-gray-500">Cargando usuarios...</p>
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
                <h2 className="text-3xl font-bold text-gray-800 dark:text-white">
                    Gestionar Equipo
                </h2>
                <button onClick={openCreateModal} className="bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 flex items-center gap-2">
                    <UserPlus size={20}/> Añadir Nuevo Empleado
                </button>
            </div>
            <div className="bg-indigo-50 border border-indigo-100 text-indigo-800 rounded-lg p-4 mb-6">
                <p className="text-sm">
                    Define los permisos de cada usuario seleccionando un rol. Los empleados sin un rol asignado solo verán el panel principal.
                </p>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-md overflow-x-auto">
                <table className="w-full text-left">
                    <thead>
                        <tr className="border-b">
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
                                <td colSpan="6" className="p-4 text-center text-gray-500">No hay usuarios registrados</td>
                            </tr>
                        ) : (
                            safeUsers.map(u => (
                                <tr key={u.id} className="border-b hover:bg-gray-50">
                                    <td className="p-4 font-medium flex items-center gap-3">
                                        <img src={u.photoUrl || u.photoURL || 'https://placehold.co/40x40/e2e8f0/a0aec0?text=Foto'} alt="Foto" className="w-10 h-10 rounded-full object-cover" />
                                        {u.firstName} {u.lastName}
                                    </td>
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
                                    <td className="p-4 flex gap-3">
                                        <button onClick={() => openEditModal(u)} className="text-blue-600 hover:text-blue-800" title="Modificar">
                                            <Edit size={18}/>
                                        </button>
                                        {u.role !== 'admin' && (
                                            <button onClick={() => setConfirmDelete(u)} className="text-red-600 hover:text-red-800" title="Eliminar">
                                                <Trash2 size={18}/>
                                            </button>
                                        )}
                                    </td>
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
