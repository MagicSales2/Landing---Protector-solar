// ============================================================================
//  FUNCIÓN: bot-telegram
//  Es el "cerebro" del bot: Telegram le manda cada mensaje que recibe el bot
//  (vía webhook) y acá se responde con datos en vivo de la tienda.
//
//  Ejemplos de preguntas que entiende:
//    "ventas de hoy"           → pedidos, facturado, CE/MP, por enviar...
//    "cuántas contra entrega"  → conteo de pedidos de Contra Entrega
//    "cuántos faltan por enviar"
//    "visitas de este mes"     → tráfico (sesiones, únicos, fuentes)
//    "errores del día"
//
//  Solo responde al dueño (el chat configurado en TELEGRAM_CHAT_ID) y solo a
//  mensajes reales de Telegram (verifica TELEGRAM_WEBHOOK_SECRET).
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resumenVentas, resumenTrafico, ResumenVentas, ResumenTrafico } from '../_shared/estadisticas.ts'

const COLOMBIA_OFFSET_MS = -5 * 3600 * 1000

function json(cuerpo: unknown, estado = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'Content-Type': 'application/json' },
  })
}

function esc(texto: string | number): string {
  return String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const formatearCOP = (n: number) => '$ ' + n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

function limitesDiaColombia(desplazamiento: number): { inicio: Date; fin: Date } {
  const col = new Date(Date.now() + COLOMBIA_OFFSET_MS)
  const y = col.getUTCFullYear()
  const m = col.getUTCMonth()
  const d = col.getUTCDate() + desplazamiento
  const inicio = new Date(Date.UTC(y, m, d))
  const fin = new Date(Date.UTC(y, m, d + 1))
  return { inicio, fin }
}

// Según lo que pregunte, define el periodo ("de hoy", "de ayer", "del mes"...).
function detectarPeriodo(texto: string): { inicioIso: string; finIso: string; nombre: string } {
  const t = texto.toLowerCase()
  if (t.includes('ayer')) {
    const { inicio, fin } = limitesDiaColombia(-1)
    return { inicioIso: inicio.toISOString(), finIso: fin.toISOString(), nombre: 'de ayer' }
  }
  if (t.includes('mes')) {
    const col = new Date(Date.now() + COLOMBIA_OFFSET_MS)
    const inicio = new Date(Date.UTC(col.getUTCFullYear(), col.getUTCMonth(), 1))
    return { inicioIso: inicio.toISOString(), finIso: new Date().toISOString(), nombre: 'de este mes' }
  }
  if (t.includes('semana')) {
    const inicio = new Date(Date.now() - 7 * 24 * 3600 * 1000)
    return { inicioIso: inicio.toISOString(), finIso: new Date().toISOString(), nombre: 'de la última semana' }
  }
  if (t.includes('hoy') || t.includes('dia') || t.includes('día')) {
    const { inicio, fin } = limitesDiaColombia(0)
    return { inicioIso: inicio.toISOString(), finIso: new Date().toISOString(), nombre: 'de hoy' }
  }
  const { inicio, fin } = limitesDiaColombia(0)
  return { inicioIso: inicio.toISOString(), finIso: new Date().toISOString(), nombre: 'de hoy' }
}

function mensajeVentas(r: ResumenVentas, nombre: string): string {
  const lineas = [
    `📊 <b>Ventas ${nombre}</b>`,
    `🛒 Pedidos: ${r.pedidos} · 💵 Facturado: <b>${formatearCOP(r.facturado)}</b>`,
    `💚 Cobrado (entregados + MP pagados): ${formatearCOP(r.cobrado)}`,
    '',
    `🧾 <b>Contra Entrega</b> (${r.ceTotal} pedidos):`,
    `▸ 📦 Por enviar (nuevos): ${r.cePorEnviar}`,
    `▸ ✅ Confirmados: ${r.ceConfirmados}`,
    `▸ 🚚 Despachados: ${r.ceDespachados}`,
    `▸ ✔️ Entregados: ${r.ceEntregados}`,
    `▸ 💰 Aún por cobrar: ${r.cePorCobrar}`,
    `▸ ❌ Cancelados: ${r.ceCancelados}`,
    '',
    `🔵 <b>Mercado Pago</b>:`,
    `▸ ⏳ Pendientes de pago: ${r.mpPendientes}`,
    `▸ 💳 Pagados: ${r.mpPagados} — ${formatearCOP(r.mpSuma)}`,
    r.errores ? '' : `✅ Sin errores`,
    r.errores ? `⚠️ <b>Errores del periodo: ${r.errores}</b>` : '',
  ]
  return lineas.filter((l) => l !== '').join('\n')
}

function mensajeTrafico(r: ResumenTrafico, nombre: string): string {
  const min = Math.floor(r.duracionPromSeg / 60)
  const seg = r.duracionPromSeg % 60
  const tiempo = r.duracionPromSeg > 0 ? (min > 0 ? `${min}m ${seg}s` : `${seg}s`) : '–'
  const fuentes = r.fuentes.length ? r.fuentes.map(([f, n]) => `${esc(f)} (${n})`).join(', ') : '–'
  return [
    `🌐 <b>Tráfico ${nombre}</b>`,
    `Sesiones: ${r.sesiones} · Visitantes únicos: ${r.unicos}`,
    `⏱️ Tiempo promedio en la página: ${tiempo}`,
    `🔁 Volvieron a visitar: ${r.recurrentes}`,
    `📣 Origen: ${fuentes}`,
  ].join('\n')
}

const AYUDA = [
  '🤖 <b>Asistente de la tienda</b> — pregúntame cosas así:',
  '• "ventas de hoy"',
  '• "cuántas contra entrega hay"',
  '• "cuántos faltan por enviar"',
  '• "cuántos despachados / entregados"',
  '• "ventas de ayer"',
  '• "pendientes de pago"',
  '• "visitas de este mes"',
  '• "visitas de la semana"',
  '• "errores del día"',
  '',
  'Funcionan: hoy · ayer · semana · mes.',
].join('\n')

async function responder(chatId: number, texto: string): Promise<void> {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN')
  if (!token) return
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: texto.slice(0, 3500),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    })
  } catch (err) {
    console.error('No se pudo responder por Telegram:', err instanceof Error ? err.message : err)
  }
}

function resolverPregunta(texto: string, r: ResumenVentas, t: ResumenTrafico, nombre: string): { tipo: string; mensaje: string } {
  const tNorm = texto.toLowerCase()
  if (/ayuda|comandos|qu[eé] puedes|como funciona|cómo funciona/.test(tNorm)) {
    return { tipo: 'ayuda', mensaje: AYUDA }
  }
  if (/hola|buenas|q[uú] mas|que mas|buen dia|buen d[ií]a/.test(tNorm)) {
    return {
      tipo: 'saludo',
      mensaje: `👋 ¡Hola! Soy el asistente de la tienda.\n\nPregúntame, por ejemplo: "ventas de hoy", "cuántos faltan por enviar" o "visitas de este mes".\n\nEscribe "ayuda" para ver todo lo que sé hacer.`,
    }
  }
  if (/error|fall[aó]|problema/.test(tNorm)) {
    return {
      tipo: 'errores',
      mensaje: r.errores
        ? `⚠️ <b>Errores ${nombre}: ${r.errores}</b>\nRevisá el detalle en el panel o avisame si son repetidos.`
        : `✅ Sin errores ${nombre}. Todo funcionando.`,
    }
  }
  if (/visit|tr[aá]fico|trafico|clics|entradas/.test(tNorm)) {
    return { tipo: 'trafico', mensaje: mensajeTrafico(t, nombre) }
  }
  return { tipo: 'ventas', mensaje: mensajeVentas(r, nombre) }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({ ok: true })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  // Solo Telegram entrega actualizaciones (vía el secreto del webhook).
  const secreto = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')
  if (!secreto || req.headers.get('x-telegram-bot-api-secret-token') !== secreto) {
    return json({ error: 'No autorizado' }, 403)
  }

  let update: any
  try {
    update = await req.json()
  } catch {
    return json({ error: 'No se pudo leer' }, 400)
  }

  const msg = update?.message
  const chatId = Number(msg?.chat?.id ?? NaN)
  const texto = String(msg?.text ?? '').trim()

  // Solo le responde al dueño (y no a fotos/audios/etc.).
  if (!Number.isFinite(chatId)) return json({ ok: true })
  const dueno = Number(Deno.env.get('TELEGRAM_CHAT_ID') ?? -1)
  if (chatId !== dueno) {
    await responder(chatId, '🙅 Este bot es privado y solo responde a su administrador.')
    return json({ ok: true })
  }
  if (!texto) return json({ ok: true })

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  try {
    const { inicioIso, finIso, nombre } = detectarPeriodo(texto)
    const [ventas, trafico] = await Promise.all([
      resumenVentas(sb, inicioIso, finIso),
      resumenTrafico(sb, inicioIso, finIso),
    ])
    const { mensaje } = resolverPregunta(texto, ventas, trafico, nombre)
    await responder(chatId, mensaje)
  } catch (err) {
    console.error('No se pudo responder:', err instanceof Error ? err.message : err)
    await responder(chatId, '😵 Ups, no pude consultar los datos. Intentá de nuevo en un momento.')
  }

  return json({ ok: true })
})