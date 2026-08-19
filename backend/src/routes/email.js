import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';
import { sendCompanyMail } from '../services/emailService.js';
import { z } from 'zod';

const router = express.Router();
const prisma = new PrismaClient();

// Todas las rutas de email requieren autenticación
router.use(authenticate);

const sendEmailSchema = z.object({
  to: z.string().email('Email de destino inválido'),
  subject: z.string().min(1, 'El asunto es requerido'),
  html: z.string().min(1, 'El contenido HTML es requerido'),
  text: z.string().optional(),
  filename: z.string().optional(),
  base64Attachment: z.string().optional()
});

router.post('/send', async (req, res, next) => {
  try {
    const data = sendEmailSchema.parse(req.body);
    
    // Obtener la empresa del usuario autenticado para cargar sus configuraciones
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { company: true }
    });

    if (!user || !user.company) {
      return res.status(404).json({ error: 'Empresa no encontrada para el usuario' });
    }

    const attachments = [];
    if (data.base64Attachment) {
      attachments.push({
        filename: data.filename || 'documento.pdf',
        content: data.base64Attachment
      });
    }

    const result = await sendCompanyMail(user.company, {
      to: data.to,
      subject: data.subject,
      html: data.html,
      text: data.text || '',
      attachments
    });

    res.json({ success: true, result });
  } catch (error) {
    next(error);
  }
});

export default router;
