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
  if (tiktokPixelId) {
    try {
      (function(w,d,t){
        (w as any).TiktokAnalyticsObject=t;
        var ttq=(w as any)[t]=(w as any)[t]||[];
        ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","trackWithSegmentAuid","setAndVerifyTTUID","detect","enableCookie","disableCookie"];
        ttq.setAndVerifyTTUID=function(t,e){return this.setTTUID(t,e)};
        ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.set_method(e,ttq.methods[n]);return e};
        ttq.profile=function(t,e,n){ttq._i[t]=ttq._i[t]||[];for(var r=0;r<ttq.methods.length;r++)ttq.set_method(ttq._i[t],ttq.methods[r]);ttq._i[t].push([t,e,n])};
        ttq.set_method=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
        ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js";
        ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};
        var a=d.createElement("script");a.type="text/javascript",a.async=!0,a.src=r;
        var i=d.getElementsByTagName("script")[0];i.parentNode?.insertBefore(a,i)};
        
        ttq.load(tiktokPixelId);
        ttq.page();
        console.log(`[TikTok Pixel] Inicializado con ID: ${tiktokPixelId}`);
      })(window,document,'ttq');
    } catch (err) {
      console.error('[TikTok Pixel] Error al inicializar', err);
    }
  } else {
    console.log('[TikTok Pixel] Nota: VITE_TIKTOK_PIXEL_ID no configurado en variables de entorno.');
  }
}

/**
 * Tracks a custom event to loaded Pixels.
 * Safe from ad-blockers or non-initialized pixels.
 */
export function trackPixelEvent(eventName: string, data?: { value?: number; currency?: string; [key: string]: any }) {
  if (typeof window === 'undefined') return;

  // 1. Meta Pixel event tracker
  try {
    if ((window as any).fbq) {
      if (eventName === 'Purchase') {
        // Standard E-commerce conversion tracking format
        (window as any).fbq('track', 'Purchase', {
          value: data?.value || 0,
          currency: data?.currency || 'COP',
          ...data
        });
      } else if (eventName === 'InitiateCheckout') {
        (window as any).fbq('track', 'InitiateCheckout', data);
      } else if (eventName === 'Lead') {
        (window as any).fbq('track', 'Lead', data);
      } else {
        (window as any).fbq('track', eventName, data);
      }
      console.log(`[Meta Pixel Evento] Enviado: ${eventName}`, data);
    }
  } catch (err) {
    console.warn('[Meta Pixel Tracking] No se pudo enviar el evento:', err);
  }

  // 2. TikTok Pixel event tracker
  try {
    if ((window as any).ttq) {
      if (eventName === 'Purchase') {
        (window as any).ttq.track('CompletePayment', {
          value: data?.value || 0,
          currency: data?.currency || 'COP',
          ...data
        });
      } else if (eventName === 'InitiateCheckout') {
        (window as any).ttq.track('InitiateCheckout', data);
      } else if (eventName === 'Lead') {
        (window as any).ttq.track('SubmitForm', data);
      } else {
        (window as any).ttq.track(eventName, data);
      }
      console.log(`[TikTok Pixel Evento] Enviado: ${eventName}`, data);
    }
  } catch (err) {
    console.warn('[TikTok Pixel Tracking] No se pudo enviar el evento:', err);
  }
}
