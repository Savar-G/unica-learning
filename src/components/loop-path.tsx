"use client";

// How it works: an orange pencil line that runs from step 6 back to step 2, with a dot
// travelling along it. On arrival the dot laps step 2's edge and leaves an outline behind it,
// which fades before the next run, so the loop is visible instead of a footnote. Decorative only:
// the loop is also stated in text for screen readers. Adapts to 1, 2 and 3 columns.
import { useEffect, useRef } from "react";

const R = 18;
// One run, in ms, split into: travel to step 2, lap its edge, hold the outline, fade out.
const RUN = 4600;
const TRAVEL = 0.5;
const LAP = 0.82;
const HOLD = 0.9;

type Box = { l: number; r: number; t: number; b: number; cx: number; cy: number };

/** Clockwise outline of a card, starting where the line enters it. */
function lapPath(c: Box, from: "top" | "right" | "left") {
  const k = 6;
  const x0 = c.l - 1, x1 = c.r + 1, y0 = c.t - 1, y1 = c.b + 1;
  const tr = `H${x1 - k} Q${x1},${y0} ${x1},${y0 + k}`;
  const br = `V${y1 - k} Q${x1},${y1} ${x1 - k},${y1}`;
  const bl = `H${x0 + k} Q${x0},${y1} ${x0},${y1 - k}`;
  const tl = `V${y0 + k} Q${x0},${y0} ${x0 + k},${y0}`;
  if (from === "top") return `M${c.cx},${y0} ${tr} ${br} ${bl} ${tl} H${c.cx}`;
  if (from === "right") return `M${x1},${c.cy} ${br} ${bl} ${tl} ${tr} V${c.cy}`;
  return `M${x0},${c.cy} ${tl} ${tr} ${br} ${bl} V${c.cy}`;
}

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
    let lap: SVGPathElement | null = null;
    let lapLen = 0;
    let dot: SVGCircleElement | null = null;
    let len = 0;
    let raf = 0;
    let visible = false;

    const draw = () => {
      const W = wrap.getBoundingClientRect();
      const box = (el: HTMLElement): Box => {
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
      let from: "top" | "right" | "left";
      if (oneCol) {
        // single column: up the left gutter, into step 2 from the left
        const gx = c6.l - 16;
        d = `M${c6.l},${c6.cy} H${gx + R} Q${gx},${c6.cy} ${gx},${c6.cy - R} V${c2.cy + R} Q${gx},${c2.cy} ${gx + R},${c2.cy} H${c2.l - 3}`;
        lx = gx - 6; ly = (c6.cy + c2.cy) / 2; rot = -90; from = "left";
      } else if (sameCol) {
        // two columns: steps 2 and 6 share the right column; up the right gutter, in from the side
        const gx = c6.r + 22;
        d = `M${c6.r},${c6.cy} H${gx - R} Q${gx},${c6.cy} ${gx},${c6.cy - R} V${c2.cy + R} Q${gx},${c2.cy} ${gx - R},${c2.cy} H${c2.r + 3}`;
        lx = gx + 8; ly = (c6.cy + c2.cy) / 2; rot = 90; from = "right";
      } else {
        // three columns: up the right gutter, over the top, down into step 2
        const gx = c6.r + 22;
        const top = c2.t - 20;
        d = `M${c6.r},${c6.cy} H${gx - R} Q${gx},${c6.cy} ${gx},${c6.cy - R} V${top + R} Q${gx},${top} ${gx - R},${top} H${c2.cx + R} Q${c2.cx},${top} ${c2.cx},${top + R} V${c2.t - 3}`;
        lx = gx + 8; ly = (c6.cy + top) / 2; rot = 90; from = "top";
      }
      svg.innerHTML =
        `<defs><marker id="loopArrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" /></marker></defs>` +
        `<path class="track" d="${d}" marker-end="url(#loopArrow)" />` +
        `<path class="lap" d="${lapPath(c2, from)}" />` +
        `<circle class="dot" r="5.5" />` +
        `<text class="lbl" x="${lx}" y="${ly}" transform="rotate(${rot} ${lx} ${ly})" text-anchor="middle">next book</text>`;
      path = svg.querySelector(".track");
      dot = svg.querySelector(".dot");
      lap = svg.querySelector(".lap");
      len = path ? path.getTotalLength() : 0;
      lapLen = lap ? lap.getTotalLength() : 0;
      if (lap) lap.style.strokeDasharray = String(lapLen);
      svg.style.setProperty("--len", String(len));
    };

    const t0 = performance.now();
    const tick = (t: number) => {
      if (path && dot && lap && visible) {
        const p = ((t - t0) / RUN) % 1;
        let pt: DOMPoint;
        let drawn = 0;
        if (p < TRAVEL) {
          pt = path.getPointAtLength((p / TRAVEL) * len);
        } else if (p < LAP) {
          drawn = (p - TRAVEL) / (LAP - TRAVEL);
          pt = lap.getPointAtLength(drawn * lapLen);
        } else {
          drawn = 1;
          pt = lap.getPointAtLength(lapLen);
        }
        dot.setAttribute("cx", String(pt.x));
        dot.setAttribute("cy", String(pt.y));
        // fade the outline and the dot out after the hold, then the next run starts at step 6
        const fade = p < HOLD ? 1 : 1 - (p - HOLD) / (1 - HOLD);
        dot.style.opacity = String(p < 0.03 ? p / 0.03 : fade);
        lap.style.strokeDashoffset = String(lapLen * (1 - drawn));
        lap.style.opacity = String(fade);
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

    return () => { ro.disconnect(); io.disconnect(); cancelAnimationFrame(raf); };
  }, []);

  return <svg ref={svgRef} className="looppath" aria-hidden="true" />;
}
