import React, { useState, useEffect } from 'react';
import { 
  Check, 
  Star, 
  Shield, 
  Truck, 
  CreditCard, 
  AlertCircle, 
  ShoppingCart, 
  Eye, 
  Sparkles, 
  MessageSquare, 
  Clock, 
  ShieldCheck, 
  Flame, 
  Smartphone, 
  UserCheck 
} from 'lucide-react';
import ProductBottleSVG from './components/ProductBottleSVG';
import CheckoutForm from './components/CheckoutForm';
import ReviewSection from './components/ReviewSection';
import VideoTestimonials from './components/VideoTestimonials';
import FAQSection from './components/FAQSection';
import OrderDashboard from './components/OrderDashboard';
import AdvisorBot from './components/AdvisorBot';
import { PRODUCT_OFFERS } from './data';
import { Order } from './types';
import { motion } from 'motion/react';
import { initTracking, trackPixelEvent } from './lib/tracking';

export default function App() {
  const [selectedOfferId, setSelectedOfferId] = useState<string>('offer-2'); // Pre-select Mejor Oferta
  const [ordersUpdatedToggle, setOrdersUpdatedToggle] = useState<boolean>(false);
  const [showAdminModal, setShowAdminModal] = useState<boolean>(false);
  const [stockCount, setStockCount] = useState<number>(12); // Urgency stock count
  const [timeLeft, setTimeLeft] = useState<number>(885); // 14 mins 45 secs countdown
  const [isTriggered, setIsTriggered] = useState<boolean>(false);

  // Initialize tracking on mount
  useEffect(() => {
    initTracking();
    trackPixelEvent('ViewContent', { content_name: 'Landing Page Anthelios Ultra Dry Touch' });
  }, []);

  // Trigger button micro-interaction pulse on stockCount change
  useEffect(() => {
    setIsTriggered(true);
    const timer = setTimeout(() => setIsTriggered(false), 800);
    return () => clearTimeout(timer);
  }, [stockCount]);

  // Urgency logic: countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          return 900; // Reset to 15 mins for testing
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Urgency logic: simulate random stock decrements
  useEffect(() => {
    const stockInterval = setInterval(() => {
      setStockCount((prev) => {
        if (prev <= 3) {
          return 14; // Reset to 15 for infinite loop in landing
        }
        // Randomly decrease stock
        return Math.random() > 0.6 ? prev - 1 : prev;
      });
    }, 14000);
    return () => clearInterval(stockInterval);
  }, []);

  const handleScrollToForm = () => {
    trackPixelEvent('InitiateCheckout', {
      content_name: 'Botón Flotante Click'
    });
    const formElement = document.getElementById('formulario-pedido');
    if (formElement) {
      formElement.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleOfferSelectAndScroll = (id: string) => {
    setSelectedOfferId(id);
    const selectedOffer = PRODUCT_OFFERS.find(o => o.id === id);
    if (selectedOffer) {
      trackPixelEvent('InitiateCheckout', {
        content_name: selectedOffer.name,
        num_items: selectedOffer.quantity,
        value: selectedOffer.price,
        currency: 'COP'
      });
    } else {
      trackPixelEvent('InitiateCheckout');
    }
    handleScrollToForm();
  };

  const handleOrderSuccess = (order: Order) => {
    setOrdersUpdatedToggle(prev => !prev);
  };

  const handleOrderDelete = () => {
    setOrdersUpdatedToggle(prev => !prev);
  };

  const formatPrice = (p: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(p);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-orange-500 selection:text-white antialiased text-slate-800 md:pb-0 pb-20">
      
      {/* 1. TOP TICKER NOTICE BAR (Urgency and primary sales pitch) */}
      <div className="bg-orange-600 text-white text-[10px] md:text-xs font-black py-2.5 px-4 relative md:sticky md:top-0 z-50 shadow-md text-center flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 md:gap-3 uppercase overflow-hidden tracking-wider leading-tight md:leading-none">
        <span className="inline-flex items-center gap-1 shrink-0">
          <Truck className="w-3.5 h-3.5 animate-pulse" />
          <span>🚚 ENVÍO GRATIS A TODA COLOMBIA</span>
        </span>
        <span className="hidden md:inline text-orange-300">|</span>
        <span className="inline-flex items-center gap-1 shrink-0">
          <CreditCard className="w-3.5 h-3.5" />
          <span>🤝 COMPRA SEGURA: PAGO CONTRA ENTREGA</span>
        </span>
        <span className="hidden md:inline text-orange-300">|</span>
        <span className="inline-flex items-center gap-1 text-yellow-300 font-bold shrink-0">
          <Clock className="w-3.5 h-3.5" />
          <span>⏱️ OFERTA TERMINA EN {formatTime(timeLeft)} MINS</span>
        </span>
      </div>

      {/* 2. HEADER BRANDING */}
      <header className="bg-white/95 backdrop-blur-xs border-b border-slate-100 py-3 md:py-4 px-4 sticky top-0 md:top-[37px] z-40 shadow-xs">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-orange-600 rounded-full animate-ping" />
            <span className="text-sm md:text-base font-black text-slate-900 tracking-tight font-sans">
              DERMAGIA <span className="text-orange-600">COLOMBIA</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-100 text-slate-700 text-[10px] md:text-xs font-black px-3 py-1.5 rounded-full border border-slate-200">
            <Truck className="w-3.5 h-3.5 text-orange-600 flex-shrink-0" />
            <span className="tracking-tight uppercase">Envío Gratis y Pago Seguro</span>
          </div>
        </div>
      </header>

      {/* 3. HERO / ABOVE THE FOLD SECTION (Highly Optimized for Mobile) */}
      <section className="bg-gradient-to-b from-white via-orange-50/10 to-slate-50 pt-8 pb-14 px-4">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          
          {/* Hero left details / Title */}
          <div className="lg:col-span-7 space-y-5 text-center lg:text-left order-2 lg:order-1">
            <div className="flex flex-wrap justify-center lg:justify-start gap-1 p-0.5">
              <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-600 text-[10px] font-black px-3 py-1 rounded-full uppercase">
                <Flame className="w-3.5 h-3.5 text-orange-500 fill-orange-500" />
                <span>MEJOR VALORADO EN COLOMBIA</span>
              </span>
              <span className="inline-flex items-center gap-0.5 text-xs text-amber-500 font-bold px-2 py-0.5 bg-amber-50 rounded-full">
                <Star className="w-3.5 h-3.5 fill-current" />
                <Star className="w-3.5 h-3.5 fill-current" />
                <Star className="w-3.5 h-3.5 fill-current" />
                <Star className="w-3.5 h-3.5 fill-current" />
                <Star className="w-3.5 h-3.5 fill-current" />
                <span className="text-slate-600 text-[10px] ml-1">(4.9/5)</span>
              </span>
            </div>

            <h1 className="text-2xl md:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
              ¿Brillo, Grasa o Manchas por el Sol? 
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-orange-500 mt-1">
                Protección Invisible, Mate y Sin Color
              </span>
            </h1>

            <p className="text-xs md:text-base text-slate-500 font-medium max-w-xl mx-auto lg:mx-0 leading-relaxed">
              <strong>Anthelios UVMune 400 Oil Control Fluide SPF 50+</strong> de La Roche-Posay es la tecnología dermatológica más avanzada. Controla sebo y sudor al instante mientras bloquea los rayos UV ultra-largos que causan envejecimiento prematuro y manchas oscuras.
            </p>

            {/* Quick value proposition block */}
            <div className="grid grid-cols-2 gap-2 max-w-md mx-auto lg:mx-0 pt-2 text-left">
              <div className="flex items-start gap-2 p-2 bg-white rounded-xl border border-slate-100 shadow-3xs">
                <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] md:text-xs font-semibold text-slate-700"><strong>Control Total</strong> de brillo (Airlicium)</p>
              </div>
              <div className="flex items-start gap-2 p-2 bg-white rounded-xl border border-slate-100 shadow-3xs">
                <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] md:text-xs font-semibold text-slate-700"><strong>Ultra-Largo</strong> Mexoryl 400 (Filtro exclusivo)</p>
              </div>
              <div className="flex items-start gap-2 p-2 bg-white rounded-xl border border-slate-100 shadow-3xs">
                <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] md:text-xs font-semibold text-slate-700"><strong>Toque Seco</strong> invisible sin residuos blancos</p>
              </div>
              <div className="flex items-start gap-2 p-2 bg-white rounded-xl border border-slate-100 shadow-3xs">
                <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] md:text-xs font-semibold text-slate-700"><strong>Hipoalergénico</strong> y no comedogénico</p>
              </div>
            </div>

            {/* High-impact trust notification */}
            <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-center lg:text-left flex items-center justify-center lg:justify-start gap-2 max-w-md mx-auto lg:mx-0 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-red-600 block animate-ping flex-shrink-0" />
              <p className="text-[11px] text-red-700 font-extrabold uppercase">
                🔥 ¡SOLO QUEDAN {stockCount} UNIDADES EN NUESTRA BODEGA DE BOGOTÁ!
              </p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
              <button
                onClick={handleScrollToForm}
                className="w-full sm:w-auto bg-orange-600 hover:bg-orange-700 text-white font-black px-8 py-4 rounded-xl text-center shadow-[0_8px_25px_rgba(240,90,40,0.4)] transition-all cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0 text-sm md:text-base leading-none"
                id="hero-cta-button"
              >
                PAGAR CONTRA ENTREGA - ENVÍO GRATIS
              </button>
              <button
                onClick={() => {
                  const pricingElement = document.getElementById('planes-oferta');
                  pricingElement?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="w-full sm:w-auto bg-white border border-slate-200 text-slate-700 font-bold px-6 py-4 rounded-xl text-center hover:bg-slate-50 transition-all text-sm md:text-base leading-none cursor-pointer"
              >
                Ver Promociones y Combos
              </button>
            </div>

            {/* Delivery/Security Trust badges */}
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 pt-1 text-slate-400 font-medium text-[11px]">
              <span className="inline-flex items-center gap-1"><Truck className="w-3.5 h-3.5 text-orange-500" /> Envío gratis Colombia</span>
              <span className="hidden sm:inline">•</span>
              <span className="inline-flex items-center gap-1"><CreditCard className="w-3.5 h-3.5 text-orange-500" /> Efectivo contra entrega</span>
              <span className="hidden sm:inline">•</span>
              <span className="inline-flex items-center gap-1"><UserCheck className="w-3.5 h-3.5 text-orange-500" /> Gran Calidad</span>
            </div>
          </div>

          {/* Hero right: Elegant floating vector render of the bottle (Order 1 in mobile so visual is first!) */}
          <div className="lg:col-span-5 flex justify-center order-1 lg:order-2">
            <div className="relative group max-w-xs md:max-w-sm w-full bg-linear-to-b from-slate-50 to-white md:bg-white rounded-3xl p-6 md:p-8 md:shadow-lg hover:shadow-xl transition-all duration-300 border-0 md:border border-slate-100 flex flex-col items-center">
              
              {/* Product Badges */}
              <div className="absolute top-4 left-4 flex flex-col gap-1.5 z-20 items-start">
                <div className="bg-slate-950 text-white text-[9px] font-extrabold px-2.5 py-1.5 rounded-md shadow-xs uppercase tracking-wider">
                  Control Sebo
                </div>
              </div>

              {/* Top-right badge: animated -40% OFF badge in high-contrast red */}
              <div className="absolute top-4 right-4 bg-red-600 text-white text-[10px] font-extrabold px-3 py-1.5 rounded-md shadow-md uppercase tracking-wider flex items-center gap-1.5 animate-bounce z-25">
                <Flame className="w-3.5 h-3.5 text-yellow-300 fill-current" />
                <span>-40% OFF</span>
              </div>

              {/* Vector Bottle Render */}
              <ProductBottleSVG className="w-56 h-auto md:w-64" showBadge={false} />

              {/* Quick specifications panel */}
              <div className="w-full mt-4 bg-slate-50 rounded-2xl p-3 text-center border border-slate-100/60">
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">LA MÁXIMA TECNOLOGÍA EN PROTECCIÓN</span>
                <p className="text-xs font-black text-slate-700 mt-0.5">La Roche-Posay Anthelios UVMune 400</p>
                <div className="flex justify-center items-center gap-1.5 mt-2.5">
                  <span className="text-[9px] uppercase tracking-wider bg-slate-200 text-slate-800 border border-slate-300 font-bold px-2.5 py-1 rounded">SPF 50+</span>
                  <span className="text-[9px] uppercase tracking-wider bg-slate-200 text-slate-800 border border-slate-300 font-bold px-2.5 py-1 rounded">Fluido Ultra-Ligero</span>
                  <span className="text-[9px] uppercase tracking-wider bg-slate-200 text-slate-800 border border-slate-300 font-bold px-2.5 py-1 rounded">Toque Seco</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* 4. REAL BEFORE AND AFTER LOGIC CARDS (Conversion-driven) */}
      <section className="py-16 px-4 bg-white border-y border-slate-100">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
              Problemas de protectores solares comunes.
            </h2>
            <p className="mt-2 text-sm text-slate-500 max-w-lg mx-auto">
              La mayoría de bloqueadores son pesados, provocan brillo inmediato y no protegen contra los rayos UVA más profundos que causan manchas.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* The Old Competitor cardboard representation */}
            <div className="p-6 rounded-2xl bg-red-50/40 border border-red-100 space-y-3 shadow-3xs">
              <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wider block w-max">
                Cuidado Tradicional
              </span>
              <h3 className="font-extrabold text-slate-900 text-base">Bloqueadores Comunes</h3>
              <ul className="space-y-2.5 text-xs text-slate-600 font-medium">
                <li className="flex items-start gap-2">
                  <span className="text-red-500 font-bold">✕</span>
                  <span><strong>Efecto Mimo:</strong> Dejan una gruesa capa blanca que se ve fea y artificial.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500 font-bold">✕</span>
                  <span><strong>Brillo Inmediato:</strong> Tapan tus poros y causan exceso de grasa y acné a las pocas horas.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500 font-bold">✕</span>
                  <span><strong>Arden en los ojos:</strong> Al sudar por el calor, el producto migra y causa picazón severa.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500 font-bold">✕</span>
                  <span><strong>Daño Invisible:</strong> No protegen contra la radiación UVA Ultra-Larga (causante de manchas profundas).</span>
                </li>
              </ul>
            </div>

            {/* The Anthelios UVMune performance representaton */}
            <div className="p-6 rounded-2xl bg-green-50/40 border border-green-200/60 space-y-3 shadow-2xs relative overflow-hidden">
              <div className="absolute right-0 top-0 bg-green-500 text-white font-mono text-[8px] font-extrabold px-3 py-1 uppercase tracking-wider rounded-bl-lg">
                Solución Recomendada
              </div>
              <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wider block w-max">
                La Roche-Posay Anthelios
              </span>
              <h3 className="font-extrabold text-slate-900 text-base">UVMune 400 Oil Control</h3>
              <ul className="space-y-2.5 text-xs text-slate-600 font-medium">
                <li className="flex items-start gap-2">
                  <span className="text-green-500 font-bold">✓</span>
                  <span><strong>Absorción en 3s:</strong> Fórmula fluida líquida ultra-ligera que queda invisible en cualquier tono de piel.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 font-bold">✓</span>
                  <span><strong>Efecto Toque Seco Mate:</strong> Micro-partículas Airlicium que absorben sebo y humedad eficazmente de forma continua.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 font-bold">✓</span>
                  <span><strong>Tecnología Netlock:</strong> Cobertura resistente al sudor que no se corre ni irrita los ojos.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 font-bold">✓</span>
                  <span><strong>MEXORYL 400 exclusivo:</strong> El único filtro capaz de detener el 100% de la radiación UVA Ultra-Larga.</span>
                </li>
              </ul>
            </div>

          </div>
        </div>
      </section>

      {/* 5. EXPERT DERMATOLOGIST CALLOUT (Extremely High Conversion) */}
      <section className="py-14 px-4 bg-slate-50">
        <div className="max-w-4xl mx-auto bg-slate-900 rounded-3xl p-6 md:p-10 text-white relative overflow-hidden shadow-xl border border-slate-800">
          <div className="absolute inset-0 bg-radial from-orange-500/10 via-transparent to-transparent pointer-events-none" />
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-center">
            
            <div className="flex flex-col items-center md:items-start text-center md:text-left md:col-span-1 border-b md:border-b-0 md:border-r border-slate-800/80 pb-6 md:pb-0 md:pr-6">
              <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center text-slate-200 border border-slate-700/60 mb-3 shadow">
                <Sparkles className="w-7 h-7 text-orange-500" />
              </div>
              <p className="text-sm font-black text-slate-100 font-sans tracking-tight">RECOMENDADO</p>
              <p className="text-[10px] text-slate-400 font-medium uppercase font-mono mt-0.5">POR DERMATÓLOGOS</p>
            </div>

            <div className="md:col-span-3 space-y-3 text-center md:text-left">
              <blockquote className="text-xs md:text-sm text-slate-300 font-medium italic leading-relaxed">
                "El mayor causante de envejecimiento cutáneo, melasma y manchas oscuras permanentes no es el sol de fin de semana, sino los rayos UVA ultra-largos continuos del diario. Anthelios UVMune de La Roche-Posay es, científicamente, el mayor avance en fotoprotección médica para evitar de raíz el daño celular profundo."
              </blockquote>
              <div className="pt-2">
                <p className="text-xs font-black text-white leading-none">Asociación Colombiana de Dermatología</p>
                <p className="text-[10px] text-orange-400 font-bold mt-1 font-mono uppercase">Recomendado en consulta clínica colombiana</p>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 6. OUR OFFERS / PRICING SECTION */}
      <section id="planes-oferta" className="py-16 px-4 bg-white border-t border-slate-100">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <span className="bg-orange-100 text-orange-600 text-[10px] font-black px-3.5 py-1.5 rounded-full uppercase tracking-wider inline-block">
              🤑 COMBOS DE AHORRO CON ENVÍO GRATIS
            </span>
            <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight mt-3">
              Selecciona tu Oferta de Protector Solar
            </h2>
            <p className="mt-1 text-xs md:text-sm text-slate-500">
              Aprovecha estos descuentos especiales para Colombia. Más unidades compradas = Mayor ahorro directo.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
            
            {/* Offer 1 Unit */}
            <div className="bg-white border rounded-2xl p-5 sm:p-6 flex flex-col justify-between transition-all hover:border-slate-300 shadow-3xs relative">
              <span className="absolute top-4 right-4 bg-slate-100 text-slate-600 text-[9px] font-bold px-2 py-0.5 rounded">
                Plan Diario
              </span>
              <div className="space-y-4">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-lg uppercase">{PRODUCT_OFFERS[0].name}</h3>
                  <p className="text-xs text-slate-400 mt-1">{PRODUCT_OFFERS[0].subtitle}</p>
                </div>

                <div className="py-4 border-y border-slate-100">
                  <span className="text-2xl font-black text-slate-900">{formatPrice(PRODUCT_OFFERS[0].price)}</span>
                  <span className="text-[11px] text-slate-400 font-bold block mt-1">Precio Unitario Normal</span>
                </div>

                <ul className="space-y-2 text-xs text-slate-600">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500" />
                    <span>1 Bloqueador Anthelios (50ml)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500" />
                    <span>Envío Gratis a todo Colombia</span>
                  </li>
                  <li className="flex items-center gap-2 text-slate-400">
                    <span className="text-red-500 font-bold">✕</span>
                    <span>Sin descuento especial por pack</span>
                  </li>
                </ul>
              </div>

              <button
                onClick={() => handleOfferSelectAndScroll(PRODUCT_OFFERS[0].id)}
                className="w-full mt-6 bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 px-4 rounded-xl text-center text-xs transition-colors cursor-pointer min-h-[44px]"
                id="select-offer-1"
              >
                PEDIR ESTA OFERTA
              </button>
            </div>

            {/* Offer 2 Units - MEJOR OFERTA / RECOMENDADO */}
            <div className="bg-white border-2 border-orange-500 rounded-3xl p-5 sm:p-6 flex flex-col justify-between transition-all shadow-md relative scale-100 md:scale-[1.03] z-10">
              <div className="absolute -top-3.5 left-1/2 transform -translate-x-1/2 bg-orange-500 text-white text-[11px] font-black px-5 py-1.5 rounded-full uppercase tracking-wider shadow-sm animate-bounce">
                OFERTA RECOMENDADA
              </div>

              <div className="space-y-4 pt-2">
                <div className="text-center">
                  <h3 className="font-extrabold text-slate-900 text-xl uppercase text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-orange-400">
                    {PRODUCT_OFFERS[1].name}
                  </h3>
                  <p className="text-xs text-orange-600/80 font-bold mt-1">{PRODUCT_OFFERS[1].subtitle}</p>
                </div>

                <div className="py-4 border-y border-slate-100 flex flex-col items-center justify-center text-center gap-1.5">
                  <div>
                    <span className="text-3xl font-black text-slate-900">{formatPrice(PRODUCT_OFFERS[1].price)}</span>
                    <span className="text-[11px] text-slate-400 font-bold block mt-0.5">Precio final por las 2 unidades</span>
                  </div>
                  <div className="bg-green-100 text-green-700 text-[9px] font-black px-2.5 py-1 rounded uppercase tracking-wider select-none inline-block">
                    MÁS AHORRO
                  </div>
                </div>

                <ul className="space-y-2 text-xs text-slate-600">
                  <li className="flex items-center gap-2 font-bold text-slate-800">
                    <Check className="w-4 h-4 text-emerald-500" />
                    <span>2 Bloqueadores Anthelios (50ml c/u)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500" />
                    <span>Envío Gratis a nivel nacional 🇨🇴</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500" />
                    <span>Textura ultra fluida perfecta para uso diario</span>
                  </li>
                  <li className="flex items-center gap-2 text-green-600 font-bold bg-green-50 px-2.5 py-2 rounded-xl border border-green-200 shadow-3xs">
                    <Sparkles className="w-3.5 h-3.5 text-green-600" />
                    <span>¡Ahorras $19.900 pesos (12% de descuento!)</span>
                  </li>
                </ul>
              </div>

              <motion.button
                onClick={() => handleOfferSelectAndScroll(PRODUCT_OFFERS[1].id)}
                animate={isTriggered ? {
                  scale: [1, 1.05, 0.98, 1.03, 1],
                  boxShadow: [
                    "0px 4px 6px rgba(240, 90, 40, 0.2)",
                    "0px 15px 30px rgba(240, 90, 40, 0.5)",
                    "0px 10px 15px rgba(240, 90, 40, 0.3)",
                    "0px 4px 6px rgba(240, 90, 40, 0.2)"
                  ]
                } : {}}
                transition={{ duration: 0.8, ease: "easeInOut" }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full mt-6 bg-orange-600 hover:bg-orange-700 text-white font-extrabold py-3.5 px-4 rounded-xl text-center text-xs md:text-sm shadow-md shadow-orange-500/20 hover:shadow-orange-700/30 transition-all cursor-pointer min-h-[44px]"
                id="select-offer-2"
              >
                PEDIR LA MEJOR OFERTA 🔥
              </motion.button>
            </div>

            {/* Offer 3 Units */}
            <div className="bg-white border rounded-2xl p-5 sm:p-6 flex flex-col justify-between transition-all hover:border-slate-300 shadow-3xs relative">
              <span className="absolute top-4 right-4 bg-emerald-100 text-emerald-700 text-[9px] font-bold px-2 py-0.5 rounded">
                Ahorro Familiar
              </span>
              <div className="space-y-4">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-lg uppercase">{PRODUCT_OFFERS[2].name}</h3>
                  <p className="text-xs text-slate-400 mt-1">{PRODUCT_OFFERS[2].subtitle}</p>
                </div>

                <div className="py-4 border-y border-slate-100">
                  <span className="text-2xl font-black text-slate-900">{formatPrice(PRODUCT_OFFERS[2].price)}</span>
                  <span className="text-[11px] text-slate-400 font-bold block mt-1">Ahorras {formatPrice(PRODUCT_OFFERS[2].savings || 0)} (18%)</span>
                </div>

                <ul className="space-y-2 text-xs text-slate-600">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500" />
                    <span>3 Bloqueadores Anthelios (50ml c/u)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500" />
                    <span>Envío Gratis a todo Colombia</span>
                  </li>
                  <li className="flex items-center gap-2 text-green-600 font-bold bg-green-50 px-2.5 py-2 rounded-xl border border-green-200 shadow-3xs">
                    <Sparkles className="w-3.5 h-3.5 text-green-600" />
                    <span>¡Ahorras $44.800 pesos (18% de descuento!)</span>
                  </li>
                </ul>
              </div>

              <button
                onClick={() => handleOfferSelectAndScroll(PRODUCT_OFFERS[2].id)}
                className="w-full mt-6 bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 px-4 rounded-xl text-center text-xs transition-colors cursor-pointer min-h-[44px]"
                id="select-offer-3"
              >
                PEDIR PLAN AHORRO
              </button>
            </div>

          </div>
        </div>
      </section>

      {/* 7. TRANSACTION SECURITY AND SECURE BADGES */}
      <section className="py-10 bg-slate-100/50 border-t border-slate-200/60 px-4">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          
          <div className="flex flex-col items-center">
            <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-2 shadow-2xs">
              <Truck className="w-5 h-5" />
            </div>
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest leading-tight">Despacho Rápido</h4>
            <p className="text-[10px] text-slate-500 mt-1">Recibe en tu puerta en 2 a 4 días hábiles.</p>
          </div>

          <div className="flex flex-col items-center">
            <div className="w-10 h-10 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mb-2 shadow-2xs">
              <CreditCard className="w-5 h-5" />
            </div>
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest leading-tight">Pago al Recibir</h4>
            <p className="text-[10px] text-slate-500 mt-1">Cero riesgos, pagas solo al verificar tu paquete.</p>
          </div>

          <div className="flex flex-col items-center">
            <div className="w-10 h-10 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-2 shadow-2xs">
              <Shield className="w-5 h-5" />
            </div>
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest leading-tight">Calidad Premium</h4>
            <p className="text-[10px] text-slate-500 mt-1">Fórmula dermatológica de excelente calidad de fabricación.</p>
          </div>

          <div className="flex flex-col items-center">
            <div className="w-10 h-10 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-2 shadow-2xs">
              <Star className="w-5 h-5 fill-red-500 stroke-red-500" />
            </div>
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest leading-tight">Soporte Activo</h4>
            <p className="text-[10px] text-slate-500 mt-1">Acompañamiento y atención por WhatsApp inmediato.</p>
          </div>

        </div>
      </section>

      {/* 8. MAIN CHECKOUT SECTION (Formulario de Pedido) */}
      <section className="py-16 px-4 bg-slate-950 text-white relative">
        <div className="max-w-xl mx-auto">
          <div className="text-center mb-8">
            <span className="bg-orange-500 text-white text-[10px] font-black px-3 py-1 rounded-sm uppercase tracking-wider inline-block">
              🚚 ENVÍO GRATIS + PAGO CONTRA ENTREGA
            </span>
            <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight mt-3">
              Completa tu Pedido Aquí
            </h2>
            <p className="mt-2 text-xs text-slate-400">
              Ingresa tus datos reales. Un asesor te enviará un WhatsApp de confirmación antes de despachar el paquete.
            </p>
          </div>

          {/* Core Checkout form component */}
          <CheckoutForm 
            selectedOfferId={selectedOfferId}
            onOfferSelect={(id) => setSelectedOfferId(id)}
            onOrderSuccess={handleOrderSuccess}
          />
          
        </div>
      </section>

      {/* 9. TESTIMONIOS (SOCIAL PROOF) */}
      <VideoTestimonials />
      <ReviewSection />

      {/* 10. FAQS */}
      <FAQSection />

      {/* FOOTER */}
      <footer className="bg-slate-900 text-slate-400 py-12 px-4 border-t border-slate-800 text-center font-medium text-xs">
        <div className="max-w-4xl mx-auto space-y-4">
          <p className="text-sm font-bold text-slate-200">Anthelios UVMune 400 Oil Control Fluide 🇨🇴</p>
          <p className="max-w-md mx-auto text-[11px] text-slate-500 leading-relaxed">
            *Aplican términos y condiciones. El envío gratuito está sujeto a cobertura nacional en las principales regiones de Colombia. La Roche-Posay es una marca registrada de L'Oreal Group. Esta página es propiedad de un distribuidor independiente autorizado de Colombia.
          </p>
          <div className="flex justify-center gap-3 text-[11px] text-slate-500">
            <a href="#testimonios" className="hover:text-slate-300 transition-colors font-semibold">Testimonios</a>
            <span>•</span>
            <a href="#preguntas-frecuentes" className="hover:text-slate-300 transition-colors font-semibold">FAQs</a>
            <span>•</span>
            <button 
              onClick={() => setShowAdminModal(true)} 
              className="hover:text-slate-300 transition-colors font-semibold cursor-pointer underline decoration-orange-500/50"
            >
              Miembros
            </button>
            <span>•</span>
            <a href="#formulario-pedido" className="hover:text-slate-300 transition-colors font-semibold">Pedir Ahora</a>
          </div>
          <p className="text-[10px] text-slate-600 pt-3">
            © 2026 Dermagia Colombia. Todos los derechos reservados.
          </p>
        </div>
      </footer>

      {/* 11. MOBILE STICKY CTA BUTTON (Extremely High Conversion!) */}
      {/* Dynamic float bar displaying chosen pack and button directly on mobile viewports */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-3 flex items-center justify-between z-40 shadow-[0_-4px_15px_rgba(0,0,0,0.06)]">
        <div>
          <span className="text-[9px] text-slate-400 font-bold block uppercase leading-none">PEDIR CONTRA ENTREGA</span>
          <span className="text-sm font-black text-slate-900 block mt-0.5">
            {PRODUCT_OFFERS.find(o => o.id === selectedOfferId)?.name.split(' (')[0]}
          </span>
          <span className="text-xs font-bold text-orange-600 block leading-none">
            {formatPrice(PRODUCT_OFFERS.find(o => o.id === selectedOfferId)?.price || 0)}
          </span>
        </div>
        <button
          onClick={handleScrollToForm}
          className="bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-xs px-5 py-3 rounded-lg shadow-sm transition-all animate-pulse min-h-[44px] cursor-pointer"
          id="mobile-sticky-cta"
        >
          COMPRAR AHORA 🚚
        </button>
      </div>

      {/* FEATURE 12: MERCHANT ORDER MANAGEMENT ACCESS PANEL */}
      {/* Allows developer/merchant to manage placed orders, see metrics, and export data */}
      <OrderDashboard 
        ordersUpdatedToggle={ordersUpdatedToggle}
        onOrderDelete={handleOrderDelete}
        isOpen={showAdminModal}
        onClose={() => setShowAdminModal(false)}
      />

      {/* AUTOMATED ADVISORY BOT / FAQ ASSISTANT */}
      <AdvisorBot />

    </div>
  );
}
