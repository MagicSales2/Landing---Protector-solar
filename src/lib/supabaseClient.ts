/// <reference types="vite/client" />
import { createClient, SupabaseClient, AuthSession } from '@supabase/supabase-js';
import { Order, OrderOffer } from '../types';

// URL y clave pública del proyecto. Son datos públicos por diseño: la clave
// anónima solo permite crear pedidos y leer lo público. El build de GitHub las
// inyecta por variables; el respaldo de abajo garantiza que CUALQUIER otro
// build (local o el del VPS) quede funcionando igual.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://drzbxmajsbkdkydsbjzj.supabase.co';
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRyemJ4bWFqc2JrZGt5ZHNianpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1OTczMTEsImV4cCI6MjEwNjE3MzMxMX0.N4w10n8DISA94g0SUe0ZjXLQwxdLnNIU56ZCZp22pYc';

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
  paymentMethod: 'Contra Entrega' | 'Wompi';
  website?: string; // trampa para robots
};

export type PedidoCreado = {
  ok: boolean;
  orderId: string;
  numero?: number;
  total?: number;
  // Wompi: el link único de pago creado para este pedido (si se pudo crear).
  initPoint?: string | null;
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

// ─── Confirmación de pagos (Wompi) ─────────────────────
// El pago online lo confirma Wompi por webhook (confirmar-pago-wompi), que
// manda la venta a Kommo. Desde el navegador solo:
//   - se consulta el estado del pedido (página de gracias, para esperar la
//     confirmación sin recargar)
//   - se confirma a mano un pago (botón del panel de administrador)

export type ResultadoConfirmacion = {
  ok?: boolean;
  error?: string;
  orderId?: string;
  estado?: string;
  total?: number;
  cantidad?: number;
  cliente?: string;
};

export async function consultarPago(orderId: string, verificar = false): Promise<ResultadoConfirmacion> {
  if (!supabase) return { ok: false, error: 'Sin conexión' };
  try {
    // verificar=1 hace que el servidor pregunte a Wompi y confirme el pago si
    // allí ya está APPROVED (por si el webhook no llegó a tiempo).
    const url = `${supabaseUrl}/functions/v1/confirmar-pago-wompi?pedido=${encodeURIComponent(orderId)}${verificar ? '&verificar=1' : ''}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` },
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: 'No se pudo consultar el pago' };
    return data as ResultadoConfirmacion;
  } catch {
    return { ok: false, error: 'No se pudo consultar el pago' };
  }
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
    .select('id, nombre, cantidad, precio, activo')
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

// Cambia el estado desde el panel y, si el estado es "shipped", mueve también
// la venta en Kommo a la etapa "Enviado" (dispara el WhatsApp con la guía).
// Devuelve { ok, error?, kommoMovido?, kommoMensaje?, cancelacionGuia? }.
export async function actualizarEstadoPedido(
  orderId: string,
  status: string,
): Promise<{ ok: boolean; error?: string; kommoMovido?: boolean; kommoMensaje?: string; cancelacionGuia?: string }> {
  if (!supabase) return { ok: false, error: 'Sin conexión con la base de datos.' };
  const { data, error } = await supabase.functions.invoke('actualizar-estado', { body: { orderId, status } });
  if (error || !data?.ok) {
    let mensaje = 'No se pudo actualizar el estado.';
    try {
      const detalle = (error as any)?.context ? await (error as any).context.json() : data;
      if (detalle?.error) mensaje = detalle.error;
    } catch { /* sin más detalle */ }
    console.error('Error en actualizar-estado:', mensaje);
    return { ok: false, error: mensaje };
  }
  return data;
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

// Reintenta solo las acciones que faltaron (subir a Kommo y/o crear la guía).
// Devuelve { ok, kommo?, guia? } con cada resultado posible.
export async function reintentarSync(
  orderId: string,
  accion: 'kommo' | 'guia' | 'todo',
): Promise<{ ok: boolean; error?: string; kommo?: { estado?: string; detalle?: string }; guia?: { estado?: string; detalle?: string } }> {
  if (!supabase) return { ok: false, error: 'Sin conexión con la base de datos.' };
  const { data, error } = await supabase.functions.invoke('reintentar-sync', { body: { orderId, accion } });
  if (error || !data?.ok) {
    let mensaje = 'No se pudo reintentar.';
    try {
      const detalle = (error as any)?.context ? await (error as any).context.json() : data;
      if (detalle?.error) mensaje = detalle.error;
    } catch { /* sin más detalle */ }
    console.error('Error en reintentar-sync:', mensaje);
    return { ok: false, error: mensaje };
  }
  return data;
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
    guiaLink: row.guia_link || undefined,
    guiaNumero: row.guia_numero || undefined,
    guiaCarrier: row.guia_carrier || undefined,
    guiaEstado: row.guia_estado || undefined,
    guiaError: row.guia_error || undefined,
  };
}

export const isSupabaseConfigured = () => !!supabase;
