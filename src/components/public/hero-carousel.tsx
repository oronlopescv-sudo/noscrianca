"use client";

import { useEffect, useRef, useState } from "react";

/** Carrossel da faixa principal do site da creche: troca sozinho, com pontos e deslize no telemóvel. */
export function HeroCarousel({ images, alt, className }: { images: string[]; alt: string; className?: string }) {
  const [i, setI] = useState(0);
  const [pausa, setPausa] = useState(false);
  const toque = useRef<number | null>(null);
  const n = images.length;

  useEffect(() => {
    if (n < 2 || pausa) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((x) => (x + 1) % n), 5000);
    return () => clearInterval(t);
  }, [n, pausa]);

  return (
    <div
      className={className}
      role="group"
      aria-roledescription="carrossel"
      aria-label="Fotografias da creche"
      onMouseEnter={() => setPausa(true)}
      onMouseLeave={() => setPausa(false)}
      onTouchStart={(e) => { toque.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (toque.current == null || n < 2) return;
        const dx = e.changedTouches[0].clientX - toque.current;
        toque.current = null;
        if (Math.abs(dx) > 40) setI((x) => (x + (dx < 0 ? 1 : n - 1)) % n);
      }}
    >
      {images.map((src, k) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt={k === i ? alt : ""}
          aria-hidden={k !== i}
          fetchPriority={k === 0 ? "high" : undefined}
          loading={k === 0 ? "eager" : "lazy"}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${k === i ? "opacity-100" : "opacity-0"}`}
        />
      ))}
      {n > 1 && (
        <div className="absolute inset-x-0 bottom-1 z-10 flex justify-center lg:bottom-14">
          {images.map((src, k) => (
            <button key={src} type="button" onClick={() => setI(k)} aria-label={`Fotografia ${k + 1} de ${n}`} aria-current={k === i} className="flex h-9 w-7 items-center justify-center">
              <span className={`block h-3.5 w-3.5 rounded-full border-2 border-white shadow ${k === i ? "bg-[#1E63D6]" : "bg-white"}`} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
