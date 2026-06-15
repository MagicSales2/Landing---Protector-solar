import { Review, FAQItem, OrderOffer } from './types';

export const COLOMBIAN_REVIEWS: Review[] = [
  {
    id: "rev-1",
    author: "Valeria Mendoza",
    text: "¡El mejor protector solar del mundo para piel grasa! Vivo en Barranquilla donde la humedad es terrible, y este es el único que me mantiene la cara mate todo el día. No es grasoso, no deja marcas blancas y se absorbe de inmediato. Además, pagué en efectivo cuando llegó a mi casa. Excelente servicio.",
    rating: 5,
    date: "Ayer",
    skinType: "Piel Grasa / Sensible",
    isVerified: true,
    likes: 84
  },
  {
    id: "rev-2",
    author: "Sebastián Castro",
    text: "Mi dermatóloga me recomendó el Anthelios UVMune 400 por la protección contra los rayos UVA ultra-largos que manchan la piel. Tenía miedo de recibir una imitación, pero este producto es de excelente procedencia, de calidad certificada y con fecha de vencimiento muy lejana. El envío a Medellín fue gratis y tardó solo 2 días.",
    rating: 5,
    date: "Hace 2 días",
    skinType: "Piel Mixta",
    isVerified: true,
    likes: 42
  },
  {
    id: "rev-3",
    author: "Camila Gómez",
    text: "Soy muy pálida y me salen manchas con nada. Este protector me salvó. Su textura fluida es exquisita, súper líquida y ligera, no arde en los ojos para nada. Pedí la oferta de 2 unidades para ahorrar dinero y salió espectacular. El pago contra entrega me dio mucha seguridad para comprar desde TikTok.",
    rating: 5,
    date: "Hace 4 días",
    skinType: "Piel Acnéica / Muy Sensible",
    isVerified: true,
    likes: 51
  },
  {
    id: "rev-4",
    author: "Dr. Mauricio Restrepo (Dermatólogo)",
    text: "Como especialista, ratifico que el filtro Mexoryl 400 de este producto es la innovación científica más grande en fotoprotección de la última década. Protege en el rango de los 380nm-400nm donde otros protectores fallan, previniendo el daño celular profundo y envejecimiento prematuro. Su base de Airlicium para control de sebo es sumamente efectiva.",
    rating: 5,
    date: "Hace 1 semana",
    skinType: "Recomendación Médica",
    isVerified: true,
    likes: 119
  },
  {
    id: "rev-5",
    author: "Diana Patricia Ortiz",
    text: "Excelente atención y despacho súper rápido. Me llegó a Cali en menos de 48 horas. El empaque venía en excelente estado. Lo uso antes del maquillaje y me ayuda a controlar los brillos de la zona T increíblemente. ¡Vale cada peso!",
    rating: 5,
    date: "Hace 1 semana",
    skinType: "Piel Mixta con tendencia a acné",
    isVerified: true,
    likes: 23
  }
];

export const GENERAL_FAQS: FAQItem[] = [
  {
    question: "¿Tienen envío gratis y pago contra entrega?",
    answer: "¡Sí! Ofrecemos envío gratis a nivel nacional en Colombia y pagas en efectivo en el momento en que se te entregue el producto en tu puerta. *Sujeto a cobertura de entrega nacional."
  },
  {
    question: "¿Cómo sé que el producto viene en buen estado?",
    answer: "Ofrecemos total respaldo y confianza. Todos nuestros productos se entregan en perfecto estado en sus empaques de fábrica, con códigos de barras verificables, asegurando fechas de vencimiento vigentes a largo plazo (2028+)."
  },
  {
    question: "¿Para qué tipo de piel está recomendado?",
    answer: "La versión 'Oil Control Fluide' está formulada científicamente para pieles mixtas, grasas, sensibles o con tendencia al acné. Ayuda a absorber excesos de grasa y sudor gracias a su tecnología de micropartículas matificantes Airlicium."
  },
  {
    question: "¿Cuánto demora en llegar mi pedido?",
    answer: "Los envíos tardan entre 1 y 2 días hábiles en ciudades principales (Bogotá, Medellín, Cali, Barranquilla) y de 3 a 5 días hábiles en el resto del país. El despacho se realiza en menos de 24 horas hábiles después de llenar el formulario."
  },
  {
    question: "¿Qué es la protección UVMune 400?",
    answer: "Es la tecnología patentada más avanzada de La Roche-Posay. Utiliza el filtro Mexoryl 400, que protege contra los rayos UV ultra-largos (entre 380 y 400 nanómetros). Estos rayos representan el 30% de la radiación solar y son el causante número uno de manchas oscuras, arrugas y daño en el ADN celular."
  },
  {
    question: "¿Deja rastro blanco en la cara o arde en los ojos?",
    answer: "No. Su textura 'Fluide' es ultra-ligera, transparente y se absorbe inmediatamente sin dejar marcas blancas ni efecto mimo. Además, cuenta con tecnología Netlock que evita que el producto migre con el sudor, previniendo que arda en los ojos."
  }
];

export const PRODUCT_OFFERS: OrderOffer[] = [
  {
    id: "offer-1",
    name: "1 UNIDAD",
    subtitle: "Protección diaria esencial",
    price: 84900,
    isPopular: false,
    quantity: 1,
    kommoUrl: "https://forms.kommo.com/rzrtvdm?dp=Q1zaSQHqO-hHArUG1UMtpTB99ewkmLXe7CtTXZiiPstN5gK954kVaLLFp702YZI6&track=0",
    mercadopagoUrl: "https://link.mercadopago.com.co/anthelios1un"
  },
  {
    id: "offer-2",
    name: "LLEVA 2 UNIDADES (Mejor Oferta)",
    subtitle: "¡Ahorras $19.900 (12% Descuento)!",
    price: 149900,
    savings: 19900,
    isPopular: true,
    quantity: 2,
    kommoUrl: "https://forms.kommo.com/rzrtvcl?dp=Q1zaSQHqO-hHArUG1UMtpTB99ewkmLXe7CtTXZiiPsvDVyzxH4WAFIVWpYR7xH2h&track=0",
    mercadopagoUrl: "https://link.mercadopago.com.co/anthelios2un"
  },
  {
    id: "offer-3",
    name: "LLEVA 3 UNIDADES",
    subtitle: "¡Ahorras $44.800 (18% Descuento)!",
    price: 209900,
    savings: 44800,
    isPopular: false,
    quantity: 3,
    kommoUrl: "https://forms.kommo.com/rzrtvcl?dp=Q1zaSQHqO-hHArUG1UMtpTB99ewkmLXe7CtTXZiiPsvDVyzxH4WAFIVWpYR7xH2h&track=0",
    mercadopagoUrl: "https://link.mercadopago.com.co/anthelios3un"
  }
];
