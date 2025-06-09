import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import cpd from './assets/cpdblanco.png';

// --- Sincronización en tiempo real usando Firebase Realtime Database ---
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, off } from "firebase/database";

// --- Firebase Cloud Messaging (FCM) ---
import { getMessaging, getToken, onMessage } from "firebase/messaging";

// Configuración de tu proyecto Firebase usando variables de entorno
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID,
  databaseURL: process.env.FIREBASE_DATABASE_URL // <--- Usar variable de entorno
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const dbRef = ref(db, "imgStates");

// --- FCM: Inicializa y solicita permiso para notificaciones push ---
let messaging;
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  try {
    messaging = getMessaging(app);
  } catch (e) {
    messaging = undefined;
  }
}

function App() {
  // --- Elimina el forzado de reinicio de render al recargar la página ---
  // const [instanceKey] = useState(() => Date.now() + "_" + Math.random());

  // --- Opciones y helpers necesarios para la UI ---
  const secondaryOptionsMap = React.useMemo(() => ({
    1: [
      "Transferencia", "Vanizado", "Reviente LC", "Succion", "Reviente L180",
      "Huecos y rotos", "Aguja", "Selectores", "Motores MPP", "Cuchillas", "Otros"
    ],
    2: [
      "Materia prima", "Motores"
    ],
    3: [
      "Valvulas", "Motores MPP", "No enciende", "Turbina", "Motor principal",
      "Paros", "Sin programa", "Fusible", "Otros"
    ],
    4: [],
    5: [
      "Transferencia", "Vanizado", "Reviente LC", "Succion", "Reviente L180",
      "Huecos y rotos", "Aguja", "Selectores", "Motores MPP", "Cuchillas",
      "Valvulas", "Motores MPP", "No enciende", "Turbina", "Motor principal",
      "Paros", "Sin programa", "Fusible", "Materia prima", "Motores", "Otros"
    ]
  }), []);

  const [modal, setModal] = useState({ show: false, target: null, main: null });
  // --- Cargar estado inicial desde localStorage si existe ---
  const [imgStates, setImgStates] = useState(() => {
    try {
      const saved = localStorage.getItem('imgStates');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // --- SINCRONIZACIÓN EN TIEMPO REAL ENTRE TODOS LOS DISPOSITIVOS ---
  // Define ignoreNext ref at the top-level of App
  const ignoreNext = useRef(false);
  useEffect(() => {
    // Escucha SIEMPRE los cambios remotos en Firebase y actualiza el estado local y localStorage
    const handler = onValue(dbRef, (snapshot) => {
      const remote = snapshot.val() || {};
      ignoreNext.current = true; // Marca que el próximo cambio es remoto
      setImgStates(remote);
      try {
        localStorage.setItem('imgStates', JSON.stringify(remote));
      } catch { }
    });
    return () => off(dbRef, "value", handler);
  }, []);

  // --- Guardar imgStates en localStorage y Firebase cada vez que cambia ---
  useEffect(() => {
    try {
      localStorage.setItem('imgStates', JSON.stringify(imgStates));
    } catch { }
    set(dbRef, imgStates);
  }, [imgStates]);

  // --- Sincroniza entre pestañas usando el evento storage ---
  useEffect(() => {
    function handleStorage(e) {
      if (e.key === 'imgStates' && e.newValue) {
        try {
          const remote = JSON.parse(e.newValue);
          setImgStates(remote);
        } catch { }
      }
    }
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // --- Guardar snapshot manualmente con un botón ---
  const handleSaveSnapshotNow = async () => {
    // Guarda todas las opciones seleccionadas y la imagen (src) de cada máquina
    const snapshot = {};
    Object.entries(imgStates).forEach(([id, val]) => {
      snapshot[id] = {
        main: val?.main ?? null,
        secondary: val?.secondary ?? null,
        src: getSrc(id)
      };
    });
    const now = new Date();
    const pad = n => n.toString().padStart(2, '0');
    const key = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    await set(ref(db, `snapshots/${key}`), snapshot);
    alert('Estado guardado correctamente.');
  };

  // Actualiza Firebase cuando cambia el estado local (evita bucle infinito)
  const isFirstLoad = useRef(true);
  useEffect(() => {
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      return;
    }
    set(dbRef, imgStates);
  }, [imgStates]);

  // --- ELIMINA CUALQUIER USO DE LOCALSTORAGE PARA EL ESTADO ACTUAL ---
  // (Solo deja localStorage para snapshots diarios, si lo deseas)

  // --- NOTIFICACIONES WEB (COMPATIBILIDAD MÓVIL) ---
  // Solicita permiso para notificaciones push (debe ser por interacción del usuario en móviles)
  function requestNotificationPermission() {
    if ("Notification" in window && Notification.permission !== "granted") {
      Notification.requestPermission().then(permission => {
        if (permission === "granted") {
          alert("¡Notificaciones activadas! Ahora recibirás avisos en este navegador.");
        } else if (permission === "denied") {
          alert("Debes permitir las notificaciones para recibir avisos en este navegador.");
        }
      });
    } else if (Notification.permission === "denied") {
      alert("Debes permitir las notificaciones para recibir avisos en este navegador.");
    }
  }

  // Botón para pedir permiso explícitamente (necesario en móviles)
  const [notifAsked, setNotifAsked] = useState(false);
  const handleAskNotif = () => {
    requestNotificationPermission();
    setNotifAsked(true);
  };

  // Guarda el token FCM del usuario (puedes guardarlo en el estado o en localStorage)
  const [fcmToken, setFcmToken] = useState(null);

  // Envía notificación FCM al cambiar el estado (solo si hay token y no es cambio FCM)
  // Solo envía una notificación por acción del usuario, no por cada sincronización
  const fcmSendNotification = React.useCallback(
    (() => {
      let lastSent = { key: null, ts: 0 };
      return async (title, body, changedKey) => {
        if (!fcmToken) return;
        // Evita enviar notificaciones duplicadas para el mismo cambio en un corto periodo
        const now = Date.now();
        if (lastSent.key === changedKey && now - lastSent.ts < 2000) return;
        lastSent = { key: changedKey, ts: now };
        try {
          await fetch('http://localhost:4000/api/send-fcm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, body }),
          });
        } catch (e) {
          console.error('Error enviando notificación FCM al backend:', e);
        }
      };
    })(),
    [fcmToken]
  );

  // Solo muestra la notificación una vez por mensaje recibido

  const lastPayloadId = useRef(null);
  const lastPayloadTime = useRef(0);
  useEffect(() => {
    if (!messaging) return;
    onMessage(messaging, (payload) => {
      // Solo maneja lógica de UI si es necesario, pero NO muestres notificación aquí
      // Ejemplo: puedes actualizar el estado, mostrar un toast interno, etc.
      // Si quieres, puedes hacer console.log(payload);
      // console.log("Mensaje recibido en foreground:", payload);
    });
  }, [messaging]);

  // --- Sincronización del estado actual entre dispositivos usando localStorage events ---

  // Almacena el estado actual en localStorage (ya existe en useEffect)
  // Escucha cambios de localStorage para sincronizar entre pestañas/dispositivos
  useEffect(() => {
    function handleStorage(e) {
      if (e.key === 'imgStates' && e.newValue) {
        try {
          const remote = JSON.parse(e.newValue);
          setImgStates(remote);
        } catch { }
      }
    }
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // FCM: Solicita permiso y obtiene el token
  useEffect(() => {
    if (!messaging) return;
    navigator.serviceWorker
      .getRegistration('/firebase-messaging-sw.js')
      .then((registration) => {
        if (!registration) {
          return navigator.serviceWorker.register('/firebase-messaging-sw.js');
        }
        return registration;
      })
      .then((registration) => {
        // Usa messaging.getToken en el contexto correcto
        getToken(messaging, {
          vapidKey: process.env.REACT_APP_FIREBASE_VAPID_KEY,
          serviceWorkerRegistration: registration,
        })
          .then((currentToken) => {
            if (currentToken) {
              setFcmToken(currentToken);
              console.log("FCM Token:", currentToken);
              // Guarda el token en la base de datos (si no existe)
              if (currentToken) {
                // Guardar el token como clave para evitar duplicados
                set(ref(db, `fcmTokens/${currentToken}`), {
                  registeredAt: Date.now(),
                  userAgent: navigator.userAgent
                });
              }
            } else {
              console.log("No registration token available.");
            }
          })
          .catch((err) => {
            console.log("An error occurred while retrieving token. ", err);
          });
      });

    // Escucha mensajes push cuando la app está abierta
    if (messaging) {
      onMessage(messaging, (payload) => {
        // Solo maneja lógica de UI si es necesario, pero NO muestres notificación aquí
        // Ejemplo: puedes actualizar el estado, mostrar un toast interno, etc.
        // Si quieres, puedes hacer console.log(payload);
        // console.log("Mensaje recibido en foreground:", payload);
      });
    }
  }, []);

  // Elimina imports y variables no usados
  // cpdrojo, cpdnegro, cpdamarillo, cpdverde, imgRefs no usados

  // --- Opciones y helpers necesarios para la UI ---

  // Helpers para UI
  function setImgRef(id) {
    return (el) => {
      // opcional: puedes guardar refs si los necesitas
    };
  }

  function img(event) {
    // Lógica para abrir el modal, debes tener esta función definida
    setModal({ show: true, target: event.target, main: null });
  }

  function getSrc(id) {
    // Lógica para obtener el src de la imagen según el estado
    const val = imgStates[id];
    if (!val || val.main == null) return cpd;
    // Cambia el color según la opción principal (main)
    switch (val.main) {
      case 1: // Mecánico
        return require('./assets/cpdrojo.png');
      case 2: // Barrado
        return require('./assets/cpdnegro.png');
      case 3: // Electrónico
        return require('./assets/cpdamarillo.png');
      case 4: // Producción
        return require('./assets/cpdblanco.png');
      case 5: // Seguimiento
        return require('./assets/cpdverde.png');
      default:
        return cpd;
    }
  }

  function getSecondaryLabel(id) {
    const val = imgStates[id];
    if (!val || typeof val !== "object" || val.secondary == null || val.main == null) {
      return "";
    }
    const opts = secondaryOptionsMap[val.main] || [];
    const label = opts[val.secondary] || "";
    if (label.length > 18) {
      return label.slice(0, 15) + "...";
    }
    return label;
  }

  function getSecondaryOptions() {
    if (modal.main === 4) return [];
    if (modal.main && secondaryOptionsMap[modal.main]) {
      return secondaryOptionsMap[modal.main];
    }
    return [];
  }

  function handleMainOption(main) {
    if (main === 4 && modal.target) {
      const id = modal.target.getAttribute('data-id');
      let src = getSrc(id);
      setImgStates(prev => ({
        ...prev,
        [id]: { src, secondary: null, main }
      }));
      // Notificación solo si es acción local
      fcmSendNotification(
        `Cambio en máquina ${id}`,
        `Estado cambiado a Producción`,
        id
      );
      setModal({ show: false, target: null, main: null });
      return;
    }
    setModal((prev) => ({ ...prev, main }));
  }

  function handleSecondaryOption(secondaryIdx) {
    if (!modal.target || !modal.main) return;
    const id = modal.target.getAttribute('data-id');
    let src = getSrc(id);
    setImgStates(prev => ({
      ...prev,
      [id]: { src, secondary: secondaryIdx, main: modal.main }
    }));
    // Notificación solo si es acción local
    fcmSendNotification(
      `Cambio en máquina ${id}`,
      `Estado cambiado a ${secondaryOptionsMap[modal.main][secondaryIdx]}`,
      id
    );
    setTimeout(() => {
      setModal({ show: false, target: null, main: null });
    }, 0);
  }

  // Snapshots helpers (deben estar definidos)
  // eslint-disable-next-line no-unused-vars
  const [showSnapshot, setShowSnapshot] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [snapshotData, setSnapshotData] = useState([null, null, null]);
  // eslint-disable-next-line no-unused-vars
  const [snapshotDate, setSnapshotDate] = useState([null, null, null]);
  // eslint-disable-next-line no-unused-vars
  function handleShowSnapshot() {
    try {
      const dataArr = [0, 1, 2].map(i => {
        const data = localStorage.getItem(`imgStates_snapshot_${i}`);
        return data ? JSON.parse(data) : null;
      });
      const dateArr = [0, 1, 2].map(i => {
        const date = localStorage.getItem(`imgStates_snapshot_date_${i}`);
        return date ? new Date(date).toLocaleString() : null;
      });
      setSnapshotData(dataArr);
      setSnapshotDate(dateArr);
      setShowSnapshot(true);
    } catch {
      setSnapshotData([null, null, null]);
      setSnapshotDate([null, null, null]);
      setShowSnapshot(true);
    }
  }
  // eslint-disable-next-line no-unused-vars
  function handleCloseSnapshot() {
    setShowSnapshot(false);
  }

  // Estado y helpers para mostrar todos los snapshots guardados en Firebase
  const [allSnapshots, setAllSnapshots] = useState([]);
  const [showAllSnapshots, setShowAllSnapshots] = useState(false);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);

  // Función para obtener todos los snapshots guardados en Firebase
  const handleShowAllSnapshots = async () => {
    setLoadingSnapshots(true);
    setShowAllSnapshots(true);
    try {
      const { getDatabase, ref, get /*, child*/ } = await import("firebase/database");
      const db = getDatabase();
      const snapshotRef = ref(db, "snapshots");
      const snap = await get(snapshotRef);
      if (snap.exists()) {
        // Ordena por clave descendente (más reciente primero)
        const data = snap.val();
        const arr = Object.entries(data)
          .sort((a, b) => b[0].localeCompare(a[0]))
          .map(([key, value]) => ({ key, value }));
        setAllSnapshots(arr);
      } else {
        setAllSnapshots([]);
      }
    } catch (e) {
      setAllSnapshots([]);
    }
    setLoadingSnapshots(false);
  };

  return (
    <div className="p-4">
      <h1 className="text-center">Circulares Pequeño Diametro</h1>
      <div className="row py-5 text-center">
        <div className="col p-0 ">
          <div>
            <span className="d-none">16"(XL)</span>
          </div>
          <input ref={setImgRef("S19")} type="image" onClick={img} src={getSrc("S19")} width={90} alt="Placeholder" data-id="S19"
            style={{ borderRadius: 16 }} />
          <div>
            <strong>S19</strong>
            <div style={{
              fontSize: 14,
              color: "#888",
              minHeight: 20,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              width: "100%",
              borderRadius: 12
            }}>
              {getSecondaryLabel("S19") || "\u00A0"}
            </div>
          </div>
        </div>
        <div className="col p-0 ">
          <div>
            <span className="d-none">14"(M)</span>
          </div>
          <input ref={setImgRef("S3")} type="image" onClick={img} src={getSrc("S3")} width={90} alt="Placeholder" data-id="S3"
            style={{ borderRadius: 16 }} />
          <div>
            <strong>S3</strong>
            <div style={{
              fontSize: 14,
              color: "#888",
              minHeight: 20,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              width: "100%",
              borderRadius: 12
            }}>
              {getSecondaryLabel("S3") || "\u00A0"}
            </div>
          </div>
        </div>
        <div className="col p-0">
          <div>
            <span className="d-none">15"(L)</span>
          </div>
          <input ref={setImgRef("S2")} type="image" onClick={img} src={getSrc("S2")} width={90} alt="Placeholder" data-id="S2"
            style={{ borderRadius: 16 }} />
          <div>
            <strong>S2</strong>
            <div style={{
              fontSize: 14,
              color: "#888",
              minHeight: 20,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              width: "100%",
              borderRadius: 12
            }}>
              {getSecondaryLabel("S2") || "\u00A0"}
            </div>
          </div>
        </div>
        <div className="col p-0 ">
          <div>
            <span className="d-none">15"(L)</span>
          </div>
          <input ref={setImgRef("S1")} type="image" onClick={img} src={getSrc("S1")} width={90} alt="Placeholder" data-id="S1"
            style={{ borderRadius: 16 }} />
          <div>
            <strong>S1</strong>
            <div style={{
              fontSize: 14,
              color: "#888",
              minHeight: 20,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              width: "100%",
              borderRadius: 12
            }}>
              {getSecondaryLabel("S1") || "\u00A0"}
            </div>
          </div>
        </div>
        <div className="col p-0">
          <div>
            <span className="d-none">14"(M)</span>
          </div>
          <input ref={setImgRef("S6")} type="image" onClick={img} src={getSrc("S6")} width={90} alt="Placeholder" data-id="S6"
            style={{ borderRadius: 16 }} />
          <div>
            <strong>S6</strong>
            <div style={{
              fontSize: 14,
              color: "#888",
              minHeight: 20,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              width: "100%",
              borderRadius: 12
            }}>
              {getSecondaryLabel("S6") || "\u00A0"}
            </div>
          </div>
        </div>
        <div className="col  p-0">
          <div>
            <span className="d-none">13"(S)</span>
          </div>
          <input ref={setImgRef("S7")} type="image" onClick={img} src={getSrc("S7")} width={90} alt="Placeholder" data-id="S7"
            style={{ borderRadius: 16 }} />
          <div>
            <strong>S7</strong>
            <div style={{
              fontSize: 14,
              color: "#888",
              minHeight: 20,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              width: "100%",
              borderRadius: 12
            }}>
              {getSecondaryLabel("S7") || "\u00A0"}
            </div>
          </div>
        </div>
        <div className="col p-0">
          <div>
            <span className="d-none">13"(S)</span>
          </div>
          <input ref={setImgRef("S8")} type="image" onClick={img} src={getSrc("S8")} width={90} alt="Placeholder" data-id="S8"
            style={{ borderRadius: 16 }} />
          <div>
            <strong>S8</strong>
            <div style={{
              fontSize: 14,
              color: "#888",
              minHeight: 20,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              width: "100%",
              borderRadius: 12
            }}>
              {getSecondaryLabel("S8") || "\u00A0"}
            </div>
          </div>
        </div>
        <div className="col p-0 ">
          <div>
            <span className="d-none">13"(S)</span>
          </div>
          <input ref={setImgRef("S9")} type="image" onClick={img} src={getSrc("S9")} width={90} alt="Placeholder" data-id="S9"
            style={{ borderRadius: 16 }} />
          <div>
            <strong>S9</strong>
            <div style={{
              fontSize: 14,
              color: "#888",
              minHeight: 20,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              width: "100%",
              borderRadius: 12
            }}>
              {getSecondaryLabel("S9") || "\u00A0"}
            </div>
          </div>
        </div>
        <div className="col p-0 ">
          <div>
            <span className="d-none">13"(S)</span>
          </div>
          <input ref={setImgRef("S10")} type="image" onClick={img} src={getSrc("S10")} width={90} alt="Placeholder" data-id="S10"
            style={{ borderRadius: 16 }} />
          <div>
            <strong>S10</strong>
            <div style={{
              fontSize: 14,
              color: "#888",
              minHeight: 20,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              width: "100%",
              borderRadius: 12
            }}>
              {getSecondaryLabel("S10") || "\u00A0"}
            </div>
          </div>
        </div>
        <div className="col p-0 ">
          <div>
            <span className="d-none">14"(M)</span>
          </div>
          <input ref={setImgRef("S11")} type="image" onClick={img} src={getSrc("S11")} width={90} alt="Placeholder" data-id="S11"
            style={{ borderRadius: 16 }} />
          <div>
            <strong>S11</strong>
            <div style={{
              fontSize: 14,
              color: "#888",
              minHeight: 20,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              width: "100%",
              borderRadius: 12
            }}>
              {getSecondaryLabel("S11") || "\u00A0"}
            </div>
          </div>
        </div>
        <div className="col p-0 ">
          <div>
            <span className="d-none">14"(M)</span>
          </div>
          <input ref={setImgRef("S12")} type="image" onClick={img} src={getSrc("S12")} width={90} alt="Placeholder" data-id="S12"
            style={{ borderRadius: 16 }} />
          <div>
            <strong>S12</strong>
            <div style={{
              fontSize: 14,
              color: "#888",
              minHeight: 20,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              width: "100%",
              borderRadius: 12
            }}>
              {getSecondaryLabel("S12") || "\u00A0"}
            </div>
          </div>
        </div>
        <div className="col p-0">
          <div>
            <span className="d-none">14"(M)</span>
          </div>
          <input ref={setImgRef("S13")} type="image" onClick={img} src={getSrc("S13")} width={90} alt="Placeholder" data-id="S13"
            style={{ borderRadius: 16 }} />
          <div>
            <strong>S13</strong>
            <div style={{
              fontSize: 14,
              color: "#888",
              minHeight: 20,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              width: "100%",
              borderRadius: 12
            }}>
              {getSecondaryLabel("S13") || "\u00A0"}
            </div>
          </div>
        </div>
        <div className="col p-0">
          <div>
            <span className="d-none">15"(L)</span>
          </div>
          <input ref={setImgRef("S14")} type="image" onClick={img} src={getSrc("S14")} width={90} alt="Placeholder" data-id="S14"
            style={{ borderRadius: 16 }} />
          <div>
            <strong>S14</strong>
            <div style={{
              fontSize: 14,
              color: "#888",
              minHeight: 20,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              width: "100%",
              borderRadius: 12
            }}>
              {getSecondaryLabel("S14") || "\u00A0"}
            </div>
          </div>
        </div>
        <div className="col p-0">
          <div>
            <span className="d-none">15"(L)</span>
          </div>
          <input ref={setImgRef("S15")} type="image" onClick={img} src={getSrc("S15")} width={90} alt="Placeholder" data-id="S15"
            style={{ borderRadius: 16 }} />
          <div>
            <strong>S15</strong>
            <div style={{
              fontSize: 14,
              color: "#888",
              minHeight: 20,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              width: "100%",
              borderRadius: 12
            }}>
              {getSecondaryLabel("S15") || "\u00A0"}
            </div>
          </div>
        </div>

      </div>
      <div className="row py-5 text-center no-gutters align-items-center">
        <div className="col p-0 " >
          <div>
            <span className="d-none">15"(L)</span>
          </div>
          <input ref={setImgRef("S18")} type="image" onClick={img} src={getSrc("S18")} width={90} alt="Placeholder" data-id="S18"
            style={{ borderRadius: 16 }} />
          <div>
            <strong>S18</strong>
            <div style={{ fontSize: 14, color: "#888" }}>{getSecondaryLabel("S18")}</div>
          </div>
        </div>
        <div className="col p-0 " >
          <div>
            <span className="d-none">15"(L)</span>
          </div>
          <input ref={setImgRef("S17")} type="image" onClick={img} src={getSrc("S17")} width={90} alt="Placeholder" data-id="S17"
            style={{ borderRadius: 16 }} />
          <div>
            <strong>S17</strong>
            <div style={{ fontSize: 14, color: "#888" }}>{getSecondaryLabel("S17")}</div>
          </div>
        </div>
        <div className="col p-0 " >
          <div>
            <span className="d-none">14"(M)</span>
          </div>
          <input ref={setImgRef("S16")} type="image" onClick={img} src={getSrc("S16")} width={90} alt="Placeholder" data-id="S16"
            style={{ borderRadius: 16 }} />
          <div>
            <strong>S16</strong>
            <div style={{ fontSize: 14, color: "#888" }}>{getSecondaryLabel("S16")}</div>
          </div>
        </div>
        <div className="col p-0 " >
          <div>
            <span className="d-none">14"(M)</span>
          </div>
          <input ref={setImgRef("S4")} type="image" onClick={img} src={getSrc("S4")} width={90} alt="Placeholder" data-id="S4"
            style={{ borderRadius: 16 }} />
          <div>
            <strong>S4</strong>
            <div style={{ fontSize: 14, color: "#888" }}>{getSecondaryLabel("S4")}</div>
          </div>
        </div>
        <div className="col p-0" >
          <div>
            <span className="d-none">14"(M)</span>
          </div>
          <input ref={setImgRef("S5")} type="image" onClick={img} src={getSrc("S5")} width={90} alt="Placeholder" data-id="S5"
            style={{ borderRadius: 16 }} />
          <div>
            <strong>S5</strong>
            <div style={{ fontSize: 14, color: "#888" }}>{getSecondaryLabel("S5")}</div>
          </div>
        </div>

        <div className="col">
          <div className="row ">
            <div className="col " >
              <div>
                <span className="d-none">4"(Panty)</span>
              </div>
              <input ref={setImgRef("67")} type="image" onClick={img} src={getSrc("67")} width={60} alt="Placeholder" data-id="67"
                style={{ borderRadius: 16 }} />
              <div>
                <strong>67</strong>
                <div style={{
                  fontSize: 14,
                  color: "#888",
                  minHeight: 20,
                  height: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  width: "100%",
                  borderRadius: 12
                }}>
                  {getSecondaryLabel("67") || "\u00A0"}
                </div>
              </div>
            </div>
          </div>
          <div className="row ">
            <div className="col " >
              <div>
                <span className="d-none">4"(Panty)</span>
              </div>
              <input ref={setImgRef("66")} type="image" onClick={img} src={getSrc("66")} width={60} alt="Placeholder" data-id="66"
                style={{ borderRadius: 16 }} />
              <div>
                <strong>66</strong>
                <div style={{
                  fontSize: 14,
                  color: "#888",
                  minHeight: 20,
                  height: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  width: "100%",
                  borderRadius: 12
                }}>
                  {getSecondaryLabel("66") || "\u00A0"}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="col ">
          <div className="row ">
            <div className="col " >
              <div>
                <span className="d-none">4"(Body)</span>
              </div>
              <input ref={setImgRef("26")} type="image" onClick={img} src={getSrc("26")} width={60} alt="Placeholder" data-id="26"
                style={{ borderRadius: 16 }} />
              <div>
                <strong>26</strong>
                <div style={{
                  fontSize: 14,
                  color: "#888",
                  minHeight: 20,
                  height: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  width: "100%",
                  borderRadius: 12
                }}>
                  {getSecondaryLabel("26") || "\u00A0"}
                </div>
              </div>
            </div>
          </div>
          <div className="row ">
            <div className="col " >
              <div>
                <span className="d-none">4"(Media)</span>
              </div>
              <input ref={setImgRef("49")} type="image" onClick={img} src={getSrc("49")} width={60} alt="Placeholder" data-id="49"
                style={{ borderRadius: 16 }} />
              <div>
                <strong>49</strong>
                <div style={{
                  fontSize: 14,
                  color: "#888",
                  minHeight: 20,
                  height: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  width: "100%",
                  borderRadius: 12
                }}>
                  {getSecondaryLabel("49") || "\u00A0"}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="col ">
          <div className="row ">
            <div className="col " >
              <div>
                <span className="d-none">4"(Body)</span>
              </div>
              <input ref={setImgRef("28")} type="image" onClick={img} src={getSrc("28")} width={60} alt="Placeholder" data-id="28"
                style={{ borderRadius: 16 }} />
              <div>
                <strong>28</strong>
                <div style={{
                  fontSize: 14,
                  color: "#888",
                  minHeight: 20,
                  height: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  width: "100%",
                  borderRadius: 12
                }}>
                  {getSecondaryLabel("28") || "\u00A0"}
                </div>
              </div>
            </div>
          </div>
          <div className="row ">
            <div className="col " >
              <div>
                <span className="d-none">4"(Panty)</span>
              </div>
              <input ref={setImgRef("55")} type="image" onClick={img} src={getSrc("55")} width={60} alt="Placeholder" data-id="55"
                style={{ borderRadius: 16 }} />
              <div>
                <strong>55</strong>
                <div style={{
                  fontSize: 14,
                  color: "#888",
                  minHeight: 20,
                  height: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  width: "100%",
                  borderRadius: 12
                }}>
                  {getSecondaryLabel("55") || "\u00A0"}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="col ">
          <div className="row ">
            <div className="col " >
              <div>
                <span className="d-none">4"(Media)</span>
              </div>
              <input ref={setImgRef("30")} type="image" onClick={img} src={getSrc("30")} width={60} alt="Placeholder" data-id="30"
                style={{ borderRadius: 16 }} />
              <div>
                <strong>30</strong>
                <div style={{
                  fontSize: 14,
                  color: "#888",
                  minHeight: 20,
                  height: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  width: "100%",
                  borderRadius: 12
                }}>
                  {getSecondaryLabel("30") || "\u00A0"}
                </div>
              </div>
            </div>
          </div>
          <div className="row ">
            <div className="col " >
              <div>
                <span className="d-none">4"(Panty)</span>
              </div>
              <input ref={setImgRef("58")} type="image" onClick={img} src={getSrc("58")} width={60} alt="Placeholder" data-id="58"
                style={{ borderRadius: 16 }} />
              <div>
                <strong>58</strong>
                <div style={{
                  fontSize: 14,
                  color: "#888",
                  minHeight: 20,
                  height: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  width: "100%",
                  borderRadius: 12
                }}>
                  {getSecondaryLabel("58") || "\u00A0"}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="col ">
          <div className="row ">
            <div className="col " >
              <div>
                <span className="d-none">4"(Media)</span>
              </div>
              <input ref={setImgRef("31")} type="image" onClick={img} src={getSrc("31")} width={60} alt="Placeholder" data-id="31"
                style={{ borderRadius: 16 }} />
              <div>
                <strong>31</strong>
                <div style={{
                  fontSize: 14,
                  color: "#888",
                  minHeight: 20,
                  height: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  width: "100%",
                  borderRadius: 12
                }}>
                  {getSecondaryLabel("31") || "\u00A0"}
                </div>
              </div>
            </div>
          </div>
          <div className="row ">
            <div className="col " >
              <div>
                <span className="d-none">4"(Panty)</span>
              </div>
              <input ref={setImgRef("57")} type="image" onClick={img} src={getSrc("57")} width={60} alt="Placeholder" data-id="57"
                style={{ borderRadius: 16 }} />
              <div>
                <strong>57</strong>
                <div style={{
                  fontSize: 14,
                  color: "#888",
                  minHeight: 20,
                  height: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  width: "100%",
                  borderRadius: 12
                }}>
                  {getSecondaryLabel("57") || "\u00A0"}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="col ">
          <div className="row ">
            <div className="col " >
              <div>
                <span className="d-none">4"(Panty)</span>
              </div>
              <input ref={setImgRef("32")} type="image" onClick={img} src={getSrc("32")} width={60} alt="Placeholder" data-id="32"
                style={{ borderRadius: 16 }} />
              <div>
                <strong>32</strong>
                <div style={{
                  fontSize: 14,
                  color: "#888",
                  minHeight: 20,
                  height: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  width: "100%",
                  borderRadius: 12
                }}>
                  {getSecondaryLabel("32") || "\u00A0"}
                </div>
              </div>
            </div>
          </div>
          <div className="row ">
            <div className="col " >
              <div>
                <span className="d-none">4"(Panty)</span>
              </div>
              <input ref={setImgRef("56")} type="image" onClick={img} src={getSrc("56")} width={60} alt="Placeholder" data-id="56"
                style={{ borderRadius: 16 }} />
              <div>
                <strong>56</strong>
                <div style={{
                  fontSize: 14,
                  color: "#888",
                  minHeight: 20,
                  height: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  width: "100%",
                  borderRadius: 12
                }}>
                  {getSecondaryLabel("56") || "\u00A0"}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="col ">
          <div className="row ">
            <div className="col " >
              <div>
                <span className="d-none">4"(Panty)</span>
              </div>
              <input ref={setImgRef("33")} type="image" onClick={img} src={getSrc("33")} width={60} alt="Placeholder" data-id="33"
                style={{ borderRadius: 16 }} />
              <div>
                <strong>33</strong>
                <div style={{
                  fontSize: 14,
                  color: "#888",
                  minHeight: 20,
                  height: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  width: "100%",
                  borderRadius: 12
                }}>
                  {getSecondaryLabel("33") || "\u00A0"}
                </div>
              </div>
            </div>
          </div>
          <div className="row ">
            <div className="col " >
              <div>
                <span className="d-none">4"(Panty)</span>
              </div>
              <input ref={setImgRef("54")} type="image" onClick={img} src={getSrc("54")} width={60} alt="Placeholder" data-id="54"
                style={{ borderRadius: 16 }} />
              <div>
                <strong>54</strong>
                <div style={{
                  fontSize: 14,
                  color: "#888",
                  minHeight: 20,
                  height: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  width: "100%",
                  borderRadius: 12
                }}>
                  {getSecondaryLabel("54") || "\u00A0"}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="col ">
          <div className="row ">
            <div className="col " >
              <div>
                <span className="d-none">4"(Panty)</span>
              </div>
              <input ref={setImgRef("34")} type="image" onClick={img} src={getSrc("34")} width={60} alt="Placeholder" data-id="34"
                style={{ borderRadius: 16 }} />
              <div>
                <strong>34</strong>
                <div style={{
                  fontSize: 14,
                  color: "#888",
                  minHeight: 20,
                  height: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  width: "100%",
                  borderRadius: 12
                }}>
                  {getSecondaryLabel("34") || "\u00A0"}
                </div>
              </div>
            </div>
          </div>
          <div className="row ">
            <div className="col " >
              <div>
                <span className="d-none">4"(Panty)</span>
              </div>
              <input ref={setImgRef("53")} type="image" onClick={img} src={getSrc("53")} width={60} alt="Placeholder" data-id="53"
                style={{ borderRadius: 16 }} />
              <div>
                <strong>53</strong>
                <div style={{
                  fontSize: 14,
                  color: "#888",
                  minHeight: 20,
                  height: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  width: "100%",
                  borderRadius: 12
                }}>
                  {getSecondaryLabel("53") || "\u00A0"}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="col ">
          <div className="row ">
            <div className="col " >
              <div>
                <span className="d-none">4"(Panty)</span>
              </div>
              <input ref={setImgRef("35")} type="image" onClick={img} src={getSrc("35")} width={60} alt="Placeholder" data-id="35"
                style={{ borderRadius: 16 }} />
              <div>
                <strong>35</strong>
                <div style={{
                  fontSize: 14,
                  color: "#888",
                  minHeight: 20,
                  height: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  width: "100%",
                  borderRadius: 12
                }}>
                  {getSecondaryLabel("35") || "\u00A0"}
                </div>
              </div>
            </div>
          </div>
          <div className="row ">
            <div className="col " >
              <div>
                <span className="d-none">4"(Panty)</span>
              </div>
              <input ref={setImgRef("52")} type="image" onClick={img} src={getSrc("52")} width={60} alt="Placeholder" data-id="52"
                style={{ borderRadius: 16 }} />
              <div>
                <strong>52</strong>
                <div style={{
                  fontSize: 14,
                  color: "#888",
                  minHeight: 20,
                  height: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  width: "100%",
                  borderRadius: 12
                }}>
                  {getSecondaryLabel("52") || "\u00A0"}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="col ">
          <div className="row ">
            <div className="col " >
              <div>
                <span className="d-none">4"(Panty)</span>
              </div>
              <input ref={setImgRef("36")} type="image" onClick={img} src={getSrc("36")} width={60} alt="Placeholder" data-id="36"
                style={{ borderRadius: 16 }} />
              <div>
                <strong>36</strong>
                <div style={{
                  fontSize: 14,
                  color: "#888",
                  minHeight: 20,
                  height: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  width: "100%",
                  borderRadius: 12
                }}>
                  {getSecondaryLabel("36") || "\u00A0"}
                </div>
              </div>
            </div>
          </div>
          <div className="row ">
            <div className="col " >
              <div>
                <span className="d-none">4"(Panty)</span>
              </div>
              <input ref={setImgRef("51")} type="image" onClick={img} src={getSrc("51")} width={60} alt="Placeholder" data-id="51"
                style={{ borderRadius: 16 }} />
              <div>
                <strong>51</strong>
                <div style={{
                  fontSize: 14,
                  color: "#888",
                  minHeight: 20,
                  height: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  width: "100%",
                  borderRadius: 12
                }}>
                  {getSecondaryLabel("51") || "\u00A0"}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="col ">
          <div className="row ">
            <div className="col " >
              <div>
                <span className="d-none">4"(Body)</span>
              </div>
              <input ref={setImgRef("38")} type="image" onClick={img} src={getSrc("38")} width={60} alt="Placeholder" data-id="38"
                style={{ borderRadius: 16 }} />
              <div>
                <strong>38</strong>
                <div style={{
                  fontSize: 14,
                  color: "#888",
                  minHeight: 20,
                  height: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  width: "100%"
                }}>
                  {getSecondaryLabel("38") || "\u00A0"}
                </div>
              </div>
            </div>
          </div>
          <div className="row ">
            <div className="col " >
              <div>
                <span className="d-none">4"(Panty)</span>
              </div>
              <input ref={setImgRef("50")} type="image" onClick={img} src={getSrc("50")} width={60} alt="Placeholder" data-id="50" />
              <div>
                <strong>50</strong>
                <div style={{
                  fontSize: 14,
                  color: "#888",
                  minHeight: 20,
                  height: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  width: "100%",
                  borderRadius: 12
                }}>
                  {getSecondaryLabel("50") || "\u00A0"}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="col ">
          <div className="row ">
            <div className="col " >
              <div>
                <span className="d-none">4"(Media)</span>
              </div>
              <input ref={setImgRef("39")} type="image" onClick={img} src={getSrc("39")} width={60} alt="Placeholder" data-id="39"
                style={{ borderRadius: 16 }} />
              <div>
                <strong>39</strong>
                <div style={{
                  fontSize: 14,
                  color: "#888",
                  minHeight: 20,
                  height: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  width: "100%",
                  borderRadius: 12
                }}>
                  {getSecondaryLabel("39") || "\u00A0"}
                </div>
              </div>
            </div>
          </div>
          <div className="row ">
            <div className="col " >
              <div>
                <span className="d-none">4"(Media)</span>
              </div>
              <input ref={setImgRef("44")} type="image" onClick={img} src={getSrc("44")} width={60} alt="Placeholder" data-id="44"
                style={{ borderRadius: 16 }} />
              <div>
                <strong>44</strong>
                <div style={{
                  fontSize: 14,
                  color: "#888",
                  minHeight: 20,
                  height: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  width: "100%",
                  borderRadius: 12
                }}>
                  {getSecondaryLabel("44") || "\u00A0"}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="col ">
          <div className="row ">
            <div className="col " >
              <div>
                <span className="d-none">4"(Media)</span>
              </div>
              <input ref={setImgRef("40")} type="image" onClick={img} src={getSrc("40")} width={60} alt="Placeholder" data-id="40"
                style={{ borderRadius: 16 }} />
              <div>
                <strong>40</strong>
                <div style={{
                  fontSize: 14,
                  color: "#888",
                  minHeight: 20,
                  height: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  width: "100%",
                  borderRadius: 12
                }}>
                  {getSecondaryLabel("40") || "\u00A0"}
                </div>
              </div>
            </div>
          </div>
          <div className="row ">
            <div className="col " >
              <div>
                <span className="d-none">4"(Media)</span>
              </div>
              <input ref={setImgRef("43")} type="image" onClick={img} src={getSrc("43")} width={60} alt="Placeholder" data-id="43"
                style={{ borderRadius: 16 }} />
              <div>
                <strong>43</strong>
                <div style={{
                  fontSize: 14,
                  color: "#888",
                  minHeight: 20,
                  height: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  width: "100%",
                  borderRadius: 12
                }}>
                  {getSecondaryLabel("43") || "\u00A0"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="row py-5 text-center">

        <div className="col ">
          <div>
            <span className="d-none">4"(Cachimire)</span>
          </div>
          <input ref={setImgRef("64")} type="image" onClick={img} src={getSrc("64")} width={60} alt="Placeholder" data-id="64"
            style={{ borderRadius: 16 }} />
          <div>
            <strong>64</strong>
            <div style={{
              fontSize: 14,
              color: "#888",
              minHeight: 20,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              width: "100%",
              borderRadius: 12
            }}>
              {getSecondaryLabel("64") || "\u00A0"}
            </div>
          </div>
        </div>
        <div className="col ">
          <div>
            <span className="d-none">4"(Cachimire)</span>
          </div>
          <input ref={setImgRef("65")} type="image" onClick={img} src={getSrc("65")} width={60} alt="Placeholder" data-id="65"
            style={{ borderRadius: 16 }} />
          <div>
            <strong>65</strong>
            <div style={{
              fontSize: 14,
              color: "#888",
              minHeight: 20,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              width: "100%",
              borderRadius: 12
            }}>
              {getSecondaryLabel("65") || "\u00A0"}
            </div>
          </div>
        </div>
        <div className="col ">
          <div>
            <span className="d-none">4"(Media)</span>
          </div>
          <input ref={setImgRef("45")} type="image" onClick={img} src={getSrc("45")} width={60} alt="Placeholder" data-id="45"
            style={{ borderRadius: 16 }} />
          <div>
            <strong>45</strong>
            <div style={{
              fontSize: 14,
              color: "#888",
              minHeight: 20,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              width: "100%",
              borderRadius: 12
            }}>
              {getSecondaryLabel("45") || "\u00A0"}
            </div>
          </div>
        </div>
        <div className="col ">
          <div>
            <span className="d-none">4"(Media)</span>
          </div>
          <input ref={setImgRef("46")} type="image" onClick={img} src={getSrc("46")} width={60} alt="Placeholder" data-id="46"
            style={{ borderRadius: 16 }} />
          <div>
            <strong>46</strong>
            <div style={{
              fontSize: 14,
              color: "#888",
              minHeight: 20,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              width: "100%",
              borderRadius: 12
            }}>
              {getSecondaryLabel("46") || "\u00A0"}
            </div>
          </div>
        </div>
        <div className="col ">
          <div>
            <span className="d-none">4"(Media)</span>
          </div>
          <input ref={setImgRef("47")} type="image" onClick={img} src={getSrc("47")} width={60} alt="Placeholder" data-id="47"
            style={{ borderRadius: 16 }} />
          <div>
            <strong>47</strong>
            <div style={{
              fontSize: 14,
              color: "#888",
              minHeight: 20,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              width: "100%",
              borderRadius: 12
            }}>
              {getSecondaryLabel("47") || "\u00A0"}
            </div>
          </div>
        </div>
        <div className="col ">
          <div>
            <span className="d-none">4"(Media)</span>
          </div>
          <input ref={setImgRef("48")} type="image" onClick={img} src={getSrc("48")} width={60} alt="Placeholder" data-id="48"
            style={{ borderRadius: 16 }} />
          <div>
            <strong>48</strong>
            <div style={{
              fontSize: 14,
              color: "#888",
              minHeight: 20,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              width: "100%",
              borderRadius: 12
            }}>
              {getSecondaryLabel("48") || "\u00A0"}
            </div>
          </div>
        </div>
        <div className="col ">
          <div>
            <span className="d-none">5"(S-M-L)</span>
          </div>
          <input ref={setImgRef("69")} type="image" onClick={img} src={getSrc("69")} width={60} alt="Placeholder" data-id="69"
            style={{ borderRadius: 16 }} />
          <div>
            <strong>69</strong>
            <div style={{
              fontSize: 14,
              color: "#888",
              minHeight: 20,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              width: "100%",
              borderRadius: 12
            }}>
              {getSecondaryLabel("69") || "\u00A0"}
            </div>
          </div>
        </div>
        <div className="col ">
          <div>
            <span className="d-none">5"(S-M-L)</span>
          </div>
          <input ref={setImgRef("70")} type="image" onClick={img} src={getSrc("70")} width={60} alt="Placeholder" data-id="70"
            style={{ borderRadius: 16 }} />
          <div>
            <strong>70</strong>
            <div style={{
              fontSize: 14,
              color: "#888",
              minHeight: 20,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              width: "100%",
              borderRadius: 12
            }}>
              {getSecondaryLabel("70") || "\u00A0"}
            </div>
          </div>
        </div>
        <div className="col ">
          <div>
            <span className="d-none">5"(S-M-L)</span>
          </div>
          <input ref={setImgRef("71")} type="image" onClick={img} src={getSrc("71")} width={60} alt="Placeholder" data-id="71"
            style={{ borderRadius: 16 }} />
          <div>
            <strong>71</strong>
            <div style={{
              fontSize: 14,
              color: "#888",
              minHeight: 20,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              width: "100%",
              borderRadius: 12
            }}>
              {getSecondaryLabel("71") || "\u00A0"}
            </div>
          </div>
        </div>
        <div className="col ">
          <div>
            <span className="d-none">5"(S-M-L)</span>
          </div>
          <input ref={setImgRef("72")} type="image" onClick={img} src={getSrc("72")} width={60} alt="Placeholder" data-id="72"
            style={{ borderRadius: 16 }} />
          <div>
            <strong>72</strong>
            <div style={{
              fontSize: 14,
              color: "#888",
              minHeight: 20,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              width: "100%",
              borderRadius: 12
            }}>
              {getSecondaryLabel("72") || "\u00A0"}
            </div>
          </div>
        </div>
        <div className="col ">
          <div>
            <span className="d-none">5"(S-M-L)</span>
          </div>
          <input ref={setImgRef("73")} type="image" onClick={img} src={getSrc("73")} width={60} alt="Placeholder" data-id="73"
            style={{ borderRadius: 16 }} />
          <div>
            <strong>73</strong>
            <div style={{
              fontSize: 14,
              color: "#888",
              minHeight: 20,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              width: "100%",
              borderRadius: 12
            }}>
              {getSecondaryLabel("73") || "\u00A0"}
            </div>
          </div>
        </div>
        <div className="col ">
          <div>
            <span className="d-none">6"(XL-2XL)</span>
          </div>
          <input ref={setImgRef("74")} type="image" onClick={img} src={getSrc("74")} width={60} alt="Placeholder" data-id="74"
            style={{ borderRadius: 16 }} />
          <div>
            <strong>74</strong>
            <div style={{
              fontSize: 14,
              color: "#888",
              minHeight: 20,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              width: "100%",
              borderRadius: 12
            }}>
              {getSecondaryLabel("74") || "\u00A0"}
            </div>
          </div>
        </div>
        <div className="col ">
          <div>
            <span className="d-none">6"(XL-2XL)</span>
          </div>
          <input ref={setImgRef("75")} type="image" onClick={img} src={getSrc("75")} width={60} alt="Placeholder" data-id="75"
            style={{ borderRadius: 16 }} />
          <div>
            <strong>75</strong>
            <div style={{
              fontSize: 14,
              color: "#888",
              minHeight: 20,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              width: "100%",
              borderRadius: 12
            }}>
              {getSecondaryLabel("75") || "\u00A0"}
            </div>
          </div>
        </div>
        <div className="col ">
          <div>
            <span className="d-none">6"(XL-2XL)</span>
          </div>
          <input ref={setImgRef("76")} type="image" onClick={img} src={getSrc("76")} width={60} alt="Placeholder" data-id="76"
            style={{ borderRadius: 16 }} />
          <div>
            <strong>76</strong>
            <div style={{
              fontSize: 14,
              color: "#888",
              minHeight: 20,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              width: "100%",
              borderRadius: 12
            }}>
              {getSecondaryLabel("76") || "\u00A0"}
            </div>
          </div>
        </div>
      </div>

      {/* Modal de opciones */}
      {modal.show && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
          <div style={{ background: 'white', padding: 24, borderRadius: 8, minWidth: 250, textAlign: 'center' }}>
            {!modal.main ? (
              <>
                <div className="mb-3" style={{ fontSize: 24 }}>¿Escoge opción requerida?</div>
                {/* Mostrar subopción elegida anteriormente si existe */}
                {(() => {
                  let id = modal.target && modal.target.getAttribute('data-id');
                  let val = id && imgStates[id];
                  let secondaryIdx = null;
                  let mainIdx = 1;
                  if (val && typeof val === "object" && val.secondary != null) {
                    secondaryIdx = val.secondary;
                    mainIdx = val.main || 1;
                  }
                  if (secondaryIdx != null) {
                    const opts = secondaryOptionsMap[mainIdx] || [];
                    return (
                      <div style={{ marginBottom: 16, fontSize: 18, color: '#007bff' }}>
                        Sub-opción escogida anteriormente: <b>{opts[secondaryIdx]}</b>
                      </div>
                    );
                  }
                  return (
                    <div style={{ marginBottom: 16, fontSize: 18, color: '#888' }}>
                      No hay sub-opción escogida
                    </div>
                  );
                })()}
                <button className="btn btn-danger m-2" style={{ fontSize: 28, padding: '16px 32px' }} onClick={() => handleMainOption(1)}>Mecánico</button>
                <button className="btn btn-dark m-2" style={{ fontSize: 28, padding: '16px 32px' }} onClick={() => handleMainOption(2)}>Barrado</button>
                <button className="btn btn-warning m-2" style={{ fontSize: 28, padding: '16px 32px' }} onClick={() => handleMainOption(3)}>Electronico</button>
                <button className="btn btn-success m-2" style={{ fontSize: 28, padding: '16px 32px' }} onClick={() => handleMainOption(5)}>Seguimiento</button>
                <button className="btn btn-light m-2" style={{ fontSize: 28, padding: '16px 32px' }} onClick={() => handleMainOption(4)}>Produccion</button>
                <div>
                  <button className="btn btn-link mt-3" style={{ fontSize: 20 }} onClick={() => setModal({ show: false, target: null, main: null })}>Cancelar</button>
                </div>
              </>
            ) : (
              <>
                {/* Si es Produccion, no mostrar subopciones ni botones */}
                {modal.main === 4 ? (
                  <div className="mb-3" style={{ fontSize: 20, color: "#888" }}>
                    No hay sub-opciones para Producción.
                  </div>
                ) : (
                  <>
                    <div className="mb-3" style={{ fontSize: 24 }}>Seleccione una sub-opción</div>
                    {getSecondaryOptions().map((label, idx) => (
                      <button
                        key={idx}
                        className="btn btn-outline-secondary m-2"
                        style={{ fontSize: 24, padding: '12px 24px' }}
                        onClick={() => handleSecondaryOption(idx)}
                      >
                        {label}
                      </button>
                    ))}
                  </>
                )}
                <div>
                  <button className="btn btn-link mt-3" style={{ fontSize: 20 }} onClick={() => setModal({ show: false, target: null, main: null })}>Cancelar</button>
                  {modal.main !== 4 && (
                    <button className="btn btn-link mt-3" style={{ fontSize: 20 }} onClick={() => setModal({ show: true, target: modal.target, main: null })}>Volver</button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <div className="mb-3 text-end">
        {/* <button className="btn btn-info me-2" onClick={handleShowSnapshot}>
          Ver estados guardados del día
        </button> */}
        <button className="btn btn-secondary me-2" onClick={handleShowAllSnapshots}>
          Ver todos los estados guardados
        </button>
        <button className="btn btn-success me-2" onClick={handleSaveSnapshotNow}>
          Guardar estado ahora
        </button>
        {/* Botón para pedir permiso de notificaciones en móviles */}
        {("Notification" in window && Notification.permission !== "granted" && !notifAsked) && (
          <button className="btn btn-warning" onClick={handleAskNotif}>
            Activar notificaciones (haz clic y acepta para recibir avisos)
          </button>
        )}
      </div>


      {/* Modal para mostrar todos los snapshots guardados */}
      {showAllSnapshots && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999
        }}>
          <div style={{ background: 'white', padding: 24, borderRadius: 8, minWidth: 320, maxWidth: 900, maxHeight: '90vh', overflow: 'auto' }}>
            <h4>Todos los estados guardados</h4>
            {loadingSnapshots ? (
              <div>Cargando...</div>
            ) : (
              allSnapshots.length === 0 ? (
                <div>No hay snapshots guardados.</div>
              ) : (
                <div style={{ maxHeight: 500, overflowY: 'auto' }}>
                  <button
                    className="btn btn-primary mb-3"
                    onClick={() => {
                      // Renderiza la app con la información guardada (igual a la app)
                      const secondaryOptionsMap = {
                        1: [
                          "Transferencia", "Vanizado", "Reviente LC", "Succion", "Reviente L180",
                          "Huecos y rotos", "Aguja", "Selectores", "Motores MPP", "Cuchillas", "Otros"
                        ],
                        2: [
                          "Materia prima", "Motores"
                        ],
                        3: [
                          "Valvulas", "Motores MPP", "No enciende", "Turbina", "Motor principal",
                          "Paros", "Sin programa", "Fusible", "Otros"
                        ],
                        4: [],
                        5: [
                          "Transferencia", "Vanizado", "Reviente LC", "Succion", "Reviente L180",
                          "Huecos y rotos", "Aguja", "Selectores", "Motores MPP", "Cuchillas",
                          "Valvulas", "Motores MPP", "No enciende", "Turbina", "Motor principal",
                          "Paros", "Sin programa", "Fusible", "Materia prima", "Motores", "Otros"
                        ]
                      };
                      const mainLabels = {
                        1: "Mecánico",
                        2: "Barrado",
                        3: "Electrónico",
                        4: "Producción",
                        5: "Seguimiento"
                      };
                      const html = `
                        <html>
                        <head>
                          <title>Visualización gráfica de snapshots</title>
                          <style>
                            body { font-family: Arial, sans-serif; background: #f8f9fa; margin: 0; padding: 20px; }
                            .snap { margin-bottom: 32px; border-bottom: 1px solid #ccc; padding-bottom: 16px; }
                            .snap h3 { color: #007bff; margin-bottom: 8px; }
                            .img-grid { display: flex; flex-wrap: wrap; gap: 18px; }
                            .img-col { display: flex; flex-direction: column; align-items: center; margin: 8px; width: 90px; }
                            .img-col img { border-radius: 12px; border: 2px solid #888; width: 90px; height: 90px; object-fit: contain; }
                            .img-label { font-size: 13px; color: #555; margin-top: 2px; }
                            .main-label { font-size: 13px; font-weight: bold; color: #222; }
                            .secondary-label { font-size: 12px; color: #007bff; }
                          </style>
                        </head>
                        <body>
                          <h2>Visualización gráfica de snapshots</h2>
                          ${allSnapshots.map(({ key, value }) => `
                            <div class="snap">
                              <h3>${key}</h3>
                              <div class="img-grid">
                                ${Object.entries(value).map(([id, state]) => {
                        // Usa la imagen guardada en src, si no existe usa dummy
                        let src = state.src || "https://dummyimage.com/90x90/ccc/fff&text=" + id;
                        let mainLabel = mainLabels[state.main] || "";
                        let secondaryLabel = "";
                        if (typeof state === "object" && state.secondary != null && state.main != null && state.main !== 4) {
                          const opts = secondaryOptionsMap[state.main] || [];
                          secondaryLabel = opts[state.secondary] || "";
                        }
                        return `
                                    <div class="img-col">
                                      <img src="${src}" alt="${id}" title="${id}" />
                                      <div class="img-label"><b>${id}</b></div>
                                      <div class="main-label">${mainLabel}</div>
                                      <div class="secondary-label">${secondaryLabel}</div>
                                    </div>
                                  `;
                      }).join('')}
                              </div>
                            </div>
                          `).join('')}
                        </body>
                        </html>
                      `;
                      const win = window.open();
                      win.document.write(html);
                      win.document.title = "Visualización gráfica de snapshots";
                    }}
                  >
                    Ver todos en otra pestaña
                  </button>
                  {allSnapshots.map(({ key, value }) => {
                    // Formatea la fecha a dd/mm/aa hh:mm
                    let fecha = "";
                    // eslint-disable-next-line no-unused-vars
                    const match = key.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})/);
                    if (match) {
                      const [/*_*/, y, m, d, h, min] = match;
                      fecha = `${d}/${m}/${y.slice(2)} ${h}:${min}`;
                    }
                    return (
                      <div key={key} style={{ marginBottom: 18 }}>
                        <div style={{ fontSize: 15, color: "#000", marginBottom: 8 }}>
                          {fecha}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
                          {Object.entries(value).map(([id, state]) => {
                            let src = state.src || "https://dummyimage.com/90x90/ccc/fff&text=" + id;
                            let mainLabels = {
                              1: "Mecánico",
                              2: "Barrado",
                              3: "Electrónico",
                              4: "Producción",
                              5: "Seguimiento"
                            };
                            let secondaryOptionsMap = {
                              1: [
                                "Transferencia", "Vanizado", "Reviente LC", "Succion", "Reviente L180",
                                "Huecos y rotos", "Aguja", "Selectores", "Motores MPP", "Cuchillas", "Otros"
                              ],
                              2: [
                                "Materia prima", "Motores"
                              ],
                              3: [
                                "Valvulas", "Motores MPP", "No enciende", "Turbina", "Motor principal",
                                "Paros", "Sin programa", "Fusible", "Otros"
                              ],
                              4: [],
                              5: [
                                "Transferencia", "Vanizado", "Reviente LC", "Succion", "Reviente L180",
                                "Huecos y rotos", "Aguja", "Selectores", "Motores MPP", "Cuchillas",
                                "Valvulas", "Motores MPP", "No enciende", "Turbina", "Motor principal",
                                "Paros", "Sin programa", "Fusible", "Materia prima", "Motores", "Otros"
                              ]
                            };
                            let mainLabel = mainLabels[state.main] || "";
                            let secondaryLabel = "";
                            if (typeof state === "object" && state.secondary != null && state.main != null && state.main !== 4) {
                              const opts = secondaryOptionsMap[state.main] || [];
                              secondaryLabel = opts[state.secondary] || "";
                            }
                            return (
                              <div key={id} style={{
                                display: "flex", flexDirection: "column", alignItems: "center", margin: 8, width: 90
                              }}>
                                <img src={src} alt={id} title={id} style={{
                                  borderRadius: 12, border: "2px solid #888", width: 90, height: 90, objectFit: "contain"
                                }} />
                                <div style={{ fontSize: 13, color: "#555", marginTop: 2 }}><b>{id}</b></div>
                                <div style={{ fontSize: 13, fontWeight: "bold", color: "#222" }}>{mainLabel}</div>
                                <div style={{ fontSize: 12, color: "#007bff" }}>{secondaryLabel}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}
            <button className="btn btn-secondary" onClick={() => setShowAllSnapshots(false)}>Cerrar</button>
          </div>
        </div>
      )}
    </div >
  );
}

export default App;
