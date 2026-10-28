import React, { useState } from 'react';
import { Eye, EyeOff, Mail, Lock, ArrowRight } from 'lucide-react';


const LoginScreen = ({ onLogin, error, onOpenRegister, onOpenForgot }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            await onLogin(email, password);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 via-brand-50/30 to-slate-100 dark:from-night-950 dark:via-night-900 dark:to-night-950 px-6 pt-safe pb-safe">
            <div className="w-full max-w-sm animate-slideUp">
                {/* Branding */}
                <div className="text-center mb-12">
                    <div className="inline-flex items-center justify-center w-full mb-8">
                        <img
                            src={`${import.meta.env.BASE_URL}icon.svg`}
                            alt="Zenda ERP"
                            className="h-20 w-auto drop-shadow-[0_18px_24px_rgba(15,23,42,0.25)]"
                        />
                    </div>
                    <h1 className="text-3xl font-extrabold text-ink dark:text-white tracking-tight">
                        Zenda ERP
                    </h1>
                    <p className="mt-3 text-base font-medium text-ink-muted dark:text-gray-400">
                        El mejor amigo de tus finanzas
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Email */}
                    <div className="relative">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                            <Mail size={18} />
                        </div>
                        <input
                            id="email-address"
                            name="email"
                            type="email"
                            autoComplete="email"
                            required
                            className="w-full h-14 pl-12 pr-4 text-base font-medium bg-surface dark:bg-gray-900 border border-line dark:border-gray-800 rounded-2xl text-ink dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 outline-none transition-all shadow-sm"
                            placeholder="Correo electrónico"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>

                    {/* Password */}
                    <div className="relative">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                            <Lock size={18} />
                        </div>
                        <input
                            id="password"
                            name="password"
                            type={showPassword ? "text" : "password"}
                            autoComplete="current-password"
                            required
                            className="w-full h-14 pl-12 pr-12 text-base font-medium bg-surface dark:bg-gray-900 border border-line dark:border-gray-800 rounded-2xl text-ink dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 outline-none transition-all shadow-sm"
                            placeholder="Contraseña"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors active:scale-90"
                        >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>

                    {/* Error message */}
                    {error && (
                        <div className="px-4 py-3 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/30">
                            <p role="alert" className="text-sm font-medium text-danger-700 dark:text-danger-400 text-center">{error}</p>
                        </div>
                    )}

                    {/* Submit */}
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full h-14 flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-base font-bold rounded-2xl shadow-xl shadow-brand-500/25 transition-all active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none"
                    >
                        {isLoading ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                Iniciar Sesión
                                <ArrowRight size={18} />
                            </>
                        )}
                    </button>
                </form>

                {/* Footer links */}
                <div className="mt-8 flex items-center justify-between">
                    <button
                        type="button"
                        onClick={onOpenRegister}
                        className="text-sm font-bold text-brand-600 dark:text-brand-400 hover:text-brand-700 transition-colors active:scale-95"
                    >
                        Crear cuenta
                    </button>
                    <button
                        type="button"
                        onClick={() => onOpenForgot && onOpenForgot(email)}
                        className="text-sm font-medium text-ink-muted dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors active:scale-95"
                    >
                        ¿Olvidaste tu contraseña?
                    </button>
                </div>

                {/* Brand footer */}
                <p className="mt-16 text-center text-xs font-medium text-ink-muted dark:text-gray-400 tracking-wide uppercase">
                    By Batey Creativo Studio
                </p>
            </div>
        </div>
    );
};

export default LoginScreen;

