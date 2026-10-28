import React from 'react';

export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, info) {
        console.error('ErrorBoundary caught:', error, info);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center p-4">
                    <div className="bg-surface p-6 rounded-lg shadow-md text-center">
                        <h2 className="text-xl font-bold mb-2">Se produjo un error</h2>
                        <p className="text-sm text-ink-soft mb-4">Algo salió mal en la interfaz. Intenta recargar la aplicación.</p>
                        <pre className="text-xs text-left bg-gray-100 p-2 rounded max-w-sm overflow-auto">{String(this.state.error)}</pre>
                        <button onClick={() => window.location.reload()} className="mt-4 bg-brand-600 text-white py-2 px-4 rounded">Recargar</button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}
