const nodemailer = require('nodemailer');

function getTransporter() {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    const { guardadoPor, observaciones } = req.body || {};

    if (!guardadoPor || !observaciones || !String(observaciones).trim()) {
        return res.status(400).json({ error: 'Faltan datos de la observación' });
    }

    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.SMTP_TO) {
        return res.status(500).json({ error: 'Faltan variables SMTP en el servidor' });
    }

    try {
        await getTransporter().sendMail({
            from: `Novedades c. proceso <${process.env.SMTP_USER}>`,
            to: process.env.SMTP_TO,
            subject: `Observación de máquinas`,
            text: [
                `Informe por: ${guardadoPor}`,
                '',
                'Observaciones:',
                String(observaciones).trim(),
            ].join('\n'),
        });

        return res.status(200).json({ ok: true });
    } catch (error) {
        console.error('Error enviando correo:', error);
        return res.status(500).json({ error: 'No se pudo enviar el correo' });
    }
};
