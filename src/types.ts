export interface Order {
  id: string;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  documentId?: string;
  department: string;
  city: string;
  address: string;
  address2?: string;
  notes: string;
  offerId: string;
  offerName: string;
  totalPrice: number;
  quantity: number;
  status: 'new' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
  date: string;
  synced?: boolean;
  paymentMethod?: string;
}

export interface Review {
  id: string;
  author: string;
  text: string;
  rating: number;
  date: string;
  skinType: string;
  isVerified: boolean;
  avatarUrl?: string;
  likes: number;
  image?: string; // Optional review image
}

export interface FAQItem {
  question: string;
  answer: string;
}

export interface OrderOffer {
  id: string;
  name: string;
  subtitle: string;
  price: number;
  savings?: number;
  isPopular?: boolean;
  quantity: number;
  kommoUrl?: string;
  mercadopagoUrl?: string;
}

export interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
}
