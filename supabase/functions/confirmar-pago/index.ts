// ============================================================================
//  FUNCIÓN: confirmar-pago
//  Confirma un pedido de Mercado Pago y recién ahí lo manda a Kommo como
//  venta (etapa "Mercado Pago").
//
//  Se llama de 2 formas:
//    1) Automática (webhook o página de gracias):
//       { "paymentId": 123456 } → se pregunta a Mercado Pago si ese pago
//       fue aprobado y, si sí, se confirma el pedido que viene ligado
//       (external_reference = código del pedido).
//    2) Manual (panel de administrador):
//       { "orderId": "PED-..." } con sesión de administrador → confirma
//       un pedido que quedó pendiente (por ejemplo, si pagó por el link fijo
//       y no se pudo detectar solo).
//
//  Nota: el trabajo pesado (mover lead, guía, Telegram, Sheets) vive en
//  _shared/confirmarVenta.ts, que también usa confirmar-pago-wompi.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { confirmarVenta, json } from '../_shared/confirmarVenta.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Pregunta a Mercado Pago si un pago fue realmente aprobado.
async function verificarPagoMP(token: string, paymentId: number) {
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const cuerpo = await res.json()
  if (!res.ok) {
    throw new Error(`Mercado Pago ${res.status}: ${String(cuerpo?.message ?? JSON.stringify(cuerpo)).slice(0, 200)}`)
  }
  return cuerpo
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  const kommoToken = Deno.env.get('KOMMO_TOKEN')
  if (!kommoToken) {
    return json({ error: 'La función no está configurada todavía' }, 500)
  }

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  let cuerpo: any
  try {
    cuerpo = await req.json()
  } catch {
    return json({ error: 'No se pudo leer la solicitud' }, 400)
  }

  // ── Ruta automática: viene un id de pago de Mercado Pago ──────────────
  const paymentId = Number(cuerpo?.data?.id ?? cuerpo?.paymentId ?? NaN)
  if (Number.isFinite(paymentId) && paymentId > 0) {
    const mpToken = Deno.env.get('MP_TOKEN')
    if (!mpToken) {
      console.error('Falta el secreto MP_TOKEN en la configuración de la función')
      return json({ ok: false, estado: 'error_config' }, 500)
    }
    try {
      const pago = await verificarPagoMP(mpToken, paymentId)
      if (pago.status !== 'approved') {
        // Aprobación pendiente, proceso (PSE/Efecty) o rechazado: no es venta.
        return json({ ok: false, estado: pago.status ?? 'desconocido' })
      }
      const orderId = String(pago.external_reference ?? '').trim()
      const { data: fila, error } = await sb
        .from('pedidos')
        .select('*')
        .eq('id', orderId)
        .eq('payment_method', 'Mercado Pago')
        .maybeSingle()
      if (error || !fila) {
        console.warn(`Pago ${paymentId} aprobado pero sin pedido ligado (external_reference=${orderId || 'vacío'})`)
        return json({ ok: false, estado: 'sin_pedido' })
      }
      return await confirmarVenta(sb, kommoToken, fila, 'mercadopago')
    } catch (err) {
      const motivo = err instanceof Error ? err.message : String(err)
      console.error('No se pudo verificar el pago:', motivo)
      return json({ error: 'No se pudo verificar el pago' }, 502)
    }
  }

  // ── Ruta manual: confirmar un pedido desde el panel (solo administrador)
  const orderId = String(cuerpo?.orderId ?? '').trim()
  if (orderId) {
    const auth = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
    if (!auth) return json({ error: 'No autorizado' }, 401)
    const { data: user } = await sb.auth.getUser(auth)
    const correo = user?.user?.email?.toLowerCase()
    const uid = user?.user?.id
    if (!correo && !uid) return json({ error: 'No autorizado' }, 401)

    let admin: any = null
    if (uid) {
      const { data } = await sb.from('administradores').select('email').eq('user_id', uid).limit(1).maybeSingle()
      admin = data
    }
    if (!admin && correo) {
      const { data } = await sb.from('administradores').select('email').eq('email', correo).limit(1).maybeSingle()
      admin = data
    }
    if (!admin) return json({ error: 'No autorizado' }, 403)

    const { data: fila, error } = await sb
      .from('pedidos')
      .select('*')
      .eq('id', orderId)
      .eq('payment_method', 'Mercado Pago')
      .maybeSingle()
    if (error || !fila) return json({ error: 'Pedido no encontrado' }, 404)

    return await confirmarVenta(sb, kommoToken, fila, 'mercadopago')
  }

  return json({ error: 'No sé qué confirmar' }, 400)
})
