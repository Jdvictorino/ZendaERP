import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';

const ScannerContext = createContext();

export const useScanner = () => useContext(ScannerContext);

export const ScannerProvider = ({ children }) => {
    const [scannerSessionId, setScannerSessionId] = useState('');
    const [linkedDeviceName, setLinkedDeviceName] = useState('');
    const [isConnected, setIsConnected] = useState(false);
    
    // Almacena la función que procesa los escaneos (dependerá de qué vista esté abierta)
    const scanHandlerRef = useRef(null);

    const registerScanHandler = useCallback((handler) => {
        scanHandlerRef.current = handler;
    }, []);

    const unregisterScanHandler = useCallback(() => {
        scanHandlerRef.current = null;
    }, []);

    const initSession = () => {
        let sid = localStorage.getItem('pc_scanner_session');
        if (!sid) {
            sid = uuidv4();
            localStorage.setItem('pc_scanner_session', sid);
        }
        setScannerSessionId(sid);
        return sid;
    };

    const disconnectDevice = () => {
        setIsConnected(false);
        setLinkedDeviceName('');
        const newSid = uuidv4();
        setScannerSessionId(newSid);
        localStorage.setItem('pc_scanner_session', newSid);
        toast('Dispositivo desvinculado.', { icon: '🔌' });
    };

    // Evitar conexiones dobles en StrictMode
    const connectingRef = useRef(false);

    useEffect(() => {
        const sid = initSession();
        let eventSource;

        const connectSSE = () => {
            if (connectingRef.current) return;
            connectingRef.current = true;
            
            try {
                eventSource = new EventSource(`/api/scanner/events?sessionId=${sid}`);

                eventSource.onopen = () => {
                    console.log('Scanner SSE Conectado en puerto:', sid);
                };

                eventSource.addEventListener('scan', (e) => {
                    try {
                        const data = JSON.parse(e.data);
                        if (data && data.barcode) {
                            setTimeout(() => {
                                if (scanHandlerRef.current) {
                                    scanHandlerRef.current(data.barcode);
                                } else {
                                    toast.success(`Lectura recibida silenciada: ${data.barcode}`);
                                }
                                setIsConnected(true);
                            }, 0);
                        }
                    } catch (err) {
                        console.error('Error parseando evento scan:', err);
                    }
                });

                eventSource.addEventListener('device_connected', (e) => {
                    try {
                        const data = JSON.parse(e.data);
                        if (data && data.deviceName) {
                            setTimeout(() => {
                                setIsConnected(true);
                                setLinkedDeviceName(data.deviceName);
                                toast.success(`Capturador enlazado: ${data.deviceName}`);
                            }, 0);
                        }
                    } catch (err) {
                        console.error('Error parseando device_connected:', err);
                    }
                });

                eventSource.onerror = (error) => {
                    console.log("Reconectando SSE...");
                    connectingRef.current = false;
                };
            } catch (error) {
                console.error('Error inicializando EventSource:', error);
                connectingRef.current = false;
            }
        };

        if (sid) {
            connectSSE();
        }

        return () => {
            if (eventSource) {
                eventSource.close();
            }
            connectingRef.current = false;
        };
    }, [scannerSessionId]);

    return (
        <ScannerContext.Provider value={{
            scannerSessionId,
            linkedDeviceName,
            isConnected,
            disconnectDevice,
            initSession,
            registerScanHandler,
            unregisterScanHandler
        }}>
            {children}
        </ScannerContext.Provider>
    );
};
