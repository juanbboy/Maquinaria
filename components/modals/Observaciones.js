const Observaciones = () => {

  const handleShowObservaciones = async () => {
    setShowObservaciones(true);
    setLoadingSnapshots(true);
    try {
      const { getDatabase, ref, get } = await import("firebase/database");
      const db = getDatabase();
      const infoSnap = await get(ref(db, "snapshotsInfo"));
      const infoData = infoSnap.exists() ? infoSnap.val() : {};
      // Ordenar por fecha descendente
      const arr = Object.entries(infoData)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([key, info]) => ({
          key,
          fecha: info.fecha ? new Date(info.fecha).toLocaleString() : key,
          guardadoPor: info.guardadoPor || "",
          observaciones: info.observaciones || ""
        }))
        .filter(item =>
          item.observaciones &&
          item.observaciones.trim() !== "" &&
          ("L. Paez" ? item.guardadoPor === "L. Paez" : true)
        );
      setObservacionesList(arr);
    } catch (e) {
      setObservacionesList([]);
    }
    setLoadingSnapshots(false);
  }


  return (
    <div>
      {
        showObservaciones && (
          <div style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999
          }}>
            <div style={{
              background: 'white',
              padding: 24,
              borderRadius: 8,
              minWidth: 320,
              maxWidth: 600,
              maxHeight: '90vh',
              overflow: 'auto',
              position: 'relative'
            }}>
              <button
                onClick={() => setShowObservaciones(false)}
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
              <h4>Observaciones generales</h4>
              {loadingSnapshots ? (
                <div>Cargando...</div>
              ) : (
                observacionesList.length === 0 ? (
                  <div>No hay observaciones generales guardadas.</div>
                ) : (
                  <div style={{ maxHeight: 500, overflowY: 'auto' }}>
                    {observacionesList.map(({ key, fecha, guardadoPor, observaciones }) => (
                      <div key={key} style={{
                        borderBottom: "1px solid #ddd",
                        marginBottom: 12,
                        paddingBottom: 8
                      }}>
                        <div style={{ fontSize: 15, color: "#000" }}>
                          {fecha}
                          {guardadoPor && <> &nbsp;|&nbsp; <b>{guardadoPor}</b></>}
                        </div>
                        <div style={{ textAlign: "start", fontSize: 16, color: "#333", margin: 5, whiteSpace: "pre-line" }}>
                          {observaciones}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
              <div style={{ textAlign: "center", marginTop: 18 }}>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 18, padding: "8px 32px" }}
                  onClick={() => setShowObservaciones(false)}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )
      }
    </div>
  );

};

export default Observaciones;
