// ============================================================================
//  FUNCIÓN: actualizar-estado
//  Cambia el estado de un pedido desde el panel de administrador y, si el
//  pedido pasa a "shipped" (despachado), mueve automáticamente su venta en
//  Kommo a la etapa "Enviado". Ese movimiento dispara el mensaje de WhatsApp
//  al cliente con la guía (triger D3 configurado en Kommo).
//
//  Se llama desde el panel: { "orderId": "PED-...", "status": "shipped" }
//  Solo un administrador autenticado puede hacerlo.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { moverLeadAEstado } from '../_shared/kommo.ts'
import { enviarTelegram, enlaceVentaKommo } from '../_shared/telegram.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ESTADOS_VALIDOS = ['new', 'pendiente_pago', 'pagado', 'confirmed', 'shipped', 'delivered', 'cancelled']

function json(cuerpo: unknown, estado = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  let cuerpo: any
  try {
    cuerpo = await req.json()
  } catch {
    return json({ error: 'No se pudo leer la solicitud' }, 400)
  }

  const orderId = String(cuerpo?.orderId ?? '').trim()
  const nuevoEstado = String(cuerpo?.status ?? '').trim()
  if (!orderId) return json({ error: 'Falta el id del pedido' }, 400)
  if (!ESTADOS_VALIDOS.includes(nuevoEstado)) return json({ error: `Estado no válido: ${nuevoEstado}` }, 400)

  const auth = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!auth) return json({ error: 'No autorizado' }, 401)

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

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
    .select('id, client_name, client_phone, city, total_price, offer_name, kommo_lead_id, status, numero')
    .eq('id', orderId)
    .maybeSingle()
  if (error || !fila) return json({ error: 'Pedido no encontrado' }, 404)

  await sb.from('pedidos').update({ status: nuevoEstado }).eq('id', orderId)

  let kommoMovido = false
  let kommoMensaje = ''
  if (nuevoEstado === 'shipped') {
    const kommoToken = Deno.env.get('KOMMO_TOKEN')
    if (!kommoToken) {
      kommoMensaje = '⚠️ Kommo no configurado (falta KOMMO_TOKEN)'
    } else if (!fila.kommo_lead_id) {
      kommoMensaje = '⚠️ Pedido sin venta en Kommo; no se pudo despachar allí'
    } else {
      try {
        kommoMovido = await moverLeadAEstado(sb, kommoToken, Number(fila.kommo_lead_id), 'status_despachado')
        await sb.from('sync_log').insert({
          pedido_id: orderId,
          destino: 'kommo',
          estado: kommoMovido ? 'ok' : 'aviso',
          detalle: kommoMovido
            ? `Lead ${fila.kommo_lead_id} movido a Enviado (despachado)`
            : `Lead ${fila.kommo_lead_id}: no se confirmó el movimiento a Enviado`,
        })
        kommoMensaje = kommoMovido
          ? `✅ Kommo: <a href="${enlaceVentaKommo(fila.kommo_lead_id)}">lead ${fila.kommo_lead_id}</a> → Enviado`
          : '⚠️ Kommo no confirmó el movimiento a Enviado'
      } catch (err) {
        const detalle = err instanceof Error ? err.message : String(err)
        console.error('Fallo al mover el lead a Enviado:', detalle)
        await sb.from('sync_log').insert({
          pedido_id: orderId,
          destino: 'kommo',
          estado: 'error',
          detalle: detalle.slice(0, 500),
        })
        kommoMensaje = `⚠️ Kommo: ${detalle.slice(0, 160)}`
      }
    }

    if (kommoMovido) {
      await enviarTelegram(
        [
          '📦 <b>Pedido DESPACHADO</b>',
          `🧾 <code>${orderId}</code> · N.º ${fila.numero ?? orderId}`,
          `👤 ${fila.client_name}`,
          `📱 ${fila.client_phone}`,
          `📍 ${fila.city ?? ''}`,
          kommoMensaje,
        ].join('\n'),
      )
    }
  }

  return json({
    ok: true,
    orderId,
    estado: nuevoEstado,
    kommoMovido,
    kommoMensaje,
  })
})