import React, { useEffect, useState, useRef } from 'react';
import { Html5QrcodeScanner, Html5QrcodeScanType } from 'html5-qrcode';
import { Camera, CheckCircle2, RotateCcw, XCircle, LogOut } from 'lucide-react';

const MobileScannerView = () => {
    const [sessionId, setSessionId] = useState('');
    const [scanResult, setScanResult] = useState(null);
    const [isScanning, setIsScanning] = useState(true);
    const [scanError, setScanError] = useState(null);
    const scannerRef = useRef(null);

    // Obtener sessionId de la URL o LocalStorage
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const sessionFromUrl = urlParams.get('sessionId');
        
        if (sessionFromUrl) {
            setSessionId(sessionFromUrl);
            localStorage.setItem('scanner_sessionId', sessionFromUrl);
            // Limpiar la URL para que quede limpia
            window.history.replaceState({}, document.title, "/mobile-scanner");
        } else {
            const savedSession = localStorage.getItem('scanner_sessionId');
            if (savedSession) {
                setSessionId(savedSession);
            } else {
                setScanError('Falta el ID de sesión. Por favor, escanea el código QR de la computadora.');
            }
        }
    }, []);

    const handleDisconnect = () => {
        localStorage.removeItem('scanner_sessionId');
        setSessionId('');
        if (scannerRef.current) {
            scannerRef.current.clear().catch(e => console.error("Error clearing scanner on disconnect:", e));
        }
        setScanError('Dispositivo desvinculado. Escanea un nuevo QR para volver a conectar.');
    };

    // Inicializar el escáner
    useEffect(() => {
        if (!sessionId) return;

        const getDeviceName = () => {
            const ua = navigator.userAgent;
            if (/iPhone/i.test(ua)) return "iPhone";
            if (/iPad/i.test(ua)) return "iPad";
            if (/Android/i.test(ua)) {
                const match = ua.match(/Android.*?; (.*?) Build/i);
                return match ? match[1] : "Android";
            }
            return "Celular";
        };

        // Notificar al backend que nos conectamos
        fetch('/api/scanner/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, deviceName: getDeviceName() })
        }).catch(e => console.error("No se pudo notificar la conexión", e));

        // Limpiar instancia previa si existe
        if (scannerRef.current) {
            scannerRef.current.clear().catch(e => console.error("Error clearing scanner:", e));
        }

        const scanner = new Html5QrcodeScanner(
            "reader",
            {
                fps: 30,
                supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
                rememberLastUsedCamera: true,
                showTorchButtonIfSupported: true,
                videoConstraints: {
                    facingMode: "environment"
                }
            },
            false // verbose
        );

        scannerRef.current = scanner;

        const onScanSuccess = async (decodedText) => {
            // Pausar escaneo para evitar ráfagas
            if (scannerRef.current && scannerRef.current.getState() === 2) { 
                scannerRef.current.pause();
            }
            
            setIsScanning(false);
            setScanResult(decodedText);
            
            // Reproducir sonido de éxito (beep corto)
            try {
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                const oscillator = audioCtx.createOscillator();
                const gainNode = audioCtx.createGain();
                
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(800, audioCtx.currentTime); // Tono de beep
                
                gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
                
                oscillator.connect(gainNode);
                gainNode.connect(audioCtx.destination);
                
                oscillator.start();
                oscillator.stop(audioCtx.currentTime + 0.1);
            } catch (e) {
                console.warn('AudioContext no soportado para beep', e);
            }

            try {
                const response = await fetch(`/api/scanner/scan`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId, barcode: decodedText })
                });

                if (!response.ok) {
                    throw new Error('La computadora no está respondiendo o la sesión expiró.');
                }

                // Autoreactivar el escáner más rápido para mejorar velocidad (0.8 segundos)
                setTimeout(() => {
                    setScanResult(null);
                    setScanError(null);
                    setIsScanning(true);
                    if (scannerRef.current && scannerRef.current.getState() !== 2) {
                        scannerRef.current.resume();
                    }
                }, 800);

            } catch (error) {
                console.error('Error enviando escaneo:', error);
                setScanError(error.message || 'Error al enviar código');
                
                // Vibrar si falla (si el dispositivo lo soporta)
                if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            }
        };

        const onScanFailure = (error) => {
            // Se ignora silenciosamente (son errores de "no hay código en la imagen" continuos)
        };

        scanner.render(onScanSuccess, onScanFailure);

        return () => {
            if (scannerRef.current) {
                scannerRef.current.clear().catch(e => console.error("Error clearing scanner unmount:", e));
            }
        };
    }, [sessionId]);

    const handleRetry = () => {
        setScanResult(null);
        setScanError(null);
        setIsScanning(true);
        if (scannerRef.current && scannerRef.current.getState() !== 2) {
            scannerRef.current.resume();
        }
    };

    if (!sessionId) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6 text-center">
                <XCircle className="w-16 h-16 text-red-500 mb-4" />
                <h1 className="text-2xl font-bold text-gray-800 mb-2">Escáner Desconectado</h1>
                <p className="text-gray-600">{scanError || "Falta el ID de sesión. Asegúrate de escanear el código QR directamente de la pantalla de Facturación de tu computadora."}</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-screen bg-gray-900 text-white font-sans">
            {/* Cabecera */}
            <div className="bg-gray-800 p-4 shadow-md flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Camera className="text-indigo-400" />
                    <h1 className="font-bold text-lg">Escáner Móvil</h1>
                </div>
                {/* Indicador de estado y botón de Desconectar */}
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                        </span>
                        <span className="text-xs text-green-400 font-medium">Conectado</span>
                    </div>
                    
                    <button 
                        onClick={handleDisconnect}
                        className="flex items-center gap-1 bg-gray-700 hover:bg-red-600/80 text-gray-300 hover:text-white px-2 py-1.5 rounded-md transition-colors text-xs border border-gray-600"
                        title="Desvincular escáner"
                    >
                        <LogOut size={14} />
                        <span>Desconectar</span>
                    </button>
                </div>
            </div>

            {/* Contenedor del Lector QR/Barcode */}
            <div className="flex-1 flex flex-col items-center justify-start p-4 mt-4">
                <div 
                    id="reader" 
                    className="w-full max-w-sm bg-black rounded-lg overflow-hidden border-2 border-gray-700 shadow-2xl relative"
                ></div>

                {/* Overlays de Estado */}
                {!isScanning && scanResult && !scanError && (
                    <div className="mt-8 bg-green-600 text-white rounded-xl p-6 shadow-lg w-full max-w-sm flex flex-col items-center text-center animate-in slide-in-from-bottom-4 relative z-10 transition-all">
                        <CheckCircle2 className="w-16 h-16 mb-2" />
                        <h3 className="text-xl font-bold mb-1">Cargado con Éxito</h3>
                        <p className="text-green-100 font-mono text-lg">{scanResult}</p>
                        <p className="text-sm mt-4 text-green-200">Reactivando cámara en breve...</p>
                    </div>
                )}

                {scanError && (
                    <div className="mt-8 bg-red-600 text-white rounded-xl p-6 shadow-lg w-full max-w-sm flex flex-col items-center text-center animate-in slide-in-from-bottom-4">
                        <XCircle className="w-12 h-12 mb-2" />
                        <h3 className="font-bold mb-1">Hubo un problema</h3>
                        <p className="text-red-100 text-sm mb-4">{scanError}</p>
                        <button 
                            onClick={handleRetry}
                            className="bg-white text-red-600 font-bold py-2 px-6 rounded-full flex items-center gap-2 hover:bg-red-50"
                        >
                            <RotateCcw size={18} /> Reintentar Escaneo
                        </button>
                    </div>
                )}

                {isScanning && !scanResult && !scanError && (
                    <div className="mt-6 text-center text-gray-400 px-4">
                        <p>Apunta el código de barras o QR frente a la cámara.</p>
                        <p className="text-sm mt-2 opacity-60">El escáner es automático.</p>
                    </div>
                )}
            </div>
            
            {/* Estilos dinámicos para limpiar la UI por defecto de html5-qrcode */}
            <style dangerouslySetInnerHTML={{__html: `
                #reader__scan_region { background: #000; }
                #reader__dashboard_section_csr span { color: #fff; font-size: 14px; }
                #reader__dashboard_section_swaplink { color: #818cf8; text-decoration: none; padding: 8px 0; display: inline-block; font-weight: bold; }
                #html5-qrcode-button-camera-permission { background-color: #4f46e5; color: white; border: none; padding: 10px 16px; border-radius: 8px; font-weight: bold; font-family: inherit; margin-top: 10px; }
                #html5-qrcode-button-camera-start, #html5-qrcode-button-camera-stop { background-color: #374151; color: white; border: 1px solid #4b5563; padding: 8px 16px; border-radius: 6px; margin: 4px; }
            `}} />
        </div>
    );
};

export default MobileScannerView;
