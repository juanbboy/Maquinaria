// filepath: e:\maquinas\public\firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyCSaJzJYoLaAhDK7w55MC4Oz4MVvxjUE4E",
    authDomain: "react-auth-app-6a340.firebaseapp.com",
    projectId: "react-auth-app-6a340",
    storageBucket: "react-auth-app-6a340.appspot.com",
    messagingSenderId: "778269297947",
    appId: "1:778269297947:web:fe855452be4a5d767257be",
    measurementId: "G-960E23P220"
});

const messaging = firebase.messaging();

let lastNotification = { title: '', body: '', ts: 0 };
let disableDuplicate = false;

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'DISABLE_DUPLICATE_FCM') {
        disableDuplicate = true;
    }
});

// Elimina la notificación duplicada tanto en onBackgroundMessage como en push
function shouldSkipNotification(title, body) {
    // En iPhone/Safari, FCM dispara tanto push como onBackgroundMessage.
    // Solo permite una notificación por evento usando un lock global.
    if (self.__notificationMobileLock) return true;
    const now = Date.now();
    // Detecta móvil por userAgent (si está disponible)
    let isMobile = false;
    try {
        isMobile = typeof self.navigator !== "undefined" && /iphone|ipad|ipod|ios|mobile/i.test((self.navigator.userAgent || "").toLowerCase());
    } catch { }
    // Si es móvil, activa el lock por 2 segundos y bloquea el otro handler
    if (isMobile) {
        self.__notificationMobileLock = true;
        setTimeout(() => { self.__notificationMobileLock = false; }, 2000);
    }
    // Además, filtra duplicados por título/cuerpo
    if (
        title === lastNotification.title &&
        body === lastNotification.body &&
        now - lastNotification.ts < 2000
    ) {
        return true;
    }
    lastNotification = { title, body, ts: now };
    return false;
}

// Solo permite mostrar una notificación por evento push
self.addEventListener('push', function (event) {
    if (!event.data) return;
    // Aplica el lock para móviles (iPhone/Safari)
    if (self.__notificationMobileLock) return;
    self.__notificationMobileLock = true;
    setTimeout(() => { self.__notificationMobileLock = false; }, 2000);
    const data = event.data.json();
    const { title, body } = data.notification || {};
    if (shouldSkipNotification(title, body)) return;
    event.waitUntil(
        self.registration.showNotification(title, {
            body,
            icon: 'https://cdn-icons-png.flaticon.com/512/190/190411.png',
            badge: 'https://cdn-icons-png.flaticon.com/512/190/190411.png',
            vibrate: [200, 100, 200],
            data: data,
            actions: [{ action: 'open', title: 'Abrir App' }]
        })
    );
});

// Solo permite mostrar una notificación por evento backgroundMessage
messaging.onBackgroundMessage(function (payload) {
    // Aplica el lock para móviles (iPhone/Safari)
    if (self.__notificationMobileLock) return;
    self.__notificationMobileLock = true;
    setTimeout(() => { self.__notificationMobileLock = false; }, 2000);
    console.log('[firebase-messaging-sw.js] onBackgroundMessage payload:', payload);
    if (payload && payload.notification && payload.notification.title) {
        const { title, body } = payload.notification;
        if (shouldSkipNotification(title, body)) return;
        self.registration.showNotification(title, {
            body: payload.notification.body || '',
            icon: payload.notification.icon || '/logo192.png'
        });
    } else {
        console.warn('[firebase-messaging-sw.js] onBackgroundMessage sin notification:', payload);
    }
});

// Maneja clics en la notificación
self.addEventListener('notificationclick', function (event) {
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
