/// <reference types="vite/client" />
import { createClient, SupabaseClient, AuthSession } from '@supabase/supabase-js';
import { Order } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabase: SupabaseClient | null = null;
let currentSession: AuthSession | null = null;

// Initialize only if credentials exist
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

// ─── Orders CRUD ──────────────────────────────────────

export async function saveOrderToSupabase(order: Order): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('pedidos').insert([{
    id: order.id,
    client_name: order.clientName,
    client_phone: order.clientPhone,
    client_email: order.clientEmail || '',
    document_id: order.documentId || '',
    department: order.department,
    city: order.city,
    address: order.address,
    address2: order.address2 || '',
    notes: order.notes,
    offer_id: order.offerId,
    offer_name: order.offerName,
    total_price: order.totalPrice,
    quantity: order.quantity,
    status: order.status,
    payment_method: order.paymentMethod || 'Contra Entrega',
    created_at: order.date,
  }]);
  if (error) {
    console.error('Error guardando pedido en Supabase:', error.message);
    return false;
  }
  return true;
}

export async function getOrdersFromSupabase(): Promise<Order[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('pedidos')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Error fetching orders from Supabase:', error.message);
    return null;
  }
  return (data || []).map(mapRowToOrder);
}

export async function updateOrderStatusInSupabase(orderId: string, status: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('pedidos').update({ status }).eq('id', orderId);
  if (error) {
    console.error('Error actualizando estado en Supabase:', error.message);
    return false;
  }
  return true;
}

export async function deleteOrderFromSupabase(orderId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('pedidos').delete().eq('id', orderId);
  if (error) {
    console.error('Error eliminando pedido de Supabase:', error.message);
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
    synced: true,
    paymentMethod: row.payment_method,
  };
}

export const isSupabaseConfigured = () => !!supabase;
