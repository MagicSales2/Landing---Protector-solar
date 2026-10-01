// ============================================================================
//  FUNCIÓN: registrar-visita
//  Lleva el registro de tráfico de la página para el reporte diario.
//
//  Llamadas (las hace el navegador):
//    { "tipo": "inicio", "visitanteId", "ruta", "referrer", "utm": {...}, "userAgent" }
//        → registra una visita nueva (si el mismo visitante ya tiene una
//          "abierta" en los últimos 40 minutos, reutiliza esa misma visita).
//    { "tipo": "fin", "visitaId", "duracion" }
//        → guarda cuánto tiempo estuvo en la página (en segundos).
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { enviarEventoTiktok } from '../_shared/tiktok.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

  const texto = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

  // ── Fin de una visita: se guarda la duración ───────────────────────────
  const visitaId = Number(cuerpo?.visitaId ?? NaN)
  if (cuerpo?.tipo === 'fin' && Number.isFinite(visitaId) && visitaId > 0) {
    const duracion = Math.max(0, Math.round(Number(cuerpo?.duracion ?? 0)))
    await sb.from('visitas').update({ duracion_seg: duracion }).eq('id', visitaId).is('duracion_seg', null)
    return json({ ok: true })
  }

  // ── Inicio de una visita ───────────────────────────────────────────────
  if (cuerpo?.tipo === 'inicio') {
    const visitanteId = texto(cuerpo.visitanteId, 100)
    if (!visitanteId) return json({ ok: false, error: 'sin visitante' }, 400)

    // ¿Ya hay una visita abierta de este visitante en los últimos 40 minutos?
    const hace = new Date(Date.now() - 40 * 60 * 1000).toISOString()
    const { data: abierta } = await sb
      .from('visitas')
      .select('id')
      .eq('visitante_id', visitanteId)
      .is('duracion_seg', null)
      .gte('inicio', hace)
      .order('inicio', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (abierta) return json({ ok: true, visitaId: abierta.id })

    const { data: insertada, error } = await sb
      .from('visitas')
      .insert({
        visitante_id: visitanteId,
        ruta: texto(cuerpo.ruta, 200) || null,
        referrer: texto(cuerpo.referrer, 300) || null,
        utm_source: texto(cuerpo.utm?.utm_source, 100) || null,
        utm_medium: texto(cuerpo.utm?.utm_medium, 100) || null,
        utm_campaign: texto(cuerpo.utm?.utm_campaign, 100) || null,
        user_agent: texto(cuerpo.userAgent, 300) || null,
        inicio: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (error || !insertada) {
      console.error('No se pudo registrar la visita:', error)
      return json({ ok: false }, 500)
    }

    // ViewContent desde el servidor. El píxel del navegador ya manda este
    // evento, pero se lo comen los ad-blockers y el modo incógnito, y entonces
    // TikTok no ve nada de ese tráfico. Mandándolo desde acá se registra
    // igual, y es lo que le dice a TikTok qué contenido se está viendo.
    //
    // El event_id lleva el id de la visita: si el píxel también lo mandó con el
    // mismo, TikTok cuenta una sola vista y no dos.
    try {
      const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
        req.headers.get('cf-connecting-ip') || ''
      await enviarEventoTiktok({
        event: 'ViewContent',
        event_id: `visita-${insertada.id}`,
        order_id: `visita-${insertada.id}`,
        content_name: 'Protector Solar Anthelios SPF 50+',
        content_type: 'product',
        quantity: 1,
        value: 0,
        currency: 'COP',
        content_ids: ['anthelios-protector-solar'],
        page_url: texto(cuerpo.pageUrl, 500) || undefined,
        referrer: texto(cuerpo.referrer, 300) || undefined,
        user_agent: texto(cuerpo.userAgent, 300) || undefined,
        client_ip: ip || undefined,
        ttclid: texto(cuerpo.ttclid, 200) || undefined,
        ttp: texto(cuerpo.ttp, 200) || undefined,
      })
    } catch (err) {
      // Nunca debe romper el registro de la visita: el evento es un extra.
      console.error('Fallo al enviar ViewContent a TikTok:', err)
    }

    return json({ ok: true, visitaId: insertada.id })
  }

  return json({ error: 'Tipo de evento desconocido' }, 400)
})