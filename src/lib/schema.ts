export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

export interface AppUser {
  id: string; // auth.currentUser.uid
  email: string | null;
  displayName: string | null;
  ultimoMesPagado: string | null;
  subscriptionStatusOverride?: 'auto' | 'Activa' | 'Pendiente' | 'Suspendida';
  pushSubscription?: any;
  createdAt: number;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  // In a real scenario, this gets more verbose auth info
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {},
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface Client {
  id: string; // Document ID
  firstName: string;
  lastName: string;
  phone: string;
  notes: string;
  ownerId: string;
  createdAt: number;
  updatedAt: number;
}

export interface Appointment {
  id: string; // Document ID
  clientId: string;
  clientName: string;
  date: number; // milliseconds timestamp
  service: string;
  price: number;
  advancePayment: number; // Abono
  paymentMethod: 'Efectivo' | 'Transferencia' | '';
  designImageUrl: string | null;
  designImageUrls?: string[]; // Multiple images support (up to 3)
  locationType: 'Presencial' | 'Domicilio';
  address: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no-show';
  notified60: boolean;
  notified30: boolean;
  notified15?: boolean;
  ownerId: string;
  createdAt: number;
  updatedAt: number;
}

export interface Debt {
  id: string;
  clientId: string;
  clientName: string;
  concept: string;
  amount: number;
  status: 'pending' | 'paid';
  ownerId: string;
  createdAt: number;
  paidAt: number | null;
  appointmentId?: string;
}

export function formatCurrency(amount: number | string): string {
  if (!amount) return '';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '';
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(num);
}
