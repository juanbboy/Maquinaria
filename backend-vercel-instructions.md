# Backend para Vercel - Instrucciones rápidas

2. **Crea tu endpoint como función serverless**  
   Ejemplo para enviar FCM:

   ```javascript
   // e:\maquinas\api\send-fcm.js
   import fetch from 'node-fetch';

   export default async function handler(req, res) {
     if (req.method !== 'POST') {
       res.status(405).json({ error: 'Method not allowed' });
       return;
     }
     const { title, body } = req.body || {};
     // Aquí tu lógica para enviar FCM (usa tu clave de servidor FCM)
     // Ejemplo mínimo:
     try {
       const response = await fetch('https://fcm.googleapis.com/fcm/send', {
         method: 'POST',
         headers: {
           'Content-Type': 'application/json',
           'Authorization': `key=${process.env.FCM_SERVER_KEY}`
         },
         body: JSON.stringify({
           to: '/topics/all', // o el token de destino
           notification: { title, body }
         })
       });
       const data = await response.json();
       res.status(200).json({ ok: true, fcm: data });
     } catch (e) {
       res.status(500).json({ error: e.message });
     }
   }
   ```

3. **Agrega un archivo `vercel.json` en la raíz del proyecto:**
   ```json
   {
     "version": 2,
     "builds": [
       { "src": "api/*.js", "use": "@vercel/node" }
     ]
   }
   ```

4. **Agrega tus variables de entorno en Vercel Dashboard**  
   - Ve a [https://vercel.com/dashboard](https://vercel.com/dashboard) y selecciona tu proyecto.
   - Haz clic en **Settings** > **Environment Variables**.
   - Pulsa **Add** y pon el nombre (por ejemplo, `FCM_SERVER_KEY`) y el valor de tu clave.
   - Guarda los cambios.
   - Despliega de nuevo tu proyecto si es necesario.

5. **Sube el proyecto a GitHub/GitLab/Bitbucket y conéctalo a Vercel**  
   - Vercel detectará automáticamente la carpeta `/api` y desplegará tus endpoints.

6. **Tu endpoint estará disponible en:**  
   ```
   https://<tu-proyecto>.vercel.app/api/send-fcm
   ```

---

**Estructura mínima del proyecto:**
```
api/
  send-fcm.js
vercel.json
package.json (opcional, solo si necesitas dependencias)
```

**Nota:**  
Si necesitas dependencias (como `node-fetch`), crea un `package.json` dentro de la carpeta raíz y agrégalas.

---

**Para más detalles:**  
Consulta la documentación oficial de [Vercel Serverless Functions](https://vercel.com/docs/functions/serverless-functions/introduction).
