import React, { useState, useEffect } from 'react';
import { CreditCard, Truck, Check, AlertCircle, ShoppingCart } from 'lucide-react';
import { COLOMBIA_REGIONS, Department } from '../lib/colombiaData';
import { PRODUCT_OFFERS } from '../data';
import { OrderOffer, Order } from '../types';
import { getActiveAccessToken, getFirstSheetName, appendOrders } from '../lib/sheetsService';
import { trackPixelEvent } from '../lib/tracking';


interface CheckoutFormProps {
  selectedOfferId: string;
  onOfferSelect: (id: string) => void;
  onOrderSuccess: (order: Order) => void;
}

export default function CheckoutForm({ selectedOfferId, onOfferSelect, onOrderSuccess }: CheckoutFormProps) {
  // Form values
  const [formData, setFormData] = useState({
    clientName: '',
    clientPhone: '',
    clientEmail: '',
    documentId: '',
    department: '',
    city: '',
    address: '',
    address2: '',
    notes: ''
  });

  const [paymentMethod, setPaymentMethod] = useState<'contraentrega' | 'mercadopago'>('contraentrega');
  const [availableCities, setAvailableCities] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [successOrder, setSuccessOrder] = useState<Order | null>(null);

  // Get active offer details
  const activeOffer = PRODUCT_OFFERS.find(o => o.id === selectedOfferId) || PRODUCT_OFFERS[1];

  // Update cities when department changes
  useEffect(() => {
    if (formData.department) {
      const selectedDep = COLOMBIA_REGIONS.find(d => d.name === formData.department);
      if (selectedDep) {
        setAvailableCities(selectedDep.cities);
        setFormData(prev => ({ ...prev, city: selectedDep.cities[0] || '' }));
      }
    } else {
      setAvailableCities([]);
      setFormData(prev => ({ ...prev, city: '' }));
    }
  }, [formData.department]);

  // Phone number validator (Colombia standard: 10 digits starting with 3)
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, ''); // strict digits
    if (val.length <= 10) {
      setFormData(prev => ({ ...prev, clientPhone: val }));
      
      if (val.length > 0 && val.length < 10) {
        setPhoneError('El número celular debe tener 10 dígitos (Ej: 300 123 4567)');
      } else if (val.length === 10 && !val.startsWith('3')) {
        setPhoneError('Los celulares en Colombia deben iniciar con el número 3');
      } else {
        setPhoneError('');
      }
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Strict validations
    if (formData.clientPhone.length !== 10 || !formData.clientPhone.startsWith('3')) {
      setPhoneError('Por favor ingresa un número celular de 10 dígitos válido que inicie con 3.');
      return;
    }

    if (!formData.department || !formData.city || !formData.address.trim() || !formData.clientName.trim() || !formData.documentId.trim() || !formData.clientEmail.trim()) {
      alert("Por favor completa los campos obligatorios.");
      return;
    }

    setIsSubmitting(true);

    // Simulate order placement
    setTimeout(() => {
      const newOrder: Order = {
        id: `${paymentMethod === 'contraentrega' ? 'KOMMO' : 'MP'}-${Math.floor(100000 + Math.random() * 90000).toString()}`,
        clientName: formData.clientName,
        clientPhone: formData.clientPhone,
        clientEmail: formData.clientEmail.trim(),
        documentId: formData.documentId.trim(),
        department: formData.department,
        city: formData.city,
        address: formData.address,
        address2: formData.address2.trim(),
        notes: formData.notes.trim(),
        offerId: activeOffer.id,
        offerName: activeOffer.name,
        totalPrice: activeOffer.price,
        quantity: activeOffer.quantity,
        status: 'new',
        date: new Date().toISOString(),
        synced: false,
        paymentMethod: paymentMethod === 'contraentrega' ? 'Contra Entrega' : 'Mercado Pago'
      };

      // Save to localStorage
      try {
        const existingOrdersStr = localStorage.getItem('colombia_sunscreen_orders');
        const existingOrders: Order[] = existingOrdersStr ? JSON.parse(existingOrdersStr) : [];
        existingOrders.unshift(newOrder);
        localStorage.setItem('colombia_sunscreen_orders', JSON.stringify(existingOrders));
      } catch (err) {
        console.error("Error setting order state in localStorage:", err);
      }

      // Try real-time Google Sheets sync
      const checkAndSyncToSheets = async () => {
        try {
          const savedSheetId = localStorage.getItem('colombia_sunscreen_spreadsheet_id');
          const token = getActiveAccessToken();
          if (savedSheetId && token) {
            const sheetName = await getFirstSheetName(token, savedSheetId);
            await appendOrders(token, savedSheetId, [newOrder], sheetName);
            console.log('Real-time sync to Google Sheets succeeded!');
            
            // Mark as synced in localStorage
            newOrder.synced = true;
            const existingOrdersStr = localStorage.getItem('colombia_sunscreen_orders');
            if (existingOrdersStr) {
              const existingOrders: Order[] = JSON.parse(existingOrdersStr);
              const updatedOrders = existingOrders.map(o => o.id === newOrder.id ? { ...o, synced: true } : o);
              localStorage.setItem('colombia_sunscreen_orders', JSON.stringify(updatedOrders));
            }
          }
        } catch (sheetsErr) {
          console.error('Failed to sync order to Google Sheets in real-time:', sheetsErr);
        }
      };
      checkAndSyncToSheets();

      setSuccessOrder(newOrder);
      setIsSubmitting(false);
      onOrderSuccess(newOrder);

      // Track order conversion (Meta / TikTok Pixels)
      trackPixelEvent('Purchase', {
        value: newOrder.totalPrice,
        currency: 'COP',
        content_name: newOrder.offerName,
        num_items: newOrder.quantity
      });

      // Trigger a light window scroll for mobile
      window.scrollTo({ top: 120, behavior: 'smooth' });
    }, 1200);
  };

  const formatPrice = (p: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(p);
  };

  const resetOrderForm = () => {
    setSuccessOrder(null);
    setFormData({
      clientName: '',
      clientPhone: '',
      clientEmail: '',
      documentId: '',
      department: '',
      city: '',
      address: '',
      address2: '',
      notes: ''
    });
  };

  // Pre-select first department on mount
  useEffect(() => {
    if (!formData.department && COLOMBIA_REGIONS.length > 0) {
      setFormData(prev => ({ ...prev, department: COLOMBIA_REGIONS[0].name }));
    }
  }, []);

  return (
    <div id="formulario-pedido" className="scroll-mt-20">
      {successOrder ? (
        // Beautiful success conversion screen
        <div className="bg-white border-2 border-emerald-500 rounded-3xl p-6 text-center max-w-lg mx-auto shadow-xl animate-fadeIn text-slate-800">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-emerald-600 stroke-[3]" />
          </div>
          
          <span className="text-emerald-700 bg-emerald-50 text-[10px] font-black px-3.5 py-1.5 rounded-full border border-emerald-100 tracking-wider">
            {successOrder.id.startsWith('KOMMO') ? 'RESERVA REGISTRADA CON ÉXITO 🚚' : 'RESERVA REGISTRADA CON ÉXITO 💳'}
          </span>
          
          <h3 className="text-2xl font-black text-slate-800 mt-4 mb-1">
            ¡Muchas gracias, {successOrder.clientName.split(' ')[0]}!
          </h3>
          <p className="text-sm font-medium text-slate-500 mb-6">
            Código de Reserva: <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border">{successOrder.id}</span>
          </p>

          <div className="bg-slate-50 rounded-2xl p-4 text-left border border-slate-100 mb-6">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Detalles del Envío Provisionales</h4>
            <div className="space-y-1.5 text-xs md:text-sm text-slate-700">
              <p><strong>Producto:</strong> {successOrder.offerName} ({formatPrice(successOrder.totalPrice)})</p>
              <p><strong>Cédula / Documento:</strong> {successOrder.documentId}</p>
              <p><strong>Celular:</strong> {successOrder.clientPhone}</p>
              <p><strong>Destino:</strong> {successOrder.city}, {successOrder.department}</p>
              <p><strong>Dirección:</strong> {successOrder.address}</p>
              {successOrder.address2 && <p><strong>Dirección 2:</strong> {successOrder.address2}</p>}
              {successOrder.notes && <p><strong>Notas:</strong> {successOrder.notes}</p>}
            </div>
          </div>

          {/* DUAL REDIRECT SECTION based on paymentMethod state */}
          {successOrder.id.startsWith('KOMMO') ? (
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4.5 text-center my-6">
              <span className="text-[9px] tracking-wider uppercase font-black text-white bg-orange-600 px-3 py-1 rounded">PASO EXCLUSIVO REQUERIDO 🇨🇴</span>
              <h4 className="text-sm font-black text-slate-900 mt-3 mb-1">¡Completa tu Envío Contra Entrega!</h4>
              <p className="text-xs text-slate-650 max-w-sm mx-auto mb-4 leading-relaxed">
                Para que tus datos de entrega ingresen a nuestro sistema <strong>Kommo CRM</strong> y el mensajero sea asignado hoy mismo, haz clic en el botón oficial de abajo para confirmar tu despacho:
              </p>
              <a
                href={activeOffer.kommoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 bg-orange-650 hover:bg-orange-700 text-white font-black py-4 px-6 rounded-xl transition-all shadow-md text-sm md:text-base animate-pulse w-full max-w-xs cursor-pointer"
                id="success-kommo-redirect"
              >
                IR AL FORMULARIO COMPLETO 🚀
              </a>
              {activeOffer.quantity === 3 && (
                <p className="text-[9.5px] text-slate-500 mt-2.5 max-w-xs mx-auto leading-tight">
                  *Nota: Se usará el formulario de 2 unidades, pero no te preocupes, en este podrás confirmar manualmente que deseas la promoción familiar de 3 unidades.
                </p>
              )}
            </div>
          ) : (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4.5 text-center my-6">
              <span className="text-[9px] tracking-wider uppercase font-black text-white bg-blue-600 px-3 py-1 rounded">PAGO INMEDIATO SEGURO 💳</span>
              <h4 className="text-sm font-black text-slate-900 mt-3 mb-1">Paga con Mercado Pago</h4>
              <p className="text-xs text-slate-650 max-w-sm mx-auto mb-4 leading-relaxed">
                Completa tu pago seguro con PSE, Tarjeta de Crédito, Débito o Efecty vía Mercado Pago haciendo clic en el botón oficial de pago de la promoción:
              </p>
              <a
                href={activeOffer.mercadopagoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 bg-[#009EE3] hover:bg-[#0086C3] text-white font-black py-4 px-6 rounded-xl transition-all shadow-md text-sm md:text-base animate-pulse w-full max-w-xs cursor-pointer"
                id="success-mercadopago-redirect"
              >
                PAGAR CON MERCADO PAGO 💳
              </a>
            </div>
          )}

          <div className="space-y-4 mb-6">
            <h4 className="text-sm font-bold text-slate-800">¿Qué pasa después?</h4>
            <div className="grid grid-cols-1 gap-3 max-w-sm mx-auto">
              <div className="flex items-center gap-3 text-left">
                <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0 text-orange-600 font-bold text-xs">1</div>
                <p className="text-xs text-slate-600 font-medium">Te enviaremos un mensaje de confirmación por <strong>WhatsApp</strong>.</p>
              </div>
              <div className="flex items-center gap-3 text-left">
                <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0 text-orange-600 font-bold text-xs">2</div>
                <p className="text-xs text-slate-600 font-medium font-sans">Despachamos de forma inmediata a tu dirección en Colombia.</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <a
              href={`https://api.whatsapp.com/send?phone=573000000000&text=Hola!%20Acabo%20de%20hacer%20un%2520pedido%20con%20c%C3%B3digo%20${successOrder.id}.%20Mi%20nombre%20es%20${encodeURIComponent(successOrder.clientName)}.%20Por%20favor%20confirmar%20mi%20despacho.`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 font-bold bg-[#25D366] hover:bg-[#128C7E] text-white py-3.5 px-6 rounded-xl transition-all shadow-md text-sm md:text-base cursor-pointer"
              id="success-whatsapp-button"
            >
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.249 8.477 3.517 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.6.95 3.3 1.449 5.058 1.45h.007c5.54 0 10.05-4.51 10.054-10.051.002-2.685-1.047-5.21-2.958-7.114C16.83 1.529 14.308.471 11.62.472c-5.542 0-10.05 4.512-10.055 10.054-.001 1.91.499 3.778 1.447 5.392L1.936 21.73l5.93-1.557h-.001-1.22zM18.21 15.6c-.3-.15-1.78-.88-2.05-.98-.28-.1-.48-.15-.68.15-.2.3-.77.98-.95 1.18-.18.2-.35.23-.65.08-1.02-.51-1.75-.93-2.44-1.52-.51-.44-.81-.98-.91-1.18-.1-.2-.01-.3.08-.45.08-.13.18-.3.27-.45.09-.15.12-.25.18-.4.06-.15.03-.3-.02-.4-.05-.1-1.05-2.53-1.44-3.48-.38-.92-.77-.79-.95-.8h-.82c-.28 0-.74.1-1.13.52-.39.42-1.5 1.46-1.5 3.57 0 2.1 1.53 4.14 1.74 4.43.21.29 3.01 4.6 7.3 6.45 1.02.44 1.82.7 2.44.91 1.03.32 1.96.28 2.69.17.82-.12 1.77-.72 2.02-1.39.26-.67.26-1.24.18-1.39-.08-.14-.28-.24-.58-.39z" /></svg>
              Confirmar Reserva por WhatsApp
            </a>
            
            <button
              onClick={resetOrderForm}
              className="text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors py-2 cursor-pointer"
            >
              Hacer otro pedido
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="bg-slate-900 text-white rounded-3xl p-6 shadow-xl border border-slate-800">
          <div className="flex items-center gap-2 mb-6">
            <ShoppingCart className="w-5 h-5 text-orange-500" />
            <h3 className="text-lg md:text-xl font-bold tracking-tight">Formulario de Pedido Especial</h3>
          </div>

          {/* Offer Selection Panel */}
          <div className="mb-6 space-y-2.5">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">1. Selecciona tu Promoción</label>
            <div className="grid grid-cols-1 gap-2">
              {PRODUCT_OFFERS.map((offer) => {
                const isSelected = offer.id === selectedOfferId;
                return (
                  <button
                    key={offer.id}
                    type="button"
                    onClick={() => onOfferSelect(offer.id)}
                    className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition-all relative overflow-hidden focus:outline-none min-h-[55px] cursor-pointer ${
                      isSelected
                        ? 'border-orange-500 bg-orange-500/10 shadow-[0_0_12px_rgba(240,90,40,0.2)]'
                        : 'border-slate-800 bg-slate-950/70 hover:border-slate-700'
                    }`}
                    id={`bundle-select-${offer.id}`}
                  >
                    {offer.isPopular && (
                      <span className="absolute right-0 top-0 bg-green-600 text-white font-mono text-[8px] font-extrabold px-2 py-0.5 rounded-bl-lg">
                        MÁS VENDIDO / RECOMENDADO
                      </span>
                    )}
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        isSelected ? 'border-orange-500 text-orange-500' : 'border-slate-600'
                      }`}>
                        {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />}
                      </div>
                      <div>
                        <p className="text-xs md:text-sm font-extrabold">{offer.name}</p>
                        <p className="text-[10px] md:text-xs text-slate-400 font-medium">{offer.subtitle}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs md:text-sm font-black text-orange-400">{formatPrice(offer.price)}</p>
                      {offer.savings && (
                        <p className="text-[9px] md:text-[10px] text-green-400 font-bold">Ahorras {formatPrice(offer.savings)}</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Personal Data Panel */}
          <div className="space-y-4">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">2. Datos de Envío y Contacto</label>
            
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Nombre Completo <span className="text-orange-500">*</span></label>
              <input
                required
                type="text"
                name="clientName"
                placeholder="Ej. Laura María Restrepo"
                value={formData.clientName}
                onChange={handleTextChange}
                className="w-full text-sm bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder-slate-600 font-medium focus:ring-1 focus:ring-orange-500 focus:border-orange-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Número de Celular <span className="text-orange-500">*</span></label>
              <div className="relative">
                <span className="absolute left-4 top-3.5 text-sm font-bold text-slate-500 leading-none pointer-events-none">+57</span>
                <input
                  required
                  type="tel"
                  name="clientPhone"
                  placeholder="300 123 4567"
                  value={formData.clientPhone}
                  onChange={handlePhoneChange}
                  className="w-full text-sm bg-slate-950 border border-slate-800 rounded-xl pl-12 pr-4 py-3 text-white placeholder-slate-600 font-medium focus:ring-1 focus:ring-orange-500 focus:border-orange-500 outline-none"
                />
              </div>
              {phoneError && (
                <p className="mt-1 flex items-center gap-1 text-[11px] text-red-400 font-bold">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{phoneError}</span>
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-355 mb-1">Correo Electrónico <span className="text-orange-500">*</span></label>
              <input
                required
                type="email"
                name="clientEmail"
                placeholder="Ej. laura@gmail.com"
                value={formData.clientEmail}
                onChange={handleTextChange}
                className="w-full text-sm bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder-slate-600 font-medium focus:ring-1 focus:ring-orange-500 focus:border-orange-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Documento de Identidad <span className="text-orange-500">*</span></label>
              <input
                required
                type="text"
                name="documentId"
                placeholder="Ej. 1017123456 (Cédula de Ciudadanía)"
                value={formData.documentId}
                onChange={handleTextChange}
                className="w-full text-sm bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder-slate-600 font-medium focus:ring-1 focus:ring-orange-500 focus:border-orange-500 outline-none"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Departamento <span className="text-orange-500">*</span></label>
                <select
                  required
                  name="department"
                  value={formData.department}
                  onChange={handleTextChange}
                  className="w-full text-sm bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-1 focus:ring-orange-500 focus:border-orange-500 outline-none"
                >
                  <option value="" disabled>Selecciona...</option>
                  {COLOMBIA_REGIONS.map((dep) => (
                    <option key={dep.name} value={dep.name}>{dep.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Ciudad / Municipio <span className="text-orange-500">*</span></label>
                <select
                  required
                  name="city"
                  value={formData.city}
                  onChange={handleTextChange}
                  disabled={!formData.department}
                  className="w-full text-sm bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white disabled:opacity-50 disabled:cursor-not-allowed focus:ring-1 focus:ring-orange-500 focus:border-orange-500 outline-none"
                >
                  <option value="" disabled>Selecciona...</option>
                  {availableCities.map((city) => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Dirección Completa <span className="text-orange-500">*</span></label>
              <input
                required
                type="text"
                name="address"
                placeholder="Calle 12 # 34-56 (Número, Calle, Barrio)"
                value={formData.address}
                onChange={handleTextChange}
                className="w-full text-sm bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder-slate-600 font-medium focus:ring-1 focus:ring-orange-500 focus:border-orange-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Dirección 2 <span className="text-slate-500">(Apartamento, conjunto, interior, torre, etc.)</span></label>
              <input
                type="text"
                name="address2"
                placeholder="Ej. Apto 402, Torre B, Conjunto Residencial"
                value={formData.address2 || ''}
                onChange={handleTextChange}
                className="w-full text-sm bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder-slate-600 font-medium focus:ring-1 focus:ring-orange-500 focus:border-orange-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Notas de Entrega <span className="text-slate-500">(Opcional)</span></label>
              <textarea
                name="notes"
                rows={2}
                placeholder="Ej: Entregar por favor de tarde o dejar con el vigilante"
                value={formData.notes}
                onChange={handleTextChange}
                className="w-full text-sm bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white placeholder-slate-600 font-medium focus:ring-1 focus:ring-orange-500 focus:border-orange-500 outline-none resize-none"
              />
            </div>
          </div>

          {/* 3. Elige tu Método de Pago Selector */}
          <div className="mt-6 mb-6">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">3. Elige tu Método de Pago</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Contra Entrega */}
              <button
                type="button"
                onClick={() => setPaymentMethod('contraentrega')}
                className={`flex flex-col p-4 rounded-xl border text-left transition-all cursor-pointer outline-none ${
                  paymentMethod === 'contraentrega'
                    ? 'border-orange-500 bg-orange-500/10 shadow-[0_0_12px_rgba(240,90,40,0.15)]'
                    : 'border-slate-800 bg-slate-950/70 hover:border-slate-700'
                }`}
                id="select-pay-delivery"
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    paymentMethod === 'contraentrega' ? 'border-orange-500 text-orange-505' : 'border-slate-600'
                  }`}>
                    {paymentMethod === 'contraentrega' && <div className="w-2 h-2 rounded-full bg-orange-500" />}
                  </div>
                  <span className="text-xs md:text-sm font-extrabold text-white">Pago Contra Entrega</span>
                </div>
                <p className="text-[10px] md:text-xs text-slate-400 font-medium mt-1.5 pl-6">
                  Paga en efectivo al recibir en casa. ¡Riesgo cero!
                </p>
              </button>

              {/* Mercado Pago */}
              <button
                type="button"
                onClick={() => setPaymentMethod('mercadopago')}
                className={`flex flex-col p-4 rounded-xl border text-left transition-all cursor-pointer outline-none ${
                  paymentMethod === 'mercadopago'
                    ? 'border-orange-500 bg-orange-500/10 shadow-[0_0_12px_rgba(240,90,40,0.15)]'
                    : 'border-slate-800 bg-slate-950/70 hover:border-slate-700'
                }`}
                id="select-pay-online"
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    paymentMethod === 'mercadopago' ? 'border-orange-500 text-orange-505' : 'border-slate-600'
                  }`}>
                    {paymentMethod === 'mercadopago' && <div className="w-2 h-2 rounded-full bg-orange-500" />}
                  </div>
                  <span className="text-xs md:text-sm font-extrabold text-white">Pago Online Directo</span>
                </div>
                <p className="text-[10px] md:text-xs text-slate-400 font-medium mt-1.5 pl-6">
                  Tarjeta, PSE o Efecty vía Mercado Pago. Envío Express.
                </p>
              </button>
            </div>
          </div>

          {/* Pricing Calculator Box */}
          <div className="mt-8 bg-slate-950 rounded-2xl p-4 border border-slate-800 space-y-2">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Resumen Financiero</h4>
            <div className="flex justify-between text-xs md:text-sm">
              <span className="text-slate-500">Subtotal Producto</span>
              <span className="font-bold">{formatPrice(activeOffer.price)}</span>
            </div>
            <div className="flex justify-between text-xs md:text-sm items-center">
              <span className="text-slate-500">Envío Nacional 🇨🇴</span>
              <span className="text-green-400 font-bold text-[10px] md:text-xs bg-green-500/10 px-2.5 py-0.5 rounded-full border border-green-500/20">GRATIS</span>
            </div>
            <div className="flex justify-between text-xs md:text-sm items-center">
              <span className="text-slate-500">Método de Pago</span>
              <span className={`${paymentMethod === 'contraentrega' ? 'text-orange-400 border-orange-500/20 bg-orange-500/10' : 'text-blue-400 border-blue-500/20 bg-blue-500/10'} font-bold text-[10px] md:text-xs px-2.5 py-0.5 rounded-full border`}>
                {paymentMethod === 'contraentrega' ? 'CONTRA ENTREGA' : 'MERCADO PAGO (ONLINE)'}
              </span>
            </div>
            <div className="border-t border-slate-800 my-2 pt-2 flex justify-between text-base md:text-lg">
              <span className="font-extrabold">Total Neto</span>
              <span className="font-black text-orange-400">{formatPrice(activeOffer.price)}</span>
            </div>
          </div>

          {/* Main submit button with animated hover and micro indicators */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-6 bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-center py-4 rounded-xl transition-all shadow-[0_6px_22px_rgba(240,90,40,0.3)] hover:shadow-[0_8px_25px_rgba(240,90,40,0.45)] text-sm md:text-base cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-0.5 active:translate-y-0 relative overflow-hidden"
            id="order-submit-button"
          >
            {isSubmitting ? (
              <div className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                <span>PROCESANDO TU PEDIDO CO...</span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <span>{paymentMethod === 'contraentrega' ? 'RESERVAR CON ENVÍO GRATIS Y PAGAR EN CASA 🚚' : 'RESERVAR Y PROCEDER AL PAGO EN LÍNEA 💳'}</span>
              </div>
            )}
          </button>
          
          <p className="text-[10px] text-slate-500 text-center mt-3 font-medium">
            *Despachos rápidos con cobertura de entrega nacional gratis y pago seguro contra entrega en casa.
          </p>
        </form>
      )}
    </div>
  );
}
