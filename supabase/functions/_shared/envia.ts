// ============================================================================
//  Código compartido para las guías de envío con Envia.com.
//  Cotiza entre varias transportadoras (Colombia), elige la más económica y
//  genera la guía. Guarda el número + enlace de seguimiento en el pedido y en
//  el campo de Kommo "link guia envio".
//  Las guías solo se cobran cuando la transportadora recibe físicamente el
//  paquete; crearlas/cancelarlas no cuesta.
// ============================================================================

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BASE = 'https://api.envia.com'

// Códigos de departamento de Colombia en el formato que usa Envia (2 letras).
const CODES_DEPARTAMENTO: Record<string, string> = {
  AMAZONAS: 'AM',
  ANTIOQUIA: 'AN',
  ARAUCA: 'AR',
  ATLANTICO: 'AT',
  BOLIVAR: 'BO',
  BOYACA: 'BY',
  CALDAS: 'CA',
  CAQUETA: 'CQ',
  CASANARE: 'CS',
  CAUCA: 'CC',
  CESAR: 'CE',
  CHOCO: 'CH',
  CORDOBA: 'CO',
  CUNDINAMARCA: 'CN',
  GUAINIA: 'GU',
  GUAVIARE: 'GV',
  HUILA: 'HU',
  'LA GUAJIRA': 'LG',
  MAGDALENA: 'MA',
  META: 'ME',
  NARINO: 'NA',
  'NORTE DE SANTANDER': 'NS',
  PUTUMAYO: 'PU',
  QUINDIO: 'QI',
  RISARALDA: 'RI',
  'SAN ANDRES Y PROVIDENCIA': 'SA',
  SANTANDER: 'SC',
  SUCRE: 'SU',
  TOLIMA: 'TO',
  'VALLE DEL CAUCA': 'VC',
  VAUPES: 'VP',
  VICHADA: 'VI',
  'BOGOTA D.C.': 'CN',
  'BOGOTA DC': 'CN',
  BOGOTA: 'CN',
  'BOGOTA D C': 'CN',
}

function normalizar(txt: string): string {
  return txt
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

export function codigoDepartamento(departamento: string): string | null {
  if (!departamento) return null
  return CODES_DEPARTAMENTO[normalizar(departamento)] ?? null
}

// Envia pide el número (o placa) por separado de la calle. Para direcciones
// colombianas tipo "Carrera 7 # 72-41" el número es lo que sigue al "#".
function numeroDeCalle(street: string): string {
  const trasAlmohadilla = street.match(/#\s*([0-9A-Za-z\- ]+)/)
  if (trasAlmohadilla) return trasAlmohadilla[1].trim().slice(0, 20)
  const final = street.match(/(\d+\s*-?\s*\d*)\s*$/)
  return final ? final[1].trim().slice(0, 20) : ''
}

export async function leerConfigEnvia(sb: SupabaseClient): Promise<Record<string, string>> {
  const { data: filas } = await sb.from('config_envia').select('clave, valor')
  const cfg: Record<string, string> = {}
  for (const f of filas ?? []) cfg[f.clave] = f.valor
  return cfg
}

async function llamar(ruta: string, token: string, cuerpo: unknown): Promise<any> {
  const cabeceras: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) cabeceras['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}${ruta}`, {
    method: 'POST',
    headers: cabeceras,
    body: JSON.stringify(cuerpo),
  })
  const texto = await res.text()
  let respuesta: any = null
  try {
    respuesta = texto ? JSON.parse(texto) : null
  } catch { /* cuerpo no JSON */ }

  // Envia a veces responde HTTP 200 con un error adentro (meta: "error"),
  // así que tratamos los dos casos como fallo.
  const hayErrorEnBody = respuesta?.meta === 'error'
  if (!res.ok || hayErrorEnBody) {
    const e = respuesta?.error ?? {}
    const mensaje = e?.message || (hayErrorEnBody ? JSON.stringify(respuesta) : texto)
    throw new Error(`Envia ${e?.code ?? res.status}: ${String(mensaje).slice(0, 300)}`)
  }
  return respuesta
}

async function localizarCiudad(ciudad: string, estado: string): Promise<string> {
  // /locate no requiere autenticación.
  const r = await llamar('/locate', '', { city: ciudad, state: estado, country: 'CO' })
  const dane = r?.city
  if (!dane) throw new Error('Envia: no se pudo localizar la ciudad del cliente')
  return String(dane)
}

type Destino = {
  nombre: string
  telefono: string
  ciudadDane: string
  estado: string
  direccion: string
}

type Paquete = {
  contenido: string
  peso: number
  valor: number
}

type Cotizacion = {
  carrier: string
  service: string
  serviceDescription: string
  totalPrice: number
  dropOff: number
}

/* Cotiza en cada transportadora configurada y devuelve todas las opciones
  ordenadas de menor a mayor precio. Para grados de recaudo (contra entrega)
  incluye el servicio cash_on_delivery por el valor del pedido. */
export async function cotizarGuia(
  token: string,
  cfg: Record<string, string>,
  destino: Destino,
  paquete: Paquete,
  conRecaudo: boolean,
): Promise<Cotizacion[]> {
  const transportadoras: string[] = (JSON.parse(cfg.transportadoras ?? '["coordinadora"]') as string[]).slice(0, 6)
  const origen = {
    name: cfg.origen_nombre || 'Magia',
    company: cfg.origen_nombre || 'Magia',
    email: cfg.origen_email || '',
    phone: cfg.origen_telefono || '',
    street: cfg.origen_direccion || '',
    district: cfg.origen_barrio || '',
    city: cfg.origen_ciudad_medellin || '',
    state: cfg.origen_estado || 'AN',
    country: cfg.origen_pais || 'CO',
    postalCode: cfg.origen_codigo || '',
  } as Record<string, string>

  const ciudadDaneOrigen = await localizarCiudad(cfg.origen_ciudad || 'Medellin', cfg.origen_estado || 'AN')
  origen.city = ciudadDaneOrigen
  origen.postalCode = ciudadDaneOrigen
  origen.number = numeroDeCalle(cfg.origen_direccion || '')

  const basePaquete: Record<string, unknown> = {
    type: 'box',
    content: paquete.contenido,
    amount: 1,
    declaredValue: paquete.valor,
    lengthUnit: 'CM',
    weightUnit: 'KG',
    weight: paquete.peso,
    dimensions: {
      length: Number(cfg.largo_cm || 12),
      width: Number(cfg.ancho_cm || 5),
      height: Number(cfg.alto_cm || 2),
    },
  }
  if (conRecaudo) {
    basePaquete.additionalServices = [{ data: { amount: String(paquete.valor) }, service: 'cash_on_delivery' }]
  }

  const cuerpo = {
    origin: { ...origen },
    destination: {
      name: destino.nombre.slice(0, 60),
      company: '',
      email: '',
      phone: destino.telefono,
      street: destino.direccion.slice(0, 120),
      district: '',
      city: destino.ciudadDane,
      state: destino.estado,
      country: 'CO',
      reference: '',
      postalCode: destino.ciudadDane,
      number: numeroDeCalle(destino.direccion),
    },
    packages: [basePaquete],
    shipment: { type: 1 },
    settings: { currency: 'COP', printFormat: 'PDF', printSize: 'PAPER_4X6' },
  }

  const opciones: Cotizacion[] = []
  for (const carrier of transportadoras) {
    try {
      const r = await llamar('/ship/rate/', token, { ...cuerpo, shipment: { type: 1, carrier } })
      for (const o of r?.data ?? []) {
        opciones.push({
          carrier: o.carrier || carrier,
          service: o.service,
          serviceDescription: o.serviceDescription || o.service,
          totalPrice: Number(o.totalPrice ?? o.basePrice ?? 0),
          dropOff: Number(o.dropOff ?? 0),
        })
      }
    } catch (err) {
      // Una transportadora falla (por ejemplo, sin servicio para el recaudo):
      // se omite y seguimos con las demás.
      console.warn(`Cotización ${carrier} falló:`, err instanceof Error ? err.message : err)
    }
  }

  // Preferencia: primero las transportadoras según el orden configurado
  // (config_envia.transportadoras), y dentro de cada una la tarifa más barata.
  // Así "coordinadora" se usa primero por defecto y el resto son respaldo.
  const prioridad = new Map(transportadoras.map((t, i) => [String(t).toLowerCase(), i]))
  return opciones.sort((a, b) => {
    const pa = prioridad.has(String(a.carrier).toLowerCase()) ? prioridad.get(String(a.carrier).toLowerCase())! : Number.MAX_SAFE_INTEGER
    const pb = prioridad.has(String(b.carrier).toLowerCase()) ? prioridad.get(String(b.carrier).toLowerCase())! : Number.MAX_SAFE_INTEGER
    return pa - pb || a.totalPrice - b.totalPrice || a.dropOff - b.dropOff
  })
}

/* Genera la guía con la transportadora indicada. Devuelve el número, el
  enlace de seguimiento y el link del PDF de la etiqueta. */
export async function generarGuiaEnvia(
  token: string,
  cfg: Record<string, string>,
  cotizacion: Cotizacion,
  destino: Destino,
  paquete: Paquete,
  conRecaudo: boolean,
  orderReference: string,
): Promise<{ numero: string; link: string; label: string; carrier: string; costo: number }> {
  const ciudadDaneOrigen = await localizarCiudad(cfg.origen_ciudad || 'Medellin', cfg.origen_estado || 'AN')
  const basePaquete: Record<string, unknown> = {
    type: 'box',
    content: paquete.contenido,
    amount: 1,
    declaredValue: paquete.valor,
    lengthUnit: 'CM',
    weightUnit: 'KG',
    weight: paquete.peso,
    dimensions: {
      length: Number(cfg.largo_cm || 12),
      width: Number(cfg.ancho_cm || 5),
      height: Number(cfg.alto_cm || 2),
    },
  }
  if (conRecaudo) {
    basePaquete.additionalServices = [{ data: { amount: String(paquete.valor) }, service: 'cash_on_delivery' }]
  }

  const cuerpo = {
    origin: {
      name: cfg.origen_nombre || 'Magia',
      company: cfg.origen_nombre || 'Magia',
      email: cfg.origen_email || '',
      phone: cfg.origen_telefono || '',
      street: cfg.origen_direccion || '',
      district: cfg.origen_barrio || '',
      city: ciudadDaneOrigen,
      state: cfg.origen_estado || 'AN',
      country: cfg.origen_pais || 'CO',
      postalCode: ciudadDaneOrigen,
      number: numeroDeCalle(cfg.origen_direccion || ''),
    },
    destination: {
      name: destino.nombre.slice(0, 60),
      company: '',
      email: '',
      phone: destino.telefono,
      street: destino.direccion.slice(0, 120),
      district: '',
      city: destino.ciudadDane,
      state: destino.estado,
      country: 'CO',
      reference: '',
      postalCode: destino.ciudadDane,
      number: numeroDeCalle(destino.direccion),
    },
    packages: [basePaquete],
    shipment: { type: 1, carrier: cotizacion.carrier, service: cotizacion.service, orderReference },
    settings: { currency: 'COP', printFormat: 'PDF', printSize: 'PAPER_4X6' },
  }

  const r = await llamar('/ship/generate/', token, cuerpo)
  const lista = Array.isArray(r?.data) ? r.data : Array.isArray(r?.results) ? r.results : []
  const dato = lista[0] ?? r
  const paqueteGenerado = Array.isArray(dato?.packages) ? dato.packages[0] : dato?.package
  return {
    numero: String(dato.trackingNumber ?? dato.tracking_number ?? dato.shipmentId ?? dato.folio ?? ''),
    link: String(dato.trackUrl ?? dato.trackingUrl ?? dato.tracking_url ?? paqueteGenerado?.trackUrl ?? dato.label ?? ''),
    label: String(dato.label ?? dato.labelUrl ?? dato.label_url ?? ''),
    carrier: `${dato.carrier ?? cotizacion.carrier} · ${dato.service ?? dato.serviceDescription ?? cotizacion.service}`,
    costo: Number(dato.totalPrice ?? dato.costo ?? dato.cost ?? paqueteGenerado?.totalPrice ?? 0),
  }
}

/* Guarda el enlace de la guía en el campo de Kommo "link guia envio" (best
  effort: si Kommo falla se avisa pero no se rompe el pedido). */
async function ponerLinkEnKommo(sb: SupabaseClient, token: string, leadId: number, link: string): Promise<boolean> {
  if (!leadId || !link || !token) return false
  const { data: filas } = await sb.from('kommo_config').select('clave, valor')
  const cfg: Record<string, string> = {}
  for (const f of filas ?? []) cfg[f.clave] = f.valor
  const campoId = Number(cfg['cf_link_guia'] || 0)
  if (!campoId) return false

  const base = `https://${cfg.subdominio}.kommo.com/api/v4`
  const dormir = (ms: number) => new Promise((res) => setTimeout(res, ms))
  const call = async (ruta: string, opciones: RequestInit = {}): Promise<any> => {
    const res = await fetch(`${base}${ruta}`, {
      ...opciones,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opciones.headers ?? {}) },
    })
    if (res.status === 204) return null
    const cuerpo = await res.text()
    if (!res.ok) throw new Error(`Kommo ${res.status}: ${cuerpo.slice(0, 200)}`)
    return cuerpo ? JSON.parse(cuerpo) : null
  }

  const escribe = () =>
    call(`/leads/${leadId}`, {
      method: 'PATCH',
      body: JSON.stringify({ id: leadId, custom_fields_values: [{ field_id: campoId, values: [{ value: link }] }] }),
    })

  try {
    await escribe()
    for (let i = 0; i < 3; i++) {
      const revisa = await call(`/leads/${leadId}`)
      const queda = (revisa?.custom_fields_values ?? []).some(
        (c: any) => c.field_id === campoId && (c.values ?? []).some((v: any) => String(v.value ?? '') === link),
      )
      if (queda) return true
      await dormir(600)
      await escribe()
      await dormir(600)
    }
    return false
  } catch (err) {
    console.warn('Kommo no aceptó el link de la guía:', err instanceof Error ? err.message : err)
    return false
  }
}

export type ResultadoGuia = {
  ok: boolean
  omitido?: boolean
  error?: string
  numero?: string
  link?: string
  carrier?: string
  costo?: number
  kommoOk?: boolean
}

/* Flujo completo para UN pedido: cotiza, elige la más económica y crea la
  guía. Para contra entrega (conRecaudo=true) intenta con cash_on_delivery;
  si la más barata no lo soporta, prueba con la siguiente. Actualiza el
  pedido, registra en sync_log y guarda el link en Kommo. */
export async function generarGuiaPedido(
  sb: SupabaseClient,
  enviaToken: string,
  kommoToken: string,
  pedido: {
    id: string
    numero?: string | null
    client_name: string
    client_phone: string
    city: string
    department: string
    address: string
    address2: string
    notes: string
    quantity: number
    total_price: number
    kommo_lead_id?: number | null
  },
  conRecaudo: boolean,
): Promise<ResultadoGuia> {
  const cfg = await leerConfigEnvia(sb)
  if (cfg.activo !== 'true' || !enviaToken) {
    return { ok: false, omitido: true }
  }

  const estado = codigoDepartamento(pedido.department)
  if (!estado) {
    const err = `Departamento no reconocido: ${pedido.department}`
    await sb.from('pedidos').update({ guia_estado: 'error', guia_error: err.slice(0, 500) }).eq('id', pedido.id)
    await sb.from('sync_log').insert({ pedido_id: pedido.id, destino: 'envia', estado: 'error', detalle: err.slice(0, 500) })
    return { ok: false, error: err }
  }

  const direccion = [pedido.address, pedido.address2].filter(Boolean).join(' · ')
  if (direccion.length < 5) {
    const err = 'Dirección del cliente incompleta para crear la guía'
    await sb.from('pedidos').update({ guia_estado: 'error', guia_error: err }).eq('id', pedido.id)
    await sb.from('sync_log').insert({ pedido_id: pedido.id, destino: 'envia', estado: 'error', detalle: err })
    return { ok: false, error: err }
  }

  try {
    const ciudadDane = await localizarCiudad(pedido.city, estado)
    const destino: Destino = {
      nombre: pedido.client_name,
      telefono: String(pedido.client_phone).replace(/\D/g, '').slice(0, 12),
      ciudadDane,
      estado,
      direccion,
    }
    const peso = Math.max(Number(cfg.peso_por_unidad || 0.3), 0.1) * Math.max(pedido.quantity, 1)
    const paquete: Paquete = {
      contenido: `Protector solar x${pedido.quantity}`,
      peso,
      valor: Number(pedido.total_price),
    }

    // Información parcial que guardamos mientras trabajamos.
    let ultimoError = 'No hubo transportadora disponible'
    let sinSaldo = false
    let guia: { numero: string; link: string; label: string; carrier: string; costo: number } | null = null

    for (let intento = 0; intento < 2; intento++) {
      const opciones = await cotizarGuia(enviaToken, cfg, destino, paquete, conRecaudo)
      if (!opciones.length) continue
      for (const opcion of opciones) {
        try {
          guia = await generarGuiaEnvia(enviaToken, cfg, opcion, destino, paquete, conRecaudo, pedido.id)
          ultimoError = ''
          break
        } catch (err) {
          const mensaje = err instanceof Error ? err.message : String(err)
          ultimoError = mensaje
          if (/not enough money|insufficient|balance/i.test(mensaje)) sinSaldo = true
          continue
        }
      }
      if (guia) break
    }

    if (!guia) {
      const err = sinSaldo
        ? 'Saldo insuficiente en Envia.com (recarga saldo o registra una tarjeta para generar guías)'
        : ultimoError || 'No se pudo crear la guía'
      await sb.from('pedidos').update({ guia_estado: 'error', guia_error: err.slice(0, 500) }).eq('id', pedido.id)
      await sb.from('sync_log').insert({ pedido_id: pedido.id, destino: 'envia', estado: 'error', detalle: err.slice(0, 500) })
      return { ok: false, error: err }
    }

    // Alguna respuesta quedó sin número: no es una guía real.
    if (!guia.numero && !guia.label) {
      const err = 'Envia.com no devolvió la guía (revisa el saldo disponible en tu cuenta)'
      await sb.from('pedidos').update({ guia_estado: 'error', guia_error: err }).eq('id', pedido.id)
      await sb.from('sync_log').insert({ pedido_id: pedido.id, destino: 'envia', estado: 'error', detalle: err })
      return { ok: false, error: err }
    }

    await sb
      .from('pedidos')
      .update({
        guia_numero: guia.numero,
        guia_link: guia.link,
        guia_label: guia.label,
        guia_carrier: guia.carrier,
        guia_costo: guia.costo,
        guia_estado: 'creada',
        guia_creado_en: new Date().toISOString(),
        guia_error: null,
      })
      .eq('id', pedido.id)

    const kommoOk = await ponerLinkEnKommo(sb, kommoToken, Number(pedido.kommo_lead_id ?? 0), guia.link)
    await sb
      .from('sync_log')
      .insert({
        pedido_id: pedido.id,
        destino: 'envia',
        estado: 'ok',
        detalle: `Guía ${guia.numero} ${guia.carrier} $${guia.costo}${kommoOk ? ' · link en Kommo' : ' · Kommo no recibió el link'}`,
      })

    return {
      ok: true,
      numero: guia.numero,
      link: guia.link,
      carrier: guia.carrier,
      costo: guia.costo,
      kommoOk,
    }
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err)
    await sb.from('pedidos').update({ guia_estado: 'error', guia_error: detalle.slice(0, 500) }).eq('id', pedido.id)
    await sb.from('sync_log').insert({ pedido_id: pedido.id, destino: 'envia', estado: 'error', detalle: detalle.slice(0, 500) })
    return { ok: false, error: detalle }
  }
}

/* Cancela una guía ya generada (pedido cancelado). Solo se puede mientras la
  transportadora no haya recibido el paquete. */
export async function cancelarGuia(token: string, carrier: string, tracking: string): Promise<string | null> {
  if (!token || !carrier || !tracking) return null
  try {
    const r = await llamar('/ship/cancel/', token, { carrier, trackingNumber: tracking })
    const estado = r?.results?.[0]?.status ?? r?.status ?? 'aceptada'
    return String(estado)
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}