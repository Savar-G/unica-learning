// Book covers in the workbook cover's language (public/whats-included/wb/leah-01-cover.jpg):
// white paper, the 3x3 colour grid, the title with one highlighted word, the Unica mark with its orange square.
const BRAND = { sun: "#FFD23F", sky: "#3366F0", tang: "#FF6430", leaf: "#16A06A" };
window.BRAND = BRAND;
// Each grade gets its own grid pattern, so books of one grade look like a set.
const PATTERNS = [
  ["sun", null, "sky", null, "tang", null, "leaf", null, null],
  [null, "tang", null, "sun", null, "sky", null, "leaf", null],
  ["sky", null, null, null, "sun", "tang", null, "leaf", null],
  [null, null, "leaf", "tang", null, null, "sun", null, "sky"],
  ["tang", "sun", null, null, "leaf", null, null, null, "sky"],
];
window.gradeColor = (g) => [BRAND.tang, BRAND.sun, BRAND.leaf, BRAND.sky, BRAND.tang, BRAND.sun, BRAND.leaf, BRAND.sky, BRAND.tang, BRAND.sun][g];
window.gridSvg = (g, size, x = 0, y = 0) => {
  const p = PATTERNS[g % PATTERNS.length], c = size / 3;
  return p.map((k, i) => `<rect x="${x + (i % 3) * c}" y="${y + Math.floor(i / 3) * c}" width="${c}" height="${c}" fill="${k ? BRAND[k] : "#fff"}" stroke="#0c0c0e" stroke-width="${Math.max(0.6, size / 40)}"/>`).join("");
};
// Split a level title into "lead" and the highlighted last part: "Numbers to 20 and [making 10]".
window.splitTitle = (t) => {
  const words = t.split(" ");
  const n = words.length > 4 ? 2 : 1;
  return [words.slice(0, -n).join(" "), words.slice(-n).join(" ")];
};
// A full HTML cover. size: "lg" (hero) or "sm" (tile).
window.coverHtml = (b, child, size = "lg") => {
  const [lead, hi] = splitTitle(b.title);
  return `<div class="cv cv-${size}" style="--gc:${gradeColor(b.grade)}">
    <div class="cv-top"><span class="cv-mark">Unica Learning<i></i></span><span class="cv-meta">Book ${b.n}</span></div>
    <svg class="cv-grid" viewBox="0 0 30 30" aria-hidden="true">${gridSvg(b.grade, 30)}</svg>
    <p class="cv-made">Made for ${child}</p>
    <p class="cv-title">${lead} <mark>${hi}</mark></p>
  </div>`;
};
window.COVER_CSS = `
.cv { position: relative; display: flex; flex-direction: column; aspect-ratio: 8.5 / 11; background: #fff; color: #0c0c0e; font-family: "Geist", sans-serif; box-shadow: 0 1px 0 rgba(0,0,0,.06), 0 18px 40px -18px rgba(0,0,0,.45); }
.cv-lg { width: 100%; padding: 9% 9%; border-radius: 4px; }
.cv-top { display: flex; justify-content: space-between; align-items: baseline; }
.cv-mark { font: 500 clamp(9px, 1.1vw, 13px)/1 "Geist"; letter-spacing: -.01em; }
.cv-mark i { display: inline-block; width: .38em; height: .38em; margin-left: .12em; background: #FF6430; }
.cv-meta { font: 400 clamp(8px, .9vw, 11px)/1 "Geist Mono"; color: #44444c; }
.cv-grid { width: 26%; margin-top: 16%; }
.cv-made { margin-top: 9%; font: 400 clamp(9px, 1vw, 13px)/1.3 "Geist"; color: #44444c; }
.cv-title { margin-top: 4%; font: 400 clamp(17px, 2.4vw, 30px)/1.06 "Geist"; letter-spacing: -.03em; }
.cv-title mark { background: #FFD23F; color: inherit; padding: 0 .12em; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
`;
