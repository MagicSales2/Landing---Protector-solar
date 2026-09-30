// ============================================================================
//  FUNCIÓN: confirmar-pago
//  Confirma a mano un pedido cuyo pago en línea (Wompi) ya entró pero que el
//  webhook no pudo registrar. El trabajo pesado (pedido pagado, lead de Kommo
//  a la etapa de pago confirmado, guía sin recaudo, Telegram y Sheets) vive
//  en _shared/confirmarVenta.ts, el mismo módulo que usa confirmar-pago-wompi.
//
//  Se llama SOLO desde el panel de administrador ( botón "Confirmar pago"),
//  con sesión de administrador: { "orderId": "PED-..." }.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { confirmarVenta, json } from '../_shared/confirmarVenta.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

  const orderId = String(cuerpo?.orderId ?? '').trim()
  if (!orderId) return json({ error: 'No sé qué confirmar' }, 400)

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

  const { data: fila, error } = await sb.from('pedidos').select('*').eq('id', orderId).maybeSingle()
  if (error || !fila) return json({ error: 'Pedido no encontrado' }, 404)
  // Solo pagos en línea: una contra entrega no se "confirma pago".
  if (fila.payment_method === 'Contra Entrega') return json({ error: 'Ese pedido es contra entrega' }, 400)

  return await confirmarVenta(sb, kommoToken, fila, 'wompi')
})
