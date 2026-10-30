"use client";

// Shows a fixed-size design (w x h px) scaled down to the width of its column, never up.
// The box keeps the design's aspect ratio, so the page does not jump when the scale is set.
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export function Fit({ w, h, className = "", children }: { w: number; h: number; className?: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const set = () => setScale(Math.min(1, el.clientWidth / w));
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w]);
  return (
    <div ref={box} className={`wi-fit ${className}`.trim()} style={{ maxWidth: w, aspectRatio: `${w} / ${h}` }}>
      <div className="wi-fit-in" style={{ width: w, height: h, transform: `scale(${scale})` }}>{children}</div>
    </div>
  );
}
