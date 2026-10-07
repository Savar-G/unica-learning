"use client";

// Page-level motion: in-view reveals, the swapping word chip, the pencil thread
// that connects every section, and capped parallax drift. Renders nothing.
import { useEffect } from "react";

const NS = "http://www.w3.org/2000/svg";

export function Motion() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cleanups: (() => void)[] = [];

    // reveals
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
      }),
      { threshold: 0.18, rootMargin: "0px 0px -6% 0px" },
    );
    document.querySelectorAll(".rise, [data-io], .draw, .report, .mark").forEach((el) => io.observe(el));
    const hero = document.querySelector(".hero");
    requestAnimationFrame(() => hero?.classList.add("is-in"));
    cleanups.push(() => io.disconnect());

    // pencil thread
    const main = document.getElementById("main");
    let len = 0;
    let knots: HTMLElement[] = [];
    const svg = document.createElementNS(NS, "svg");
    const path = document.createElementNS(NS, "path");
    const tip = document.createElementNS(NS, "circle");
    svg.setAttribute("class", "thread");
    svg.setAttribute("aria-hidden", "true");
    tip.setAttribute("class", "tip");
    tip.setAttribute("r", "3.2");
    svg.append(path, tip);
    main?.prepend(svg);
    cleanups.push(() => svg.remove());

    const build = () => {
      if (!main) return;
      const mr = main.getBoundingClientRect();
      svg.setAttribute("width", String(mr.width));
      svg.setAttribute("height", String(main.scrollHeight));
      svg.style.height = `${main.scrollHeight}px`;
      knots = Array.from(main.querySelectorAll<HTMLElement>("[data-thread]"));
      const pts = knots.map((k) => {
        const r = k.getBoundingClientRect();
        return [r.left + r.width / 2 - mr.left, r.top + r.height / 2 - mr.top] as const;
      });
      if (pts.length < 2) return;
      const x0 = pts[0][0];
      let d = `M${pts[0][0]} ${pts[0][1]}`;
      let prev = pts[0];
      pts.slice(1).forEach((p, i) => {
        const dy = p[1] - prev[1];
        const amp = Math.min(34, Math.max(6, x0 - 4)) * (i % 2 ? -1 : 1);
        d += ` C${prev[0] + amp} ${prev[1] + dy * 0.38} ${p[0] - amp} ${p[1] - dy * 0.42} ${p[0]} ${p[1]}`;
        prev = p;
      });
      path.setAttribute("d", d);
      len = path.getTotalLength();
      path.style.strokeDasharray = String(len);
      onScroll();
    };

    // Path length at which the path reaches height y. The path only moves down, so a binary search works.
    const lengthAtY = (y: number) => {
      let lo = 0;
      let hi = len;
      for (let i = 0; i < 22; i++) {
        const mid = (lo + hi) / 2;
        if (path.getPointAtLength(mid).y < y) lo = mid;
        else hi = mid;
      }
      return hi;
    };

    const onScroll = () => {
      if (!main || !len) return;
      const mr = main.getBoundingClientRect();
      const vh = window.innerHeight;
      // The tip follows a line 62% down the viewport. The last knots sit below that line even at the
      // bottom of the page, so the leftover distance is added over the last part of the scroll.
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - vh);
      const s = Math.min(1, Math.max(0, window.scrollY / maxScroll));
      const lastY = path.getPointAtLength(len).y;
      const atBottom = vh * 0.62 - (mr.top + window.scrollY) + maxScroll;
      const y = vh * 0.62 - mr.top + Math.max(0, lastY - atBottom) * s ** 4;
      const drawn = reduce || s >= 0.999 ? len : y <= 0 ? 0 : lengthAtY(y);
      path.style.strokeDashoffset = String(len - drawn);
      const pt = path.getPointAtLength(drawn);
      tip.setAttribute("cx", String(pt.x));
      tip.setAttribute("cy", String(pt.y));
      knots.forEach((k) => {
        const r = k.getBoundingClientRect();
        k.style.background = r.top - mr.top <= pt.y + 2 ? "var(--graphite)" : "#fff";
      });
    };

    // drift
    const drifts = Array.from(document.querySelectorAll<HTMLElement>(".drift, .fl[data-speed]"));
    const drift = () => {
      const vh = window.innerHeight;
      drifts.forEach((el) => {
        const r = el.getBoundingClientRect();
        const s = parseFloat(el.dataset.speed || "0");
        const y = reduce ? 0 : Math.max(-70, Math.min(70, (r.top + r.height / 2 - vh / 2) * s));
        const rot = getComputedStyle(el).getPropertyValue("--r").trim() || "0deg";
        el.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0) rotate(${rot})`;
      });
    };

    let ticking = false;
    const scroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { onScroll(); drift(); ticking = false; });
    };
    const resize = () => { build(); drift(); };
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("resize", resize);
    window.addEventListener("load", resize);
    document.fonts?.ready.then(resize);
    const ro = new ResizeObserver(() => build());
    if (main) ro.observe(main);
    cleanups.push(() => {
      window.removeEventListener("scroll", scroll);
      window.removeEventListener("resize", resize);
      window.removeEventListener("load", resize);
      ro.disconnect();
    });
    resize();

    return () => cleanups.forEach((c) => c());
  }, []);

  return null;
}
