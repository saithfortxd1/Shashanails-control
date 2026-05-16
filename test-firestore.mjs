import admin from 'firebase-admin';
import serviceAccount from './serviceAccountKey.json' with { type: "json" };

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

import { getFirestore } from 'firebase-admin/firestore';

try {
  const db = getFirestore('ai-studio-1dab9ad9-be83-460e-937c-58e9416c0ed3');
  const snapshot = await db.collection('users').limit(1).get();
  console.log("AI Studio DB Users:", snapshot.size);
} catch (e) {
  console.error("Error:", e);
}
