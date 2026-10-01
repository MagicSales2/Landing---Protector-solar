// ============================================================================
//  TikTok Events API (conversiones del lado del servidor).
//
//  El píxel del navegador es fácil de bloquear: los ad-blockers y el modo
//  incógnito se lo tragan y la venta no llega a TikTok, que entonces no
//  optimiza la campaña niKZ concede crédito por la conversión. La Events API
//  es el mismo evento mandado desde nuestro servidor, con los datos del
//  cliente cifrados, y TikTok lo acepta aunque el píxel nunca haya cargado.
//
//  Requisitos:
//    - TIKTOK_EVENTS_API_TOKEN: "Access Token" del Events Manager. Mientras
//      no esté puesto, el módulo no hace nada (queda inerte; ningún pedido se
//      rompe por esto).
//    - TIKTOK_PIXEL_ID: id del píxel en el servidor.
//
//  Advanced Matching: TikTok exige los datos del cliente cifrados en SHA-256
//  (minúsculas, sin espacios). Con eso las conversiones se_emparejan con las
//  visitas que la gente ya hizo y el retorno se atribuye bien.
//
//  Deduplicacion: el evento lleva event_id = id del pedido. El navegador
//  manda el mismo event_id en su CompletePayment, asi que si llegan los dos
//  TikTok cuenta UNA sola venta (no duplica conversiones ni nos penaliza).
// ============================================================================

const URL_EVENTOS = 'https://api.tiktokbiz.com/open_api/v2/event/track/'

// Dominio del sitio, por si algún evento llega sin page_url. Vive en el secreto
// SITIO_URL para no tener que recompilar cuando cambia el dominio.
const SITIO_POR_DEFECTO = (Deno.env.get('SITIO_URL') || 'https://protectorsolar.skinoferta.cloud').replace(/\/+$/, '') + '/'

// TikTok exige SHA-256 en minúsculas y sin espacios sobrantes.
async function sha256(valor: string): Promise<string> {
  const limpio = valor.trim().toLowerCase()
  if (!limpio) return ''
  const datos = new TextEncoder().encode(limpio)
  const hash = await crypto.subtle.digest('SHA-256', datos)
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// El teléfono se manda solo con dígitos. Si no trae código de país se pone
// el de Colombia (+57), que es donde vendemos.
async function phoneHash(telefono: string): Promise<string> {
  let digitos = String(telefono ?? '').replace(/\D/g, '')
  if (digitos.length === 10) digitos = `57${digitos}`
  if (!digitos) return ''
  return sha256(digitos)
}

export type EventoTiktok = {
  // 'CompletePayment' | 'SubmitForm' | 'InitiateCheckout' | 'ViewContent' | ...
  event: string
  event_id: string
  order_id: string
  client_email?: string
  client_phone?: string
  document_id?: string
  value?: number
  currency?: string
  content_name?: string
  content_ids?: string[]
  content_type?: string
  quantity?: number
  page_url?: string
  referrer?: string
  user_agent?: string
  client_ip?: string
}

export type ResultadoTiktok = {
  enviado: boolean
  motivo?: string
  codigo?: number
}

/**
 * Manda un evento a la TikTok Events API.
 * Nunca lanza: si TikTok falla, el pedido ya está pagado y guardado, así que
 * un fallo aquí solo se registra en la consola y en el sync_log.
 */
export async function enviarEventoTiktok(
  evento: EventoTiktok,
  registrar?: (estado: string, detalle: string) => Promise<void>,
): Promise<ResultadoTiktok> {
  const token = Deno.env.get('TIKTOK_EVENTS_API_TOKEN') || ''
  const pixelId = Deno.env.get('TIKTOK_PIXEL_ID') || ''

  if (!token || !pixelId) {
    return { enviado: false, motivo: 'sin TIKTOK_EVENTS_API_TOKEN/TIKTOK_PIXEL_ID configurados' }
  }

  const user: Record<string, string> = {}
  const email = await sha256(evento.client_email || '')
  const telefono = await phoneHash(evento.client_phone || '')
  const documento = await sha256(evento.document_id || '')
  if (email) user.email = email
  if (telefono) user.phone = telefono
  if (documento) user.external_id = documento
  if (evento.client_ip) user.client_ip_address = evento.client_ip
  if (evento.user_agent) user.client_user_agent = evento.user_agent

  const cantidad = evento.quantity ?? 1
  const valorTotal = evento.value ?? 0
  // TikTok separa los dos campos:
  //   "price" = precio de UNA unidad del producto
  //   "value" = valor TOTAL del pedido
  // Mandar el total en "price" hace que el optimizador calcule mal cuando el
  // pedido lleva varias unidades (una oferta de 3 unidades vale el triple).
  const precioUnitario = Math.round(valorTotal / (cantidad > 0 ? cantidad : 1))

  const cuerpo = {
    event_source: 'web',
    event_source_id: pixelId,
    // Cuando se manda "test_event_code" de TikTok, los eventos llegan a prueba.
    ...(Deno.env.get('TIKTOK_TEST_CODE') ? { test_event_code: Deno.env.get('TIKTOK_TEST_CODE') } : {}),
    data: {
      event: evento.event,
      event_time: Math.floor(Date.now() / 1000),
      event_id: evento.event_id,
      ...(Object.keys(user).length ? { user } : {}),
      page: {
        page_url: evento.page_url || SITIO_POR_DEFECTO,
        referrer: evento.referrer || '',
      },
      content: {
        content_type: evento.content_type || 'product',
        content_id: evento.content_ids?.[0] || evento.order_id,
        content_name: evento.content_name || 'Protector Solar Anthelios SPF 50+',
        quantity: cantidad,
        price: precioUnitario,
        value: valorTotal,
        currency: evento.currency || 'COP',
      },
    },
  }

  try {
    const res = await fetch(URL_EVENTOS, {
      method: 'POST',
      headers: { 'Access-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    })
    const texto = await res.text()
    if (!res.ok) {
      const detalle = `Events API ${res.status}: ${texto.slice(0, 300)}`
      console.error('[TikTok]', detalle)
      await registrar?.('error', detalle)
      return { enviado: false, motivo: detalle, codigo: res.status }
    }
    // TikTok responde {"code":0,"message":"OK"} cuando lo acepta.
    let codigo = 0
    try {
      codigo = Number(JSON.parse(texto).code ?? 0)
    } catch {
      /* respuesta no-JSON: se toma como aceptada */
    }
    if (codigo !== 0) {
      const detalle = `Events API código ${codigo}: ${texto.slice(0, 300)}`
      console.error('[TikTok]', detalle)
      await registrar?.('error', detalle)
      return { enviado: false, motivo: detalle, codigo }
    }
    console.log(`[TikTok] Evento ${evento.event} (${evento.event_id}) aceptado`)
    await registrar?.('ok', `Events API: ${evento.event} ${evento.event_id}`)
    return { enviado: true, codigo: 0 }
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err)
    console.error('[TikTok] No se pudo enviar el evento:', detalle)
    await registrar?.('error', `Events API: ${detalle.slice(0, 300)}`)
    return { enviado: false, motivo: detalle }
  }
}
