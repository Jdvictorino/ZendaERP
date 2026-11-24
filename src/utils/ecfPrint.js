// Representación impresa del e-CF (DGII): e-NCF, código de seguridad, fecha de firma, vencimiento y código QR.
import QRCodeImpl from 'qr.js/lib/QRCode';
import ErrorCorrectLevel from 'qr.js/lib/ErrorCorrectLevel';
import api from '../api/client.js';

/**
 * Agrega docData.ecfData a un documento electrónico (factura o nota) con lo que debe ir impreso.
 * Busca el e-CF por el resultado de la emisión o por el último que recibió la DGII. Si no lo
 * encuentra (sin conexión, documento en papel), devuelve el documento tal cual.
 */
export async function withEcfPrintData(docData) {
    if (!docData || docData.ecfData?.qrCodeUrl) return docData;
    if (!String(docData.ncfNumber || '').startsWith('E')) return docData;
    const id = docData.ecfResult?.ecfDocument?.id || docData.ecfDocuments?.[0]?.id;
    if (!id) return docData;
    try {
        const doc = await api.ecf.getDocument(id);
        return {
            ...docData,
            ecfData: {
                eNcf: doc.eNcf,
                securityCode: doc.securityCode,
                qrCodeUrl: doc.qrCodeUrl,
                signedAt: doc.fechaHoraFirma,
                sequenceExpiresAt: doc.fechaVencimientoSecuencia,
                modifiedNcf: doc.ncfModificado || null,
                modificationCode: doc.codigoModificacion || null,
            },
        };
    } catch {
        return docData;
    }
}

// Matriz del QR (true = módulo negro), para dibujarla en el PDF o en el ticket sin servicios externos
export function qrModules(text) {
    const qr = new QRCodeImpl(-1, ErrorCorrectLevel.M);
    qr.addData(text);
    qr.make();
    return qr.modules;
}

// SVG del QR para el ticket (HTML)
export function qrSvg(text, size = 140) {
    const modules = qrModules(text);
    const n = modules.length;
    let path = '';
    modules.forEach((row, y) => row.forEach((on, x) => { if (on) path += `M${x} ${y}h1v1h-1z`; }));
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
