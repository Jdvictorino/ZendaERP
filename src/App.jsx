import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Edit } from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';

// --- Importaciones de API y Componentes ---
import api, { auth as authApi, settings as settingsApi, clearTokens, setTokens } from './api/client.js';
import { initTheme } from './utils/theme.js';
import LoginScreen from './components/LoginScreen.jsx';
import RegistrationFlow from './components/registration/RegistrationFlow.jsx';
import ForgotPasswordModal from './components/modals/ForgotPasswordModal.jsx';
import Sidebar from './components/Sidebar.jsx';
import Header from './components/Header.jsx';
import DashboardView from './views/DashboardViewSQL.jsx';
import ProductsView from './views/ProductsViewSQL.jsx';
import CustomersView from './views/CustomersViewSQL.jsx';
import SuppliersView from './views/SuppliersViewSQL.jsx';
import OrdersView from './views/OrdersViewSQL.jsx';
import POSBillingOrdersView from './views/POSBillingOrdersView.jsx';
import InvoicesView from './views/InvoicesViewSQL.jsx';
import OffersView from './views/OffersViewSQL.jsx';
import ShiftsView from './views/ShiftsViewSQL.jsx';
import ExpensesView from './views/ExpensesViewSQL.jsx';
import SalesReportsView from './views/ReportsViewSQL.jsx';
import AccountsReceivableView from './views/AccountsReceivableViewSQL.jsx';
import AccountsPayableView from './views/AccountsPayableViewSQL.jsx';
import FiscalManagementView from './views/FiscalManagementViewSQL.jsx';
import UsersView from './views/UsersViewSQL.jsx';
import ProductsImportView from './views/ProductsImportViewSQL.jsx';
import { setNotificationSoundSettings } from './utils/soundPlayer.js';
import { canAccessView } from './utils/permissions.js';
import AccountingView from './views/AccountingViewSQL.jsx';
import ShipmentsView from './views/ShipmentsViewSQL.jsx';
import DeliveryConfirmView from './views/DeliveryConfirmViewSQL.jsx';
import MobileScannerView from './views/MobileScannerView.jsx';
import CompanyProfileView from './views/CompanyProfileViewSQL.jsx';
import SettingsView from './views/SettingsViewSQL.jsx';
import PlatformBillingControlView from './views/PlatformBillingControlView.jsx';
import useOverdueInvoiceChecker from './hooks/useOverdueInvoiceChecker.js';
import MobileNavBar from './components/ui/MobileNavBar.jsx';
import MobileMenuDrawer from './components/ui/MobileMenuDrawer.jsx';
import { useNavigationItems } from './hooks/useNavigationItems.js';

const INACTIVITY_LIMIT_MS = 30 * 60 * 1000;
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];

export default function App() {
    // --- Estados de la Aplicación ---
    const [view, setView] = useState('dashboard');
    const [user, setUser] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [authError, setAuthError] = useState(null);
    const [companyProfile, setCompanyProfile] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // Inicializar tema al montar la aplicación
    useEffect(() => {
        initTheme();
    }, []);

    // Ruta pública para confirmar entrega desde QR (accesible sin login)
    if (typeof window !== 'undefined' && window.location.pathname === '/delivery/confirm') {
        return <DeliveryConfirmView />;
    }

    if (typeof window !== 'undefined' && window.location.pathname === '/mobile-scanner') {
        return <MobileScannerView />;
    }

    if (typeof window !== 'undefined' && window.location.pathname === '/platform-billing') {
        return <PlatformBillingControlView />;
    }

    // Verificar sesión existente al cargar
    useEffect(() => {
        const checkAuth = async () => {
            try {
                const savedUser = authApi.getCurrentUser();
                const hasToken = authApi.isAuthenticated();
                
                if (savedUser && hasToken) {
                    // Verificar que el token sigue siendo válido
                    try {
                        const profile = await authApi.getProfile();
                        setUser(profile.user || profile);
                        
                        // Cargar configuración de la empresa
                        const settings = await settingsApi.get();
                        setCompanyProfile(settings);
                    } catch (err) {
                        // Token inválido, limpiar sesión
                        console.warn('Sesión expirada:', err);
                        clearTokens();
                        setUser(null);
                    }
                }
            } catch (err) {
                console.error('Error verificando autenticación:', err);
            } finally {
                setIsAuthReady(true);
            }
        };
        
        checkAuth();
    }, []);

    const handleLogout = useCallback(async () => {
        try {
            await authApi.logout();
        } catch (err) {
            console.warn('Error en logout:', err);
        }
        setUser(null);
        setCompanyProfile({});
        toast.success('Sesión cerrada');
    }, []);

    const inactivityTimerRef = useRef(null);

    const clearInactivityTimer = useCallback(() => {
        if (inactivityTimerRef.current) {
            clearTimeout(inactivityTimerRef.current);
            inactivityTimerRef.current = null;
        }
    }, []);

    const triggerSessionTimeout = useCallback(() => {
        if (!user) return;
        clearInactivityTimer();
        toast('Por seguridad, tu sesión se cerró tras 30 minutos de inactividad.');
        handleLogout();
    }, [user, handleLogout, clearInactivityTimer]);

    const scheduleInactivityTimer = useCallback(() => {
        clearInactivityTimer();
        inactivityTimerRef.current = setTimeout(triggerSessionTimeout, INACTIVITY_LIMIT_MS);
    }, [clearInactivityTimer, triggerSessionTimeout]);

    const registerActivity = useCallback(() => {
        if (!user) return;
        scheduleInactivityTimer();
    }, [user, scheduleInactivityTimer]);

    useEffect(() => {
        const soundConfig = companyProfile?.notifications?.sound || {};
        setNotificationSoundSettings({
            enabled: soundConfig.enabled ?? true,
            volume: typeof soundConfig.volume === 'number' ? soundConfig.volume : undefined,
        });
    }, [companyProfile]);

    useEffect(() => {
        if (!user) {
            clearInactivityTimer();
            return;
        }

        ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, registerActivity));
        scheduleInactivityTimer();

        return () => {
            clearInactivityTimer();
            ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, registerActivity));
        };
    }, [user, registerActivity, scheduleInactivityTimer, clearInactivityTimer]);

    const handleLogin = async (email, password) => {
        setAuthError(null);
        setIsLoading(true);
        try {
            const result = await authApi.login(email, password);
            setUser(result.user);
            
            // Cargar configuración de la empresa
            try {
                const settings = await settingsApi.get();
                setCompanyProfile(settings);
            } catch (settingsErr) {
                console.warn('No se pudo cargar configuración:', settingsErr);
            }
            
            toast.success('¡Bienvenido!');
        } catch (error) {
            console.error("Error de autenticación:", error);
            if (error.status === 401) {
                setAuthError('Correo electrónico o contraseña incorrectos.');
            } else if (error.status === 402) {
                setAuthError(error.message || 'El acceso de tu empresa está bloqueado por estado de pago.');
            } else {
                setAuthError(error.message || 'Ocurrió un error al iniciar sesión.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    // --- Flujo de registro ---
    const [showRegister, setShowRegister] = useState(false);
    const [isFinalizing, setIsFinalizing] = useState(false);
    const [showForgotModal, setShowForgotModal] = useState(false);
    const [forgotEmail, setForgotEmail] = useState('');
    const [progressStep, setProgressStep] = useState(0);
    const [progressMessage, setProgressMessage] = useState('');
    const [autoEditUserId, setAutoEditUserId] = useState(null);
    const [autoEditReturnView, setAutoEditReturnView] = useState(null);



    // Finalizar registro usando la API de PostgreSQL
    const finalizeRegistration = async (adminData, companyData) => {
        if (!adminData || !companyData) {
            toast.error('Faltan datos del administrador o de la empresa.');
            return;
        }

        setIsFinalizing(true);
        try {
            setProgressStep(1);
            setProgressMessage('Creando cuenta...');

            const result = await authApi.register({
                email: adminData.email,
                password: adminData.password,
                firstName: adminData.firstName || '',
                lastName: adminData.lastName || '',
                companyName: companyData.name || companyData.companyName || '',
                businessType: companyData.businessType || 'otro',
                phone: adminData.phone || companyData.phone || '',
                photoUrl: adminData.photoURL || undefined,
                companyLogo: companyData.logo || undefined,
            });

            setProgressStep(2);
            setProgressMessage('Configurando empresa...');

            try {
                await settingsApi.update({
                    companyName: companyData.name || companyData.companyName,
                    rnc: companyData.rnc || companyData.taxId || '',
                    phone: companyData.phone || '',
                    email: companyData.email || '',
                    address: companyData.address || '',
                    currency: companyData.currency || 'DOP',
                    logo: companyData.logo || null,
                });
            } catch (settingsErr) {
                console.warn('No se pudo guardar configuración de empresa:', settingsErr);
            }

            setProgressStep(3);
            setProgressMessage('¡Listo!');

            setShowRegister(false);
            setUser(result.user);

            try {
                const settings = await settingsApi.get();
                setCompanyProfile(settings);
            } catch (e) {}

            toast.success('¡Registro completado exitosamente!');
        } catch (err) {
            console.error('Error finalizando registro:', err);
            if (err.status === 409) {
                toast.error('El correo electrónico ya está registrado.');
            } else {
                toast.error(err.message || 'No se pudo crear la cuenta. Intenta de nuevo.');
            }
        } finally {
            setIsFinalizing(false);
            setProgressMessage('');
            setProgressStep(0);
        }
    };

    const handleOpenForgot = (email) => {
        setShowForgotModal(true);
        setForgotEmail(email || '');
    };

    const handleSendReset = async (emailToSend) => {
        try {
            // TODO: Implementar endpoint de recuperación de contraseña en la API
            await api.post('/auth/forgot-password', { email: emailToSend });
            toast.success('Correo para restablecer contraseña enviado.');
            setShowForgotModal(false);
        } catch (err) {
            console.error('Error enviando reset:', err);
            toast.error('No se pudo enviar el correo de recuperación.');
        }
    };



    const handleProfileUpdate = (updatedData) => {
        setCompanyProfile(prevProfile => ({
            ...prevProfile,
            ...updatedData
        }));
        toast.success("Perfil actualizado.");
    };

    // Función para actualizar el usuario actual cuando se modifica desde gestión de usuarios
    const handleCurrentUserUpdate = (updatedUserData) => {
        if (updatedUserData && user && (String(updatedUserData.id) === String(user.id))) {
            setUser(prevUser => ({
                ...prevUser,
                ...updatedUserData
            }));
            // También actualizar localStorage
            const storedUser = authApi.getCurrentUser();
            if (storedUser) {
                localStorage.setItem('user', JSON.stringify({ ...storedUser, ...updatedUserData }));
            }
        }
    };

    // El perfil del usuario actual viene directamente del estado user
    const currentUserProfile = useMemo(() => {
        if (!user) return null;
        return {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role || 'admin',
            isAdmin: user.isAdmin,
            ...user
        };
    }, [user]);

    const isMasterUser = user?.isAdmin || user?.role === 'admin';
    const currentRole = currentUserProfile?.role || 'viewer';
    const navItems = useNavigationItems(currentRole, isMasterUser);

    const previousViewRef = useRef('dashboard');

    const setViewWithGuard = useCallback((targetView) => {
        if (!targetView) return;
        if (!canAccessView(currentRole, targetView)) {
            toast.error('No tienes permiso para acceder a esta sección.');
            return;
        }
        if (targetView === 'company-profile' && view !== 'company-profile') {
            previousViewRef.current = view;
        }
        setView(targetView);
    }, [currentRole, view]);

    const handleOpenCurrentUserProfile = useCallback(() => {
        if (!user?.id) return;
        setAutoEditUserId(user.id);
        setAutoEditReturnView(view);
        setViewWithGuard('users');
    }, [user, view, setViewWithGuard]);

    const handleAutoEditClose = useCallback(() => {
        const returnView = autoEditReturnView;
        setAutoEditUserId(null);
        setAutoEditReturnView(null);
        if (returnView && returnView !== 'users') {
            setViewWithGuard(returnView);
        }
    }, [autoEditReturnView, setViewWithGuard]);

    // Verificar facturas vencidas periódicamente (solo admin/manager)
    useOverdueInvoiceChecker(user);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            window.setAppView = (v) => setViewWithGuard(v);
        }
        return () => {
            if (typeof window !== 'undefined') delete window.setAppView;
        };
    }, [setViewWithGuard]);

    // Hardware back button support (Android PWA)
    const viewHistoryRef = useRef(['dashboard']);
    useEffect(() => {
        if (!user) return;
        const current = viewHistoryRef.current;
        if (current[current.length - 1] !== view) {
            current.push(view);
            window.history.pushState({ view }, '');
        }
    }, [view, user]);

    useEffect(() => {
        if (!user) return;
        const handlePopState = (e) => {
            const history = viewHistoryRef.current;
            if (history.length > 1) {
                history.pop();
                const prevView = history[history.length - 1];
                setView(prevView);
            }
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [user]);

    useEffect(() => {
        if (currentRole && !canAccessView(currentRole, view)) {
            const fallback = canAccessView(currentRole, 'dashboard') ? 'dashboard' : null;
            if (fallback) {
                setView(fallback);
            }
        }
    }, [currentRole, view]);

    const renderView = () => {
        const viewProps = { 
            companyProfile, 
            setView: setViewWithGuard, 
            isMasterUser, 
            currentUserProfile, 
            onProfileUpdate: handleProfileUpdate 
        };

        switch (view) {
            case 'products':
                return <ProductsView companyProfile={companyProfile} isMasterUser={isMasterUser} />;
            case 'customers':
                return <CustomersView companyProfile={companyProfile} />;
            case 'suppliers':
                return <SuppliersView companyProfile={companyProfile} />;
            case 'offers':
                return <OffersView companyProfile={companyProfile} />;
            case 'orders':
                return companyProfile?.orderMode === 'distributor'
                    ? <POSBillingOrdersView companyProfile={companyProfile} currentUserProfile={currentUserProfile} setView={setViewWithGuard} adminUser={user} />
                    : <OrdersView companyProfile={companyProfile} currentUserProfile={currentUserProfile} setView={setViewWithGuard} />;
            case 'invoices':
                return <InvoicesView companyProfile={companyProfile} isMasterUser={isMasterUser} currentUserProfile={currentUserProfile} />;
            case 'company-profile':
                return <CompanyProfileView companyProfile={companyProfile} onProfileUpdate={handleProfileUpdate} isMasterUser={isMasterUser} setView={setViewWithGuard} previousView={previousViewRef.current} />;
            case 'settings':
                return <SettingsView companyProfile={companyProfile} onProfileUpdate={handleProfileUpdate} isMasterUser={isMasterUser} />;
            case 'finance-sales-reports':
                return <SalesReportsView companyProfile={companyProfile} isMasterUser={isMasterUser} onProfileUpdate={handleProfileUpdate} />;
            case 'finance-cash-shifts':
                return <ShiftsView companyProfile={companyProfile} currentUserProfile={currentUserProfile} />;
            case 'finance-expenses':
                return <ExpensesView companyProfile={companyProfile} />;
            case 'finance-accounts-receivable':
                return <AccountsReceivableView companyProfile={companyProfile} />;
            case 'finance-accounts-payable':
                return <AccountsPayableView companyProfile={companyProfile} />;
            case 'finance-accounting':
                return <AccountingView companyProfile={companyProfile} />;
            case 'finance-fiscal-management':
                return <FiscalManagementView companyProfile={companyProfile} onProfileUpdate={handleProfileUpdate} />;
            case 'users':
                if (!canAccessView(currentRole, 'users')) {
                    return <DashboardView setView={setViewWithGuard} companyProfile={companyProfile} />;
                }
                return <UsersView companyProfile={companyProfile} isMasterUser={isMasterUser} adminUser={user} onCurrentUserUpdate={handleCurrentUserUpdate} autoEditUserId={autoEditUserId} onAutoEditClose={handleAutoEditClose} />;
            case 'import-products':
                return <ProductsImportView />;
            case 'shipments':
                return <ShipmentsView companyProfile={companyProfile} setView={setViewWithGuard} isMasterUser={isMasterUser} currentUserProfile={currentUserProfile} onProfileUpdate={handleProfileUpdate} />;
            case 'dashboard':
            default:
                return <DashboardView setView={setViewWithGuard} companyProfile={companyProfile} />;
        }
    };

    if (!isAuthReady) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-gradient-to-br from-slate-50 via-brand-50/30 to-slate-100 dark:from-[#0a0f1e] dark:via-[#0f172a] dark:to-[#0a0f1e]">
                <div className="animate-slideUp flex flex-col items-center">
                    <div className="w-20 h-20 rounded-[1.75rem] bg-brand-500 shadow-2xl shadow-brand-500/30 flex items-center justify-center mb-6">
                        <Edit className="h-9 w-9 text-white animate-pulse" />
                    </div>
                    <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight">Zenda ERP</h1>
                    <div className="mt-6 w-8 h-1 rounded-full bg-brand-500/30 overflow-hidden">
                        <div className="h-full w-1/2 bg-brand-500 rounded-full animate-pulse" />
                    </div>
                </div>
            </div>
        );
    }

    if (!user) {
        return (
            <>
                {showRegister ? (
                    <RegistrationFlow
                        onCancel={() => setShowRegister(false)}
                        onFinalize={finalizeRegistration}
                        isProcessing={isFinalizing}
                        progressStep={progressStep}
                        progressMessage={progressMessage}
                    />
                ) : (
                    <LoginScreen onLogin={handleLogin} error={authError} onOpenRegister={() => setShowRegister(true)} onOpenForgot={handleOpenForgot} />
                )}

                {showForgotModal && (
                    <ForgotPasswordModal initialEmail={forgotEmail} onClose={() => setShowForgotModal(false)} onSend={handleSendReset} />
                )}
            </>
        );
    }

    return (
        <div className="flex h-screen bg-gray-50 dark:bg-[#0f172a] font-sans overflow-hidden">
            <Sidebar setView={setViewWithGuard} currentView={view} isMasterUser={isMasterUser} currentRole={currentRole} />
            <main className="flex-1 flex flex-col overflow-hidden relative">
                <Header 
                    user={user} 
                    isMasterUser={isMasterUser} 
                    companyProfile={companyProfile} 
                    onLogout={handleLogout}
                    onProfileUpdate={handleProfileUpdate}
                    currentUserProfile={currentUserProfile}
                    onEmployeeProfileUpdate={handleCurrentUserUpdate}
                    onEditCurrentUser={handleOpenCurrentUserProfile}
                    currentView={view}
                    onNavigate={setViewWithGuard}
                />
                <div className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 dark:bg-[#0f172a] p-4 md:p-8 pb-24 lg:pb-8 custom-scrollbar">
                    <div key={view} className="view-enter">
                        {renderView()}
                    </div>
                </div>

                {/* Mobile Navigation */}
                <MobileNavBar 
                    currentView={view} 
                    onNavigate={setViewWithGuard} 
                    onOpenMenu={() => setIsMobileMenuOpen(true)} 
                />
                
                <MobileMenuDrawer 
                    isOpen={isMobileMenuOpen} 
                    onClose={() => setIsMobileMenuOpen(false)} 
                    navItems={navItems}
                    currentView={view}
                    onNavigate={setViewWithGuard}
                />
            </main>
        </div>
    );
}
