import { useEffect, useState } from 'react';
import { Appointment, Client, Debt, OperationType, handleFirestoreError, AppUser } from './schema';
import { db, auth } from './firebase';
import { collection, query, onSnapshot, orderBy, where, doc, setDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

import { MaintenanceConfig } from './schema';

export function useMaintenanceMode() {
  const [maintenance, setMaintenance] = useState<MaintenanceConfig | null>(null);

  useEffect(() => {
    const unsubSnap = onSnapshot(doc(db, 'settings', 'maintenance'), (snap) => {
      if (snap.exists()) {
        setMaintenance(snap.data() as MaintenanceConfig);
      } else {
        setMaintenance({
          isActive: false,
          message: 'La aplicación se encuentra en mantenimiento.',
          startDate: '',
          endDate: '',
          excludedEmails: []
        });
      }
    });
    return () => unsubSnap();
  }, []);

  return maintenance;
}

export function useAppUser() {
  const [userProfile, setUserProfile] = useState<AppUser | null>(null);

  useEffect(() => {
    let unsubSnap: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (unsubSnap) {
        unsubSnap();
        unsubSnap = null;
      }

      if (!user) {
        setUserProfile(null);
        return;
      }
      const uid = user.uid;
      const email = user.email;
      const displayName = user.displayName;
      
      const userRef = doc(db, 'users', uid);
      unsubSnap = onSnapshot(userRef, async (snap) => {
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
    });

    return () => {
      unsubscribeAuth();
      if (unsubSnap) {
        unsubSnap();
      }
    };
  }, []);

  return userProfile;
}

export function useAllUsers() {
  const [users, setUsers] = useState<AppUser[]>([]);
  useEffect(() => {
    let unsubSnap: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (unsubSnap) {
        unsubSnap();
        unsubSnap = null;
      }

      if (!user) return;
      unsubSnap = onSnapshot(collection(db, 'users'), (snap) => {
        setUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppUser)));
      });
    });

    return () => {
      unsubscribeAuth();
      if (unsubSnap) {
        unsubSnap();
      }
    };
  }, []);
  return users;
}

export function useClients() {
  const [clients, setClients] = useState<Client[]>([]);
  
  useEffect(() => {
    let unsub: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (unsub) {
        unsub();
        unsub = null;
      }

      if (!user) {
        setClients([]);
        return;
      }
      const q = query(
        collection(db, 'clients'), 
        where("ownerId", "==", user.uid)
      );
      unsub = onSnapshot(q, (snap) => {
        const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
        data.sort((a, b) => a.firstName.localeCompare(b.firstName));
        setClients(data);
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'clients'));
    });

    return () => {
      unsubscribeAuth();
      if (unsub) {
        unsub();
      }
    };
  }, []);

  return clients;
}

export function useAppointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  
  useEffect(() => {
    let unsub: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (unsub) {
        unsub();
        unsub = null;
      }

      if (!user) {
        setAppointments([]);
        return;
      }
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const q = query(
        collection(db, 'appointments'),
        where("date", ">=", thirtyDaysAgo)
      );
      unsub = onSnapshot(q, (snap) => {
        const data = snap.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as Appointment))
          .filter(app => app.ownerId === user.uid);
        data.sort((a, b) => a.date - b.date);
        setAppointments(data);
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'appointments'));
    });

    return () => {
      unsubscribeAuth();
      if (unsub) {
        unsub();
      }
    };
  }, []);

  return appointments;
}

export function useDebts() {
  const [debts, setDebts] = useState<Debt[]>([]);
  
  useEffect(() => {
    let unsub: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (unsub) {
        unsub();
        unsub = null;
      }

      if (!user) {
        setDebts([]);
        return;
      }
      const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;
      const q = query(
        collection(db, 'debts'),
        where("createdAt", ">=", sixtyDaysAgo)
      );
      unsub = onSnapshot(q, (snap) => {
        const data = snap.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as Debt))
          .filter(debt => debt.ownerId === user.uid);
        data.sort((a, b) => b.createdAt - a.createdAt);
        setDebts(data);
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'debts'));
    });

    return () => {
      unsubscribeAuth();
      if (unsub) {
        unsub();
      }
    };
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
    let unsub: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (unsub) {
        unsub();
        unsub = null;
      }

      if (!user) {
        setServices([]);
        return;
      }
      const q = query(
        collection(db, 'frequentServices'),
        where("ownerId", "==", user.uid)
      );
      unsub = onSnapshot(q, (snap) => {
        const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FrequentService));
        data.sort((a, b) => a.name.localeCompare(b.name));
        setServices(data);
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'frequentServices'));
    });

    return () => {
      unsubscribeAuth();
      if (unsub) {
        unsub();
      }
    };
  }, []);

  return services;
}
