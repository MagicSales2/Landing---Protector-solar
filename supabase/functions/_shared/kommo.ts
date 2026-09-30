// ============================================================================
//  Código compartido entre las funciones del servidor.
//  Aquí vive la lógica de "enviar un pedido a Kommo":
//  contacto + venta en la etapa correcta + reparación de campos que Kommo
//  borra con su automatización.
// ============================================================================

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const ETAPA_POR_CANTIDAD: Record<number, string> = {
  1: 'status_contraentrega_1',
  2: 'status_contraentrega_2',
  3: 'status_contraentrega_3',
}

// Resumen con todo lo que Kommo necesita. Lo arma cada función a partir
// del pedido recién guardado (crear-pedido) o ya existente (confirmar-pago).
export type ResumenPedido = {
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

export type ResultadoKommo = {
  leadId: number | null
  contactId: number | null
  camposPendientes: { campoId: number; enumId: number }[]
}

export async function enviarAKommo(
  sb: SupabaseClient,
  token: string,
  pedido: ResumenPedido,
  opciones: { metodoPagoClave?: string; linkPago?: string; statusClave?: string } = {},
): Promise<ResultadoKommo> {
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

  const camposContacto = [
    { field_id: num('cf_contacto_telefono'), values: [{ value: telefono }] },
    ...(pedido.correo ? [{ field_id: num('cf_contacto_email'), values: [{ value: pedido.correo }] }] : []),
  ]
  // ¿El cliente ya existe en Kommo? Se reutiliza para no duplicar contactos.
  let contactId: number | null = null
  try {
    const encontrado = await call(`/contacts?query=${encodeURIComponent(telefono)}`)
    contactId = encontrado?._embedded?.contacts?.[0]?.id ?? null
  } catch {
    contactId = null
  }

  if (contactId) {
    // Ya existía (mismo celular): igual se deja con el nombre y teléfono
    // actuales, para que la tarjeta "contacto" siempre quede completa.
    try {
      await call(`/contacts/${contactId}`, {
        method: 'PATCH',
        body: JSON.stringify({ id: Number(contactId), name: pedido.nombre, custom_fields_values: camposContacto }),
      })
    } catch (err) {
      console.warn('No se pudo actualizar el contacto existente:', err instanceof Error ? err.message : err)
    }
  } else {
    const creado = await call('/contacts', {
      method: 'POST',
      body: JSON.stringify([{ name: pedido.nombre, custom_fields_values: camposContacto }]),
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

  // Medio de pago: se puede pasar una opción distinta a la normal
  // (ej. "Pendiente de pago" mientras Wompi no confirma el pago).
  const claveMetodo = opciones.metodoPagoClave || (pedido.metodoPago === 'Contra Entrega' ? 'enum_contraentrega' : 'enum_wompi')
  conTexto(campos, 'cf_adiciones', `Protector solar x${pedido.cantidad}`)
  conOpcion('cf_producto', `enum_producto_${pedido.cantidad}`)
  conOpcion('cf_metodo_pago', claveMetodo)
  // Link único de pago (Wompi): se guarda en el campo "Link de mercado
  // pago" para que Kommo pueda mandárselo al cliente por WhatsApp.
  conTexto(campos, 'cf_link_pago', opciones.linkPago || null)

  const statusId = opciones.statusClave
    ? num(opciones.statusClave) || num('status_pago_online')
    : pedido.metodoPago === 'Contra Entrega'
      ? num(ETAPA_POR_CANTIDAD[pedido.cantidad] ?? 'status_contraentrega_1')
      : num('status_pago_online')

  const base_venta = {
    name: `${cfg.etiqueta_origen || 'Landing'} ${pedido.id} · ${pedido.cantidad} unidad${pedido.cantidad > 1 ? 'es' : ''} · ${pedido.ciudad}`,
    price: pedido.total_price,
    pipeline_id: num('pipeline_id'),
    status_id: statusId,
    responsible_user_id: num('responsible_user_id') || undefined,
  }

  // Adjuntar el contacto dentro de la venta: es la forma que sí funciona en
  // esta cuenta (el endpoint /leads/{id}/link responde 500 siempre). Así la
  // tarjeta de la venta queda con el chip del contacto y su nombre+celular.
  const conContacto = contactId ? { _embedded: { contacts: [{ id: Number(contactId) }] } } : {}

  let venta: any
  try {
    venta = await call('/leads', {
      method: 'POST',
      body: JSON.stringify([{ ...base_venta, ...conContacto, custom_fields_values: [...campos, ...rastreo] }]),
    })
  } catch (err) {
    // Reintento sin los datos de rastreo: son los que Kommo suele rechazar
    console.warn('Reintento sin rastreo:', err instanceof Error ? err.message : err)
    venta = await call('/leads', { method: 'POST', body: JSON.stringify([{ ...base_venta, ...conContacto, custom_fields_values: campos }]) })
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
    { campoId: num('cf_metodo_pago'), enumId: num(claveMetodo) },
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

  return {
    leadId: leadIdNum,
    contactId: contactId ? Number(contactId) : null,
    camposPendientes,
  }
}

// Al CREAR algo, Kommo responde con un arreglo plano: [{ "id": 123 }].
// Al LEER, responde con { "_embedded": { "leads": [...] } }.
// Aceptamos las dos formas para no depender de un solo formato.

// Confirma el pago de un lead QUE YA EXISTE: no se crea otro, solo se cambia
// el campo "Medio De Pago" de ese mismo lead (ej. de "Pendiente de pago" a
// "Wompi"). La automatización de Kommo puede borrar el campo, así que
// se verifica y se reescribe si hace falta.
export async function marcarMetodoPago(sb: SupabaseClient, token: string, leadId: number, claveMetodo: string): Promise<boolean> {
  const { data: filas } = await sb.from('kommo_config').select('clave, valor')
  const cfg: Record<string, string> = {}
  for (const fila of filas ?? []) cfg[fila.clave] = fila.valor

  const base = `https://${cfg.subdominio}.kommo.com/api/v4`
  const campoId = Number(cfg['cf_metodo_pago'] || 0)
  const enumId = Number(cfg[claveMetodo] || 0)
  const leadIdNum = Number(leadId)
  if (!campoId || !enumId || !leadIdNum) return false

  const dormir = (ms: number) => new Promise((res) => setTimeout(res, ms))
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

  const escribe = () =>
    call(`/leads/${leadIdNum}`, {
      method: 'PATCH',
      body: JSON.stringify({ id: leadIdNum, custom_fields_values: [{ field_id: campoId, values: [{ enum_id: enumId }] }] }),
    })

  await escribe()
  for (let i = 0; i < 3; i++) {
    const revisa = await call(`/leads/${leadIdNum}`)
    const queda = (revisa?.custom_fields_values ?? []).some(
      (c: any) => c.field_id === campoId && (c.values ?? []).some((v: any) => Number(v.enum_id) === enumId),
    )
    if (queda) return true
    await dormir(600)
    await escribe()
    await dormir(600)
  }
  return false
}

// Mueve UNA venta que ya existe a otra etapa del pipeline (ej. a
// "Enviado/Despachado" cuando el pedido salió a la transportadora).
// El disparador de WhatsApp de Kommo se dispara con ese movimiento.
export async function moverLeadAEstado(sb: SupabaseClient, token: string, leadId: number, claveEtapa: string): Promise<boolean> {
  const { data: filas } = await sb.from('kommo_config').select('clave, valor')
  const cfg: Record<string, string> = {}
  for (const fila of filas ?? []) cfg[fila.clave] = fila.valor

  const statusId = Number(cfg[claveEtapa] || 0)
  const leadIdNum = Number(leadId)
  if (!statusId || !leadIdNum) return false

  const base = `https://${cfg.subdominio}.kommo.com/api/v4`
  const dormir = (ms: number) => new Promise((res) => setTimeout(res, ms))
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

  const mueve = () =>
    call(`/leads/${leadIdNum}`, {
      method: 'PATCH',
      body: JSON.stringify({ id: leadIdNum, status_id: statusId }),
    })

  await mueve()
  for (let i = 0; i < 3; i++) {
    const revisa = await call(`/leads/${leadIdNum}`)
    if (Number(revisa?.status_id) === statusId) return true
    await dormir(600)
    await mueve()
    await dormir(600)
  }
  return false
}

export function primerId(respuesta: any): number | null {
  if (!respuesta) return null
  const directo = Array.isArray(respuesta) ? respuesta[0]?.id : respuesta?.id
  if (directo) return Number(directo)
  const embebido =
    respuesta?._embedded?.leads?.[0]?.id ??
    respuesta?._embedded?.contacts?.[0]?.id ??
    null
  return embebido ? Number(embebido) : null
}