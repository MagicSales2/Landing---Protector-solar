// ============================================================================
//  FUNCIÓN: crear-pedido
//  Qué hace, en orden:
//    1. Revisa que los datos sean reales (teléfono, correo, dirección...)
//    2. Confirma el precio contra la tabla de ofertas (nadie inventa precios)
//    3. Descarta spam y pedidos repetidos
//    4. Guarda el pedido en la base de datos
//    5. Lo manda a Kommo: contacto + venta en la etapa correcta
//    6. Anota si el envío a Kommo quedó bien
//
//  Si Kommo se cae, el pedido IGUAL queda guardado en la base de datos
//  (la base es la fuente de verdad; Kommo es un espejo).
// ============================================================================

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ETAPA_POR_CANTIDAD: Record<number, string> = {
  1: 'status_contraentrega_1',
  2: 'status_contraentrega_2',
  3: 'status_contraentrega_3',
}

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

type ResumenPedido = {
  id: string
  total_price: number
  nombre: string
  celular: string
  correo: string
  documento: string
  departamento: string
  ciudad: string
  direccion: string
  direccion2: string
  notas: string
  cantidad: number
  metodoPago: string
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  utm_term: string | null
  referrer: string | null
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  // El token de Kommo vive como secreto de la función: nunca viaja al navegador.
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
      status: 'new',
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

  // A partir de aquí el pedido YA está guardado: si Kommo falla, no se pierde.
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

  // --- 5) Enviar a Kommo
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
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err)
    console.error('Fallo al enviar a Kommo:', detalle)
    await sb.from('pedidos').update({ kommo_estado: 'error', kommo_error: detalle.slice(0, 500) }).eq('id', id)
    await sb.from('sync_log').insert({ pedido_id: id, destino: 'kommo', estado: 'error', detalle: detalle.slice(0, 500) })
  }

  return json({ ok: true, orderId: id, numero: guardado.numero, total: guardado.total_price })
})

// ============================================================================
//  Kommo
// ============================================================================

async function enviarAKommo(sb: SupabaseClient, token: string, pedido: ResumenPedido) {
  const { data: filas } = await sb.from('kommo_config').select('clave, valor')
  const cfg: Record<string, string> = {}
  for (const fila of filas ?? []) cfg[fila.clave] = fila.valor

  const base = `https://${cfg.subdominio}.kommo.com/api/v4`
  const call = async (ruta: string, opciones: RequestInit = {}): Promise<any> => {
    const res = await fetch(`${base}${ruta}`, {
      ...opciones,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opciones.headers ?? {}) },
    })
    if (res.status === 204) return null
    const cuerpo = await res.text()
    if (!res.ok) throw new Error(`Kommo ${res.status}: ${cuerpo.slice(0, 300)}`)
    return cuerpo ? JSON.parse(cuerpo) : null
  }

  const num = (clave: string) => Number(cfg[clave] || 0)
  const telefono = `+57 ${pedido.celular}`

  // ¿El cliente ya existe en Kommo? Se reutiliza para no duplicar contactos.
  let contactId: number | null = null
  try {
    const encontrado = await call(`/contacts?query=${encodeURIComponent(telefono)}`)
    contactId = encontrado?._embedded?.contacts?.[0]?.id ?? null
  } catch {
    contactId = null
  }

  if (!contactId) {
    const creado = await call('/contacts', {
      method: 'POST',
      body: JSON.stringify([
        {
          name: pedido.nombre,
          custom_fields_values: [
            { field_id: num('cf_contacto_telefono'), values: [{ value: telefono }] },
            { field_id: num('cf_contacto_email'), values: [{ value: pedido.correo }] },
          ],
        },
      ]),
    })
    contactId = primerId(creado)
  }

  // Armar los campos de la venta
  type Campo = { field_id: number; values: { value?: string; enum_id?: number }[] }
  const campos: Campo[] = []
  const rastreo: Campo[] = []

  const conTexto = (lista: Campo[], clave: string, valor: string | number | null) => {
    const id = num(clave)
    if (id && valor !== null && valor !== '') lista.push({ field_id: id, values: [{ value: String(valor) }] })
  }
  const conOpcion = (claveCampo: string, claveOpcion: string) => {
    const campo = num(claveCampo)
    const opcion = num(claveOpcion)
    if (campo && opcion) campos.push({ field_id: campo, values: [{ enum_id: opcion }] })
  }

  conTexto(campos, 'cf_nombre', pedido.nombre)
  conTexto(campos, 'cf_celular', telefono)
  conTexto(campos, 'cf_documento', pedido.documento)
  conTexto(campos, 'cf_direccion', pedido.direccion)
  conTexto(campos, 'cf_direccion2', pedido.direccion2)
  conTexto(campos, 'cf_indicaciones', pedido.notas)
  conTexto(campos, 'cf_ciudad', pedido.ciudad)
  conTexto(campos, 'cf_municipio', pedido.ciudad)
  conTexto(campos, 'cf_entrega', `${pedido.ciudad}, ${pedido.departamento}`)
  conTexto(campos, 'cf_cantidad', pedido.cantidad)
  conTexto(campos, 'cf_total', pedido.total_price)
  conTexto(rastreo, 'cf_utm_source', pedido.utm_source)
  conTexto(rastreo, 'cf_utm_medium', pedido.utm_medium)
  conTexto(rastreo, 'cf_utm_campaign', pedido.utm_campaign)
  conTexto(rastreo, 'cf_utm_content', pedido.utm_content)
  conTexto(rastreo, 'cf_utm_term', pedido.utm_term)
  conTexto(rastreo, 'cf_referrer', pedido.referrer)

  conOpcion('cf_producto', `enum_producto_${pedido.cantidad}`)
  conOpcion('cf_metodo_pago', pedido.metodoPago === 'Contra Entrega' ? 'enum_contraentrega' : 'enum_mercadopago')

  const statusId =
    pedido.metodoPago === 'Mercado Pago'
      ? num('status_mercadopago')
      : num(ETAPA_POR_CANTIDAD[pedido.cantidad] ?? 'status_contraentrega_1')

  const base_venta = {
    name: `${cfg.etiqueta_origen || 'Landing'} ${pedido.id} · ${pedido.cantidad} unidad${pedido.cantidad > 1 ? 'es' : ''} · ${pedido.ciudad}`,
    price: pedido.total_price,
    pipeline_id: num('pipeline_id'),
    status_id: statusId,
    responsible_user_id: num('responsible_user_id') || undefined,
  }

  let venta: any
  try {
    venta = await call('/leads', { method: 'POST', body: JSON.stringify([{ ...base_venta, custom_fields_values: [...campos, ...rastreo] }]) })
  } catch (err) {
    // Reintento sin los datos de rastreo: son los que Kommo suele rechazar
    console.warn('Reintento sin rastreo:', err instanceof Error ? err.message : err)
    venta = await call('/leads', { method: 'POST', body: JSON.stringify([{ ...base_venta, custom_fields_values: campos }]) })
  }

  const leadId = primerId(venta)
  if (!leadId) throw new Error('Kommo no devolvió el número de la venta')

  const leadIdNum = Number(leadId)

  // Una automatización de Kommo borra a veces el campo "Medio De Pago" al
  // crear la venta (lo escribimos, aparece y unos segundos después desaparece).
  // Esperamos a que termine ese proceso y luego revisamos y reescribimos
  // los campos importantes con PATCH (cuerpo de un solo objeto: el único
  // formato que Kommo respeta en esta cuenta).
  const dormir = (ms: number) => new Promise((res) => setTimeout(res, ms))
  const requeridos = [
    { campoId: num('cf_producto'), enumId: num(`enum_producto_${pedido.cantidad}`) },
    {
      campoId: num('cf_metodo_pago'),
      enumId: pedido.metodoPago === 'Contra Entrega' ? num('enum_contraentrega') : num('enum_mercadopago'),
    },
  ]

  await dormir(2500)
  for (const req of requeridos) {
    if (!req.campoId || !req.enumId) continue
    for (let i = 0; i < 3; i++) {
      const revisa = await call(`/leads/${leadIdNum}`)
      const queda = (revisa?.custom_fields_values ?? []).some(
        (c: any) => c.field_id === req.campoId && (c.values ?? []).some((v: any) => Number(v.enum_id) === req.enumId),
      )
      if (queda) break
      await dormir(600)
      await call(`/leads/${leadIdNum}`, {
        method: 'PATCH',
        body: JSON.stringify({ id: leadIdNum, custom_fields_values: [{ field_id: req.campoId, values: [{ enum_id: req.enumId }] }] }),
      })
      await dormir(600)
    }
  }

  const revisaFinal = await call(`/leads/${leadIdNum}`)
  const confirma = (req: { campoId: number; enumId: number }) =>
    !req.campoId || !req.enumId
      ? true
      : (revisaFinal?.custom_fields_values ?? []).some(
          (c: any) => c.field_id === req.campoId && (c.values ?? []).some((v: any) => Number(v.enum_id) === req.enumId),
        )
  const camposPendientes = requeridos.filter((req) => !confirma(req))

  // Enlazar el contacto: es lo mejor posible; Kommo a veces responde 500 y
  // no se considera un error del pedido (los datos ya están en la venta).
  if (contactId && leadIdNum) {
    try {
      await call(`/leads/${leadIdNum}/link`, {
        method: 'POST',
        body: JSON.stringify({ to_entity_id: contactId, to_entity_type: 'contact' }),
      })
    } catch (err) {
      console.warn('No se pudo enlazar el contacto:', err instanceof Error ? err.message : err)
    }
  }

  return {
    leadId: leadIdNum,
    contactId: contactId ? Number(contactId) : null,
    camposPendientes,
  }
}

// Al CREAR algo, Kommo responde con un arreglo plano: [{ "id": 123 }].
// Al LEER, responde con { "_embedded": { "leads": [...] } }.
// Aceptamos las dos formas para no depender de un solo formato.
function primerId(respuesta: any): number | null {
  if (!respuesta) return null
  const directo = Array.isArray(respuesta) ? respuesta[0]?.id : respuesta?.id
  if (directo) return Number(directo)
  const embebido =
    respuesta?._embedded?.leads?.[0]?.id ??
    respuesta?._embedded?.contacts?.[0]?.id ??
    null
  return embebido ? Number(embebido) : null
}
