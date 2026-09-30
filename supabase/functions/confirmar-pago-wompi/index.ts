// ============================================================================
//  FUNCIÓN: confirmar-pago-wompi
//  Recibe el webhook de Wompi cuando cambia el estado de una transacción
//  (evento "transaction.updated"). Si el pago quedó APPROVED, confirma el
//  pedido (lo marca pagado, mueve el lead de Kommo, crea la guía sin recaudo,
//  avisa por Telegram y sincroniza la hoja) usando la MISMA lógica que
//  confirmar-pago de Mercado Pago (_shared/confirmarVenta.ts).
//
//  Seguridad: se valida la firma del evento (header X-Event-Checksum) con el
//  "Firma de eventos" de Wompi para confirmar que la notificación es auténtica.
//  El checksum es SHA256 de:  [valores de signature.properties, sin separador]
//                            + timestamp (integer)
//                            + firma de eventos (secret)
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { confirmarVenta, json } from '../_shared/confirmarVenta.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Extrae un valor anidado del evento usando una ruta como "transaction.id".
function valorEnRuta(objeto: any, ruta: string): any {
  return ruta.split('.').reduce((acc, parte) => (acc == null ? acc : acc[parte]), objeto)
}

// Calcula el checksum del evento y lo compara con el que envió Wompi.
async function checksumValido(evento: any, secret: string): Promise<boolean> {
  const props: string[] = evento?.signature?.properties ?? []
  const timestamp = evento?.timestamp
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
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  const kommoToken = Deno.env.get('KOMMO_TOKEN')
  const eventSecret = Deno.env.get('WOMPI_EVENT_SECRET') || ''
  if (!kommoToken || !eventSecret) {
    console.error('Faltan secretos (KOMMO_TOKEN o WOMPI_EVENT_SECRET)')
    return json({ error: 'La función no está configurada todavía' }, 500)
  }

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

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
  // Respaldo: si por algún motivo el link no quedó guardado, se busca por la
  // referencia que Wompi devuelve en la transacción.
  if (!pedido && transaccion.reference) {
    const ref = String(transaccion.reference).trim()
    const { data } = await sb.from('pedidos').select('*').eq('wompi_transaction_id', ref).maybeSingle()
    pedido = data
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

  // Confirmar la venta (misma lógica que Mercado Pago).
  return await confirmarVenta(sb, kommoToken, pedido, 'wompi')
})
