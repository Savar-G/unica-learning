// r5: same copy and photos as the live How it works section (src/components/sections.tsx).
window.STEPS = [
  { n: "01", t: "Assess", d: "We send a free placement assessment on paper. It finds your child's level, strengths, gaps and misconceptions.", img: "img/loop-assess-paper.jpg", sq: "var(--g1)" },
  { n: "02", t: "Deliver", d: "We create and mail a physical workbook personalized to what your child needs to work on.", img: "img/loop-deliver.jpg", sq: "var(--g3)" },
  { n: "03", t: "Practice", d: "Your child spends roughly 15-20 minutes a day working on paper.", img: "img/loop-practice-6.jpg", sq: "var(--g2)" },
  { n: "04", t: "Scan", d: "You take a photo of the completed pages with your phone.", img: "img/loop-scan.jpg", sq: "var(--g4)" },
  { n: "05", t: "Adapt", d: "Our system checks your child's answers and updates their learning profile.", img: "img/loop-adapt.jpg", sq: "var(--g1)" },
  { n: "06", t: "Repeat", d: "The next workbook is built from what your child mastered, struggled with or needs to review. It arrives before the current one runs out.", img: "img/loop-repeat.jpg", sq: "var(--g3)" },
];
window.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

window.stepHTML = (s, extra = "") =>
  `<li class="step" data-n="${s.n}" style="--sq:${s.sq}">${extra}<span class="num">${s.n}</span><h3>${s.t}.</h3><p>${s.d}</p><div class="vis"><img src="${s.img}" alt=""></div></li>`;

window.header = (tag) => `
  <span class="tag">${tag}</span>
  <div class="eyebrow">How it works</div>
  <h2>Six steps. One loop.</h2>
  <p class="lead">Every book is built from the last one, so the work always matches what your child needs next.</p>`;

// Return line from step 6 back to step 2 in a 3-column grid: up the right gutter, over the top, down into 2.
// Measured from the live layout and redrawn on resize, so it always meets the cards.
window.returnLine = (wrap, label = "next book") => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("loop");
  svg.setAttribute("aria-hidden", "true");
  wrap.prepend(svg);
  const api = { svg, path: null, len: 0 };
  const draw = () => {
    const W = wrap.getBoundingClientRect();
    const cards = wrap.querySelectorAll(".step");
    const b = (el) => { const r = el.getBoundingClientRect(); return { l: r.left - W.left, r: r.right - W.left, t: r.top - W.top, b: r.bottom - W.top }; };
    const c2 = b(cards[1]), c6 = b(cards[5]);
    const R = 18, gx = c6.r + 26, top = c2.t - 22, cx = (c2.l + c2.r) / 2, cy6 = (c6.t + c6.b) / 2;
    const d = `M${c6.r + 2},${cy6} H${gx - R} Q${gx},${cy6} ${gx},${cy6 - R} V${top + R} Q${gx},${top} ${gx - R},${top} H${cx + R} Q${cx},${top} ${cx},${top + R} V${c2.t - 4}`;
    const lx = gx + 12, ly = (cy6 + top) / 2;
    svg.innerHTML =
      `<defs><marker id="arr" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z"/></marker></defs>` +
      `<path class="track" d="${d}" marker-end="url(#arr)"/>` +
      `<circle class="dot" r="5.5" cx="-99" cy="-99"/>` +
      (label ? `<text class="lbl" x="${lx}" y="${ly}" transform="rotate(90 ${lx} ${ly})" text-anchor="middle">${label}</text>` : "");
    api.path = svg.querySelector(".track");
    api.dot = svg.querySelector(".dot");
    api.len = api.path.getTotalLength();
  };
  draw();
  new ResizeObserver(draw).observe(wrap);
  api.at = (f) => { if (!api.dot) return; const p = api.path.getPointAtLength(Math.max(0, Math.min(1, f)) * api.len); api.dot.setAttribute("cx", p.x); api.dot.setAttribute("cy", p.y); };
  return api;
};

// One shared clock so every option loops at a steady pace.
window.loopClock = (ms, fn) => {
  if (window.reduced) { fn(null); return; }
  // ?p=0.7&lap=1 freezes one frame, for screenshots
  const q = new URLSearchParams(location.search);
  if (q.has("p")) { const f = () => fn(+q.get("p"), +(q.get("lap") || 0)); f(); setTimeout(f, 50); setTimeout(f, 700); setTimeout(f, 1500); return; }
  const t0 = performance.now();
  const tick = (t) => { fn(((t - t0) % ms) / ms, Math.floor((t - t0) / ms)); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
};
