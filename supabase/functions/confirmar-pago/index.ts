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
// ============================================================================

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { enviarAKommo, marcarMetodoPago, moverLeadAEstado, ResumenPedido } from '../_shared/kommo.ts'
import { enviarTelegram, enlaceVentaKommo, etiquetaVentaKommo } from '../_shared/telegram.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const COLUMNAS_PEDIDO =
  'id, numero, client_name, client_phone, client_email, document_id, department, city, address, address2, notes, offer_name, quantity, total_price, payment_method, utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer, status, kommo_estado, kommo_lead_id'

function json(cuerpo: unknown, estado = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

const formatearCOP = (n: number) => '$ ' + n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

// Avisa por Telegram que un pago de Mercado Pago quedó confirmado.
async function avisarPagoConfirmado(fila: any, kommoResumen: string) {
  await enviarTelegram(
    [
      '💚 <b>¡PAGO CONFIRMADO!</b>',
      `🧾 <code>${fila.id}</code> · N.º ${fila.numero ?? fila.id}`,
      `👤 ${fila.client_name}`,
      `📱 ${fila.client_phone}`,
      `📍 ${fila.city}${fila.department ? ', ' + fila.department : ''}`,
      `🧴 Protector Solar Anthelios SPF 50+ · ${fila.offer_name ?? ''} — ${formatearCOP(Number(fila.total_price))}`,
      kommoResumen,
    ].join('\n'),
  )
}

function aPedido(row: any): ResumenPedido {
  return {
    id: row.id,
    total_price: Number(row.total_price),
    nombre: row.client_name,
    celular: row.client_phone,
    correo: row.client_email ?? '',
    documento: row.document_id ?? '',
    departamento: row.department ?? '',
    ciudad: row.city ?? '',
    direccion: row.address ?? '',
    direccion2: row.address2 ?? '',
    notas: row.notes ?? '',
    cantidad: Number(row.quantity),
    metodoPago: row.payment_method,
    utm_source: row.utm_source,
    utm_medium: row.utm_medium,
    utm_campaign: row.utm_campaign,
    utm_content: row.utm_content,
    utm_term: row.utm_term,
    referrer: row.referrer,
  }
}

// Marca el pedido como "pagado" y mueve el lead que ya está en Kommo:
// pasa de la etapa "Mercado pago - Pendiente de pago" a la etapa
// "Mercado pago", y su campo "Medio De Pago" cambia de "Pendiente de pago"
// a "Mercado Pago" (mismo lead, no se duplica). Si el lead nunca llegó a
// crearse, se crea ahora como respaldo.
async function confirmar(sb: SupabaseClient, kommoToken: string, fila: any) {
  const id = fila.id

  if (fila.status !== 'pagado') {
    await sb.from('pedidos').update({ status: 'pagado' }).eq('id', id)
  }

  const yaVendido = fila.kommo_estado === 'enviado' || fila.kommo_estado === 'enviado_con_aviso'

  // 1) El lead ya existe: solo se le cambia la etapa y el campo "Medio De Pago".
  if (fila.kommo_lead_id && yaVendido) {
    let kommoResumen = '⚠️ Kommo: el avance no se confirmó'
    try {
      const okEtapa = await moverLeadAEstado(sb, kommoToken, Number(fila.kommo_lead_id), 'status_mercadopago')
      const okCampo = await marcarMetodoPago(sb, kommoToken, Number(fila.kommo_lead_id), 'enum_mercadopago')
      const ok = okEtapa && okCampo
      await sb
        .from('pedidos')
        .update({ kommo_estado: ok ? 'enviado' : 'enviado_con_aviso', kommo_enviado_en: new Date().toISOString() })
        .eq('id', id)
      await sb
        .from('sync_log')
        .insert({ pedido_id: id, destino: 'kommo', estado: ok ? 'ok' : 'aviso', detalle: `Lead ${fila.kommo_lead_id}: etapa → Mercado Pago` })
      kommoResumen = ok
        ? `✅ Kommo: <a href="${enlaceVentaKommo(fila.kommo_lead_id)}">lead ${fila.kommo_lead_id}</a> movido a la etapa "Mercado Pago"`
        : '⚠️ Kommo: no confirmó el avance a la etapa "Mercado Pago"'
    } catch (err) {
      const detalle = err instanceof Error ? err.message : String(err)
      console.error('Fallo al confirmar el pago en Kommo:', detalle)
      await sb.from('pedidos').update({ kommo_estado: 'error', kommo_error: detalle.slice(0, 500) }).eq('id', id)
      await sb.from('sync_log').insert({ pedido_id: id, destino: 'kommo', estado: 'error', detalle: detalle.slice(0, 500) })
      kommoResumen = `⚠️ Kommo: ${detalle.slice(0, 160)}`
    }
    await avisarPagoConfirmado(fila, kommoResumen)
    return json({
      ok: true,
      orderId: id,
      estado: 'pagado',
      total: Number(fila.total_price),
      cantidad: Number(fila.quantity),
      cliente: fila.client_name,
    })
  }

  // 2) Respaldo: no había lead en Kommo; se crea ahora como venta (etapa MP).
  let kommoResumen = '⚠️ Kommo: no se pudo enviar la venta'
  if (!yaVendido) {
    const pedido = aPedido(fila)
    try {
      const { leadId, contactId, camposPendientes } = await enviarAKommo(sb, kommoToken, pedido)
      const aviso = camposPendientes.length ? ` · OJO: campo de producto/medio de pago no confirmado por Kommo` : ''
      await sb
        .from('pedidos')
        .update({
          kommo_lead_id: leadId,
          kommo_contact_id: contactId,
          kommo_estado: camposPendientes.length ? 'enviado_con_aviso' : 'enviado',
          kommo_enviado_en: new Date().toISOString(),
        })
        .eq('id', id)
      await sb.from('sync_log').insert({ pedido_id: id, destino: 'kommo', estado: 'ok', detalle: `Venta ${leadId}${aviso}` })
      kommoResumen = `✅ Kommo: ${etiquetaVentaKommo(leadId)}`
    } catch (err) {
      const detalle = err instanceof Error ? err.message : String(err)
      console.error('Fallo al enviar a Kommo:', detalle)
      await sb.from('pedidos').update({ kommo_estado: 'error', kommo_error: detalle.slice(0, 500) }).eq('id', id)
      await sb.from('sync_log').insert({ pedido_id: id, destino: 'kommo', estado: 'error', detalle: detalle.slice(0, 500) })
      kommoResumen = `⚠️ Kommo: ${detalle.slice(0, 160)}`
    }
  }
  await avisarPagoConfirmado(fila, kommoResumen)

  return json({
    ok: true,
    orderId: id,
    estado: 'pagado',
    total: Number(fila.total_price),
    cantidad: Number(fila.quantity),
    cliente: fila.client_name,
  })
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
        .select(COLUMNAS_PEDIDO)
        .eq('id', orderId)
        .eq('payment_method', 'Mercado Pago')
        .maybeSingle()
      if (error || !fila) {
        console.warn(`Pago ${paymentId} aprobado pero sin pedido ligado (external_reference=${orderId || 'vacío'})`)
        await enviarTelegram(`🚨 <b>Alerta:</b> Mercado Pago reportó el pago <code>${paymentId}</code> como <b>aprobado</b>, pero no hay ningún pedido ligado (referencia: ${orderId || 'vacía'}). Revisalo.`)
        return json({ ok: false, estado: 'sin_pedido' })
      }
      return await confirmar(sb, kommoToken, fila)
    } catch (err) {
      const motivo = err instanceof Error ? err.message : String(err)
      console.error('No se pudo verificar el pago:', motivo)
      await enviarTelegram(`🚨 <b>Alerta:</b> no se pudo verificar un pago de Mercado Pago (<code>${paymentId}</code>): ${motivo.slice(0, 160)}`)
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
      .select(COLUMNAS_PEDIDO)
      .eq('id', orderId)
      .eq('payment_method', 'Mercado Pago')
      .maybeSingle()
    if (error || !fila) return json({ error: 'Pedido no encontrado' }, 404)

    return await confirmar(sb, kommoToken, fila)
  }

  return json({ error: 'No sé qué confirmar' }, 400)
})