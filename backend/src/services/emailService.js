import nodemailer from 'nodemailer';

// Configuración básica SMTP desde variables de entorno
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.ethereal.email',
  port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
  secure: false, // true para 465, false para otros puertos
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  }
});

/**
 * Envío de email genérico (usado para recuperar contraseñas, etc.)
 */
export async function sendMail({ to, subject, html, text, attachments = [] }) {
  const from = process.env.PLATFORM_OWNER_EMAIL || process.env.FIREBASE_MASTER_EMAIL || 'no-reply@localhost';
  
  // Si hay un API Key de Resend global, preferir Resend incluso para correos genéricos
  if (process.env.RESEND_API_KEY) {
    const fromEmail = process.env.RESEND_FROM_EMAIL || from;
    return sendViaResend(process.env.RESEND_API_KEY, {
      from: fromEmail,
      to,
      subject,
      html,
      text,
      attachments
    });
  }

  // Dar formato de attachments para Nodemailer
  const smtpAttachments = attachments.map(att => ({
    filename: att.filename,
    content: typeof att.content === 'string' ? Buffer.from(att.content, 'base64') : att.content,
    contentType: 'application/pdf'
  }));

  return transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
    attachments: smtpAttachments
  });
}

/**
 * Envío de email asociado a una empresa (con soporte multi-tenant de Resend y SMTP)
 * @param {Object} company - Objeto de la empresa con sus configuraciones
 * @param {Object} mailOptions - Parámetros de envío { to, subject, html, text, attachments }
 * @param {Array} mailOptions.attachments - Lista de { filename, content } donde content es base64 string
 */
export async function sendCompanyMail(company, { to, subject, html, text, attachments = [] }) {
  const smtpSettings = company?.settings?.smtp || {};
  
  if (smtpSettings.host && smtpSettings.user && smtpSettings.pass) {
    console.log(`[EmailService] Enviando correo vía SMTP propio de la empresa a ${to} (Host: ${smtpSettings.host})...`);
    
    // Configurar transportador SMTP dinámico con los parámetros de la empresa
    const companyTransporter = nodemailer.createTransport({
      host: smtpSettings.host,
      port: smtpSettings.port ? Number(smtpSettings.port) : 587,
      secure: smtpSettings.secure === true || smtpSettings.secure === 'true',
      auth: {
        user: smtpSettings.user,
        pass: smtpSettings.pass
      }
    });

    // Dar formato de attachments para Nodemailer: { filename, content: Buffer }
    const smtpAttachments = attachments.map(att => ({
      filename: att.filename,
      content: Buffer.from(att.content, 'base64'),
      contentType: 'application/pdf'
    }));

    const fromEmail = smtpSettings.from || smtpSettings.user;

    return companyTransporter.sendMail({
      from: fromEmail,
      to,
      subject,
      text,
      html,
      attachments: smtpAttachments
    });
  } else {
    throw new Error('La empresa no tiene configurada una cuenta de correo SMTP válida.');
  }
}

/**
 * Helper para realizar el envío directo de emails mediante la API REST de Resend
 */
async function sendViaResend(apiKey, { from, to, subject, html, text, attachments }) {
  const recipients = Array.isArray(to) ? to : [to];
  
  const payload = {
    from,
    to: recipients,
    subject,
    html,
    text
  };

  if (attachments && attachments.length > 0) {
    payload.attachments = attachments;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error en la API de Resend (${response.status}): ${errorText}`);
  }

  return response.json();
}
