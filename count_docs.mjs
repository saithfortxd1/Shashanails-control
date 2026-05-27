import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./serviceAccountKey.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

import { getFirestore } from 'firebase-admin/firestore';
const db = getFirestore('ai-studio-1dab9ad9-be83-460e-937c-58e9416c0ed3');

async function count() {
  const users = await db.collection('users').count().get();
  const apps = await db.collection('appointments').count().get();
  const clients = await db.collection('clients').count().get();
  const debts = await db.collection('debts').count().get();
  
  console.log('Users:', users.data().count);
  console.log('Appointments:', apps.data().count);
  console.log('Clients:', clients.data().count);
  console.log('Debts:', debts.data().count);
}

count().catch(console.error);
