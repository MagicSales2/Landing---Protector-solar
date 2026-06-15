import React, { useState } from 'react';
import { ChevronDown, MessageSquare } from 'lucide-react';
import { GENERAL_FAQS } from '../data';

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="preguntas-frecuentes" className="py-16 px-4 bg-slate-50 border-t border-slate-100">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-1.5 bg-orange-100 text-orange-600 text-xs font-bold px-3 py-1 rounded-full mb-3">
            <MessageSquare className="w-3.5 h-3.5" />
            <span>RESOLVEMOS TUS DUDAS</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
            Preguntas Frecuentes
          </h2>
          <p className="mt-2 text-sm md:text-base text-slate-500">
            Todo lo que necesitas saber antes de realizar tu compra de forma segura.
          </p>
        </div>

        <div className="space-y-3">
          {GENERAL_FAQS.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <div
                key={index}
                className="bg-white border rounded-xl overflow-hidden hover:border-slate-300 transition-all duration-200"
                id={`faq-item-${index}`}
              >
                <button
                  onClick={() => toggleFAQ(index)}
                  className="w-full flex items-center justify-between p-4 text-left font-semibold text-slate-800 hover:text-slate-950 min-h-[50px] transition-colors focus:outline-none"
                  aria-expanded={isOpen}
                >
                  <span className="text-sm md:text-base leading-snug">{faq.question}</span>
                  <ChevronDown
                    className={`w-5 h-5 text-slate-400 flex-shrink-0 transition-transform duration-300 ${
                      isOpen ? 'transform rotate-180 text-orange-500' : ''
                    }`}
                  />
                </button>

                <div
                  className={`transition-all duration-300 ease-in-out overflow-hidden ${
                    isOpen ? 'max-h-72 border-t opacity-100' : 'max-h-0 opacity-0'
                  }`}
                >
                  <div className="p-4 bg-slate-50/50 text-slate-600 text-xs md:text-sm leading-relaxed">
                    {faq.answer}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
