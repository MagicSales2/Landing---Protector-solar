// ============================================================================
//  Código compartido para sincronizar la Google Sheet (espejo de la base).
//  Cada pedido se envía como una fila identificada por su ID; la hoja la
//  crea o la actualiza. El nombre de cabecera de cada columna es el mismo
//  que usa el script de Apps Script (apps-script/Code.gs).
// ============================================================================

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Traduce el estado de la base al texto que se guarda en la columna "Estado".
export function estadoSheets(fila: any): string {
  switch (fila.status) {
    case 'new':
      return 'nuevo'
    case 'pendiente_pago':
      return 'espera de pago'
    case 'pagado':
      return fila.payment_method === 'Mercado Pago' ? 'mercado pago' : 'pagado'
    case 'confirmed':
      return 'impreso'
    case 'shipped':
      return 'enviado'
    case 'delivered':
      return 'entregado'
    case 'cancelled':
      return 'cancelado'
    default:
      return fila.status ?? ''
  }
}

export function normalizarCelular(valor: string): string {
  const n = (valor ?? '').replace(/\D/g, '')
  if (n.length === 12 && n.startsWith('57')) return n.slice(2)
  return n
}

export async function leerConfigSheets(sb: SupabaseClient): Promise<Record<string, string>> {
  const { data } = await sb.from('config_sheets').select('clave, valor')
  const cfg: Record<string, string> = {}
  for (const f of data ?? []) cfg[f.clave] = f.valor
  return cfg
}

// Manda el pedido completo a la hoja (la crea/actualiza su fila por ID).
// Nunca rompe el flujo: si la hoja falla, se registra en sync_log.
export async function enviarFilaASheed(sb: SupabaseClient, pedidoId: string): Promise<{ estado: 'ok' | 'off' | 'error'; detalle: string }> {
  try {
    const cfg = await leerConfigSheets(sb)
    if (cfg.activo !== 'true' || !cfg.webhook_url || !cfg.token) {
      return { estado: 'off', detalle: 'Sheets no activado' }
    }
    const { data: fila } = await sb.from('pedidos').select('*').eq('id', pedidoId).maybeSingle()
    if (!fila) return { estado: 'error', detalle: 'No se encontró el pedido' }

    const res = await fetch(cfg.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: cfg.token,
        pedido: {
          ID: fila.id,
          Numero: fila.numero ?? '',
          Fecha: fila.created_at ? new Date(fila.created_at).toISOString() : '',
          Cliente: fila.client_name ?? '',
          Celular: normalizarCelular(fila.client_phone ?? ''),
          Correo: fila.client_email ?? '',
          Documento: fila.document_id ?? '',
          Departamento: fila.department ?? '',
          Ciudad: fila.city ?? '',
          Direccion: fila.address ?? '',
          'Direccion 2': fila.address2 ?? '',
          Notas: fila.notes ?? '',
          Oferta: fila.offer_name ?? '',
          Cantidad: fila.quantity ?? '',
          Total: fila.total_price ?? '',
          'Medio de pago': fila.payment_method ?? '',
          Estado: estadoSheets(fila),
          'Lead Kommo': fila.kommo_lead_id ?? '',
          'Guia num': fila.guia_numero ?? '',
          'Guia link': fila.guia_link ?? '',
          'Guia carrier': fila.guia_carrier ?? '',
          'Guia estado': fila.guia_estado ?? '',
          'Guia error': fila.guia_error ?? '',
        },
      }),
    })
    if (!res.ok) {
      const detalle = `Sheets ${res.status}: ${(await res.text()).slice(0, 200)}`
      await sb.from('sync_log').insert({ pedido_id: pedidoId, destino: 'sheets', estado: 'error', detalle })
      return { estado: 'error', detalle }
    }
    const texto = await res.text()
    let respuesta: any = null
    try {
      respuesta = JSON.parse(texto)
    } catch {
      respuesta = texto
    }
    if (typeof respuesta === 'object' && respuesta && respuesta.ok === false) {
      const detalle = `Sheets: ${String(respuesta.error ?? respuesta).slice(0, 300)}`
      await sb.from('sync_log').insert({ pedido_id: pedidoId, destino: 'sheets', estado: 'error', detalle })
      return { estado: 'error', detalle }
    }
    return { estado: 'ok', detalle: 'Fila sincronizada en la hoja' }
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err)
    await sb.from('sync_log').insert({ pedido_id: pedidoId, destino: 'sheets', estado: 'error', detalle: detalle.slice(0, 500) })
    return { estado: 'error', detalle }
  }
}

// Dispara la sincronización de un pedido SIN frenar la respuesta al usuario.
// Si EdgeRuntime.waitUntil no está disponible, se espera igual (mejor que no
// sincronizar).
export function avisoSheets(sb: SupabaseClient, pedidoId: string) {
  const tarea = enviarFilaASheed(sb, pedidoId).catch(() => undefined)
  const rt = (globalThis as any).EdgeRuntime
  if (rt?.waitUntil) rt.waitUntil(tarea)
  else tarea.then(() => undefined)
}