import React from 'react';

interface ProductBottleSVGProps {
  className?: string;
  showBadge?: boolean;
}

export default function ProductBottleSVG({ className = "w-64 h-auto", showBadge = false }: ProductBottleSVGProps) {
  return (
    <div className={`relative flex items-center justify-center select-none ${className}`}>
      {/* Background radial soft orange glow */}
      <div className="absolute inset-0 bg-radial from-orange-400/10 via-transparent to-transparent blur-2xl -z-10 group-hover:from-orange-400/25 transition-all duration-300" />
      
      {/* Container to crop excess white borders and highlight the bottle with subtle orange hover glow */}
      <div className="relative w-full aspect-[4/5] overflow-hidden bg-white/95 rounded-2xl flex items-center justify-center border border-slate-100/65 shadow-xs transition-all duration-300 group-hover:border-orange-400/30 group-hover:shadow-[0_15px_35px_rgba(240,90,40,0.22)]">
        <img
          src={`${import.meta.env.BASE_URL}images/anthelios-uvmune-400.jpg`}
          alt="La Roche-Posay Anthelios UVMune 400 Oil Control Fluide"
          className="w-full h-full object-contain scale-[1.7] -translate-y-[2%] select-none transition-all duration-300 transform group-hover:scale-[1.76] group-hover:-translate-y-[3%]"
        />
      </div>
      
      {/* Matte dry touch overlay simulation on hover */}
      <div className="absolute top-[40%] right-[10%] bg-green-500/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full scale-0 group-hover:scale-100 transition-all duration-300 pointer-events-none drop-shadow-md z-15">
        ¡Efecto Matificante!
      </div>
    </div>
  );
}
