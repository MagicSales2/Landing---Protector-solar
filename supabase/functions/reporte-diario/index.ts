// ============================================================================
//  FUNCIÓN: reporte-diario
//  Manda a Telegram un resumen del día anterior (ventas, pedidos, errores y
//  tráfico de la página). Se ejecuta todos los días a las 10:00 (hora de
//  Colombia) mediante una tarea programada (cron) de Supabase.
//
//  Está protegida con la clave REPORTE_SECRET (va en el encabezado
//  x-reporte-secret) para que nadie la pueda llamar y esparcir reportes.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { enviarTelegram } from '../_shared/telegram.ts'

const COLOMBIA_OFFSET_MS = -5 * 3600 * 1000

function json(cuerpo: unknown, estado = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Límites (en UTC) de un día calendario colombiano, desplazado n días.
function limitesDiaColombia(desplazamiento: number): { inicio: Date; fin: Date } {
  const col = new Date(Date.now() + COLOMBIA_OFFSET_MS)
  const y = col.getUTCFullYear()
  const m = col.getUTCMonth()
  const d = col.getUTCDate() + desplazamiento
  const inicio = new Date(Date.UTC(y, m, d))
  const fin = new Date(Date.UTC(y, m, d + 1))
  return { inicio, fin }
}

const formatearCOP = (n: number) => '$ ' + n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

function fechaBonita(d: Date): string {
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
  return `${dias[d.getUTCDay()]} ${d.getUTCDate()} de ${meses[d.getUTCMonth()]}`
}

function minutosBonitos(seg: number | null): string {
  if (!seg || seg < 0) return '–'
  const m = Math.floor(seg / 60)
  const s = Math.round(seg % 60)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function promedio(numeros: number[]): number {
  if (!numeros.length) return 0
  return numeros.reduce((a, b) => a + b, 0) / numeros.length
}

Deno.serve(async (req) => {
  const secreto = Deno.env.get('REPORTE_SECRET')
  if (!secreto || req.headers.get('x-reporte-secret') !== secreto) {
    return json({ error: 'No autorizado' }, 401)
  }

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  const { inicio, fin } = limitesDiaColombia(-1)
  const isoInicio = inicio.toISOString()
  const isoFin = fin.toISOString()

  // ── Pedidos del día ──────────────────────────────────────────────────────
  const { data: pedidos } = await sb
    .from('pedidos')
    .select('payment_method, status, total_price, quantity')
    .gte('created_at', isoInicio)
    .lt('created_at', isoFin)

  let ceVenta = 0, ceTotal = 0, mpPagados = 0, mpTotal = 0, pendientes = 0
  for (const p of pedidos ?? []) {
    const total = Number(p.total_price)
    if (p.payment_method === 'Contra Entrega' && p.status !== 'cancelled') {
      ceVenta += 1
      ceTotal += total
    } else if (p.payment_method !== 'Contra Entrega') {
      if (p.status === 'pagado') {
        mpPagados += 1
        mpTotal += total
      } else if (p.status === 'pendiente_pago') {
        pendientes += 1
      }
    }
  }
  const pedidosTotales = (pedidos ?? []).length
  const facturado = ceTotal + mpTotal

  // ── Errores del día ──────────────────────────────────────────────────────
  const { count: errores } = await sb
    .from('sync_log')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'error')
    .gte('created_at', isoInicio)
    .lt('created_at', isoFin)

  // ── Tráfico del día ──────────────────────────────────────────────────────
  const { data: visitas } = await sb
    .from('visitas')
    .select('visitante_id, duracion_seg, utm_source')
    .gte('inicio', isoInicio)
    .lt('inicio', isoFin)

  const sesiones = (visitas ?? []).length
  const unicos = new Set((visitas ?? []).map((v) => v.visitante_id)).size
  const duracionProm = minutosBonitos(Math.round(promedio((visitas ?? []).map((v) => v.duracion_seg ?? 0))))
  const repite: Record<string, number> = {}
  for (const v of visitas ?? []) repite[v.visitante_id] = (repite[v.visitante_id] ?? 0) + 1
  const recurrentes = Object.values(repite).filter((n) => n > 1).length

  const fuentes: Record<string, number> = {}
  let directo = 0
  for (const v of visitas ?? []) {
    const s = (v.utm_source ?? '').trim()
    if (s) fuentes[s] = (fuentes[s] ?? 0) + 1
    else directo += 1
  }
  if (directo > 0) fuentes['directo'] = directo
  const topFuentes = Object.entries(fuentes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([f, n]) => `${f} (${n})`)
    .join(', ')

  // ── Armar y mandar el mensaje ────────────────────────────────────────────
  const lineas = [
    `📊 <b>Reporte del día ${fechaBonita(inicio)}</b>`,
    '',
    '🛒 <b>Ventas</b>',
    `Pedidos: ${pedidosTotales} · Facturado: <b>${formatearCOP(facturado)}</b>`,
    `▸ Contra Entrega: ${ceVenta} — ${formatearCOP(ceTotal)}`,
    `▸ Wompi (pagados): ${mpPagados} — ${formatearCOP(mpTotal)}`,
    `▸ Pendientes de pago: ${pendientes}`,
    errores ? `⚠️ <b>Errores del día: ${errores}</b>` : '✅ Sin errores',
    '',
    '🌐 <b>Tráfico</b>',
    `Sesiones: ${sesiones} · Visitantes únicos: ${unicos}`,
    `⏱️ Tiempo promedio en la página: ${duracionProm}`,
    `🔁 Volvieron a visitar: ${recurrentes}`,
    topFuentes ? `📣 Origen: ${topFuentes}` : '',
  ]
    .filter((l) => l !== null)
    .join('\n')

  await enviarTelegram(lineas)
  return json({ ok: true })
})