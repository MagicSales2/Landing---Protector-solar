import React, { useEffect, useRef, useState } from 'react';
import { Check, Clock, XCircle, Loader2 } from 'lucide-react';
import { consultarPago, ResultadoConfirmacion } from '../lib/supabaseClient';
import { trackPixelEvent } from '../lib/tracking';

// Página final a la que Wompi devuelve al cliente después de pagar.
// El pago ya fue confirmado por Wompi y su webhook ya avisó al servidor, pero
// PSE/transferencias pueden tardar: aquí se consulta el estado real del pedido
// (sin confirmar nada) hasta que aparezca como pagado.
export default function PagoGracias() {
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'pendiente' | 'error' | 'nopago'>('cargando');
  const [resultado, setResultado] = useState<ResultadoConfirmacion | null>(null);
  const [avisoCompra, setAvisoCompra] = useState('');
  const pedidoId = useRef<string | null>(null);

  useEffect(() => {
    const raw = window.location.hash;
    const q = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : '';
    const params = new URLSearchParams(q);
    const id = params.get('pedido')?.trim() || '';
    pedidoId.current = id || null;
    // Wompi devuelve esta página con la firma del pedido; permite que el
    // servidor confirme que quien mira es quien pagó (y muestre su nombre).
    const sec = params.get('sec')?.trim() || '';

    // Sin pedido en el link: no hay nada que consultar.
    if (!id) {
      setEstado('nopago');
      setAvisoCompra('No encontramos tu pedido. Si ya pagaste, tu pedido sigue guardado y te escribimos pronto.');
      return;
    }

    let intentos = 0;
    const consultar = () => {
      intentos += 1;
      // A partir del segundo intento se le pide al servidor que confirme el
      // pago preguntándole a Wompi (por si el webhook no llegó).
      consultarPago(id, intentos >= 2, sec)
        .then((res) => {
          setResultado(res);
          if (res.ok && res.estado === 'pagado') {
            trackPixelEvent('Purchase', {
              // El mismo event_id lo usa el servidor en la Events API de TikTok:
              // TikTok deduplica y cuenta la venta una sola vez aunque lleguen
              // los dos eventos (navegador y servidor).
              event_id: res.orderId,
              value: Number(res.total ?? 0),
              currency: 'COP',
              content_name: `Pedido ${res.orderId}`,
              content_type: 'product',
            });
            setEstado('ok');
          } else if (intentos < 10) {
            // Todavía no llega el webhook: se reintenta unos segundos.
            window.setTimeout(consultar, 3000);
          } else {
            setEstado('pendiente');
          }
        })
        .catch(() => {
          if (intentos < 10) window.setTimeout(consultar, 3000);
          else setEstado('pendiente');
        });
    };
    consultar();
  }, []);

  const volver = () => {
    history.replaceState(null, '', window.location.pathname + window.location.search);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="fixed inset-0 z-[60] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-8 text-center font-sans text-slate-800 animate-slideUp">
        {estado === 'cargando' ? (
          <>
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
            <h3 className="text-lg font-black text-slate-900">Confirmando tu pago...</h3>
            <p className="text-xs text-slate-500 mt-2">En segundos tu pedido queda listo.</p>
          </>
        ) : estado === 'ok' ? (
          <>
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-emerald-600 stroke-[3]" />
            </div>
            <span className="text-emerald-700 bg-emerald-50 text-[10px] font-black px-3.5 py-1.5 rounded-full border border-emerald-100 tracking-wider">
              ¡PAGO RECIBIDO Y PEDIDO CONFIRMADO! 🎉
            </span>
            <h3 className="text-2xl font-black text-slate-900 mt-4 mb-1">
              ¡Gracias{resultado?.cliente ? `, ${resultado.cliente.split(' ')[0]}` : ''}!
            </h3>
            <p className="text-sm font-medium text-slate-500 mb-4">
              Tu pedido{' '}
              <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border">
                {resultado?.orderId}
              </span>{' '}
              ya está confirmado y entra en el despacho.
            </p>
            <p className="text-xs text-slate-500 leading-relaxed mb-6">
              Despachamos tu pedido a la dirección que registraste. Te escribiremos por WhatsApp para coordinar la entrega. Envío gratis a toda Colombia 🇨🇴
            </p>
            <button
              onClick={volver}
              className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3.5 px-6 rounded-xl transition-all text-sm cursor-pointer"
            >
              Volver a la tienda
            </button>
          </>
        ) : estado === 'pendiente' ? (
          <>
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="w-8 h-8 text-amber-600" />
            </div>
            <h3 className="text-lg font-black text-slate-900">Pago en proceso</h3>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed mb-6">
              Tu pago está pendiente de confirmación por Wompi (PSE o transferencias pueden tardar unos minutos). Tu reserva está guardada; en cuanto se confirme, te avisamos.
            </p>
            <button
              onClick={volver}
              className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3.5 px-6 rounded-xl transition-all text-sm cursor-pointer"
            >
              Volver a la tienda
            </button>
          </>
        ) : (
          <>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="text-lg font-black text-slate-900">
              {estado === 'nopago' ? 'No pudimos confirmar el pago' : 'El pago no se completó'}
            </h3>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed mb-6">
              {avisoCompra ||
                'Tu reserva sigue guardada. Puedes volver a intentar el pago con el botón de la página o usar el pago contra entrega.'}
            </p>
            <button
              onClick={volver}
              className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3.5 px-6 rounded-xl transition-all text-sm cursor-pointer"
            >
              Volver a la tienda
            </button>
          </>
        )}
      </div>
    </div>
  );
}
