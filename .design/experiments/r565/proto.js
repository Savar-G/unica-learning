/* Round r565: Scan pages flows. A clickable mockup with sample data, not product code. Every state has its own address
   (#state), so the board and the screenshots can open it. a.html, b.html and c.html differ only in data-opt. */
const OPT = document.documentElement.dataset.opt || "a";
const CHILD = "Leah";
/* "p" is Savar's pick of 2026-11-05 (D-269): A's start screen and live camera, plus Choose photos and the phone's camera. */
const PICK = OPT === "p";
const AUTO = PICK ? "Auto on" : "Auto";

/* ---------- Sample pages ---------- */
const TITLES = {
  3: ["Warm-up", "Review", "New idea", "Practice", "Practice", "Stories", "Mental math", "Fix it"],
  4: ["Warm-up", "Subtracting with borrowing", "New idea", "Practice", "Practice", "Stories", "Mental math", "Fix it"],
  5: ["Warm-up", "Review", "New idea", "Practice", "Practice", "Stories", "Mental math", "Fix it"],
};
const FIXED = { d4p2: [[84, 59], [92, 48], [55, 37], [73, 26], [60, 25], [81, 46], [94, 67], [52, 19], [43, 18]] };
const WRONG = { d4p2: [4], d4p4: [7], d4p5: [1, 5], d4p8: [3], d5p1: [2], d5p3: [6] };
const ASK = { d4p4: [2], d5p1: [5] };

function items(d, p) {
  const key = `d${d}p${p}`;
  let seed = d * 131 + p * 17;
  const rnd = (n) => { seed = (seed * 9301 + 49297) % 233280; return Math.floor((seed / 233280) * n); };
  const list = FIXED[key] || Array.from({ length: 9 }, () => { const a = 120 + rnd(360); return [a, 21 + rnd(a - 40)]; });
  return list.map(([a, b], i) => {
    const add = !FIXED[key] && i % 2 === 1;
    const right = add ? a + b : a - b;
    const wrong = (WRONG[key] || []).includes(i);
    const ask = (ASK[key] || []).includes(i);
    return { n: i + 1, text: `${a} ${add ? "+" : "−"} ${b}`, right, wrote: wrong ? right + 10 : right, wrong, ask };
  });
}

function qr(x, y, s, seedText) {
  const n = 21; const c = s / n; let out = `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="#fff"/>`;
  let h = 7; for (const ch of seedText) h = (h * 31 + ch.charCodeAt(0)) % 65521;
  const finder = (fx, fy) => `<rect x="${x + fx * c}" y="${y + fy * c}" width="${7 * c}" height="${7 * c}" fill="#111"/><rect x="${x + (fx + 1) * c}" y="${y + (fy + 1) * c}" width="${5 * c}" height="${5 * c}" fill="#fff"/><rect x="${x + (fx + 2) * c}" y="${y + (fy + 2) * c}" width="${3 * c}" height="${3 * c}" fill="#111"/>`;
  for (let r = 0; r < n; r++) for (let q = 0; q < n; q++) {
    if ((r < 8 && q < 8) || (r < 8 && q > 12) || (r > 12 && q < 8)) continue;
    h = (h * 75 + 74) % 65537;
    if (h % 2) out += `<rect x="${x + q * c}" y="${y + r * c}" width="${c + .2}" height="${c + .2}" fill="#111"/>`;
  }
  return out + finder(0, 0) + finder(14, 0) + finder(0, 14);
}

const COLS = [52, 232, 412];
const ROWS = [226, 312, 398];
const itemAt = (i) => ({ x: COLS[i % 3], y: ROWS[Math.floor(i / 3)] });

function pageSvg(d, p, o = {}) {
  const list = items(d, p);
  const bookPage = (d - 1) * 8 + p + 2;
  const who = o.who || CHILD;
  const lines = list.map((q, i) => {
    const { x, y } = itemAt(i);
    const hand = o.blank ? "" : q.ask
      ? `<text class="hand" x="${x + 129}" y="${y + 2}" font-size="25" text-anchor="middle">${q.wrote}</text><path d="M${x + 122} ${y - 4} l10 -12 l6 13 l8 -14 M${x + 124} ${y - 12} q9 8 20 2" stroke="#3f4250" stroke-width="2" fill="none"/>`
      : `<text class="hand" x="${x + 129}" y="${y + 2}" font-size="25" text-anchor="middle">${q.wrote}</text>`;
    let mark = "";
    if (o.marks) {
      const mx = x + 164; const my = y - 6;
      if (q.ask && !o.checked) mark = `<rect class="mk ask" x="${x + 98}" y="${y - 30}" width="62" height="48" rx="8"/>`;
      else if (q.wrong && !(o.flip === q.n)) mark = `<path class="mk" style="--i:${i}" d="M${mx - 6} ${my - 9} l13 16 M${mx + 7} ${my - 10} l-14 18"/>`;
      else mark = `<path class="mk" style="--i:${i}" d="M${mx - 8} ${my} l6 8 l13 -19"/>`;
    }
    return `<text x="${x}" y="${y}" font-size="10.5" fill="#666">${q.n}.</text><text x="${x + 14}" y="${y}" font-size="13" class="m">${q.text} =</text><rect class="box" x="${x + 104}" y="${y - 25}" width="50" height="38" rx="5"/>${hand}${mark}`;
  }).join("");
  const c = 26; const L = 18;
  const corners = `<path d="M${c} ${c + L}V${c}H${c + L} M${612 - c - L} ${c}H${612 - c}V${c + L} M${c} ${792 - c - L}V${792 - c}H${c + L} M${612 - c - L} ${792 - c}H${612 - c}V${792 - c - L}" stroke="#111" stroke-width="2.4" fill="none"/>`;
  const vb = o.viewBox || "0 0 612 792";
  return `<svg class="pg${o.draw ? " draw" : ""}" viewBox="${vb}" role="img" aria-label="${o.label || `Sample page: Day ${d}, page ${p}`}">
    <rect width="612" height="792" fill="#fff"/>${corners}
    <text x="52" y="74" font-size="10.5" fill="#333">Name</text><path d="M84 76H440" stroke="#999"/><text class="hand" x="100" y="72" font-size="20">${who}</text>
    <text x="450" y="74" font-size="10.5" fill="#333">Date</text><path d="M478 76H560" stroke="#999"/>
    <text x="52" y="116" font-size="10.5" class="m" fill="#555" letter-spacing="1.2">DAY ${d} · PAGE ${p} OF 8</text>
    <text x="52" y="148" font-size="25" font-weight="300">${TITLES[d][p - 1]}</text>
    <text x="52" y="172" font-size="12" fill="#555">Show your work on scrap paper. Write each answer in its box.</text>
    ${lines}
    <rect x="48" y="466" width="516" height="186" rx="10" fill="#f1efec"/><text x="66" y="494" font-size="10.5" class="m" fill="#555" letter-spacing="1">ON YOUR OWN</text><text x="66" y="522" font-size="13.5">How did you work out question 5? Write it in words.</text>
    <path d="M66 566H546M66 602H546M66 636H546" stroke="#bbb"/><text class="hand" x="74" y="560" font-size="19">i took away the tens then the ones</text>
    ${qr(52, 682, 56, `${who}${d}${p}`)}
    <text x="120" y="704" font-size="9.5" class="m" fill="#333">UL-${who.toUpperCase()}-W01-D${String(d).padStart(2, "0")}-P${p}</text><text x="120" y="720" font-size="9.5" fill="#555">Page ${bookPage}</text>
    <text x="560" y="734" font-size="13" font-weight="600" text-anchor="end">Unica Learning</text>
  </svg>`;
}

const cropSvg = (d, p, q) => {
  const { x, y } = itemAt(q - 1);
  return pageSvg(d, p, { viewBox: `${x + 11} ${y - 38} 156 62`, label: `The answer box of question ${q}` });
};
const photo = (d, p, cls = "", o = {}) => `<div class="ph ${cls}">${pageSvg(d, p, o)}</div>`;
const twoSheets = (d, p, big) => `<div class="ph two ${big ? "big" : ""}">${pageSvg(d, p)}${pageSvg(d, p + 1)}</div>`;

/* ---------- Icons ---------- */
const I = {
  overview: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></svg>',
  progress: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3.5 19.5h17"/><path d="M5 15.5l4.5-4.5 3.5 3 6-6.5"/><path d="M15 7.5h4v4"/></svg>',
  scan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.8l1.4-2h4.6l1.4 2h1.8A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.5" r="3.5"/></svg>',
  workbooks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5v13c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5z"/><path d="M12 6v13"/></svg>',
  maya: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-7l-4.5 3.5v-3.5H5A1.5 1.5 0 0 1 3.5 15V7A1.5 1.5 0 0 1 5 5.5z"/></svg>',
  assessment: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="5" y="4.5" width="14" height="16" rx="2"/><path d="M9 4.5V3.5h6v1"/><path d="M8.5 12.5l2.2 2.2 4.8-4.8"/></svg>',
  account: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5.5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18.5" cy="12" r="1.7"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 13l4.5 4.5L19 7"/></svg>',
  go: '<svg class="go-c" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  fold: '<svg viewBox="0 0 48 48" fill="none" stroke="#111" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M14 10h22v30H14z" fill="#fff"/><path d="M14 10l-6 3v30l6-3" fill="#ddd"/><path d="M19 17h12M19 22h12M19 27h8" stroke-width="1.4"/></svg>',
  light: '<svg viewBox="0 0 48 48" fill="none" stroke="#111" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="24" cy="24" r="8" fill="#ffc93c"/><path d="M24 6v6M24 36v6M6 24h6M36 24h6M11 11l4 4M33 33l4 4M37 11l-4 4M15 33l-4 4"/></svg>',
  corners: '<svg viewBox="0 0 48 48" fill="none" stroke="#111" stroke-width="2.2" aria-hidden="true"><path d="M12 15V9h6M30 9h6v6M12 33v6h6M30 39h6v-6"/><rect x="17" y="15" width="14" height="18" fill="#fff" stroke-width="1.2"/></svg>',
};
const QR_LARGE = `<svg viewBox="0 0 168 168" role="img" aria-label="QR code of this page's address" style="display:block;width:100%">${qr(0, 0, 168, "/account/scan")}</svg>`;

/* ---------- Frame ---------- */
const TABS = [["overview", "Overview"], ["progress", "Progress"], ["workbooks", "Workbooks"], ["scan", "Scan pages"], ["maya", "Maya"], ["assessment", "Assessment"], ["account", "Account"]];
const BAR = [["overview", "Overview"], ["progress", "Progress"], ["scan", "Scan pages"], ["workbooks", "Workbooks"], ["more", "More"]];
function frame(body, o = {}) {
  return `<div class="shell ${o.dock ? "has-dock" : ""} ${o.dockCls || ""}">
    <aside class="side"><a class="logo" href="#start">Unica Learning<b></b></a>
      <div class="kid"><span class="kid-av">L</span><span class="kid-t"><b>${CHILD}</b><span>Grade 3 · Workbook 1</span></span></div>
      <a class="btn ghost wide" href="#start" style="min-height:44px">Open the desk</a>
      <nav class="nav" aria-label="Sections">${TABS.map(([k, l]) => `<a href="#start" ${k === "scan" ? 'aria-current="page"' : ""}>${I[k]}${l}</a>`).join("")}</nav>
    </aside>
    <div>
      <header class="top"><a class="logo" href="#start">Unica Learning<b></b></a></header>
      <div class="kid-line"><span class="kid-av">L</span><span>${CHILD} · Workbook 1</span><a class="link kid-go" href="#start">Open the desk</a></div>
      <main class="main"><div class="main-in">${body}</div>${o.dock || ""}</main>
    </div>
    <nav class="bar" aria-label="Sections">${BAR.map(([k, l]) => `<a href="#start" ${k === "scan" ? 'aria-current="page"' : ""}>${I[k]}${l}</a>`).join("")}</nav>
    ${o.over || ""}
  </div>`;
}
const dock = (primary, extra = "", note = "") => `<div class="dock">${note ? `<p class="small">${note}</p>` : ""}<div class="dock-row">${extra}${primary}</div></div>`;
const sheet = (inner, label) => `<div class="scrim" role="dialog" aria-modal="true" aria-label="${label}"><div class="sheet">${inner}</div></div>`;

/* ---------- The stack ---------- */
const flag = { ok: `<span class="flag ok" title="Ready">${I.check}</span>`, wait: '<span class="flag" title="Being checked"><span class="spin"></span></span>', bad: '<span class="flag bad" title="Needs another photo">!</span>', done: `<span class="flag marked" title="Already marked">${I.check}</span>` };
const tile = (d, p, st, label, sub, href = "#page-ok", cls = "", phCls = "") => `<li><a class="tile ${st === "bad" ? "bad" : ""} ${cls}" href="${href}">${photo(d, p, phCls)}${flag[st]}<span class="tile-l">${label}</span>${sub ? `<span class="tile-s">${sub}</span>` : ""}</a></li>`;

function mixedStack() {
  const need = `<section class="need" aria-label="Pages that need another photo"><div class="grp-h"><h2 class="h" style="font-size:17px">2 pages need another photo</h2></div>
    <ul class="tiles">${tile(4, 3, "bad", "Day 4 · Page 3", "Blurry", "#r-blur", "", "blur")}${tile(5, 2, "bad", "Unknown page", "Cut off", "#r-cut", "", "cut")}</ul>
    ${wide() ? `<p style="font-size:15px">Take them again with your phone. The pages wait there.</p>` : `<a class="btn wide" href="#retake">Take 2 photos again</a>`}</section>`;
  const d4 = `<section class="grp"><div class="grp-h"><h2>Day 4</h2><span class="mono">7 photos</span></div><ul class="tiles">
    ${tile(4, 1, "ok", "Page 1")}${tile(4, 2, "ok", "Page 2")}${tile(4, 4, "ok", "Page 4")}${tile(4, 5, "wait", "Page 5", "Checking")}${tile(4, 6, "ok", "Page 6")}${tile(4, 7, "ok", "Page 7")}${tile(4, 8, "ok", "Page 8")}</ul></section>`;
  const d5 = `<section class="grp"><div class="grp-h"><h2>Day 5</h2><span class="mono">3 photos</span></div><p class="gap">No photo yet: page 2</p><ul class="tiles">
    ${tile(5, 1, "ok", "Page 1")}${tile(5, 3, "ok", "Page 3")}${tile(5, 4, "wait", "Page 4", "Checking")}</ul></section>`;
  const old = `<section class="grp"><div class="grp-h"><h2>Already marked</h2></div><ul class="tiles">${tile(3, 8, "done", "Day 3 · Page 8", "Marked last week", "#d-marked")}</ul></section>`;
  return `<div style="display:grid;gap:6px"><h1 class="title">Scan pages</h1><p class="lede">13 photos. 8 pages are ready to send.</p></div>${need}${d4}${d5}${old}`;
}

function cleanStack() {
  const row = (d, n) => Array.from({ length: n }, (_, i) => tile(d, i + 1, "ok", `Page ${i + 1}`)).join("");
  return `<div style="display:grid;gap:6px"><h1 class="title">Scan pages</h1><p class="lede">12 photos. All 12 pages are ready to send.</p></div>
    <section class="grp"><div class="grp-h"><h2>Day 4</h2><span class="mono">8 photos</span></div><ul class="tiles">${row(4, 8)}</ul></section>
    <section class="grp"><div class="grp-h"><h2>Day 5</h2><span class="mono">4 photos</span></div><ul class="tiles">${row(5, 4)}</ul></section>`;
}

function chosenStack() {
  const row = (d, n, ok) => Array.from({ length: n }, (_, i) => (i < ok ? tile(d, i + 1, "ok", `Page ${i + 1}`) : tile(d, i + 1, "wait", `Page ${i + 1}`, "Checking"))).join("");
  return `<div style="display:grid;gap:6px"><h1 class="title">Scan pages</h1><p class="lede">12 photos added. 3 pages are ready to send.</p></div>
    <section class="grp"><div class="grp-h"><h2>Day 4</h2><span class="mono">8 photos</span></div><ul class="tiles">${row(4, 8, 3)}</ul></section>
    <section class="grp"><div class="grp-h"><h2>Day 5</h2><span class="mono">4 photos</span></div><ul class="tiles">${row(5, 4, 0)}</ul></section>`;
}

const ADD_HREF = { a: "#look", b: "#native", c: "#target", p: "#add" }[OPT];
const addBtn = `<a class="btn ghost add" href="${ADD_HREF}" aria-label="Take more pages">${I.scan.replace("<svg ", '<svg width="22" height="22" ')}</a>`;
const addB = () => (wide() ? "" : addBtn);
const mixedDock = () => dock(`<a class="btn" href="#sending">Send 8 pages for marking</a>`, addB(), "2 pages are still being checked. They stay here.");
const cleanDock = () => dock(`<a class="btn" href="#sending">Send 12 pages for marking</a>`, addB());

/* Option C: the day's pages as slots */
function daySlots(mode) {
  const st = mode === "start" ? {} : { 1: "ok", 2: "ok", 3: "bad", 4: "ok", 5: "wait", 6: "ok", 7: "next" };
  const slot = (p) => {
    const s = st[p];
    if (s && s !== "next") return tile(4, p, s, `Page ${p}`, s === "bad" ? "Blurry" : s === "wait" ? "Checking" : "", s === "bad" ? "#r-blur" : "#page-ok", "", s === "bad" ? "blur" : "");
    const isNext = s === "next" || (mode === "start" && p === 1);
    return `<li><a class="tile slot-e ${isNext ? "slot-next" : ""}" href="#target"><div class="ph">${pageSvg(4, p, { blank: true })}<span class="plus">+</span></div><span class="tile-l">Page ${p}</span><span class="tile-s">${isNext ? "Next" : "No photo yet"}</span></a></li>`;
  };
  const chips = [["Day 3", 0], ["Day 4", 1], ["Day 5", 0], ["Day 6", 0]].map(([l, on]) => `<a class="day" href="#stack" ${on ? 'aria-current="true"' : ""}>${l}${l === "Day 3" ? " ✓" : ""}</a>`).join("");
  const line = mode === "start" ? "Pick a page, or start with the next one." : "6 photos for Day 4. 4 pages are ready to send.";
  return `<div style="display:grid;gap:6px"><h1 class="title">Scan pages</h1><p class="lede">${line}</p></div>
    <div class="days">${chips}</div>
    <section class="grp"><div class="grp-h"><h2>Day 4</h2><span class="mono">8 pages</span></div><ul class="slots">${Array.from({ length: 8 }, (_, i) => slot(i + 1)).join("")}</ul></section>
    ${mode === "start" ? "" : `<div class="note"><span>Day 5 has 2 photos, ready to send.</span><a class="link" href="#stack">Open Day 5</a></div>`}`;
}

/* ---------- Start ---------- */
const tips = `<ul class="tips">
  <li>${I.fold}<span>Fold the book back, so only one page shows.</span></li>
  <li>${I.light}<span>Find good light. Keep shadows off the page.</span></li>
  <li>${I.corners}<span>Keep all four corners and the QR code in view.</span></li></ul>`;
const privacy = `<p class="small">Photos are private and kept for 90 days. <a class="link" style="font-size:14px" href="#notice">More about photos</a></p>`;

function desktopAway() {
  const here = { a: "#look", b: "#native", c: "#target", p: "#start-here" }[OPT];
  return `<div style="display:grid;gap:6px"><span class="eyebrow">Your account</span><h1 class="title">Scan pages</h1></div>
    <div class="away"><section class="away-l"><div class="away-qr">${QR_LARGE}</div><h2 class="h">Please take a picture with your phone</h2>
      <p class="small" style="font-size:15px">Point your phone's camera at this code. It opens this page on your phone. Your pages show here as you take them.</p>
      <div style="display:grid;gap:4px;justify-items:start"><a class="btn ghost" href="#start">Email me the link</a><a class="link" href="${here}">Take the pictures on this device</a></div></section>
    <section class="away-r"><div class="grp-h"><h2 class="h">From your phone</h2><span class="mono">13 photos</span></div>
      <div class="note"><span>8 pages are ready. 2 need another photo. 2 are being checked.</span></div>
      <ul class="tiles">${tile(4, 3, "bad", "Day 4 · Page 3", "Blurry", "#r-blur", "", "blur")}${tile(5, 2, "bad", "Unknown page", "Cut off", "#r-cut", "", "cut")}${tile(4, 1, "ok", "Day 4 · Page 1")}${tile(4, 2, "ok", "Day 4 · Page 2")}${tile(4, 4, "ok", "Day 4 · Page 4")}${tile(4, 5, "wait", "Day 4 · Page 5", "Checking")}${tile(4, 6, "ok", "Day 4 · Page 6")}${tile(4, 7, "ok", "Day 4 · Page 7")}${tile(4, 8, "ok", "Day 4 · Page 8")}${tile(5, 1, "ok", "Day 5 · Page 1")}${tile(5, 3, "ok", "Day 5 · Page 3")}${tile(5, 4, "wait", "Day 5 · Page 4", "Checking")}${tile(3, 8, "done", "Day 3 · Page 8", "Already marked", "#d-marked")}</ul>
      <p class="small" style="text-align:right">Retake the 2 pages on your phone.</p>
      <div class="dock-row"><a class="btn" href="#sending">Send 8 pages for marking</a></div></section></div>`;
}

const wide = () => window.matchMedia("(min-width: 1024px)").matches;

function start() {
  if (wide()) return frame(desktopAway());
  if (OPT === "c") return frame(daySlots("start"), { dock: dock(`<a class="btn" href="#target">Take Day 4, page 1</a>`) });
  const body = `<div style="display:grid;gap:6px"><h1 class="title">Scan pages</h1><p class="lede">Take a photo of each finished page. We mark the pages and show you the results.</p></div>${tips}${privacy}`;
  if (PICK) return frame(body, { dock: dock(`<a class="btn" href="#look">Start scanning</a>`, `<a class="btn ghost" href="#chosen" style="flex:none">Choose photos</a>`, `<a class="link" href="#native">Use my phone's camera</a>`) });
  if (OPT === "b") return frame(body, { dock: dock(`<a class="btn" href="#native">Take a photo</a>`, `<a class="btn ghost" href="#stack" style="flex:none">Choose photos</a>`) });
  return frame(body, { dock: dock(`<a class="btn" href="#look">Start scanning</a>`) });
}
const NOTICE = "We store this page photo privately for up to 90 days. When you ask us to check it, we send the whole page photo to an AI service. Your child's first name and printed page code can be in the photo. You and our admin team can view it. You can delete the photo sooner. We keep the marks and the AI's reading of the written answers until your family account is deleted.";
const notice = () => start().replace("</div>\n  </div>", "</div></div>") + sheet(`<h2>Before you take a photo</h2><p style="font-size:16px">${NOTICE}</p><a class="link" href="#start">Read about privacy</a><div class="acts"><a class="btn wide" href="${PICK ? "#look" : ADD_HREF}">Got it</a></div>`, "About your page photos");

/* ---------- The camera ---------- */
const pileHtml = (count, bad) => `<a class="pile" href="#stack" aria-label="See your ${count} photos">${count ? pageSvg(4, 1) + pageSvg(4, 2) + pageSvg(4, 3) : ""}${count ? `<span class="ct">${count}</span>` : ""}${bad ? `<span class="ct bad">${bad}</span>` : ""}</a>
  <a class="strip" href="#stack" aria-label="See your ${count} photos">${[[4, 1], [4, 2], [4, 3], [4, 4], [4, 5], [4, 6]].slice(0, Math.min(count, 6)).map(([d, p]) => pageSvg(d, p)).join("")}${count ? `<span class="ct">${count} photo${count === 1 ? "" : "s"}${bad ? `, ${bad} to fix` : ""}</span>` : ""}</a>`;

function camera(c) {
  const d = c.d ?? 4; const p = c.p ?? 2;
  const msg = c.msg ? `<div class="msg ${c.tone || ""}"><div>${c.msg}${c.small ? `<small>${c.small}</small>` : ""}${c.act || ""}</div></div>` : "";
  const brackets = `<i class="br tl"></i><i class="br tr"></i><i class="br bl"></i><i class="br brr"></i>`;
  const pile = c.pair
    ? `<div class="sheetpile">${pageSvg(d, p)}</div><div class="sheetpile b">${pageSvg(d, p + 1)}</div>`
    : `<div class="sheetpile" id="sp">${pageSvg(d, p, { who: c.who })}${brackets}</div>`;
  const doneLabel = c.doneLabel || (c.count ? `Done · ${c.count}` : "Done");
  return `<div class="cam ${c.cls || ""}" id="cam">
    <div class="stage">${pile}
      <div class="cam-top"><a class="cam-btn" href="${OPT === "a" ? "#stack" : "#stack"}" aria-label="Close the camera">✕</a><span class="cam-who">${c.title || `${CHILD} · Workbook 1`}</span>${(c.right ?? (OPT === "a" || PICK ? AUTO : "")) ? `<a class="cam-btn" href="${PICK ? (c.right === "Auto off" ? "#look" : "#manual") : "#"}">${c.right ?? AUTO}</a>` : `<span style="width:44px"></span>`}</div>
      ${c.target ? `<div class="target">${pageSvg(c.target[0], c.target[1], { blank: true })}Page ${c.target[1]}</div>` : ""}
      ${c.fly ? `<div class="fly">${pageSvg(c.fly[0], c.fly[1])}</div>` : ""}
      ${msg}
    </div>
    <div class="tray">${pileHtml(c.count ?? 0, c.bad ?? 0)}
      <a class="shutter" href="${c.shutter || "#got"}" role="button" aria-label="Take the photo"><svg viewBox="0 0 76 76" aria-hidden="true"><circle cx="38" cy="38" r="36"/></svg></a>
      <a class="done ${c.count ? "" : "off"}" href="${c.doneHref || (c.count === 1 ? "#one" : "#stack")}">${doneLabel}</a></div>
  </div>`;
}

const CAM = {
  look: () => camera({ count: 0, msg: "Point at one page", small: "Keep all four corners in view." }),
  look2: () => camera({ count: 5, p: 6, msg: "Point at the next page" }),
  far: () => camera({ count: 3, cls: "far", msg: "Move back", small: "We need all four corners." }),
  dark: () => camera({ count: 3, cls: "dim", right: "Light", msg: "Too dark", small: "Move to better light, or turn on the light." }),
  two: () => camera({ count: 3, cls: "pair", pair: true, msg: "Only one page, please", small: "Fold the book back, so only this page shows." }),
  steady: () => camera({ count: 1, cls: "lock", msg: "Day 4 · Page 2", small: "Hold still." }),
  got: () => camera({ count: 2, cls: "lock snap", fly: [4, 2], msg: "Got it: Day 4 · Page 2", small: "Turn to the next page.", tone: "good", shutter: "#look2" }),
  same: () => camera({ count: 2, msg: "You have this page", small: "Turn to the next page." }),
  late: () => camera({ count: 5, bad: 1, p: 6, tone: "warn", msg: "Day 4, page 3 needs another photo", small: "It is blurry. You can fix it now or at the end.", act: `<a class="act" href="#retake">Take it again now</a>` }),
  wrong: () => camera({ count: 5, who: "Noah", tone: "warn", msg: "This page is not in Leah's workbook", small: "We did not take a photo. Check that this is Leah's book." }),
  marked: () => camera({ count: 5, d: 3, p: 8, tone: "warn", msg: "Day 3, page 8 is already marked", small: "We did not take a photo. Turn to the next page.", act: `<a class="act" href="#page">See the marks</a>` }),
  limit: () => { const n = PICK ? 40 : 20; return camera({ count: n, bad: 1, p: 7, d: 5, tone: "warn", msg: "Please wait a few minutes", small: `You took many photos in a short time. Your ${n} photos are safe. You can send them now.` }); },
  manual: () => camera({ count: 3, right: "Auto off", msg: "Press the button", small: "Press it when all four corners show." }),
  retake: () => camera({ count: 13, bad: 2, d: 4, p: 3, title: "Photo 1 of 2", cls: "lock", msg: "Now take Day 4 · Page 3", small: "The last photo was blurry. Hold the phone still.", doneLabel: "Stop", right: AUTO, shutter: "#clean", doneHref: "#stack" }),
  target: () => camera({ count: 0, d: 4, p: 7, target: [4, 7], title: "Day 4 · Page 7", cls: "lock", msg: "Day 4 · Page 7", small: "Hold still.", doneLabel: "Back to list", shutter: "#stack", doneHref: "#stack", right: "" }),
};
const blocked = () => frame(`<div style="display:grid;gap:6px"><h1 class="title">We cannot use the camera</h1><p class="lede">Your browser did not allow the camera on this page.</p></div>
  <div class="panel"><h2>To fix this</h2><p style="font-size:15.5px">Open your browser's settings for this site. Allow the camera. Then try again.</p></div>
  <p style="font-size:15.5px">Or use your phone's own camera. You take one photo at a time, and the photos come back here.</p>`,
  { dock: dock(`<a class="btn" href="#look">Try again</a>`, `<a class="btn ghost" href="#native" style="flex:1">Use phone's camera</a>`, PICK ? `<a class="link" href="#chosen">Choose photos</a>` : "") });
const native = () => `<div class="native"><div class="stage"><div class="native-tag">Your phone's own camera. We cannot add guidance here. You press the shutter, then "Use Photo", for each page.</div><div class="sheetpile">${pageSvg(4, 2)}</div></div><div class="native-bar"><span>Retake</span><a class="shutter" href="#stack" role="button" aria-label="Sample shutter"></a><a href="#stack" style="color:#fff;text-decoration:none"><span>Use Photo</span></a></div></div>`;

/* ---------- Refusals ---------- */
const REASONS = {
  blur: { d: 4, p: 3, cls: "blur big", who: "Day 4 · Page 3", title: "This photo is blurry.", text: "We cannot read the answers. Hold the phone still. Then take another photo." },
  cut: { d: 5, p: 2, cls: "cut", who: "We cannot tell which page this is", title: "We cannot see the whole page.", text: "All four corners and the QR code must show. Move the phone back. Then take another photo." },
  dark: { d: 4, p: 5, cls: "dark", who: "Day 4 · Page 5", title: "This photo is too dark.", text: "We cannot read the answers. Move to better light. Then take another photo." },
  two: { d: 4, p: 6, two: true, who: "We cannot tell which page this is", title: "This photo shows more than one page.", text: "Fold the book back, so only one page shows. Then take another photo." },
  none: { none: true, who: "Not a workbook page", title: "We cannot find a page in this photo.", text: "Choose a photo of one finished page, with its QR code in view." },
  wrong: { d: 4, p: 1, cls: "wrong", photoWho: "Noah", who: "Not a page from Leah's books", title: "This page is not in Leah's workbook.", text: "Check that this is Leah's book. Then take another photo." },
};
const background = () => OPT === "c" ? frame(daySlots("mixed"), { dock: cStackDock() }) : frame(mixedStack(), { dock: mixedDock() });
const cStackDock = () => dock(`<a class="btn" href="#sending">Send 6 pages</a>`, wide() ? "" : `<a class="btn ghost" href="#target" style="flex:1">Take page 7</a>`);
const refusal = (k) => {
  const r = REASONS[k];
  const pic = r.none ? `<div class="ph"></div>` : r.two ? twoSheets(r.d, r.p, true) : photo(r.d, r.p, r.cls, { who: r.photoWho });
  return background() + sheet(`${pic}<p class="qline">${r.who}</p><h2>${r.title}</h2><p style="font-size:16px">${r.text}</p>
    <div class="acts">${wide() ? `<p class="saved" style="background:var(--card);color:var(--ink)">Take another photo with your phone. This page waits there.</p>` : `<a class="btn wide" href="${r.none ? "#chosen" : OPT === "b" ? "#native" : OPT === "c" ? "#target" : "#retake"}">${r.none ? "Choose another photo" : "Take another photo"}</a>`}<a class="link" href="#stack">Delete this photo</a></div>`, r.title);
};
const dupStack = () => background() + sheet(`<p class="qline">Day 4 · Page 2</p><h2>You already took this page.</h2>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><figure style="margin:0;display:grid;gap:4px">${photo(4, 2)}<figcaption class="small">First photo</figcaption></figure><figure style="margin:0;display:grid;gap:4px">${photo(4, 2, "blur")}<figcaption class="small">New photo</figcaption></figure></div>
  <div class="acts"><a class="btn wide" href="#stack">Keep the first photo</a><a class="btn ghost wide" href="#stack">Use the new photo</a></div>`, "You already took this page");
const dupMarked = () => background() + sheet(`${photo(3, 8, "big")}<p class="qline">Day 3 · Page 8</p><h2>This page is already marked.</h2><p style="font-size:16px">A new photo does not change the marks. If a mark is wrong, you can change it on the page.</p>
  <div class="acts"><a class="btn wide" href="#page">See the marks</a><a class="link" href="#stack">Delete this new photo</a></div>`, "This page is already marked");
const pageOk = () => background() + sheet(`${photo(4, 2, "big")}<p class="qline">Day 4 · Page 2</p><h2>This page is ready to send.</h2><div class="acts"><a class="btn ghost wide" href="#stack">Close</a><a class="link" href="#stack">Delete this photo</a></div>`, "Day 4, page 2");

const LEAVE = PICK ? "You can close this page. If you do, we email you when the marks are ready." : "You can close this page. We keep marking, and the marks show here.";

/* ---------- One page (Flow B): the stack with one page in it ---------- */
const onePage = (checking) => frame(`<div style="display:grid;gap:6px"><h1 class="title">Scan pages</h1></div>
  <section class="one">${photo(4, 2, "big")}<div class="one-t"><div class="one-id"><b>Day 4 · Page 2</b><span class="small">${CHILD} · Workbook 1</span></div>
    ${checking ? `<span class="state"><span class="spin"></span>Checking this photo...</span>` : `<span class="state ok"><i>${I.check}</i>We can read this page.</span>`}
    <div class="only-big">${checking ? `<span class="btn off">Send this page for marking</span>` : `<a class="btn" href="#one-marking">Send this page for marking</a>`}<a class="btn ghost" href="${ADD_HREF}">Add another page</a></div>
    <a class="link" href="#stack">Delete this photo</a></div></section>`,
  { dockCls: "one-dock", dock: dock(checking ? `<span class="btn off">Send this page for marking</span>` : `<a class="btn" href="#one-marking">Send this page for marking</a>`, `<a class="btn ghost add" href="${ADD_HREF}" aria-label="Add another page">+ Page</a>`) });
const oneMarking = () => frame(`<div style="display:grid;gap:6px"><h1 class="title">We are marking this page</h1><p class="lede">Day 4 · Page 2. ${LEAVE}</p></div>
  <section class="one">${photo(4, 2, "big")}<div class="one-t"><span class="state"><span class="spin"></span>Marking...</span></div></section>`);

/* ---------- Send and mark ---------- */
const ORDER = [[4, 1], [4, 2], [4, 3], [4, 4], [4, 5], [4, 6], [4, 7], [4, 8], [5, 1], [5, 2], [5, 3], [5, 4]];
const scoreOf = (d, p) => { const key = `d${d}p${p}`; const w = (WRONG[key] || []).length; return `${9 - w} of 9 right`; };
const hasAsk = (d, p) => (ASK[`d${d}p${p}`] || []).length;
function segs(done, doing) { return `<div class="segs" aria-hidden="true">${ORDER.map((_, i) => `<i class="${i < done ? "d" : i === done && doing ? "n" : ""}"></i>`).join("")}</div>`; }
const groupRows = (fn) => [4, 5].map((d) => `<section class="grp"><div class="grp-h"><h2>Day ${d}</h2></div><ul class="rows cols">${ORDER.filter(([x]) => x === d).map(([x, p], i) => fn(x, p, ORDER.findIndex(([a, b]) => a === x && b === p))).join("")}</ul></section>`).join("");
const row = (d, p, res, href = "#page") => `<li><a class="row" href="${href}">${photo(d, p)}<span><b>Page ${p}</b><span class="sub">${TITLES[d][p - 1]}</span></span>${res}</a></li>`;

const sending = () => frame(`<div style="display:grid;gap:8px"><h1 class="title">Sending 12 pages</h1><p class="lede">Please wait a moment. You can leave this page after they are sent.</p>${segs(0, false)}</div>${groupRows((d, p) => row(d, p, `<span class="res wait">Sending</span>`, "#marking"))}`);
const marking = () => frame(`<div style="display:grid;gap:8px"><h1 class="title">We are marking 12 pages</h1><p class="lede">3 of 12 are done. ${LEAVE}</p>${segs(3, true)}</div>
  ${groupRows((d, p, i) => row(d, p, i < 3 ? (hasAsk(d, p) ? `<span class="res ask">Please check</span>` : `<span class="res">${scoreOf(d, p)}</span>`) : i === 3 ? `<span class="res wait">Marking...</span>` : `<span class="res wait">Waiting</span>`, i < 3 ? "#page" : "#marking"))}`);
const paused = () => frame(`<div style="display:grid;gap:8px"><h1 class="title">We are marking 12 pages</h1><p class="lede">3 of 12 are done.</p>${segs(3, false)}</div>
  <div class="alert" role="status">Marking is paused on our side. Your pages are safe. We will mark them when marking starts again, and you do not have to send them again.</div>
  ${groupRows((d, p, i) => row(d, p, i < 3 ? `<span class="res">${scoreOf(d, p)}</span>` : `<span class="res wait">Waiting</span>`, i < 3 ? "#page" : "#paused"))}`);

const ready = (stage) => {
  const askPanel = stage === "ask" ? `<section class="panel ask-p"><h2>Please check 2 answers</h2><p style="font-size:15.5px">We could not read them for sure. It takes a moment, and then the pages are done.</p><div class="acts"><a class="btn" href="#check">Check 2 answers</a></div></section>` : "";
  const choice = stage === "choice" ? `<section class="panel sq"><h2>What next?</h2><p style="font-size:15.5px">${CHILD} can try the wrong answers again with Maya. The first answers keep their marks.</p>
    <div class="acts"><a class="btn" href="#maya">Fix mistakes with Maya</a><a class="btn ghost" href="#results">Just show results</a></div></section>` : "";
  const res = (d, p) => stage === "ask" && hasAsk(d, p) ? `<span class="res ask">Please check 1</span>` : `<span class="res">${scoreOf(d, p)}</span>`;
  return frame(`<div style="display:grid;gap:6px"><h1 class="title">${CHILD}'s pages are marked</h1><p class="lede">12 pages from Day 4 and Day 5. Tap a page to see the marks.</p></div>${askPanel}${choice}${groupRows((d, p) => row(d, p, res(d, p)))}
    <a class="btn ghost" href="#start" style="justify-self:start">Scan more pages</a>`);
};
const mayaSheet = () => ready("results") + sheet(`<h2>Open the desk for ${CHILD}</h2><p style="font-size:16px">${CHILD} gets each wrong answer from these pages on the desk, one at a time, and tries it again with Maya. The first answers keep their marks.</p><div class="acts"><a class="btn wide" href="#results">Open the desk</a><a class="link" href="#ready-choice">Not now</a></div>`, "Open the desk");

const check = (n) => {
  const [d, p, q] = n === 1 ? [4, 4, 3] : [5, 1, 6];
  const it = items(d, p)[q - 1];
  return frame(`<a class="back" href="#ready">← All pages</a><div style="display:grid;gap:6px"><span class="eyebrow">Please check · ${n} of 2</span><h1 class="title" style="font-size:28px">Is this answer right?</h1></div>
    <section style="display:grid;gap:12px;max-width:520px"><p class="qline">Day ${d} · Page ${p} · Question ${q}</p><div class="crop">${cropSvg(d, p, q)}</div>
      <p style="font-size:16px">${it.text}. The right answer is <b style="font-weight:600">${it.right}</b>. We could not read ${CHILD}'s writing for sure.</p>
      <div class="choice two"><a href="${n === 1 ? "#check2" : "#ready-choice"}">${I.check}Right</a><a href="${n === 1 ? "#check2" : "#ready-choice"}">✗ Wrong</a></div>
      <a class="link" href="${n === 1 ? "#check2" : "#ready-choice"}" style="justify-self:start">${CHILD} left it blank</a></section>`);
};

/* ---------- A marked page, and changing a mark ---------- */
function markedPage(o = {}) {
  const list = items(4, 2);
  const flip = o.flip ? 5 : 0;
  const right = flip ? 9 : 8;
  const li = list.map((q) => {
    const isX = q.wrong && !flip;
    const mark = `<span class="pm" aria-label="${isX ? "Wrong" : "Right"}">${isX ? "✗" : "✓"}</span>`;
    const tag = q.wrong && flip ? `<span class="tag">You changed this mark</span>` : "";
    const fix = isX ? `<div class="fix"><span>The right answer is <b style="font-weight:600">${q.right}</b>.</span><a class="btn ghost" href="#page">See the steps</a></div>` : "";
    return `<li class="item ${isX ? "x" : ""}"><span class="num">${q.n}</span><span class="item-t"><span class="mk-w">${q.text}</span><em>${CHILD} wrote ${q.wrote}</em>${tag}</span><span class="item-r">${mark}<a class="link" href="#change">Change</a></span>${fix}</li>`;
  }).join("");
  const body = `${o.one ? "" : `<a class="back" href="#results">← All pages</a>`}
    <div style="display:grid;gap:8px"><span class="eyebrow">Day 4 · Page 2</span><p class="score">${right} of 9 <small>right</small></p></div>
    <div class="res-grid"><div class="res-page"><div class="sheet-img">${pageSvg(4, 2, { marks: true, flip, draw: true })}</div><span class="small">Your photo, straightened. <a class="link" style="font-size:14px" href="#page">Delete this photo</a></span></div>
    <div style="display:grid;gap:14px">
      ${o.flip ? `<p class="saved" role="status">Mark changed. Question 5 is now right. We keep what we read first.</p>` : ""}
      ${o.one ? `<section class="panel sq"><h2>What next?</h2><p style="font-size:15.5px">${CHILD} can try the wrong answer again with Maya. The first answer keeps its mark.</p><div class="acts"><a class="btn" href="#maya">Fix mistakes with Maya</a><a class="btn ghost" href="#page">Just show results</a></div></section>` : ""}
      <ul class="items">${li}</ul>
      ${o.one ? `<a class="btn ghost" href="#start" style="justify-self:start">Scan another page</a>` : `<a class="link" href="#page" style="justify-self:end">Next: Day 4 · Page 3 →</a>`}</div></div>`;
  return frame(body);
}
const changeSheet = (gone) => {
  const q = items(4, 2)[4];
  return markedPage() + sheet(`<p class="qline">Day 4 · Page 2 · Question 5 · ${q.text}</p><h2>Change this mark</h2>
    ${gone ? `<div class="crop gone">Photo no longer available.<br>We keep what we read.</div>` : `<div class="crop">${cropSvg(4, 2, 5)}</div>`}
    <p class="read">We read: <b>${q.wrote}</b>. The right answer is <b>${q.right}</b>.</p>
    <div class="choice" role="radiogroup" aria-label="The mark"><a href="#changed" role="radio" aria-checked="false">Right</a><a href="#change" class="on" role="radio" aria-checked="true">Wrong</a><a href="#change" role="radio" aria-checked="false">Blank</a></div>
    <p class="small">Your choice replaces our mark. We keep what we read first, and ${CHILD}'s next workbook uses your mark.</p>
    <div class="acts"><a class="btn wide" href="#changed">Save this mark</a><a class="link" href="#page">Cancel</a></div>`, "Change this mark");
};

/* ---------- Routes ---------- */
const STACK = () => {
  if (OPT === "c") return frame(daySlots("mixed"), { dock: cStackDock() });
  return frame(mixedStack(), { dock: mixedDock() });
};
const ROUTES = {
  start, notice, stack: STACK, "start-here": () => CAM.look(),
  clean: () => frame(cleanStack(), { dock: cleanDock() }),
  blocked, native,
  one: () => onePage(false), "one-check": () => onePage(true), "one-marking": oneMarking, "one-marked": () => markedPage({ one: true }),
  "r-blur": () => refusal("blur"), "r-cut": () => refusal("cut"), "r-dark": () => refusal("dark"), "r-two": () => refusal("two"), "r-wrong": () => refusal("wrong"), "r-none": () => refusal("none"),
  add: () => frame(mixedStack(), { dock: mixedDock() }) + sheet(`<h2>Add pages</h2><div class="acts"><a class="btn wide" href="#look">Start scanning</a><a class="btn ghost wide" href="#chosen">Choose photos</a><a class="link" href="#native">Use my phone's camera</a></div>`, "Add pages"),
  chosen: () => frame(chosenStack(), { dock: dock(`<a class="btn" href="#sending">Send 3 pages for marking</a>`, addB(), "9 photos are still being checked. They stay here.") }),
  "d-stack": dupStack, "d-marked": dupMarked, "page-ok": pageOk,
  sending, marking, paused,
  ready: () => ready("ask"), "ready-choice": () => ready("choice"), results: () => ready("results"), maya: mayaSheet,
  check: () => check(1), check2: () => check(2),
  page: () => markedPage(), change: () => changeSheet(false), gone: () => changeSheet(true), changed: () => markedPage({ flip: true }),
};
for (const k of Object.keys(CAM)) ROUTES[k] = CAM[k];

let loopTimer = null;
function render() {
  clearTimeout(loopTimer);
  const state = decodeURIComponent(location.hash.slice(1)) || "start";
  if (state === "loop") return runLoop(0);
  const fn = ROUTES[state] || start;
  document.body.innerHTML = fn();
  document.title = `r565 ${OPT.toUpperCase()}: ${state}`;
  window.scrollTo(0, 0);
}

/* The camera loop in motion (option A): look, hold still, take, turn the page. The photos go up and get checked behind it. */
function runLoop(i) {
  const steps = [];
  for (let p = 1; p <= 6; p++) {
    steps.push({ c: { count: p - 1, p, msg: p === 1 ? "Point at one page" : "Point at the next page" }, t: 1100 });
    steps.push({ c: { count: p - 1, p, cls: "lock", msg: `Day 4 · Page ${p}`, small: "Hold still." }, t: 1000 });
    steps.push({ c: { count: p, p, cls: "lock snap", fly: [4, p], msg: `Got it: Day 4 · Page ${p}`, small: "Turn to the next page.", tone: "good" }, t: 1300 });
  }
  const s = steps[i % steps.length];
  document.body.innerHTML = camera(s.c);
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) loopTimer = setTimeout(() => runLoop(i + 1), s.t);
}

window.addEventListener("hashchange", render);
window.matchMedia("(min-width: 1024px)").addEventListener("change", render);
document.addEventListener("click", (e) => { const a = e.target.closest('a[href="#"]'); if (a) e.preventDefault(); });
(document.fonts ? document.fonts.ready : Promise.resolve()).then(render);
render();
