// ============================================================================
//  FUNCIÓN: webhook-sheets
//  Punto de entrada de la Google Sheet. Cuando el dueño edita A MANO la hoja
//  (columna Estado, dirección, celular...), el script de Apps Script manda
//  aquí { token, orderId, cambios:[{columna, valor}] } y este se encarga de
//  actualizar la base de datos y mover la etapa en Kommo.
//
//  El acceso NO requiere sesión de administrador: se autentica con el token
//  que comparten la hoja y el sistema (config_sheets.token).
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { moverLeadAEstado } from '../_shared/kommo.ts'
import { cancelarGuia } from '../_shared/envia.ts'
import { enviarTelegram } from '../_shared/telegram.ts'
import { enviarFilaASheed, leerConfigSheets } from '../_shared/sheets.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Columna de la hoja -> columna de la base + campo de Kommo (id).
const MAPA_COLUMNA: Record<string, { db: string; kommo?: string }> = {
  Celular: { db: 'client_phone', kommo: '543554' },
  Ciudad: { db: 'city', kommo: '1430725' },
  Departamento: { db: 'department', kommo: '1430727' },
  Direccion: { db: 'address' },
  'Direccion 2': { db: 'address2', kommo: '629579' },
}

// Texto del estado en la hoja -> (status de la base, clave de etapa en
// kommo_config, o vacío si no mueve nada).
function mapearEstado(texto: string): { db: string; claveEtapa: string; mover: boolean } {
  const e = (texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  switch (e) {
    case 'impreso':
      return { db: 'confirmed', claveEtapa: '', mover: false }
    case 'enviado':
      return { db: 'shipped', claveEtapa: 'status_despachado', mover: true }
    case 'entregado':
      return { db: 'delivered', claveEtapa: 'status_entregado', mover: true }
    case 'espera de pago':
      return { db: 'pendiente_pago', claveEtapa: 'status_espera_pago', mover: true }
    case 'cancelado':
      return { db: 'cancelled', claveEtapa: 'status_cancelado', mover: true }
    case 'mercado pago':
      return { db: 'pagado', claveEtapa: 'status_mercadopago', mover: true }
    case 'nuevo':
    case 'pagado':
      return { db: e === 'nuevo' ? 'new' : 'pagado', claveEtapa: '', mover: false }
    default:
      return { db: '', claveEtapa: '', mover: false }
  }
}

function json(cuerpo: unknown, estado = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  let cuerpo: any
  try {
    cuerpo = await req.json()
  } catch {
    return json({ error: 'No se pudo leer la solicitud' }, 400)
  }

  const cfg = await leerConfigSheets(sb)
  if (String(cuerpo?.token ?? '') !== cfg.token) {
    return json({ error: 'No autorizado' }, 401)
  }

  const orderId = String(cuerpo?.orderId ?? '').trim()
  const cambios: { columna: string; valor: string }[] = Array.isArray(cuerpo?.cambios) ? cuerpo.cambios : []
  if (!orderId || cambios.length === 0) return json({ error: 'Faltan datos (orderId y cambios)' }, 400)

  const { data: fila, error } = await sb.from('pedidos').select('*').eq('id', orderId).maybeSingle()
  if (error || !fila) return json({ error: 'Pedido no encontrado' }, 404)

  const kommoToken = Deno.env.get('KOMMO_TOKEN') || ''
  const resumen: string[] = []
  const camposDB: Record<string, unknown> = {}
  let cambioEstado: { db: string; claveEtapa: string; mover: boolean } | null = null

  for (const c of cambios) {
    const columna = String(c?.columna ?? '').trim()
    const valor = String(c?.valor ?? '').trim()
    if (!columna) continue

    if (columna === 'Estado') {
      cambioEstado = mapearEstado(valor)
      if (cambioEstado.db) camposDB.status = cambioEstado.db
      resumen.push(`Estado → ${valor}`)
      continue
    }

    const mapa = MAPA_COLUMNA[columna]
    if (!mapa) continue
    camposDB[mapa.db] = valor || null
    resumen.push(`${columna} → ${valor || '(vacío)'}`)
  }

  if (Object.keys(camposDB).length === 0) {
    return json({ ok: true, cambiado: false, detalle: 'Nada que cambiar (columna no reconocida)' })
  }

  await sb.from('pedidos').update(camposDB).eq('id', orderId)

  // ── Kommo: campos de dirección / celular avisados desde la hoja ─────────
  let kommoCampos: { field_id: number; values: { value: string }[] }[] | null = null
  for (const c of cambios) {
    const mapa = MAPA_COLUMNA[String(c?.columna ?? '')]
    if (mapa?.kommo && fila.kommo_lead_id) {
      kommoCampos = kommoCampos ?? []
      kommoCampos.push({
        field_id: Number(mapa.kommo),
        values: [{ value: String(c?.valor ?? '').trim() || ' ' }],
      })
    }
  }
  if (kommoCampos && fila.kommo_lead_id && kommoToken) {
    try {
      const base = `https://${(await sb.from('kommo_config').select('valor').eq('clave', 'subdominio').maybeSingle()).data?.valor ?? 'magiapastelerta4'}.kommo.com/api/v4`
      const res = await fetch(`${base}/leads/${fila.kommo_lead_id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${kommoToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: Number(fila.kommo_lead_id), custom_fields_values: kommoCampos }),
      })
      if (res.status === 204 || res.ok) {
        await sb.from('sync_log').insert({ pedido_id: orderId, destino: 'kommo', estado: 'ok', detalle: `Cambio desde Sheets: ${resumen.join(', ')}` })
      } else {
        await sb.from('sync_log').insert({ pedido_id: orderId, destino: 'kommo', estado: 'error', detalle: `Kommo ${res.status} al aplicar cambios de Sheets` })
      }
    } catch (err) {
      await sb.from('sync_log').insert({ pedido_id: orderId, destino: 'kommo', estado: 'error', detalle: (err instanceof Error ? err.message : String(err)).slice(0, 500) })
    }
  }

  // ── Kommo: etapa (Estado desde Sheets) ───────────────────────────────────
  let estadoKommo = ''
  if (cambioEstado?.mover && fila.kommo_lead_id && kommoToken) {
    try {
      const ok = await moverLeadAEstado(sb, kommoToken, Number(fila.kommo_lead_id), cambioEstado.claveEtapa)
      estadoKommo = ok ? '✅ etapa movida en Kommo' : '⚠️ Kommo no confirmó el cambio de etapa'
      await sb.from('sync_log').insert({
        pedido_id: orderId,
        destino: 'kommo',
        estado: ok ? 'ok' : 'aviso',
        detalle: `Desde Sheets: etapa → ${cambioEstado.claveEtapa}`,
      })
      if (cambioEstado.db === 'shipped') {
        await enviarTelegram(`📦 <b>Cambio manual en la hoja</b>\n🧾 <code>${orderId}</code> pasó a <b>enviado</b> → venta movida a "Enviado" en Kommo${estadoKommo.includes('✅') ? ' ✅' : ''}`)
      }
    } catch (err) {
      estadoKommo = `⚠️ Kommo: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  // Pedido cancelado desde la hoja: se cancela también la guía de envío.
  let guiaResumen = ''
  if (cambioEstado?.db === 'cancelled' && fila.guia_numero && fila.guia_estado !== 'cancelada') {
    const enviaToken = Deno.env.get('ENVIA_TOKEN') || ''
    const carrier = String(fila.guia_carrier ?? '').split(' · ')[0]
    const resultado = await cancelarGuia(enviaToken, carrier, String(fila.guia_numero))
    const cancelada = resultado && !/error|no pudo|cannot|couldn't|invalid|not found/i.test(resultado)
    await sb.from('pedidos').update({ guia_estado: cancelada ? 'cancelada' : 'cancel_error', guia_error: cancelada ? null : String(resultado).slice(0, 500) }).eq('id', orderId)
    guiaResumen = cancelada ? 'guía cancelada' : `⚠️ guía no se pudo cancelar (${String(resultado).slice(0, 120)})`
  }

  // Devuelve la copia actualizada del pedido a la hoja (para que la fila
  // siempre refleje el estado real, incluidos cambios hechos en Kommo).
  await enviarFilaASheed(sb, orderId)

  return json({
    ok: true,
    cambiado: true,
    orderId,
    detalle: resumen.join(' · '),
    kommo: estadoKommo || (kommoCampos ? '✅ campos de Kommo actualizados' : ''),
    guia: guiaResumen,
  })
})