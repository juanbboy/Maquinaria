require('dotenv').config(); // Agrega esto al inicio de send-fcm.js// filepath: e:\maquinas\send-fcm.js

const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const cors = require('cors');
const { getDatabase } = require('firebase-admin/database');
import fetch from 'node-fetch';

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

app.post('/api/send-fcm-external', async (req, res) => {
    // --- CORS headers ---
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    const { title, body, to = '/topics/all' } = req.body || {};
    if (!title || !body) {
        res.status(400).json({ error: 'Missing title or body' });
        return;
    }
    try {
        const response = await fetch('https://fcm.googleapis.com/fcm/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `key=${process.env.FCM_SERVER_KEY}`
            },
            body: JSON.stringify({
                to,
                notification: { title, body }
            })
        });
        const data = await response.json();
        res.status(200).json({ ok: true, fcm: data });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`FCM backend listening on port ${PORT}`);
});

