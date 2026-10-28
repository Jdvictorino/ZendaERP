import React from 'react';
import { Download, X } from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '../ui/Button.jsx';

// --- CAMBIO 1: El prop ahora se llama 'imageUrl' para mayor claridad ---
const ImageViewerModal = ({ imageUrl, onClose }) => {

    // --- CAMBIO 2: La función de guardar ahora usa 'fetch' para ser compatible con la web ---
    const handleSave = async () => {
        try {
            // Usa fetch para obtener la imagen como datos binarios (blob)
            const response = await fetch(imageUrl);
            const blob = await response.blob();

            // Crea una URL temporal en el navegador para el blob
            const objectUrl = window.URL.createObjectURL(blob);
            
            // Crea un enlace <a> invisible en el documento
            const link = document.createElement('a');
            link.href = objectUrl;
            
            // Extrae el nombre del archivo de la URL original
            const fileName = imageUrl.split('%2F').pop().split('?')[0];
            link.setAttribute('download', fileName || 'diseño.png');
            
            // Simula un clic en el enlace para abrir el diálogo de "Guardar como..."
            document.body.appendChild(link);
            link.click();
            
            // Limpia el enlace y la URL temporal
            link.parentNode.removeChild(link);
            window.URL.revokeObjectURL(objectUrl);

            toast.success('¡Descarga iniciada!');

        } catch (error) {
            console.error("Error al descargar la imagen:", error);
            toast.error('No se pudo descargar la imagen.');
        }
    };

    return (
        <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-[70] p-4">
            <div className="modal-panel p-4 w-full max-w-3xl max-h-[90vh] flex flex-col">
                <div className="flex justify-end mb-2">
                    <button onClick={onClose} className="text-ink-muted hover:text-gray-800" aria-label="Cerrar"><X size={28}/></button>
                </div>
                <div className="flex-1 flex items-center justify-center overflow-hidden">
                    {/* --- CAMBIO 3: Se eliminó la lógica de carga y se usa la URL directamente --- */}
                    {imageUrl ? (
                        <img src={imageUrl} alt="Vista previa del diseño" className="max-w-full max-h-full object-contain"/>
                    ) : (
                        <p>No se proporcionó ninguna imagen.</p>
                    )}
                </div>
                <div className="flex justify-center mt-4">
                    <Button onClick={handleSave} className="flex items-center gap-2">
                        <Download size={20}/>
                        Guardar Como...
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default ImageViewerModal;