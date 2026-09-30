import React, { useState, useEffect } from 'react';
import { Trash2, Award, RefreshCw, XCircle, LogOut, Check, ExternalLink } from 'lucide-react';
import { Order } from '../types';
import {
  getOrdersFromSupabase,
  updateOrderStatusInSupabase,
  actualizarEstadoPedido,
  deleteOrderFromSupabase,
  signInAdmin,
  signOutAdmin,
  isAdmin,
  getSession,
  restoreSession,
  isSupabaseConfigured,
  confirmarPedidoManual,
  reintentarSync
} from '../lib/supabaseClient';

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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [dbStatus, setDbStatus] = useState<'checking' | 'configured' | 'missing'>('checking');

  // Check Supabase config and restore session on mount
  useEffect(() => {
    restoreSession().then(() => {
      setDbStatus(isSupabaseConfigured() ? 'configured' : 'missing');
    });
  }, []);

  // Fetch orders
  const loadOrders = async () => {
    const dbOrders = await getOrdersFromSupabase();
    setOrders(dbOrders ?? []);
  };

  useEffect(() => {
    if (isOpen) {
      loadOrders();
    }
  }, [isOpen, ordersUpdatedToggle]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');

    try {
      await signInAdmin(email, password);
      setEmail('');
      setPassword('');
    } catch (err: any) {
      setLoginError(err.message || 'Error al iniciar sesión. Verifica tus credenciales.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await signOutAdmin();
  };

  const handleUpdateStatus = async (id: string, newStatus: Order['status']) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: newStatus } : o));
    const res = await actualizarEstadoPedido(id, newStatus);
    if (!res.ok) {
      // Respaldo: si la función falla, al menos se guarda el estado directo.
      await updateOrderStatusInSupabase(id, newStatus);
      alert(res.error || 'No se pudo actualizar el estado.');
    } else if (newStatus === 'shipped') {
      if (res.kommoMovido) {
        mostrarAviso(`Pedido ${id} despachado. Venta movida a "Enviado" en Kommo → se enviará el WhatsApp con la guía.`, 'ok');
      } else if (res.kommoMensaje) {
        alert(res.kommoMensaje.replace(/<[^>]+>/g, ''));
      }
    } else if (newStatus === 'cancelled' && res.cancelacionGuia) {
      mostrarAviso(res.cancelacionGuia.replace(/<[^>]+>/g, ''), res.cancelacionGuia.startsWith('✅') ? 'ok' : 'info');
    }
  };

  const handleDeleteOrder = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este pedido?')) return;
    setOrders(prev => prev.filter(o => o.id !== id));
    await deleteOrderFromSupabase(id);
    onOrderDelete();
  };

  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [reintentando, setReintentando] = useState<string | null>(null);

  const [aviso, setAviso] = useState<{ texto: string; tipo: 'ok' | 'info' } | null>(null);

  const mostrarAviso = (texto: string, tipo: 'ok' | 'info' = 'ok') => {
    setAviso({ texto, tipo });
    window.setTimeout(() => setAviso(null), 8000);
  };

  // Confirma a mano un pedido pagado en línea (cuando la plata ya llegó pero
  // el webhook de Wompi no pudo registrarlo). Recién ahí manda la venta a Kommo.
  const handleConfirmarPago = async (id: string) => {
    if (!confirm('¿Confirmas que este pedido YA fue pagado por Wompi?')) return;
    setConfirmando(id);
    try {
      const res = await confirmarPedidoManual(id);
      if (!res.ok) {
        alert(res.error || 'No se pudo confirmar el pedido.');
      } else {
        alert(`Pago confirmado. Pedido ${res.orderId} enviado a Kommo.`);
      }
    } catch {
      alert('No se pudo confirmar el pedido. Intenta de nuevo.');
    } finally {
      setConfirmando(null);
      await loadOrders();
      onOrderDelete();
    }
  };

  // Reintenta una acción que falló (subir a Kommo o crear la guía). Vuelve a
  // intentar solo lo que falta y muestra qué pasó con cada parte.
  const handleReintentar = async (id: string, accion: 'kommo' | 'guia') => {
    setReintentando(`${id}:${accion}`);
    try {
      const res = await reintentarSync(id, accion);
      if (!res.ok) {
        alert(res.error || 'No se pudo reintentar.');
      } else {
        const resumen = [
          res.kommo ? `Kommo: ${res.kommo.detalle}` : '',
          res.guia ? `Guía: ${res.guia.detalle}` : '',
        ]
          .filter(Boolean)
          .join('\n');
        mostrarAviso(`Pedido ${id} · ${resumen.replace(/\n/g, ' — ')}`, resumen.includes('error') ? 'info' : 'ok');
      }
    } catch {
      alert('No se pudo conectar para reintentar.');
    } finally {
      setReintentando(null);
      await loadOrders();
    }
  };

  const filteredOrders = orders.filter(o => {
    const q = search.toLowerCase();
    const matchesSearch = o.clientName.toLowerCase().includes(q) ||
      o.clientPhone.includes(q) ||
      o.id.toLowerCase().includes(q) ||
      o.city.toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalRevenue = orders
    .filter(o => o.status !== 'cancelled')
    .reduce((acc, curr) => acc + curr.totalPrice, 0);

  const activeOrders = orders.filter(o => o.status !== 'cancelled').length;
  const averageTicket = activeOrders > 0 ? totalRevenue / activeOrders : 0;

  const formatPrice = (p: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(p);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-55 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto font-sans text-slate-800">
      <div className="bg-white rounded-3xl w-full max-w-6xl shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto p-6 md:p-8 relative animate-slideUp">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 bg-slate-100 p-2 rounded-full cursor-pointer transition-colors"
          title="Cerrar modal"
        >
          <XCircle className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center justify-center text-center mb-6">
          <p className="text-xs text-orange-600 font-bold uppercase tracking-widest font-mono">Área de Administración</p>
          <h3 className="text-xl font-black text-slate-900">Panel de Pedidos</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md">
            {dbStatus === 'missing'
              ? '⚠️ Falta la conexión con la base de datos. Avísame para revisarlo.'
              : 'Gestión de pedidos en tiempo real. Cada pedido entra solo a Kommo.'}
          </p>
        </div>

        {!isAdmin() ? (
          <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200 max-w-sm mx-auto">
            <form onSubmit={handleLogin} className="text-center py-4">
              <p className="text-xs text-slate-500 font-medium mb-4">
                Inicia sesión con tu cuenta de administrador para ver los pedidos.
              </p>
              <input
                required
                type="email"
                placeholder="Correo electrónico"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full text-sm px-3 py-2.5 bg-white border rounded-lg focus:ring-1 focus:ring-orange-500 focus:outline-none text-center mb-2"
              />
              <input
                required
                type="password"
                placeholder="Contraseña"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full text-sm px-3 py-2.5 bg-white border rounded-lg focus:ring-1 focus:ring-orange-500 focus:outline-none text-center mb-2"
              />
              {loginError && <p className="text-xs text-red-500 font-bold mb-3">{loginError}</p>}
              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold py-2.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                {isLoggingIn ? 'Iniciando sesión...' : 'Acceder'}
              </button>
              {dbStatus === 'missing' && (
                <p className="text-[10px] text-amber-600 font-bold mt-3">
                  La página se publicó sin la conexión a la base de datos
                </p>
              )}
            </form>
          </div>
        ) : (
          <div>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between pb-6 border-b border-slate-100 gap-4">
              <div>
                <h4 className="font-extrabold text-slate-900 text-lg flex items-center gap-1.5">
                  <Award className="w-5 h-5 text-orange-500" />
                  Dashboard de Ventas
                </h4>
                <p className="text-xs text-slate-500">Métricas acumuladas de pedidos.</p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={loadOrders}
                  className="flex items-center justify-center p-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer min-h-[38px] text-slate-600"
                  title="Refrescar"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>

                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 border border-red-200 font-bold rounded-lg text-xs transition-colors cursor-pointer min-h-[38px] hover:bg-red-100"
                >
                  <LogOut className="w-4 h-4" />
                  Cerrar Sesión
                </button>
              </div>
            </div>

            {aviso && (
              <div className={`mt-4 px-4 py-3 rounded-lg border text-xs font-bold ${
                aviso.tipo === 'ok'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-blue-50 text-blue-700 border-blue-200'
              }`}>
                {aviso.texto}
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-6">
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Ventas Totales</p>
                <p className="text-xl md:text-2xl font-black text-slate-900 mt-1">{formatPrice(totalRevenue)}</p>
                <p className="text-[10px] text-green-500 font-bold mt-1">Órdenes Activas: {activeOrders}</p>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Pedidos</p>
                <p className="text-xl md:text-2xl font-black text-slate-900 mt-1">{orders.length}</p>
                <p className="text-[10px] text-slate-500 font-bold mt-1">Totales registrados</p>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Ticket Promedio</p>
                <p className="text-xl md:text-2xl font-black text-slate-900 mt-1">{formatPrice(averageTicket)}</p>
                <p className="text-[10px] text-orange-500 font-bold mt-1">Por transacción</p>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Entregados</p>
                <p className="text-xl md:text-2xl font-black text-slate-900 mt-1">
                  {orders.length > 0
                    ? `${Math.round((orders.filter(o => o.status === 'delivered').length / orders.length) * 100)}%`
                    : '0%'}
                </p>
                <p className="text-[10px] text-blue-500 font-bold mt-1">
                  {orders.filter(o => o.status === 'delivered').length} de {orders.length}
                </p>
              </div>
            </div>

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
                  <option value="all">Todos ({orders.length})</option>
                  <option value="new">Nuevos</option>
                  <option value="pendiente_pago">Pendiente de pago</option>
                  <option value="pagado">Pagados</option>
                  <option value="confirmed">Confirmados</option>
                  <option value="shipped">Despachados</option>
                  <option value="delivered">Entregados</option>
                  <option value="cancelled">Cancelados</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto border rounded-xl">
              {filteredOrders.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-sm font-medium text-slate-400">No se encontraron pedidos.</p>
                  <p className="text-xs text-slate-400/80 mt-1">Realiza una compra de prueba para verla aquí.</p>
                </div>
              ) : (
                <table className="min-w-full divide-y divide-slate-100 text-left">
                  <thead className="bg-slate-50/70 text-slate-500 text-[10px] uppercase font-bold tracking-wider">
                    <tr>
                      <th className="px-4 py-3">ID / Fecha</th>
                      <th className="px-4 py-3">Cliente</th>
                      <th className="px-4 py-3">Dirección</th>
                      <th className="px-4 py-3">Oferta</th>
                      <th className="px-4 py-3">Total</th>
                      <th className="px-4 py-3">Guía</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                    {filteredOrders.map(o => (
                      <tr key={o.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                            {o.id}
                          </span>
                          <p className="text-[10px] text-slate-400 mt-1">
                            {new Date(o.date).toLocaleString('es-CO', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <span
                            className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded mt-1 border ${
                              o.synced
                                ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                : 'bg-red-50 text-red-500 border-red-100'
                            }`}
                            title={o.synced ? 'Este pedido ya está en Kommo' : 'El pedido se guardó aquí pero NO entró a Kommo. Revisa el error en la tabla pedidos.'}
                          >
                            {o.synced ? 'En Kommo' : 'No llegó a Kommo'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-extrabold text-slate-900 block leading-none">{o.clientName}</span>
                          {o.documentId && (
                            <p className="text-[10px] text-slate-500 font-bold mt-0.5">Doc: {o.documentId}</p>
                          )}
                          <a
                            href={`https://api.whatsapp.com/send?phone=57${o.clientPhone}&text=Hola%20${encodeURIComponent(o.clientName)}!%20Te%20hablamos%20de%20la%20tienda%20para%20confirmar%20tu%20pedido%20de%20Anthelios`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-green-600 hover:underline font-bold mt-0.5 inline-block"
                          >
                            +57 {o.clientPhone} (WhatsApp)
                          </a>
                          {o.clientEmail && (
                            <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-xs">{o.clientEmail}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 max-w-xs">
                          <span className="font-medium text-slate-800 block text-xs truncate" title={o.address}>
                            {o.address}
                          </span>
                          {o.address2 && (
                            <span className="font-medium text-slate-500 block text-[10px]">{o.address2}</span>
                          )}
                          <span className="text-[10px] text-slate-400 font-bold block mt-0.5">
                            {o.city} — {o.department}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-bold text-slate-800">{o.offerName}</span>
                          <p className="text-[10px] text-slate-500">Cant: {o.quantity}</p>
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
                          {o.guiaLink ? (
                            <a
                              href={o.guiaLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 hover:text-emerald-800 border border-emerald-200 bg-emerald-50 px-2 py-1 rounded-md"
                              title={`Abrir seguimiento de la guía ${o.guiaNumero ?? ''}`}
                            >
                              <ExternalLink className="w-3 h-3" />
                              {o.guiaNumero || 'Seguimiento'}
                            </a>
                          ) : (
                            <span
                              className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                                o.guiaEstado === 'error'
                                  ? 'bg-red-50 text-red-500 border-red-100'
                                  : o.guiaEstado === 'cancelada'
                                    ? 'bg-slate-50 text-slate-400 border-slate-200'
                                    : 'bg-slate-100 text-slate-400 border-slate-200'
                              }`}
                              title={o.guiaError || `Estado de la guía: ${o.guiaEstado ?? 'sin guía'}`}
                            >
                              {o.guiaEstado === 'error' ? 'Error en guía' : o.guiaEstado === 'cancelada' ? 'Guía cancelada' : 'Sin guía'}
                            </span>
                          )}
                          {o.guiaCarrier && (
                            <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[140px]" title={o.guiaCarrier}>
                              {o.guiaCarrier}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <select
                            value={o.status}
                            onChange={e => handleUpdateStatus(o.id, e.target.value as Order['status'])}
                            title="Cambiar estado. Elegir 'Despachado' mueve la venta a la etapa 'Enviado' en Kommo y envía al cliente el WhatsApp con la guía."
                            className={`text-[10px] font-bold px-2.5 py-1 rounded-full border bg-white focus:outline-none outline-none ${
                              o.status === 'new' ? 'text-blue-600 border-blue-200 bg-blue-50' :
                              o.status === 'pendiente_pago' ? 'text-orange-600 border-orange-200 bg-orange-50' :
                              o.status === 'pagado' ? 'text-blue-600 border-blue-200 bg-blue-50' :
                              o.status === 'confirmed' ? 'text-amber-600 border-amber-200 bg-amber-50' :
                              o.status === 'shipped' ? 'text-indigo-600 border-indigo-200 bg-indigo-50' :
                              o.status === 'delivered' ? 'text-green-600 border-green-200 bg-green-50' :
                              'text-red-600 border-red-200 bg-red-50'
                            }`}
                          >
                            <option value="new">Nuevo</option>
                            <option value="pendiente_pago">Pendiente de pago</option>
                            <option value="pagado">Pagado</option>
                            <option value="confirmed">Confirmado</option>
                            <option value="shipped">Despachado</option>
                            <option value="delivered">Entregado</option>
                            <option value="cancelled">Cancelado</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {o.paymentMethod && !o.paymentMethod.includes('Contra') && o.status === 'pendiente_pago' && (
                            <button
                              onClick={() => handleConfirmarPago(o.id)}
                              disabled={confirmando === o.id}
                              className="p-1 px-2 text-emerald-700 bg-emerald-50 rounded-md hover:bg-emerald-100 transition-colors cursor-pointer inline-flex items-center font-bold mr-2 disabled:opacity-50"
                              title="Marcar como pagado y enviar a Kommo"
                            >
                              {confirmando === o.id ? 'Confirmando...' : 'Confirmar pago'}
                            </button>
                          )}
                          {!o.synced && (
                            <button
                              onClick={() => handleReintentar(o.id, 'kommo')}
                              disabled={reintentando === `${o.id}:kommo`}
                              className="p-1 px-2 text-amber-700 bg-amber-50 rounded-md hover:bg-amber-100 transition-colors cursor-pointer inline-flex items-center font-bold mr-2 disabled:opacity-50"
                              title="La venta no llegó a Kommo. Vuelve a intentar subirla."
                            >
                              {reintentando === `${o.id}:kommo` ? 'Subiendo...' : '↻ Subir a Kommo'}
                            </button>
                          )}
                          {(!o.guiaLink || o.guiaEstado === 'error') && o.guiaEstado !== 'cancelada' && (
                            <button
                              onClick={() => handleReintentar(o.id, 'guia')}
                              disabled={reintentando === `${o.id}:guia`}
                              className="p-1 px-2 text-sky-700 bg-sky-50 rounded-md hover:bg-sky-100 transition-colors cursor-pointer inline-flex items-center font-bold mr-2 disabled:opacity-50"
                              title="La guía no se pudo crear (por ejemplo, faltaba saldo en Envia.com). Vuelve a intentarlo."
                            >
                              {reintentando === `${o.id}:guia` ? 'Creando...' : '↻ Crear guía'}
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteOrder(o.id)}
                            className="p-1 px-2 text-red-500 hover:text-red-700 bg-red-50 rounded-md hover:bg-red-100 transition-colors cursor-pointer inline-flex items-center"
                            title="Eliminar"
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
    </div>
  );
}
