// ============================================================================
//  FUNCIÓN: reintentar-sync
//  Reintenta desde el panel LAS ACCIONES QUE FALTARON, sin tocar lo que ya
//  quedó bien. Se llama con:
//     { "orderId": "PED-...", "accion": "kommo" | "guia" | "todo" }
//  - "kommo" → vuelve a subir la venta a Kommo si no llegó (o no se confirmó).
//  - "guia"  → vuelve a crear la guía de envío si no se pudo (por ejemplo,
//              porque Envia no tenía saldo en ese momento).
//  Solo un administrador autenticado puede usarla.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { enviarAKommo, ResumenPedido } from '../_shared/kommo.ts'
import { enviarTelegram, esc } from '../_shared/telegram.ts'
import { generarGuiaPedido } from '../_shared/envia.ts'
import { avisoSheets } from '../_shared/sheets.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const COLUMNAS_PEDIDO =
  'id, numero, client_name, client_phone, client_email, document_id, department, city, address, address2, notes, offer_name, quantity, total_price, payment_method, utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer, status, kommo_estado, kommo_lead_id, kommo_contact_id, wompi_payment_link_id, guia_numero, guia_estado, guia_error'

function json(cuerpo: unknown, estado = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
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

// Reintenta subir la venta a Kommo (si nunca llegó o quedó con error).
async function reintentarKommo(sb: any, kommoToken: string, fila: any): Promise<{ estado: string; detalle: string }> {
  if (!kommoToken) return { estado: 'error', detalle: 'Kommo no configurado (falta KOMMO_TOKEN)' }
  const yaEnKommo = fila.kommo_estado === 'enviado' || fila.kommo_estado === 'enviado_con_aviso'
  if (fila.kommo_lead_id && yaEnKommo) {
    return { estado: 'ya_enviado', detalle: `La venta ya está en Kommo (lead ${fila.kommo_lead_id})` }
  }

  const pedido = aPedido(fila)
  // Opciones según el medio y el estado: pago online ya pagado → su etapa
  // final; pago online pendiente → etapa pendiente con su link de pago de
  // Wompi; contra entrega → la etapa por defecto.
  const opciones: any = {}
  if (fila.payment_method !== 'Contra Entrega') {
    if (fila.status === 'pagado') {
      opciones.metodoPagoClave = 'enum_wompi'
      opciones.statusClave = 'status_pago_online'
    } else {
      opciones.metodoPagoClave = 'enum_pendiente_pago'
      opciones.statusClave = 'status_pago_online_pendiente'
      // El link de Wompi se reconstruye desde el id guardado en el pedido.
      if (fila.wompi_payment_link_id) {
        opciones.linkPago = `https://checkout.wompi.co/l/${fila.wompi_payment_link_id}`
      }
    }
  }

  try {
    const { leadId, contactId, camposPendientes } = await enviarAKommo(sb, kommoToken, pedido, opciones)
    const aviso = camposPendientes.length ? ` · campo de producto/medio de pago no confirmado por Kommo` : ''
    await sb
      .from('pedidos')
      .update({
        kommo_lead_id: leadId,
        kommo_contact_id: contactId,
        kommo_estado: camposPendientes.length ? 'enviado_con_aviso' : 'enviado',
        kommo_enviado_en: new Date().toISOString(),
        kommo_error: null,
      })
      .eq('id', fila.id)
    await sb
      .from('sync_log')
      .insert({ pedido_id: fila.id, destino: 'kommo', estado: 'ok', detalle: `Reintento: Venta ${leadId}${aviso}` })
    return {
      estado: 'enviado',
      detalle: `Venta creada (lead ${leadId})${camposPendientes.length ? ' — revisar el campo en Kommo' : ''}`,
    }
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err)
    await sb.from('pedidos').update({ kommo_estado: 'error', kommo_error: detalle.slice(0, 500) }).eq('id', fila.id)
    await sb.from('sync_log').insert({ pedido_id: fila.id, destino: 'kommo', estado: 'error', detalle: `Reintento: ${detalle.slice(0, 500)}` })
    return { estado: 'error', detalle: detalle.slice(0, 300) }
  }
}

// Reintenta crear la guía de envío (si no se pudo). Contra Entrega y el pago
// online ya pagado generan guía; un pago pendiente todavía no.
async function reintentarGuia(sb: any, fila: any): Promise<{ estado: string; detalle: string }> {
  const enviaToken = Deno.env.get('ENVIA_TOKEN') || ''
  if (!enviaToken) return { estado: 'error', detalle: 'Envia.com no configurado (falta ENVIA_TOKEN)' }

  if (fila.guia_estado === 'creada' && fila.guia_numero) {
    return { estado: 'ya_creada', detalle: `La guía ya existe (${fila.guia_numero})` }
  }
  if (fila.guia_estado === 'cancelada') {
    return { estado: 'sin_accion', detalle: 'La guía fue cancelada (pedido cancelado)' }
  }
  if (fila.payment_method !== 'Contra Entrega' && fila.status !== 'pagado') {
    return { estado: 'sin_accion', detalle: 'Guía se creará cuando el pago esté confirmado' }
  }

  const kommoToken = Deno.env.get('KOMMO_TOKEN') || ''
  // Solo la contra entrega lleva recaudo: si el pago ya se hizo en línea, la
  // guía va sin cobrar.
  const conRecaudo = fila.payment_method === 'Contra Entrega'
  try {
    const res = await generarGuiaPedido(sb, enviaToken, kommoToken, fila, conRecaudo)
    if (res.ok) {
      return {
        estado: 'creada',
        detalle: `Guía ${res.numero} (${res.carrier})${res.kommoOk ? ' · link en Kommo' : ''}`,
      }
    }
    const detalle = res.error ?? 'no se pudo crear la guía'
    return { estado: 'error', detalle }
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err)
    return { estado: 'error', detalle: detalle.slice(0, 300) }
  }
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
  const accion = String(cuerpo?.accion ?? 'todo').trim()
  if (!orderId) return json({ error: 'Falta el id del pedido' }, 400)
  if (!['kommo', 'guia', 'todo'].includes(accion)) return json({ error: 'Acción no válida' }, 400)

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

  const { data: fila, error } = await sb.from('pedidos').select(COLUMNAS_PEDIDO).eq('id', orderId).maybeSingle()
  if (error || !fila) return json({ error: 'Pedido no encontrado' }, 404)

  const kommoToken = Deno.env.get('KOMMO_TOKEN') || ''
  const resKommo = accion === 'kommo' || accion === 'todo' ? await reintentarKommo(sb, kommoToken, fila) : null
  const resGuia = accion === 'guia' || accion === 'todo' ? await reintentarGuia(sb, fila) : null

  await enviarTelegram(
    [
      '🔄 <b>Reintento manual</b>',
      `🧾 <code>${orderId}</code> · N.º ${fila.numero ?? orderId}`,
      resKommo ? `🏢 Kommo: ${esc(resKommo.detalle)}` : '',
      resGuia ? `📦 Guía: ${esc(resGuia.detalle)}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  )

  avisoSheets(sb, orderId)
  return json({ ok: true, orderId, kommo: resKommo, guia: resGuia })
})