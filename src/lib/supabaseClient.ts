/// <reference types="vite/client" />
import { createClient, SupabaseClient, AuthSession } from '@supabase/supabase-js';
import { Order, OrderOffer } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabase: SupabaseClient | null = null;
let currentSession: AuthSession | null = null;

// El cliente solo se crea si hay credenciales configuradas en el build.
if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      storageKey: 'anthelios_admin_session',
      autoRefreshToken: true,
    },
  });
}

// ─── Admin Auth ───────────────────────────────────────

export const getSession = () => currentSession;
export const isAdmin = () => !!currentSession?.user;

export async function signInAdmin(email: string, password: string) {
  if (!supabase) throw new Error('Supabase no configurado');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  currentSession = data.session;
  return data.user;
}

export async function signOutAdmin() {
  if (!supabase) return;
  await supabase.auth.signOut();
  currentSession = null;
}

// Restore session on page load
export async function restoreSession() {
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  currentSession = data.session;
}

// ─── Pedidos ──────────────────────────────────────────
// Los pedidos los crea la función del servidor (no el navegador), que valida
// los datos, calcula el precio real y lo manda a Kommo.

export type NuevoPedido = {
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  documentId: string;
  department: string;
  city: string;
  address: string;
  address2?: string;
  notes?: string;
  offerId: string;
  paymentMethod: 'Contra Entrega' | 'Mercado Pago';
  website?: string; // trampa para robots
};

export type PedidoCreado = {
  ok: boolean;
  orderId: string;
  numero?: number;
  total?: number;
  // Mercado Pago: el link único creado para este pedido (si se pudo crear).
  initPoint?: string | null;
  // Mercado Pago: link fijo de repuesto (si no alcanzó a crearse el único).
  mercadopagoUrl?: string;
};

export async function createOrder(datos: NuevoPedido): Promise<PedidoCreado> {
  if (!supabase) {
    throw new Error('La página todavía no tiene configurado el servidor de pedidos.');
  }

  const { data, error } = await supabase.functions.invoke<PedidoCreado>('crear-pedido', {
    body: {
      ...datos,
      utm: leerUtm(),
      referrer: document.referrer || undefined,
      userAgent: navigator.userAgent,
    },
  });

  if (error) {
    // El mensaje exacto lo pone la función del servidor (ej: "Datos incompletos")
    let mensaje = 'No pudimos registrar tu pedido. Intenta de nuevo.';
    try {
      const cuerpo = await (error as { context?: Response }).context?.json();
      if (cuerpo?.error) mensaje = cuerpo.error;
    } catch {
      /* se queda el mensaje genérico */
    }
    throw new Error(mensaje);
  }

  if (!data) throw new Error('No pudimos registrar tu pedido. Intenta de nuevo.');
  return data;
}

// De qué anuncio/clic llegó el cliente (para saber qué publicidad vende)
export function leerUtm(): Record<string, string> {
  const params = new URLSearchParams(window.location.search);
  const utm: Record<string, string> = {};
  for (const clave of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'fbclid']) {
    const valor = params.get(clave);
    if (valor) utm[clave] = valor.slice(0, 200);
  }
  return utm;
}

// ─── Confirmación de pagos de Mercado Pago ──────────────
// "confirmar-pago" es la función del servidor que verifica el pago real
// (webhook/notificación) y manda la venta a Kommo. Aquí solo la invocamos
// en dos casos: la página de gracias (pago recién hecho) y el botón
// "Confirmar pago" del panel de administrador.

export type ResultadoConfirmacion = {
  ok?: boolean;
  error?: string;
  orderId?: string;
  estado?: string;
  total?: number;
  cantidad?: number;
  cliente?: string;
};

export async function confirmarPagoPorPagoId(paymentId: string | number): Promise<ResultadoConfirmacion> {
  if (!supabase) return { ok: false, error: 'Sin conexión' };
  const { data, error } = await supabase.functions.invoke<ResultadoConfirmacion>('confirmar-pago', {
    body: { paymentId: Number(paymentId) },
  });
  if (error || !data) return { ok: false, error: 'No se pudo confirmar el pago' };
  return data;
}

export async function confirmarPedidoManual(orderId: string): Promise<ResultadoConfirmacion> {
  if (!supabase) return { ok: false, error: 'Sin conexión' };
  const { data, error } = await supabase.functions.invoke<ResultadoConfirmacion>('confirmar-pago', {
    body: { orderId },
  });
  if (error || !data) return { ok: false, error: 'No se pudo confirmar el pedido' };
  return data;
}

// ─── Catálogo de ofertas (precios) ────────────────────

export async function getOfertas(): Promise<OrderOffer[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('ofertas')
    .select('id, nombre, cantidad, precio, mercadopago_url, activo')
    .eq('activo', true)
    .order('cantidad', { ascending: true });
  if (error || !data || data.length === 0) return null;

  // Precio de una unidad = referencia para calcular el ahorro de cada promoción.
  const precioUnitario = Number(data[0].precio);
  const money = (n: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

  return data.map((o, i) => {
    const cantidad = Number(o.cantidad);
    const precio = Number(o.precio);
    const ahorro = Math.max(precioUnitario * cantidad - precio, 0);
    const porcentaje = ahorro > 0 ? Math.round((ahorro / (precioUnitario * cantidad)) * 100) : 0;

    return {
      id: o.id,
      name: o.nombre,
      subtitle: ahorro > 0 ? `¡Ahorras ${money(ahorro)} (${porcentaje}% Descuento)!` : '',
      price: precio,
      savings: ahorro,
      // La segunda oferta (2 unidades) es la recomendada, como en el diseño original.
      isPopular: i === 1,
      quantity: cantidad,
      mercadopagoUrl: o.mercadopago_url || '',
    };
  });
}

// ─── Lectura y gestión de pedidos (solo administradores) ───

export async function getOrdersFromSupabase(): Promise<Order[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('pedidos')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Error leyendo pedidos:', error.message);
    return null;
  }
  return (data || []).map(mapRowToOrder);
}

export async function updateOrderStatusInSupabase(orderId: string, status: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('pedidos').update({ status }).eq('id', orderId);
  if (error) {
    console.error('Error actualizando estado:', error.message);
    return false;
  }
  return true;
}

export async function deleteOrderFromSupabase(orderId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('pedidos').delete().eq('id', orderId);
  if (error) {
    console.error('Error eliminando pedido:', error.message);
    return false;
  }
  return true;
}

// ─── Helpers ──────────────────────────────────────────

function mapRowToOrder(row: any): Order {
  return {
    id: row.id,
    clientName: row.client_name,
    clientPhone: row.client_phone,
    clientEmail: row.client_email,
    documentId: row.document_id,
    department: row.department,
    city: row.city,
    address: row.address,
    address2: row.address2,
    notes: row.notes,
    offerId: row.offer_id,
    offerName: row.offer_name,
    totalPrice: Number(row.total_price),
    quantity: Number(row.quantity),
    status: row.status,
    date: row.created_at,
    synced: row.kommo_estado === 'enviado' || row.kommo_estado === 'enviado_con_aviso',
    paymentMethod: row.payment_method,
  };
}

export const isSupabaseConfigured = () => !!supabase;
