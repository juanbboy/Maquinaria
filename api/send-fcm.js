require('dotenv').config(); // Agrega esto al inicio de send-fcm.js// filepath: e:\maquinas\send-fcm.js

const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const cors = require('cors');
const { getDatabase } = require('firebase-admin/database');

// Elimina o comenta la línea que importa el archivo de credenciales local
// const serviceAccount = require('./firebase-service-account.json');

// Inicializa Firebase Admin usando variables de entorno (no archivo json)
let firebaseApp;
try {
    // Permite compatibilidad con variables REACT_APP_ y FIREBASE_
    const project_id = process.env.FIREBASE_SERVICE_ACCOUNT_PROJECT_ID || process.env.REACT_APP_FIREBASE_PROJECT_ID;
    const client_email = process.env.FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL || process.env.REACT_APP_FIREBASE_CLIENT_EMAIL;
    const private_key = (process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY || process.env.REACT_APP_FIREBASE_PRIVATE_KEY)
        ? (process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY || process.env.REACT_APP_FIREBASE_PRIVATE_KEY).replace(/\\n/g, '\n')
        : undefined;
    const databaseURL = process.env.REACT_APP_FIREBASE_DATABASE_URL

    if (!project_id) throw new Error('FIREBASE_PROJECT_ID/REACT_APP_FIREBASE_PROJECT_ID is not set');
    if (!client_email) throw new Error('FIREBASE_CLIENT_EMAIL/REACT_APP_FIREBASE_CLIENT_EMAIL is not set');
    if (!private_key) throw new Error('FIREBASE_PRIVATE_KEY/REACT_APP_FIREBASE_PRIVATE_KEY is not set');
    if (!databaseURL) throw new Error('FIREBASE_DATABASE_URL/REACT_APP_FIREBASE_DATABASE_URL is not set');

    firebaseApp = admin.initializeApp({
        credential: admin.credential.cert({
            project_id,
            client_email,
            private_key,
        }),
        databaseURL,
    });
} catch (err) {
    console.error('Error inicializando Firebase Admin:', err.message, err);
    throw err;
}

const app = express();
app.use(bodyParser.json());
app.use(cors({
    origin: 'https://maquinaria.vercel.app'
}));

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

        // ENVÍA COMO MULTICAST (una sola llamada para todos los tokens)
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
                fcm_options: {
                    link: 'https://maquinaria.vercel.app/'
                }
            }
        };

        // Divide los tokens en lotes de 500 (límite de FCM)
        // Pero si tienes menos de 500, solo envía un lote
        const batchSize = 500;
        let responses = [];
        if (tokens.length <= batchSize) {
            // Solo un lote, una sola notificación
            const multicastMsg = { ...message, tokens };
            let response;
            if (typeof admin.messaging().sendMulticast === 'function') {
                response = await admin.messaging().sendMulticast(multicastMsg);
            } else if (typeof admin.messaging().sendEachForMulticast === 'function') {
                response = await admin.messaging().sendEachForMulticast(multicastMsg);
            } else if (typeof admin.messaging().sendToDevice === 'function') {
                response = await admin.messaging().sendToDevice(tokens, { notification: { title, body } });
            } else {
                throw new Error('No se encontró un método válido para enviar mensajes FCM en esta versión de firebase-admin.');
            }
            responses.push(response);
        } else {
            // Si hay más de 500, divide en lotes (esto es raro en tu caso)
            for (let i = 0; i < tokens.length; i += batchSize) {
                const batch = tokens.slice(i, i + batchSize);
                const multicastMsg = { ...message, tokens: batch };
                let response;
                if (typeof admin.messaging().sendMulticast === 'function') {
                    response = await admin.messaging().sendMulticast(multicastMsg);
                } else if (typeof admin.messaging().sendEachForMulticast === 'function') {
                    response = await admin.messaging().sendEachForMulticast(multicastMsg);
                } else if (typeof admin.messaging().sendToDevice === 'function') {
                    response = await admin.messaging().sendToDevice(batch, { notification: { title, body } });
                } else {
                    throw new Error('No se encontró un método válido para enviar mensajes FCM en esta versión de firebase-admin.');
                }
                responses.push(response);
            }
        }
        console.log('Respuesta FCM:', responses);

        res.json({ success: true, fcmResponse: responses });
    } catch (err) {
        console.error('Error enviando FCM:', err);
        res.status(500).json({ error: err.message });
    }
});

// Si usas Vercel Hobby plan, solo puedes tener hasta 12 endpoints (archivos en /api).
// Para evitar el error, mantén solo los endpoints necesarios en la carpeta /api.
// Elimina o mueve a otra carpeta cualquier archivo innecesario en /api.

// Revisa la carpeta e:\maquinas\api:
// - Mantén solo este archivo: send-fcm.js
// - Borra cualquier otro archivo en e:\maquinas\api que no sea necesario para tu backend (por ejemplo, archivos de pruebas, ejemplos, endpoints que no uses).
// - Cada archivo en /api cuenta como una función serverless en Vercel Hobby.

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`FCM backend listening on port ${PORT}`);
});

