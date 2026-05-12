import express from 'express';
import admin from 'firebase-admin';
import webpush from 'web-push';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de Web Push
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BDAjzTWwk5Wz4aa93fcaJgCm3_v2gCf1wNajU4KJ5zc1C2srCoW0VEnnGjOH-qWRRlxmXwChAGeOULpnclTMyFc';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'bGafGZ3QJWmxWP1IXXP6jLA_wFie6g5udpQjFijrzmU';

webpush.setVapidDetails(
  'mailto:saith.martinez7@gmail.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// Configuración de Firebase Admin (Parseando el JSON desde Render ENV)
try {
  let serviceAccount;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else {
    throw new Error("Falta la variable de entorno FIREBASE_SERVICE_ACCOUNT. Configúrala en Render con el contenido del JSON.");
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log("🔥 Firebase Admin inicializado correctamente.");
} catch (error) {
  console.error("❌ Error inicializando Firebase:", error.message);
  process.exit(1); // Detener el servidor si no hay conexión a la base de datos
}

import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore('ai-studio-1dab9ad9-be83-460e-937c-58e9416c0ed3');

// Endpoint de prueba (Health Check). Obligatorio para que Render mantenga vivo el servicio web gratuito.
app.get('/', (req, res) => {
  res.send('Servidor Push de Shasha Nails está vivo y corriendo 🚀');
});

// Arrancar el servidor Express
app.listen(PORT, () => {
  console.log(`🌍 Servidor escuchando en el puerto ${PORT}`);
  
  // Iniciar el cron de notificaciones
  startCronJob();
});

// Función de reconexión y monitoreo (Cron Job)
function startCronJob() {
  console.log("⏱️ Iniciando ciclo de monitoreo de citas (cada 1 min)...");
  
  setInterval(async () => {
    try {
      const now = Date.now();
      const limitTime = now + (2 * 60 * 60 * 1000); // 2 hours from now
      // Solo buscar citas que van a ocurrir en las próximas 2 horas para ahorrar cuota de lectura
      const snapshot = await db.collection('appointments')
        .where('status', '==', 'scheduled')
        .where('date', '>=', now - (60 * 60 * 1000)) // Incluir citas que pasaron hace menos de 1 hora
        .where('date', '<=', limitTime)
        .get();

      for (const doc of snapshot.docs) {
        const appointment = doc.data();
        const diffInMinutes = (appointment.date - now) / 1000 / 60;

        let shouldNotify = false;
        let fieldToUpdate = '';
        let minutesLeft = 0;

        // Evitar dobles notificaciones verificando los flags de la base de datos
        if (diffInMinutes > 0 && diffInMinutes <= 60 && !appointment.notified60) {
          shouldNotify = true; fieldToUpdate = 'notified60'; minutesLeft = 60;
        } else if (diffInMinutes > 0 && diffInMinutes <= 30 && !appointment.notified30) {
          shouldNotify = true; fieldToUpdate = 'notified30'; minutesLeft = 30;
        } else if (diffInMinutes > 0 && diffInMinutes <= 15 && !appointment.notified15) {
          shouldNotify = true; fieldToUpdate = 'notified15'; minutesLeft = 15;
        }

        if (shouldNotify) {
          // Extraer suscripción del dueño (admin)
          const userDoc = await db.collection('users').doc(appointment.ownerId).get();
          const userData = userDoc.data();

          if (userData && userData.pushSubscription) {
            const payload = JSON.stringify({
              title: 'Shasha Nails Recordatorio',
              body: `Cita con ${appointment.clientName} en ${minutesLeft} minutos.`,
            });

            // Enviar la notificación PUSH
            try {
              await webpush.sendNotification(userData.pushSubscription, payload);
              console.log(`✅ Push enviado (${minutesLeft}m) para cita: ${doc.id}`);
              
              // Marcar en la BD para evitar duplicados absolutos
              await db.collection('appointments').doc(doc.id).update({
                [fieldToUpdate]: true,
                updatedAt: Date.now()
              });
            } catch (err) {
              if (err.statusCode === 410 || err.statusCode === 404) {
                // La suscripción expiró o el usuario bloqueó notificaciones.
                console.warn(`⚠️ Suscripción Push expirada/inválida para usuario ${appointment.ownerId}. Eliminando...`);
                await db.collection('users').doc(appointment.ownerId).update({
                  pushSubscription: admin.firestore.FieldValue.delete()
                });
              } else {
                console.error(`❌ Error enviando push para cita ${doc.id}:`, err);
              }
            }
          } else {
            console.warn(`⚠️ Cita ${doc.id} ignorada: El usuario no tiene suscripción Push activa.`);
            // Aún así marcamos como notificada para que no se atasque evaluándola cada minuto
            await db.collection('appointments').doc(doc.id).update({
              [fieldToUpdate]: true
            });
          }
        }
      }
    } catch (error) {
      console.error("❌ Error grave en el cron job de Firebase:", error);
    }
  }, 60000);
}
