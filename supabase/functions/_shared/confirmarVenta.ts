// ============================================================================
//  LÓGICA COMPARTIDA DE CONFIRMACIÓN DE PAGO
// ----------------------------------------------------------------------------
//  Cuando un pago online queda APPROVED (Wompi lo avisa por webhook),
//  el pedido:
//    1) pasa a status "pagado"
//    2) mueve el lead de Kommo a la etapa "Pago online"
//       (el campo "Medio De Pago" pasa de "Pendiente de pago" a la opción final)
//    3) genera la guía de envío SIN recaudo (el dinero ya está)
//    4) avisa por Telegram
//    5) sincroniza la Google Sheet
//
//  Este módulo lo usan:
//    - confirmar-pago          → pago confirmado a mano desde el panel
//    - confirmar-pago-wompi    → pago confirmado por Wompi
//
//  Así las dos pasarelas comparten EXACTAMENTE la misma lógica post-pago.
// ============================================================================

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { enviarAKommo, marcarMetodoPago, moverLeadAEstado, ResumenPedido } from './kommo.ts'
import { enviarTelegram, enlaceVentaKommo, etiquetaVentaKommo, esc } from './telegram.ts'
import { generarGuiaPedido } from './envia.ts'
import { avisoSheets } from './sheets.ts'
import { enviarEventoTiktok } from './tiktok.ts'

export const COLUMNAS_PEDIDO =
  'id, numero, client_name, client_phone, client_email, document_id, department, city, address, address2, notes, offer_name, quantity, total_price, payment_method, utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer, status, kommo_estado, kommo_lead_id, wompi_payment_link_id, wompi_transaction_id, wompi_status'

const formatearCOP = (n: number) => '$ ' + n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

export function json(cuerpo: unknown, estado = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Avisa por Telegram que el pago quedó confirmado.
async function avisarPagoConfirmado(fila: any, kommoResumen: string, guiaResumen = '') {
  const lineas = [
    '💚 <b>¡PAGO CONFIRMADO!</b>',
    `🧾 <code>${fila.id}</code> · N.º ${fila.numero ?? fila.id}`,
    `👤 ${esc(fila.client_name)}`,
    `📱 ${esc(fila.client_phone)}`,
    `📍 ${esc(fila.city)}${fila.department ? ', ' + esc(fila.department) : ''}`,
    `🧴 Protector Solar Anthelios SPF 50+ · ${esc(fila.offer_name ?? '')} — ${formatearCOP(Number(fila.total_price))}`,
    kommoResumen,
  ]
  if (guiaResumen) lineas.push(guiaResumen)
  await enviarTelegram(lineas.join('\n'))
}

// Con el pago ya confirmado se crea la guía de envío (sin recaudo: el dinero
// ya está aprobado). Se elige la transportadora más económica y se guarda el
// enlace de seguimiento en Kommo.
async function guiaParaPago(sb: SupabaseClient, kommoToken: string, fila: any) {
  const enviaToken = Deno.env.get('ENVIA_TOKEN') || ''
  try {
    const resGuia = await generarGuiaPedido(sb, enviaToken, kommoToken, {
      id: fila.id,
      numero: fila.numero,
      client_name: fila.client_name,
      client_phone: fila.client_phone,
      city: fila.city ?? '',
      department: fila.department ?? '',
      address: fila.address ?? '',
      address2: fila.address2 ?? '',
      notes: fila.notes ?? '',
      quantity: Number(fila.quantity),
      total_price: Number(fila.total_price),
      kommo_lead_id: fila.kommo_lead_id ? Number(fila.kommo_lead_id) : null,
    }, false)
    if (resGuia.omitido) return { resumen: '📦 Guía: Envia.com no está activado', respuesta: null }
    if (resGuia.ok) {
      return {
        resumen: `📦 Guía: ${resGuia.carrier} · № ${resGuia.numero}${resGuia.kommoOk ? ' · link en Kommo 📎' : ''}`,
        respuesta: { ok: true, numero: resGuia.numero, carrier: resGuia.carrier, costo: resGuia.costo },
      }
    }
    return { resumen: `📦 Guía: ⚠️ no se pudo crear (${resGuia.error ?? 'error'})`, respuesta: null }
  } catch (err) {
    return { resumen: `📦 Guía: ⚠️ ${err instanceof Error ? err.message : String(err)}`, respuesta: null }
  }
}

// Conversión para TikTok por el lado del servidor (Events API). Se manda
// cuando el pago queda confirmado, con los datos del cliente cifrados en
// SHA-256 como exige TikTok. El event_id es el id del pedido: es el mismo que
// manda el píxel del navegador, así que si llegan los dos TikTok cuenta una
// sola venta. Si no hay token configurado, no hace nada.
async function avisarTiktok(sb: SupabaseClient, fila: any) {
  const resultado = await enviarEventoTiktok(
    {
      event: 'CompletePayment',
      event_id: fila.id,
      order_id: fila.id,
      client_email: fila.client_email,
      client_phone: fila.client_phone,
      document_id: fila.document_id,
      value: Number(fila.total_price),
      currency: 'COP',
      content_name: fila.offer_name || 'Protector Solar Anthelios SPF 50+',
      content_ids: [fila.offer_id || 'anthelios-protector-solar'],
      quantity: Number(fila.quantity),
      user_agent: fila.user_agent,
      referrer: fila.referrer,
    },
    async (estado, detalle) => {
      await sb.from('sync_log').insert({ pedido_id: fila.id, destino: 'tiktok', estado, detalle })
    },
  )
  return resultado
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
// pasa de la etapa "Pago online - Pendiente de pago" a la etapa
// "Pago online", y su campo "Medio De Pago" cambia a la opción final
// (mismo lead, no se duplica). Si el lead nunca llegó a crearse, se crea
// ahora como respaldo.
export async function confirmarVenta(sb: SupabaseClient, kommoToken: string, fila: any, pasarela: 'wompi') {
  const id = fila.id

  if (fila.status !== 'pagado') {
    await sb.from('pedidos').update({ status: 'pagado' }).eq('id', id)
  }

  const yaVendido = fila.kommo_estado === 'enviado' || fila.kommo_estado === 'enviado_con_aviso'

  // 1) El lead ya existe: solo se le cambia la etapa y el campo "Medio De Pago".
  if (fila.kommo_lead_id && yaVendido) {
    let kommoResumen = '⚠️ Kommo: el avance no se confirmó'
    try {
      const okEtapa = await moverLeadAEstado(sb, kommoToken, Number(fila.kommo_lead_id), 'status_pago_online')
      const okCampo = await marcarMetodoPago(sb, kommoToken, Number(fila.kommo_lead_id), 'enum_wompi')
      const ok = okEtapa && okCampo
      await sb
        .from('pedidos')
        .update({ kommo_estado: ok ? 'enviado' : 'enviado_con_aviso', kommo_enviado_en: new Date().toISOString() })
        .eq('id', id)
      await sb
        .from('sync_log')
        .insert({ pedido_id: id, destino: 'kommo', estado: ok ? 'ok' : 'aviso', detalle: `Lead ${fila.kommo_lead_id}: etapa → Pago online (${pasarela})` })
      kommoResumen = ok
        ? `✅ Kommo: <a href="${enlaceVentaKommo(fila.kommo_lead_id)}">lead ${fila.kommo_lead_id}</a> movido a la etapa "Pago online"`
        : '⚠️ Kommo: no confirmó el avance a la etapa "Pago online"'
    } catch (err) {
      const detalle = err instanceof Error ? err.message : String(err)
      console.error('Fallo al confirmar el pago en Kommo:', detalle)
      await sb.from('pedidos').update({ kommo_estado: 'error', kommo_error: detalle.slice(0, 500) }).eq('id', id)
      await sb.from('sync_log').insert({ pedido_id: id, destino: 'kommo', estado: 'error', detalle: detalle.slice(0, 500) })
      kommoResumen = `⚠️ Kommo: ${detalle.slice(0, 160)}`
    }
    // Guía de envío (pago ya aprobado) + aviso por Telegram.
    const guia = await guiaParaPago(sb, kommoToken, fila)
    await avisarPagoConfirmado(fila, kommoResumen, guia.resumen)
    await avisarTiktok(sb, fila)
    avisoSheets(sb, id)
    return json({
      ok: true,
      orderId: id,
      estado: 'pagado',
      total: Number(fila.total_price),
      cantidad: Number(fila.quantity),
      cliente: fila.client_name,
      guia: guia.respuesta,
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
  // Guía de envío (pago ya aprobado) + aviso por Telegram.
  const guia = await guiaParaPago(sb, kommoToken, fila)
  await avisarPagoConfirmado(fila, kommoResumen, guia.resumen)
  await avisarTiktok(sb, fila)
  avisoSheets(sb, id)

  return json({
    ok: true,
    orderId: id,
    estado: 'pagado',
    total: Number(fila.total_price),
    cantidad: Number(fila.quantity),
    cliente: fila.client_name,
    guia: guia.respuesta,
  })
}
