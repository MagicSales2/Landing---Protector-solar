// ============================================================================
//  FUNCIÓN: crear-pedido
//  Qué hace, en orden:
//    1. Revisa que los datos sean reales (teléfono, correo, dirección...)
//    2. Confirma el precio contra la tabla de ofertas (nadie inventa precios)
//    3. Descarta spam y pedidos repetidos
//    4. Guarda el pedido en la base de datos
//    5. Contra Entrega → lo manda a Kommo en la etapa correcta
//       Pago con Wompi → crea un link único de pago y NO lo manda a Kommo.
//       El pedido queda "pendiente_pago"; solo cuando Wompi confirme
//       el pago (webhook → función confirmar-pago-wompi) pasa a "pagado" y
//       entra a Kommo.
//
//  Si Kommo o Wompi se caen, el pedido IGUAL queda guardado en la
//  base de datos (la base es la fuente de verdad).
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { enviarAKommo, ResumenPedido } from '../_shared/kommo.ts'
import { enviarTelegram, etiquetaVentaKommo } from '../_shared/telegram.ts'
import { generarGuiaPedido } from '../_shared/envia.ts'
import { avisoSheets } from '../_shared/sheets.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Página a la que Wompi devuelve al cliente cuando termina de pagar.
// Se manda el id del pedido para poder mostrar el estado real al volver.
const SITIO = 'https://magicsales2.github.io/Landing---Protector-solar'

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

// Crea el link de pago de Wompi: monto fijo, un solo uso, ligado a este pedido
// (viene en el id del link). El cliente paga en el checkout de Wompi
// (tarjeta, PSE, Nequi, Bancolombia, QR...) y Wompi avisa por webhook.
async function crearLinkWompi(llavePrivada: string, pedido: { id: string; total: number; producto: string; cantidad: number }) {
  const res = await fetch('https://api.wompi.co/v1/payment_links', {
    method: 'POST',
    headers: { Authorization: `Bearer ${llavePrivada}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `Pago pedido ${pedido.id}`,
      description: pedido.producto,
      single_use: true,
      amount_in_cents: Math.round(pedido.total * 100),
      currency: 'COP',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      redirect_url: `${SITIO}/#/gracias?pedido=${pedido.id}`,
      collect_shipping: false,
    }),
  })
  const cuerpo = await res.json()
  if (!res.ok) {
    throw new Error(`Wompi ${res.status}: ${String(cuerpo?.error?.reason ?? JSON.stringify(cuerpo)).slice(0, 300)}`)
  }
  const linkId = String(cuerpo?.data?.id ?? '')
  if (!linkId) throw new Error('Wompi no devolvió el id del link de pago')
  return { linkId, initPoint: `https://checkout.wompi.co/l/${linkId}` }
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
  if (!['Contra Entrega', 'Wompi'].includes(metodoPago)) problemas.push('metodo_pago')
  if (problemas.length) return json({ error: 'Datos incompletos', campos: problemas }, 400)

  // --- 2) El precio lo decide la base de datos
  const { data: oferta, error: errorOferta } = await sb
    .from('ofertas')
    .select('id, nombre, cantidad, precio, activo')
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
  const esPagoOnline = metodoPago !== 'Contra Entrega'
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
      status: esPagoOnline ? 'pendiente_pago' : 'new',
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

  // A partir de aquí el pedido YA está guardado: si Kommo/Wompi falla, no se pierde.
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

  // --- 5) Pago online: pedido pendiente + link de pago + SIGUE Kommo
  if (esPagoOnline) {
    let initPoint: string | null = null
    const wompiPriv = Deno.env.get('WOMPI_PRIVATE_KEY')

    // Link de pago de Wompi con el monto ya fijo: el cliente paga en el
    // checkout de Wompi y el webhook (confirmar-pago-wompi) confirma el pago.
    if (!wompiPriv) {
      console.error('Falta el secreto WOMPI_PRIVATE_KEY en la configuración de la función')
    } else {
      try {
        const { linkId, initPoint: url } = await crearLinkWompi(wompiPriv, {
          id,
          total: pedido.total_price,
          producto: `Protector Solar Anthelios SPF 50+ x${pedido.cantidad}`,
          cantidad: pedido.cantidad,
        })
        await sb.from('pedidos').update({ wompi_payment_link_id: linkId, wompi_status: 'link_creado' }).eq('id', id)
        initPoint = url
        await sb
          .from('sync_log')
          .insert({ pedido_id: id, destino: 'wompi', estado: 'ok', detalle: `Link de pago ${linkId}` })
      } catch (err) {
        // El pedido ya está guardado en la base, así que no se pierde: el
        // cliente puede pagar después con el link que le pase el dueño y este
        // se confirma a mano desde el panel.
        console.error('No se pudo crear el link de Wompi:', err instanceof Error ? err.message : err)
        await sb
          .from('sync_log')
          .insert({ pedido_id: id, destino: 'wompi', estado: 'error', detalle: (err instanceof Error ? err.message : String(err)).slice(0, 500) })
      }
    }

    // El lead entra a Kommo de inmediato a la etapa de pago pendiente
    // (esperando el pago), con el campo "Medio De Pago" = "Pendiente de pago".
    // Cuando el pago se confirme, confirmar-pago-wompi mueve ese MISMO lead a
    // la etapa de pago confirmado. El link de pago queda en el campo "Link de
    // pago" de Kommo para poder mandárselo por WhatsApp.
    // (No se avisa por Telegram todavía: solo se avisa cuando el pago se
    // confirma, así el dueño no se llena de ruido con pedidos sin pagar.)
    try {
      const { leadId, contactId, camposPendientes } = await enviarAKommo(sb, kommoToken, pedido, {
        metodoPagoClave: 'enum_pendiente_pago',
        statusClave: 'status_pago_online_pendiente',
        linkPago: initPoint ? String(initPoint) : undefined,
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
    } catch (err) {
      const detalle = err instanceof Error ? err.message : String(err)
      console.error('Fallo al enviar a Kommo:', detalle)
      await sb.from('pedidos').update({ kommo_estado: 'error', kommo_error: detalle.slice(0, 500) }).eq('id', id)
      await sb.from('sync_log').insert({ pedido_id: id, destino: 'kommo', estado: 'error', detalle: detalle.slice(0, 500) })
    }

    avisoSheets(sb, id)
    return json({ ok: true, orderId: id, numero: guardado.numero, total: guardado.total_price, initPoint })
  }

  // --- 6) Contra Entrega: enviar a Kommo
  let kommoResumen = ''
  let leadIdEnviado: number | null = null
  try {
    const { leadId, contactId, camposPendientes } = await enviarAKommo(sb, kommoToken, pedido)
    leadIdEnviado = leadId
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
    kommoResumen = camposPendientes.length ? `⚠️ Kommo: ${etiquetaVentaKommo(leadId)} con campo pendiente de confirmar` : `✅ Kommo: ${etiquetaVentaKommo(leadId)}`
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err)
    console.error('Fallo al enviar a Kommo:', detalle)
    await sb.from('pedidos').update({ kommo_estado: 'error', kommo_error: detalle.slice(0, 500) }).eq('id', id)
    await sb.from('sync_log').insert({ pedido_id: id, destino: 'kommo', estado: 'error', detalle: detalle.slice(0, 500) })
    kommoResumen = `⚠️ Kommo: ${detalle.slice(0, 160)}`
  }

  // --- 7) Guía de envío. En Contra Entrega se genera al llegar el pedido
  // (solo se cobra cuando la transportadora recibe el paquete). La más
  // económica gana; en caso de fallo se avisa por Telegram pero el pedido
  // sigue su curso.
  let guiaResumen = ''
  let guiaRespuesta: { ok: boolean; numero?: string; carrier?: string; costo?: number } | null = null
  const enviaToken = Deno.env.get('ENVIA_TOKEN') || ''
  try {
    const resGuia = await generarGuiaPedido(sb, enviaToken, kommoToken, {
      id,
      numero: guardado.numero,
      client_name: nombre,
      client_phone: celular,
      city: ciudad,
      department: departamento,
      address: direccion,
      address2: direccion2,
      notes: notas,
      quantity: oferta.cantidad,
      total_price: pedido.total_price,
      kommo_lead_id: leadIdEnviado,
    }, true)
    if (resGuia.omitido) {
      guiaResumen = '📦 Guía: Envia.com no está activado'
    } else if (resGuia.ok) {
      guiaResumen = `📦 Guía: ${resGuia.carrier} · № ${resGuia.numero}${resGuia.kommoOk ? ' · link en Kommo 📎' : ''}`
      guiaRespuesta = { ok: true, numero: resGuia.numero, carrier: resGuia.carrier, costo: resGuia.costo }
    } else {
      guiaResumen = `📦 Guía: ⚠️ no se pudo crear (${resGuia.error ?? 'error'})`
    }
  } catch (err) {
    guiaResumen = `📦 Guía: ⚠️ ${err instanceof Error ? err.message : String(err)}`
  }

  await enviarTelegram(
    [
      '🛒 <b>Pedido nuevo · Contra Entrega</b>',
      `🧾 <code>${id}</code> · N.º ${guardado.numero ?? id}`,
      `👤 ${nombre}`,
      `📱 ${celular}`,
      `📍 ${ciudad}${departamento ? ', ' + departamento : ''}`,
      `🏠 ${direccion}${direccion2 ? ' · ' + direccion2 : ''}`,
      `🧴 Protector Solar Anthelios SPF 50+ · ${oferta.nombre} — ${formatearCOP(pedido.total_price)}`,
      kommoResumen,
      guiaResumen,
    ].join('\n'),
  )

  avisoSheets(sb, id)
  return json({ ok: true, orderId: id, numero: guardado.numero, total: guardado.total_price, guia: guiaRespuesta })
})