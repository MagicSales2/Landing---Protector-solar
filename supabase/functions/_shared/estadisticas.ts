// ============================================================================
//  Código compartido: estadísticas para el bot de Telegram.
//  Calcula resúmenes de ventas y de tráfico para un rango de fechas, para que
//  el bot pueda responder preguntas como "ventas de hoy" o "visitas del mes".
// ============================================================================

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type ResumenVentas = {
  pedidos: number
  facturado: number
  cobrado: number
  ceTotal: number
  ceSuma: number
  cePorEnviar: number
  ceConfirmados: number
  ceDespachados: number
  ceEntregados: number
  ceCancelados: number
  cePorCobrar: number
  ceSumaEntregados: number
  mpPendientes: number
  mpPagados: number
  mpSuma: number
  errores: number
}

export type ResumenTrafico = {
  sesiones: number
  unicos: number
  recurrentes: number
  duracionPromSeg: number
  fuentes: [string, number][]
}

export async function resumenVentas(sb: SupabaseClient, inicioIso: string, finIso: string): Promise<ResumenVentas> {
  const r: ResumenVentas = {
    pedidos: 0,
    facturado: 0,
    cobrado: 0,
    ceTotal: 0,
    ceSuma: 0,
    cePorEnviar: 0,
    ceConfirmados: 0,
    ceDespachados: 0,
    ceEntregados: 0,
    ceCancelados: 0,
    cePorCobrar: 0,
    ceSumaEntregados: 0,
    mpPendientes: 0,
    mpPagados: 0,
    mpSuma: 0,
    errores: 0,
  }

  const { data: pedidos } = await sb
    .from('pedidos')
    .select('payment_method, status, total_price')
    .gte('created_at', inicioIso)
    .lt('created_at', finIso)

  for (const p of pedidos ?? []) {
    const total = Number(p.total_price)
    if (p.payment_method === 'Contra Entrega') {
      r.ceTotal += 1
      switch (p.status) {
        case 'new': r.cePorEnviar += 1; break
        case 'confirmed': r.ceConfirmados += 1; break
        case 'shipped': r.ceDespachados += 1; break
        case 'delivered':
          r.ceEntregados += 1
          r.ceSumaEntregados += total
          break
        case 'cancelled': r.ceCancelados += 1; break
      }
      if (p.status !== 'cancelled') r.ceSuma += total
      if (p.status !== 'delivered' && p.status !== 'cancelled') r.cePorCobrar += 1
    } else if (p.payment_method !== 'Contra Entrega') {
      if (p.status === 'pendiente_pago') r.mpPendientes += 1
      if (p.status === 'pagado') {
        r.mpPagados += 1
        r.mpSuma += total
      }
    }
  }

  r.pedidos = (pedidos ?? []).filter((p) => p.status !== 'cancelled').length
  r.facturado = r.ceSuma + r.mpSuma
  r.cobrado = r.ceSumaEntregados + r.mpSuma

  const { count: errores } = await sb
    .from('sync_log')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'error')
    .gte('created_at', inicioIso)
    .lt('created_at', finIso)
  r.errores = errores ?? 0

  return r
}

export async function resumenTrafico(sb: SupabaseClient, inicioIso: string, finIso: string): Promise<ResumenTrafico> {
  const { data: visitas } = await sb
    .from('visitas')
    .select('visitante_id, duracion_seg, utm_source')
    .gte('inicio', inicioIso)
    .lt('inicio', finIso)

  const lista = visitas ?? []
  const sesiones = lista.length
  const unicos = new Set(lista.map((v) => v.visitante_id)).size
  const dur = lista.map((v) => v.duracion_seg ?? 0).filter((d) => d > 0)
  const duracionPromSeg = dur.length ? Math.round(dur.reduce((a, b) => a + b, 0) / dur.length) : 0

  const repite: Record<string, number> = {}
  for (const v of lista) repite[v.visitante_id] = (repite[v.visitante_id] ?? 0) + 1
  const recurrentes = Object.values(repite).filter((n) => n > 1).length

  const fuentes: Record<string, number> = {}
  let directo = 0
  for (const v of lista) {
    const s = (v.utm_source ?? '').trim()
    if (s) fuentes[s] = (fuentes[s] ?? 0) + 1
    else directo += 1
  }
  if (directo > 0) fuentes['directo'] = directo
  const top = Object.entries(fuentes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6) as [string, number][]

  return { sesiones, unicos, recurrentes, duracionPromSeg, fuentes: top }
}