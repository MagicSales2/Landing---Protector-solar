import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { Order } from '../types';

// Initialize Firebase App if not already done
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/spreadsheets');

let cachedAccessToken: string | null = null;
let isSigningIn = false;

// Initialize auth state listener
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Start Google sign-in
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('No se pudo obtener el token de acceso de Google Sheets');
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Error al iniciar sesión:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

// Sign out
export const googleSignOut = async () => {
  await signOut(auth);
  cachedAccessToken = null;
};

// Helper to get active access token in memory
export const getActiveAccessToken = (): string | null => {
  return cachedAccessToken;
};

// Set token directly if we get it from popups/listeners
export const setCachedAccessToken = (token: string | null) => {
  cachedAccessToken = token;
};

// Fetch current spreadsheet's first sheet name to avoid hardcoding errors (Spanish vs English Sheets)
export const getFirstSheetName = async (accessToken: string, spreadsheetId: string): Promise<string> => {
  try {
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      if (data.sheets && data.sheets.length > 0) {
        return data.sheets[0].properties.title;
      }
    }
  } catch (e) {
    console.error('Error retrieving spreadsheet metadata:', e);
  }
  return 'Sheet1'; // Fallback
};

// Create a new spreadsheet in the user's Drive
export const createNewSpreadsheet = async (accessToken: string, title: string = "Pedidos Anthelios Colombia"): Promise<string> => {
  const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title: title,
      },
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error?.message || 'Error al crear la hoja de cálculo');
  }

  const data = await response.json();
  return data.spreadsheetId;
};

// Setup table columns (titles)
export const setupHeaders = async (accessToken: string, spreadsheetId: string, sheetName: string): Promise<void> => {
  const headers = [
    'ID_Pedido',
    'Nombre',
    'Celular',
    'Documento identidad',
    'Correo',
    'Direcccion',
    'Direccion 2',
    'Departamento',
    'Ciudad',
    'Producto',
    'Cantidad',
    'Medio de pago',
    'Total_COP',
    'Notas',
    'Estado',
    'Fecha',
    'hora'
  ];

  const range = `${sheetName}!A1:Q1`;
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [headers],
      }),
    }
  );

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error?.message || 'Error al escribir las cabeceras');
  }
};

// Append multiple or single orders to spreadsheet
export const appendOrders = async (
  accessToken: string,
  spreadsheetId: string,
  orders: Order[],
  sheetName: string
): Promise<void> => {
  if (orders.length === 0) return;

  const values = orders.map((o) => {
    let fecha = '';
    let hora = '';
    try {
      const orderDate = new Date(o.date);
      fecha = orderDate.toLocaleDateString('es-CO', { timeZone: 'America/Bogota' });
      hora = orderDate.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour12: false });
    } catch (e) {
      fecha = o.date.split('T')[0] || '';
      hora = o.date.split('T')[1]?.substring(0, 8) || '';
    }

    return [
      o.id,
      o.clientName,
      o.clientPhone,
      o.documentId || '',
      o.clientEmail || '',
      o.address,
      o.address2 || '',
      o.department,
      o.city,
      o.offerName,
      o.quantity,
      o.paymentMethod || '',
      o.totalPrice,
      o.notes,
      o.status,
      fecha,
      hora
    ];
  });

  const range = `${sheetName}!A:Q`;
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values,
      }),
    }
  );

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error?.message || 'Error al agregar filas a la hoja de Google Sheets');
  }
};
