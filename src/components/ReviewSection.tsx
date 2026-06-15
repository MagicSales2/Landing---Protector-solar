import React, { useState } from 'react';
import { Star, Check, ThumbsUp, MessageSquare, Plus } from 'lucide-react';
import { COLOMBIAN_REVIEWS } from '../data';
import { Review } from '../types';

export default function ReviewSection() {
  const [reviews, setReviews] = useState<Review[]>(COLOMBIAN_REVIEWS);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newReview, setNewReview] = useState({
    author: '',
    text: '',
    rating: 5,
    skinType: 'Piel Grasa'
  });
  const [likedReviews, setLikedReviews] = useState<Record<string, boolean>>({});

  const handleLike = (id: string) => {
    if (likedReviews[id]) {
      // Unlike
      setReviews(prev =>
        prev.map(r => r.id === id ? { ...r, likes: r.likes - 1 } : r)
      );
      setLikedReviews(prev => ({ ...prev, [id]: false }));
    } else {
      // Like
      setReviews(prev =>
        prev.map(r => r.id === id ? { ...r, likes: r.likes + 1 } : r)
      );
      setLikedReviews(prev => ({ ...prev, [id]: true }));
    }
  };

  const handleSubmitReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReview.author.trim() || !newReview.text.trim()) return;

    const reviewObj: Review = {
      id: `rev-user-${Date.now()}`,
      author: newReview.author,
      text: newReview.text,
      rating: newReview.rating,
      date: "Hoy",
      skinType: newReview.skinType,
      isVerified: true,
      likes: 0
    };

    setReviews([reviewObj, ...reviews]);
    setNewReview({ author: '', text: '', rating: 5, skinType: 'Piel Grasa' });
    setShowAddForm(false);
  };

  // Stats calculation
  const totalReviews = reviews.length;
  const averageRating = (reviews.reduce((acc, curr) => acc + curr.rating, 0) / totalReviews).toFixed(1);

  return (
    <section id="testimonios" className="py-16 px-4 bg-white">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-1 bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full mb-3">
            <Check className="w-3.5 h-3.5" />
            <span>OPINIONES COMPROBADAS (COLOMBIA)</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
            Lo que opinan nuestros clientes
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Más de {1200 + totalReviews} colombianos han verificado los resultados clínicos en su piel.
          </p>
        </div>

        {/* Review Stats Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-50 rounded-2xl p-6 mb-10 items-center border border-slate-100">
          <div className="text-center">
            <div className="text-5xl font-black text-slate-900">{averageRating}</div>
            <div className="flex justify-center my-2">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star key={s} className="w-5 h-5 fill-yellow-400 stroke-yellow-400" />
              ))}
            </div>
            <p className="text-xs text-slate-500 font-medium">Basado en {totalReviews + 450} valoraciones</p>
          </div>

          <div className="space-y-2 col-span-1 md:col-span-2">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-600 w-20 shrink-0 text-right">5 Estrellas</span>
              <div className="flex-1 bg-slate-200 h-2.5 rounded-full overflow-hidden">
                <div className="bg-orange-500 h-full rounded-full" style={{ width: '92%' }}></div>
              </div>
              <span className="text-xs font-semibold text-slate-500 w-8">92%</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-600 w-20 shrink-0 text-right">4 Estrellas</span>
              <div className="flex-1 bg-slate-200 h-2.5 rounded-full overflow-hidden">
                <div className="bg-orange-400 h-full rounded-full" style={{ width: '6%' }}></div>
              </div>
              <span className="text-xs font-semibold text-slate-500 w-8">6%</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-600 w-20 shrink-0 text-right">3 Estrellas</span>
              <div className="flex-1 bg-slate-200 h-2.5 rounded-full overflow-hidden">
                <div className="bg-yellow-400 h-full rounded-full" style={{ width: '2%' }}></div>
              </div>
              <span className="text-xs font-semibold text-slate-500 w-8">2%</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-600 w-20 shrink-0 text-right">2 Estrellas</span>
              <div className="flex-1 bg-slate-200 h-2.5 rounded-full overflow-hidden">
                <div className="bg-slate-300 h-full rounded-full" style={{ width: '0%' }}></div>
              </div>
              <span className="text-xs font-semibold text-slate-500 w-8">0%</span>
            </div>
          </div>
        </div>

        {/* Write a review toggle */}
        <div className="flex justify-end mb-6">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 text-xs font-bold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100/80 px-4 py-2 rounded-lg transition-all"
            id="write-review-button"
          >
            <Plus className="w-4 h-4" />
            Escribir opinión
          </button>
        </div>

        {/* Add Review Form */}
        {showAddForm && (
          <form
            onSubmit={handleSubmitReview}
            className="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-8 animate-fadeIn"
            id="review-form"
          >
            <h3 className="text-sm font-bold text-slate-800 mb-4">Déjanos tu opinión</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Nombre Completo</label>
                <input
                  required
                  type="text"
                  placeholder="Ej: Laura Castro"
                  value={newReview.author}
                  onChange={e => setNewReview({ ...newReview, author: e.target.value })}
                  className="w-full text-sm px-3 py-2 border rounded-lg focus:ring-1 focus:ring-orange-500 focus:border-orange-500 outline-none bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Tipo de Piel</label>
                <select
                  value={newReview.skinType}
                  onChange={e => setNewReview({ ...newReview, skinType: e.target.value })}
                  className="w-full text-sm px-3 py-2 border rounded-lg focus:ring-1 focus:ring-orange-500 focus:border-orange-500 outline-none bg-white"
                >
                  <option value="Piel Grasa">Piel Grasa</option>
                  <option value="Piel Mixta">Piel Mixta</option>
                  <option value="Piel Seca">Piel Seca</option>
                  <option value="Piel Sensible">Piel Sensible</option>
                  <option value="Piel con Tendencia Acnéica">Piel con Tendencia Acnéica</option>
                </select>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-600 mb-1">Calificación (Estrellas)</label>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setNewReview({ ...newReview, rating: num })}
                    className="focus:outline-none min-w-[32px] min-h-[32px]"
                  >
                    <Star
                      className={`w-6 h-6 ${
                        num <= newReview.rating
                          ? 'fill-yellow-400 stroke-yellow-400'
                          : 'stroke-slate-300'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-600 mb-1">Comentario</label>
              <textarea
                required
                rows={3}
                placeholder="Cuéntanos tu experiencia con el producto..."
                value={newReview.text}
                onChange={e => setNewReview({ ...newReview, text: e.target.value })}
                className="w-full text-sm px-3 py-2 border rounded-lg focus:ring-1 focus:ring-orange-500 focus:border-orange-500 outline-none bg-white"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-200/50 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow"
                id="submit-review-form"
              >
                Publicar Opinión
              </button>
            </div>
          </form>
        )}

        {/* Reviews List */}
        <div className="space-y-4">
          {reviews.map((r) => (
            <div
              key={r.id}
              className="border border-slate-100 rounded-xl p-5 hover:shadow-sm transition-all duration-200 bg-slate-50/50"
              id={`review-card-${r.id}`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 mb-2.5">
                <div className="space-y-1.5 flex-1 w-full">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-800 text-sm md:text-base">
                      {r.author}
                    </span>
                    {r.isVerified && (
                      <span className="inline-flex items-center gap-1 bg-green-100/80 text-green-700 text-[9px] font-extrabold px-1.5 py-0.5 rounded-sm uppercase tracking-wider select-none">
                        <Check className="w-2.5 h-2.5 stroke-[3]" /> Compra Verificada
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className="flex gap-0.5 shrink-0 align-middle">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`w-3.5 h-3.5 ${
                            i < r.rating
                              ? 'fill-yellow-400 stroke-yellow-400'
                              : 'stroke-slate-200'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-[10px] md:text-xs text-slate-400 font-bold">•</span>
                    <span className="text-[10px] md:text-xs text-slate-400 font-medium">{r.date}</span>
                    <span className="text-[10px] md:text-xs text-slate-400 font-bold">•</span>
                    <span className="inline-flex items-center bg-slate-200/60 text-slate-600 font-bold px-2 py-0.5 rounded-full text-[9px] md:text-[10px] uppercase tracking-wide select-none">
                      {r.skinType}
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-slate-600 text-xs md:text-sm leading-relaxed mb-4 mt-2">
                {r.text}
              </p>

              <div className="flex items-center justify-between border-t border-slate-100/80 pt-3 text-[11px] md:text-xs text-slate-400 font-medium">
                <button
                  onClick={() => handleLike(r.id)}
                  className={`flex items-center gap-1.5 hover:text-slate-600 transition-colors ${
                    likedReviews[r.id] ? 'text-blue-600 font-bold' : ''
                  } min-h-[30px]`}
                  id={`like-${r.id}`}
                >
                  <ThumbsUp className={`w-3.5 h-3.5 ${likedReviews[r.id] ? 'fill-blue-500 stroke-blue-600' : ''}`} />
                  <span>¿Es útil? ({r.likes})</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
