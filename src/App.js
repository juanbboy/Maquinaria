import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import cpd from './assets/cpdblanco.png';

// --- Sincronización en tiempo real usando Firebase Realtime Database ---
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, off } from "firebase/database";

// --- Firebase Cloud Messaging (FCM) ---
import { getMessaging, getToken, onMessage } from "firebase/messaging";

// Configuración de tu proyecto Firebase usando variables de entorno (.env)
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID,
  databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL // URL de la base de datos Realtime
};

// Inicializa la app de Firebase y la referencia a la base de datos
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const dbRef = ref(db, "imgStates");

// Inicializa FCM (notificaciones push) si es posible
let messaging;
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  try {
    messaging = getMessaging(app);
  } catch (e) {
    messaging = undefined;
  }
}

function App() {
  // Estado principal de las máquinas (sincronizado con Firebase)
  const [imgStates, setImgStates] = useState({});
  const isFirstLoad = useRef(true); // Para evitar sobrescribir al cargar por primera vez
  const ignoreNext = useRef(false); // Para evitar bucles de sincronización

  // --- SINCRONIZACIÓN EN TIEMPO REAL ENTRE TODOS LOS DISPOSITIVOS ---
  useEffect(() => {
    // Escucha cambios en la base de datos y actualiza el estado local
    const handler = onValue(dbRef, (snapshot) => {
      const remote = snapshot.val();
      if (remote && typeof remote === "object" && Object.keys(remote).length > 0) {
        ignoreNext.current = true;
        setImgStates(remote);
      }
      isFirstLoad.current = false;
    });
    return () => off(dbRef, "value", handler);
  }, []);

  useEffect(() => {
    // Sube los cambios locales a Firebase (evita subir si el cambio viene de Firebase)
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      return;
    }
    if (ignoreNext.current) {
      ignoreNext.current = false;
      return;
    }
    if (!imgStates || Object.keys(imgStates).length === 0) {
      return;
    }
    // Limpia claves undefined antes de subir a Firebase
    const cleanImgStates = removeUndefined(imgStates);
    set(dbRef, cleanImgStates);
  }, [imgStates]);

  // --- NOTIFICACIONES WEB (COMPATIBILIDAD MÓVIL, INCLUYENDO IPHONE) ---
  // Solicita permiso para notificaciones push
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
    } else if (!("Notification" in window)) {
      alert("Este navegador no soporta notificaciones push.");
    }
  }

  // --- iPhone/iOS: Mensaje de compatibilidad para notificaciones ---
  useEffect(() => {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIOS) {
      // Solo soporta notificaciones si es PWA instalada y iOS >= 16.4
      if (!window.matchMedia('(display-mode: standalone)').matches) {
        alert("Para recibir notificaciones en iPhone, abre esta página en Safari, pulsa 'Compartir' y selecciona 'Agregar a pantalla de inicio'. Luego abre la app desde el icono en tu pantalla de inicio.");
      }
    }
  }, []);

  // Estado para saber si ya se pidió permiso de notificaciones
  const [notifAsked, setNotifAsked] = useState(false);
  const handleAskNotif = () => {
    requestNotificationPermission();
    setNotifAsked(true);
  };

  // Estado para guardar el token de FCM del usuario
  const [fcmToken, setFcmToken] = useState(null);

  // Envía notificación FCM al backend cuando hay un cambio relevante
  const fcmSendNotification = React.useCallback(
    (() => {
      let lastSent = { key: null, ts: 0 };
      return async (title, body, changedKey) => {
        if (!fcmToken) return;
        // Evita notificaciones duplicadas en corto tiempo
        const now = Date.now();
        if (lastSent.key === changedKey && now - lastSent.ts < 2000) return;
        lastSent = { key: changedKey, ts: now };
        try {
          await fetch('https://maquinaria.vercel.app/api/send-fcm', {
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

  // --- Manejo de mensajes FCM recibidos en primer plano ---
  useEffect(() => {
    if (!messaging) return;
    onMessage(messaging, (payload) => {
      // Aquí podrías mostrar una notificación personalizada si lo deseas
    });
    // Evita notificaciones duplicadas en segundo plano (móvil)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        if (registration.active) {
          registration.active.postMessage({ type: 'DISABLE_DUPLICATE_FCM' });
        }
      });
    }
  }, [messaging]);

  // --- Sincronización entre pestañas usando localStorage events ---
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

  // --- Obtiene el token de FCM y lo guarda en la base de datos ---
  useEffect(() => {
    if (!messaging) return;
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIOS && !window.matchMedia('(display-mode: standalone)').matches) {
      return;
    }
    navigator.serviceWorker
      .getRegistration('/firebase-messaging-sw.js')
      .then((registration) => {
        if (!registration) {
          return navigator.serviceWorker.register('/firebase-messaging-sw.js');
        }
        return registration;
      })
      .then((registration) => {
        getToken(messaging, {
          vapidKey: process.env.REACT_APP_FIREBASE_VAPID_KEY,
          serviceWorkerRegistration: registration,
        })
          .then((currentToken) => {
            if (currentToken) {
              setFcmToken(currentToken);
              // Guarda el token en la base de datos para poder enviar notificaciones a este usuario
              set(ref(db, `fcmTokens/${currentToken}`), {
                registeredAt: Date.now(),
                userAgent: navigator.userAgent
              });
            }
          })
          .catch((err) => {
            console.log("An error occurred while retrieving token. ", err);
          });
      });
  }, [messaging]);

  // --- Opciones principales para los estados de las máquinas ---
  const [modal, setModal] = useState({ show: false, target: null, main: null });

  // Opciones principales (colores y etiquetas)
  const mainOptions = [
    { label: "Mecánico", main: 1, className: "btn btn-danger" },
    { label: "Barrado", main: 2, className: "btn btn-dark" },
    { label: "Electrónico", main: 3, className: "btn btn-warning" },
    { label: "Tallaje", main: 6, className: "btn btn-primary", style: { backgroundColor: "#007bff", borderColor: "#007bff" } },
    { label: "Seguimiento", main: 5, className: "btn btn-success" },
    { label: "Producción", main: 4, className: "btn btn-light" }
  ];

  // Opciones secundarias (subopciones por cada tipo principal)
  const secondaryOptionsMap = React.useMemo(() => ({
    1: [
      "Transferencia", "Vanizado", "Reviente LC", "Succion", "Reviente L180", "Piques",
      "Huecos y rotos", "Aguja", "Selectores", "Motores MPP", "Cuchillas", "correa", "Manguera rota", "Lubricacion", "Guia hilos", "Otros"
    ],
    2: [
      "Licra", "Nylon", "Motores"
    ],
    3: [
      "Valvulas", "Motores MPP", "No enciende", "Turbina", "Motor principal", "Sensores",
      "Paros", "Sin programa", "Fusible", "Guia hilos", "Corto circuito", "Carga no conectada", "bloqueo", "Sensor Lubricacion", "Otros"
    ],
    4: [],
    5: [
      "Transferencia", "Vanizado", "Reviente LC", "Succion", "Reviente L180", "Piques",
      "Huecos y rotos", "Aguja", "Selectores", "Motores MPP", "Cuchillas",
      "Valvulas", "Motores MPP", "No enciende", "Turbina", "Motor principal", "Sensores",
      "Paros", "Sin programa", "Fusible", "Materia prima", "Motores", "Sensor Lubricacion", "Lubricacion", "Guia hilos", "Otros"
    ],
    6: [
      "Cambio de talla", "Cambio de referencia"
    ]
  }), []);

  // --- Guardar snapshot del estado de las máquinas (entrega de turno) ---
  const handleSaveSnapshotNow = async () => {
    // Lista de nombres para seleccionar quién guarda el estado
    const nombres = ["F. Riobo", "N. Castañeda", "M. Gomez", "J. Bobadilla", "J. Salazar"];
    let step = 1;
    let nombreSeleccionado = null;
    let bitacoraEstados = {};
    let lastScrollTop = 0; // Guarda la posición del scroll en la bitácora

    return new Promise((resolve) => {
      // Modal principal para la bitácora
      const modalDiv = document.createElement('div');
      modalDiv.style.position = 'fixed';
      modalDiv.style.top = 0;
      modalDiv.style.left = 0;
      modalDiv.style.width = '100vw';
      modalDiv.style.height = '100vh';
      modalDiv.style.background = 'rgba(0,0,0,0.3)';
      modalDiv.style.display = 'flex';
      modalDiv.style.alignItems = 'center';
      modalDiv.style.justifyContent = 'center';
      modalDiv.style.zIndex = 99999;

      const inner = document.createElement('div');
      inner.style.background = 'white';
      inner.style.padding = '10px 24px';
      inner.style.borderRadius = '12px';
      inner.style.textAlign = 'center';
      inner.style.minWidth = '260px';

      // Renderiza el paso actual del modal (selección de nombre o bitácora)
      const renderStep = () => {
        inner.innerHTML = '';
        if (step === 1) {
          // Paso 1: Selección de nombre
          const title = document.createElement('div');
          title.style.fontSize = '22px';
          title.style.marginBottom = '18px';
          title.innerText = '¿Quién guarda el estado?';
          inner.appendChild(title);

          nombres.forEach((nombre, idx) => {
            const btn = document.createElement('button');
            btn.innerText = nombre;
            btn.className = 'btn btn-primary m-2';
            btn.style.fontSize = '20px';
            btn.style.padding = '10px 24px';
            btn.onclick = () => {
              nombreSeleccionado = nombre;
              step = 2;
              renderStep();
            };
            inner.appendChild(btn);
          });

          // Botón "Otro" para ingresar nombre personalizado
          const otroBtn = document.createElement('button');
          otroBtn.innerText = 'Otro...';
          otroBtn.className = 'btn btn-outline-secondary m-2';
          otroBtn.style.fontSize = '20px';
          otroBtn.style.padding = '10px 24px';
          otroBtn.onclick = () => {
            const nombreOtro = window.prompt('Escribe el nombre de quien guarda el estado:');
            if (nombreOtro && nombreOtro.trim().length > 0) {
              nombreSeleccionado = nombreOtro.trim();
              step = 2;
              renderStep();
            }
          };
          inner.appendChild(otroBtn);

          // Espaciado visual
          const spacer = document.createElement('div');
          spacer.style.height = '24px';
          inner.appendChild(spacer);

          // Botón para cerrar el modal
          const btnCerrar = document.createElement('button');
          btnCerrar.innerText = 'Cerrar';
          btnCerrar.className = 'btn btn-secondary mt-2';
          btnCerrar.style.fontSize = '20px';
          btnCerrar.style.marginTop = '16px';
          btnCerrar.onclick = () => {
            document.body.removeChild(modalDiv);
            resolve(null);
          };
          inner.appendChild(btnCerrar);
        } else if (step === 2) {
          // Paso 2: Bitácora gráfica de máquinas
          const title = document.createElement('div');
          title.style.fontSize = '22px';
          title.style.marginBottom = '18px';
          title.innerText = 'Bitácora del día: selecciona el estado de cada máquina atendida';
          inner.appendChild(title);

          // Lista de máquinas a mostrar
          const maquinas = [
            "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10", "S11", "S12", "S13", "S14", "S15", "S16", "S17", "S18", "S19",
            "26", "28", "30", "31", "32", "33", "34", "35", "36", "38", "39", "40", "43", "44", "45", "46", "47", "48", "49", "50", "51", "52", "53", "54", "55", "56", "57", "58", "64", "65", "66", "67", "69", "70", "71", "72", "73", "74", "75", "76"
          ];

          // Contenedor con scroll para la bitácora
          const scrollContainer = document.createElement('div');
          scrollContainer.style.maxHeight = '60vh';
          scrollContainer.style.overflowY = 'auto';
          scrollContainer.style.marginBottom = '18px';

          // Restaura la posición del scroll después de renderizar el grid
          setTimeout(() => { scrollContainer.scrollTop = lastScrollTop; }, 0);

          // Grid de máquinas
          const grid = document.createElement('div');
          grid.style.display = "grid";
          grid.style.gap = "0";
          grid.style.justifyItems = "center";
          grid.style.gridTemplateColumns = "repeat(auto-fit, minmax(90px, 1fr))";
          grid.style.marginBottom = "18px";

          maquinas.forEach(id => {
            // Celda de cada máquina
            const cell = document.createElement('div');
            cell.style.marginBottom = "2px";
            cell.style.width = "90px";
            cell.style.textAlign = "center";

            // Imagen de la máquina (input tipo image)
            const input = document.createElement('input');
            input.type = "image";
            input.width = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10", "S11", "S12", "S13", "S14", "S15", "S16", "S17", "S18", "S19"].includes(id) ? 90 : 60;
            input.style.borderRadius = "16px";
            input.style.marginBottom = "0";
            input.style.border = "2px solid #eee";
            input.style.background = "#fff";
            input.setAttribute("data-id", id);
            // Selecciona la imagen según el estado
            input.src = (() => {
              const val = bitacoraEstados[id];
              if (!val || val.main == null) return cpd;
              switch (val.main) {
                case 1: return require('./assets/cpdrojo.png');
                case 2: return require('./assets/cpdnegro.png');
                case 3: return require('./assets/cpdamarillo.png');
                case 4: return require('./assets/cpdblanco.png');
                case 5: return require('./assets/cpdverde.png');
                case 6: return require('./assets/cpdazul.png');
                default: return cpd;
              }
            })();
            // Al hacer click en la imagen, abre el modal de opciones
            input.onclick = (event) => {
              lastScrollTop = scrollContainer.scrollTop; // Guarda la posición antes de abrir modal
              // Modal para seleccionar opción principal
              const id = event.target.getAttribute('data-id');
              const modalOpc = document.createElement('div');
              modalOpc.style.position = 'fixed';
              modalOpc.style.top = 0;
              modalOpc.style.left = 0;
              modalOpc.style.width = '100vw';
              modalOpc.style.height = '100vh';
              modalOpc.style.background = 'rgba(0,0,0,0.3)';
              modalOpc.style.display = 'flex';
              modalOpc.style.alignItems = 'center';
              modalOpc.style.justifyContent = 'center';
              modalOpc.style.zIndex = 999999;

              const innerOpc = document.createElement('div');
              innerOpc.style.background = 'white';
              innerOpc.style.padding = '24px';
              innerOpc.style.borderRadius = '12px';
              innerOpc.style.textAlign = 'center';
              innerOpc.style.minWidth = '220px';

              const titleOpc = document.createElement('div');
              titleOpc.style.fontSize = '20px';
              titleOpc.style.marginBottom = '16px';
              titleOpc.innerText = `Máquina ${id}: Selecciona opción`;
              innerOpc.appendChild(titleOpc);

              // Botones de opciones principales
              mainOptions.forEach(opt => {
                const btn = document.createElement('button');
                btn.innerText = opt.label;
                btn.className = opt.className + " m-2";
                btn.style.fontSize = "20px";
                btn.style.padding = "10px 24px";
                if (opt.style) Object.assign(btn.style, opt.style);
                btn.onclick = () => {
                  if (!bitacoraEstados[id]) bitacoraEstados[id] = {};
                  bitacoraEstados[id].main = opt.main;
                  bitacoraEstados[id].secondary = null;
                  document.body.removeChild(modalOpc);
                  // Si requiere subopción, abre modal de subopciones
                  if (opt.main !== 4 && secondaryOptionsMap[opt.main] && secondaryOptionsMap[opt.main].length > 0) {
                    const modalSub = document.createElement('div');
                    modalSub.style.position = 'fixed';
                    modalSub.style.top = 0;
                    modalSub.style.left = 0;
                    modalSub.style.width = '100vw';
                    modalSub.style.height = '100vh';
                    modalSub.style.background = 'rgba(0,0,0,0.3)';
                    modalSub.style.display = 'flex';
                    modalSub.style.alignItems = 'center';
                    modalSub.style.justifyContent = 'center';
                    modalSub.style.zIndex = 999999;

                    const innerSub = document.createElement('div');
                    innerSub.style.background = 'white';
                    innerSub.style.padding = '24px';
                    innerSub.style.borderRadius = '12px';
                    innerSub.style.textAlign = 'center';
                    innerSub.style.minWidth = '220px';

                    const titleSub = document.createElement('div');
                    titleSub.style.fontSize = '20px';
                    titleSub.style.marginBottom = '16px';
                    titleSub.innerText = `Máquina ${id}: Selecciona subopción`;
                    innerSub.appendChild(titleSub);

                    // Botones de subopciones
                    secondaryOptionsMap[opt.main].forEach((sub, idx) => {
                      if (sub === "Otros") {
                        const btnSub = document.createElement('button');
                        btnSub.innerText = sub;
                        btnSub.className = "btn btn-outline-secondary m-2";
                        btnSub.style.fontSize = "18px";
                        btnSub.style.padding = "8px 18px";
                        btnSub.onclick = () => {
                          const custom = window.prompt("Escribe la causa personalizada:");
                          if (custom && custom.trim().length > 0) {
                            bitacoraEstados[id].secondary = idx;
                            bitacoraEstados[id].secondaryCustom = custom.trim();
                            document.body.removeChild(modalSub);
                            renderStep();
                            setTimeout(() => { scrollContainer.scrollTop = lastScrollTop; }, 0);
                          }
                        };
                        innerSub.appendChild(btnSub);
                      } else {
                        const btnSub = document.createElement('button');
                        btnSub.innerText = sub;
                        btnSub.className = "btn btn-outline-secondary m-2";
                        btnSub.style.fontSize = "18px";
                        btnSub.style.padding = "8px 18px";
                        btnSub.onclick = () => {
                          bitacoraEstados[id].secondary = idx;
                          bitacoraEstados[id].secondaryCustom = undefined;
                          document.body.removeChild(modalSub);
                          renderStep();
                          setTimeout(() => { scrollContainer.scrollTop = lastScrollTop; }, 0);
                        };
                        innerSub.appendChild(btnSub);
                      }
                    });

                    // Botón cancelar subopción
                    const btnCancel = document.createElement('button');
                    btnCancel.innerText = "Cancelar";
                    btnCancel.className = "btn btn-link mt-3";
                    btnCancel.style.fontSize = "16px";
                    btnCancel.onclick = () => {
                      document.body.removeChild(modalSub);
                      setTimeout(() => { scrollContainer.scrollTop = lastScrollTop; }, 0);
                    };
                    innerSub.appendChild(btnCancel);

                    modalSub.appendChild(innerSub);
                    document.body.appendChild(modalSub);
                  } else {
                    renderStep();
                    setTimeout(() => { scrollContainer.scrollTop = lastScrollTop; }, 0);
                  }
                };
                innerOpc.appendChild(btn);
              });

              // Botón cancelar opción principal
              const btnCancel = document.createElement('button');
              btnCancel.innerText = "Cancelar";
              btnCancel.className = "btn btn-link mt-3";
              btnCancel.style.fontSize = "16px";
              btnCancel.onclick = () => {
                document.body.removeChild(modalOpc);
                setTimeout(() => { scrollContainer.scrollTop = lastScrollTop; }, 0);
              };
              innerOpc.appendChild(btnCancel);

              modalOpc.appendChild(innerOpc);
              document.body.appendChild(modalOpc);
            };

            cell.appendChild(input);

            // Muestra el ID de la máquina
            const idDiv = document.createElement('div');
            idDiv.innerHTML = `<strong>${id}</strong>`;
            cell.appendChild(idDiv);

            // Etiqueta de subopción seleccionada
            const val = bitacoraEstados[id];
            let subLabel = "";
            if (val && typeof val === "object" && val.secondary != null && val.main != null) {
              const opts = secondaryOptionsMap[val.main] || [];
              if (opts[val.secondary] === "Otros" && val.secondaryCustom) {
                subLabel = val.secondaryCustom;
              } else {
                subLabel = opts[val.secondary] || "";
                if (subLabel.length > 18) subLabel = subLabel.slice(0, 15) + "...";
              }
            }
            const subDiv = document.createElement('div');
            subDiv.style.fontSize = "13px";
            subDiv.style.color = "#888";
            subDiv.style.minHeight = "20px";
            subDiv.style.height = "20px";
            subDiv.style.display = "flex";
            subDiv.style.alignItems = "center";
            subDiv.style.justifyContent = "center";
            subDiv.style.overflow = "hidden";
            subDiv.style.textOverflow = "ellipsis";
            subDiv.style.whiteSpace = "nowrap";
            subDiv.style.width = "100%";
            subDiv.style.borderRadius = "12px";
            subDiv.innerText = subLabel || "\u00A0";
            cell.appendChild(subDiv);

            grid.appendChild(cell);
          });

          scrollContainer.appendChild(grid);
          inner.appendChild(scrollContainer);

          // Botón para guardar el estado de la bitácora
          const btnGuardar = document.createElement('button');
          btnGuardar.innerText = 'Guardar estado';
          btnGuardar.className = 'btn btn-success m-2';
          btnGuardar.style.fontSize = '20px';
          btnGuardar.style.padding = '10px 24px';
          btnGuardar.onclick = () => {
            // Solo guarda las máquinas que tengan main seleccionado
            const seleccionadas = maquinas.filter(id => bitacoraEstados[id] && bitacoraEstados[id].main != null);
            document.body.removeChild(modalDiv);
            resolve({ nombre: nombreSeleccionado, bitacora: seleccionadas, bitacoraEstados: { ...bitacoraEstados } });
          };
          inner.appendChild(btnGuardar);

          // Botón para volver al paso anterior (selección de nombre)
          const btnAtras = document.createElement('button');
          btnAtras.innerText = 'Volver';
          btnAtras.className = 'btn btn-link mt-3';
          btnAtras.style.fontSize = '18px';
          btnAtras.onclick = () => {
            step = 1;
            renderStep();
          };
          inner.appendChild(btnAtras);
        }
      };

      renderStep();
      modalDiv.appendChild(inner);
      document.body.appendChild(modalDiv);
    }).then(async (result) => {
      if (!result) return;
      const nombre = typeof result === "string" ? result : result.nombre;
      const bitacora = typeof result === "string" ? [] : result.bitacora || [];
      let bitacoraEstados = typeof result === "string" ? {} : result.bitacoraEstados || {};

      // Limpia claves undefined antes de guardar en Firebase
      Object.keys(bitacoraEstados).forEach(id => {
        if (bitacoraEstados[id] && typeof bitacoraEstados[id] === "object") {
          Object.keys(bitacoraEstados[id]).forEach(k => {
            if (bitacoraEstados[id][k] === undefined) {
              delete bitacoraEstados[id][k];
            }
          });
        }
      });

      // Guarda solo los estados que NO son de producción (main !== 4)
      const snapshot = {};
      Object.entries(imgStates).forEach(([id, val]) => {
        if (val?.main !== 4) {
          snapshot[id] = {
            main: val?.main ?? null,
            secondary: val?.secondary ?? null,
            src: getSrc(id)
          };
        }
      });
      if (Object.keys(snapshot).length === 0) {
        alert('No hay estados fuera de producción para guardar.');
        return;
      }
      // Genera clave única para el snapshot
      const now = new Date();
      const pad = n => n.toString().padStart(2, '0');
      const key = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      await set(ref(db, `snapshots/${key}`), snapshot);
      await set(ref(db, `snapshotsInfo/${key}`), {
        guardadoPor: nombre,
        fecha: now.toISOString(),
        bitacora: bitacora,
        bitacoraEstados: bitacoraEstados
      });
      alert('Estado guardado correctamente por ' + nombre + '.');
      // Envía notificación de entrega de turno
      fcmSendNotification(
        "Entrega de turno registrada",
        `Entrega-turno-${nombre}-${Date.now()}`,
        `Entrega de turno registrada por ${nombre}`,

      );
    });
  };

  // --- Helpers para UI y lógica de la app ---

  // Devuelve una función para referenciar inputs de imagen (no usado aquí)
  function setImgRef(id) {
    return (el) => {
      // opcional: puedes guardar refs si los necesitas
    };
  }

  // Abre el modal de opciones para una máquina
  function img(event) {
    setModal({ show: true, target: event.target, main: null });
  }

  // Devuelve la imagen correspondiente al estado de la máquina
  function getSrc(id) {
    const val = imgStates[id];
    if (!val || val.main == null) return cpd;
    switch (val.main) {
      case 1: return require('./assets/cpdrojo.png');
      case 2: return require('./assets/cpdnegro.png');
      case 3: return require('./assets/cpdamarillo.png');
      case 4: return require('./assets/cpdblanco.png');
      case 5: return require('./assets/cpdverde.png');
      case 6: return require('./assets/cpdazul.png');
      default: return cpd;
    }
  }

  // Devuelve la etiqueta de la subopción seleccionada para una máquina
  function getSecondaryLabel(id) {
    const val = imgStates[id];
    if (!val || typeof val !== "object" || val.secondary == null || val.main == null) {
      return "";
    }
    const opts = secondaryOptionsMap[val.main] || [];
    if (opts[val.secondary] === "Otros" && val.secondaryCustom) {
      return val.secondaryCustom;
    }
    const label = opts[val.secondary] || "";
    if (label.length > 18) {
      return label.slice(0, 15) + "...";
    }
    return label;
  }

  // Devuelve las subopciones para el modal actual
  function getSecondaryOptions() {
    if (modal.main === 4) return [];
    if (modal.main && secondaryOptionsMap[modal.main]) {
      return secondaryOptionsMap[modal.main];
    }
    return [];
  }

  // Maneja la selección de una opción principal en el modal
  function handleMainOption(main) {
    if (main === 4 && modal.target) {
      const id = modal.target.getAttribute('data-id');
      let src = getSrc(id);
      setImgStates(prev => ({
        ...prev,
        [id]: { src, secondary: null, main }
      }));
      fcmSendNotification(
        `Máquina ${id}`,
        `Producción`,
        id
      );
      setModal({ show: false, target: null, main: null });
      return;
    }
    setModal((prev) => ({ ...prev, main }));
  }

  // Maneja la selección de una subopción (incluye opción personalizada "Otros")
  function handleSecondaryOption(secondaryIdx, customText) {
    if (!modal.target || !modal.main) return;
    const id = modal.target.getAttribute('data-id');
    let src = getSrc(id);
    setImgStates(prev => ({
      ...prev,
      [id]: {
        src,
        secondary: secondaryIdx,
        main: modal.main,
        secondaryCustom: (secondaryIdx !== undefined && getSecondaryOptions()[secondaryIdx] === "Otros") ? customText : undefined
      }
    }));
    const mainLabels = {
      1: "Mecánico",
      2: "Barrado",
      3: "Electrónico",
      4: "Producción",
      5: "Seguimiento"
    };
    const mainLabel = mainLabels[modal.main] || "";
    const subLabel = getSecondaryOptions()[secondaryIdx] === "Otros"
      ? customText
      : getSecondaryOptions()[secondaryIdx] || "";
    fcmSendNotification(
      `Máquina ${id}`,
      `${mainLabel}${subLabel ? " - " + subLabel : ""}`,
      id
    );
    setTimeout(() => {
      setModal({ show: false, target: null, main: null });
    }, 0);
  }

  // --- Helpers para snapshots locales (no usados en la UI principal) ---
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

  // --- Estado y helpers para mostrar todos los snapshots guardados en Firebase ---
  const [allSnapshots, setAllSnapshots] = useState([]);
  const [showAllSnapshots, setShowAllSnapshots] = useState(false);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);

  // Obtiene todos los snapshots guardados en Firebase (con info de quién lo guardó)
  const handleShowAllSnapshots = async () => {
    setLoadingSnapshots(true);
    setShowAllSnapshots(true);
    try {
      const { getDatabase, ref, get } = await import("firebase/database");
      const db = getDatabase();
      const [snap, infoSnap] = await Promise.all([
        get(ref(db, "snapshots")),
        get(ref(db, "snapshotsInfo"))
      ]);
      const data = snap.exists() ? snap.val() : {};
      const infoData = infoSnap.exists() ? infoSnap.val() : {};
      const arr = Object.entries(data)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([key, value]) => ({
          key,
          value,
          info: infoData[key] || {}
        }));
      setAllSnapshots(arr);
    } catch (e) {
      setAllSnapshots([]);
    }
    setLoadingSnapshots(false);
  };

  // --- Render principal de la app ---
  return (
    <div className="App">
      {/* Título principal */}
      <h1 className="text-center p-4">
        <span className="d-block d-md-none" style={{ fontSize: 26 }}>Circulares Pequeño Diametro</span>
        <span className="d-none d-md-block" style={{ fontSize: 36 }}>Circulares Pequeño Diametro</span>
      </h1>
      {/* Grid de máquinas para móvil */}
      <div className="p-1 d-block d-md-none">
        {/* Aquí se renderiza el grid de máquinas para móvil */}
        <div
          style={{
            display: "grid",
            gap: 0,
            justifyItems: "center",
            gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))"
          }}
        >
          {[
            // Solo IDs únicos para móvil, sin repetición de máquinas
            "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10", "S11", "S12", "S13", "S14", "S15", "S16", "S17", "S18", "S19",
            "26", "28", "30", "31", "32", "33", "34", "35", "36", "38", "39", "40", "43", "44", "45", "46", "47", "48", "49", "50", "51", "52", "53", "54", "55", "56", "57", "58", "64", "65", "66", "67", "69", "70", "71", "72", "73", "74", "75", "76"
          ].map(id => (
            <div key={id} style={{ marginBottom: 2, width: 90, textAlign: "center" }}>
              <input
                ref={setImgRef(id)}
                type="image"
                onClick={img}
                src={getSrc(id)}
                width={["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10", "S11", "S12", "S13", "S14", "S15", "S16", "S17", "S18", "S19"].includes(id) ? 90 : 60}
                alt={id}
                data-id={id}
                style={{
                  borderRadius: 16,
                  marginBottom: 0, // sin margen inferior
                  border: "2px solid #eee",
                  background: "#fff"
                }}
              />
              <div>
                <strong>{id}</strong>
              </div>
              <div style={{
                fontSize: 13,
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
                // background eliminado para dejar sin color
              }}>
                {getSecondaryLabel(id) || "\u00A0"}
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Grid de máquinas para PC/tablet */}
      <div className="px-4 d-none d-md-block">
        {/* Aquí se renderiza el grid de máquinas para escritorio */}
        <div className="row py-4 text-center">
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
            <input ref={setImgRef("76")} type="image" onClick={img} src={getSrc("76")} width={60} alt="Placeholder" data-id="76" style={{ borderRadius: 16 }} />
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
      </div>
      {/* Modal de opciones para cambiar estado de una máquina */}
      {
        modal.show && (
          <div style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
          }}>
            <div
              style={{
                background: 'white',
                padding: 24,
                borderRadius: 8,
                minWidth: 250,
                textAlign: 'center',
                maxHeight: '90vh',
                overflowY: 'auto'
              }}
            >
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
                        <div style={{ marginBottom: 16, fontSize: 22, color: '#007bff' }}>
                          Maquina en revision por: <b>{opts[secondaryIdx]}</b>
                        </div>
                      );
                    }
                    return (
                      <div style={{ marginBottom: 16, fontSize: 22, color: '#888' }}>
                        En Producción
                      </div>
                    );
                  })()}
                  {mainOptions.map(opt => (
                    <button
                      key={opt.main}
                      className={opt.className + " m-2"}
                      style={{ fontSize: 28, padding: '16px 32px', ...(opt.style || {}) }}
                      onClick={() => handleMainOption(opt.main)}
                    >
                      {opt.label}
                    </button>
                  ))}
                  <div>
                    <button className="btn btn-link mt-3" style={{ fontSize: 20 }} onClick={() => setModal({ show: false, target: null, main: null })}>Cancelar</button>
                  </div>
                </>
              ) : (
                <>
                  {/* Si es Produccion, no mostrar subopciones ni botones */}
                  {modal.main === 4 ? (
                    <div className="mb-3" style={{ fontSize: 22, color: "#888" }}>
                      En Producción.
                    </div>
                  ) : (
                    <>
                      <div className="mb-3" style={{ fontSize: 24 }}>Seleccione una causa</div>
                      {getSecondaryOptions().map((label, idx) => (
                        label === "Otros" ? (
                          <button key={idx}
                            className="btn btn-outline-secondary m-2"
                            style={{ fontSize: 24, padding: '12px 24px' }}
                            onClick={() => {
                              // Mostrar input para texto personalizado
                              const custom = window.prompt("Escribe la causa personalizada:");
                              if (custom && custom.trim().length > 0) {
                                handleSecondaryOption(idx, custom.trim());
                              }
                            }}
                          >
                            Otros
                          </button>

                        ) : (
                          <button
                            key={idx}
                            className="btn btn-outline-secondary m-2"
                            style={{ fontSize: 24, padding: '12px 24px' }}
                            onClick={() => handleSecondaryOption(idx)}
                          >
                            {label}
                          </button>
                        )
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
        )
      }
      {/* Botones de acciones principales */}
      <div className="mb-3 text-end">
        {/* <button className="btn btn-info me-2" onClick={handleShowSnapshot}>
          Ver estados guardados del día
        </button> */}
        <button className="btn btn-secondary me-2" onClick={handleShowAllSnapshots}>
          Ver estados guardados
        </button>
        <button className="btn btn-success me-2" onClick={handleSaveSnapshotNow}>
          Guardar estado
        </button>
        {/* Botón para pedir permiso de notificaciones en móviles */}
        {("Notification" in window && Notification.permission !== "granted" && !notifAsked) && (
          <button className="btn btn-warning" onClick={handleAskNotif}>
            Activar notificaciones (haz clic y acepta para recibir avisos)
          </button>
        )}
      </div>
      {/* Modal para mostrar todos los snapshots guardados */}
      {
        showAllSnapshots && (
          <div style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999
          }}>
            <div style={{
              background: 'white',
              padding: 24,
              borderRadius: 8,
              minWidth: 320,
              maxWidth: 900,
              maxHeight: '90vh',
              overflow: 'auto'
            }}>
              {/* Botón cerrar visible arriba a la derecha */}
              <button
                onClick={() => setShowAllSnapshots(false)}
                style={{
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  zIndex: 1000,
                  fontSize: 22,
                  background: 'transparent',
                  border: 'none',
                  color: '#333',
                  cursor: 'pointer'
                }}
                aria-label="Cerrar"
                title="Cerrar"
              >
                ×
              </button>
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
                        const mainLabels = {};
                        mainOptions.forEach(opt => { mainLabels[opt.main] = opt.label; });
                        // Usa secondaryOptionsMap directamente (el definido arriba en el componente)
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
                    {allSnapshots.map(({ key, value, info }) => {
                      // Formatea la fecha a dd/mm/aa hh:mm
                      let fecha = "";
                      const match = key.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})/);
                      if (match) {
                        const [/*_*/, y, m, d, h, min] = match;
                        fecha = `${d}/${m}/${y.slice(2)} ${h}:${min}`;
                      }
                      // Usa solo la fecha/hora de info.fecha si existe, si no la del key
                      let fechaMostrar = info.fecha
                        ? new Date(info.fecha).toLocaleString()
                        : fecha;
                      const mainLabels = {
                        1: "Mecánico",
                        2: "Barrado",
                        3: "Electrónico",
                        4: "Producción",
                        5: "Seguimiento",
                        6: "Tallaje"
                      };


                      return (
                        <div key={key} style={{ marginBottom: 18 }}>
                          <div style={{ fontSize: 15, color: "#000", marginBottom: 8 }}>
                            {fechaMostrar}
                            {info.guardadoPor && (
                              <> &nbsp;|&nbsp; <b>{info.guardadoPor}</b></>
                            )}
                            {/* Botón para ver bitácora */}
                            {info.bitacoraEstados && Object.keys(info.bitacoraEstados).length > 0 && (
                              <button
                                className="btn btn-outline-primary btn-sm ms-2"
                                style={{ fontSize: 13, padding: "2px 10px" }}
                                onClick={() => {
                                  // Mostrar modal con la bitácora gráfica
                                  const modalDiv = document.createElement('div');
                                  modalDiv.style.position = 'fixed';
                                  modalDiv.style.top = 0;
                                  modalDiv.style.left = 0;
                                  modalDiv.style.width = '100vw';
                                  modalDiv.style.height = '100vh';
                                  modalDiv.style.background = 'rgba(0,0,0,0.3)';
                                  modalDiv.style.display = 'flex';
                                  modalDiv.style.alignItems = 'center';
                                  modalDiv.style.justifyContent = 'center';
                                  modalDiv.style.zIndex = 999999;

                                  const inner = document.createElement('div');
                                  inner.style.background = 'white';
                                  inner.style.padding = '24px';
                                  inner.style.borderRadius = '12px';
                                  inner.style.textAlign = 'center';
                                  inner.style.minWidth = '320px';
                                  inner.style.maxWidth = '95vw';
                                  inner.style.maxHeight = '90vh';
                                  inner.style.overflow = 'auto';

                                  const title = document.createElement('div');
                                  title.style.fontSize = '20px';
                                  title.style.marginBottom = '16px';
                                  title.innerText = 'Bitácora gráfica de máquinas atendidas';
                                  inner.appendChild(title);

                                  // Renderiza el grid de la bitácora
                                  const grid = document.createElement('div');
                                  grid.style.display = "grid";
                                  grid.style.gap = "0";
                                  grid.style.justifyItems = "center";
                                  grid.style.gridTemplateColumns = "repeat(auto-fit, minmax(90px, 1fr))";
                                  grid.style.maxHeight = "60vh";
                                  grid.style.overflowY = "auto";
                                  Object.entries(info.bitacoraEstados).forEach(([id, val]) => {
                                    const cell = document.createElement('div');
                                    cell.style.marginBottom = "2px";
                                    cell.style.width = "90px";
                                    cell.style.textAlign = "center";
                                    // Imagen
                                    const img = document.createElement('img');
                                    img.width = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10", "S11", "S12", "S13", "S14", "S15", "S16", "S17", "S18", "S19"].includes(id) ? 90 : 60;
                                    img.style.borderRadius = "16px";
                                    img.style.marginBottom = "0";
                                    img.style.border = "2px solid #eee";
                                    img.style.background = "#fff";
                                    img.src = (() => {
                                      if (!val || val.main == null) return cpd;
                                      switch (val.main) {
                                        case 1: return require('./assets/cpdrojo.png');
                                        case 2: return require('./assets/cpdnegro.png');
                                        case 3: return require('./assets/cpdamarillo.png');
                                        case 4: return require('./assets/cpdblanco.png');
                                        case 5: return require('./assets/cpdverde.png');
                                        case 6: return require('./assets/cpdazul.png');
                                        default: return cpd;
                                      }
                                    })();
                                    cell.appendChild(img);

                                    // ID
                                    const idDiv = document.createElement('div');
                                    idDiv.innerHTML = `<strong>${id}</strong>`;
                                    cell.appendChild(idDiv);

                                    // Main label primero
                                    const mainDiv = document.createElement('div');
                                    mainDiv.style.fontSize = "12px";
                                    mainDiv.style.color = "#333";
                                    mainDiv.innerText = mainLabels[val.main] || "";
                                    cell.appendChild(mainDiv);

                                    // Subopción después
                                    let subLabel = "";
                                    if (val && typeof val === "object" && val.secondary != null && val.main != null) {
                                      const opts = secondaryOptionsMap[val.main] || [];
                                      if (opts[val.secondary] === "Otros" && val.secondaryCustom) {
                                        subLabel = val.secondaryCustom;
                                      } else {
                                        subLabel = opts[val.secondary] || "";
                                        if (subLabel.length > 18) subLabel = subLabel.slice(0, 15) + "...";
                                      }
                                    }
                                    const subDiv = document.createElement('div');
                                    subDiv.style.fontSize = "13px";
                                    subDiv.style.color = "#888";
                                    subDiv.style.minHeight = "20px";
                                    subDiv.style.height = "20px";
                                    subDiv.style.display = "flex";
                                    subDiv.style.alignItems = "center";
                                    subDiv.style.justifyContent = "center";
                                    subDiv.style.overflow = "hidden";
                                    subDiv.style.textOverflow = "ellipsis";
                                    subDiv.style.whiteSpace = "nowrap";
                                    subDiv.style.width = "100%";
                                    subDiv.style.borderRadius = "12px";
                                    subDiv.innerText = subLabel || "\u00A0";
                                    cell.appendChild(subDiv);

                                    grid.appendChild(cell);
                                  });

                                  inner.appendChild(grid);

                                  const btnCerrar = document.createElement('button');
                                  btnCerrar.innerText = "Cerrar";
                                  btnCerrar.className = "btn btn-secondary mt-3";
                                  btnCerrar.style.fontSize = "16px";
                                  btnCerrar.onclick = () => {
                                    document.body.removeChild(modalDiv);
                                  };
                                  inner.appendChild(btnCerrar);

                                  modalDiv.appendChild(inner);
                                  document.body.appendChild(modalDiv);
                                }}
                              >Ver bitácora</button>
                            )}
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
                            {Object.entries(value).map(([id, state]) => {
                              // Usa la imagen guardada en src, si no existe usa dummy
                              let src = state.src || "https://dummyimage.com/105x105/ccc/fff&text=" + id;
                              let mainLabel = mainLabels[state.main] || "";
                              let secondaryLabel = "";
                              if (typeof state === "object" && state.secondary != null && state.main != null && state.main !== 4) {
                                const opts = secondaryOptionsMap[state.main] || [];
                                secondaryLabel = opts[state.secondary] || "";
                              }
                              return (
                                <div key={id} style={{
                                  display: "flex", flexDirection: "column", alignItems: "center", margin: 10, width: 105
                                }}>
                                  <img
                                    src={state.src || "https://dummyimage.com/105x105/ccc/fff&text=" + id}
                                    alt={id}
                                    title={id}
                                    style={{
                                      borderRadius: 16,
                                      border: "2px solid #888",
                                      width: 95,
                                      height: 95,
                                      objectFit: "contain"
                                    }}
                                  />
                                  <div style={{ fontSize: 14, color: "#555", marginTop: 2 }}><b>{id}</b></div>
                                  {/* Main label primero */}
                                  <div style={{ fontSize: 13, fontWeight: "bold", color: "#222" }}>{mainLabel}</div>
                                  {/* Subopción después */}
                                  <div style={{ fontSize: 12, color: "#007bff" }}>
                                    {(state.main && state.secondary != null && secondaryOptionsMap[state.main])
                                      ? secondaryOptionsMap[state.main][state.secondary] || ""
                                      : ""}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div >
                )
              )}
              {/* Botón cerrar modal visible abajo */}
              <div style={{ textAlign: "center", marginTop: 24 }}>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 18, padding: "8px 32px" }}
                  onClick={() => setShowAllSnapshots(false)}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
}

// --- Utilidad para limpiar undefined de un objeto recursivamente ---
function removeUndefined(obj) {
  if (Array.isArray(obj)) {
    return obj.map(removeUndefined);
  } else if (obj && typeof obj === "object") {
    const clean = {};
    Object.keys(obj).forEach(k => {
      if (obj[k] !== undefined) {
        clean[k] = removeUndefined(obj[k]);
      }
    });
    return clean;
  }
  return obj;
}

export default App;


