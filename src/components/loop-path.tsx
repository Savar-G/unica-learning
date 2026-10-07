"use client";

// How it works: an orange pencil line that runs from step 6 back to step 2, with a dot
// travelling along it, so the loop is visible instead of a footnote. Decorative only:
// the loop is also stated in text for screen readers. Adapts to 1, 2 and 3 columns.
import { useEffect, useRef } from "react";

const R = 18;

export function LoopPath() {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    const wrap = svg?.parentElement;
    const cards = wrap?.querySelectorAll<HTMLElement>(".steps > li");
    if (!svg || !wrap || !cards || cards.length < 6) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const two = cards[1];
    const six = cards[5];
    let path: SVGPathElement | null = null;
    let dot: SVGCircleElement | null = null;
    let len = 0;
    let raf = 0;
    let visible = false;

    const draw = () => {
      const W = wrap.getBoundingClientRect();
      const box = (el: HTMLElement) => {
        const b = el.getBoundingClientRect();
        return { l: b.left - W.left, r: b.right - W.left, t: b.top - W.top, b: b.bottom - W.top, cx: (b.left + b.right) / 2 - W.left, cy: (b.top + b.bottom) / 2 - W.top };
      };
      const c2 = box(two);
      const c6 = box(six);
      const oneCol = Math.abs(c2.l - c6.l) < 4 && Math.abs(c2.r - c6.r) < 4 && W.width - c6.r < 20;
      const sameCol = Math.abs(c2.r - c6.r) < 4;
      let d: string;
      let lx: number;
      let ly: number;
      let rot: number;
      if (oneCol) {
        // single column: up the left gutter, into step 2 from the left
        const gx = c6.l - 16;
        d = `M${c6.l},${c6.cy} H${gx + R} Q${gx},${c6.cy} ${gx},${c6.cy - R} V${c2.cy + R} Q${gx},${c2.cy} ${gx + R},${c2.cy} H${c2.l - 3}`;
        lx = gx - 6; ly = (c6.cy + c2.cy) / 2; rot = -90;
      } else if (sameCol) {
        // two columns: steps 2 and 6 share the right column; up the right gutter, in from the side
        const gx = c6.r + 22;
        d = `M${c6.r},${c6.cy} H${gx - R} Q${gx},${c6.cy} ${gx},${c6.cy - R} V${c2.cy + R} Q${gx},${c2.cy} ${gx - R},${c2.cy} H${c2.r + 3}`;
        lx = gx + 8; ly = (c6.cy + c2.cy) / 2; rot = 90;
      } else {
        // three columns: up the right gutter, over the top, down into step 2
        const gx = c6.r + 22;
        const top = c2.t - 20;
        d = `M${c6.r},${c6.cy} H${gx - R} Q${gx},${c6.cy} ${gx},${c6.cy - R} V${top + R} Q${gx},${top} ${gx - R},${top} H${c2.cx + R} Q${c2.cx},${top} ${c2.cx},${top + R} V${c2.t - 3}`;
        lx = gx + 8; ly = (c6.cy + top) / 2; rot = 90;
      }
      svg.innerHTML =
        `<defs><marker id="loopArrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" /></marker></defs>` +
        `<path class="track" d="${d}" marker-end="url(#loopArrow)" />` +
        `<circle class="dot" r="5.5" />` +
        `<text class="lbl" x="${lx}" y="${ly}" transform="rotate(${rot} ${lx} ${ly})" text-anchor="middle">next book</text>`;
      path = svg.querySelector(".track");
      dot = svg.querySelector(".dot");
      len = path ? path.getTotalLength() : 0;
      svg.style.setProperty("--len", String(len));
    };

    const t0 = performance.now();
    const tick = (t: number) => {
      if (path && dot && visible) {
        const p = ((t - t0) / 2800) % 1;
        const pt = path.getPointAtLength(p * len);
        dot.setAttribute("cx", String(pt.x));
        dot.setAttribute("cy", String(pt.y));
        two.classList.toggle("arrive", p > 0.88);
      }
      raf = requestAnimationFrame(tick);
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) wrap.classList.add("loop-on");
    }, { threshold: 0.2 });
    io.observe(wrap);
    if (reduce) wrap.classList.add("loop-on", "loop-still");
    else raf = requestAnimationFrame(tick);

    return () => { ro.disconnect(); io.disconnect(); cancelAnimationFrame(raf); two.classList.remove("arrive"); };
  }, []);

  return <svg ref={svgRef} className="looppath" aria-hidden="true" />;
}
