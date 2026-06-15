import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, Send, X, Sparkles, AlertCircle, RefreshCw } from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'bot' | 'user';
  text: string;
  timestamp: Date;
  options?: string[];
}

export default function AdvisorBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [hasNewMessage, setHasNewMessage] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init-msg',
      sender: 'bot',
      text: '¡Hola! 👋 Soy **Dermy**, tu asesor de cuidado facial experto en protectores solares. ¿En qué te puedo asesorar hoy para proteger tu piel con el nuevo **Anthelios UVMune 400**?',
      timestamp: new Date(),
      options: [
        '💰 Precios y Promociones',
        '🚚 Envío y Pago',
        '🛡️ Respaldo y Confianza',
        '🧴 Tipo de Piel y Aplicación',
        '⏱️ ¿Cuánto tarda en llegar?'
      ]
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen, isTyping]);

  const handleOpenBot = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      setHasNewMessage(false);
    }
  };

  const getKeywordReply = (input: string): { reply: string; options?: string[] } => {
    const text = input.toLowerCase().trim();

    if (text.includes('precio') || text.includes('promocion') || text.includes('descuento') || text.includes('costo') || text.includes('vale') || text.includes('cuesta') || text.includes('pesos') || text.includes('combos') || text.includes('oferta')) {
      return {
        reply: '💰 **Promociones del Día (Envío Gratis):**\n\n• **1 Unidad:** *$84.900 COP* (Protección básica diaria)\n• **2 Unidades (RECOMENDADO):** *$149.900 COP* (¡Ahorras **$19.900 COP** / 12% Descuento!)\n• **3 Unidades (Ahorro Familiar):** *$209.900 COP* (¡Ahorras **$44.800 COP** / 18% Descuento!)\n\n*Recuerda:* Todas nuestras ofertas incluyen **envío totalmente gratis** y facilidad de **pago contra entrega** en todo Colombia.',
        options: ['🛍️ Pedir Ahora Contra Entrega', '🚚 ¿Cómo funciona el envío?', '🛡️ Respaldo y Confianza']
      };
    }

    if (text.includes('envio') || text.includes('pagar') || text.includes('recibir') || text.includes('contraentrega') || text.includes('contra entrega') || text.includes('efectivo') || text.includes('transportadora') || text.includes('pagar al recibir')) {
      return {
        reply: '🚚 **Envío Nacional Gratis y Pago Contra Entrega:**\n\nOfrecemos **Envío Gratis** a toda Colombia. Pagas en efectivo al mensajero únicamente cuando te entregue el paquete en la puerta de tu hogar.\n\nEs 100% libre de riesgos: ¡no pagas nada por adelantado!',
        options: ['🛍️ Pedir Ahora Contra Entrega', '⏱️ ¿Cuánto tarda en llegar?', '🧴 Tipo de piel de Anthelios']
      };
    }

    if (text.includes('sello') || text.includes('vence') || text.includes('vencimiento') || text.includes('confianza') || text.includes('la roche')) {
      return {
        reply: '🛡️ **Calidad y Confianza de Compra:**\n\nTodos nuestros productos de La Roche-Posay se entregan directamente en sus cajas de fábrica con excelente calidad de fabricación. Cuentan con códigos de barras y fechas de vencimiento amplias (vencimiento programado para **2028 en adelante**).\n\nPuedes revisar el empaque físico con el domiciliario al recibir tu pedido de forma segura.',
        options: ['💰 Ver Precios y Descuentos', '🛍️ Comprar Ahora']
      };
    }

    if (text.includes('piel') || text.includes('grasa') || text.includes('mixta') || text.includes('sensible') || text.includes('acne') || text.includes('brillo') || text.includes('mate') || text.includes('sebo')) {
      return {
        reply: '🧴 **Especial para Piel Grasa y Sensible:**\n\nLa versión que recibes es **La Roche-Posay Anthelios UVMune 400 Oil Control Fluide**.\n\nEstá especialmente formulada para pieles mixtas a grasas y con tendencia al acné o excesiva sensibilidad. Cuenta con la tecnología de micropartículas **Airlicium** que atrapa de inmediato el sebo y sudor de tu cara, brindando un **acabado mate seco invisible** sin tapar los poros.',
        options: ['👁️ ¿Arde en los ojos?', '⚪ ¿Deja residuos blancos?', '💰 Ver Precios y Descuentos']
      };
    }

    if (text.includes('tarda') || text.includes('demora') || text.includes('tiempo') || text.includes('dias') || text.includes('entrega') || text.includes('bogota') || text.includes('medellin') || text.includes('cali')) {
      return {
        reply: '⏱️ **Plazos de Entrega para Colombia:**\n\n• **Ciudades Principales:** 1 a 2 días hábiles (Bogotá, Medellín, Cali, Barranquilla, Bucaramanga, Pereira, etc.).\n• **Resto del País y Municipios:** 3 a 5 días hábiles.\n\n*Nota:* Procesamos y despachamos en menos de 24 horas hábiles. Nuestro equipo de despachos coordinará la entrega inmediata de tu paquete.',
        options: ['🚚 ¿Cómo funciona el envío contra entrega?', '🛍️ Ir al Formulario de Pedido']
      };
    }

    if (text.includes('blanco') || text.includes('mimo') || text.includes('rastro') || text.includes('absorbe') || text.includes('ojos') || text.includes('arde') || text.includes('lagrimeo')) {
      return {
        reply: '👁️ *Fórmula Líquida Invisible y Segura:* \n\n• **Toque Invisible:** Es un fluido líquido ultra-ligero que se absorbe en tan solo **3 segundos** sin dejar parches blancos ni efecto mimo, sin importar tu tono de piel.\n• **Cero picazón ocular:** Con tecnología *Netlock*, el producto aguanta el agua y el sudor de la cara sin correrse. ¡Está dermatológica y oftalmológicamente probado para no irritar tus ojos!',
        options: ['🧴 Tipo de Piel Recomendado', '💰 Ver Precios']
      };
    }

    if (text.includes('comprar') || text.includes('pedir') || text.includes('ordenar') || text.includes('pedido') || text.includes('formulario') || text.includes('adquirir') || text.includes('quiero') || text.includes('ahora')) {
      return {
        reply: '🛍️ **Hacer un pedido es sumamente simple y rápido:**\n\nSolo debes bajar un poco y llenar el **Formulario de Pedido** de color negro que está en nuestra página.\n\nIngresa tu nombre, celular de contacto, documento de identidad, y dirección de envío. ¡Y listo! Nosotros nos encargaremos de tramitar el despacho gratuito inmediatamente de forma rápida y segura.',
        options: ['🛍️ Ir al Formulario de Pedido', '💰 Ver Promociones de Ahorro']
      };
    }

    if (text.includes('como') || text.includes('aplicar') || text.includes('rutina') || text.includes('uso') || text.includes('agita')) {
      return {
        reply: '🧴 **Uso Correcto en tu Rutina:**\n\n1. **Agita enérgicamente** el envase de tu Anthelios para homogeneizar el fluido.\n2. Aplica una cantidad del tamaño de una moneda en tu mano.\n3. Distribúyela uniformemente por la cara, el cuello y las orejas antes de exponerte al sol.\n4. Se recomienda reaplicarlo cada 2 a 3 horas si estás bajo el sol directo o si sudas mucho.',
        options: ['⚪ ¿Deja parches blancos?', '🛡️ Respaldo y Confianza']
      };
    }

    // Default response
    return {
      reply: '🤖 *¡Entendido!* Soy un asistente virtual automatizado para **Anthelios UVMune 400**.\n\nPara brindarte la mejor asesoría o ayudarte a comprar, selecciona una de estas opciones rápidas o escríbeme otro mensaje:',
      options: [
        '💰 Ver Precios y Promociones',
        '🚚 Envío Gratis y Pago',
        '🛡️ Respaldo y Confianza',
        '🧴 Tipo de Piel y Aplicación',
        '⏱️ ¿Cuánto tarda en llegar?'
      ]
    };
  };

  const handleSendMessage = (text: string) => {
    if (!text.trim()) return;

    // Remove user input
    setInputValue('');

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);

    // Simulate bot thinking/typing
    setTimeout(() => {
      const isScrollAction = text.includes('🛍️') || text.includes('Formulario de Pedido') || text.includes('Comprar Ahora') || text.includes('Pedir Ahora Contra Entrega');
      
      if (isScrollAction) {
        setIsTyping(false);
        const autoForm = document.getElementById('formulario-pedido');
        if (autoForm) {
          autoForm.scrollIntoView({ behavior: 'smooth' });
          
          // Flash effect
          autoForm.classList.add('ring-4', 'ring-orange-500', 'transition-all', 'duration-500');
          setTimeout(() => {
            autoForm.classList.remove('ring-4', 'ring-orange-500');
          }, 2000);
          
          const botScrollMsg: ChatMessage = {
            id: `bot-scroll-${Date.now()}`,
            sender: 'bot',
            text: '¡Excelente! Te he llevado automáticamente a nuestra sección segura de pedido 👇. Por favor completa los campos y procesaremos tu despacho hoy mismo. ¿Te puedo ayudar con algo más?',
            timestamp: new Date(),
            options: ['💰 Ver Precios', '🚚 Envío Gratis', '⏱️ Tiempos de Entrega']
          };
          setMessages(prev => [...prev, botScrollMsg]);
        } else {
          const { reply, options } = getKeywordReply(text);
          const botReply: ChatMessage = {
            id: `bot-${Date.now()}`,
            sender: 'bot',
            text: reply,
            timestamp: new Date(),
            options
          };
          setMessages(prev => [...prev, botReply]);
        }
      } else {
        setIsTyping(false);
        const { reply, options } = getKeywordReply(text);
        const botReply: ChatMessage = {
          id: `bot-${Date.now()}`,
          sender: 'bot',
          text: reply,
          timestamp: new Date(),
          options
        };
        setMessages(prev => [...prev, botReply]);
      }
    }, 1200);
  };

  const cleanMarkdown = (text: string) => {
    // Basic formatting for interactive display
    let formatted = text;
    // Bold
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-slate-800">$1</strong>');
    formatted = formatted.replace(/\*(.*?)\*/g, '<em class="italic text-slate-900">$1</em>');
    // Bullet points
    formatted = formatted.replace(/• (.*?)/g, '<li class="ml-1 list-disc list-inside">$1</li>');
    // Line breaks
    return formatted.split('\n').map((str, i) => {
      if (str.startsWith('<li')) {
        return <ul key={i} dangerouslySetInnerHTML={{ __html: str }} className="space-y-0.5" />;
      }
      return <p key={i} dangerouslySetInnerHTML={{ __html: str }} className="mb-1.5 last:mb-0" />;
    });
  };

  return (
    <div id="advisor-bot-container">
      {/* 1. Toggle Button */}
      <button
        onClick={handleOpenBot}
        className={`fixed md:bottom-6 bottom-20 right-4 z-45 w-14 h-14 bg-orange-600 hover:bg-orange-700 text-white rounded-full flex items-center justify-center shadow-[0_4px_20px_rgba(234,88,12,0.4)] hover:scale-105 active:scale-95 transition-all outline-none border border-orange-500 cursor-pointer`}
        aria-label="Preguntas Frecuentes Bot"
        id="advisor-bot-launcher"
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div
              key="close-icon"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <X className="w-6 h-6" />
            </motion.div>
          ) : (
            <motion.div
              key="chat-icon"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="relative flex items-center justify-center w-full h-full"
            >
              <MessageSquare className="w-6 h-6" />
              {hasNewMessage && (
                <span className="absolute -top-1 -right-1 bg-red-600 border-2 border-white w-4.5 h-4.5 rounded-full flex items-center justify-center text-[9px] font-black leading-none animate-pulse">
                  1
                </span>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </button>

      {/* 2. Chat Dialogue Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 35, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 25, scale: 0.95 }}
            transition={{ type: 'spring', damping: 22, stiffness: 220 }}
            className="fixed md:bottom-22 bottom-[145px] right-4 z-45 md:w-[370px] w-[calc(100vw-32px)] h-[460px] max-h-[calc(100vh-210px)] bg-white rounded-2xl border border-slate-200/80 shadow-[0_12px_40px_rgba(0,0,0,0.12)] flex flex-col overflow-hidden font-sans"
            id="advisor-bot-chatbox"
          >
            {/* Header */}
            <div className="bg-slate-900 px-4 py-3.5 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <div className="w-8 h-8 rounded-full bg-orange-500 border border-orange-600 flex items-center justify-center font-bold text-white text-sm">
                    D
                  </div>
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-slate-900 rounded-full" />
                </div>
                <div>
                  <h3 className="text-white text-xs font-black tracking-wide flex items-center gap-1">
                    Dermy Asistente Virtual
                    <Sparkles className="w-3 h-3 text-orange-400 fill-orange-400" />
                  </h3>
                  <span className="text-[10px] text-green-400 font-bold block">En línea • Respuestas rápidas</span>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-all cursor-pointer"
                title="Minimizar"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Message Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/60 scrollbar-thin scrollbar-thumb-slate-200">
              {messages.map((msg) => (
                <div key={msg.id} className="space-y-3">
                  <div className={`flex items-start gap-2 ${msg.sender === 'user' ? 'justify-end' : ''}`}>
                    {msg.sender === 'bot' && (
                      <div className="w-6.5 h-6.5 rounded-full bg-slate-200 border text-slate-700 flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5">
                        D
                      </div>
                    )}
                    <div className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-xs font-medium leading-relaxed ${
                      msg.sender === 'user'
                        ? 'bg-slate-850 text-white rounded-br-none shadow-3xs'
                        : 'bg-white text-slate-750 border border-slate-200/60 rounded-bl-none shadow-3xs'
                    }`}>
                      {cleanMarkdown(msg.text)}
                    </div>
                  </div>

                  {/* Options suggestions rendered block */}
                  {msg.sender === 'bot' && msg.options && msg.options.length > 0 && (
                    <div className="pl-8.5 pr-2 flex flex-wrap gap-1.5 animate-fadeIn">
                      {msg.options.map((opt, oIdx) => (
                        <button
                          key={oIdx}
                          onClick={() => handleSendMessage(opt)}
                          className="bg-orange-50 hover:bg-orange-100 text-orange-700 font-bold text-[10px] px-2.5 py-1.5 rounded-lg border border-orange-100 transition-colors duration-150 cursor-pointer shadow-3xs hover:-translate-y-0.5"
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {/* Bot is Typing indicator */}
              {isTyping && (
                <div className="flex items-start gap-2">
                  <div className="w-6.5 h-6.5 rounded-full bg-slate-200 border text-slate-700 flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5">
                    D
                  </div>
                  <div className="bg-white border rounded-2xl px-4 py-3 text-xs w-18 flex items-center justify-center gap-1 shadow-3xs">
                    <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-bounce" />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Warning disclosure about virtual answers */}
            <div className="bg-slate-50 px-4 py-1.5 border-t border-slate-100 flex items-center gap-1.5 text-[9px] text-slate-400 font-semibold uppercase tracking-wider">
              <AlertCircle className="w-3.5 h-3.5 text-slate-350" />
              <span>Soporte automatizado oficial Dermagia</span>
            </div>

            {/* Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage(inputValue);
              }}
              className="p-3 bg-white border-t border-slate-200 flex items-center gap-2"
            >
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Escribe tu pregunta aquí..."
                className="flex-1 bg-slate-100 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 placeholder-slate-400 font-medium focus:ring-1 focus:ring-orange-500 focus:border-orange-500 focus:bg-white outline-none"
                maxLength={150}
              />
              <button
                type="submit"
                disabled={!inputValue.trim()}
                className="p-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-45 text-white rounded-xl flex items-center justify-center aspect-square transition-all cursor-pointer shadow-sm shadow-orange-500/10"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
