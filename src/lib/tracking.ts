/**
 * Dynamic Pixel Tracking Utility for Meta (Facebook) and TikTok
 * Re-triggerable and safe for single page applications.
 */

export function initTracking() {
  if (typeof window === 'undefined') return;

  const metaPixelId = (import.meta as any).env.VITE_META_PIXEL_ID;
  const tiktokPixelId = (import.meta as any).env.VITE_TIKTOK_PIXEL_ID;

  // 1. Meta (Facebook) Pixel Integration
  if (metaPixelId) {
    try {
      (function(f,b,e,v,n,t,s){
        if((f as any).fbq)return;n=(f as any).fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!(f as any)._fbq)(f as any)._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
        n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];
        s.parentNode?.insertBefore(t,s)
      })(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');

      (window as any).fbq('init', metaPixelId);
      (window as any).fbq('track', 'PageView');
      console.log(`[Meta Pixel] Inicializado con ID: ${metaPixelId}`);
    } catch (err) {
      console.error('[Meta Pixel] Error al inicializar', err);
    }
  } else {
    console.log('[Meta Pixel] Nota: VITE_META_PIXEL_ID no configurado en variables de entorno.');
  }

  // 2. TikTok Pixel Integration
  // Se usa el snippet oficial de TikTok tal cual (el que entrega el Events
  // Manager). Es importante que sea ÉSTE y no una variante: el script se pide
  // con ?sdkid=...&lib=ttq y sin esos parámetros el pixel carga pero no sabe
  // qué píxel enviarle los eventos.
  if (tiktokPixelId) {
    try {
      (function (w, d, t) {
        (window as any).TiktokAnalyticsObject = t;
        var ttq = (w[t] = w[t] || []);
        ttq.methods = ["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"];
        ttq.setAndDefer = function (t, e) {
          t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))) };
        };
        for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
        ttq.instance = function (t) {
          var e = ttq._i[t] || [];
          for (var n = 0; n < ttq.methods.length; n++) ttq.setAndDefer(e, ttq.methods[n]);
          return e;
        };
        ttq.load = function (e, n) {
          var r = "https://analytics.tiktok.com/i18n/pixel/events.js";
          var o = n && n.partner;
          ttq._i = ttq._i || {};
          ttq._i[e] = [];
          ttq._i[e]._u = r;
          ttq._t = ttq._t || {};
          ttq._t[e] = +new Date;
          ttq._o = ttq._o || {};
          ttq._o[e] = n || {};
          n = d.createElement("script");
          n.type = "text/javascript";
          n.async = !0;
          n.src = r + "?sdkid=" + e + "&lib=" + t;
          e = d.getElementsByTagName("script")[0];
          e.parentNode.insertBefore(n, e);
        };

        ttq.load(tiktokPixelId);
        ttq.page();
      })(window, document, "ttq");
      console.log(`[TikTok Pixel] Inicializado con ID: ${tiktokPixelId}`);
    } catch (err) {
      console.error('[TikTok Pixel] Error al inicializar', err);
    }
  } else {
    console.log('[TikTok Pixel] Nota: VITE_TIKTOK_PIXEL_ID no configurado en variables de entorno.');
  }
}

// La landing es una SPA con rutas por hash (#/gracias, etc). TikTok solo cuenta
// una visita al cargar el script, así que hay que avisarle a mano de cada
// cambio de vista para que no todas las páginas cuenten como la misma.
export function trackPageView(contenido?: { content_name?: string; content_category?: string }) {
  if (typeof window === 'undefined') return;
  try {
    (window as any).ttq?.page();
  } catch (err) {
    console.warn('[TikTok Pixel] No se pudo enviar la vista de página:', err);
  }
  trackPixelEvent('ViewContent', contenido);
}

/**
 * Tracks a custom event to loaded Pixels.
 * Safe from ad-blockers or non-initialized pixels.
 *
 * IMPORTANTE (Meta/TikTok): el evento "Purchase" solo debe dispararse cuando el
 * pago esté CONFIRMADO (el webhook de Wompi le avisa al servidor, y la página
 * de gracias lo confirma desde ahí). Si se manda antes de cobrar, Meta puede
 * marcar la cuenta como suspecta de ventas ficticias. Para capturas de
 * formularios usa "Lead".
 */
/**
 * TikTok marca error "Crítico" cuando más del 10% de los eventos llegan sin
 * `content_id`, y eso baja el CPA de los anuncios que usan Video Shopping Ads.
 * Además el evento se ignora si el `content_id` viene vacío o es un espacio.
 *
 * Por eso, antes de mandar cualquier evento, se revisa que `content_id` tenga
 * algo de verdad. Si algún sitio del código se olvida de ponerlo, esta función
 * lo completa sola y el evento nunca sale sin él.
 */
const CONTENT_ID_POR_DEFECTO = 'skin-ofertas-protector-solar';

function completarContenido(eventName: string, data?: Record<string, any>) {
  const contenido: Record<string, any> = { ...(data || {}) };

  // content_id: obligatorio y nunca vacío ni solo espacios.
  const idOriginal = contenido.content_id;
  if (typeof idOriginal !== 'string' || idOriginal.trim() === '') {
    contenido.content_id = CONTENT_ID_POR_DEFECTO;
  } else {
    contenido.content_id = idOriginal.trim();
  }

  // El resto de parámetros de producto que TikTok espera junto al content_id.
  if (!contenido.content_type) contenido.content_type = 'product';
  if (!contenido.content_name) contenido.content_name = 'Protector Solar Skin Ofertas';
  if (contenido.quantity === undefined && contenido.num_items !== undefined) {
    contenido.quantity = contenido.num_items;
  }

  return contenido;
}

export function trackPixelEvent(eventName: string, data?: { value?: number; currency?: string; [key: string]: any }) {
  if (typeof window === 'undefined') return;

  const datos = completarContenido(eventName, data as Record<string, any> | undefined);

  // 1. Meta Pixel event tracker
  try {
    if ((window as any).fbq) {
      if (eventName === 'Purchase') {
        // Standard E-commerce conversion tracking format
        (window as any).fbq('track', 'Purchase', {
          value: data?.value || 0,
          currency: data?.currency || 'COP',
          ...datos
        });
      } else if (eventName === 'InitiateCheckout') {
        (window as any).fbq('track', 'InitiateCheckout', datos);
      } else if (eventName === 'Lead') {
        (window as any).fbq('track', 'Lead', datos);
      } else {
        (window as any).fbq('track', eventName, datos);
      }
      console.log(`[Meta Pixel Evento] Enviado: ${eventName}`, datos);
    }
  } catch (err) {
    console.warn('[Meta Pixel Tracking] No se pudo enviar el evento:', err);
  }

  // 2. TikTok Pixel event tracker
  try {
    if ((window as any).ttq) {
      // TikTok llama "CompletePayment" a la compra confirmada (es el
      // equivalente de Purchase). El event_id es lo que permite que TikTok
      // deduplique el evento del navegador con el que manda el servidor por
      // la Events API: si llegan los dos con el mismo event_id, cuenta una
      // sola venta. Usamos el id del pedido, que es único.
      if (eventName === 'Purchase') {
        (window as any).ttq.track('CompletePayment', {
          event_id: data?.event_id,
          value: data?.value || 0,
          currency: data?.currency || 'COP',
          ...datos,
        });
      } else if (eventName === 'InitiateCheckout') {
        (window as any).ttq.track('InitiateCheckout', datos);
      } else if (eventName === 'Lead') {
        (window as any).ttq.track('SubmitForm', datos);
      } else {
        (window as any).ttq.track(eventName, datos);
      }
      console.log(`[TikTok Pixel Evento] Enviado: ${eventName}`, datos);
    }
  } catch (err) {
    console.warn('[TikTok Pixel Tracking] No se pudo enviar el evento:', err);
  }
}
