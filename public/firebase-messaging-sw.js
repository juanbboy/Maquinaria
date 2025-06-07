// filepath: e:\maquinas\public\firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyCSaJzJYoLaAhDK7w55MC4Oz4MVvxjUE4E",
    authDomain: "react-auth-app-6a340.firebaseapp.com",
    projectId: "react-auth-app-6a340",
    storageBucket: "react-auth-app-6a340.appspot.com",
    messagingSenderId: "778269297947",
<<<<<<< HEAD
    appId: "1:778269297947:web:fe855452be4a5d767257be",
    measurementId: "G-960E23P220"
=======
    appId: "1:778269297947:web:fe855452be4a5d767257be"
    // No incluyas databaseURL ni measurementId aquí, no son necesarios para FCM en el SW
>>>>>>> 59732cd (first commit)
});

const messaging = firebase.messaging();

<<<<<<< HEAD
// Maneja notificaciones push en segundo plano
messaging.onBackgroundMessage(function (payload) {
    self.registration.showNotification(payload.notification.title, {
        body: payload.notification.body,
        icon: payload.notification.icon
    });
=======
// Maneja notificaciones push en segundo plano (cuando la app está cerrada o en background)
messaging.onBackgroundMessage(function (payload) {
    console.log('[firebase-messaging-sw.js] onBackgroundMessage payload:', payload);
    if (payload && payload.notification && payload.notification.title) {
        self.registration.showNotification(payload.notification.title, {
            body: payload.notification.body || '',
            icon: payload.notification.icon || '/logo192.png'
        });
    } else {
        console.warn('[firebase-messaging-sw.js] onBackgroundMessage sin notification:', payload);
    }
});

// Maneja notificaciones push directas tipo "data" (por si el backend no usa notification)
self.addEventListener('push', function (event) {
    console.log('[firebase-messaging-sw.js] Push recibido:', event);
    if (event.data) {
        let data = {};
        try {
            data = event.data.json();
        } catch (e) {
            data = { title: 'Notificación', body: event.data.text() };
        }
        const notification = data.notification || data;
        console.log('[firebase-messaging-sw.js] Mostrando notificación:', notification);
        if (notification && notification.title) {
            self.registration.showNotification(notification.title, {
                body: notification.body || '',
                icon: notification.icon || '/logo192.png'
            });
        } else {
            console.warn('[firebase-messaging-sw.js] Notificación sin título:', notification);
        }
    } else {
        console.warn('[firebase-messaging-sw.js] Evento push sin data');
    }
>>>>>>> 59732cd (first commit)
});

// Opcional: Maneja notificaciones cuando el usuario hace click
self.addEventListener('notificationclick', function (event) {
<<<<<<< HEAD
    event.notification.close();
    // Puedes personalizar la URL a abrir
    event.waitUntil(
        clients.openWindow('/')
    );
});
=======
    console.log('[firebase-messaging-sw.js] notificationclick:', event);
    event.notification.close();
    event.waitUntil(
        clients.openWindow('/')
    );
});

// Forzar que el Service Worker se instale y active inmediatamente (útil para desarrollo)
self.addEventListener('install', event => {
    console.log('[firebase-messaging-sw.js] Instalando Service Worker');
    self.skipWaiting();
});
self.addEventListener('activate', event => {
    console.log('[firebase-messaging-sw.js] Activando Service Worker');
    event.waitUntil(self.clients.claim());
});

>>>>>>> 59732cd (first commit)
