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
import { cancelarGuia } from '../_shared/envia.ts'
import { avisoSheets } from '../_shared/sheets.ts'

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
    .select('id, client_name, client_phone, city, total_price, offer_name, kommo_lead_id, status, numero, guia_numero, guia_carrier, guia_estado')
    .eq('id', orderId)
    .maybeSingle()
  if (error || !fila) return json({ error: 'Pedido no encontrado' }, 404)

  await sb.from('pedidos').update({ status: nuevoEstado }).eq('id', orderId)

  // Pedido cancelado: se cancela la guía de envío si existía y todavía estaba
  // activa (no ha sido recogida por la transportadora, así que no se cobra).
  let cancelacionGuia = ''
  if (nuevoEstado === 'cancelled' && fila.guia_numero && fila.guia_estado !== 'cancelada') {
    const enviaToken = Deno.env.get('ENVIA_TOKEN') || ''
    const carrier = String(fila.guia_carrier ?? '').split(' · ')[0]
    const resultado = await cancelarGuia(enviaToken, carrier, String(fila.guia_numero))
    const cancelada = resultado && !/error|no pudo|cannot|couldn't|invalid|not found/i.test(resultado)
    await sb
      .from('pedidos')
      .update({ guia_estado: cancelada ? 'cancelada' : 'cancel_error', guia_error: cancelada ? null : String(resultado).slice(0, 500) })
      .eq('id', orderId)
    await sb.from('sync_log').insert({
      pedido_id: orderId,
      destino: 'envia',
      estado: cancelada ? 'ok' : 'error',
      detalle: cancelada ? `Guía ${fila.guia_numero} cancelada` : `No se pudo cancelar la guía ${fila.guia_numero}: ${resultado ?? 'sin respuesta'}`,
    })
    cancelacionGuia = cancelada ? `✅ Guía ${fila.guia_numero} cancelada` : `⚠️ Guía ${fila.guia_numero}: hubo problema al cancelar (revisala)`
    if (!cancelada) {
      await enviarTelegram(`🚨 <b>Alerta:</b> el pedido <code>${orderId}</code> se canceló pero su guía (${fila.guia_numero}, ${fila.guia_carrier ?? carrier}) no se pudo cancelar en Envia.com: ${String(resultado).slice(0, 160)}. Revisala para que no la cobren.`)
    }
  }

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

  avisoSheets(sb, orderId)
  return json({
    ok: true,
    orderId,
    estado: nuevoEstado,
    kommoMovido,
    kommoMensaje,
    cancelacionGuia,
  })
})