"use client";

// A silent looping demo: plays while it is on screen and pauses off screen (a copy hidden by CSS never plays). With
// reduced motion it waits for Play.
import { useEffect, useRef } from "react";

export function DemoVideo({ src, poster, label, className = "" }: { src: string; poster: string; label: string; className?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = video.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const seen = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) void el.play().catch(() => {});
      else el.pause();
    }, { threshold: 0.35 });
    seen.observe(el);
    return () => seen.disconnect();
  }, []);
  return (
    <video ref={video} className={`gd-video ${className}`.trim()} src={src} poster={poster} muted loop playsInline controls preload="metadata" aria-label={label} />
  );
}
