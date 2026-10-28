import React, { useEffect, useState } from 'react';

// AnimatedModal: pequeño wrapper que añade animaciones fade+scale al montar
// y al desmontar. Usa render-prop para exponer una función `close()` que
// permite a los hijos disparar la animación de cierre antes de invocar el
// callback `onClose` del padre.
export default function AnimatedModal({ children, onClose }) {
    const [visible, setVisible] = useState(true);

    useEffect(() => {
        function onKey(e) {
            if (e.key === 'Escape') handleClose();
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    function handleClose() {
        // iniciar animación de salida
        setVisible(false);
        // tiempo debe coincidir con `duration-200` (200ms)
        setTimeout(() => {
            onClose && onClose();
        }, 220);
    }

    return (
        // backdrop
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
                aria-hidden
                onClick={handleClose}
                className={`absolute inset-0 modal-backdrop transition-opacity ${visible ? 'opacity-100' : 'opacity-0'}`}
            />

            <div
                role="dialog"
                aria-modal="true"
                className={`relative modal-panel w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 sm:p-8 transform transition-all duration-200 ease-out ${
                    visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
                }`}
            >
                {typeof children === 'function' ? children(handleClose) : children}
            </div>
        </div>
    );
}
