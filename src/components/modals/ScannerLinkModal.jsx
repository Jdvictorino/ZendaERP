import React, { useState, useEffect } from 'react';
import QRCode from 'react-qr-code';
import { XCircle, Smartphone, Info } from 'lucide-react';
import { useScanner } from '../../context/ScannerContext.jsx';

const ScannerLinkModal = ({ onClose }) => {
    const { scannerSessionId, isConnected, linkedDeviceName } = useScanner();
    const [scannerUrl, setScannerUrl] = useState('');

    useEffect(() => {
        if (!scannerSessionId) return;
        // Generar la URL completa hacia la vista del escáner
        const protocol = window.location.protocol;
        const host = window.location.hostname;
        const port = window.location.port ? `:${window.location.port}` : '';
        const url = `${protocol}//${host}${port}/mobile-scanner?sessionId=${scannerSessionId}`;
        setScannerUrl(url);
    }, [scannerSessionId]);

    // Autocerrar si detectamos la conexión estando con el modal abierto
    useEffect(() => {
        if (isConnected) {
            const timer = setTimeout(() => {
                if (onClose) onClose();
            }, 2500);
            return () => clearTimeout(timer);
        }
    }, [isConnected, onClose]);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4 animate-in fade-in transition-opacity">
            <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden flex flex-col">
                <div className="bg-indigo-600 px-6 py-4 flex justify-between items-center text-white">
                    <div className="flex items-center gap-2">
                        <Smartphone size={24} />
                        <h2 className="text-xl font-bold">Vincular Celular</h2>
                    </div>
                    <button onClick={onClose} className="hover:text-gray-200 transition-colors">
                        <XCircle size={24} />
                    </button>
                </div>
                
                <div className="p-6 flex flex-col items-center flex-1">
                    <p className="text-gray-600 text-center mb-6">
                        Escanea este código con la cámara de tu teléfono para enlazarlo como escáner de códigos de barras.
                    </p>

                    <div className="bg-white p-4 rounded-xl border-4 border-indigo-100 shadow-sm mb-6">
                        {scannerUrl ? (
                            <QRCode 
                                value={scannerUrl} 
                                size={200}
                                level="M"
                            />
                        ) : (
                            <div className="w-[200px] h-[200px] flex items-center justify-center bg-gray-50 text-gray-400">
                                Cargando...
                            </div>
                        )}
                    </div>

                    <div className={`w-full p-4 rounded-lg flex items-start gap-3 ${isConnected ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>
                        <Info className="shrink-0 mt-0.5" size={20} />
                        <div className="text-sm">
                            {isConnected ? (
                                <p><strong>¡{linkedDeviceName || 'Dispositivo'} vinculado!</strong> Las lecturas aparecerán automáticamente en tu pedido. Cerrando ventana en breve...</p>
                            ) : (
                                <p>Esperando conexión... Asegúrate de que tu celular y esta computadora estén en la misma red WiFi.</p>
                            )}
                        </div>
                    </div>
                    
                </div>
                <div className="bg-gray-50 p-4 border-t border-gray-100 flex justify-end">
                    <button 
                        onClick={onClose}
                        className="px-6 py-2 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300 transition-colors"
                    >
                        {isConnected ? 'Cerrar' : 'Cancelar'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ScannerLinkModal;
