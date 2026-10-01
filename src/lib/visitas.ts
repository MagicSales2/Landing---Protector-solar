/**
 * Rastreo de visitas para el reporte diario de Telegram.
 *
 * - Al cargar la página avisa a "registrar-visita" (una visita por visitante;
 *   si el mismo visitante vuelve en menos de 40 min se reutiliza esa visita).
 * - Al cerrar/ir a otra página manda cuánto tiempo estuvo (pagehide + beacon).
 * - El visitante se identifica con un id guardado en el navegador, así se puede
 *   saber quién es "recurrente" (entró varias veces).
 */

const SUPABASE_URL =
  (import.meta as any).env.VITE_SUPABASE_URL || 'https://drzbxmajsbkdkydsbjzj.supabase.co';
const SUPABASE_ANON =
  (import.meta as any).env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRyemJ4bWFqc2JrZGt5ZHNianpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1OTczMTEsImV4cCI6MjEwNjE3MzMxMX0.N4w10n8DISA94g0SUe0ZjXLQwxdLnNIU56ZCZp22pYc';

let inicio: number;
let visitaId: number | null = null;

// TikTok deja la cookie "ttp" para poder saber quién es el visitante. Va sin
// cifrar a la Events API, junto con la IP.
function leerCookieTtp(): string | undefined {
  const match = document.cookie.match(/(?:^|;\s*)ttp=([^;]+)/);
  return match ? decodeURIComponent(match[1]).slice(0, 200) : undefined;
}

function urlFuncion(): string {
  return `${SUPABASE_URL}/functions/v1/registrar-visita`;
}

function idVisitante(): string {
  const clave = 'anthelios_visitante';
  let id = localStorage.getItem(clave);
  if (!id) {
    id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(clave, id);
  }
  return id;
}

export function iniciarRastreoVisitas() {
  if (typeof window === 'undefined') return;

  inicio = Date.now();
  const params = new URLSearchParams(window.location.search);
  const utm: Record<string, string> = {};
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'fbclid']) {
    const v = params.get(k);
    if (v) utm[k] = v;
  }

  fetch(urlFuncion(), {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tipo: 'inicio',
      visitanteId: idVisitante(),
      ruta: window.location.pathname + window.location.hash,
      referrer: document.referrer || '',
      utm,
      userAgent: navigator.userAgent,
      // El ttclid viene en la URL cuando el visitante llega desde un anuncio de
      // TikTok, y el ttp es la cookie de TikTok. Con los dos, el servidor puede
      // emparejar la visita con el anuncio que la trajo.
      ttclid: params.get('ttclid') || undefined,
      ttp: leerCookieTtp(),
      pageUrl: window.location.href,
    }),
  })
    .then((r) => r.json().catch(() => null))
    .then((d) => {
      if (d && typeof d.visitaId === 'number') visitaId = d.visitaId;
    })
    .catch(() => {
      /* el rastreo nunca rompe la página */
    });

  window.addEventListener('pagehide', () => {
    if (!visitaId) return;
    const duracion = Math.round((Date.now() - inicio) / 1000);
    const cuerpo = JSON.stringify({ tipo: 'fin', visitaId, duracion });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(urlFuncion(), new Blob([cuerpo], { type: 'application/json' }));
      } else {
        fetch(urlFuncion(), {
          method: 'POST',
          keepalive: true,
          headers: { apikey: SUPABASE_ANON, 'Content-Type': 'application/json' },
          body: cuerpo,
        }).catch(() => {});
      }
    } catch {
      /* sin más que hacer al salir de la página */
    }
  });
}