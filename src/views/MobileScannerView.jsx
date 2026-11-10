import React, { useEffect, useState, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, CheckCircle2, RotateCcw, XCircle, LogOut, Flashlight } from 'lucide-react';
import { API_URL } from '../api/client.js';

// Solo los formatos que usa un comercio: menos formatos = cada cuadro se decodifica más rápido
const FORMATS = [
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.UPC_E,
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.CODE_39,
    Html5QrcodeSupportedFormats.QR_CODE,
];
const REPEAT_WINDOW_MS = 1500; // la misma etiqueta frente a la cámara no se envía dos veces seguidas

const getDeviceName = () => {
    const ua = navigator.userAgent;
    if (/iPhone/i.test(ua)) return 'iPhone';
    if (/iPad/i.test(ua)) return 'iPad';
    if (/Android/i.test(ua)) {
        const match = ua.match(/Android.*?; (.*?) Build/i);
        return match ? match[1] : 'Android';
    }
    return 'Celular';
};

const postScanner = (path, body) => fetch(`${API_URL}/scanner/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
});

const beep = () => {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        gain.gain.setValueAtTime(0.5, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
    } catch { /* sin audio: la confirmación visual basta */ }
};

const MobileScannerView = () => {
    const [sessionId, setSessionId] = useState('');
    const [link, setLink] = useState('connecting'); // connecting | linked | offline
    const [camera, setCamera] = useState('starting'); // starting | running | error
    const [cameraError, setCameraError] = useState('');
    const [last, setLast] = useState(null); // { code, ok, message }
    const [torch, setTorch] = useState({ supported: false, on: false });
    const [missingSession, setMissingSession] = useState('');
    const scannerRef = useRef(null);
    const lastSentRef = useRef({ code: '', at: 0 });

    // Obtener sessionId de la URL o de la última vinculación
    useEffect(() => {
        const fromUrl = new URLSearchParams(window.location.search).get('sessionId');
        if (fromUrl) {
            setSessionId(fromUrl);
            localStorage.setItem('scanner_sessionId', fromUrl);
            window.history.replaceState({}, document.title, '/mobile-scanner');
            return;
        }
        const saved = localStorage.getItem('scanner_sessionId');
        if (saved) setSessionId(saved);
        else setMissingSession('Escanea el código QR que aparece en la caja para vincular este celular.');
    }, []);

    // Avisar a la caja que este celular está listo
    useEffect(() => {
        if (!sessionId) return;
        setLink('connecting');
        postScanner('connect', { sessionId, deviceName: getDeviceName() })
            .then((r) => setLink(r.ok ? 'linked' : 'offline'))
            .catch(() => setLink('offline'));
    }, [sessionId]);

    // Mantener la pantalla encendida mientras se escanea
    useEffect(() => {
        if (!sessionId || !('wakeLock' in navigator)) return;
        let lock;
        const request = () => navigator.wakeLock.request('screen').then((l) => { lock = l; }).catch(() => {});
        const onVisible = () => document.visibilityState === 'visible' && request();
        request();
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            document.removeEventListener('visibilitychange', onVisible);
            lock?.release().catch(() => {});
        };
    }, [sessionId]);

    // Cámara: arranca sola con la cámara trasera
    useEffect(() => {
        if (!sessionId) return;
        const scanner = new Html5Qrcode('reader', {
            formatsToSupport: FORMATS,
            experimentalFeatures: { useBarCodeDetectorIfSupported: true },
            verbose: false,
        });
        scannerRef.current = scanner;

        const onScan = async (code) => {
            const now = Date.now();
            if (code === lastSentRef.current.code && now - lastSentRef.current.at < REPEAT_WINDOW_MS) return;
            lastSentRef.current = { code, at: now };
            beep();
            try {
                const response = await postScanner('scan', { sessionId, barcode: code });
                if (!response.ok) throw new Error('La caja no está escuchando. Abre la pantalla de facturación en la computadora.');
                setLink('linked');
                setLast({ code, ok: true });
            } catch (error) {
                setLink('offline');
                setLast({ code, ok: false, message: error.message === 'Failed to fetch' ? 'Sin conexión a internet.' : error.message });
                navigator.vibrate?.([200, 100, 200]);
            }
        };

        scanner.start(
            { facingMode: 'environment' },
            { fps: 15, qrbox: (w, h) => ({ width: Math.floor(w * 0.85), height: Math.floor(Math.min(h * 0.5, w * 0.5)) }) },
            onScan,
            () => { /* cuadro sin código: normal mientras se apunta */ },
        ).then(() => {
            setCamera('running');
            try {
                setTorch({ supported: scanner.getRunningTrackCameraCapabilities().torchFeature().isSupported(), on: false });
            } catch { /* linterna no disponible en este equipo */ }
        }).catch((error) => {
            setCamera('error');
            setCameraError(/permission|NotAllowed/i.test(String(error))
                ? 'Permite el acceso a la cámara en el navegador y vuelve a intentar.'
                : 'No se pudo abrir la cámara. Cierra otras apps que la estén usando y vuelve a intentar.');
        });

        return () => {
            if (scanner.isScanning) scanner.stop().catch(() => {});
        };
    }, [sessionId]);

    const toggleTorch = async () => {
        try {
            const next = !torch.on;
            await scannerRef.current.getRunningTrackCameraCapabilities().torchFeature().apply(next);
            setTorch((t) => ({ ...t, on: next }));
        } catch { setTorch({ supported: false, on: false }); }
    };

    const handleDisconnect = () => {
        localStorage.removeItem('scanner_sessionId');
        if (scannerRef.current?.isScanning) scannerRef.current.stop().catch(() => {});
        setSessionId('');
        setMissingSession('Celular desvinculado. Escanea un nuevo código QR en la caja para volver a conectar.');
    };

    if (!sessionId) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-6 text-center">
                <XCircle className="w-14 h-14 text-red-400 mb-4" />
                <h1 className="text-xl font-semibold mb-2">Escáner sin vincular</h1>
                <p className="text-gray-300 max-w-xs">{missingSession}</p>
            </div>
        );
    }

    const linkLabel = { connecting: 'Conectando…', linked: 'Conectado a la caja', offline: 'Caja sin conexión' }[link];
    const linkColor = { connecting: 'bg-amber-400', linked: 'bg-success-500', offline: 'bg-red-500' }[link];

    return (
        <div className="flex flex-col min-h-screen bg-gray-900 text-white font-sans">
            <header className="bg-gray-800 px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                    <Camera className="text-brand-400 shrink-0" size={20} />
                    <div className="min-w-0">
                        <h1 className="font-semibold leading-tight">Escáner móvil</h1>
                        <p className="flex items-center gap-1.5 text-xs text-gray-300" aria-live="polite">
                            <span className={`h-2 w-2 rounded-full ${linkColor}`} aria-hidden="true" />
                            {linkLabel}
                        </p>
                    </div>
                </div>
                <button
                    onClick={handleDisconnect}
                    className="flex items-center gap-1.5 bg-gray-700 hover:bg-red-600 text-gray-200 hover:text-white px-3 py-2 rounded-lg transition-colors text-sm"
                >
                    <LogOut size={16} /> Desvincular
                </button>
            </header>

            <main className="flex-1 flex flex-col items-center p-4 gap-4">
                <div className="relative w-full max-w-sm">
                    <div id="reader" className="w-full aspect-[3/4] bg-black rounded-xl overflow-hidden" />
                    {camera === 'starting' && (
                        <p className="absolute inset-0 flex items-center justify-center text-gray-300 text-sm">Abriendo cámara…</p>
                    )}
                    {torch.supported && (
                        <button
                            onClick={toggleTorch}
                            aria-pressed={torch.on}
                            aria-label={torch.on ? 'Apagar linterna' : 'Encender linterna'}
                            className={`absolute bottom-3 right-3 h-12 w-12 rounded-full flex items-center justify-center ${torch.on ? 'bg-amber-400 text-gray-900' : 'bg-black/60 text-white'}`}
                        >
                            <Flashlight size={22} />
                        </button>
                    )}
                </div>

                {camera === 'error' ? (
                    <div className="w-full max-w-sm bg-red-600 rounded-xl p-5 text-center">
                        <p className="font-semibold mb-1">Cámara no disponible</p>
                        <p className="text-sm text-red-100 mb-4">{cameraError}</p>
                        <button onClick={() => window.location.reload()} className="bg-white text-red-700 font-semibold py-2 px-5 rounded-full inline-flex items-center gap-2">
                            <RotateCcw size={16} /> Reintentar
                        </button>
                    </div>
                ) : last ? (
                    <div className={`w-full max-w-sm rounded-xl p-4 flex items-center gap-3 ${last.ok ? 'bg-success-600' : 'bg-red-600'}`} role="status">
                        {last.ok ? <CheckCircle2 className="shrink-0" size={28} /> : <XCircle className="shrink-0" size={28} />}
                        <div className="min-w-0">
                            <p className="font-mono text-lg truncate">{last.code}</p>
                            <p className="text-sm opacity-90">{last.ok ? 'Enviado a la caja' : last.message}</p>
                        </div>
                    </div>
                ) : (
                    <p className="text-center text-gray-400 text-sm max-w-xs">Apunta al código de barras. Cada lectura se envía sola a la caja.</p>
                )}
            </main>
        </div>
    );
};

export default MobileScannerView;
