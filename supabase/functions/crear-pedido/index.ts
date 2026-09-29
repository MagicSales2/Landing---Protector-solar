// ============================================================================
//  FUNCIÓN: crear-pedido
//  Qué hace, en orden:
//    1. Revisa que los datos sean reales (teléfono, correo, dirección...)
//    2. Confirma el precio contra la tabla de ofertas (nadie inventa precios)
//    3. Descarta spam y pedidos repetidos
//    4. Guarda el pedido en la base de datos
//    5. Contra Entrega  → lo manda a Kommo en la etapa correcta
//       Mercado Pago   → crea un link único de pago y NO lo manda a Kommo.
//       El pedido queda "pendiente_pago"; solo cuando Mercado Pago confirme
//       el pago (función confirmar-pago) pasa a "pagado" y entra a Kommo.
//
//  Si Kommo o Mercado Pago se caen, el pedido IGUAL queda guardado en la
//  base de datos (la base es la fuente de verdad).
// ============================================================================

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { enviarAKommo, ResumenPedido } from '../_shared/kommo.ts'
import { enviarTelegram } from '../_shared/telegram.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Página a la que Mercado Pago devuelve al cliente cuando termina de pagar.
const SITIO = 'https://magicsales2.github.io/Landing---Protector-solar'
// Función que recibe la notificación (webhook) de Mercado Pago al haber pago.
const URL_NOTIFICACION = 'https://drzbxmajsbkdkydsbjzj.supabase.co/functions/v1/confirmar-pago'

type PedidoEntrada = {
  clientName?: string
  clientPhone?: string
  clientEmail?: string
  documentId?: string
  department?: string
  city?: string
  address?: string
  address2?: string
  notes?: string
  offerId?: string
  paymentMethod?: string
  website?: string
  utm?: Record<string, string | undefined>
  userAgent?: string
  referrer?: string
}

function texto(valor: unknown, max: number): string {
  return String(valor ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function json(cuerpo: unknown, estado = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function generarId(): string {
  const ahora = new Date()
  const mes = String(ahora.getMonth() + 1).padStart(2, '0')
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `PED-${String(ahora.getFullYear()).slice(2)}${mes}-${rand}`
}

const formatearCOP = (n: number) => '$ ' + n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

// Crea el "Checkout Pro" de Mercado Pago: un link único ligado a este pedido
// (external_reference) para poder confirmar el pago cuando llegue la
// notificación o cuando el cliente vuelva desde Mercado Pago.
async function crearPreferenciaMP(token: string, pedido: { id: string; total: number; producto: string; cantidad: number }) {
  const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [
        {
          title: pedido.producto,
          quantity: 1,
          unit_price: pedido.total,
          currency_id: 'COP',
        },
      ],
      external_reference: pedido.id,
      notification_url: URL_NOTIFICACION,
      auto_return: 'approved',
      back_urls: {
        success: `${SITIO}/#/gracias`,
        pending: `${SITIO}/#/gracias?estado=pendiente`,
        failure: `${SITIO}/#/gracias?estado=fallecido`,
      },
    }),
  })
  const cuerpo = await res.json()
  if (!res.ok) {
    throw new Error(`Mercado Pago ${res.status}: ${String(cuerpo?.message ?? JSON.stringify(cuerpo)).slice(0, 300)}`)
  }
  return {
    preferenciaId: String(cuerpo?.id ?? ''),
    initPoint: String(cuerpo?.init_point || cuerpo?.sandbox_init_point || ''),
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  const kommoToken = Deno.env.get('KOMMO_TOKEN')
  if (!kommoToken) {
    console.error('Falta el secreto KOMMO_TOKEN en la configuración de la función')
    return json({ error: 'La función no está configurada todavía' }, 500)
  }

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  let entrada: PedidoEntrada
  try {
    entrada = await req.json()
  } catch {
    return json({ error: 'No se pudo leer el pedido' }, 400)
  }

  // Trampa para robots: si llenaron el campo invisible, respondemos como si
  // todo estuviera bien pero no guardamos nada.
  if (entrada.website) return json({ ok: true, orderId: 'PED-DEMO' })

  // --- 1) Validación de lo que llega del navegador
  const nombre = texto(entrada.clientName, 150)
  const celular = texto(entrada.clientPhone, 20).replace(/\D/g, '')
  const correo = texto(entrada.clientEmail, 150).toLowerCase()
  const documento = texto(entrada.documentId, 30)
  const departamento = texto(entrada.department, 80)
  const ciudad = texto(entrada.city, 80)
  const direccion = texto(entrada.address, 200)
  const direccion2 = texto(entrada.address2, 200)
  const notas = texto(entrada.notes, 500)
  const offerId = texto(entrada.offerId, 40)
  const metodoPago = texto(entrada.paymentMethod, 30)

  const problemas: string[] = []
  if (nombre.length < 3) problemas.push('nombre')
  if (!/^3\d{9}$/.test(celular)) problemas.push('celular')
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(correo)) problemas.push('correo')
  if (documento.length < 5) problemas.push('documento')
  if (departamento.length < 2) problemas.push('departamento')
  if (ciudad.length < 2) problemas.push('ciudad')
  if (direccion.length < 5) problemas.push('direccion')
  if (!['Contra Entrega', 'Mercado Pago'].includes(metodoPago)) problemas.push('metodo_pago')
  if (problemas.length) return json({ error: 'Datos incompletos', campos: problemas }, 400)

  // --- 2) El precio lo decide la base de datos
  const { data: oferta, error: errorOferta } = await sb
    .from('ofertas')
    .select('id, nombre, cantidad, precio, activo, mercadopago_url')
    .eq('id', offerId)
    .maybeSingle()

  if (errorOferta || !oferta || !oferta.activo) {
    return json({ error: 'La oferta seleccionada no está disponible' }, 400)
  }

  // --- 3) Freno a duplicados: mismo celular, 3 pedidos en 15 minutos
  const hace15min = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  const { data: recientes, count: repetidos } = await sb
    .from('pedidos')
    .select('id, numero, total_price, created_at')
    .eq('client_phone', celular)
    .gte('created_at', hace15min)
    .order('created_at', { ascending: false })
    .limit(3)

  if ((repetidos ?? 0) >= 3) {
    return json({ error: 'Demasiados intentos. Espera unos minutos.' }, 429)
  }

  // Doble clic o recarga: si este mismo celular acaba de pedir, no se duplica.
  const previo = recientes?.[0]
  if (previo && Date.now() - new Date(previo.created_at).getTime() < 90_000) {
    return json({
      ok: true,
      orderId: previo.id,
      numero: previo.numero,
      total: previo.total_price,
      duplicado: true,
    })
  }

  // --- 4) Guardar el pedido
  const id = generarId()
  const esMercadoPago = metodoPago === 'Mercado Pago'
  const { data: guardado, error: errorGuardado } = await sb
    .from('pedidos')
    .insert({
      id,
      client_name: nombre,
      client_phone: celular,
      client_email: correo,
      document_id: documento,
      department: departamento,
      city: ciudad,
      address: direccion,
      address2: direccion2 || null,
      notes: notas || null,
      offer_id: oferta.id,
      offer_name: oferta.nombre,
      quantity: oferta.cantidad,
      total_price: oferta.precio,
      payment_method: metodoPago,
      // Con pago online el pedido espera el pago real antes de ser venta.
      status: esMercadoPago ? 'pendiente_pago' : 'new',
      utm_source: texto(entrada.utm?.utm_source, 100) || null,
      utm_medium: texto(entrada.utm?.utm_medium, 100) || null,
      utm_campaign: texto(entrada.utm?.utm_campaign, 100) || null,
      utm_content: texto(entrada.utm?.utm_content, 100) || null,
      utm_term: texto(entrada.utm?.utm_term, 100) || null,
      referrer: texto(entrada.referrer, 300) || null,
      user_agent: texto(entrada.userAgent, 300) || null,
    })
    .select('id, numero, total_price, utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer')
    .single()

  if (errorGuardado || !guardado) {
    console.error('No se pudo guardar el pedido:', errorGuardado)
    return json({ error: 'No pudimos registrar tu pedido. Intenta de nuevo.' }, 500)
  }

  // A partir de aquí el pedido YA está guardado: si Kommo/MP falla, no se pierde.
  const pedido: ResumenPedido = {
    id,
    total_price: guardado.total_price,
    nombre,
    celular,
    correo,
    documento,
    departamento,
    ciudad,
    direccion,
    direccion2,
    notas,
    cantidad: oferta.cantidad,
    metodoPago,
    utm_source: guardado.utm_source,
    utm_medium: guardado.utm_medium,
    utm_campaign: guardado.utm_campaign,
    utm_content: guardado.utm_content,
    utm_term: guardado.utm_term,
    referrer: guardado.referrer,
  }

  // --- 5) Mercado Pago: pedido pendiente + link de pago + SIGUE Kommo
  if (esMercadoPago) {
    let initPoint: string | null = null
    const mpToken = Deno.env.get('MP_TOKEN')
    if (mpToken) {
      try {
        const { preferenciaId, initPoint: url } = await crearPreferenciaMP(mpToken, {
          id,
          total: pedido.total_price,
          producto: `Protector Solar Anthelios SPF 50+ x${pedido.cantidad}`,
          cantidad: pedido.cantidad,
        })
        await sb.from('pedidos').update({ mp_preferencia_id: preferenciaId || null }).eq('id', id)
        initPoint = url || null
      } catch (err) {
        // Sin link único: el cliente paga con el link fijo y el comerciante
        // confirma el pago a mano desde el panel.
        console.error('No se pudo crear la preferencia de Mercado Pago:', err instanceof Error ? err.message : err)
        await sb
          .from('sync_log')
          .insert({ pedido_id: id, destino: 'mercadopago', estado: 'error', detalle: (err instanceof Error ? err.message : String(err)).slice(0, 500) })
      }
    }

    // El lead entra a Kommo de inmediato (etapa "Mercado pago") con el campo
    // "Medio De Pago" = "Pendiente de pago", para poder hacer seguimiento
    // mientras el cliente no pague. Cuando el pago se confirme, confirmar-pago
    // cambia ese MISMO lead a "Medio De Pago" = "Mercado Pago".
    let kommoResumen = ''
    try {
      const { leadId, contactId, camposPendientes } = await enviarAKommo(sb, kommoToken, pedido, {
        metodoPagoClave: 'enum_pendiente_pago',
      })
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
      await sb
        .from('sync_log')
        .insert({ pedido_id: id, destino: 'kommo', estado: 'ok', detalle: `Venta ${leadId} (medio de pago: pendiente)${aviso}` })
      kommoResumen = camposPendientes.length ? `⚠️ Kommo: venta ${leadId} con campo pendiente de confirmar` : `✅ Kommo: venta ${leadId}`
    } catch (err) {
      const detalle = err instanceof Error ? err.message : String(err)
      console.error('Fallo al enviar a Kommo:', detalle)
      await sb.from('pedidos').update({ kommo_estado: 'error', kommo_error: detalle.slice(0, 500) }).eq('id', id)
      await sb.from('sync_log').insert({ pedido_id: id, destino: 'kommo', estado: 'error', detalle: detalle.slice(0, 500) })
      kommoResumen = `⚠️ Kommo: ${detalle.slice(0, 160)}`
    }

    await enviarTelegram(
      [
        '🔵 <b>Pedido Mercado Pago · esperando pago</b>',
        `🧾 <code>${id}</code> · N.º ${guardado.numero ?? id}`,
        `👤 ${nombre}`,
        `📱 ${celular}`,
        `📍 ${ciudad}${departamento ? ', ' + departamento : ''}`,
        `🏠 ${direccion}${direccion2 ? ' · ' + direccion2 : ''}`,
        `📦 ${pedido.cantidad} unidad(es) — ${formatearCOP(pedido.total_price)}`,
        initPoint ? `🔗 <a href="${initPoint}">Abrir link de pago</a>` : '⚠️ Sin link único: pagará por el link fijo del comerciante',
        kommoResumen,
      ].join('\n'),
    )

    return json({ ok: true, orderId: id, numero: guardado.numero, total: guardado.total_price, initPoint, mercadopagoUrl: oferta.mercadopago_url || '' })
  }

  // --- 6) Contra Entrega: enviar a Kommo
  let kommoResumen = ''
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
    kommoResumen = camposPendientes.length ? `⚠️ Kommo: venta ${leadId} con campo pendiente de confirmar` : `✅ Kommo: venta ${leadId}`
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err)
    console.error('Fallo al enviar a Kommo:', detalle)
    await sb.from('pedidos').update({ kommo_estado: 'error', kommo_error: detalle.slice(0, 500) }).eq('id', id)
    await sb.from('sync_log').insert({ pedido_id: id, destino: 'kommo', estado: 'error', detalle: detalle.slice(0, 500) })
    kommoResumen = `⚠️ Kommo: ${detalle.slice(0, 160)}`
  }

  await enviarTelegram(
    [
      '🛒 <b>Pedido nuevo · Contra Entrega</b>',
      `🧾 <code>${id}</code> · N.º ${guardado.numero ?? id}`,
      `👤 ${nombre}`,
      `📱 ${celular}`,
      `📍 ${ciudad}${departamento ? ', ' + departamento : ''}`,
      `🏠 ${direccion}${direccion2 ? ' · ' + direccion2 : ''}`,
      `📦 ${pedido.cantidad} unidad(es) — ${formatearCOP(pedido.total_price)}`,
      kommoResumen,
    ].join('\n'),
  )

  return json({ ok: true, orderId: id, numero: guardado.numero, total: guardado.total_price })
})