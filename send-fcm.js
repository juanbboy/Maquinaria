require('dotenv').config(); // Agrega esto al inicio de send-fcm.js// filepath: e:\maquinas\send-fcm.js

const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const cors = require('cors');
const { getDatabase } = require('firebase-admin/database');


// Carga las credenciales de servicio
// Asegúrate de que el archivo 'firebase-service-account.json' existe en la raíz de e:\maquinas
// Si no existe, descárgalo desde la consola de Firebase:
// Proyecto > Configuración > Cuentas de servicio > Generar nueva clave privada
const serviceAccount = require('./firebase-service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL, // <-- Solo esta línea
});

const app = express();
app.use(bodyParser.json());
app.use(cors());

// Endpoint para enviar notificación FCM a todos los dispositivos registrados
app.post('/api/send-fcm', async (req, res) => {
    const { title, body } = req.body;
    if (!title || !body) {
        return res.status(400).json({ error: 'Faltan parámetros' });
    }
    try {
        // Lee todos los tokens registrados en la base de datos
        const db = getDatabase();
        const tokensSnap = await db.ref('fcmTokens').once('value');
        const tokensObj = tokensSnap.val() || {};
        const tokens = Object.keys(tokensObj);

        if (tokens.length === 0) {
            return res.status(200).json({ success: false, message: 'No hay tokens registrados' });
        }

        console.log('Enviando notificación a tokens:', tokens);

        const message = {
            notification: { title, body },
            webpush: {
                notification: {
                    icon: 'https://cdn-icons-png.flaticon.com/512/190/190411.png',
                    badge: 'https://cdn-icons-png.flaticon.com/512/190/190411.png',
                    vibrate: [200, 100, 200],
                    actions: [
                        { action: 'open', title: 'Abrir App' }
                    ]
                },
                headers: {
                    Urgency: 'high',
                    TTL: '86400'
                },
                // Para Safari iOS y compatibilidad máxima, incluye opciones extra
                fcm_options: {
                    link: 'https://estados-smoky.vercel.app/' // Cambia por la URL de tu PWA
                }
            },
            tokens: tokens
        };

        // Selecciona el método correcto según la versión de firebase-admin
        let response;
        if (typeof admin.messaging().sendEachForMulticast === 'function') {
            // Para firebase-admin v10+
            response = await admin.messaging().sendEachForMulticast(message);
        } else if (typeof admin.messaging().sendMulticast === 'function') {
            // Para firebase-admin v9
            response = await admin.messaging().sendMulticast(message);
        } else if (typeof admin.messaging().sendToDevice === 'function') {
            // Para versiones antiguas
            response = await admin.messaging().sendToDevice(tokens, { notification: { title, body } });
        } else {
            throw new Error('No se encontró un método válido para enviar mensajes FCM en esta versión de firebase-admin.');
        }
        console.log('Respuesta FCM:', response);

        res.json({ success: true, fcmResponse: response });
    } catch (err) {
        console.error('Error enviando FCM:', err);
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`FCM backend listening on port ${PORT}`);
});

