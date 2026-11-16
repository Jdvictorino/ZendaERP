import express from 'express';
import { createWindowCounter } from '../services/mailGuard.js';

const router = express.Router();

// Almacenar las conexiones de los clientes SSE
// Estructura: { [sessionId]: res }
const clients = {};
const heartbeats = {};

export const MAX_CONNECTIONS = 500;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isValidSessionId = (id) => typeof id === 'string' && UUID_RE.test(id);

// /scan y /connect comparten el límite por sesión
const scanLimiter = createWindowCounter(120, 60000);

// Endpoint para que la PC (caja) escuche eventos
router.get('/events', (req, res) => {
    const sessionId = req.query.sessionId;

    if (!isValidSessionId(sessionId)) {
        return res.status(400).json({ error: 'sessionId inválido' });
    }

    // Una conexión por sesión: la nueva reemplaza a la anterior (no cuenta como conexión adicional)
    const previous = clients[sessionId];
    if (!previous && Object.keys(clients).length >= MAX_CONNECTIONS) {
        return res.status(503).json({ error: 'Demasiadas conexiones' });
    }
    if (previous) {
        clearInterval(heartbeats[sessionId]);
        previous.end();
    }

    // Configurar encabezados para SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    // nginx no debe acumular los eventos: cada lectura tiene que llegar a la caja al instante
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Enviar un evento inicial para confirmar la conexión
    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'SSE Connection Established' })}\n\n`);

    // Añadir este cliente al objeto de conexiones
    clients[sessionId] = res;

    // Comentario SSE periódico: Cloudflare corta conexiones inactivas a los ~100 s
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);

    // Manejar el cierre de la conexión por parte del cliente
    req.on('close', () => {
        clearInterval(heartbeat);
        if (clients[sessionId] === res) {
            delete clients[sessionId];
            delete heartbeats[sessionId];
        }
    });
});

// Endpoint para que el móvil (escáner) envíe los códigos leídos
router.post('/scan', (req, res) => {
    const { sessionId, barcode } = req.body;

    if (!isValidSessionId(sessionId)) {
        return res.status(400).json({ error: 'sessionId inválido' });
    }
    if (!scanLimiter.hit(sessionId)) {
        return res.status(429).json({ error: 'Demasiadas lecturas, espera un momento.' });
    }
    if (!barcode) {
        return res.status(400).json({ error: 'sessionId y barcode son requeridos' });
    }

    // Buscar si la PC con este sessionId está conectada
    const client = clients[sessionId];

    if (client) {
        // Enviar el evento 'scan' a la PC
        client.write(`event: scan\ndata: ${JSON.stringify({ barcode })}\n\n`);
        return res.json({ success: true, message: 'Código escaneado emitido' });
    } else {
        return res.status(404).json({ error: 'La sesión de la caja no está activa o ya expiró' });
    }
});

// Endpoint para que el móvil notifique su conexión a la PC
router.post('/connect', (req, res) => {
    const { sessionId, deviceName } = req.body;

    if (!isValidSessionId(sessionId)) {
        return res.status(400).json({ error: 'sessionId inválido' });
    }
    if (!scanLimiter.hit(sessionId)) {
        return res.status(429).json({ error: 'Demasiadas lecturas, espera un momento.' });
    }

    const client = clients[sessionId];

    if (client) {
        // Enviar el evento 'device_connected' a la PC
        client.write(`event: device_connected\ndata: ${JSON.stringify({ deviceName: deviceName || 'Celular' })}\n\n`);
        return res.json({ success: true, message: 'Dispositivo vinculado con éxito' });
    } else {
        return res.status(404).json({ error: 'La sesión de la caja no está activa o ya expiró' });
    }
});

export default router;
