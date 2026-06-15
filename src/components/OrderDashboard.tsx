import React, { useState, useEffect } from 'react';
import { FileSpreadsheet, Trash2, CheckCircle2, ShieldAlert, Clock, RefreshCw, XCircle, ChevronDown, Award, LogOut, Check, SquarePen, ExternalLink, Settings } from 'lucide-react';
import { Order } from '../types';
import { User } from 'firebase/auth';
import {
  initAuth,
  googleSignIn,
  googleSignOut,
  getActiveAccessToken,
  setCachedAccessToken,
  getFirstSheetName,
  createNewSpreadsheet,
  setupHeaders,
  appendOrders
} from '../lib/sheetsService';

interface OrderDashboardProps {
  ordersUpdatedToggle: boolean;
  onOrderDelete: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export default function OrderDashboard({ ordersUpdatedToggle, onOrderDelete, isOpen, onClose }: OrderDashboardProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showAdmin, setShowAdmin] = useState(true);
  const [passcode, setPasscode] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Google Sheets integration state
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [spreadsheetId, setSpreadsheetId] = useState<string>('');
  const [localSheetIdInput, setLocalSheetIdInput] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [showSheetsConfig, setShowSheetsConfig] = useState(false);

  // Load spreadsheet ID from LocalStorage on mount or use default
  useEffect(() => {
    const savedId = localStorage.getItem('colombia_sunscreen_spreadsheet_id');
    const defaultId = '100VY9LNQGnyG9PiGsL6jV6ps9XCM8SpqoyoLl0gfVtM';
    if (savedId) {
      setSpreadsheetId(savedId);
      setLocalSheetIdInput(savedId);
    } else {
      setSpreadsheetId(defaultId);
      setLocalSheetIdInput(defaultId);
      localStorage.setItem('colombia_sunscreen_spreadsheet_id', defaultId);
    }
  }, []);

  // Initialize Auth state
  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setGoogleUser(user);
        setCachedAccessToken(token);
      },
      () => {
        setGoogleUser(null);
        setCachedAccessToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  // Fetch orders from LocalStorage
  const loadOrders = () => {
    try {
      const ordersStr = localStorage.getItem('colombia_sunscreen_orders');
      if (ordersStr) {
        setOrders(JSON.parse(ordersStr));
      } else {
        setOrders([]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadOrders();
    }
  }, [isOpen, ordersUpdatedToggle]);

  // Background Auto-Sync: if authorized, quietly push any unsynced orders to Google Sheets
  useEffect(() => {
    const token = getActiveAccessToken();
    if (!googleUser || !spreadsheetId || !token || isSyncing || orders.length === 0) {
      return;
    }

    const unsyncedOrders = orders.filter(o => !o.synced);
    if (unsyncedOrders.length === 0) {
      return;
    }

    const autoSyncPending = async () => {
      setIsSyncing(true);
      try {
        console.log(`Auto-sincronizando ${unsyncedOrders.length} pedidos en segundo plano...`);
        const sheetName = await getFirstSheetName(token, spreadsheetId);
        await appendOrders(token, spreadsheetId, unsyncedOrders, sheetName);

        // Update local state and localStorage safely
        const updatedOrders = orders.map(o => {
          const wasUnsynced = unsyncedOrders.some(uo => uo.id === o.id);
          return wasUnsynced ? { ...o, synced: true } : o;
        });
        setOrders(updatedOrders);
        localStorage.setItem('colombia_sunscreen_orders', JSON.stringify(updatedOrders));
        
        setSyncStatus({ 
          type: 'success', 
          message: `🔄 Sincronización automática de Google Sheets completa: se registraron ${unsyncedOrders.length} pedidos con éxito.` 
        });
      } catch (err: any) {
        console.error('Error in background auto-sync:', err);
        setSyncStatus({
          type: 'error',
          message: `La sincronización automática de Google Sheets falló: ${err.message || 'Verifica los permisos de edición o de compartir en la hoja'}`
        });
      } finally {
        setIsSyncing(false);
      }
    };

    const timeoutId = setTimeout(autoSyncPending, 1000);
    return () => clearTimeout(timeoutId);
  }, [googleUser, spreadsheetId, orders, isSyncing]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passcode === 'admin' || passcode === '1234') {
      setIsAuthenticated(true);
      setLoginError('');
    } else {
      setLoginError('Contraseña incorrecta (pista: usa "admin")');
    }
  };

  const handleUpdateStatus = (id: string, newStatus: Order['status']) => {
    const updatedOrders = orders.map(o => (o.id === id ? { ...o, status: newStatus } : o));
    setOrders(updatedOrders);
    localStorage.setItem('colombia_sunscreen_orders', JSON.stringify(updatedOrders));
  };

  const handleDeleteOrder = (id: string) => {
    if (confirm('¿Estás seguro de eliminar este pedido?')) {
      const updatedOrders = orders.filter(o => o.id !== id);
      setOrders(updatedOrders);
      localStorage.setItem('colombia_sunscreen_orders', JSON.stringify(updatedOrders));
      onOrderDelete();
    }
  };


  const handleGoogleSignInClick = async () => {
    setIsSyncing(true);
    setSyncStatus(null);
    try {
      const res = await googleSignIn();
      if (res) {
        setGoogleUser(res.user);
        setSyncStatus({ type: 'success', message: `Conectado correctamente como ${res.user.displayName || res.user.email}` });
      }
    } catch (err: any) {
      console.error(err);
      setSyncStatus({ type: 'error', message: `Error al conectar con Google Sheets: ${err.message || 'Error desconocido'}` });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleGoogleSignOutClick = async () => {
    setIsSyncing(true);
    try {
      await googleSignOut();
      setGoogleUser(null);
      setSyncStatus({ type: 'success', message: 'Sesión de Google cerrada con éxito' });
    } catch (err: any) {
      setSyncStatus({ type: 'error', message: `Error al cerrar sesión: ${err.message}` });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCreateNewSheetClick = async () => {
    const token = getActiveAccessToken();
    if (!token) {
      setSyncStatus({ type: 'error', message: 'Inicia sesión con Google para crear la hoja de cálculo' });
      return;
    }

    setIsSyncing(true);
    setSyncStatus(null);
    try {
      const newId = await createNewSpreadsheet(token, 'Pedidos Anthelios Colombia 🇨🇴');
      localStorage.setItem('colombia_sunscreen_spreadsheet_id', newId);
      setSpreadsheetId(newId);
      setLocalSheetIdInput(newId);

      const sheetName = await getFirstSheetName(token, newId);
      await setupHeaders(token, newId, sheetName);

      setSyncStatus({ 
        type: 'success', 
        message: '¡Hoja creada con éxito en tu Google Sheets! Ya está lista con todas las columnas configuradas.' 
      });
    } catch (err: any) {
      console.error(err);
      setSyncStatus({ type: 'error', message: `Error al crear hoja: ${err.message || err}` });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLinkExistingSheet = async () => {
    if (!localSheetIdInput.trim()) {
      setSyncStatus({ type: 'error', message: 'Por favor ingresa un ID de hoja válido.' });
      return;
    }
    
    // Extract ID if link is copied/pasted
    let parsedId = localSheetIdInput.trim();
    if (parsedId.includes('docs.google.com/spreadsheets')) {
      const match = parsedId.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (match && match[1]) {
        parsedId = match[1];
      }
    }

    setIsSyncing(true);
    setSyncStatus(null);
    try {
      localStorage.setItem('colombia_sunscreen_spreadsheet_id', parsedId);
      setSpreadsheetId(parsedId);
      setLocalSheetIdInput(parsedId);
      setSyncStatus({ type: 'success', message: 'ID de Hoja de Cálculo guardado y conectado con éxito.' });
    } catch (err: any) {
      setSyncStatus({ type: 'error', message: `Error al guardar: ${err.message || err}` });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncAllOrdersClick = async () => {
    const unsyncedOrders = orders.filter(o => !o.synced);

    if (orders.length === 0) {
      setSyncStatus({ type: 'error', message: 'No hay pedidos guardados en la base de datos local para sincronizar.' });
      return;
    }

    const token = getActiveAccessToken();
    if (!token) {
      setSyncStatus({ type: 'error', message: 'Inicia sesión con Google para sincronizar.' });
      return;
    }

    if (!spreadsheetId.trim()) {
      setSyncStatus({ type: 'error', message: 'Por favor conecta o crea una Hoja de Google Sheets primero.' });
      return;
    }

    if (unsyncedOrders.length === 0) {
      setSyncStatus({ type: 'success', message: '¡Todo al día! Todos tus pedidos ya se encuentran registrados en tu hoja de Google Sheets.' });
      return;
    }

    setIsSyncing(true);
    setSyncStatus(null);
    try {
      const sheetName = await getFirstSheetName(token, spreadsheetId);
      await appendOrders(token, spreadsheetId, unsyncedOrders, sheetName);
      
      const updatedOrders = orders.map(o => {
        const wasUnsynced = unsyncedOrders.some(uo => uo.id === o.id);
        return wasUnsynced ? { ...o, synced: true } : o;
      });
      setOrders(updatedOrders);
      localStorage.setItem('colombia_sunscreen_orders', JSON.stringify(updatedOrders));

      setSyncStatus({ 
        type: 'success', 
        message: `¡Éxito! Se sincronizaron los ${unsyncedOrders.length} pedidos pendientes a tu Google Sheet (pestaña "${sheetName}").` 
      });
    } catch (err: any) {
      console.error(err);
      setSyncStatus({ type: 'error', message: `Error de sincronización: ${err.message || err}` });
    } finally {
      setIsSyncing(false);
    }
  };

  // Filter calculations
  const filteredOrders = orders.filter(o => {
    const matchesSearch = o.clientName.toLowerCase().includes(search.toLowerCase()) || 
                          o.clientPhone.includes(search) || 
                          o.id.toLowerCase().includes(search.toLowerCase()) ||
                          o.city.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // KPI Calculations
  const totalRevenue = orders
    .filter(o => o.status !== 'cancelled')
    .reduce((acc, curr) => acc + curr.totalPrice, 0);

  const averageTicket = orders.length > 0 ? (totalRevenue / orders.filter(o => o.status !== 'cancelled').length || 0) : 0;

  const formatPrice = (p: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(p);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-55 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto font-sans text-slate-800">
      <div className="bg-white rounded-3xl w-full max-w-6xl shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto p-6 md:p-8 relative animate-slideUp">
        {/* Close Button top right */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 bg-slate-100 p-2 rounded-full cursor-pointer transition-colors"
          title="Cerrar modal"
        >
          <XCircle className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center justify-center text-center mb-6">
          <p className="text-xs text-orange-600 font-bold uppercase tracking-widest font-mono">Área de Miembros</p>
          <h3 className="text-xl font-black text-slate-900">Administrador de Pedidos</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md">
            Sección exclusiva para vendedores y administración de órdenes de Dermagia Colombia. Acceso privado.
          </p>
        </div>

        {showAdmin && (
          <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200">
            {!isAuthenticated ? (
              // Login form
              <form onSubmit={handleLogin} className="max-w-xs mx-auto text-center py-6">
                <p className="text-xs text-slate-500 font-medium mb-4">
                  Ingresa tu clave de acceso. Por defecto la clave es <strong className="font-mono bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded border border-slate-200">admin</strong> para pruebas.
                </p>
                <input
                  required
                  type="password"
                  placeholder="Contraseña"
                  value={passcode}
                  onChange={e => setPasscode(e.target.value)}
                  className="w-full text-sm px-3 py-2.5 bg-slate-50 border rounded-lg focus:ring-1 focus:ring-orange-500 focus:outline-none text-center mb-2"
                />
                {loginError && <p className="text-xs text-red-500 font-bold mb-3">{loginError}</p>}
                <button
                  type="submit"
                  className="w-full bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold py-2.5 rounded-lg transition-colors cursor-pointer"
                >
                  Acceder
                </button>
              </form>
            ) : (
              // Main Admin Panel
              <div>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between pb-6 border-b border-slate-100 gap-4">
                  <div>
                    <h4 className="font-extrabold text-slate-900 text-lg flex items-center gap-1.5">
                      <Award className="w-5 h-5 text-orange-500" />
                      Dashboard de Ventas de Colombia
                    </h4>
                    <p className="text-xs text-slate-500">Métricas acumuladas del tráfico de campañas publicitarias.</p>
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={loadOrders}
                      className="flex items-center justify-center p-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer min-h-[38px] text-slate-600"
                      title="Refrescar Órdenes"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => setShowSheetsConfig(!showSheetsConfig)}
                      className={`flex items-center gap-2 px-4 py-2 ${
                        googleUser && getActiveAccessToken()
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-[0_2px_8px_rgba(16,185,129,0.15)] border-transparent' 
                          : 'bg-amber-50/70 hover:bg-amber-100/80 text-amber-800 border-amber-200 border'
                      } font-bold rounded-lg text-xs transition-all cursor-pointer min-h-[38px]`}
                      id="toggle-sheets-config"
                    >
                      <FileSpreadsheet className={`w-4 h-4 ${googleUser && getActiveAccessToken() ? 'text-white' : 'text-amber-600'}`} />
                      {googleUser && getActiveAccessToken() 
                        ? 'Google Sheets Sincronizado 🟢' 
                        : 'Conectar Google Sheets 🟡'}
                    </button>
                  </div>
                </div>

                {/* Google Sheets Config Drawer */}
                {showSheetsConfig && (
                  <div className="mb-6 bg-slate-50 border border-emerald-200 rounded-2xl p-5 mt-4 transition-all animate-slideUp">
                    <div className="flex items-center justify-between pb-3 border-b border-emerald-100 mb-4">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                        <h5 className="font-extrabold text-slate-900 text-sm">Sincronización Inteligente de Google Sheets</h5>
                      </div>
                      <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-bold border border-emerald-250">
                        Tutorial Paso a Paso
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-700">
                      {/* Paso 1: Auth */}
                      <div className="space-y-3 bg-white p-4 rounded-xl border border-slate-100 shadow-2xs">
                        <p className="font-bold text-[11px] text-slate-400 uppercase tracking-widest font-mono">Paso 1: Autorización de Google</p>
                        
                        {googleUser ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-100 p-2.5 rounded-lg">
                              {googleUser.photoURL ? (
                                <img src={googleUser.photoURL} alt={googleUser.displayName || ''} className="w-7 h-7 rounded-full border border-emerald-200" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="w-7 h-7 bg-emerald-600 text-white text-xs font-bold rounded-full flex items-center justify-center">
                                  {googleUser.displayName?.[0] || 'U'}
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="font-extrabold text-slate-800 truncate leading-none">{googleUser.displayName}</p>
                                <p className="text-[10px] text-slate-500 truncate mt-1">{googleUser.email}</p>
                              </div>
                            </div>
                            <button
                              onClick={handleGoogleSignOutClick}
                              disabled={isSyncing}
                              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 border border-red-100 text-red-500 hover:bg-red-50 font-bold rounded-lg transition-colors cursor-pointer text-[11px]"
                            >
                              <LogOut className="w-3.5 h-3.5" />
                              Desconectar Cuenta de Google
                            </button>
                          </div>
                        ) : (
                          <div>
                            <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
                              Conecta tu cuenta de Google de forma segura para permitir que tus anuncios escriban leads directamente en tus hojas de cálculo.
                            </p>
                            
                            <button
                              onClick={handleGoogleSignInClick}
                              disabled={isSyncing}
                              className="w-full bg-white hover:bg-slate-50 text-slate-700 text-xs py-2 px-3 rounded-lg border border-slate-200 flex items-center justify-center gap-2 cursor-pointer font-bold select-none transition-colors shadow-2xs"
                            >
                              <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-4 h-4 flex-shrink-0">
                                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                              </svg>
                              <span>Conectar con Google</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Paso 2: Spreadsheet linking */}
                      <div className="space-y-3 bg-white p-4 rounded-xl border border-slate-100 shadow-2xs">
                        <p className="font-bold text-[11px] text-slate-400 uppercase tracking-widest font-mono">Paso 2: Conectar URL u ID de Hoja</p>
                        
                        <div className="space-y-2">
                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              value={localSheetIdInput}
                              onChange={(e) => setLocalSheetIdInput(e.target.value)}
                              placeholder="Pega URL o ID de Google Sheet aquí"
                              className="flex-1 text-[11px] px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none truncate"
                            />
                            <button
                              onClick={handleLinkExistingSheet}
                              className="px-3 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg text-[11px] transition-colors cursor-pointer"
                            >
                              Vincular
                            </button>
                          </div>

                          <div className="relative flex py-1 items-center">
                            <div className="flex-grow border-t border-slate-100"></div>
                            <span className="flex-shrink mx-2 text-[9px] text-slate-400 font-extrabold uppercase tracking-wider">o</span>
                            <div className="flex-grow border-t border-slate-100"></div>
                          </div>

                          <button
                            onClick={handleCreateNewSheetClick}
                            disabled={!googleUser || isSyncing}
                            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-colors cursor-pointer text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <SquarePen className="w-4 h-4" />
                            {isSyncing ? 'Creando Hoja...' : '✨ Crear Nueva Hoja Automática'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Status alerts */}
                    {syncStatus && (
                      <div className={`mt-4 p-3 rounded-lg border text-[11px] font-medium leading-relaxed ${
                        syncStatus.type === 'success' 
                          ? 'bg-emerald-50 border-emerald-100 text-emerald-800' 
                          : 'bg-red-50 border-red-100 text-red-800'
                      }`}>
                        {syncStatus.message}
                      </div>
                    )}

                    {/* Active sheet status bar */}
                    {spreadsheetId && (
                      <div className="mt-4 pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs animate-fadeIn">
                        <div className="flex items-center gap-1.5 text-slate-600">
                          {googleUser && getActiveAccessToken() ? (
                            <>
                              <Check className="w-4 h-4 text-emerald-600 stroke-[3px]" />
                              <span>
                                Hoja vinculada y activa. Los nuevos pedidos se registran en tiempo real.
                              </span>
                            </>
                          ) : (
                            <>
                              <ShieldAlert className="w-4 h-4 text-amber-600 stroke-[2px]" />
                              <span className="text-amber-800 font-semibold">
                                Sincronización inactiva: Completa el Paso 1 para conectar tu cuenta de Google.
                              </span>
                            </>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <a
                            href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-750 font-bold rounded-lg transition-colors text-[11px] cursor-pointer"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Abrir Live Sheet
                          </a>

                          <button
                            onClick={handleSyncAllOrdersClick}
                            disabled={!googleUser || isSyncing || orders.length === 0}
                            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-all text-[11px] cursor-pointer disabled:opacity-40"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                            {orders.filter(o => !o.synced).length > 0
                              ? `Sincronizar Pendientes (${orders.filter(o => !o.synced).length})`
                              : 'Todo Sincronizado ✨'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Sales KPIs Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-6">
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Ventas Totales</p>
                    <p className="text-xl md:text-2xl font-black text-slate-900 mt-1">{formatPrice(totalRevenue)}</p>
                    <p className="text-[10px] text-green-500 font-bold mt-1">Órdenes Activas</p>
                  </div>

                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Pedidos Totales</p>
                    <p className="text-xl md:text-2xl font-black text-slate-900 mt-1">{orders.length}</p>
                    <p className="text-[10px] text-slate-500 font-bold mt-1">Registrados en LocalStorage</p>
                  </div>

                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Ticket Promedio</p>
                    <p className="text-xl md:text-2xl font-black text-slate-900 mt-1">{formatPrice(averageTicket)}</p>
                    <p className="text-[10px] text-orange-500 font-bold mt-1">Por transacción</p>
                  </div>

                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Tasa de Entrega</p>
                    <p className="text-xl md:text-2xl font-black text-slate-900 mt-1">
                      {orders.length > 0 
                        ? `${Math.round((orders.filter(o => o.status === 'delivered').length / orders.length) * 100)}%`
                        : '0%'
                      }
                    </p>
                    <p className="text-[10px] text-blue-500 font-bold mt-1">
                      {orders.filter(o => o.status === 'delivered').length} de {orders.length} entregados
                    </p>
                  </div>
                </div>

                {/* Filters Row */}
                <div className="flex flex-col md:flex-row gap-3 mb-4">
                  <div className="flex-1">
                    <input
                      type="text"
                      placeholder="Buscar por nombre, celular, ID de orden..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border rounded-lg focus:ring-1 focus:ring-orange-500 outline-none text-slate-700 placeholder-slate-400 font-medium"
                    />
                  </div>

                  <div className="w-full md:w-48">
                    <select
                      value={statusFilter}
                      onChange={e => setStatusFilter(e.target.value)}
                      className="w-full text-xs px-3 py-2.5 bg-slate-50 border rounded-lg focus:ring-1 focus:ring-orange-500 outline-none text-slate-700 font-bold"
                    >
                      <option value="all">Todos los Estados ({orders.length})</option>
                      <option value="new">Nuevos</option>
                      <option value="confirmed">Confirmados</option>
                      <option value="shipped">Despachados</option>
                      <option value="delivered">Entregados</option>
                      <option value="cancelled">Cancelados</option>
                    </select>
                  </div>
                </div>

                {/* Orders Table rendering */}
                <div className="overflow-x-auto border rounded-xl">
                  {filteredOrders.length === 0 ? (
                    <div className="text-center py-10">
                      <p className="text-sm font-medium text-slate-400">No se encontraron pedidos guardados.</p>
                      <p className="text-xs text-slate-400/80 mt-1">Haz una compra de prueba en el formulario superior para verla aquí.</p>
                    </div>
                  ) : (
                    <table className="min-w-full divide-y divide-slate-100 text-left">
                      <thead className="bg-slate-50/70 text-slate-500 text-[10px] uppercase font-bold tracking-wider">
                        <tr>
                          <th className="px-4 py-3">ID Pedido / Fecha</th>
                          <th className="px-4 py-3">Cliente</th>
                          <th className="px-4 py-3">Dirección / Destino</th>
                          <th className="px-4 py-3">Detalle Oferta</th>
                          <th className="px-4 py-3">Total</th>
                          <th className="px-4 py-3">Estado</th>
                          <th className="px-4 py-3 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                        {filteredOrders.map((o) => (
                          <tr key={o.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                  {o.id}
                                </span>
                                {o.synced ? (
                                  <span className="text-[9px] font-black tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-150 px-1.5 py-0.5 rounded uppercase">
                                    Sheets 🟢
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-black tracking-wider text-amber-700 bg-amber-50 border border-amber-150 px-1.5 py-0.5 rounded uppercase" title="Guardado localmente. Se sincronizará automáticamente cuando conectes tu cuenta de Google en esta página.">
                                    Pendiente 🟡
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-400 mt-1">
                                {new Date(o.date).toLocaleString('es-CO', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </p>
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-extrabold text-slate-900 block leading-none">{o.clientName}</span>
                              {o.documentId && (
                                <p className="text-[10px] text-slate-500 font-bold block mt-0.5" title="Documento de Identidad">
                                  🆔 Doc: {o.documentId}
                                </p>
                              )}
                              <a
                                href={`https://api.whatsapp.com/send?phone=57${o.clientPhone}&text=Hola%20${encodeURIComponent(o.clientName)}!%20Te%20hablamos%20de%20la%20tienda%20para%20confirmar%20tu%20pedido%20de%20Anthelios`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-green-600 hover:underline font-bold mt-0.5 inline-block"
                              >
                                📞 +57 {o.clientPhone} (WhatsApp)
                              </a>
                              {o.clientEmail && (
                                <p className="text-[10px] text-slate-400 block mt-0.5 truncate max-w-xs">
                                  ✉️ {o.clientEmail}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3 max-w-xs">
                              <span className="font-medium text-slate-800 block text-xs truncate" title={o.address}>
                                {o.address}
                              </span>
                              {o.address2 && (
                                <span className="font-medium text-slate-500 block text-[10px] truncate" title={o.address2}>
                                  🏢 {o.address2}
                                </span>
                              )}
                              <span className="text-[10px] text-slate-400 font-bold block mt-0.5">
                                📍 {o.city} — {o.department}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-bold text-slate-800">{o.offerName}</span>
                              <p className="text-[10px] text-slate-500">Unidades: {o.quantity}</p>
                              {o.paymentMethod && (
                                <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded mt-1 ${
                                  o.paymentMethod.includes('Contra') 
                                    ? 'bg-orange-50 text-orange-600 border border-orange-100'
                                    : 'bg-blue-50 text-blue-600 border border-blue-100'
                                }`}>
                                  {o.paymentMethod}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 font-black text-slate-950 whitespace-nowrap">
                              {formatPrice(o.totalPrice)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <select
                                value={o.status}
                                onChange={e => handleUpdateStatus(o.id, e.target.value as Order['status'])}
                                className={`text-[10px] font-bold px-2.5 py-1 rounded-full border bg-white focus:outline-none outline-none ${
                                  o.status === 'new' ? 'text-blue-600 border-blue-200 bg-blue-50' :
                                  o.status === 'confirmed' ? 'text-amber-600 border-amber-200 bg-amber-50' :
                                  o.status === 'shipped' ? 'text-indigo-600 border-indigo-200 bg-indigo-50' :
                                  o.status === 'delivered' ? 'text-green-600 border-green-200 bg-green-50' :
                                  'text-red-600 border-red-200 bg-red-50'
                                }`}
                              >
                                <option value="new">Nuevo ⏳</option>
                                <option value="confirmed">Confirmado ✅</option>
                                <option value="shipped">Despachado 🚚</option>
                                <option value="delivered">Entregado 🎉</option>
                                <option value="cancelled">Cancelado ❌</option>
                              </select>
                            </td>
                            <td className="px-4 py-3 text-right whitespace-nowrap">
                              <button
                                onClick={() => handleDeleteOrder(o.id)}
                                className="p-1 px-2 text-red-500 hover:text-red-700 bg-red-50 rounded-md hover:bg-red-100 transition-colors cursor-pointer inline-flex items-center"
                                title="Eliminar registro"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
