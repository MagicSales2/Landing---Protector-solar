import React, { useState, useEffect } from 'react';
import { CreditCard, Truck, Check, AlertCircle, ShoppingCart } from 'lucide-react';
import { COLOMBIA_REGIONS, Department } from '../lib/colombiaData';
import { PRODUCT_OFFERS } from '../data';
import { OrderOffer, Order } from '../types';
import { createOrder } from '../lib/supabaseClient';
import type { PedidoCreado } from '../lib/supabaseClient';
import { trackPixelEvent } from '../lib/tracking';

interface CheckoutFormProps {
  selectedOfferId: string;
  onOfferSelect: (id: string) => void;
  onOrderSuccess: (order: Order) => void;
  offers?: OrderOffer[];
}

export default function CheckoutForm({ selectedOfferId, onOfferSelect, onOrderSuccess, offers }: CheckoutFormProps) {
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

  const [paymentMethod, setPaymentMethod] = useState<'contraentrega' | 'wompi'>('contraentrega');
  const [availableCities, setAvailableCities] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [successOrder, setSuccessOrder] = useState<Order | null>(null);
  const [submitError, setSubmitError] = useState('');
  // Link de pago de Wompi (único para este pedido).
  const [pagoUrl, setPagoUrl] = useState('');
  // True si el servidor creó el link y ya mandamos al cliente a pagar.
  const [redirigio, setRedirigio] = useState(false);
  // Campo invisible: los robots lo llenan solos, las personas nunca lo ven.
  const [websiteTrampa, setWebsiteTrampa] = useState('');

  // Si el servidor manda los precios de Supabase, se usan; si no, los del código.
  const listaOfertas = offers && offers.length > 0 ? offers : PRODUCT_OFFERS;
  const activeOffer = listaOfertas.find(o => o.id === selectedOfferId) || listaOfertas[1] || listaOfertas[0];

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

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    if (formData.clientPhone.length !== 10 || !formData.clientPhone.startsWith('3')) {
      setPhoneError('Por favor ingresa un número celular de 10 dígitos válido que inicie con 3.');
      return;
    }

    if (!formData.department || !formData.city || !formData.address.trim() || !formData.clientName.trim() || !formData.documentId.trim() || !formData.clientEmail.trim()) {
      alert("Por favor completa los campos obligatorios.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');

    const metodoPago = paymentMethod === 'contraentrega' ? 'Contra Entrega' : 'Wompi';

    // El pedido lo crea el servidor: valida los datos, confirma el precio y
    // lo manda a Kommo. Si algo falla, no se confirma nada al cliente.
    let creado: PedidoCreado;
    try {
      creado = await createOrder({
        clientName: formData.clientName.trim(),
        clientPhone: formData.clientPhone,
        clientEmail: formData.clientEmail.trim(),
        documentId: formData.documentId.trim(),
        department: formData.department,
        city: formData.city,
        address: formData.address.trim(),
        address2: formData.address2.trim(),
        notes: formData.notes.trim(),
        offerId: activeOffer.id,
        paymentMethod: metodoPago,
        website: websiteTrampa,
      });
    } catch (err) {
      console.error('No se pudo crear el pedido:', err);
      setSubmitError(err instanceof Error ? err.message : 'No pudimos registrar tu pedido. Intenta de nuevo.');
      setIsSubmitting(false);
      return;
    }

    const newOrder: Order = {
      id: creado.orderId,
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
      totalPrice: creado.total ?? activeOffer.price,
      quantity: activeOffer.quantity,
      status: 'new',
      date: new Date().toISOString(),
      synced: true,
      paymentMethod: metodoPago
    };

    // OJO: aquí NO se manda el evento "Purchase" porque el cliente todavía no
    // ha pagado. Se manda "Lead" (dejó sus datos), que sí es verdad.
    // "Purchase" solo debe enviarse cuando el pago esté confirmado.
    trackPixelEvent('Lead', {
      value: newOrder.totalPrice,
      currency: 'COP',
      content_name: newOrder.offerName,
      content_type: 'product'
    });

    // Con Wompi, se abre el link único de este pedido. Si el servidor no
    // alcanzó a crearlo, el pedido queda guardado y se le avisa al cliente.
    if (newOrder.paymentMethod === 'Wompi') {
      const url = (creado.initPoint ?? '').trim();
      setPagoUrl(url);
      setRedirigio(!!creado.initPoint);
      if (creado.initPoint) {
        window.location.assign(creado.initPoint);
      }
    }

    setSuccessOrder(newOrder);
    setIsSubmitting(false);
    onOrderSuccess(newOrder);
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
    setSubmitError('');
    setPhoneError('');
    setWebsiteTrampa('');
    setPagoUrl('');
    setRedirigio(false);
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

  useEffect(() => {
    if (!formData.department && COLOMBIA_REGIONS.length > 0) {
      setFormData(prev => ({ ...prev, department: COLOMBIA_REGIONS[0].name }));
    }
  }, []);

  return (
    <div id="formulario-pedido" className="scroll-mt-20">
      {successOrder ? (
        <div className="bg-white border-2 border-emerald-500 rounded-3xl p-6 text-center max-w-lg mx-auto shadow-xl animate-fadeIn text-slate-800">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-emerald-600 stroke-[3]" />
          </div>

          <span className="text-emerald-700 bg-emerald-50 text-[10px] font-black px-3.5 py-1.5 rounded-full border border-emerald-100 tracking-wider">
            {successOrder.paymentMethod === 'Wompi' ? 'RESERVA REGISTRADA CON ÉXITO 💳' : 'RESERVA REGISTRADA CON ÉXITO 🚚'}
          </span>

          <h3 className="text-2xl font-black text-slate-800 mt-4 mb-1">
            ¡Muchas gracias, {successOrder.clientName.split(' ')[0]}!
          </h3>
          <p className="text-sm font-medium text-slate-500 mb-6">
            Código de Reserva: <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border">{successOrder.id}</span>
          </p>

          {submitError && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium px-4 py-2 rounded-xl mb-4">
              {submitError}
            </div>
          )}

          <div className="bg-slate-50 rounded-2xl p-4 text-left border border-slate-100 mb-6">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Detalles del Envío</h4>
            <div className="space-y-1.5 text-xs md:text-sm text-slate-700">
              <p><strong>Producto:</strong> {successOrder.offerName} ({formatPrice(successOrder.totalPrice)})</p>
              <p><strong>Documento:</strong> {successOrder.documentId}</p>
              <p><strong>Celular:</strong> {successOrder.clientPhone}</p>
              <p><strong>Destino:</strong> {successOrder.city}, {successOrder.department}</p>
              <p><strong>Dirección:</strong> {successOrder.address}</p>
              {successOrder.address2 && <p><strong>Dirección 2:</strong> {successOrder.address2}</p>}
              {successOrder.notes && <p><strong>Notas:</strong> {successOrder.notes}</p>}
            </div>
          </div>

          {successOrder.paymentMethod === 'Wompi' ? (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4.5 text-center my-6">
              <span className="text-[9px] tracking-wider uppercase font-black text-white bg-blue-600 px-3 py-1 rounded">PAGO INMEDIATO SEGURO 💳</span>
              <h4 className="text-sm font-black text-slate-900 mt-3 mb-1">Completa tu pago con Wompi</h4>
              <p className="text-xs text-slate-600 max-w-sm mx-auto mb-4 leading-relaxed">
                Ya tenemos tus datos reservados. Paga con tarjeta, PSE, Nequi, Bancolombia o QR y tu pedido queda confirmado al instante:
              </p>
              {pagoUrl ? (
                <a
                  href={pagoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-black py-4 px-6 rounded-xl transition-all shadow-md text-sm md:text-base animate-pulse w-full max-w-xs cursor-pointer"
                  id="success-wompi-redirect"
                >
                  PAGAR CON WOMPI 💳
                </a>
              ) : (
                <p className="text-xs text-slate-600 max-w-sm mx-auto leading-relaxed">
                  No pudimos generar el link de pago. Tu reserva <strong>quedó guardada</strong>: escríbenos por WhatsApp y te enviamos el link para pagar.
                </p>
              )}
              <p className="text-[10px] text-slate-500 mt-3 font-medium">
                {redirigio ? 'Se abrió Wompi en esta pestaña. Si no cargó, toca el botón azul.' : 'Puedes pagar con este botón cuando quieras; tu reserva queda guardada.'}
              </p>
            </div>
          ) : (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4.5 text-center my-6">
              <span className="text-[9px] tracking-wider uppercase font-black text-white bg-emerald-600 px-3 py-1 rounded">PEDIDO EN CAMINO 🚚</span>
              <h4 className="text-sm font-black text-slate-900 mt-3 mb-1">¡Ya lo registramos!</h4>
              <p className="text-xs text-slate-600 max-w-sm mx-auto leading-relaxed">
                Nuestro equipo ya tiene tus datos y te escribe por WhatsApp al número que registraste para confirmar la entrega. Pagas en efectivo al recibir el producto.
              </p>
            </div>
          )}

          <div className="space-y-4 mb-6">
            <h4 className="text-sm font-bold text-slate-800">¿Qué pasa después?</h4>
            <div className="grid grid-cols-1 gap-3 max-w-sm mx-auto">
              <div className="flex items-center gap-3 text-left">
                <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0 text-orange-600 font-bold text-xs">1</div>
                <p className="text-xs text-slate-600 font-medium">Te enviaremos una notificación de confirmación al celular provisto.</p>
              </div>
              <div className="flex items-center gap-3 text-left">
                <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0 text-orange-600 font-bold text-xs">2</div>
                <p className="text-xs text-slate-600 font-medium">Despachamos de forma inmediata a tu dirección en Colombia sin costo.</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <button
              onClick={resetOrderForm}
              className="w-full flex items-center justify-center gap-2 font-bold bg-slate-800 hover:bg-slate-900 text-white py-3.5 px-6 rounded-xl transition-all shadow-md text-sm md:text-base cursor-pointer"
              id="success-new-order-button"
            >
              Hacer otro pedido ✨
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="bg-slate-900 text-white rounded-3xl p-6 shadow-xl border border-slate-800">
          <div className="flex items-center gap-2 mb-6">
            <ShoppingCart className="w-5 h-5 text-orange-500" />
            <h3 className="text-lg md:text-xl font-bold tracking-tight">Formulario de Pedido</h3>
          </div>

          {/* Campo invisible contra robots. Ni se ve ni se llena a mano. */}
          <div aria-hidden="true" className="absolute w-px h-px overflow-hidden opacity-0 pointer-events-none left-[-9999px]">
            <label htmlFor="website">No completar</label>
            <input
              id="website"
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={websiteTrampa}
              onChange={(e) => setWebsiteTrampa(e.target.value)}
            />
          </div>

          {submitError && (
            <div className="mb-5 bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-medium px-4 py-3 rounded-xl">
              {submitError}
            </div>
          )}

          <div className="mb-6 space-y-2.5">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">1. Selecciona tu Promoción</label>
            <div className="grid grid-cols-1 gap-2">
              {listaOfertas.map((offer) => {
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
              <label className="block text-xs font-bold text-slate-300 mb-1">Correo Electrónico <span className="text-orange-500">*</span></label>
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

          <div className="mt-6 mb-6">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">3. Elige tu Método de Pago</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    paymentMethod === 'contraentrega' ? 'border-orange-500' : 'border-slate-600'
                  }`}>
                    {paymentMethod === 'contraentrega' && <div className="w-2 h-2 rounded-full bg-orange-500" />}
                  </div>
                  <span className="text-xs md:text-sm font-extrabold text-white">Pago Contra Entrega</span>
                </div>
                <p className="text-[10px] md:text-xs text-slate-400 font-medium mt-1.5 pl-6">
                  Paga en efectivo al recibir en casa. ¡Riesgo cero!
                </p>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('wompi')}
                className={`flex flex-col p-4 rounded-xl border text-left transition-all cursor-pointer outline-none ${
                  paymentMethod === 'wompi'
                    ? 'border-orange-500 bg-orange-500/10 shadow-[0_0_12px_rgba(240,90,40,0.15)]'
                    : 'border-slate-800 bg-slate-950/70 hover:border-slate-700'
                }`}
                id="select-pay-online"
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    paymentMethod === 'wompi' ? 'border-orange-500' : 'border-slate-600'
                  }`}>
                    {paymentMethod === 'wompi' && <div className="w-2 h-2 rounded-full bg-orange-500" />}
                  </div>
                  <span className="text-xs md:text-sm font-extrabold text-white">Pago Online con Wompi</span>
                </div>
                <p className="text-[10px] md:text-xs text-slate-400 font-medium mt-1.5 pl-6">
                  Tarjeta, PSE, Nequi o Bancolombia. Envío Express.
                </p>
              </button>
            </div>
          </div>

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
                {paymentMethod === 'contraentrega' ? 'CONTRA ENTREGA' : 'WOMPI (ONLINE)'}
              </span>
            </div>
            <div className="border-t border-slate-800 my-2 pt-2 flex justify-between text-base md:text-lg">
              <span className="font-extrabold">Total Neto</span>
              <span className="font-black text-orange-400">{formatPrice(activeOffer.price)}</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-6 bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-center py-4 rounded-xl transition-all shadow-[0_6px_22px_rgba(240,90,40,0.3)] hover:shadow-[0_8px_25px_rgba(240,90,40,0.45)] text-sm md:text-base cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-0.5 active:translate-y-0 relative overflow-hidden"
            id="order-submit-button"
          >
            {isSubmitting ? (
              <div className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                <span>GUARDANDO TU PEDIDO...</span>
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
