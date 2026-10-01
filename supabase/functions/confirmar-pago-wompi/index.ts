// ============================================================================
//  FUNCIÓN: confirmar-pago-wompi
//  Recibe el webhook de Wompi cuando cambia el estado de una transacción
//  (evento "transaction.updated"). Si el pago quedó APPROVED, confirma el
//  pedido (lo marca pagado, mueve el lead de Kommo, crea la guía sin recaudo,
//  avisa por Telegram y sincroniza la hoja) usando la MISMA lógica que
//  _shared/confirmarVenta.ts.
//
//  Además, el GET ?pedido=PED-...&verificar=1 consulta DIRECTAMENTE a la API
//  de Wompi y confirma el pago si está APPROVED. Es la red de seguridad: si
//  el webhook se pierde o tarda, el cliente sigue viendo su pago confirmado.
//
//  Seguridad: se valida la firma del evento (X-Event-Checksum) con el
//  "Firma de eventos" de Wompi para confirmar que la notificación es auténtica.
//  El checksum es SHA256 de:  [valores de signature.properties, sin separador]
//                            + signature.timestamp (integer)
//                            + firma de eventos (secret)
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { confirmarVenta, json } from '../_shared/confirmarVenta.ts'
import { firmaValida } from '../_shared/firma.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Pregunta a Wompi si el pedido ya tiene un pago APPROVED. Devuelve null si
// todavía no hay ninguno, o el id de la transacción si lo hay.
// OJO: /v1/transactions/ exige(from_date, until_date, page, page_size) o
// responde 422, así que siempre se mandan.
async function transaccionAprobada(llavePrivada: string, pedido: any): Promise<string | null> {
  const desde = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
  const hasta = new Date().toISOString()
  const buscar = async (filtros: Record<string, string>) => {
    const q = new URLSearchParams({ from_date: desde, until_date: hasta, page: '1', page_size: '100', ...filtros })
    const res = await fetch(`https://api.wompi.co/v1/transactions/?${q}`, { headers: { Authorization: `Bearer ${llavePrivada}` } })
    if (!res.ok) throw new Error(`Wompi ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const cuerpo = await res.json()
    return Array.isArray(cuerpo?.data) ? cuerpo.data : []
  }

  // Primero por referencia (los links nuevos la llevan = id del pedido) y
  // luego por link de pago (sirve para los links creados antes de eso).
  let lista: any[] = []
  try {
    lista = await buscar({ reference: String(pedido.id) })
  } catch (err) {
    console.error('Wompi no respondió al buscar por referencia:', err)
  }
  if (!lista.length && pedido.wompi_payment_link_id) {
    try {
      lista = await buscar({ payment_link: String(pedido.wompi_payment_link_id) })
    } catch (err) {
      console.error('Wompi no respondió al buscar por link de pago:', err)
    }
  }

  const centavoEsperado = Math.round(Number(pedido.total_price) * 100)
  const aprobada = lista
    .filter((t: any) => String(t?.status ?? '').toUpperCase() === 'APPROVED')
    // Si el link se pagó por otro monto, no es este pedido.
    .filter((t: any) => Number(t?.amount_in_cents) === centavoEsperado)
    .sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)))[0]
  return aprobada ? String(aprobada.id) : null
}

// Extrae un valor anidado del evento usando una ruta como "transaction.id".
function valorEnRuta(objeto: any, ruta: string): any {
  return ruta.split('.').reduce((acc, parte) => (acc == null ? acc : acc[parte]), objeto)
}

// Calcula el checksum del evento y lo compara con el que envió Wompi.
// OJO: el timestamp UNIX va DENTRO del objeto "signature" (no en la raíz).
async function checksumValido(evento: any, secret: string): Promise<boolean> {
  const props: string[] = evento?.signature?.properties ?? []
  const timestamp = evento?.signature?.timestamp ?? evento?.timestamp
  const recibido = evento?.signature?.checksum

  // Sin los datos de firma no se puede validar.
  if (!props.length || timestamp == null || !recibido) return false

  let base = ''
  for (const ruta of props) {
    base += String(valorEnRuta(evento?.data, ruta) ?? '')
  }
  base += String(timestamp)
  base += secret

  const esperado = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(base))
  const esperadoHex = Array.from(new Uint8Array(esperado))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  return esperadoHex.toLowerCase() === String(recibido).toLowerCase()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  // ── Consulta de estado (GET ?pedido=PED-... [&verificar=1]) ─────────────
  // La usa la página de gracias para mostrarle al cliente si su pago ya
  // quedó confirmado. Con verificar=1 además pregunta a Wompi y confirma el
  // pago si allí está APPROVED (red de seguridad si el webhook no llegó).
  if (req.method === 'GET') {
    const params = new URL(req.url).searchParams
    const pedidoId = params.get('pedido')?.trim() || ''
    const verificar = params.get('verificar') === '1'
    // El nombre del cliente solo se devuelve si quien pregunta trae la firma
    // que se guardó en el link de pago. Con el id suelto no se expone.
    const conFirma = await firmaValida(pedidoId, params.get('sec')?.trim() || '')
    if (!pedidoId) return json({ ok: false, error: 'Falta el pedido' }, 400)
    const { data: fila } = await sb
      .from('pedidos')
      .select('*')
      .eq('id', pedidoId)
      .maybeSingle()
    if (!fila) return json({ ok: false, estado: 'no_encontrado' }, 404)

    if (verificar && fila.status !== 'pagado' && fila.payment_method !== 'Contra Entrega') {
      const llavePrivada = Deno.env.get('WOMPI_PRIVATE_KEY') || ''
      const kommo = Deno.env.get('KOMMO_TOKEN') || ''
      if (llavePrivada && kommo) {
        try {
          const transaccionId = await transaccionAprobada(llavePrivada, fila)
          if (transaccionId) {
            console.log(`Pago de ${fila.id} confirmado verificando contra la API de Wompi`)
            await sb
              .from('pedidos')
              .update({ wompi_transaction_id: transaccionId, wompi_status: 'aprobado' })
              .eq('id', fila.id)
            fila.wompi_transaction_id = transaccionId
            fila.wompi_status = 'aprobado'
            await confirmarVenta(sb, kommo, fila, 'wompi')
          }
        } catch (err) {
          console.error('Falló la verificación del pago en Wompi:', err)
        }
      }
    }

    // Se vuelve a leer para reflejar lo que confirmó confirmarVenta.
    const { data: final } = await sb
      .from('pedidos')
      .select('id, status, payment_method, total_price, client_name')
      .eq('id', pedidoId)
      .maybeSingle()
    const f = final ?? fila
    return json({
      ok: f.status === 'pagado',
      orderId: f.id,
      estado: f.status,
      total: Number(f.total_price),
      // Sin la firma no se devuelve el nombre (ni el teléfono, que nunca se
      // sale de aquí). La página de gracias degrada a un "gracias" genérico.
      cliente: conFirma ? f.client_name : '',
    })
  }

  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  const kommoToken = Deno.env.get('KOMMO_TOKEN')
  const eventSecret = Deno.env.get('WOMPI_EVENT_SECRET') || ''
  if (!kommoToken || !eventSecret) {
    console.error('Faltan secretos (KOMMO_TOKEN o WOMPI_EVENT_SECRET)')
    return json({ error: 'La función no está configurada todavía' }, 500)
  }

  // Cuerpo crudo: hace falta para validar la firma sin alterarlo.
  const crudo = await req.text()
  let evento: any
  try {
    evento = JSON.parse(crudo)
  } catch {
    return json({ error: 'No se pudo leer el evento' }, 400)
  }

  // ── Validar la firma del evento ────────────────────────────────────────
  const headerChecksum = req.headers.get('x-event-checksum') || ''
  const firmaOk = await checksumValido(evento, eventSecret)
  if (!firmaOk) {
    // Si el header no coincide, es una notificación manipulada o de otro
    // entorno (sandbox/producción cruzados): no se procesa.
    console.warn('Firma de evento Wompi inválida. header:', headerChecksum, 'evento:', evento?.event)
    return json({ ok: false, error: 'Firma inválida' }, 401)
  }

  // Solo nos interesan los cambios de estado de una transacción.
  if (evento?.event !== 'transaction.updated') {
    return json({ ok: true, ignorado: 'evento no relevante' })
  }

  const transaccion = evento?.data?.transaction ?? {}
  const estado = String(transaccion.status ?? '').toUpperCase()
  const linkId = transaccion.payment_link_id ? String(transaccion.payment_link_id) : ''
  const transaccionId = transaccion.id ? String(transaccion.id) : ''

  // Si el pago NO quedó aprobado no es venta todavía (rechazado, pendiente,
  // anulado, error). Se registra y se responde 200 para que Wompi deje de
  // reintentar.
  if (estado !== 'APPROVED') {
    if (linkId) {
      await sb.from('pedidos').update({ wompi_status: estado.toLowerCase() }).eq('wompi_payment_link_id', linkId)
    }
    return json({ ok: false, estado: estado.toLowerCase() || 'desconocido' })
  }

  // ── Buscar el pedido por el link de pago ───────────────────────────────
  // El link se creó con amount fijo y de un solo uso, así que el link ES la
  // llave que une el pago con el pedido.
  let pedido: any = null
  if (linkId) {
    const { data } = await sb.from('pedidos').select('*').eq('wompi_payment_link_id', linkId).maybeSingle()
    pedido = data
  }
  // Respaldo: si el link no quedó guardado, se busca por la referencia, que
  // para los links creados por esta app es el ID del pedido.
  if (!pedido && transaccion.reference) {
    const ref = String(transaccion.reference).trim()
    const porReferencia = await sb.from('pedidos').select('*').eq('id', ref).maybeSingle()
    pedido = porReferencia.data
    if (!pedido) {
      const porTransaccion = await sb.from('pedidos').select('*').eq('wompi_transaction_id', ref).maybeSingle()
      pedido = porTransaccion.data
    }
  }

  if (!pedido) {
    console.warn(`Pago Wompi APPROVED sin pedido ligado (link=${linkId || 'vacío'}, ref=${transaccion.reference || 'vacía'})`)
    return json({ ok: false, estado: 'sin_pedido' }, 200)
  }

  // Guardar referencia de la transacción y estado.
  await sb
    .from('pedidos')
    .update({ wompi_transaction_id: transaccionId || null, wompi_status: 'aprobado' })
    .eq('id', pedido.id)

  // Confirmar la venta (misma lógica de siempre, compartida en _shared).
  return await confirmarVenta(sb, kommoToken, pedido, 'wompi')
})
