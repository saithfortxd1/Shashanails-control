import React, { useState, useEffect } from 'react';
import { auth } from './lib/firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, getRedirectResult } from 'firebase/auth';
import { useClients, useAppointments, useDebts, useFrequentServices, useAppUser, useAllUsers, useMaintenanceMode } from './lib/hooks';
import { Calendar, Users, Settings, Plus, LogOut, Edit2, LogIn, Check, X, MapPin, Receipt, CheckCircle, Trash2, MessageCircle, Upload, Image as ImageIcon, Eye, Shield, Loader2, AlertTriangle } from 'lucide-react';
import { db, storage } from './lib/firebase';
import { collection, doc, setDoc, deleteDoc, updateDoc, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Client, Appointment, Debt, handleFirestoreError, OperationType, formatCurrency, AppUser } from './lib/schema';
import { format, differenceInDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { playNotificationSound, stopNotificationSound } from './lib/sound';

const VAPID_PUBLIC_KEY = 'BDAjzTWwk5Wz4aa93fcaJgCm3_v2gCf1wNajU4KJ5zc1C2srCoW0VEnnGjOH-qWRRlxmXwChAGeOULpnclTMyFc';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function getSubscriptionStatus(user: AppUser | null): 'Activa' | 'Pendiente' | 'Suspendida' {
  if (!user) return 'Activa';
  if (user.subscriptionStatusOverride && user.subscriptionStatusOverride !== 'auto') {
    return user.subscriptionStatusOverride;
  }
  
  if (user.nextBillingDate) {
    const now = new Date();
    // Reset time to start of day for accurate day comparisons
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Parse nextBillingDate as local time to avoid timezone issues
    const [year, month, day] = user.nextBillingDate.split('-');
    const billingDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    
    const diffDays = differenceInDays(billingDate, today);
    
    if (diffDays < 0) return 'Suspendida'; // Ya pasó la fecha de corte
    if (diffDays <= 2) return 'Pendiente';  // Faltan 2 días o menos (Recordatorio)
    return 'Activa';
  }

  // Fallback to legacy logic for users without nextBillingDate
  const now = new Date();
  const cutoffStart = new Date('2026-05-14T00:00:00');
  
  if (now < cutoffStart) return 'Activa';

  const currentMonthStr = format(now, 'yyyy-MM');
  if (user.ultimoMesPagado === currentMonthStr) return 'Activa';
  
  const day = now.getDate();
  if (day < 12) return 'Activa';
  if (day >= 12 && day <= 14) return 'Pendiente'; // Reminder days
  return 'Suspendida';
}

function formatPaymentDate(mesStr: string | null) {
  if (!mesStr) return 'N/A';
  const [year, month] = mesStr.split('-');
  const date = new Date(parseInt(year), parseInt(month), 12);
  return format(date, "12 'de' MMMM 'de' yyyy", { locale: es });
}

export default function App() {
  const [user, setUser] = useState(auth.currentUser);
  const [tab, setTab] = useState<'agenda' | 'clients' | 'debts' | 'settings' | 'admin'>('agenda');
  const userProfile = useAppUser();
  const maintenance = useMaintenanceMode();
  const isAdmin = user?.email === 'saith.martinez7@gmail.com';
  
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [globalPreviewApp, setGlobalPreviewApp] = useState<Appointment | null>(null);

  useEffect(() => {
    // Catch Safari PWA Firebase bug
    getRedirectResult(auth).catch((error) => {
      if (error.message && error.message.includes('missing initial state')) {
        alert("⚠️ Error de Safari (iPhone) detectado:\n\nPara iniciar sesión, ve a los Ajustes de tu iPhone > Safari > Privacidad y desactiva 'Prevenir rastreo entre sitios' (o activa Permitir cookies de terceros).\n\nSi no funciona, usa la app directamente desde el navegador Safari en lugar del ícono de la pantalla de inicio.");
      }
    });

    const unsub = onAuthStateChanged(auth, u => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    const handleOpenPreview = (e: any) => {
      setTab('agenda');
      setGlobalPreviewApp(e.detail);
    };
    window.addEventListener('open-preview', handleOpenPreview);
    return () => window.removeEventListener('open-preview', handleOpenPreview);
  }, []);

  const handleLogin = async () => {
    setIsSigningIn(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error: any) {
      if (error.code !== 'auth/cancelled-popup-request' && error.code !== 'auth/popup-closed-by-user') {
        console.error(error);
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen font-body bg-brand-blush flex items-center justify-center p-4">
        <div className="bg-white rounded-[24px] shadow-[0_20px_40px_rgba(0,0,0,0.05)] border-2 border-brand-gold w-full max-w-sm p-8 space-y-8 text-center ring-1 ring-rose-100">
          <div>
            <img src="https://i.ibb.co/SDJT43T8/Captura-de-pantalla-2026-05-04-223430.png" alt="Logo" className="h-20 w-auto mx-auto object-contain mb-6 mix-blend-multiply" />
            <h1 className="text-[32px] font-display italic text-brand-fuchsia tracking-tight leading-none shadow-sm">Shasha Nails</h1>
            <p className="text-[12px] uppercase tracking-[2px] text-brand-ink/60 mt-3 font-bold">De Shanya Toro</p>
          </div>
          <button 
            onClick={handleLogin}
            disabled={isSigningIn}
            className="w-full flex items-center justify-center gap-3 bg-[#fafafa] border-2 border-[#eee] text-brand-ink py-4 px-6 rounded-xl font-bold hover:bg-white hover:border-brand-gold/30 hover:shadow-md transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSigningIn ? (
              <Loader2 className="w-5 h-5 animate-spin text-brand-ink" />
            ) : (
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5 group-hover:scale-110 transition-transform" alt="G" />
            )}
            {isSigningIn ? 'Iniciando sesión...' : 'Ingresar con Google'}
          </button>
        </div>
      </div>
    );
  }

  // Evaluar Mantenimiento
  let isMaintenanceActive = false;
  let computedMaintMessage = maintenance?.message || "La aplicación se encuentra en mantenimiento.";
  
  if (maintenance && !isAdmin) {
    if (!(maintenance.excludedEmails || []).includes(user.email || '')) {
      const now = new Date();
      let activeByDate = false;
      
      if (maintenance.endDate) {
        const end = new Date(maintenance.endDate);
        if (now < end) {
          activeByDate = true;
          computedMaintMessage += `\n\nVolveremos el ${format(end, "d 'de' MMMM 'a las' h:mm a", { locale: es })}.`;
        }
      }
      
      if (maintenance.isActive || activeByDate) {
        isMaintenanceActive = true;
      }
    }
  }

  if (isMaintenanceActive) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-blush to-[#fae1e6] flex flex-col font-body h-[100dvh] overflow-hidden items-center justify-center p-4">
        <div className="bg-white/90 backdrop-blur-md p-8 rounded-[30px] shadow-xl w-full max-w-sm text-center border border-white space-y-6 animate-slide-up">
          <div className="mx-auto bg-brand-fuchsia/10 w-20 h-20 rounded-full flex items-center justify-center">
             <AlertTriangle className="w-10 h-10 text-brand-fuchsia" />
          </div>
          <h1 className="text-2xl font-black text-brand-ink tracking-tight">Mantenimiento</h1>
          <p className="text-brand-ink/70 font-medium leading-relaxed whitespace-pre-line">
            {computedMaintMessage}
          </p>
          <button onClick={() => auth.signOut()} className="mt-4 px-6 py-2 bg-[#fafafa] border border-[#eee] rounded-full text-brand-ink/60 text-sm font-bold transition-colors hover:bg-gray-100">
            Cerrar Sesión
          </button>
        </div>
      </div>
    );
  }


  const handleSignIn = async () => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error: any) {
      if (error.code !== 'auth/cancelled-popup-request' && error.code !== 'auth/popup-closed-by-user') {
        console.error(error);
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen font-body bg-brand-blush flex items-center justify-center p-4">
        <div className="bg-white rounded-[24px] shadow-[0_20px_40px_rgba(0,0,0,0.05)] border-2 border-brand-gold w-full max-w-sm p-8 space-y-8 text-center ring-1 ring-rose-100">
          <div>
        <img src="https://i.ibb.co/SDJT43T8/Captura-de-pantalla-2026-05-04-223430.png" alt="Logo" className="h-20 w-auto mx-auto object-contain mb-6 mix-blend-multiply" />
            <h1 className="text-[32px] font-display italic text-brand-fuchsia tracking-tight leading-none shadow-sm">Shasha Nails</h1>
            <p className="text-[12px] uppercase tracking-[2px] text-brand-ink/60 mt-3 font-bold">De Shanya Toro</p>
          </div>
          <button
            onClick={handleSignIn}
            disabled={isSigningIn}
            className={`w-full flex items-center justify-center gap-3 bg-brand-fuchsia text-white p-5 rounded-[16px] text-lg font-bold uppercase tracking-[1px] shadow-[0_10px_20px_rgba(194,24,91,0.2)] transition-transform ${isSigningIn ? 'opacity-70' : 'active:scale-95'}`}
          >
            <LogIn className="w-6 h-6" />
            {isSigningIn ? 'Iniciando...' : 'Iniciar Sesión'}
          </button>
          <p className="text-[10px] text-brand-ink/40 uppercase font-bold tracking-widest">Sistema creado por SM</p>
        </div>
      </div>
    );
  }

  const status = userProfile && !isAdmin ? getSubscriptionStatus(userProfile) : 'Activa';

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-blush to-[#fae1e6] flex flex-col font-body pb-24 h-[100dvh] overflow-hidden">
      {status === 'Suspendida' && <SubscriptionOverlay />}
      <header className="bg-brand-glass backdrop-blur-[10px] pt-12 pb-4 px-6 sticky top-0 z-10 border-b border-white/50 flex flex-col items-center">
        <img src="https://i.ibb.co/SDJT43T8/Captura-de-pantalla-2026-05-04-223430.png" alt="Shasha Nails Logo" className="h-12 w-auto object-contain mb-3 mix-blend-multiply" />
        <h1 className="text-[32px] font-display italic text-brand-fuchsia text-center tracking-tight leading-none">Shasha Nails</h1>
        <p className="text-center text-[12px] uppercase tracking-[2px] text-brand-ink/60 mt-2 font-bold">Propiedad de Shanya Toro</p>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6 scroll-smooth space-y-6">
        {tab === 'agenda' && <AgendaView />}
        {tab === 'clients' && <ClientsView />}
        {tab === 'debts' && <DebtsView />}
        {tab === 'settings' && <SettingsView userProfile={userProfile} />}
        {tab === 'admin' && <AdminView />}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-brand-glass backdrop-blur-[10px] border-t border-brand-ink/5 pb-safe pt-3 px-6 flex justify-around shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.05)]">
        <NavBtn active={tab === 'agenda'} icon={Calendar} label="Agenda" onClick={() => setTab('agenda')} />
        <NavBtn active={tab === 'clients'} icon={Users} label="Clientes" onClick={() => setTab('clients')} />
        <NavBtn active={tab === 'debts'} icon={Receipt} label="Pagos" onClick={() => setTab('debts')} />
        <NavBtn active={tab === 'settings'} icon={Settings} label="Ajustes" onClick={() => setTab('settings')} />
        {isAdmin && <NavBtn active={tab === 'admin'} icon={Shield} label="Admin" onClick={() => setTab('admin')} />}
      </nav>
      
      <NotificationEngine />
      {globalPreviewApp && <PreviewModal app={globalPreviewApp} onClose={() => setGlobalPreviewApp(null)} />}
    </div>
  );
}

function NavBtn({ active, icon: Icon, label, onClick }: any) {
  return (
    <button 
      onClick={onClick}
      className={`flex-1 flex flex-col items-center justify-center p-2 rounded-[16px] transition-all mb-2 ${
        active ? 'bg-brand-fuchsia text-white shadow-[0_10px_20px_rgba(194,24,91,0.2)] -translate-y-1' : 'text-brand-ink/60 hover:text-brand-ink bg-transparent'
      }`}
    >
      <Icon className="w-6 h-6 mb-1" />
      <span className="text-[10px] font-bold tracking-wide uppercase truncate w-full text-center">{label}</span>
    </button>
  );
}

function NotificationEngine() {
  const appointments = useAppointments();
  const userProfile = useAppUser();

  // Passive push notification verification & registration on startup
  useEffect(() => {
    if (!userProfile) return;

    const autoRegisterPush = async () => {
      if (!('Notification' in window) || !('serviceWorker' in navigator)) return;

      if (Notification.permission === 'granted') {
        try {
          const registration = await navigator.serviceWorker.ready;
          const existingSub = await registration.pushManager.getSubscription();
          
          let currentSub = existingSub;
          if (!existingSub) {
            currentSub = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            });
          }

          if (currentSub) {
            const subJSON = JSON.parse(JSON.stringify(currentSub));
            const dbSubJSON = userProfile.pushSubscription;
            
            // Check if DB subscription needs update
            if (!dbSubJSON || dbSubJSON.endpoint !== subJSON.endpoint) {
              await updateDoc(doc(db, 'users', userProfile.id), {
                pushSubscription: subJSON
              });
              console.log("🔔 Push subscription auto-registered/updated in Firestore.");
            }
          }
        } catch (error) {
          console.error("Error in passive push subscription auto-registration:", error);
        }
      }
    };

    autoRegisterPush();
  }, [userProfile]);

  useEffect(() => {
    // Request permission once
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
      const now = Date.now();
      
      for (const app of appointments) {
        if (app.status !== 'scheduled') continue;
        
        const diffInMinutes = (app.date - now) / 1000 / 60;
        
        // Triggers around exactly 60 or 30 mins
        if (diffInMinutes > 0 && diffInMinutes <= 60 && !app.notified60) {
          triggerNotification(app, 60);
          await markNotified(app.id, 'notified60');
        } else if (diffInMinutes > 0 && diffInMinutes <= 30 && !app.notified30) {
          triggerNotification(app, 30);
          await markNotified(app.id, 'notified30');
        } else if (diffInMinutes > 0 && diffInMinutes <= 15 && !app.notified15) {
          triggerNotification(app, 15);
          await markNotified(app.id, 'notified15');
        }
      }

      // Check subscription
      if (userProfile && userProfile.email !== 'saith.martinez7@gmail.com') {
        const status = getSubscriptionStatus(userProfile);
        const lastNotified = localStorage.getItem('subNotifiedMonth');
        const currentMonthStr = format(new Date(), 'yyyy-MM');
        if (status === 'Pendiente' && lastNotified !== currentMonthStr) {
          triggerSubNotification();
          localStorage.setItem('subNotifiedMonth', currentMonthStr);
        }
      }
    }, 15000); // Check every 15s

    return () => clearInterval(interval);
  }, [appointments, userProfile]);

  const triggerSubNotification = () => {
    playNotificationSound();
    if ('Notification' in window && Notification.permission === 'granted') {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(registration => {
          registration.showNotification('Recordatorio de Pago', {
            body: `Tu pago de la suscripción de Shasha Nails vence pronto. ¡Evita interrupciones!`,
            icon: '/vite.svg',
            vibrate: [200, 100, 200],
            requireInteraction: true
          } as any);
        });
      } else {
        new Notification('Recordatorio de Pago', {
          body: `Tu pago de la suscripción de Shasha Nails vence pronto. ¡Evita interrupciones!`,
          icon: '/vite.svg',
        });
      }
    }
  };

  const triggerNotification = (app: Appointment, min: number) => {
    playNotificationSound();
    if ('Notification' in window && Notification.permission === 'granted') {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(registration => {
          registration.showNotification('Shasha Nails Recordatorio', {
            body: `Recordatorio: Cita con ${app.clientName} a las ${format(new Date(app.date), 'h:mm a')}`,
            icon: '/vite.svg',
            vibrate: [200, 100, 200, 100, 200, 100, 200],
            requireInteraction: true,
            silent: false
          } as any);
        });
      } else {
        const notification = new Notification('Shasha Nails Recordatorio', {
          body: `Recordatorio: Cita con ${app.clientName} a las ${format(new Date(app.date), 'h:mm a')}`,
          icon: '/vite.svg',
          silent: false
        });
        notification.onclick = () => {
          window.focus();
          stopNotificationSound();
          window.dispatchEvent(new CustomEvent('open-preview', { detail: app }));
          notification.close();
        };
      }
    }
  };

  const markNotified = async (id: string, field: 'notified60' | 'notified30' | 'notified15') => {
    try {
      await updateDoc(doc(db, 'appointments', id), { [field]: true, updatedAt: Date.now() });
    } catch (e) {
      console.error(e);
    }
  };

  return null;
}

function AgendaView() {
  const appointments = useAppointments();
  const clients = useClients();
  const [showAdd, setShowAdd] = useState(false);
  const [editingApp, setEditingApp] = useState<Appointment | null>(null);
  const [previewApp, setPreviewApp] = useState<Appointment | null>(null);
  const [mode, setMode] = useState<'upcoming' | 'calendar' | 'history'>('upcoming');
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const handleStatusUpdate = async (id: string, status: 'completed' | 'no-show' | 'cancelled') => {
    try {
      updateDoc(doc(db, 'appointments', id), {
        status,
        updatedAt: Date.now()
      }).catch(err => console.error("Error updating appointment status:", err));

      if (status === 'cancelled' || status === 'no-show') {
        const cleanDebts = async () => {
          const debtsSnapshot = await getDocs(query(collection(db, 'debts'), where('appointmentId', '==', id)));
          for (const d of debtsSnapshot.docs) {
            await deleteDoc(doc(db, 'debts', d.id));
          }
        };
        cleanDebts().catch(err => console.error("Error cleaning debts:", err));
      }
    } catch(err) {
      handleFirestoreError(err, OperationType.UPDATE, 'appointments');
    }
  };

  const handleDeleteHistory = async (id: string) => {
    try {
      if (window.confirm('¿Seguro que deseas eliminar esta cita del historial?')) {
        deleteDoc(doc(db, 'appointments', id)).catch(err => console.error("Error deleting appointment history:", err));
        const cleanDebts = async () => {
          const debtsSnapshot = await getDocs(query(collection(db, 'debts'), where('appointmentId', '==', id)));
          for (const d of debtsSnapshot.docs) {
            await deleteDoc(doc(db, 'debts', d.id));
          }
        };
        cleanDebts().catch(err => console.error("Error cleaning debts:", err));
      }
    } catch(err) {
      handleFirestoreError(err, OperationType.DELETE, 'appointments');
    }
  };

  const sendWhatsAppReminder = (e: React.MouseEvent, app: Appointment, clientPhone: string | undefined) => {
    e.stopPropagation();
    
    // Fechas y nombres limpios
    const dateFormatted = format(new Date(app.date), "dd 'de' MMMM", { locale: es });
    const timeFormatted = format(new Date(app.date), "h:mm a");
    const clientName = app.clientName;
    
    // MENSAJE A PRUEBA DE BALAS (Usando códigos Unicode en lugar del dibujo del emoji)
    // \u{1F496} = 💖 | \u{1F485} = 💅 | \u{2728} = ✨ | \u{1F648} = 🙈 | \u{23F0} = ⏰
    let msg = `Hola ${clientName}! \u{1F496}\nPaso por aquí para recordarte que tenemos tu cita de uñas agendada para el día ${dateFormatted} a las ${timeFormatted}. \u{1F485}\u{2728}\n\nTe agradezco un montón si puedes ser súper puntual. Sabes que después de 15 minutos de espera me toca cancelar la cita porque se me cruza con la siguiente niña y no quiero quedarles mal a ninguna. \u{1F648}\u{23F0}\n`;
    
    if (app.locationType === 'Presencial') {
      // \u{1F4CD} = 📍 | \u{1F3E0} = 🏠
      msg += `\nTe dejo la dirección por si no la tienes a la mano: \u{1F4CD} Calle 23a #1-17 apto 2\nBarrio: Claudia Catalina\nEspecificaciones: (vivero de la flores salida maicao - universidad de La Guajira, más específicamente atrás de la universidad Antonio Nariño, le sugiero que agarre toda la calle 15 y cruce a mano derecha cuando vea el letrero: Vivero de las flores, y nuevamente cruce a mano derecha, en una calle mocha; al final hay un apartamento blanco con baldosas claras y ahí está ubicado el salón). \u{1F3E0}\n`;
    }
    
    // \u{1F338} = 🌸
    msg += `\n¡Cualquier cosa me avisas con tiempo! Nos vemos pronto. \u{2728}\u{1F338}`;
    
    // Limpiar el teléfono y evitar que se duplique el 57
    const phoneNum = clientPhone ? clientPhone.replace(/\D/g, '') : '';
    const prefijo = phoneNum.startsWith('57') ? '' : '57'; 
    
    // Dejamos que el navegador arme la URL perfecta
    const url = new URL(`https://wa.me/${prefijo}${phoneNum}`);
    url.searchParams.append('text', msg); 
    
    window.open(url.toString(), '_blank');
  };

  const now = Date.now();

  const renderAppointment = (app: Appointment, currentMode?: string) => {
    const isPast = now > app.date; // 0 mins after start, show actions as soon as the appointment time hits
    const isFrozen = app.status === 'scheduled' && (now - app.date) > 7 * 24 * 60 * 60 * 1000;
    const client = clients.find(c => c.id === app.clientId);
    const pendingAmount = app.price - (app.advancePayment || 0);

    return (
      <div key={app.id} className="w-full text-left bg-white p-3 sm:p-4 rounded-[16px] shadow-[0_4px_6px_rgba(0,0,0,0.02)] border-l-[4px] border-l-brand-fuchsia flex flex-col space-y-2.5">
        <button onClick={() => setEditingApp(app)} className="flex items-start justify-between active:scale-[0.98] transition-transform w-full">
          <div className="flex items-start gap-3 flex-1">
            <div className="bg-brand-blush text-brand-fuchsia font-bold px-2.5 py-1.5 rounded-lg text-[12px] uppercase">
              {format(new Date(app.date), 'h:mm a')}
            </div>
            <div className="flex-1 text-left">
              <div className="font-bold text-[16px] text-brand-ink leading-none mt-0.5">{app.clientName}</div>
              <div className="text-[12px] opacity-60 text-brand-ink mb-1">{app.service}</div>
              <div className="text-[10px] flex flex-wrap gap-1.5 mt-1">
                {app.advancePayment > 0 ? (
                  <span className="bg-green-50 text-green-600 px-1.5 py-0.5 rounded-md font-bold">Abo: ${formatCurrency(app.advancePayment)}</span>
                ) : (
                  <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-md font-bold">Sin abo</span>
                )}
                {pendingAmount > 0 ? (
                  <span className="bg-red-50 text-red-600 px-1.5 py-0.5 rounded-md font-bold">Pen: ${formatCurrency(pendingAmount)}</span>
                ) : (
                  <span className="bg-brand-blush text-brand-fuchsia px-1.5 py-0.5 rounded-md font-bold">Pago</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <div className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider
              ${isFrozen ? 'bg-blue-100 text-blue-600' :
                app.status === 'scheduled' ? (isPast ? 'bg-red-100 text-red-600' : 'bg-brand-blush text-brand-fuchsia') : 
                app.status === 'completed' ? 'bg-green-100 text-green-600' : 
                'bg-gray-100 text-gray-600'}`}>
              {isFrozen ? 'Congelada' :
               app.status === 'scheduled' ? (isPast ? 'Atrasada' : 'Pendiente') : 
               app.status === 'completed' ? 'Completada' : 
               'Cancelada'}
            </div>
            <div className="text-right">
              <div className="font-extrabold text-[14px] text-brand-ink">${formatCurrency(app.price)}</div>
              <div className="text-[10px] opacity-80 text-brand-fuchsia leading-none mt-0.5">{app.locationType}</div>
            </div>
            {app.designImageUrl && (
              <img src={app.designImageUrl} alt="Diseño" className="w-10 h-10 rounded-lg object-cover border border-[#eee]" />
            )}
          </div>
        </button>

        <div className="flex flex-col gap-1.5 pt-2 border-t border-[#eee]">
          <div className="flex gap-2">
            {(!isPast && app.status === 'scheduled') && (
              <button onClick={(e) => sendWhatsAppReminder(e, app, client?.phone)} className="flex-1 bg-[#25D366]/10 text-[#25D366] font-bold py-2 rounded-lg text-[11px] transition-colors hover:bg-[#25D366]/20 flex items-center justify-center gap-1.5">
                <MessageCircle className="w-3.5 h-3.5" /> Recordatorio
              </button>
            )}
            {currentMode === 'history' && (
              <button onClick={(e) => { e.stopPropagation(); handleDeleteHistory(app.id); }} className="flex-1 bg-red-50 text-red-600 font-bold py-2 rounded-lg text-[11px] transition-colors hover:bg-red-100 flex items-center justify-center gap-1.5">
                <Trash2 className="w-3.5 h-3.5" /> Eliminar
              </button>
            )}
            <button onClick={(e) => { e.stopPropagation(); setPreviewApp(app); }} className="flex-1 bg-blue-50 text-blue-600 font-bold py-2 rounded-lg text-[11px] transition-colors hover:bg-blue-100 flex items-center justify-center gap-1.5">
              <Eye className="w-3.5 h-3.5" /> Detalles
            </button>
          </div>
          {isPast && app.status === 'scheduled' && (
            isFrozen ? (
              <button onClick={(e) => { e.stopPropagation(); setEditingApp(app); }} className="w-full bg-blue-50 text-blue-600 font-bold py-2 rounded-lg text-[11px] transition-colors hover:bg-blue-100 flex items-center justify-center gap-1.5 mt-2">
                <Calendar className="w-3.5 h-3.5" /> Activar Cita (Cambiar Fecha)
              </button>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <button onClick={(e) => { e.stopPropagation(); handleStatusUpdate(app.id, 'completed'); }} className="flex flex-col items-center justify-center bg-green-50 text-green-600 font-bold py-1.5 rounded-lg text-[10px] gap-1 hover:bg-green-100 transition-colors">
                  <CheckCircle className="w-3.5 h-3.5" /> Completar
                </button>
                <button onClick={(e) => { e.stopPropagation(); handleStatusUpdate(app.id, 'cancelled'); }} className="flex flex-col items-center justify-center bg-red-50 text-red-600 font-bold py-1.5 rounded-lg text-[10px] gap-1 hover:bg-red-100 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" /> Cancelar
                </button>
                <button onClick={(e) => { e.stopPropagation(); setEditingApp(app); }} className="flex flex-col items-center justify-center bg-brand-blush text-brand-fuchsia font-bold py-1.5 rounded-lg text-[10px] gap-1 hover:bg-brand-blush/80 transition-colors">
                  <Calendar className="w-3.5 h-3.5" /> Aplazar
                </button>
              </div>
            )
          )}
        </div>
      </div>
    );
  };

  const selectedDateApps = mode === 'calendar' ? appointments.filter(a => format(new Date(a.date), 'yyyy-MM-dd') === selectedDate && a.status === 'completed') : [];
  const dailyTotal = selectedDateApps.reduce((acc, app) => acc + app.price, 0);

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  
  const selectedDayAllApps = appointments.filter(a => format(new Date(a.date), 'yyyy-MM-dd') === selectedDate);

  return (
    <>
      <div className="bg-brand-glass backdrop-blur-[10px] rounded-[24px] p-6 border border-white flex flex-col space-y-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[24px] font-bold text-brand-ink">Citas</h2>
            <p className="text-[14px] font-bold text-brand-fuchsia">{mode === 'upcoming' ? format(new Date(), 'dd MMM yyyy') : 'Calendario'}</p>
          </div>
          <button onClick={() => setShowAdd(true)} className="p-3 bg-brand-blush text-brand-fuchsia rounded-full active:scale-90 transition-transform shadow-[0_4px_10px_rgba(194,24,91,0.1)]">
            <Plus className="w-6 h-6" />
          </button>
        </div>

        <div className="flex bg-[#fafafa] border border-[#eee] p-1 rounded-[16px]">
          <button 
            onClick={() => setMode('upcoming')} 
            className={`flex-1 p-2 sm:p-3 rounded-[12px] text-xs sm:text-sm font-bold transition-all ${mode === 'upcoming' ? 'bg-white text-brand-fuchsia shadow-[0_4px_6px_rgba(0,0,0,0.05)]' : 'text-brand-ink/40'}`}
          >
            Próximas
          </button>
          <button 
            onClick={() => setMode('calendar')} 
            className={`flex-1 p-2 sm:p-3 rounded-[12px] text-xs sm:text-sm font-bold transition-all ${mode === 'calendar' ? 'bg-white text-brand-fuchsia shadow-[0_4px_6px_rgba(0,0,0,0.05)]' : 'text-brand-ink/40'}`}
          >
            Calendario
          </button>
          <button 
            onClick={() => setMode('history')} 
            className={`flex-1 p-2 sm:p-3 rounded-[12px] text-xs sm:text-sm font-bold transition-all ${mode === 'history' ? 'bg-white text-brand-fuchsia shadow-[0_4px_6px_rgba(0,0,0,0.05)]' : 'text-brand-ink/40'}`}
          >
            Historial
          </button>
        </div>

        {mode === 'upcoming' && (() => {
          const scheduled = appointments.filter(a => a.status === 'scheduled');
          if (scheduled.length === 0) return <p className="text-center text-brand-ink/40 font-bold uppercase tracking-widest text-xs py-10">No hay citas programadas.</p>;
          
          const grouped: Record<string, Appointment[]> = {};
          const frozenApps: Appointment[] = [];
          
          scheduled.forEach(app => {
            const isFrozen = (now - app.date) > 7 * 24 * 60 * 60 * 1000;
            if (isFrozen) {
              frozenApps.push(app);
            } else {
              const dateStr = format(new Date(app.date), 'yyyy-MM-dd');
              if (!grouped[dateStr]) grouped[dateStr] = [];
              grouped[dateStr].push(app);
            }
          });
          
          const sortedDates = Object.keys(grouped).sort((a, b) => {
            const isAToday = isSameDay(new Date(`${a}T12:00:00`), new Date());
            const isBToday = isSameDay(new Date(`${b}T12:00:00`), new Date());
            
            if (isAToday) return -1;
            if (isBToday) return 1;

            const dateA = new Date(`${a}T12:00:00`).getTime();
            const dateB = new Date(`${b}T12:00:00`).getTime();
            
            const aIsPast = dateA < now;
            const bIsPast = dateB < now;

            if (!aIsPast && !bIsPast) return dateA - dateB; // Future dates: soonest first
            if (aIsPast && bIsPast) return dateB - dateA; // Past dates: most recent first
            if (!aIsPast && bIsPast) return -1; // Future dates before past dates
            return 1;
          });
          
          return (
            <div className="space-y-6 relative">
              {sortedDates.map(date => (
                <div key={date} className="space-y-4">
                  <div className="sticky top-[-24px] z-20 bg-white/95 backdrop-blur-md border-b border-[#eee] py-3 text-center shadow-sm -mx-6 px-6">
                    <span className="font-bold text-brand-fuchsia text-[12px] uppercase tracking-widest bg-brand-blush px-3 py-1 rounded-full">
                      {isSameDay(new Date(`${date}T12:00:00`), new Date()) ? 'Hoy' : format(new Date(`${date}T12:00:00`), "EEEE d 'de' MMMM", { locale: es })}
                    </span>
                  </div>
                  {grouped[date].map(app => renderAppointment(app, mode))}
                </div>
              ))}
              
              {frozenApps.length > 0 && (
                <div className="space-y-4 pt-6 border-t border-[#eee]">
                  <div className="text-center mb-4">
                    <span className="font-bold text-blue-600 text-[12px] uppercase tracking-widest bg-blue-50 px-3 py-1 rounded-full">
                      Citas Congeladas (+7 días)
                    </span>
                  </div>
                  {frozenApps.sort((a,b) => b.date - a.date).map(app => renderAppointment(app, mode))}
                </div>
              )}
            </div>
          );
        })()}
        
        {mode === 'history' && (
          <div className="space-y-4">
            {appointments.filter(a => a.status === 'completed' || a.status === 'cancelled').sort((a, b) => b.date - a.date).map(app => renderAppointment(app, mode))}
            {appointments.filter(a => a.status === 'completed' || a.status === 'cancelled').length === 0 && (
              <p className="text-center text-brand-ink/40 font-bold uppercase tracking-widest text-xs py-10">No hay historial de citas.</p>
            )}
          </div>
        )}

        {mode === 'calendar' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#eee]">
              <div className="flex justify-between items-center mb-4">
                <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))} className="p-2 font-bold text-brand-fuchsia">&lt;</button>
                <span className="font-bold text-brand-ink capitalize">{format(currentMonth, 'MMMM yyyy', { locale: es })}</span>
                <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))} className="p-2 font-bold text-brand-fuchsia">&gt;</button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center mb-2">
                {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map(d => <div key={d} className="text-[10px] font-bold text-brand-ink/40">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: monthStart.getDay() }).map((_, i) => <div key={`empty-${i}`} />)}
                {daysInMonth.map(day => {
                  const dayStr = format(day, 'yyyy-MM-dd');
                  const isSelected = selectedDate === dayStr;
                  const hasScheduled = appointments.some(a => format(new Date(a.date), 'yyyy-MM-dd') === dayStr && a.status === 'scheduled');
                  const hasCompleted = appointments.some(a => format(new Date(a.date), 'yyyy-MM-dd') === dayStr && a.status === 'completed');
                  const isToday = isSameDay(day, new Date());
                  
                  return (
                    <button 
                      key={dayStr}
                      onClick={() => setSelectedDate(dayStr)}
                      className={`relative aspect-square flex flex-col items-center justify-center rounded-xl text-sm transition-all
                        ${isSelected ? 'bg-brand-fuchsia text-white font-bold' : isToday ? 'bg-brand-blush text-brand-fuchsia font-bold' : 'text-brand-ink hover:bg-[#fafafa]'}
                      `}
                    >
                      <span>{format(day, 'd')}</span>
                      <div className="absolute bottom-1 flex gap-0.5">
                        {hasScheduled && <div className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-brand-fuchsia'}`} />}
                        {hasCompleted && <div className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-green-500'}`} />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#eee]">
              <h3 className="font-bold text-brand-ink mb-4">Citas del {format(new Date(selectedDate + 'T12:00:00'), 'd MMM', { locale: es })}</h3>
              <div className="space-y-3">
                {selectedDayAllApps.map(app => (
                  <button key={app.id} onClick={() => setPreviewApp(app)} className={`w-full text-left p-3 rounded-xl border-l-[4px] flex items-center justify-between active:scale-[0.98] transition-transform ${app.status === 'scheduled' ? 'border-l-brand-fuchsia bg-brand-blush/30' : app.status === 'completed' ? 'border-l-green-500 bg-green-50' : 'border-l-gray-400 bg-gray-50'}`}>
                    <div>
                      <div className="font-bold text-[14px] text-brand-ink">{app.clientName}</div>
                      <div className="text-[12px] opacity-60 text-brand-ink">{format(new Date(app.date), 'h:mm a')} - {app.service}</div>
                    </div>
                    <div className="text-[12px] font-bold px-2 py-1 rounded bg-white shadow-sm">
                      {app.status === 'scheduled' ? 'Pendiente' : app.status === 'completed' ? 'Pagado' : 'Cancelada'}
                    </div>
                  </button>
                ))}
                {selectedDayAllApps.length === 0 && (
                  <p className="text-center text-[12px] font-bold text-brand-ink/40 py-4">No hay citas en este día</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {showAdd && <AppointmentModal onClose={() => setShowAdd(false)} clients={clients} />}
      {editingApp && <AppointmentEditModal app={editingApp} onClose={() => setEditingApp(null)} />}
      {previewApp && <PreviewModal app={previewApp} onClose={() => setPreviewApp(null)} />}
    </>
  );
}

function PreviewModal({ app, onClose }: { app: Appointment; onClose: () => void }) {
  const images = [...(app.designImageUrls || [])];
  if (app.designImageUrl && !images.includes(app.designImageUrl)) {
    images.unshift(app.designImageUrl);
  }

  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = 'unset'; };
  }, []);

  return (
    <div className="fixed inset-0 bg-brand-ink/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white w-full sm:w-[500px] rounded-t-[30px] sm:rounded-[30px] p-6 max-h-[90vh] overflow-y-auto animate-slide-up relative">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-black text-brand-ink">Vista Previa</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X className="w-6 h-6" /></button>
        </div>

        {expandedImage && (
          <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col items-center justify-center p-4" onClick={(e) => { if(e.target === e.currentTarget) { setExpandedImage(null); setZoomLevel(1); } }}>
            <div className="relative w-full h-full flex items-center justify-center overflow-auto" onClick={(e) => { if(e.target === e.currentTarget) { setExpandedImage(null); setZoomLevel(1); } }}>
              <img src={expandedImage} className="max-w-none transition-transform duration-200" style={{ transform: `scale(${zoomLevel})` }} />
            </div>
            <div className="absolute bottom-10 flex gap-4 bg-white/20 p-2 rounded-full items-center">
              <button onClick={() => setZoomLevel(prev => Math.max(0.5, prev - 0.5))} className="text-white bg-black/50 rounded-full w-10 h-10 flex items-center justify-center text-xl font-bold active:scale-90">-</button>
              <button onClick={() => setZoomLevel(1)} className="text-white text-sm font-bold px-2 active:scale-90">Reset</button>
              <button onClick={() => setZoomLevel(prev => Math.min(5, prev + 0.5))} className="text-white bg-black/50 rounded-full w-10 h-10 flex items-center justify-center text-xl font-bold active:scale-90">+</button>
            </div>
            <button className="absolute top-4 right-4 text-white p-2 bg-white/20 rounded-full hover:bg-white/40" onClick={() => { setExpandedImage(null); setZoomLevel(1); }}><X className="w-8 h-8" /></button>
          </div>
        )}

        <div className="space-y-4">
          <div className="bg-brand-blush/30 p-4 rounded-2xl border border-brand-blush">
            <h3 className="font-bold text-brand-fuchsia text-sm mb-1">Cliente</h3>
            <p className="text-brand-ink font-bold text-lg">{app.clientName}</p>
            <p className="text-brand-ink/60 text-sm capitalize">{format(new Date(app.date), "EEEE d 'de' MMMM, h:mm a", { locale: es })}</p>
          </div>

          <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
            <h3 className="font-bold text-gray-500 text-sm mb-1">Servicio a Realizar</h3>
            <p className="text-brand-ink font-bold">{app.service}</p>
          </div>

          <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
            <h3 className="font-bold text-gray-500 text-sm mb-1">Detalles de Pago</h3>
            <div className="flex justify-between mt-2">
              <span className="text-brand-ink">Precio Total:</span>
              <span className="font-bold">${formatCurrency(app.price)}</span>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-green-600">Abono:</span>
              <span className="font-bold text-green-600">${formatCurrency(app.advancePayment || 0)}</span>
            </div>
            <div className="flex justify-between mt-2 border-t border-gray-200 pt-2">
              <span className="text-red-600 font-bold">Pendiente:</span>
              <span className="font-bold text-red-600">${formatCurrency(app.price - (app.advancePayment || 0))}</span>
            </div>
          </div>

          {images.length > 0 && (
            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
              <h3 className="font-bold text-gray-500 text-sm mb-3">Diseños de Referencia ({images.length})</h3>
              <div className="grid grid-cols-3 gap-2">
                {images.map((img, idx) => (
                  <img key={idx} src={img} onClick={() => setExpandedImage(img)} className="w-full h-24 object-cover rounded-xl cursor-pointer hover:opacity-80 transition-opacity shadow-sm border border-gray-200" alt="Diseño" />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AppointmentEditModal({ app, onClose }: { app: Appointment; onClose: () => void }) {
  const [date, setDate] = useState(format(new Date(app.date), 'yyyy-MM-dd'));
  const [time, setTime] = useState(format(new Date(app.date), 'HH:mm'));
  const [service, setService] = useState(app.service);
  const [price, setPrice] = useState(app.price.toString());
  const [advancePayment, setAdvancePayment] = useState((app.advancePayment || 0).toString());
  const [paymentMethod, setPaymentMethod] = useState(app.paymentMethod || '');
  const [locationType, setLocationType] = useState(app.locationType);
  const [address, setAddress] = useState(app.address);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  
  const [uploading, setUploading] = useState(false);
  const getInitialImages = () => {
    const urls = [...(app.designImageUrls || [])];
    if (app.designImageUrl && !urls.includes(app.designImageUrl)) {
      urls.unshift(app.designImageUrl);
    }
    return urls.slice(0, 3);
  };
  const [designImageUrls, setDesignImageUrls] = useState<string[]>(getInitialImages());
  
  const appointments = useAppointments();
  const frequentServices = useFrequentServices();
  const debts = useDebts();

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const files = Array.from(e.target.files).slice(0, 3 - designImageUrls.length);
    if (files.length === 0) {
      alert("Máximo 3 imágenes permitidas");
      return;
    }
    
    setUploading(true);
    let uploadedCount = 0;
    const newUrls: string[] = [];

    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const max = 1200;
          
          if (width > height) {
            if (width > max) { height = Math.round((height *= max / width)); width = max; }
          } else {
            if (height > max) { width = Math.round((width *= max / height)); height = max; }
          }
          
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          newUrls.push(canvas.toDataURL('image/jpeg', 0.7));
          uploadedCount++;
          if (uploadedCount === files.length) {
            setDesignImageUrls(prev => [...prev, ...newUrls].slice(0, 3));
            setUploading(false);
          }
        };
        img.onerror = () => { uploadedCount++; if (uploadedCount === files.length) setUploading(false); };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file as Blob);
    });
  };

  const [isSaving, setIsSaving] = useState(false);

  const handleUpdate = async () => {
    setIsSaving(true);
    try {
      const dateTime = new Date(`${date}T${time}`).getTime();
      
      const conflict = appointments.find(a => a.date === dateTime && a.id !== app.id && a.status === 'scheduled');
      if (conflict) {
        setError('Este horario ya está ocupado');
        setIsSaving(false);
        return;
      }
      
      if (!service || !price) {
        setError('Servicio y precio son obligatorios');
        setIsSaving(false);
        return;
      }

      updateDoc(doc(db, 'appointments', app.id), {
        date: dateTime,
        service,
        price: parseFloat(price),
        advancePayment: parseFloat(advancePayment) || 0,
        paymentMethod,
        designImageUrl: designImageUrls.length > 0 ? designImageUrls[0] : null,
        designImageUrls,
        locationType,
        address,
        updatedAt: Date.now(),
        ...(dateTime !== app.date && { notified60: false, notified30: false })
      }).catch(err => console.error("Error updating appointment:", err));

      const updateDebtAndServices = async () => {
        try {
          const parsedAdvance = parseFloat(advancePayment) || 0;
          const parsedPrice = parseFloat(price) || 0;
          const pendingAmount = parsedPrice - parsedAdvance;
          const isPaidFull = pendingAmount <= 0;

          let debtDoc = debts.find(d => d.appointmentId === app.id);
          
          // Fallback para deudas antiguas que no tienen appointmentId
          if (!debtDoc) {
            debtDoc = debts.find(d => 
              d.clientId === app.clientId && 
              d.status === 'pending' && 
              (d.concept === 'Saldo cita: ' + app.service || d.concept === 'Cita: ' + app.service)
            );
          }

          if (debtDoc) {
            updateDoc(doc(db, 'debts', debtDoc.id), {
              amount: isPaidFull ? parsedPrice : pendingAmount,
              status: isPaidFull ? 'paid' : 'pending',
              paidAt: isPaidFull ? Date.now() : null,
              concept: 'Cita: ' + service,
              updatedAt: Date.now()
            });
          } else {
            const debtId = doc(collection(db, 'debts')).id;
            setDoc(doc(db, 'debts', debtId), {
              id: debtId,
              clientId: app.clientId,
              clientName: app.clientName,
              concept: 'Cita: ' + service,
              amount: isPaidFull ? parsedPrice : pendingAmount,
              status: isPaidFull ? 'paid' : 'pending',
              ownerId: auth.currentUser!.uid,
              createdAt: Date.now(),
              paidAt: isPaidFull ? Date.now() : null,
              appointmentId: app.id
            });
          }
        } catch (err) {
          console.error("Error updating debt in background:", err);
        }

        // Save to frequent services if new
        try {
          if (service && !frequentServices.find(s => s.name.toLowerCase() === service.toLowerCase())) {
            await setDoc(doc(collection(db, 'frequentServices')), {
              name: service,
              ownerId: auth.currentUser!.uid
            });
          }
        } catch (err) {
          console.error("Error saving frequent service:", err);
        }
      };

      updateDebtAndServices();
      onClose();
    } catch(err) {
      handleFirestoreError(err, OperationType.UPDATE, 'appointments');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      deleteDoc(doc(db, 'appointments', app.id)).catch(err => console.error("Error deleting appointment:", err));
      
      const cleanDebts = () => {
        debts.filter(d => d.appointmentId === app.id).forEach(d => {
          deleteDoc(doc(db, 'debts', d.id));
        });
      };
      
      cleanDebts();
      onClose();
    } catch(err) {
      console.error(err);
      alert('Se eliminó la cita, pero hubo un error actualizando la vista. Cerrando...');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-brand-ink/20 backdrop-blur-sm z-50 p-4 flex items-end sm:items-center">
      <div className="bg-white w-full max-w-lg rounded-t-[32px] sm:rounded-[24px] p-6 shadow-[0_20px_40px_rgba(0,0,0,0.05)] border-t-[3px] border-t-brand-gold max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom-10">
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-[20px] font-bold text-brand-ink">Editar Cita</h3>
          <button onClick={onClose} className="p-2 -mr-2"><X className="w-6 h-6 text-brand-ink/40" /></button>
        </div>

        <div className="space-y-4">
          <div className="bg-brand-blush p-4 rounded-[16px]">
            <span className="font-bold text-brand-fuchsia">{app.clientName}</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] uppercase font-extrabold text-brand-ink/50 mb-2">Fecha</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-4 py-3 border border-[#eee] rounded-xl text-base bg-[#fafafa] text-brand-ink outline-none focus:border-brand-fuchsia focus:ring-1 focus:ring-brand-fuchsia transition-colors" />
            </div>
            <div>
              <label className="block text-[11px] uppercase font-extrabold text-brand-ink/50 mb-2">Hora</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} className="w-full px-4 py-3 border border-[#eee] rounded-xl text-base bg-[#fafafa] text-brand-ink outline-none focus:border-brand-fuchsia focus:ring-1 focus:ring-brand-fuchsia transition-colors" />
            </div>
          </div>

          <div>
            <label className="block text-[11px] uppercase font-extrabold text-brand-ink/50 mb-2">Servicio</label>
            <input type="text" value={service} onChange={e => setService(e.target.value)} list="frequent-services" className="w-full px-4 py-3 border border-[#eee] rounded-xl text-base bg-[#fafafa] text-brand-ink outline-none focus:border-brand-fuchsia focus:ring-1 focus:ring-brand-fuchsia transition-colors" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] uppercase font-extrabold text-brand-ink/50 mb-2">Precio Total ($)</label>
              <input type="text" inputMode="numeric" value={price ? formatCurrency(price) : ''} onChange={e => setPrice(e.target.value.replace(/\D/g, ''))} className="w-full px-4 py-3 border border-[#eee] rounded-xl text-base bg-[#fafafa] text-brand-ink outline-none focus:border-brand-fuchsia focus:ring-1 focus:ring-brand-fuchsia transition-colors font-bold text-brand-fuchsia" />
            </div>
            <div>
              <label className="block text-[11px] uppercase font-extrabold text-brand-ink/50 mb-2">Abono Realizado ($)</label>
              <input type="text" inputMode="numeric" value={advancePayment ? formatCurrency(advancePayment) : ''} onChange={e => setAdvancePayment(e.target.value.replace(/\D/g, ''))} className="w-full px-4 py-3 border border-[#eee] rounded-xl text-base bg-[#fafafa] text-brand-ink outline-none focus:border-brand-fuchsia focus:ring-1 focus:ring-brand-fuchsia transition-colors font-bold text-green-600" />
            </div>
          </div>
          
          <div>
            <label className="block text-[11px] uppercase font-extrabold text-brand-ink/50 mb-2">Método de Pago</label>
            <div className="flex bg-[#fafafa] border border-[#eee] p-1 rounded-[16px]">
              <button onClick={() => setPaymentMethod('Efectivo')} className={`flex-1 p-3 rounded-[12px] text-sm font-bold transition-all ${paymentMethod === 'Efectivo' ? 'bg-white text-brand-fuchsia shadow-[0_4px_6px_rgba(0,0,0,0.05)]' : 'text-brand-ink/40'}`}>Efectivo</button>
              <button onClick={() => setPaymentMethod('Transferencia')} className={`flex-1 p-3 rounded-[12px] text-sm font-bold transition-all ${paymentMethod === 'Transferencia' ? 'bg-white text-brand-fuchsia shadow-[0_4px_6px_rgba(0,0,0,0.05)]' : 'text-brand-ink/40'}`}>Transferencia</button>
            </div>
          </div>

          <div className="flex bg-[#fafafa] border border-[#eee] p-1 rounded-[16px]">
            <button onClick={() => setLocationType('Presencial')} className={`flex-1 p-3 rounded-[12px] text-sm font-bold transition-all ${locationType === 'Presencial' ? 'bg-white text-brand-fuchsia shadow-[0_4px_6px_rgba(0,0,0,0.05)]' : 'text-brand-ink/40'}`}>Presencial</button>
            <button onClick={() => setLocationType('Domicilio')} className={`flex-1 p-3 rounded-[12px] text-sm font-bold transition-all ${locationType === 'Domicilio' ? 'bg-white text-brand-fuchsia shadow-[0_4px_6px_rgba(0,0,0,0.05)]' : 'text-brand-ink/40'}`}>Domicilio</button>
          </div>

          {locationType === 'Domicilio' && (
            <div>
              <label className="block text-[11px] uppercase font-extrabold text-brand-ink/50 mb-2">Dirección</label>
              <textarea value={address} onChange={e => setAddress(e.target.value)} rows={2} className="w-full px-4 py-3 border border-[#eee] rounded-xl text-base bg-[#fafafa] text-brand-ink outline-none focus:border-brand-fuchsia focus:ring-1 focus:ring-brand-fuchsia transition-colors" />
            </div>
          )}
          
          <div>
            <label className="block text-[11px] uppercase font-extrabold text-brand-ink/50 mb-2">Diseños de Referencia ({designImageUrls.length}/3)</label>
            <div className="flex flex-wrap items-center gap-4">
              {designImageUrls.map((imgUrl, idx) => (
                <div key={idx} className="relative">
                  <img src={imgUrl} alt="Diseño" className="w-20 h-20 rounded-xl object-cover border border-[#eee]" />
                  <button onClick={() => setDesignImageUrls(prev => prev.filter((_, i) => i !== idx))} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1"><X className="w-3 h-3" /></button>
                </div>
              ))}
              {designImageUrls.length < 3 && (
                <div className="w-20 h-20 border-2 border-dashed border-[#eee] rounded-xl flex flex-col items-center justify-center text-brand-ink/40 relative hover:border-brand-fuchsia hover:text-brand-fuchsia transition-colors overflow-hidden">
                  {uploading ? <div className="text-[10px] font-bold animate-pulse text-center">Subiendo...</div> : (
                    <>
                      <Upload className="w-5 h-5 mb-1" />
                      <span className="text-[10px] font-bold text-center leading-tight">Añadir</span>
                    </>
                  )}
                  <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="absolute inset-0 opacity-0 cursor-pointer" disabled={uploading} />
                </div>
              )}
            </div>
          </div>

          {error && <p className="text-red-500 font-bold text-center text-sm">{error}</p>}

          <div className="flex gap-3 pt-4 border-t border-[#eee]">
            <button onClick={handleDelete} className="flex-1 p-4 bg-[#fafafa] border border-[#eee] text-red-500 rounded-[16px] font-bold text-[16px]">
              {confirmDelete ? '¿Seguro?' : 'Eliminar'}
            </button>
            <button disabled={isSaving} onClick={handleUpdate} className="flex-[2] p-4 rounded-[16px] font-bold text-[18px] uppercase tracking-[1px] bg-brand-fuchsia text-white shadow-[0_10px_20px_rgba(194,24,91,0.2)] disabled:opacity-50 flex justify-center items-center gap-2">
              {isSaving ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
      
      <datalist id="frequent-services">
        {frequentServices.map(s => <option key={s.id} value={s.name} />)}
      </datalist>
    </div>
  );
}

function AppointmentModal({ onClose, clients }: any) {
  const [search, setSearch] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientName, setClientName] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [service, setService] = useState('');
  const [price, setPrice] = useState('');
  const [advancePayment, setAdvancePayment] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [locationType, setLocationType] = useState('Presencial');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  
  const [uploading, setUploading] = useState(false);
  const [designImageUrls, setDesignImageUrls] = useState<string[]>([]);
  
  const appointments = useAppointments();
  const frequentServices = useFrequentServices();

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const files = Array.from(e.target.files).slice(0, 3 - designImageUrls.length);
    if (files.length === 0) {
      alert("Máximo 3 imágenes permitidas");
      return;
    }
    
    setUploading(true);
    let uploadedCount = 0;
    const newUrls: string[] = [];

    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const max = 1200;
          
          if (width > height) {
            if (width > max) { height = Math.round((height *= max / width)); width = max; }
          } else {
            if (height > max) { width = Math.round((width *= max / height)); height = max; }
          }
          
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          newUrls.push(canvas.toDataURL('image/jpeg', 0.7));
          uploadedCount++;
          if (uploadedCount === files.length) {
            setDesignImageUrls(prev => [...prev, ...newUrls].slice(0, 3));
            setUploading(false);
          }
        };
        img.onerror = () => { uploadedCount++; if (uploadedCount === files.length) setUploading(false); };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file as Blob);
    });
  };

  const filteredClients = search.length > 1 ? clients.filter((c: any) => 
    c.firstName.toLowerCase().includes(search.toLowerCase()) || 
    c.lastName.toLowerCase().includes(search.toLowerCase())
  ) : [];

  const handleSelectClient = (c: any) => {
    setClientId(c.id);
    setClientName(c.firstName + ' ' + c.lastName);
    setSearch('');
  };

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    if (!clientId || !date || !time || !service || !price) {
      setError('Faltan campos por rellenar');
      setIsSaving(false);
      return;
    }
    setError('');
    
    // Create timestamp
    const dateTime = new Date(`${date}T${time}`).getTime();
    
    const conflict = appointments.find(a => a.date === dateTime && a.status === 'scheduled');
    if (conflict) {
      setError('Este horario ya está ocupado');
      setIsSaving(false);
      return;
    }
    
    const newApp: Appointment = {
      id: doc(collection(db, 'appointments')).id,
      clientId,
      clientName,
      date: dateTime,
      service,
      price: parseFloat(price),
      advancePayment: parseFloat(advancePayment) || 0,
      paymentMethod: paymentMethod as any,
      designImageUrl: designImageUrls.length > 0 ? designImageUrls[0] : null,
      designImageUrls,
      locationType: locationType as any,
      address,
      status: 'scheduled',
      notified60: false,
      notified30: false,
      ownerId: auth.currentUser!.uid,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    try {
      setDoc(doc(db, 'appointments', newApp.id), newApp).catch(err => console.error("Error scheduling appointment:", err));
      
      const createDebtAndServices = async () => {
        try {
          const parsedAdvance = parseFloat(advancePayment) || 0;
          const parsedPrice = parseFloat(price) || 0;
          const pendingAmount = parsedPrice - parsedAdvance;
          const isPaidFull = pendingAmount <= 0;
          
          const debtId = doc(collection(db, 'debts')).id;
          await setDoc(doc(db, 'debts', debtId), {
            id: debtId,
            clientId,
            clientName,
            concept: 'Cita: ' + service,
            amount: isPaidFull ? parsedPrice : pendingAmount,
            status: isPaidFull ? 'paid' : 'pending',
            ownerId: auth.currentUser!.uid,
            createdAt: Date.now(),
            paidAt: isPaidFull ? Date.now() : null,
            appointmentId: newApp.id
          });
        } catch (subErr) {
          console.error("Error with secondary operations:", subErr);
        }

        if (service && !frequentServices.find(s => s.name.toLowerCase() === service.toLowerCase())) {
          setDoc(doc(collection(db, 'frequentServices')), {
            name: service,
            ownerId: auth.currentUser!.uid
          }).catch(err => console.error("Error saving freq service:", err));
        }
      };

      createDebtAndServices();
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'appointments');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-brand-ink/20 backdrop-blur-sm z-50 p-4 flex items-end sm:items-center">
      <div className="bg-white w-full max-w-lg rounded-t-[32px] sm:rounded-[24px] p-6 shadow-[0_20px_40px_rgba(0,0,0,0.05)] border-t-[3px] border-t-brand-gold max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom-10 fade-in duration-300">
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-[20px] font-bold text-brand-ink">Nueva Cita</h3>
          <button onClick={onClose} className="p-2 -mr-2"><X className="w-6 h-6 text-brand-ink/40" /></button>
        </div>
        
        <div className="space-y-4">
          {!clientId ? (
            <div>
              <label className="block text-[11px] uppercase font-extrabold text-brand-ink/50 mb-2">Buscar Cliente</label>
              <input 
                type="text" 
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Ej. Maria Perez..."
                className="w-full px-4 py-3 border border-[#eee] rounded-xl text-base bg-[#fafafa] text-brand-ink outline-none focus:border-brand-fuchsia focus:ring-1 focus:ring-brand-fuchsia transition-colors"
              />
              {filteredClients.length > 0 && (
                <div className="mt-2 border border-[#eee] rounded-xl overflow-hidden shadow-[0_4px_6px_rgba(0,0,0,0.02)]">
                  {filteredClients.map((c: any) => (
                    <button 
                      key={c.id} 
                      onClick={() => handleSelectClient(c)}
                      className="w-full text-left p-4 hover:bg-[#fafafa] border-b border-[#eee] bg-white last:border-0"
                    >
                      <span className="font-bold text-brand-ink block">{c.firstName} {c.lastName}</span>
                      <span className="block text-[12px] text-brand-ink/60 mt-0.5">{c.phone}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between bg-brand-blush p-4 rounded-[16px]">
              <span className="font-bold text-brand-fuchsia">{clientName}</span>
              <button onClick={() => setClientId('')} className="text-[11px] text-brand-ink/50 font-extrabold uppercase tracking-wider">Cambiar</button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] uppercase font-extrabold text-brand-ink/50 mb-2">Fecha</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-4 py-3 border border-[#eee] rounded-xl text-base bg-[#fafafa] text-brand-ink outline-none focus:border-brand-fuchsia focus:ring-1 focus:ring-brand-fuchsia transition-colors" />
            </div>
            <div>
              <label className="block text-[11px] uppercase font-extrabold text-brand-ink/50 mb-2">Hora</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} className="w-full px-4 py-3 border border-[#eee] rounded-xl text-base bg-[#fafafa] text-brand-ink outline-none focus:border-brand-fuchsia focus:ring-1 focus:ring-brand-fuchsia transition-colors" />
            </div>
          </div>

          <div>
            <label className="block text-[11px] uppercase font-extrabold text-brand-ink/50 mb-2">Servicio</label>
            <input type="text" value={service} onChange={e => setService(e.target.value)} list="frequent-services" placeholder="Ej. Uñas Acrílicas" className="w-full px-4 py-3 border border-[#eee] rounded-xl text-base bg-[#fafafa] text-brand-ink outline-none focus:border-brand-fuchsia focus:ring-1 focus:ring-brand-fuchsia transition-colors" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] uppercase font-extrabold text-brand-ink/50 mb-2">Precio Total ($)</label>
              <input type="text" inputMode="numeric" value={price ? formatCurrency(price) : ''} onChange={e => setPrice(e.target.value.replace(/\D/g, ''))} placeholder="0" className="w-full px-4 py-3 border border-[#eee] rounded-xl text-base bg-[#fafafa] text-brand-ink outline-none focus:border-brand-fuchsia focus:ring-1 focus:ring-brand-fuchsia transition-colors font-bold text-brand-fuchsia" />
            </div>
            <div>
              <label className="block text-[11px] uppercase font-extrabold text-brand-ink/50 mb-2">Abono Realizado ($)</label>
              <input type="text" inputMode="numeric" value={advancePayment ? formatCurrency(advancePayment) : ''} onChange={e => setAdvancePayment(e.target.value.replace(/\D/g, ''))} placeholder="0" className="w-full px-4 py-3 border border-[#eee] rounded-xl text-base bg-[#fafafa] text-brand-ink outline-none focus:border-brand-fuchsia focus:ring-1 focus:ring-brand-fuchsia transition-colors font-bold text-green-600" />
            </div>
          </div>

          <div>
            <label className="block text-[11px] uppercase font-extrabold text-brand-ink/50 mb-2">Método de Pago</label>
            <div className="flex bg-[#fafafa] border border-[#eee] p-1 rounded-[16px]">
              <button onClick={() => setPaymentMethod('Efectivo')} className={`flex-1 p-3 rounded-[12px] text-sm font-bold transition-all ${paymentMethod === 'Efectivo' ? 'bg-white text-brand-fuchsia shadow-[0_4px_6px_rgba(0,0,0,0.05)]' : 'text-brand-ink/40'}`}>Efectivo</button>
              <button onClick={() => setPaymentMethod('Transferencia')} className={`flex-1 p-3 rounded-[12px] text-sm font-bold transition-all ${paymentMethod === 'Transferencia' ? 'bg-white text-brand-fuchsia shadow-[0_4px_6px_rgba(0,0,0,0.05)]' : 'text-brand-ink/40'}`}>Transferencia</button>
            </div>
          </div>

          <div className="flex bg-[#fafafa] border border-[#eee] p-1 rounded-[16px]">
            <button 
              onClick={() => setLocationType('Presencial')} 
              className={`flex-1 p-3 rounded-[12px] text-sm font-bold transition-all ${locationType === 'Presencial' ? 'bg-white text-brand-fuchsia shadow-[0_4px_6px_rgba(0,0,0,0.05)]' : 'text-brand-ink/40'}`}
            >
              Presencial
            </button>
            <button 
              onClick={() => setLocationType('Domicilio')} 
              className={`flex-1 p-3 rounded-[12px] text-sm font-bold transition-all ${locationType === 'Domicilio' ? 'bg-white text-brand-fuchsia shadow-[0_4px_6px_rgba(0,0,0,0.05)]' : 'text-brand-ink/40'}`}
            >
              Domicilio
            </button>
          </div>

          {locationType === 'Domicilio' && (
            <div>
              <label className="block text-[11px] uppercase font-extrabold text-brand-ink/50 mb-2">Dirección</label>
              <textarea value={address} onChange={e => setAddress(e.target.value)} rows={2} className="w-full px-4 py-3 border border-[#eee] rounded-xl text-base bg-[#fafafa] text-brand-ink outline-none focus:border-brand-fuchsia focus:ring-1 focus:ring-brand-fuchsia transition-colors" />
            </div>
          )}
          
          <div>
            <label className="block text-[11px] uppercase font-extrabold text-brand-ink/50 mb-2">Diseños de Referencia ({designImageUrls.length}/3)</label>
            <div className="flex flex-wrap items-center gap-4">
              {designImageUrls.map((imgUrl, idx) => (
                <div key={idx} className="relative">
                  <img src={imgUrl} alt="Diseño" className="w-20 h-20 rounded-xl object-cover border border-[#eee]" />
                  <button onClick={() => setDesignImageUrls(prev => prev.filter((_, i) => i !== idx))} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1"><X className="w-3 h-3" /></button>
                </div>
              ))}
              {designImageUrls.length < 3 && (
                <div className="w-20 h-20 border-2 border-dashed border-[#eee] rounded-xl flex flex-col items-center justify-center text-brand-ink/40 relative hover:border-brand-fuchsia hover:text-brand-fuchsia transition-colors overflow-hidden">
                  {uploading ? <div className="text-[10px] font-bold animate-pulse text-center">Subiendo...</div> : (
                    <>
                      <Upload className="w-5 h-5 mb-1" />
                      <span className="text-[10px] font-bold text-center leading-tight">Añadir</span>
                    </>
                  )}
                  <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="absolute inset-0 opacity-0 cursor-pointer" disabled={uploading} />
                </div>
              )}
            </div>
          </div>

          {error && <p className="text-red-500 font-bold text-center text-sm">{error}</p>}

          <button disabled={isSaving} onClick={handleSave} className="w-full p-4 rounded-[16px] font-bold text-[18px] uppercase tracking-[1px] bg-brand-fuchsia text-white shadow-[0_10px_20px_rgba(194,24,91,0.2)] mt-4 disabled:opacity-50 flex justify-center items-center gap-2">
            {isSaving ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Agendar Cita'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ClientsView() {
  const clients = useClients();
  const [showAdd, setShowAdd] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredClients = clients.filter(c => 
    c.firstName.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone.includes(searchQuery)
  );

  return (
    <>
      <div className="bg-brand-glass backdrop-blur-[10px] rounded-[24px] p-6 border border-white flex flex-col space-y-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-[20px] font-bold text-brand-ink">Clientes</h2>
        <button onClick={() => setShowAdd(true)} className="p-3 bg-brand-blush text-brand-fuchsia rounded-full active:scale-90 transition-transform shadow-[0_4px_10px_rgba(194,24,91,0.1)]">
          <Plus className="w-5 h-5" />
        </button>
      </div>

      <div>
        <input 
          type="text" 
          placeholder="Buscar cliente..." 
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full px-4 py-3 border border-[#eee] rounded-xl text-base bg-[#fafafa] text-brand-ink outline-none focus:border-brand-fuchsia focus:ring-1 focus:ring-brand-fuchsia transition-colors"
        />
      </div>

      <div className="space-y-4">
        {filteredClients.map(c => (
          <div key={c.id} onClick={() => setEditingClient(c)} className="w-full text-left bg-white p-5 rounded-[20px] shadow-[0_4px_6px_rgba(0,0,0,0.02)] border-l-[6px] border-l-brand-gold flex items-center justify-between active:scale-[0.98] transition-transform group cursor-pointer">
            <div>
              <div className="font-bold text-[18px] text-brand-ink">{c.firstName} {c.lastName}</div>
              <div className="text-[14px] opacity-60 text-brand-ink">{c.phone}</div>
            </div>
            <button className="p-2 text-brand-ink/40 hover:text-brand-fuchsia rounded-xl transition-colors">
              <Edit2 className="w-5 h-5" />
            </button>
          </div>
        ))}
        {filteredClients.length === 0 && <p className="text-center text-brand-ink/40 font-bold uppercase tracking-widest text-xs py-10">No hay clientes encontrados.</p>}
      </div>
      </div>

      {showAdd && <ClientModal onClose={() => setShowAdd(false)} />}
      {editingClient && <ClientEditModal client={editingClient} onClose={() => setEditingClient(null)} />}
    </>
  );
}

function ClientEditModal({ client, onClose }: { client: Client; onClose: () => void }) {
  const [fname, setFname] = useState(client.firstName);
  const [lname, setLname] = useState(client.lastName);
  const [phone, setPhone] = useState(client.phone);
  const [notes, setNotes] = useState(client.notes);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleUpdate = async () => {
    try {
      await updateDoc(doc(db, 'clients', client.id), {
        firstName: fname,
        lastName: lname,
        phone,
        notes,
        updatedAt: Date.now()
      });
      onClose();
    } catch(err) {
      handleFirestoreError(err, OperationType.UPDATE, 'clients');
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      await deleteDoc(doc(db, 'clients', client.id));
      onClose();
    } catch(err) {
      handleFirestoreError(err, OperationType.DELETE, 'clients');
    }
  };

  return (
    <div className="fixed inset-0 bg-brand-ink/20 backdrop-blur-sm z-50 p-4 flex items-end sm:items-center">
      <div className="bg-white w-full max-w-lg rounded-t-[32px] sm:rounded-[24px] p-6 shadow-[0_20px_40px_rgba(0,0,0,0.05)] border-t-[3px] border-t-brand-gold max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom-10">
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-[20px] font-bold text-brand-ink">Editar Cliente</h3>
          <button onClick={onClose} className="p-2 -mr-2"><X className="w-6 h-6 text-brand-ink/40" /></button>
        </div>
        
        <div className="space-y-3">
          <input type="text" placeholder="Nombre" value={fname} onChange={e => setFname(e.target.value)} className="w-full px-4 py-3 border border-[#eee] rounded-xl text-base bg-[#fafafa] text-brand-ink outline-none focus:border-brand-fuchsia focus:ring-1 focus:ring-brand-fuchsia transition-colors" />
          <input type="text" placeholder="Apellido" value={lname} onChange={e => setLname(e.target.value)} className="w-full px-4 py-3 border border-[#eee] rounded-xl text-base bg-[#fafafa] text-brand-ink outline-none focus:border-brand-fuchsia focus:ring-1 focus:ring-brand-fuchsia transition-colors" />
          <input type="tel" placeholder="Teléfono" value={phone} onChange={e => setPhone(e.target.value)} className="w-full px-4 py-3 border border-[#eee] rounded-xl text-base bg-[#fafafa] text-brand-ink outline-none focus:border-brand-fuchsia focus:ring-1 focus:ring-brand-fuchsia transition-colors" />
          <textarea placeholder="Notas (opcional)..." value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full px-4 py-3 border border-[#eee] rounded-xl text-base bg-[#fafafa] text-brand-ink outline-none focus:border-brand-fuchsia focus:ring-1 focus:ring-brand-fuchsia transition-colors" />
          
          <div className="flex gap-3 mt-6">
            <button onClick={handleDelete} className="flex-1 p-4 bg-[#fafafa] border border-[#eee] text-red-500 rounded-[16px] font-bold text-[16px]">
              {confirmDelete ? '¿Seguro?' : 'Eliminar'}
            </button>
            <button onClick={handleUpdate} className="flex-[2] p-4 rounded-[16px] font-bold text-[16px] uppercase tracking-[1px] bg-brand-fuchsia text-white shadow-[0_10px_20px_rgba(194,24,91,0.2)]">
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ClientModal({ onClose }: any) {
  const [fname, setFname] = useState('');
  const [lname, setLname] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!fname || !phone) {
      setError('Se requiere el nombre y teléfono');
      return;
    }
    setError('');
    const newClient: Client = {
      id: doc(collection(db, 'clients')).id,
      firstName: fname,
      lastName: lname,
      phone,
      notes,
      ownerId: auth.currentUser!.uid,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    try {
      setDoc(doc(db, 'clients', newClient.id), newClient).catch(err => console.error("Error creating client:", err));
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'clients');
    }
  };

  return (
    <div className="fixed inset-0 bg-brand-ink/20 backdrop-blur-sm z-50 p-4 flex items-end sm:items-center">
      <div className="bg-white w-full max-w-lg rounded-t-[32px] sm:rounded-[24px] p-6 shadow-[0_20px_40px_rgba(0,0,0,0.05)] border-t-[3px] border-t-brand-gold max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom-10 fade-in duration-300">
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-[20px] font-bold text-brand-ink">Nuevo Cliente</h3>
          <button onClick={onClose} className="p-2 -mr-2"><X className="w-6 h-6 text-brand-ink/40" /></button>
        </div>
        
        <div className="space-y-3">
          <input type="text" placeholder="Nombre" value={fname} onChange={e => setFname(e.target.value)} className="w-full px-4 py-3 border border-[#eee] rounded-xl text-base bg-[#fafafa] text-brand-ink outline-none focus:border-brand-fuchsia focus:ring-1 focus:ring-brand-fuchsia transition-colors" />
          <input type="text" placeholder="Apellido" value={lname} onChange={e => setLname(e.target.value)} className="w-full px-4 py-3 border border-[#eee] rounded-xl text-base bg-[#fafafa] text-brand-ink outline-none focus:border-brand-fuchsia focus:ring-1 focus:ring-brand-fuchsia transition-colors" />
          <input type="tel" placeholder="Teléfono" value={phone} onChange={e => setPhone(e.target.value)} className="w-full px-4 py-3 border border-[#eee] rounded-xl text-base bg-[#fafafa] text-brand-ink outline-none focus:border-brand-fuchsia focus:ring-1 focus:ring-brand-fuchsia transition-colors" />
          <textarea placeholder="Notas (opcional)..." value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full px-4 py-3 border border-[#eee] rounded-xl text-base bg-[#fafafa] text-brand-ink outline-none focus:border-brand-fuchsia focus:ring-1 focus:ring-brand-fuchsia transition-colors" />
          
          {error && <p className="text-red-500 font-bold text-center text-sm">{error}</p>}

          <button onClick={handleSave} className="w-full p-4 rounded-[16px] font-bold text-[18px] uppercase tracking-[1px] bg-brand-fuchsia text-white shadow-[0_10px_20px_rgba(194,24,91,0.2)] mt-4">
            Guardar Cliente
          </button>
        </div>
      </div>
    </div>
  );
}

function DebtsView() {
  const debts = useDebts();
  const clients = useClients();
  const [showAdd, setShowAdd] = useState(false);
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredDebts = debts.filter(d => d.clientName.toLowerCase().includes(searchQuery.toLowerCase()));

  const handleMarkPaid = async (e: React.MouseEvent, debt: Debt) => {
    e.stopPropagation();
    try {
      updateDoc(doc(db, 'debts', debt.id), {
        status: 'paid',
        paidAt: Date.now(),
        updatedAt: Date.now()
      }).catch(err => console.error("Error marking debt as paid:", err));
    } catch(err) {
      handleFirestoreError(err, OperationType.UPDATE, 'debts');
    }
  };

  return (
    <>
      <div className="bg-brand-glass backdrop-blur-[10px] rounded-[24px] p-6 border border-white flex flex-col space-y-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-[20px] font-bold text-brand-ink">Control de Pagos y Deudas</h2>
          <button onClick={() => setShowAdd(true)} className="p-3 bg-brand-blush text-brand-fuchsia rounded-full active:scale-90 transition-transform shadow-[0_4px_10px_rgba(194,24,91,0.1)]">
            <Plus className="w-5 h-5" />
          </button>
        </div>

        <div>
          <input 
            type="text" 
            placeholder="Buscar por cliente..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full px-4 py-3 border border-[#eee] rounded-xl text-base bg-[#fafafa] text-brand-ink outline-none focus:border-brand-fuchsia focus:ring-1 focus:ring-brand-fuchsia transition-colors"
          />
        </div>

        <div className="space-y-4">
          {filteredDebts.map(d => {
            const isPaid = d.status === 'paid';
            const daysElapsed = isPaid && d.paidAt ? null : differenceInDays(new Date(), new Date(d.createdAt));
            return (
              <button key={d.id} onClick={() => setEditingDebt(d)} className={`w-full text-left bg-white p-5 rounded-[20px] shadow-[0_4px_6px_rgba(0,0,0,0.02)] border-l-[6px] ${isPaid ? 'border-l-green-500' : 'border-l-red-500'} flex items-center justify-between active:scale-[0.98] transition-transform`}>
                <div className="flex-1">
                  <div className="font-bold text-[18px] text-brand-ink">{d.clientName}</div>
                  <div className="text-[14px] opacity-60 text-brand-ink">{d.concept}</div>
                  {!isPaid && daysElapsed !== null && (
                    <div className="text-[12px] font-bold text-red-500 mt-1">Hace {daysElapsed} {daysElapsed === 1 ? 'día' : 'días'}</div>
                  )}
                  {isPaid && d.paidAt && (
                    <div className="text-[12px] font-bold text-green-500 mt-1">Pagado el {format(new Date(d.paidAt), 'dd MMM yyyy')}</div>
                  )}
                </div>
                <div className="text-right flex flex-col items-end">
                  <div className={`font-extrabold text-[18px] ${isPaid ? 'text-green-500' : 'text-red-500'}`}>${formatCurrency(d.amount)}</div>
                  {!isPaid && (
                    <div 
                      onClick={(e) => handleMarkPaid(e, d)}
                      className="mt-2 text-[10px] font-bold uppercase tracking-wider bg-[#fafafa] border border-[#eee] px-3 py-1 rounded-lg text-brand-ink hover:bg-green-50 hover:text-green-600 transition-colors flex items-center gap-1 active:scale-95"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Pagado
                    </div>
                  )}
                </div>
              </button>
            );
          })}
          {filteredDebts.length === 0 && <p className="text-center text-brand-ink/40 font-bold uppercase tracking-widest text-xs py-10">No hay registros.</p>}
        </div>
      </div>

      {(showAdd || editingDebt) && <DebtModal onClose={() => { setShowAdd(false); setEditingDebt(null); }} clients={clients} editingDebt={editingDebt} />}
    </>
  );
}

function DebtModal({ onClose, clients, editingDebt = null }: any) {
  const [search, setSearch] = useState('');
  const [clientId, setClientId] = useState(editingDebt ? editingDebt.clientId : '');
  const [clientName, setClientName] = useState(editingDebt ? editingDebt.clientName : '');
  const [concept, setConcept] = useState(editingDebt ? editingDebt.concept : '');
  const [amount, setAmount] = useState(editingDebt ? editingDebt.amount.toString() : '');
  const [status, setStatus] = useState<'pending' | 'paid'>(editingDebt ? editingDebt.status : 'pending');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const filteredClients = search.length > 1 ? clients.filter((c: any) => 
    c.firstName.toLowerCase().includes(search.toLowerCase()) || 
    c.lastName.toLowerCase().includes(search.toLowerCase())
  ) : [];

  const handleSelectClient = (c: any) => {
    setClientId(c.id);
    setClientName(c.firstName + ' ' + c.lastName);
    setSearch('');
  };

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    setAmount(raw);
  };

  const handleDelete = async () => {
    if (!editingDebt) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      deleteDoc(doc(db, 'debts', editingDebt.id)).catch(err => console.error("Error deleting debt:", err));
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'debts');
    }
  };

  const handleSave = async () => {
    if (!clientId || !concept || !amount) {
      setError('Faltan campos por rellenar');
      return;
    }
    setError('');
    
    const debtData = {
      clientId,
      clientName,
      concept,
      amount: parseFloat(amount),
      status,
      ownerId: auth.currentUser!.uid,
      paidAt: status === 'paid' ? (editingDebt?.paidAt || Date.now()) : null
    };
    
    try {
      if (editingDebt) {
        updateDoc(doc(db, 'debts', editingDebt.id), {
          ...debtData,
          updatedAt: Date.now()
        }).catch(err => console.error("Error updating debt:", err));
      } else {
        const newDebt = {
          ...debtData,
          id: doc(collection(db, 'debts')).id,
          createdAt: Date.now()
        };
        setDoc(doc(db, 'debts', newDebt.id), newDebt).catch(err => console.error("Error saving debt:", err));
      }
      onClose();
    } catch (err) {
      handleFirestoreError(err, editingDebt ? OperationType.UPDATE : OperationType.CREATE, 'debts');
    }
  };

  return (
    <div className="fixed inset-0 bg-brand-ink/20 backdrop-blur-sm z-50 p-4 flex items-end sm:items-center">
      <div className="bg-white w-full max-w-lg rounded-t-[32px] sm:rounded-[24px] p-6 shadow-[0_20px_40px_rgba(0,0,0,0.05)] border-t-[3px] border-t-brand-gold max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom-10 fade-in duration-300">
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-[20px] font-bold text-brand-ink">{editingDebt ? 'Editar Movimiento' : 'Registrar Movimiento'}</h3>
          <button onClick={onClose} className="p-2 -mr-2"><X className="w-6 h-6 text-brand-ink/40" /></button>
        </div>
        
        <div className="space-y-4">
          {!clientId ? (
            <div>
              <label className="block text-[11px] uppercase font-extrabold text-brand-ink/50 mb-2">Buscar Cliente</label>
              <input 
                type="text" 
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Ej. Maria Perez..."
                className="w-full px-4 py-3 border border-[#eee] rounded-xl text-base bg-[#fafafa] text-brand-ink outline-none focus:border-brand-fuchsia focus:ring-1 focus:ring-brand-fuchsia transition-colors"
              />
              {filteredClients.length > 0 && (
                <div className="mt-2 border border-[#eee] rounded-xl overflow-hidden shadow-[0_4px_6px_rgba(0,0,0,0.02)]">
                  {filteredClients.map((c: any) => (
                    <button 
                      key={c.id} 
                      onClick={() => handleSelectClient(c)}
                      className="w-full text-left p-4 hover:bg-[#fafafa] border-b border-[#eee] bg-white last:border-0"
                    >
                      <span className="font-bold text-brand-ink block">{c.firstName} {c.lastName}</span>
                      <span className="block text-[12px] text-brand-ink/60 mt-0.5">{c.phone}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between bg-brand-blush p-4 rounded-[16px]">
              <span className="font-bold text-brand-fuchsia">{clientName}</span>
              <button onClick={() => setClientId('')} className="text-[11px] text-brand-ink/50 font-extrabold uppercase tracking-wider">Cambiar</button>
            </div>
          )}

          <div>
            <label className="block text-[11px] uppercase font-extrabold text-brand-ink/50 mb-2">Estado del Movimiento</label>
            <div className="flex bg-[#fafafa] border border-[#eee] p-1 rounded-[16px]">
              <button 
                onClick={() => setStatus('pending')} 
                className={`flex-1 p-3 rounded-[12px] text-sm font-bold transition-all ${status === 'pending' ? 'bg-red-50 text-red-500 shadow-[0_4px_6px_rgba(0,0,0,0.05)]' : 'text-brand-ink/40'}`}
              >
                Debe
              </button>
              <button 
                onClick={() => setStatus('paid')} 
                className={`flex-1 p-3 rounded-[12px] text-sm font-bold transition-all ${status === 'paid' ? 'bg-green-50 text-green-500 shadow-[0_4px_6px_rgba(0,0,0,0.05)]' : 'text-brand-ink/40'}`}
              >
                Pagado
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[11px] uppercase font-extrabold text-brand-ink/50 mb-2">Concepto / Servicio</label>
            <input type="text" value={concept} onChange={e => setConcept(e.target.value)} list="services-list" placeholder="Ej. Uñas Acrílicas" className="w-full px-4 py-3 border border-[#eee] rounded-xl text-base bg-[#fafafa] text-brand-ink outline-none focus:border-brand-fuchsia focus:ring-1 focus:ring-brand-fuchsia transition-colors" />
          </div>

          <div>
            <label className="block text-[11px] uppercase font-extrabold text-brand-ink/50 mb-2">Monto ($)</label>
            <input type="text" inputMode="numeric" value={amount ? formatCurrency(amount) : ''} onChange={handlePriceChange} placeholder="0" className="w-full px-4 py-3 border border-[#eee] rounded-xl text-base bg-[#fafafa] text-brand-ink outline-none focus:border-brand-fuchsia focus:ring-1 focus:ring-brand-fuchsia transition-colors font-bold text-brand-ink" />
          </div>

          {error && <p className="text-red-500 font-bold text-center text-sm">{error}</p>}

          <div className="flex gap-3 mt-6">
            {editingDebt && (
              <button onClick={handleDelete} className="flex-1 p-4 bg-[#fafafa] border border-[#eee] text-red-500 rounded-[16px] font-bold text-[16px]">
                {confirmDelete ? '¿Seguro?' : 'Eliminar'}
              </button>
            )}
            <button onClick={handleSave} className={`${editingDebt ? 'flex-[2]' : 'w-full'} p-4 rounded-[16px] font-bold text-[18px] uppercase tracking-[1px] bg-brand-fuchsia text-white shadow-[0_10px_20px_rgba(194,24,91,0.2)]`}>
              {editingDebt ? 'Guardar' : 'Agregar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsView({ userProfile }: { userProfile: AppUser | null }) {
  const [alertMsg, setAlertMsg] = useState('');

  const reqPerms = async () => {
    if (!('Notification' in window)) {
      setAlertMsg("Navegador no soportado");
      return;
    }
    const p = await Notification.requestPermission();
    if (p === 'granted') {
      if ('serviceWorker' in navigator && userProfile) {
        try {
          const registration = await navigator.serviceWorker.ready;
          const existingSub = await registration.pushManager.getSubscription();
          if (!existingSub) {
            const newSub = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            });
            await updateDoc(doc(db, 'users', userProfile.id), {
              pushSubscription: JSON.parse(JSON.stringify(newSub))
            });
          } else {
            await updateDoc(doc(db, 'users', userProfile.id), {
              pushSubscription: JSON.parse(JSON.stringify(existingSub))
            });
          }
          setAlertMsg(`Suscrito a las notificaciones como: ${userProfile.displayName || userProfile.email}`);
        } catch (e) {
          console.error("Error subscribiendo a push:", e);
          setAlertMsg("Error al suscribirse");
        }
      } else {
        setAlertMsg("¡Permisos listos!");
      }
    } else {
      setAlertMsg('Permisos: ' + p);
    }
    setTimeout(() => setAlertMsg(''), 4000);
  };
  
  return (
    <div className="bg-brand-glass backdrop-blur-[10px] rounded-[24px] p-6 border border-white flex flex-col space-y-6 shadow-sm">
      <h2 className="text-[20px] font-bold text-brand-ink">Ajustes</h2>

      {/* Estado de Notificaciones Push */}
      {userProfile && (
        <div className="bg-[#fafafa] rounded-[16px] p-4 border border-[#eee] flex items-center justify-between shadow-sm">
          <div>
            <p className="text-[10px] font-bold uppercase text-brand-ink/40">Notificaciones Push</p>
            <p className="font-bold text-brand-ink text-[14px]">Estado del Dispositivo</p>
          </div>
          <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-full border border-[#eee] shadow-sm">
            <div className={`w-2 h-2 rounded-full ${
              (('Notification' in window) && Notification.permission === 'granted' && userProfile.pushSubscription) 
                ? 'bg-green-500 animate-pulse' 
                : 'bg-red-500'
            }`} />
            <span className="text-[10px] font-bold text-brand-ink uppercase">
              {(('Notification' in window) && Notification.permission === 'granted' && userProfile.pushSubscription) ? 'Suscrito' : 'No Suscrito'}
            </span>
          </div>
        </div>
      )}

      {/* Suscripcion */}
      {userProfile && userProfile.email !== 'saith.martinez7@gmail.com' && (() => {
        const status = getSubscriptionStatus(userProfile);
        const currentMonthStr = format(new Date(), 'yyyy-MM');
        const showRenewBtn = status !== 'Activa' || (userProfile.ultimoMesPagado !== currentMonthStr && new Date().getDate() >= 12);
        return (
          <div className="bg-[#fafafa] rounded-[16px] p-6 border border-[#eee] space-y-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] uppercase font-extrabold text-brand-ink/50 tracking-wider">Mi Suscripción</p>
              <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-full shadow-sm">
                <div className={`w-2 h-2 rounded-full animate-pulse ${
                  status === 'Activa' ? 'bg-green-500' : 
                  status === 'Pendiente' ? 'bg-yellow-500' : 'bg-red-500'
                }`} />
                <span className="text-[10px] font-bold text-brand-ink uppercase">{status}</span>
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-[#eee] flex items-center justify-between shadow-sm">
                <div>
                  <p className="text-[10px] font-bold uppercase text-brand-ink/40">Vencimiento</p>
                  <p className="font-bold text-brand-ink text-[14px] capitalize">
                    {userProfile.nextBillingDate 
                      ? format(new Date(userProfile.nextBillingDate + 'T12:00:00'), "d 'de' MMMM", { locale: es })
                      : formatPaymentDate(userProfile.ultimoMesPagado)}
                  </p>
                </div>
                <Receipt className="w-6 h-6 text-brand-ink/20" />
            </div>
            {showRenewBtn && <SubscriptionWhatsAppBtn />}
          </div>
        );
      })()}
      
      {userProfile?.email === 'saith.martinez7@gmail.com' && (
        <div className="bg-[#fafafa] rounded-[16px] p-6 border border-[#eee] space-y-4">
          <p className="text-[11px] uppercase font-extrabold text-brand-ink/50 tracking-wider">Plan Activo</p>
          <div className="bg-brand-fuchsia text-white p-4 rounded-xl shadow-[0_10px_20px_rgba(194,24,91,0.2)]">
            <p className="font-bold text-[14px]">Plan Administrador ✨</p>
            <p className="text-[11px] opacity-80 mt-1">Suscripción ilimitada. No se requiere pago.</p>
          </div>
        </div>
      )}
      
      <div className="bg-[#fafafa] rounded-[16px] p-6 border border-[#eee] space-y-4">
        <p className="text-[11px] uppercase font-extrabold text-brand-ink/50 tracking-wider">Notificaciones</p>
        {alertMsg && <p className="text-brand-fuchsia font-bold text-sm text-center">{alertMsg}</p>}
        <button onClick={reqPerms} className="w-full p-4 bg-white text-brand-fuchsia rounded-[12px] font-bold border border-[#eee] shadow-[0_4px_6px_rgba(0,0,0,0.02)] active:scale-95 transition-transform flex items-center justify-center gap-2">
          <Check className="w-4 h-4" />
          Probar Permisos
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => playNotificationSound()} className="w-full p-4 bg-white text-brand-fuchsia rounded-[12px] font-bold border border-[#eee] shadow-[0_4px_6px_rgba(0,0,0,0.02)] active:scale-95 transition-transform flex items-center justify-center">
            Probar Sonido
          </button>
          <button onClick={() => stopNotificationSound()} className="w-full p-4 bg-[#fafafa] text-brand-ink/60 rounded-[12px] font-bold border border-[#eee] shadow-[0_4px_6px_rgba(0,0,0,0.02)] active:scale-95 transition-transform flex items-center justify-center gap-2">
            <X className="w-4 h-4" />
            Detener
          </button>
        </div>
      </div>

      <button onClick={() => signOut(auth)} className="w-full p-5 bg-white border-2 border-[#eee] text-[#ff4444] rounded-[16px] font-bold text-[16px] mt-8 active:scale-95 transition-transform flex items-center justify-center gap-2">
        <LogOut className="w-5 h-5" />
        Cerrar Sesión
      </button>
      
      <div className="text-center mt-8 pb-4">
        <p className="text-[10px] font-bold uppercase tracking-[2px] text-brand-ink/40 mb-1">
          App Version 1.2.0
        </p>
        <p className="text-[10px] font-bold uppercase tracking-[2px] text-brand-ink/30 italic">
          Sistema de Gestión Shasha Nails | Creado por SM - 2026
        </p>
      </div>
    </div>
  );
}

function SubscriptionOverlay() {
  return (
    <div className="fixed inset-0 bg-brand-ink/95 backdrop-blur-md z-[100] flex flex-col items-center justify-center p-6 text-center text-white">
      <div className="bg-brand-glass border border-white/20 p-8 rounded-[32px] w-full max-w-sm shadow-[0_20px_40px_rgba(0,0,0,0.4)] relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-red-500 to-brand-fuchsia"></div>
        <div className="w-16 h-16 bg-red-500/20 text-red-400 rounded-full flex items-center justify-center mx-auto mb-6">
          <X className="w-8 h-8" />
        </div>
        <h2 className="text-[28px] font-display italic text-white mb-2">Servicio Suspendido</h2>
        <p className="text-white/70 text-[14px] leading-relaxed mb-8">
          Tu acceso a Shasha Nails ha sido bloqueado temporalmente por falta de pago. Por favor, renueva tu suscripción para continuar.
        </p>
        <SubscriptionWhatsAppBtn isPrimary={true} />
      </div>
    </div>
  );
}

function SubscriptionWhatsAppBtn({ isPrimary = false }: { isPrimary?: boolean }) {
  const currentMonthName = format(new Date(), 'MMMM', { locale: es });
  const msg = `Hola Saith (SM)! ✨ Quiero realizar la cancelación de mi suscripción de Shasha Nails por valor de $27.000 correspondiente al mes de ${currentMonthName}. Por favor, confírmame los datos para la transferencia. 💖`;
  const url = `https://wa.me/573123665781?text=${encodeURIComponent(msg)}`;
  
  return (
    <button 
      onClick={() => window.open(url, '_blank')}
      className={`w-full p-4 rounded-[16px] font-bold text-[16px] flex items-center justify-center gap-2 transition-transform active:scale-95 ${
        isPrimary 
          ? 'bg-brand-fuchsia text-white shadow-[0_10px_20px_rgba(194,24,91,0.3)]' 
          : 'bg-brand-fuchsia/10 text-brand-fuchsia border border-brand-fuchsia/20'
      }`}
    >
      <MessageCircle className="w-5 h-5" />
      Renovar Suscripción
    </button>
  );
}

function AdminView() {
  const users = useAllUsers().filter(u => u.email !== 'saith.martinez7@gmail.com');
  const maintenance = useMaintenanceMode();
  
  const [maintActive, setMaintActive] = useState(false);
  const [maintMessage, setMaintMessage] = useState('La aplicación se encuentra en mantenimiento.');
  const [maintEnd, setMaintEnd] = useState('');
  const [maintExcluded, setMaintExcluded] = useState<string>('');

  useEffect(() => {
    if (maintenance) {
      setMaintActive(maintenance.isActive);
      setMaintMessage(maintenance.message);
      setMaintEnd(maintenance.endDate);
      setMaintExcluded((maintenance.excludedEmails || []).join(', '));
    }
  }, [maintenance]);

  const saveMaintenance = async () => {
    try {
      const excludedArray = maintExcluded.split(',').map(e => e.trim()).filter(e => e);
      setDoc(doc(db, 'settings', 'maintenance'), {
        isActive: maintActive,
        message: maintMessage,
        startDate: '', // Ya no usamos start
        endDate: maintEnd,
        excludedEmails: excludedArray
      }).then(() => {
        alert('Configuración de mantenimiento guardada exitosamente.');
      }).catch(e => {
        console.error(e);
        alert('Error guardando mantenimiento');
      });
    } catch (e) {
      console.error(e);
      alert('Error guardando mantenimiento');
    }
  };
  
  const handleMarkPaid = async (user: AppUser) => {
    const currentMonthStr = format(new Date(), 'yyyy-MM');
    if (window.confirm(`¿Marcar mes de ${format(new Date(), 'MMMM', { locale: es })} como pagado para ${user.email}?`)) {
      try {
        updateDoc(doc(db, 'users', user.id), {
          ultimoMesPagado: currentMonthStr,
          subscriptionStatusOverride: 'auto'
        }).then(() => {
          alert('Pago actualizado correctamente.');
        }).catch(e => {
          console.error(e);
          alert('Error al actualizar');
        });
      } catch (e) {
        console.error(e);
        alert('Error al actualizar');
      }
    }
  };

  const handleSetStatus = async (user: AppUser, statusOverride: 'auto' | 'Activa' | 'Pendiente' | 'Suspendida') => {
    try {
      updateDoc(doc(db, 'users', user.id), {
        subscriptionStatusOverride: statusOverride
      }).catch(e => {
        console.error(e);
        alert('Error al cambiar estado');
      });
    } catch (e) {
      console.error(e);
      alert('Error al cambiar estado');
    }
  };

  const handleCheckboxChange = (email: string, checked: boolean) => {
    let list = maintExcluded.split(',').map(e => e.trim()).filter(e => e);
    if (checked) {
      if (!list.includes(email)) list.push(email);
    } else {
      list = list.filter(e => e !== email);
    }
    setMaintExcluded(list.join(', '));
  };

  const [quotaStatus, setQuotaStatus] = useState<'idle' | 'checking' | 'ok' | 'exceeded'>('idle');

  const checkQuota = async () => {
    setQuotaStatus('checking');
    try {
      // Petición de prueba para forzar un error de Cuota si está excedida.
      // Firebase devolverá error de permisos si hay cuota, lo cual es "ok" (llegó al servidor).
      // Si la cuota está excedida, devolverá "resource-exhausted".
      const { getDocs, query, collection, limit } = await import('firebase/firestore');
      await getDocs(query(collection(db, 'quota_test'), limit(1)));
      setQuotaStatus('ok');
    } catch (e: any) {
      if (e.message?.includes('Quota') || e.code === 'resource-exhausted') {
        setQuotaStatus('exceeded');
      } else {
        setQuotaStatus('ok'); // Error de permisos significa que Firebase sí respondió (hay cuota)
      }
    }
  };

  return (
    <div className="bg-brand-glass backdrop-blur-[10px] rounded-[24px] p-6 border border-white flex flex-col space-y-6 shadow-sm mb-10">
      <h2 className="text-[20px] font-bold text-brand-ink">Panel de Administrador</h2>

      <div className="bg-[#fafafa] rounded-[16px] p-6 border border-[#eee] mb-2 space-y-4">
        <div>
          <h3 className="font-bold text-brand-ink text-lg">Estado de la Cuota (Manual)</h3>
          <p className="text-[12px] text-brand-ink/60 mt-1">
            Google no permite ver el porcentaje exacto (ej. 66%) desde la aplicación sin una API paga. 
            Este botón enviará un pulso al servidor para decirte si está al 100% (Excedida) o si aún tienes cuota disponible.
          </p>
        </div>
        
        <div className="flex items-center justify-between bg-white p-3 border border-[#eee] rounded-xl">
          <span className="font-bold text-[14px] text-brand-ink">Cuota Actual:</span>
          {quotaStatus === 'idle' && <span className="text-gray-400 font-bold text-sm">Sin verificar</span>}
          {quotaStatus === 'checking' && <span className="text-blue-500 font-bold text-sm animate-pulse">Verificando...</span>}
          {quotaStatus === 'ok' && <span className="text-green-600 font-bold text-sm">✅ Disponible</span>}
          {quotaStatus === 'exceeded' && <span className="text-red-600 font-bold text-sm">❌ 100% Excedida</span>}
        </div>
        
        <button 
          onClick={checkQuota}
          disabled={quotaStatus === 'checking'}
          className="w-full py-3 bg-brand-ink text-white rounded-xl font-bold text-sm hover:bg-brand-fuchsia transition-all"
        >
          {quotaStatus === 'checking' ? 'Enviando pulso...' : 'Verificar Cuota Ahora'}
        </button>
      </div>
      
      <div className="space-y-4">
        <div className="bg-[#fafafa] rounded-[16px] p-6 border border-[#eee] mb-6 space-y-4">
          <div>
            <h3 className="font-bold text-brand-ink text-lg">Modo Mantenimiento</h3>
            <p className="text-[12px] text-brand-ink/60 mt-1">Configura el mantenimiento global. Tú (saith.martinez7) nunca serás bloqueado.</p>
          </div>
          
          <div className="flex items-center justify-between bg-white p-3 border border-[#eee] rounded-xl">
            <span className="font-bold text-[14px] text-brand-ink">Activar Manualmente:</span>
            <button 
              onClick={() => setMaintActive(!maintActive)}
              className={`px-4 py-2 rounded-xl font-bold transition-all shadow-sm ${maintActive ? 'bg-red-500 text-white shadow-red-500/20' : 'bg-[#fafafa] text-brand-ink border border-[#eee]'}`}
            >
              {maintActive ? 'ACTIVADO' : 'Desactivado'}
            </button>
          </div>

          <div>
            <label className="text-[12px] font-bold text-brand-ink/60 mb-1 block">Finalización Automática (Opcional):</label>
            <p className="text-[10px] text-brand-ink/50 mb-2 leading-tight">Si pones una fecha aquí, el mantenimiento se activará solo, y el mensaje calculará el tiempo restante automáticamente mostrando "Volveremos el..."</p>
            <input 
              type="datetime-local" 
              value={maintEnd}
              onChange={(e) => setMaintEnd(e.target.value)}
              className="w-full px-3 py-3 border border-[#eee] rounded-xl text-sm bg-white outline-none focus:border-brand-fuchsia"
            />
          </div>

          <div>
            <label className="text-[12px] font-bold text-brand-ink/60">Mensaje predeterminado:</label>
            <textarea 
              value={maintMessage}
              onChange={(e) => setMaintMessage(e.target.value)}
              className="w-full px-4 py-3 border border-[#eee] rounded-xl text-sm bg-white mt-1 h-16 resize-none outline-none focus:border-brand-fuchsia"
            />
          </div>

          <div>
            <label className="text-[12px] font-bold text-brand-ink/60 mb-2 block">Usuarios excluidos (Pruebas):</label>
            <p className="text-[10px] text-brand-ink/50 mb-2 leading-tight">Selecciona los usuarios que podrán entrar a la app aunque esté en mantenimiento.</p>
            <div className="space-y-2 max-h-40 overflow-y-auto bg-white p-3 rounded-xl border border-[#eee]">
              {users.map(u => {
                const isChecked = maintExcluded.split(',').map(e => e.trim()).includes(u.email || '');
                return (
                  <label key={u.id} className="flex items-center gap-3 p-2 hover:bg-[#fafafa] rounded-lg cursor-pointer transition-colors border border-transparent hover:border-[#eee]">
                    <input 
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => handleCheckboxChange(u.email || '', e.target.checked)}
                      className="w-4 h-4 text-brand-fuchsia rounded border-gray-300 focus:ring-brand-fuchsia"
                    />
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-brand-ink">{u.displayName || 'Sin nombre'}</span>
                      <span className="text-[10px] text-brand-ink/50">{u.email}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <button onClick={saveMaintenance} className="w-full py-4 bg-brand-ink text-white rounded-xl font-bold mt-2 hover:bg-brand-ink/90 transition-colors shadow-lg">
            Guardar Configuración de Mantenimiento
          </button>
        </div>

        <h3 className="font-bold text-brand-ink mt-6 mb-2">Usuarios Registrados</h3>
        {users.length === 0 ? (
          <div className="bg-white p-6 rounded-[20px] text-center border border-[#eee] shadow-sm">
            <p className="text-brand-ink/60 font-bold mb-2">No hay usuarios registrados aún.</p>
            <p className="text-[12px] text-brand-ink/40">Dile a Shanya que inicie sesión o recargue la página en su celular para que su perfil aparezca aquí.</p>
          </div>
        ) : (
          users.map(u => {
          const status = getSubscriptionStatus(u);
          const isManual = u.subscriptionStatusOverride && u.subscriptionStatusOverride !== 'auto';
          const handleSetNextBillingDate = async (user: AppUser, dateStr: string) => {
            try {
              updateDoc(doc(db, 'users', user.id), {
                nextBillingDate: dateStr
              }).then(() => {
                alert('Fecha de corte actualizada');
              }).catch(e => {
                console.error(e);
                alert('Error al actualizar la fecha');
              });
            } catch (e) {
              console.error(e);
              alert('Error al actualizar la fecha');
            }
          };

          return (
            <div key={u.id} className="bg-white p-5 rounded-[20px] shadow-sm border border-[#eee] flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-bold text-brand-ink text-lg">{u.displayName || u.email}</p>
                  <p className="text-[12px] text-brand-ink/50">{u.email}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase ${status === 'Activa' ? 'bg-green-50 text-green-600' : status === 'Pendiente' ? 'bg-yellow-50 text-yellow-600' : 'bg-red-50 text-red-600'}`}>
                    {status}
                  </div>
                  {isManual && <span className="text-[8px] bg-brand-ink/10 text-brand-ink px-1.5 py-0.5 rounded font-bold uppercase">Manual</span>}
                </div>
              </div>
              
              <div className="flex flex-col gap-2 bg-gray-50 p-3 rounded-xl">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-bold text-brand-ink/60 capitalize">
                    Vencimiento Mensual:
                  </span>
                  <input 
                    type="date"
                    value={u.nextBillingDate || '2026-05-14'}
                    onChange={(e) => handleSetNextBillingDate(u, e.target.value)}
                    className="text-[12px] font-bold text-brand-ink bg-white border border-[#eee] rounded-lg px-2 py-1 outline-none focus:border-brand-fuchsia"
                  />
                </div>
              </div>

              <div className="flex gap-2 mt-1">
                <button onClick={() => handleSetStatus(u, 'Activa')} className={`flex-1 py-2 text-[10px] font-bold rounded-lg border ${u.subscriptionStatusOverride === 'Activa' ? 'bg-green-500 text-white border-green-500' : 'border-green-200 text-green-600'}`}>Activar</button>
                <button onClick={() => handleSetStatus(u, 'Pendiente')} className={`flex-1 py-2 text-[10px] font-bold rounded-lg border ${u.subscriptionStatusOverride === 'Pendiente' ? 'bg-yellow-500 text-white border-yellow-500' : 'border-yellow-200 text-yellow-600'}`}>Pendiente</button>
                <button onClick={() => handleSetStatus(u, 'Suspendida')} className={`flex-1 py-2 text-[10px] font-bold rounded-lg border ${u.subscriptionStatusOverride === 'Suspendida' ? 'bg-red-500 text-white border-red-500' : 'border-red-200 text-red-600'}`}>Suspender</button>
                <button onClick={() => handleSetStatus(u, 'auto')} className={`flex-1 py-2 text-[10px] font-bold rounded-lg border ${!u.subscriptionStatusOverride || u.subscriptionStatusOverride === 'auto' ? 'bg-gray-500 text-white border-gray-500' : 'border-gray-200 text-gray-500'}`}>Auto</button>
              </div>
            </div>
          );
        })
        )}
      </div>
    </div>
  );
}
