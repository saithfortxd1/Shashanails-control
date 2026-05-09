import { useEffect, useState } from 'react';
import { Appointment, Client, Debt, OperationType, handleFirestoreError, AppUser } from './schema';
import { db, auth } from './firebase';
import { collection, query, onSnapshot, orderBy, where, doc, setDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

export function useAppUser() {
  const [userProfile, setUserProfile] = useState<AppUser | null>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setUserProfile(null);
        return;
      }
      const uid = user.uid;
      const email = user.email;
      const displayName = user.displayName;
      
      const userRef = doc(db, 'users', uid);
      const unsubSnap = onSnapshot(userRef, async (snap) => {
        if (snap.exists()) {
          setUserProfile({ id: snap.id, ...snap.data() } as AppUser);
        } else {
          const newUser: AppUser = {
            id: uid,
            email,
            displayName,
            ultimoMesPagado: '2026-04',
            createdAt: Date.now()
          };
          await setDoc(userRef, newUser);
        }
      });
      return () => unsubSnap();
    });

    return () => unsubscribeAuth();
  }, []);

  return userProfile;
}

export function useAllUsers() {
  const [users, setUsers] = useState<AppUser[]>([]);
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) return;
      const unsubSnap = onSnapshot(collection(db, 'users'), (snap) => {
        setUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppUser)));
      });
      return () => unsubSnap();
    });
    return () => unsubscribeAuth();
  }, []);
  return users;
}

export function useClients() {
  const [clients, setClients] = useState<Client[]>([]);
  
  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(
      collection(db, 'clients'), 
      where("ownerId", "==", auth.currentUser.uid),
      orderBy('firstName', 'asc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
      setClients(data);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'clients'));
    return unsub;
  }, []);

  return clients;
}

export function useAppointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  
  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(
      collection(db, 'appointments'), 
      where("ownerId", "==", auth.currentUser.uid),
      orderBy('date', 'asc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
      setAppointments(data);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'appointments'));
    return unsub;
  }, []);

  return appointments;
}

export function useDebts() {
  const [debts, setDebts] = useState<Debt[]>([]);
  
  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(
      collection(db, 'debts'), 
      where("ownerId", "==", auth.currentUser.uid),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Debt));
      setDebts(data);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'debts'));
    return unsub;
  }, []);

  return debts;
}

export interface FrequentService {
  id: string;
  name: string;
  ownerId: string;
}

export function useFrequentServices() {
  const [services, setServices] = useState<FrequentService[]>([]);

  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(
      collection(db, 'frequentServices'),
      where("ownerId", "==", auth.currentUser.uid),
      orderBy('name', 'asc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FrequentService));
      setServices(data);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'frequentServices'));
    return unsub;
  }, []);

  return services;
}
