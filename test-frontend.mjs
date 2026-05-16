import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function test() {
  try {
    const q = query(collection(db, 'appointments'), where("ownerId", "==", "dummy"));
    const snap = await getDocs(q);
    console.log("Success! Docs:", snap.size);
  } catch (e) {
    console.error("Firestore Error:", e.message);
  }
}
test();
