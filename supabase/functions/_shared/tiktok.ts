// ============================================================================
//  TikTok Events API (conversiones del lado del servidor).
//
//  El píxel del navegador es fácil de bloquear: los ad-blockers y el modo
//  incógnito se lo tragan y la venta no llega a TikTok, que entonces no
//  optimiza la campaña ni concede crédito por la conversión. La Events API
//  es el mismo evento mandado desde nuestro servidor, con los datos del
//  cliente cifrados, y TikTok lo acepta aunque el píxel nunca haya cargado.
//
//  Requisitos:
//    - TIKTOK_EVENTS_API_TOKEN: "Access Token" del Events Manager. Mientras
//      no esté puesto, el módulo no hace nada (queda inerte; ningún pedido se
//      rompe por esto).
//    - TIKTOK_PIXEL_ID: id del píxel en el servidor.
//
//  Advanced Matching: TikTok exige los datos de cliente en SHA-256
//  (minúsculas, sin espacios). Con eso las conversiones se emparejan con las
//  visitas que la gente ya hizo y el retorno se atribuye bien.
//
//  Lo que NO se cifra: la IP y el user_agent van en texto plano. TikTok los
//  usa para validar que la visita sea real, así que mandarlos cifrados hace
//  que TikTok los rechace y se pierda el emparejamiento. Mismo caso para
//  ttclid y ttp.
//
//  Deduplicacion: el evento lleva event_id = id del pedido. El navegador
//  manda el mismo event_id en su evento de compra, así que si llegan los dos
//  TikTok cuenta UNA sola venta (no duplica conversiones ni nos penaliza).
//  Ojo: TikTok deduplica por (event_source_id + event + event_id). Si el
//  píxel manda "CompletePayment" y el servidor manda "Purchase", NO los
//  deduplica, porque el nombre del evento es parte de la clave. Por eso los
//  dos lados usan el mismo nombre.
// ============================================================================

// Endpoint según la documentación oficial de "Setup guide for Web" (v1.3).
// Este es el único que hay que usar: "open_api/v2/event/track/" NO existe y
// por eso el módulo no mandaba nada.
const URL_EVENTOS = 'https://business-api.tiktok.com/open_api/v1.3/event/track/'

// Eventos estándar que TikTok acepta en esta API. Un nombre fuera de esta
// lista se trata como evento personalizado: aparece en los reportes pero NO
// sirve como objetivo de optimización de campaña, o sea que no ayuda a que
// TikTok biocentros las announcements.
//
// El nombre histórico era "CompletePayment". TikTok lo renombró a "Purchase"
// y es el que recomienda para instalaciones nuevas. "PlaceAnOrder" existe
// para cuando el pedido y el pago no ocurren al mismo tiempo.
//

const EVENTOS_ESTANDAR = [
  'ViewContent',
  'AddToCart',
  'InitiateCheckout',
  'AddPaymentInfo',
  'AddToWishlist',
  'Search',
  'PlaceAnOrder',
  'CompleteRegistration',
  'Purchase',
] as const

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

// El teléfono se manda en formato E.164 (+57...) y se cifra. Si no trae código
// de país se pone el de Colombia (+57), que es donde vendemos.
async function phoneHash(telefono: string): Promise<string> {
  let digitos = String(telefono ?? '').replace(/\D/g, '')
  if (digitos.length === 10) digitos = `57${digitos}`
  if (!digitos) return ''
  return sha256(digitos)
}

export type EventoTiktok = {
  // Debe ser uno de EVENTOS_ESTANDAR. Ver la nota de deduplicación arriba.
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
  // IP y user_agent van SIN cifrar: TikTok los usa para validar la visita.
  user_agent?: string
  client_ip?: string
  // ttclid y ttp se capturan en el navegador y se guardan con el pedido.
  ttclid?: string
  ttp?: string
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

  // El nombre del evento tiene que ser uno de los estándar. Si alguien pasa un
  // nombre inventado se avisa, pero no se bloquea la conversión.
  const esEstandar = (EVENTOS_ESTANDAR as readonly string[]).includes(evento.event)
  if (!esEstandar) {
    console.warn(`[TikTok] "${evento.event}" no es un evento estándar. Llega como evento personalizado: sirve para reportes pero NO como objetivo de optimización.`)
  }

  const user: Record<string, string> = {}
  const email = await sha256(evento.client_email || '')
  const telefono = await phoneHash(evento.client_phone || '')
  const documento = await sha256(evento.document_id || '')
  if (email) user.email = email
  if (telefono) user.phone = telefono
  if (documento) user.external_id = documento
  // Estos cuatro van en texto plano. Cifrarlos hace que TikTok los descarte.
  if (evento.client_ip) user.ip = evento.client_ip
  if (evento.user_agent) user.user_agent = evento.user_agent
  if (evento.ttclid) user.ttclid = evento.ttclid
  if (evento.ttp) user.ttp = evento.ttp

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
    // "data" es SIEMPRE un arreglo, aunque vaya un solo evento. Mandarlo como
    // objeto suelto hace que TikTok rechace el cuerpo entero.
    data: [
      {
        event: evento.event,
        event_time: Math.floor(Date.now() / 1000),
        event_id: evento.event_id,
        ...(Object.keys(user).length ? { user } : {}),
        page: {
          page_url: evento.page_url || SITIO_POR_DEFECTO,
          referrer: evento.referrer || '',
        },
        // Los parámetros del producto van en "properties", no en "content".
        // TikTok v1.3 espera "properties" con currency/value y "contents".
        properties: {
          currency: evento.currency || 'COP',
          value: valorTotal,
          content_type: evento.content_type || 'product',
          contents: [
            {
              content_type: evento.content_type || 'product',
              content_id: evento.content_ids?.[0] || evento.order_id,
              content_name: evento.content_name || 'Protector Solar Anthelios SPF 50+',
              quantity: cantidad,
              price: precioUnitario,
            },
          ],
        },
      },
    ],
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
    let mensaje = ''
    try {
      const json = JSON.parse(texto)
      codigo = Number(json.code ?? 0)
      mensaje = String(json.message ?? '')
    } catch {
      /* respuesta no-JSON: se toma como aceptada */
    }
    if (codigo !== 0) {
      const detalle = `Events API código ${codigo}: ${(mensaje || texto).slice(0, 300)}`
      console.error('[TikTok]', detalle)
      await registrar?.('error', detalle)
      return { enviado: false, motivo: detalle, codigo }
    }
    console.log(`[TikTok] ${evento.event} (${evento.event_id}) aceptado`)
    await registrar?.('ok', `Events API: ${evento.event} ${evento.event_id}`)
    return { enviado: true, codigo: 0 }
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err)
    console.error('[TikTok] No se pudo enviar el evento:', detalle)
    await registrar?.('error', `Events API: ${detalle.slice(0, 300)}`)
    return { enviado: false, motivo: detalle }
  }
}
