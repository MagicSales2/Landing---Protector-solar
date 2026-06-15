/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';
import { Order } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Fail-safe initialization: only create client if keys exist
export const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

/**
 * Saves an order directly to Supabase if credentials are provided in .env.
 * Falls back to locally resolved status.
 */
export async function saveOrderToSupabase(order: Order): Promise<boolean> {
  if (!supabase) {
    console.warn("⚠️ Supabase credentials are not configured in your environment variables. Order was saved locally in LocalStorage.");
    return false;
  }

  try {
    const { error } = await supabase
      .from('pedidos')
      .insert([
        {
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
          created_at: order.date
        }
      ]);

    if (error) {
      console.error("❌ Error putting order into Supabase table:", error.message);
      return false;
    }

    console.log("🚀 Order successfully replicated to Supabase in real-time!");
    return true;
  } catch (err) {
    console.error("❌ Network or Exception error inserting order into Supabase:", err);
    return false;
  }
}

/**
 * Pulls all orders from Supabase (for the OrderDashboard.tsx admin panel).
 */
export async function getOrdersFromSupabase(): Promise<Order[] | null> {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('pedidos')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error("❌ Error fetching orders from Supabase:", error.message);
      return null;
    }

    // Map database snake_case fields back to front-end camelCase interface
    return (data || []).map((row: any) => ({
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
      paymentMethod: row.payment_method
    }));
  } catch (err) {
    console.error("❌ Exception fetching orders from Supabase:", err);
    return null;
  }
}

/**
 * Updates an order status in Supabase (from the OrderDashboard.tsx admin panel)
 */
export async function updateOrderStatusInSupabase(orderId: string, status: string): Promise<boolean> {
  if (!supabase) return false;

  try {
    const { error } = await supabase
      .from('pedidos')
      .update({ status })
      .eq('id', orderId);

    if (error) {
      console.error("❌ Error updating order status in Supabase:", error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error("❌ Exception updating order status in Supabase:", err);
    return false;
  }
}

/**
 * Deletes an order from Supabase (from the OrderDashboard.tsx admin panel)
 */
export async function deleteOrderFromSupabase(orderId: string): Promise<boolean> {
  if (!supabase) return false;

  try {
    const { error } = await supabase
      .from('pedidos')
      .delete()
      .eq('id', orderId);

    if (error) {
      console.error("❌ Error deleting order from Supabase:", error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error("❌ Exception deleting order from Supabase:", err);
    return false;
  }
}

