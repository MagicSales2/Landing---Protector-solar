import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Pause, Volume2, VolumeX, ChevronLeft, ChevronRight, MessageCircle, Heart, User, Check, Sparkles, MapPin, Smartphone, X } from 'lucide-react';

interface VideoReview {
  id: string;
  name: string;
  age: number;
  city: string;
  skinType: string;
  title: string;
  duration: string;
  coverGradient: string;
  avatarLetter: string;
  avatarBg: string;
  highlights: string[];
  captions: string[];
}

const COLOMBIAN_VIDEO_REVIEWS: VideoReview[] = [
  {
    id: "vid-1",
    name: "Luisa Valenzuela",
    age: 25,
    city: "Medellín",
    skinType: "Piel Mixta a Grasa",
    title: "¡Increíble para piel grasa! ¿Queda pegajoso? ¿Se puede usar con maquillaje?",
    duration: "0:18",
    coverGradient: "from-amber-500/30 to-orange-900/40",
    avatarLetter: "L",
    avatarBg: "bg-orange-500",
    highlights: ["No deja la piel grasosa ni pegajosa", "Se absorbe súper rápido", "Perfecto bajo el maquillaje"],
    captions: [
      "En el live me preguntan todo el tiempo cuál protector uso...",
      "Si no deja grasa, si sirve para piel mixta, si funciona para piel sensible...",
      "¡Sí! Siempre recomiendo este Anthelios que no deja la piel grasosa ni pegajosa.",
      "Se absorbe súper rápido y puedo maquillarme después sin ningún problema.",
      "Les dejo el enlace aquí abajo con una súper oferta, ¡no la dejes pasar!"
    ]
  },
  {
    id: "vid-3",
    name: "Valeria Gómez",
    age: 29,
    city: "Cali",
    skinType: "Piel Sensible",
    title: "Ya estaba resignada a la cara grasosa hasta que encontré esta maravilla",
    duration: "0:09",
    coverGradient: "from-emerald-500/30 to-teal-900/40",
    avatarLetter: "V",
    avatarBg: "bg-emerald-600",
    highlights: ["Textura ligera no grasosa", "Fórmula fluida invisible", "Acabado mate de toque seco"],
    captions: [
      "Yo ya estaba resignada a que todos los protectores me dejaran la cara grasosa...",
      "Hasta que encontré este Anthelios. Miren cómo queda de espectacular.",
      "Varias me han preguntado cuál uso, les dejo el enlace abajo...",
      "Aprovechen porque hoy tiene descuento y envío gratis."
    ]
  },
  {
    id: "vid-4",
    name: "Camila Restrepo",
    age: 31,
    city: "Barranquilla",
    skinType: "Piel Mixta",
    title: "¿Te pones protector y pareces una empanada? ¡Usa este!",
    duration: "0:09",
    coverGradient: "from-rose-500/30 to-purple-950/40",
    avatarLetter: "C",
    avatarBg: "bg-rose-500",
    highlights: ["Cero sensación grasosa", "Ideal para climas húmedos", "Toque ultra seco y limpio"],
    captions: [
      "¿No les pasa? Se ponen protector y a las dos horas parecen una empanada, jaja.",
      "Por eso empecé a usar este fluido de Anthelios.",
      "Me deja la piel totalmente mate, hermosa y ligera. Se los súper recomiendo.",
      "Pide ya el tuyo haciendo clic en el botón de abajo."
    ]
  },
  {
    id: "vid-5",
    name: "Isabella Rochel",
    age: 26,
    city: "Bucaramanga",
    skinType: "Piel Grasa y Sensible",
    title: "El protector diario que mantiene mi cara sin brillos ni pegajosidad",
    duration: "0:09",
    coverGradient: "from-yellow-500/30 to-amber-950/40",
    avatarLetter: "I",
    avatarBg: "bg-amber-500",
    highlights: ["Cero residuos blancos", "No pica ni irrita los ojos", "Control de sebo por horas"],
    captions: [
      "Me preguntan mucho qué protector solar estoy usando últimamente...",
      "Y miren, estoy usando este Anthelios Oil Control.",
      "Lo que más me gusta es que no me deja la cara brillante ni pegajosa.",
      "Les dejo el link abajo porque hoy tiene descuento especial."
    ]
  },
  {
    id: "vid-6",
    name: "Mariana Silva",
    age: 24,
    city: "Cartagena",
    skinType: "Piel con Tendencia al Acné",
    title: "Si usas skincare pero no este protector, estás perdiendo el dinero",
    duration: "0:09",
    coverGradient: "from-teal-500/30 to-indigo-950/40",
    avatarLetter: "M",
    avatarBg: "bg-teal-600",
    highlights: ["Protección de amplio espectro", "Súper fluido no comedogénico", "El mejor protector de Colombia"],
    captions: [
      "Si gastas en skincare y no usas un buen protector, estás perdiendo la plata.",
      "Yo no lo sabía, pero ahora uso este todos los días sin falta.",
      "Miren la textura, les dejo el link abajo para que no les pase lo mismo.",
      "Pide el tuyo con envío gratis y paga contra entrega."
    ]
  }
];

export default function VideoTestimonials() {
  const [activeVideo, setActiveVideo] = useState<VideoReview | null>(null);
  const [likes, setLikes] = useState<Record<string, number>>({
    'vid-1': 142,
    'vid-3': 76,
    'vid-4': 189,
    'vid-5': 114,
    'vid-6': 245
  });
  const [hasLiked, setHasLiked] = useState<Record<string, boolean>>({});
  const [isPlaying, setIsPlaying] = useState(false);
  const [captionIndex, setCaptionIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoError, setVideoError] = useState<boolean>(false);
  const carouselRef = useRef<HTMLDivElement>(null);

  // Handle slide scrolling
  const scroll = (direction: 'left' | 'right') => {
    if (carouselRef.current) {
      const { scrollLeft, clientWidth } = carouselRef.current;
      const scrollTo = direction === 'left' 
        ? scrollLeft - clientWidth * 0.75 
        : scrollLeft + clientWidth * 0.75;
      
      carouselRef.current.scrollTo({
        left: scrollTo,
        behavior: 'smooth'
      });
    }
  };

  const handleLike = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasLiked[id]) {
      setLikes(prev => ({ ...prev, [id]: prev[id] - 1 }));
      setHasLiked(prev => ({ ...prev, [id]: false }));
    } else {
      setLikes(prev => ({ ...prev, [id]: prev[id] + 1 }));
      setHasLiked(prev => ({ ...prev, [id]: true }));
    }
  };

  const openLightbox = (video: VideoReview) => {
    setActiveVideo(video);
    setIsPlaying(true);
    setCaptionIndex(0);
    setProgress(0);
    setVideoError(false);
  };

  const closeLightbox = () => {
    setActiveVideo(null);
    setIsPlaying(false);
  };

  // Synchronize playing states with the real video element
  useEffect(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.play().catch((err) => {
          console.warn("Autoplay blocked or play interrupted:", err);
        });
      } else {
        videoRef.current.pause();
      }
    }
  }, [isPlaying, activeVideo]);

  // Handle HTML5 video time updates
  const handleTimeUpdate = () => {
    if (videoRef.current && !videoError) {
      const current = videoRef.current.currentTime;
      const duration = videoRef.current.duration || 1;
      const pct = (current / duration) * 100;
      setProgress(pct);

      if (activeVideo) {
        const totalCaptions = activeVideo.captions.length;
        const currentSegment = Math.floor((current / duration) * totalCaptions);
        if (currentSegment !== captionIndex && currentSegment < totalCaptions) {
          setCaptionIndex(currentSegment);
        }
      }
    }
  };

  // Handle timeline manual scrubbing clicks
  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    setProgress(pct);

    if (videoRef.current && !videoError) {
      const duration = videoRef.current.duration || 1;
      videoRef.current.currentTime = (pct / 100) * duration;
    }
  };

  // Fallback simulator for when video files are not found/uploaded yet
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (activeVideo && isPlaying && videoError) {
      timer = setInterval(() => {
        setProgress(prev => {
          const nextProg = prev + 1;
          if (nextProg >= 100) {
            // Loop or finish
            setCaptionIndex(0);
            return 0;
          }
          // Increment captions based on progress
          const totalCaptions = activeVideo.captions.length;
          const currentSegment = Math.floor((nextProg / 100) * totalCaptions);
          if (currentSegment !== captionIndex && currentSegment < totalCaptions) {
            setCaptionIndex(currentSegment);
          }
          return nextProg;
        });
      }, 100);
    }
    return () => clearInterval(timer);
  }, [activeVideo, isPlaying, captionIndex, videoError]);

  return (
    <section id="testimonios-video" className="py-16 px-4 bg-slate-900 text-white overflow-hidden border-t border-slate-800">
      <div className="max-w-6xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 bg-orange-500/15 border border-orange-500/20 text-orange-400 text-[10px] md:text-xs font-black px-3.5 py-1.5 rounded-full mb-3 uppercase tracking-wider">
              <Smartphone className="w-3.5 h-3.5 animate-pulse" />
              <span>Video Opiniones Reales</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">
              Testimonios de Clientes en Colombia
            </h2>
            <p className="mt-2 text-sm text-slate-400 max-w-xl font-medium">
              Mira los videos de reseñas de personas reales probando y contando su experiencia con el toque seco de Anthelios.
            </p>
          </div>

          {/* Carousel Arrows */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => scroll('left')}
              className="w-10 h-10 rounded-full border border-slate-800 hover:border-slate-700 bg-slate-950 flex items-center justify-center hover:bg-slate-800 transition-colors cursor-pointer"
              title="Anterior"
            >
              <ChevronLeft className="w-5 h-5 text-slate-300" />
            </button>
            <button
              onClick={() => scroll('right')}
              className="w-10 h-10 rounded-full border border-slate-800 hover:border-slate-700 bg-slate-950 flex items-center justify-center hover:bg-slate-800 transition-colors cursor-pointer"
              title="Siguiente"
            >
              <ChevronRight className="w-5 h-5 text-slate-300" />
            </button>
          </div>
        </div>

        {/* Video Cards Grid/Flex view */}
        <div 
          ref={carouselRef}
          className="flex overflow-x-auto gap-5 pb-6 scrollbar-none snap-x snap-mandatory scroll-smooth"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {COLOMBIAN_VIDEO_REVIEWS.map((review) => (
            <div
              key={review.id}
              onClick={() => openLightbox(review)}
              onMouseEnter={(e) => {
                const video = e.currentTarget.querySelector('video');
                if (video) {
                  video.play().catch(() => {});
                }
              }}
              onMouseLeave={(e) => {
                const video = e.currentTarget.querySelector('video');
                if (video) {
                  video.pause();
                  // Reset to first frame on mouse leave so it looks like a clean cover
                  video.currentTime = 0;
                }
              }}
              className="flex-shrink-0 w-[270px] md:w-[290px] snap-start group relative bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden cursor-pointer hover:border-orange-500/50 transition-all duration-300 shadow-xl"
              id={`video-card-${review.id}`}
            >
              
              {/* Cover simulated video viewport */}
              <div className="relative aspect-[9/16] overflow-hidden bg-slate-900 flex items-center justify-center">
                
                {/* Real HTML5 Video acting as a beautiful dynamic poster cover (displays first frame natively) */}
                <video
                  src={review.id === "vid-1" ? "/Video 1.mp4" :
                       review.id === "vid-3" ? "/Video 3.mp4" :
                       review.id === "vid-4" ? "/Video 4.mp4" :
                       review.id === "vid-5" ? "/Video 5.mp4" :
                       "/Video 6.mp4"}
                  className="absolute inset-0 w-full h-full object-cover opacity-85 group-hover:opacity-100 transition-all duration-300"
                  preload="metadata"
                  playsInline
                  muted
                  loop
                />
                
                {/* Aesthetic UI Overrides & Darkening gradients for absolute readability */}
                <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent pointer-events-none" />
                <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />
                
                {/* Simulated product overlays or patterns */}
                <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.15)_1px,transparent_1px)] bg-[size:16px_16px] pointer-events-none" />
                
                {/* Aesthetic UI Overrides */}
                <div className="absolute top-4 left-4 bg-orange-600 text-white font-black text-[9px] px-2.5 py-1 rounded-md uppercase tracking-wider flex items-center gap-1.5 shadow-sm z-10">
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                  <span>reseña</span>
                </div>

                <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md text-[10px] text-white font-mono px-2 py-0.5 rounded-full z-10">
                  {review.duration}
                </div>

                {/* Animated Play Circle */}
                <div className="z-10 w-14 h-14 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:bg-orange-600 group-hover:border-orange-500 group-hover:text-white shadow-lg">
                  <Play className="w-6 h-6 fill-current translate-x-0.5" />
                </div>

                {/* Floating caption snippet */}
                <div className="absolute bottom-4 inset-x-4 bg-slate-950/75 backdrop-blur-sm border border-white/5 rounded-2xl p-3 z-10">
                  <p className="text-[11px] font-bold text-slate-300 group-hover:text-orange-400 line-clamp-1 transition-colors">
                    "{review.title}"
                  </p>
                  <p className="text-[9px] text-slate-400 font-semibold mt-1">Hacer clic para ver testimonio</p>
                </div>
              </div>

              {/* Botton User Info Card */}
              <div className="p-4.5 bg-slate-950 flex flex-col justify-between border-t border-slate-900/60">
                <div className="flex items-center justify-between">
                  {/* User Profile */}
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-full ${review.avatarBg} text-white flex items-center justify-center font-bold text-xs uppercase shadow-sm`}>
                      {review.avatarLetter}
                    </div>
                    <div>
                      <h4 className="text-white text-xs font-black flex items-center gap-1">
                        {review.name}
                        <Check className="w-3 h-3 text-emerald-400 stroke-[3px]" />
                      </h4>
                      <span className="text-[10px] text-slate-400 font-medium flex items-center gap-0.5 mt-0.5">
                        <MapPin className="w-3 h-3 text-orange-500 flex-shrink-0" />
                        {review.city} • {review.age} años
                      </span>
                    </div>
                  </div>

                  {/* Feedback Action Buttons (Social Sim) */}
                  <button
                    onClick={(e) => handleLike(review.id, e)}
                    className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-red-500 font-bold transition-colors cursor-pointer min-h-[25px]"
                  >
                    <Heart className={`w-3.5 h-3.5 ${hasLiked[review.id] ? 'fill-red-500 stroke-red-500 text-red-500' : ''}`} />
                    <span>{likes[review.id]}</span>
                  </button>
                </div>

                <div className="mt-3.5 pt-3 border-t border-slate-900 flex items-center justify-between">
                  <span className="text-[9px] bg-slate-900 border border-slate-800 text-slate-350 font-bold px-2.5 py-1 rounded-md uppercase tracking-wider">
                    👉 {review.skinType}
                  </span>
                </div>
              </div>

            </div>
          ))}
        </div>

        {/* Floating Lightbox Simulator Portal */}
        <AnimatePresence>
          {activeVideo && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex items-start md:items-center justify-center p-4 overflow-y-auto"
              onClick={closeLightbox}
            >
              {/* Floating Quick Close Button in top right */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeLightbox();
                }}
                className="fixed top-4 right-4 z-55 bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-white p-3 rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.5)] transition-all hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-orange-500 cursor-pointer"
                title="Cerrar video"
              >
                <X className="w-5 h-5 md:w-6 md:h-6 text-slate-100" />
              </button>

              <motion.div
                initial={{ scale: 0.95, y: 15 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 15 }}
                transition={{ type: 'spring', damping: 25 }}
                className="bg-slate-900 border border-slate-800 w-full max-w-4xl rounded-3xl overflow-hidden shadow-[0_24px_50px_rgba(0,0,0,0.8)] grid grid-cols-1 md:grid-cols-12 my-auto"
                onClick={(e) => e.stopPropagation()}
              >
                
                {/* 1. Left Col: High fidelity Dual Mode HTML5 & Virtual Video Player */}
                <div className="md:col-span-6 relative aspect-[9/16] bg-black flex flex-col justify-between overflow-hidden">
                  
                  {activeVideo && (
                    <video
                      ref={videoRef}
                      src={activeVideo.id === "vid-1" ? "/Video 1.mp4" :
                           activeVideo.id === "vid-3" ? "/Video 3.mp4" :
                           activeVideo.id === "vid-4" ? "/Video 4.mp4" :
                           activeVideo.id === "vid-5" ? "/Video 5.mp4" :
                           "/Video 6.mp4"}
                      className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${videoError ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
                      playsInline
                      loop
                      muted={isMuted}
                      onTimeUpdate={handleTimeUpdate}
                      onError={() => {
                        console.log("No local .mp4 found for " + activeVideo.id + ", showing simulated stream experience.");
                        setVideoError(true);
                      }}
                    />
                  )}

                  {/* Fallback Simulator / Upload Instructional Screen when .mp4 is not in public directory */}
                  {videoError && (
                    <>
                      {/* Video Graphic Canvas Background */}
                      <div className={`absolute inset-0 bg-gradient-to-b ${activeVideo.coverGradient} opacity-60`} />
                      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(234,88,12,0.15)_0%,transparent_70%)]" />
                      
                      {/* Simulated wave or noise to signify running video stream */}
                      {isPlaying && (
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center gap-1.5 opacity-5 pointer-events-none">
                          <div className="w-12 h-12 rounded-full border-4 border-white animate-ping" />
                        </div>
                      )}

                      {/* Video instructions card */}
                      <div className="absolute inset-x-6 top-1/4 bg-slate-950/85 backdrop-blur-md border border-orange-500/20 p-4.5 rounded-2xl text-center z-10 shadow-lg">
                        <Smartphone className="w-6 h-6 text-orange-400 mx-auto mb-2 animate-bounce" />
                        <p className="text-xs font-black text-white">📽️ Tu video "{activeVideo.name.split(' ')[0]}" está listo para cargarse</p>
                        <p className="text-[10px] text-slate-300 mt-1.5 leading-relaxed">
                          Usa el menú del explorador de archivos a la izquierda en AI Studio para crear una carpeta llamada <span className="font-mono text-emerald-450 font-bold bg-slate-900 border border-slate-800 px-1 py-0.5 rounded">public</span> y arrastra allí tu archivo:
                        </p>
                        <p className="text-xs font-mono text-orange-400 font-bold bg-black/50 px-2 py-1 rounded border border-white/5 mt-2 max-w-max mx-auto">
                          video{activeVideo.id.split('-')[1]}.mp4
                        </p>
                        <p className="text-[9px] text-orange-400 font-bold mt-2 animate-pulse">
                          ¡Por ahora se muestra la simulación activa!
                        </p>
                      </div>
                    </>
                  )}

                  {/* Top Bar Player Controls */}
                  <div className="z-10 p-4 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 bg-red-600 rounded-full animate-pulse" />
                      <span className="text-[10px] text-white font-black uppercase tracking-widest bg-red-600/10 px-2 py-0.5 rounded-sm">RESEÑA DE VÍDEO</span>
                    </div>

                    <button
                      onClick={() => setIsMuted(!isMuted)}
                      className="p-2 bg-black/40 backdrop-blur-md text-white rounded-full hover:bg-slate-800 transition-colors cursor-pointer"
                      title={isMuted ? "Activar Audio" : "Silenciar"}
                    >
                      {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Mid-screen Play/Pause Indicator Overlay */}
                  <div 
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="absolute inset-0 flex items-center justify-center cursor-pointer z-10"
                  >
                    {!isPlaying && (
                      <div className="w-16 h-16 rounded-full bg-orange-600 text-white flex items-center justify-center scale-105 shadow-xl transition-transform">
                        <Play className="w-7 h-7 fill-current translate-x-0.5" />
                      </div>
                    )}
                  </div>

                  {/* Down Bottom: Video controls */}
                  <div className="z-10 p-5 bg-gradient-to-t from-black/90 via-black/50 to-transparent text-center space-y-4">
                    
                    {/* Scrubbing custom timeline bar */}
                    <div className="space-y-1.5 font-sans">
                      <div className="bg-slate-800 h-1.5 rounded-full overflow-hidden cursor-pointer relative" onClick={handleScrub}>
                        <div 
                          className="bg-orange-500 h-full rounded-full transition-all duration-100 ease-out" 
                          style={{ width: `${progress}%` }} 
                        />
                      </div>
                      
                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                        <button onClick={() => setIsPlaying(!isPlaying)} className="flex items-center gap-1 text-slate-300 font-bold min-h-[25px]">
                          {isPlaying ? <Pause className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                          {isPlaying ? 'Pausar' : 'Reproducir'}
                        </button>
                        <span>0:{(Math.floor((progress / 100) * parseInt(activeVideo.duration.split(':')[1]))).toString().padStart(2, '0')} / {activeVideo.duration}</span>
                      </div>
                    </div>

                  </div>

                </div>

                {/* 2. Right Col: Details / User insights & highlight quotes */}
                <div className="md:col-span-6 p-6 md:p-8 flex flex-col justify-between bg-slate-900 border-l border-slate-800">
                  <div className="space-y-6">
                    
                    {/* Header profile details */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full ${activeVideo.avatarBg} text-white flex items-center justify-center font-bold text-sm uppercase shadow-sm`}>
                          {activeVideo.avatarLetter}
                        </div>
                        <div>
                          <h3 className="text-white text-base font-black flex items-center gap-1">
                            {activeVideo.name}
                            <Check className="w-4 h-4 text-emerald-400 stroke-[3px]" />
                          </h3>
                          <p className="text-xs text-slate-400 font-medium flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3.5 h-3.5 text-orange-500" />
                            {activeVideo.city}, CO • {activeVideo.age} años
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={closeLightbox}
                        className="p-1 px-3 text-xs bg-slate-800 border border-slate-700 text-slate-300 hover:text-white rounded-lg hover:bg-slate-700 transition"
                      >
                        Cerrar
                      </button>
                    </div>

                    {/* Skin Tag and Category badge */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <span className="text-[10px] bg-slate-950 border border-slate-800 text-slate-300 font-bold px-3 py-1.5 rounded-full uppercase tracking-wider">
                        Tipo de Piel: {activeVideo.skinType}
                      </span>
                      <span className="text-[10px] bg-green-500/10 border border-green-500/15 text-green-400 font-bold px-3 py-1.5 rounded-full uppercase tracking-wider">
                        ✓ Compra Real Verificada
                      </span>
                    </div>

                    {/* Title */}
                    <div className="space-y-2">
                      <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Tema de la opinión:</h4>
                      <p className="text-base md:text-lg font-black text-white leading-tight">
                        "{activeVideo.title}"
                      </p>
                    </div>

                    {/* Highlights Bullets */}
                    <div className="space-y-3 pt-2">
                      <h4 className="text-xs font-bold text-orange-500 uppercase tracking-widest flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-orange-400 fill-orange-400" />
                        Puntos Destacados de su Experiencia
                      </h4>
                      <ul className="space-y-2.5">
                        {activeVideo.highlights.map((item, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-xs md:text-sm text-slate-300 font-semibold leading-relaxed">
                            <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5 stroke-[3px]" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                  </div>

                  {/* Bottom: WhatsApp Consultation or Action dispatch */}
                  <div className="pt-6 border-t border-slate-800 mt-6 md:mt-0 space-y-3">
                    <button
                      onClick={() => {
                        closeLightbox();
                        const formElem = document.getElementById('formulario-pedido');
                        if (formElem) {
                          formElem.scrollIntoView({ behavior: 'smooth' });
                          formElem.classList.add('ring-4', 'ring-orange-500', 'transition-all', 'duration-500');
                          setTimeout(() => {
                            formElem.classList.remove('ring-4', 'ring-orange-500');
                          }, 2000);
                        }
                      }}
                      className="w-full text-center bg-orange-600 hover:bg-orange-700 text-white font-black text-xs md:text-sm py-4 rounded-xl cursor-pointer shadow-lg hover:scale-[1.01] transition-transform active:scale-[0.99]"
                    >
                      🛍️ Pedir Ahora de Forma Segura (${activeVideo.name.split(' ')[0]} lo recomienda)
                    </button>
                    <p className="text-[10px] text-slate-500 text-center font-bold uppercase tracking-wider">
                      🚚 ENVÍO GRATUITO • PAGO EFECTIVO CONTRA ENTREGA EN COLOMBIA
                    </p>
                  </div>

                </div>

              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </section>
  );
}
