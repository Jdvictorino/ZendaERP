// Vista de Configuración Unificada - SettingsViewSQL
import React, { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { 
    Sliders, DollarSign, Printer, Package, Users, 
    Shield, Save, AlertTriangle, Plus, Trash, Volume2, Settings, Mail
} from 'lucide-react';
import api, { settings as settingsApi } from '../api/client.js';
import { playSuccessSound, playErrorSound } from '../utils/soundPlayer.js';
import NcfModal from '../components/modals/NcfModal.jsx';
import EcfConfigPanel from '../components/ecf/EcfConfigPanel.jsx';
import Card, { CardBody } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import { confirmDialog } from '../utils/confirmDialog.jsx';

const sanitizeForBackend = (value) => {
    if (value === null) return null;
    if (Array.isArray(value)) {
        return value
            .map((entry) => sanitizeForBackend(entry))
            .filter((entry) => entry !== undefined);
    }
    if (typeof value === 'object') {
        const output = {};
        Object.entries(value).forEach(([key, val]) => {
            if (val === undefined) return;
            if (typeof val === 'number' && !Number.isFinite(val)) return;
            const sanitized = sanitizeForBackend(val);
            if (sanitized !== undefined) output[key] = sanitized;
        });
        return output;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : undefined;
    }
    if (typeof value === 'string') {
        return value;
    }
    if (typeof value === 'boolean') {
        return value;
    }
    return undefined;
};

const buildNcfSummary = (sequences = []) => {
    const summary = {};
    sequences.forEach(seq => {
        const code = seq.code?.toLowerCase();
        if (!code) return;
        summary[`${code}_prefix`] = seq.prefix || seq.code;
        summary[`${code}_sequence_next`] = Number(seq.next || seq.start || 1);
        summary[`${code}_range_end`] = Number(seq.end || 0);
    });
    return summary;
};

const SettingsViewSQL = ({ companyProfile = {}, onProfileUpdate, isMasterUser }) => {
    const [activeTab, setActiveTab] = useState('preferencias');
    const [systemPrinters, setSystemPrinters] = useState([]);
    const [showNcfModal, setShowNcfModal] = useState(false);

    // Form data state mapping all values to match legacy profile modal schema
    const [formData, setFormData] = useState({
        name: '', rnc: '', address: { street: '', sector: '', city: '', zipCode: '', country: 'República Dominicana' },
        phone: '', email: '', logo: '', currency: 'USD',
        allowCustomization: true,
        customerCategories: ['General', 'VIP', 'Mayorista'],
        pricing: { categoryDiscounts: {} },
        bankDetails: { entityType: 'Persona', bankName: '', beneficiaryName: '', beneficiaryId: '', accountType: 'Ahorro en Pesos RD$', accountNumber: '', bankEmail: '' },
        cash: { tolerance: 0, requireSupervisorBeyondTolerance: true, registers: [], printing: { mode: 'html', printerName: '' } },
        notifications: { sound: { enabled: true, volume: 0.7 } },
        orderMode: 'craft',
        availableOrderModes: ['craft'],
        ncfSequences: [],
        smtp: { host: '', port: 587, secure: false, user: '', pass: '', from: '' }
    });

    // Migrations of categories to apply to existing customers upon save
    const [pendingMigrations, setPendingMigrations] = useState([]); // [{from, to}]
    const [applyMigrations, setApplyMigrations] = useState(false);
    const soundSettings = formData.notifications?.sound || { enabled: true, volume: 0.7 };

    // Electron printer loader
    useEffect(() => {
        if (window?.electronAPI?.getPrinters && isMasterUser) {
            window.electronAPI.getPrinters().then(list => setSystemPrinters(list || []));
        }
    }, [isMasterUser]);

    // Load initial values from profile
    useEffect(() => {
        if (companyProfile) {
            const sanitizedProfile = Object.fromEntries(
                Object.entries(companyProfile).map(([key, value]) => [key, value === null ? '' : value])
            );
            setFormData((prevData) => ({
                ...prevData,
                ...sanitizedProfile,
                address: { ...prevData.address, ...(companyProfile.address || {}) },
                bankDetails: { ...prevData.bankDetails, ...(companyProfile.bankDetails || {}) },
                cash: { ...prevData.cash, ...(companyProfile.cash || {}) },
                pricing: { ...prevData.pricing, ...(companyProfile.pricing || {}) },
                customerCategories: companyProfile.customerCategories || prevData.customerCategories,
                notifications: {
                    ...prevData.notifications,
                    ...(companyProfile.notifications || {}),
                    sound: {
                        ...(prevData.notifications?.sound || {}),
                        ...(companyProfile.notifications?.sound || {}),
                    },
                },
                availableOrderModes: companyProfile.availableOrderModes || ['craft'],
                ncfSequences: companyProfile.ncfSequences || [],
                smtp: companyProfile.smtp || { host: '', port: 587, secure: false, user: '', pass: '', from: '' }
            }));
        }
    }, [companyProfile]);

    const handleFormChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const [testEmail, setTestEmail] = useState('');
    const [testEmailLoading, setTestEmailLoading] = useState(false);

    const handleTestEmail = async () => {
        if (!testEmail || !testEmail.trim()) {
            toast.error('Por favor, ingresa un correo de destino para la prueba.');
            return;
        }

        const emailRegex = /^[^s@]+@[^s@]+.[^s@]+$/;
        if (!emailRegex.test(testEmail.trim())) {
            toast.error('Por favor, ingresa un correo válido.');
            return;
        }

        setTestEmailLoading(true);

        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #4f46e5; border-radius: 8px; background-color: #fcfcff;">
                <h2 style="color: #4f46e5; margin-bottom: 10px;">Zenda ERP - Prueba de Correo SMTP Exitosa 🎉</h2>
                <p style="font-size: 15px; color: #1e293b; line-height: 1.6;">
                    ¡Felicitaciones! Este es un correo electrónico de prueba enviado exitosamente desde la configuración SMTP de <strong>Zenda ERP</strong>.
                </p>
                <div style="background-color: #f1f5f9; border-left: 4px solid #4f46e5; padding: 12px; font-size: 13px; color: #475569; margin: 20px 0;">
                    <strong>Proveedor:</strong> Servidor SMTP Propio de la Empresa<br/>
                    <strong>Servidor:</strong> ${formData.smtp?.host || 'N/A'}:${formData.smtp?.port || '587'}<br/>
                    <strong>Usuario SMTP:</strong> ${formData.smtp?.user || 'N/A'}<br/>
                    <strong>Destino:</strong> ${testEmail}
                </div>
                <p style="font-size: 12px; color: #94a3b8; margin-top: 30px;">
                    Este correo confirma que tu conexión para el envío automático de documentos (facturas, recibos, cotizaciones y estados de cuenta) está 100% funcional.
                </p>
            </div>
        `;

        try {
            const cleanPayload = sanitizeForBackend(formData);
            cleanPayload.emailProvider = null;
            await settingsApi.update(cleanPayload);

            const result = await api.email.send({
                to: testEmail.trim(),
                subject: 'Zenda ERP - Prueba de Conexión de Correo SMTP',
                html,
                text: '¡Prueba exitosa! Tu conexión de correo SMTP en Zenda ERP funciona perfectamente.'
            });

            if (result && result.success) {
                toast.success('¡Correo de prueba enviado con éxito! Revisa tu bandeja de entrada.');
                playSuccessSound();
            } else {
                toast.error('Error al enviar el correo de prueba.');
                playErrorSound();
            }
        } catch (err) {
            console.error('Error al probar email:', err);
            toast.error('Error al enviar el correo de prueba. Verifica tus credenciales.');
            playErrorSound();
        } finally {
            setTestEmailLoading(false);
        }
    };

    // Save general profile settings
    const handleSaveSettings = async (customPayload = null) => {
        const payloadToSave = customPayload || formData;
        const cleanPayload = sanitizeForBackend(payloadToSave);
        cleanPayload.emailProvider = null;

        if (applyMigrations && pendingMigrations.length) {
            cleanPayload._categoryMigrations = { apply: true, entries: pendingMigrations };
        }

        const promise = settingsApi.update(cleanPayload);
        await toast.promise(promise, {
            loading: 'Guardando configuración...',
            success: (saved) => {
                playSuccessSound();
                if (onProfileUpdate) onProfileUpdate(saved);
                setPendingMigrations([]);
                return '¡Configuración guardada!';
            },
            error: () => {
                playErrorSound();
                return 'No se pudo guardar la configuración.';
            }
        });
    };

    // Save NCF manual booklets
    const handleSaveNcf = async (newSequences) => {
        try {
            const summary = buildNcfSummary(newSequences);
            await settingsApi.updateNcf(newSequences);
            
            const updatedProfile = { 
                ...formData,
                ncfSequences: newSequences, 
                ncf: summary 
            };
            
            setFormData(updatedProfile);
            if (onProfileUpdate) onProfileUpdate(updatedProfile);
            
            toast.success('Secuencias NCF actualizadas');
        } catch (error) {
            console.error('Error al guardar secuencias NCF:', error);
            toast.error('Error al guardar secuencias NCF');
            throw error;
        }
    };

    // Derived alert sequences list for manual booklet alert warning badge
    const alertSequences = useMemo(() => {
        const sequences = formData.ncfSequences || [];
        return sequences
            .filter(seq => seq.active)
            .filter(seq => {
                const remaining = Number(seq.end || 0) - Number(seq.next || seq.start || 1) + 1;
                return remaining <= 10 || Number(seq.next || 0) > Number(seq.end || 0);
            });
    }, [formData.ncfSequences]);

    const tabs = [
        { id: 'preferencias', label: 'Preferencias', icon: Sliders },
        { id: 'caja', label: 'Caja y Terminales', icon: Printer },
        { id: 'pedidos', label: 'Modo de Pedidos', icon: Package },
        { id: 'clientes', label: 'Clientes y Precios', icon: Users },
        { id: 'talonarios', label: 'Talonarios NCF', icon: Settings },
        { id: 'ecf', label: 'Configuración e-CF', icon: Shield },
        { id: 'correo', label: 'Servicio de Correo', icon: Mail }
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="page-title">Configuración</h2>
                    <p className="page-subtitle">Administra preferencias globales, terminales de caja, secuencias de comprobantes y conexión DGII.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-4 items-start">
                {/* Navigation Sidebar */}
                <div className="card flex flex-col gap-1 p-2">
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                                    activeTab === tab.id
                                        ? 'bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-400 font-semibold'
                                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-200'
                                }`}
                            >
                                <Icon size={18} />
                                {tab.label}
                                {tab.id === 'talonarios' && alertSequences.length > 0 && (
                                    <span className="ml-auto flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Content Panel */}
                <div className="lg:col-span-3 space-y-6">
                    {/* Preferencias */}
                    {activeTab === 'preferencias' && (
                        <Card>
                            <CardBody className="space-y-6">
                                <div className="border-b border-slate-100 pb-3 dark:border-slate-800">
                                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Configuración y Preferencias</h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">Elige la moneda e implementa reglas de interacción del catálogo.</p>
                                </div>

                                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                                    <div>
                                        <label className="block text-slate-700 text-sm font-medium mb-2 dark:text-slate-300">Divisa Principal</label>
                                        <select aria-label="Divisa Principal" 
                                            name="currency" 
                                            value={formData.currency} 
                                            onChange={handleFormChange} 
                                            className="input-base" 
                                            disabled={!isMasterUser}
                                        >
                                            <option value="DOP">Peso Dominicano (DOP)</option>
                                            <option value="USD">Dólar Americano (USD)</option>
                                            <option value="EUR">Euro (EUR)</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-slate-700 text-sm font-medium mb-2 dark:text-slate-300">Personalizar Productos</label>
                                        <div className="flex items-center gap-3 mt-3">
                                            <button 
                                                type="button" 
                                                onClick={() => isMasterUser && setFormData({ ...formData, allowCustomization: !formData.allowCustomization })} 
                                                disabled={!isMasterUser} 
                                                role="switch" aria-checked={!!formData.allowCustomization} aria-label="Personalizar productos"
                                                className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors focus:outline-none ${formData.allowCustomization ? 'bg-brand-600' : 'bg-slate-300'}`}
                                            >
                                                <span className={`inline-block w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${formData.allowCustomization ? 'translate-x-5' : 'translate-x-1'}`} />
                                            </button>
                                            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Ver el botón "Personalizar" en las tarjetas de producto de venta directa.</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="border-t border-slate-100 pt-4 dark:border-slate-800 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Sonidos de Notificación</h4>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">Emite alertas audibles en las operaciones de éxito y error.</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (!isMasterUser) return;
                                                setFormData(prev => ({
                                                    ...prev,
                                                    notifications: {
                                                        ...prev.notifications,
                                                        sound: {
                                                            ...soundSettings,
                                                            enabled: !soundSettings.enabled
                                                        }
                                                    }
                                                }));
                                            }}
                                            disabled={!isMasterUser}
                                            role="switch" aria-checked={!!soundSettings.enabled} aria-label="Sonidos de notificación"
                                                className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors focus:outline-none ${soundSettings.enabled ? 'bg-brand-600' : 'bg-slate-300'}`}
                                        >
                                            <span className={`inline-block w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${soundSettings.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
                                        </button>
                                    </div>

                                    {soundSettings.enabled && (
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-3">
                                                <Volume2 className="text-slate-400" size={16} />
                                                <input
                                                    type="range"
                                                    aria-label="Volumen de notificaciones"
                                                    min="0"
                                                    max="100"
                                                    value={Math.round((soundSettings.volume ?? 0.7) * 100)}
                                                    onChange={(e) => {
                                                        if (!isMasterUser) return;
                                                        const val = Number(e.target.value) / 100;
                                                        setFormData(prev => ({
                                                            ...prev,
                                                            notifications: {
                                                                ...prev.notifications,
                                                                sound: {
                                                                    ...soundSettings,
                                                                    volume: val
                                                                }
                                                            }
                                                        }));
                                                    }}
                                                    disabled={!isMasterUser}
                                                    className="flex-1 accent-brand-600"
                                                />
                                                <span className="w-12 text-sm text-slate-600 dark:text-slate-300 text-right font-medium">{Math.round((soundSettings.volume ?? 0.7) * 100)}%</span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {isMasterUser && (
                                    <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
                                        <Button onClick={() => handleSaveSettings()} className="flex items-center gap-2">
                                            <Save size={16} /> Guardar Preferencias
                                        </Button>
                                    </div>
                                )}
                            </CardBody>
                        </Card>
                    )}

                    {/* Caja y Terminales */}
                    {activeTab === 'caja' && (
                        <Card>
                            <CardBody className="space-y-6">
                                <div className="border-b border-slate-100 pb-3 dark:border-slate-800">
                                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Caja y Terminales</h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">Establece tolerancias financieras y configura terminales de facturación térmica.</p>
                                </div>

                                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                                    <div>
                                        <label className="block text-slate-700 text-sm font-medium mb-1 dark:text-slate-300">Tolerancia de Cierre</label>
                                        <input aria-label="Tolerancia de Cierre" 
                                            type="number" 
                                            step="0.01" 
                                            className="input-base" 
                                            value={formData.cash.tolerance}
                                            onChange={(e) => isMasterUser && setFormData({ ...formData, cash: { ...formData.cash, tolerance: Number(e.target.value || 0) } })}
                                            readOnly={!isMasterUser} 
                                        />
                                        <p className="text-xs text-ink-muted mt-1">Margen máximo aceptable en cuadres de caja antes de disparar avisos.</p>
                                    </div>

                                    <div>
                                        <label className="block text-slate-700 text-sm font-medium mb-1 dark:text-slate-300">Permiso Especial Supervisor</label>
                                        <div className="flex items-center gap-3 mt-3">
                                            <button 
                                                type="button" 
                                                onClick={() => isMasterUser && setFormData({ ...formData, cash: { ...formData.cash, requireSupervisorBeyondTolerance: !formData.cash.requireSupervisorBeyondTolerance } })} 
                                                disabled={!isMasterUser} 
                                                role="switch" aria-checked={!!formData.cash.requireSupervisorBeyondTolerance} aria-label="Requerir supervisor fuera de tolerancia"
                                                className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors focus:outline-none ${formData.cash.requireSupervisorBeyondTolerance ? 'bg-brand-600' : 'bg-slate-300'}`}
                                            >
                                                <span className={`inline-block w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${formData.cash.requireSupervisorBeyondTolerance ? 'translate-x-5' : 'translate-x-1'}`} />
                                            </button>
                                            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Requerir PIN supervisor si se excede la tolerancia.</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="border-t border-slate-100 pt-4 dark:border-slate-800 space-y-4">
                                    <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Cajas y Terminales Registradas</h4>
                                    <div className="space-y-3">
                                        {(formData.cash.registers || []).map((r, idx) => (
                                            <div key={r.id || idx} className="grid grid-cols-1 md:grid-cols-5 gap-2 items-center rounded-lg border border-slate-100 p-3 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/30">
                                                <input aria-label="Código Terminal (Ej. REG-1)" 
                                                    className="input-base md:col-span-2" 
                                                    placeholder="Código Terminal (Ej. REG-1)" 
                                                    value={r.id || ''}
                                                    onChange={(e) => {
                                                        if (!isMasterUser) return;
                                                        const regs = [...(formData.cash.registers || [])];
                                                        regs[idx] = { ...regs[idx], id: e.target.value };
                                                        setFormData({ ...formData, cash: { ...formData.cash, registers: regs } });
                                                    }}
                                                    readOnly={!isMasterUser} 
                                                />
                                                <input aria-label="Nombre de la Terminal" 
                                                    className="input-base md:col-span-2" 
                                                    placeholder="Nombre de la Terminal" 
                                                    value={r.name || ''}
                                                    onChange={(e) => {
                                                        if (!isMasterUser) return;
                                                        const regs = [...(formData.cash.registers || [])];
                                                        regs[idx] = { ...regs[idx], name: e.target.value };
                                                        setFormData({ ...formData, cash: { ...formData.cash, registers: regs } });
                                                    }}
                                                    readOnly={!isMasterUser} 
                                                />
                                                <div className="flex items-center justify-between px-1">
                                                    <div className="flex items-center gap-2">
                                                        <input 
                                                            type="checkbox" 
                                                            id={`reg-enabled-${idx}`}
                                                            checked={!!r.enabled} 
                                                            onChange={(e) => {
                                                                if (!isMasterUser) return;
                                                                const regs = [...(formData.cash.registers || [])];
                                                                regs[idx] = { ...regs[idx], enabled: !!e.target.checked };
                                                                setFormData({ ...formData, cash: { ...formData.cash, registers: regs } });
                                                            }} 
                                                            disabled={!isMasterUser} 
                                                            className="h-4 w-4 rounded text-brand-600 focus:ring-brand-500"
                                                        />
                                                        <label htmlFor={`reg-enabled-${idx}`} className="text-xs text-slate-500 dark:text-slate-400 font-medium">Activo</label>
                                                    </div>
                                                    {isMasterUser && (
                                                        <button 
                                                            type="button" 
                                                            className="text-red-500 hover:text-red-700 text-xs font-semibold p-1" 
                                                            onClick={() => {
                                                                const regs = [...(formData.cash.registers || [])];
                                                                regs.splice(idx, 1);
                                                                setFormData({ ...formData, cash: { ...formData.cash, registers: regs } });
                                                            }}
                                                        >
                                                            <Trash size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}

                                        {isMasterUser && (
                                            <button 
                                                type="button" 
                                                className="inline-flex items-center gap-1 text-xs text-brand-600 font-semibold hover:text-brand-800 mt-2" 
                                                onClick={() => setFormData({ 
                                                    ...formData, 
                                                    cash: { 
                                                        ...formData.cash, 
                                                        registers: [...(formData.cash.registers || []), { id: `REG-${(formData.cash.registers?.length || 0) + 1}`, name: '', enabled: true }] 
                                                    } 
                                                })}
                                            >
                                                <Plus size={14} /> Añadir caja/terminal
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="border-t border-slate-100 pt-4 dark:border-slate-800 space-y-4">
                                    <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Impresora de Tickets Térmicos</h4>
                                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                                        <div>
                                            <label className="block text-slate-700 text-sm font-medium mb-1 dark:text-slate-300">Modo de Impresión</label>
                                            <select aria-label="Modo de Impresión" 
                                                className="input-base" 
                                                value={formData.cash.printing?.mode || 'html'} 
                                                onChange={(e) => isMasterUser && setFormData({ 
                                                    ...formData, 
                                                    cash: { 
                                                        ...formData.cash, 
                                                        printing: { ...(formData.cash.printing || {}), mode: e.target.value } 
                                                    } 
                                                })} 
                                                disabled={!isMasterUser}
                                            >
                                                <option value="html">HTML (Estándar del Navegador)</option>
                                                <option value="escpos">ESC/POS (Impresión Térmica Directa)</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-slate-700 text-sm font-medium mb-1 dark:text-slate-300">Nombre del Dispositivo Impresora</label>
                                            {systemPrinters.length > 0 ? (
                                                <select aria-label="Usar Predeterminada del Sistema" 
                                                    className="input-base" 
                                                    value={formData.cash.printing?.printerName || ''} 
                                                    onChange={(e) => isMasterUser && setFormData({ 
                                                        ...formData, 
                                                        cash: { 
                                                            ...formData.cash, 
                                                            printing: { ...(formData.cash.printing || {}), printerName: e.target.value } 
                                                        } 
                                                    })} 
                                                    disabled={!isMasterUser}
                                                >
                                                    <option value="">-- Usar Predeterminada del Sistema --</option>
                                                    {systemPrinters.map(p => <option key={p} value={p}>{p}</option>)}
                                                </select>
                                            ) : (
                                                <input aria-label="Introduce el nombre exacto de la impresora térmica" 
                                                    className="input-base" 
                                                    value={formData.cash.printing?.printerName || ''} 
                                                    onChange={(e) => isMasterUser && setFormData({ 
                                                        ...formData, 
                                                        cash: { 
                                                            ...formData.cash, 
                                                            printing: { ...(formData.cash.printing || {}), printerName: e.target.value } 
                                                        } 
                                                    })} 
                                                    readOnly={!isMasterUser} 
                                                    placeholder="Introduce el nombre exacto de la impresora térmica" 
                                                />
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {isMasterUser && (
                                    <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
                                        <Button onClick={() => handleSaveSettings()} className="flex items-center gap-2">
                                            <Save size={16} /> Guardar Configuración de Caja
                                        </Button>
                                    </div>
                                )}
                            </CardBody>
                        </Card>
                    )}

                    {/* Modo de Pedidos */}
                    {activeTab === 'pedidos' && (
                        <Card>
                            <CardBody className="space-y-6">
                                <div className="border-b border-slate-100 pb-3 dark:border-slate-800">
                                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Modo de Pedidos</h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">Controla cómo opera la lógica de empaque y distribución del comercio.</p>
                                </div>

                                <div className="space-y-4">
                                    {(formData.availableOrderModes || ['craft']).length > 1 ? (
                                        <div className="space-y-3">
                                            <span className="text-sm text-slate-700 font-medium dark:text-slate-300">Elige el flujo de facturación activo:</span>
                                            <div className="flex flex-wrap gap-2 max-w-md">
                                                {(formData.availableOrderModes || ['craft']).map(mode => (
                                                    <button
                                                        key={mode}
                                                        type="button"
                                                        onClick={() => setFormData(prev => ({ ...prev, orderMode: mode }))}
                                                        className={`flex-1 min-w-[150px] px-4 py-3 rounded-xl border text-sm font-semibold transition-all shadow-sm ${
                                                            formData.orderMode === mode
                                                                ? 'bg-brand-600 border-brand-600 text-white dark:bg-brand-700'
                                                                : 'bg-surface border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400'
                                                        }`}
                                                    >
                                                        {mode === 'craft' ? '🏪 Modo Tienda Craft' : '📦 Modo Distribuidor'}
                                                    </button>
                                                ))}
                                            </div>
                                            <p className="text-xs text-slate-400 mt-2">
                                                * El **Modo Craft** habilita despacho directo e inventario unificado. El **Modo Distribuidor** agrega workflows logísticos.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-2 rounded-xl bg-slate-50 dark:bg-slate-900/40 p-4 border border-slate-100 dark:border-slate-800">
                                            <div className="flex items-center gap-3">
                                                <span className="text-sm text-slate-700 font-medium dark:text-slate-300">Modo de pedidos activo:</span>
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-brand-100 text-brand-800 dark:bg-brand-950 dark:text-brand-400">
                                                    {formData.orderMode === 'craft' ? '🏪 Modo Tienda Craft' : '📦 Modo Distribuidor'}
                                                </span>
                                            </div>
                                            <span className="text-xs text-ink-muted mt-1">El propietario de la licencia SaaS administra la disponibilidad de los modos de negocio avanzados.</span>
                                        </div>
                                    )}
                                </div>

                                {isMasterUser && (
                                    <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
                                        <Button onClick={() => handleSaveSettings()} className="flex items-center gap-2">
                                            <Save size={16} /> Guardar Modo de Pedidos
                                        </Button>
                                    </div>
                                )}
                            </CardBody>
                        </Card>
                    )}

                    {/* Clientes y Precios */}
                    {activeTab === 'clientes' && (
                        <Card>
                            <CardBody className="space-y-6">
                                <div className="border-b border-slate-100 pb-3 dark:border-slate-800">
                                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Clientes: Categorías y Reglas de Precio</h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">Crea categorías de descuento institucional que se aplicarán automáticamente a clientes vinculados.</p>
                                </div>

                                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 items-start">
                                    {/* Categories list editor */}
                                    <div className="space-y-3">
                                        <label className="block text-slate-700 text-sm font-semibold dark:text-slate-300">Lista de Categorías de Cliente</label>
                                        <div className="space-y-2">
                                            {(formData.customerCategories || []).map((cat, idx) => (
                                                <div key={idx} className="flex items-center gap-2">
                                                    <input
                                                        className="input-base flex-1"
                                                        value={cat}
                                                        onChange={(e) => {
                                                            if (!isMasterUser) return;
                                                            const val = e.target.value;
                                                            const arr = [...(formData.customerCategories || [])];
                                                            const old = arr[idx];
                                                            arr[idx] = val;
                                                            
                                                            const discounts = { ...(formData.pricing?.categoryDiscounts || {}) };
                                                            if (old && old !== val && discounts.hasOwnProperty(old)) {
                                                                discounts[val] = discounts[old];
                                                                delete discounts[old];
                                                            }
                                                            
                                                            if (old && old !== val) {
                                                                setPendingMigrations(prev => {
                                                                    const others = prev.filter(m => !(m.from === old));
                                                                    return [...others, { from: old, to: val }];
                                                                });
                                                            }
                                                            
                                                            setFormData({ 
                                                                ...formData, 
                                                                customerCategories: arr, 
                                                                pricing: { ...(formData.pricing || {}), categoryDiscounts: discounts } 
                                                            });
                                                        }}
                                                        readOnly={!isMasterUser}
                                                    />
                                                    {isMasterUser && (
                                                        <button
                                                            type="button"
                                                            className="text-red-500 hover:text-red-700 text-xs font-semibold p-2"
                                                            onClick={async () => {
                                                                const name = formData.customerCategories[idx];
                                                                if (!(await confirmDialog(`¿Eliminar la categoría "${name}"?`, { confirmText: 'Eliminar' }))) return;
                                                                const arr = [...(formData.customerCategories || [])];
                                                                arr.splice(idx, 1);
                                                                
                                                                const discounts = { ...(formData.pricing?.categoryDiscounts || {}) };
                                                                if (discounts.hasOwnProperty(name)) delete discounts[name];
                                                                
                                                                if (arr.length > 0 && await confirmDialog('¿Quieres reasignar los clientes de esta categoría a otra?', { title: 'Reasignar clientes', confirmText: 'Reasignar', cancelText: 'No', danger: false })) {
                                                                    const dest = window.prompt(`Ingresa el nombre de la nueva categoría destino exacto: (${arr.join(', ')})`, arr[0]);
                                                                    if (dest && arr.includes(dest)) {
                                                                        setPendingMigrations(prev => [...prev.filter(m => m.from !== name), { from: name, to: dest }]);
                                                                    }
                                                                }
                                                                
                                                                setFormData({ 
                                                                    ...formData, 
                                                                    customerCategories: arr, 
                                                                    pricing: { ...(formData.pricing || {}), categoryDiscounts: discounts } 
                                                                });
                                                            }}
                                                        >
                                                            Eliminar
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                            {isMasterUser && (
                                                <button
                                                    type="button"
                                                    className="inline-flex items-center gap-1 text-xs text-brand-600 font-semibold hover:text-brand-800 mt-1"
                                                    onClick={() => {
                                                        const base = 'Nueva Categoría';
                                                        let name = base;
                                                        const set = new Set((formData.customerCategories || []));
                                                        let i = 1;
                                                        while (set.has(name)) { name = `${base} ${i++}`; }
                                                        setFormData({ ...formData, customerCategories: [...(formData.customerCategories || []), name] });
                                                    }}
                                                >
                                                    <Plus size={14} /> Añadir categoría
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Discounts percentages */}
                                    <div className="space-y-3">
                                        <label className="block text-slate-700 text-sm font-semibold dark:text-slate-300">Descuentos por Categoría (%)</label>
                                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                                            {(formData.customerCategories || []).map((cat) => {
                                                const val = Number((formData.pricing?.categoryDiscounts || {})[cat] ?? 0);
                                                return (
                                                    <div key={cat} className="grid grid-cols-3 gap-2 items-center p-2 rounded-lg bg-slate-50 dark:bg-slate-900/30">
                                                        <div className="col-span-2 text-sm text-slate-700 dark:text-slate-300 truncate font-medium" title={cat}>{cat}</div>
                                                        <div className="relative">
                                                            <input
                                                                type="number"
                                                                className="input-base pr-6 text-right"
                                                                min={0}
                                                                max={100}
                                                                step={0.5}
                                                                value={isNaN(val) ? 0 : val}
                                                                onChange={(e) => {
                                                                    if (!isMasterUser) return;
                                                                    let v = parseFloat(e.target.value);
                                                                    if (isNaN(v)) v = 0;
                                                                    v = Math.max(0, Math.min(100, v));
                                                                    setFormData({
                                                                        ...formData,
                                                                        pricing: {
                                                                            ...(formData.pricing || {}),
                                                                            categoryDiscounts: { ...(formData.pricing?.categoryDiscounts || {}), [cat]: v }
                                                                        }
                                                                    });
                                                                }}
                                                                readOnly={!isMasterUser}
                                                            />
                                                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">%</span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                {isMasterUser && (
                                    <div className="mt-4 border-t pt-4 border-slate-100 dark:border-slate-800 space-y-4">
                                        <div className="flex items-center gap-2">
                                            <input 
                                                id="applyMigrations" 
                                                type="checkbox" 
                                                className="h-4 w-4 rounded text-brand-600 focus:ring-brand-500" 
                                                checked={applyMigrations} 
                                                onChange={(e) => setApplyMigrations(!!e.target.checked)} 
                                            />
                                            <label htmlFor="applyMigrations" className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                                                Aplicar re-nombramiento y actualización de descuentos a todos los clientes existentes en base de datos.
                                            </label>
                                        </div>
                                        {pendingMigrations.length > 0 && (
                                            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 dark:bg-amber-950/20 dark:border-amber-900/40 dark:text-amber-300">
                                                <p className="font-semibold flex items-center gap-1.5"><AlertTriangle size={14} /> Re-asignaciones pendientes al guardar:</p>
                                                <ul className="list-disc list-inside mt-1 space-y-0.5 border-b border-amber-200 pb-2 dark:border-amber-900/40">
                                                    {pendingMigrations.map((m, i) => (
                                                        <li key={`${m.from}->${m.to}-${i}`}>{m.from} → {m.to}</li>
                                                    ))}
                                                </ul>
                                                <button type="button" className="text-brand-600 dark:text-brand-400 font-semibold mt-2 hover:underline" onClick={() => setPendingMigrations([])}>Limpiar cola de migraciones</button>
                                            </div>
                                        )}
                                        
                                        <div className="flex justify-end pt-2">
                                            <Button onClick={() => handleSaveSettings()} className="flex items-center gap-2">
                                                <Save size={16} /> Guardar Categorías y Precios
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </CardBody>
                        </Card>
                    )}

                    {/* Talonarios NCF */}
                    {activeTab === 'talonarios' && (
                        <div className="space-y-6">
                            <Card>
                                <CardBody className="flex flex-wrap items-center justify-between gap-4">
                                    <div>
                                        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Talonarios y Secuencias Manuales (NCF)</h3>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">Configura prefijos, límites de inicio y fin de secuencias impresas en papel.</p>
                                    </div>
                                    <Button variant="secondary" onClick={() => setShowNcfModal(true)} className="flex items-center gap-2">
                                        <Settings size={16} /> Configurar Secuencias NCF
                                    </Button>
                                </CardBody>
                            </Card>

                            {alertSequences.length > 0 && (
                                <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900/60 dark:bg-amber-950/20">
                                    <CardBody className="flex flex-col gap-3">
                                        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-semibold">
                                            <AlertTriangle size={18} />
                                            <span>Secuencias de Talonarios Próximas a Agotarse (Disponibles &lt; 10)</span>
                                        </div>
                                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                            {alertSequences.map(seq => {
                                                const remaining = Number(seq.end || 0) - Number(seq.next || seq.start || 1) + 1;
                                                const exhausted = Number(seq.next || 0) > Number(seq.end || 0);
                                                return (
                                                    <div key={seq.code} className="rounded-xl border border-amber-200 bg-surface p-3 text-xs dark:border-amber-800/40 dark:bg-slate-900">
                                                        <p className="font-semibold text-slate-900 dark:text-slate-100">{seq.name}</p>
                                                        <div className="mt-1 text-ink-muted space-y-0.5">
                                                            <p>Próximo NCF: <span className="font-mono text-slate-800 dark:text-slate-300 font-semibold">{seq.prefix}{String(seq.next).padStart(8, '0')}</span></p>
                                                            <p>Rango Fin: <span className="font-mono text-slate-600 dark:text-slate-400">{seq.prefix}{String(seq.end).padStart(8, '0')}</span></p>
                                                        </div>
                                                        <p className={`mt-2 font-semibold ${exhausted ? 'text-red-600' : 'text-amber-600'}`}>
                                                            {exhausted ? 'Secuencia agotada' : `${remaining} comprobantes disponibles`}
                                                        </p>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </CardBody>
                                </Card>
                            )}

                            <Card>
                                <CardBody className="overflow-x-auto">
                                    <table className="w-full min-w-[700px] text-left text-sm">
                                        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-600 dark:bg-slate-900/60 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                                            <tr>
                                                <th className="p-3">Comprobante DGII</th>
                                                <th className="p-3">Prefijo</th>
                                                <th className="p-3 text-right">Inicio</th>
                                                <th className="p-3 text-right">Fin</th>
                                                <th className="p-3 text-right">Siguiente</th>
                                                <th className="p-3">Estado</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {(formData.ncfSequences || []).length > 0 ? (
                                                formData.ncfSequences.map(seq => {
                                                    const remaining = Number(seq.end || 0) - Number(seq.next || seq.start || 1) + 1;
                                                    const exhausted = Number(seq.next || 0) > Number(seq.end || 0);
                                                    return (
                                                        <tr key={seq.code} className="hover:bg-slate-50/40 dark:hover:bg-slate-900/10">
                                                            <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{seq.name}</td>
                                                            <td className="p-3 font-mono text-xs font-bold text-ink-muted">{seq.prefix}</td>
                                                            <td className="p-3 text-right">{seq.start}</td>
                                                            <td className="p-3 text-right">{seq.end}</td>
                                                            <td className="p-3 text-right font-bold text-brand-600 dark:text-brand-400">{seq.next}</td>
                                                            <td className="p-3">
                                                                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                                                    exhausted 
                                                                        ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400' 
                                                                        : seq.active 
                                                                            ? 'bg-success-100 text-success-700 dark:bg-success-950/40 dark:text-success-400' 
                                                                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                                                }`}>
                                                                    {exhausted ? 'Agotado' : seq.active ? 'Activo' : 'Inactivo'}
                                                                </span>
                                                                <p className="mt-1 text-xs text-slate-400 font-medium">
                                                                    {remaining > 0 ? `${remaining} disponibles` : 'Renovar secuencia'}
                                                                </p>
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            ) : (
                                                <tr>
                                                    <td colSpan={6} className="text-center p-6 text-slate-400 font-medium text-xs">
                                                        No hay secuencias registradas. Haz clic en "Configurar Secuencias NCF" para inicializarlas.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </CardBody>
                            </Card>
                        </div>
                    )}

                    {/* Configuración e-CF */}
                    {activeTab === 'ecf' && (
                        <div className="space-y-6">
                            <EcfConfigPanel />
                        </div>
                    )}

                    {/* Servicio de Correo */}
                    {activeTab === 'correo' && (
                        <Card>
                            <CardBody className="space-y-6">
                                <div className="border-b border-slate-100 pb-3 dark:border-slate-800">
                                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Configuración de Correo SMTP</h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">Configura tu propio servidor de correo profesional SMTP para enviar facturas, recibos, cotizaciones y estados de cuenta a tus clientes.</p>
                                </div>

                                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                                    <div>
                                        <label className="block text-slate-700 text-sm font-semibold mb-2 dark:text-slate-300">Servidor SMTP (Host)</label>
                                        <input aria-label="Servidor SMTP (Host)" 
                                            type="text" 
                                            className="input-base" 
                                            placeholder="smtp.gmail.com"
                                            value={formData.smtp?.host || ''}
                                            onChange={(e) => isMasterUser && setFormData({ 
                                                ...formData, 
                                                smtp: { ...(formData.smtp || {}), host: e.target.value } 
                                            })}
                                            readOnly={!isMasterUser}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-slate-700 text-sm font-semibold mb-2 dark:text-slate-300">Puerto SMTP</label>
                                        <input aria-label="Puerto SMTP" 
                                            type="number" 
                                            className="input-base" 
                                            placeholder="587"
                                            value={formData.smtp?.port || ''}
                                            onChange={(e) => isMasterUser && setFormData({ 
                                                ...formData, 
                                                smtp: { ...(formData.smtp || {}), port: e.target.value } 
                                            })}
                                            readOnly={!isMasterUser}
                                        />
                                    </div>

                                    <div className="flex items-center pt-8">
                                        <label className="flex items-center gap-2 text-slate-700 text-sm font-semibold dark:text-slate-300 cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                className="rounded border-slate-300 text-brand-600 focus:border-brand-300 focus:ring focus:ring-brand-200 focus:ring-opacity-50"
                                                checked={!!formData.smtp?.secure}
                                                onChange={(e) => isMasterUser && setFormData({ 
                                                    ...formData, 
                                                    smtp: { ...(formData.smtp || {}), secure: e.target.checked } 
                                                })}
                                                disabled={!isMasterUser}
                                            />
                                            Usar SSL/TLS (Puerto 465)
                                        </label>
                                    </div>

                                    <div>
                                        <label className="block text-slate-700 text-sm font-semibold mb-2 dark:text-slate-300">Usuario SMTP (Correo)</label>
                                        <input aria-label="Usuario SMTP (Correo)" 
                                            type="text" 
                                            className="input-base font-mono" 
                                            placeholder="facturas@miempresa.com"
                                            value={formData.smtp?.user || ''}
                                            onChange={(e) => isMasterUser && setFormData({ 
                                                ...formData, 
                                                smtp: { ...(formData.smtp || {}), user: e.target.value } 
                                            })}
                                            readOnly={!isMasterUser}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-slate-700 text-sm font-semibold mb-2 dark:text-slate-300">Contraseña SMTP</label>
                                        <input aria-label="Contraseña SMTP" 
                                            type="password" 
                                            className="input-base font-mono" 
                                            placeholder="••••••••••••••••"
                                            value={formData.smtp?.pass || ''}
                                            onChange={(e) => isMasterUser && setFormData({ 
                                                ...formData, 
                                                smtp: { ...(formData.smtp || {}), pass: e.target.value } 
                                            })}
                                            readOnly={!isMasterUser}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-slate-700 text-sm font-semibold mb-2 dark:text-slate-300">Remitente (From Email)</label>
                                        <input aria-label="Remitente (From Email)" 
                                            type="text" 
                                            className="input-base" 
                                            placeholder="Mi Empresa &lt;facturas@miempresa.com&gt;"
                                            value={formData.smtp?.from || ''}
                                            onChange={(e) => isMasterUser && setFormData({ 
                                                ...formData, 
                                                smtp: { ...(formData.smtp || {}), from: e.target.value } 
                                            })}
                                            readOnly={!isMasterUser}
                                        />
                                    </div>
                                </div>

                                <div className="text-xs text-slate-400 border-t border-slate-100 pt-4 dark:border-slate-800">
                                    💡 <strong>Nota:</strong> Si no tienes un correo SMTP profesional o dejas estos campos vacíos, el sistema utilizará automáticamente el enlace <strong>Mailto:</strong> para abrir el cliente de correo local predeterminado de tu dispositivo (Outlook, Mail, Gmail, etc.) al enviar documentos.
                                </div>

                                {isMasterUser && (
                                    <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
                                        <Button onClick={() => handleSaveSettings()} className="flex items-center gap-2">
                                            <Save size={16} /> Guardar Configuración SMTP
                                        </Button>
                                    </div>
                                )}

                                {/* Probar Conexión */}
                                <div className="border-t border-slate-100 pt-6 dark:border-slate-800 space-y-4">
                                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Probar Conexión de Envío</h4>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        Ingresa una dirección de correo para enviar un mensaje de prueba con tus credenciales SMTP activas.
                                    </p>
                                    <div className="flex gap-2 max-w-md">
                                        <input aria-label="correo-prueba@destinatario.com"
                                            type="email"
                                            value={testEmail}
                                            onChange={(e) => setTestEmail(e.target.value)}
                                            placeholder="correo-prueba@destinatario.com"
                                            className="input-base flex-1"
                                            disabled={testEmailLoading}
                                        />
                                        <Button 
                                            onClick={handleTestEmail} 
                                            disabled={testEmailLoading || !isMasterUser} 
                                            variant="secondary"
                                            className="whitespace-nowrap"
                                        >
                                            {testEmailLoading ? 'Probando...' : 'Probar Envío'}
                                        </Button>
                                    </div>
                                </div>
                            </CardBody>
                        </Card>
                    )}
                </div>
            </div>

            {/* Manual-only NcfModal overlay */}
            {showNcfModal && (
                <NcfModal
                    companyProfile={formData}
                    onClose={() => setShowNcfModal(false)}
                    onSave={handleSaveNcf}
                    isMasterUser={isMasterUser}
                />
            )}
        </div>
    );
};

export default SettingsViewSQL;
