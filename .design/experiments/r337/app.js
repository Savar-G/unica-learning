// Round r337: a clickable mockup of Maya's call screens. No network, no microphone, no product code.
// call.html?opt=a|b|c&state=<state>[&still=1][&bare=1][&device=chrome|safari|android]
// Words Maya says come from src/lib/maya/lines.ts where a line exists; see manifest.json for the ones that need a line.

const Q = new URLSearchParams(location.search);
const S = { opt: Q.get("opt") || "a", state: Q.get("state") || "pick", still: Q.has("still"), bare: Q.has("bare"), device: Q.get("device") };
const MAYA = "../../../public/desk/maya.webp";
const NAME = "Leah";

const ICONS = {
  home: '<path d="M4 11 12 4l8 7"/><path d="M6 9.5V20h12V9.5"/>',
  book: '<path d="M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5Z"/><path d="M12 6.5v13"/>',
  chart: '<path d="M5 20h14"/><path d="M8 16v-4"/><path d="M12 16V8"/><path d="M16 16v-6"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  sound: '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M15.5 9.5a3.5 3.5 0 0 1 0 5"/><path d="M18 7a7 7 0 0 1 0 10"/>',
  chat: '<path d="M5 6h14v9H10l-4 3.5V15H5z"/>',
  phone: '<path d="M7 4h3l1.5 4-2 1.5a10 10 0 0 0 5 5l1.5-2 4 1.5v3a2 2 0 0 1-2 2A15 15 0 0 1 5 6a2 2 0 0 1 2-2Z"/>',
  board: '<rect x="3.5" y="5" width="17" height="11" rx="1.5"/><path d="m8 13 2.5-3 2 2 3.5-4"/><path d="M9 20h6"/><path d="M12 16v4"/>',
  pen: '<path d="M15.5 5.5 18.5 8.5 9 18l-4 1 1-4z"/><path d="m13.5 7.5 3 3"/>',
  eraser: '<path d="m9.5 19-4-4a1.5 1.5 0 0 1 0-2l7.5-7.5a1.5 1.5 0 0 1 2 0l4 4a1.5 1.5 0 0 1 0 2L12 19z"/><path d="M9.5 19H19"/><path d="m8.5 10 5.5 5.5"/>',
  undo: '<path d="M9 7 5 11l4 4"/><path d="M5 11h9a5 5 0 0 1 0 10h-2"/>',
  page: '<path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5A.5.5 0 0 1 6.5 20V4a.5.5 0 0 1 .5-.5Z"/><path d="M14 3.5V8h4"/><path d="M9.5 12.5h5"/><path d="M9.5 16h5"/>',
  mic: '<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"/><path d="M12 18v2.5"/>',
  micoff: '<path d="M15 9.5V6.5a3 3 0 0 0-5.6-1.5"/><path d="M9 9v2.5a3 3 0 0 0 4.6 2.5"/><path d="M5.5 11.5a6.5 6.5 0 0 0 10.3 5.3"/><path d="M18.5 11.5c0 .8-.1 1.5-.4 2.2"/><path d="M12 18v2.5"/><path d="m4 4 16 16"/>',
  why: '<path d="M9 9a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.2-1.5 2.4"/><path d="M12 17.5v.5"/><circle cx="12" cy="12" r="9"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  camera: '<path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  check: '<rect x="5" y="4" width="14" height="16" rx="2"/><path d="m9 12 2 2 4-4"/>',
  user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-4 4-5.5 7-5.5s6 1.5 7 5.5"/>',
};
const icon = (n, s = 22) => `<svg class="desk-icon" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;
const avatar = (s) => `<img class="desk-avatar" src="${MAYA}" alt="" width="${s}" height="${s}">`;
const stateAvatar = (s) => `<span class="call-av">${avatar(s)}</span>`;
const go = (state, extra = "") => `data-go="${state}" ${extra}`;
const wave = (who = "maya") => `<span class="wave ${who}" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>`;

// ---------- the board ----------
const COL = { blue: "var(--board-blue)", red: "var(--board-red)", green: "var(--board-green)", ink: "var(--ink)" };
const narrow = () => matchMedia("(max-width: 700px)").matches;
let inkT = 0;
function glyph(ch, x, y, s, color, w, key) {
  const d = GLYPHS[ch];
  const t = inkT; inkT += 0.28;
  return `<path class="r-draw${key ? " r-new" : ""}" pathLength="1" d="${d}" transform="translate(${x},${y}) scale(${s},${-s})" stroke="${color}" stroke-width="${w / s}" style="--t:${t}s"/>`;
}
function text(str, x, y, s, color, w, gap = 560) {
  return [...str].map((c, i) => (c === " " ? "" : glyph(c, x + i * gap * s, y, s, color, w))).join("");
}
function boardSvg(stage) {
  inkT = 0;
  const n = narrow();
  const out = [];
  const s = 0.145, W = 6, T = 262, O = 352, R1 = 138, R2 = 246;
  if (stage >= 1) out.push(`<ellipse cx="${O + 44}" cy="${(R1 + R2) / 2 - 40}" rx="58" ry="122" fill="none" stroke="var(--board-yellow)" stroke-width="14" stroke-opacity=".62"/>`);
  out.push(glyph("2", T, R1, s, COL.blue, W), glyph("7", O, R1, s, COL.blue, W));
  out.push(glyph("+", 158, R2, s, COL.ink, W), glyph("3", T, R2, s, COL.blue, W), glyph("9", O, R2, s, COL.blue, W));
  out.push(`<path class="r-draw" pathLength="1" d="M150 268H452" stroke="${COL.ink}" stroke-width="${W}" style="--t:${inkT}s"/>`); inkT += .25;
  if (stage >= 1) {
    if (n) out.push(text("7+9=16", 204, 448, .058, COL.blue, 3.4));
    else out.push(text("7+9=16", 492, 196, .072, COL.blue, 4));
  }
  if (stage >= 2) { out.push(glyph("1", T + 8, 34, .072, COL.red, 4.5)); }
  if (stage >= 1) { out.push(glyph("6", O, 376, s, COL.blue, W, true)); }
  // Maya's pen at the tip of what she is writing, as in the demo video.
  if (stage === 1) out.push(`<g class="r-pen" style="--t:${inkT}s" transform="translate(${O + 84},${344})"><path d="M0 22 5 11 30 -24 39 -18 14 17z" fill="#3d5a99" stroke="#17120f" stroke-width="1.4" stroke-linejoin="round"/><path d="M0 22 5 11 14 17z" fill="#f3d7b0" stroke="#17120f" stroke-width="1.2" stroke-linejoin="round"/><circle cx="45" cy="-36" r="19" fill="#fff" stroke="var(--line)"/><image href="${MAYA}" x="28" y="-53" width="34" height="34" clip-path="circle(17px)"/></g>`);
  // The child's ink: a hand-drawn stroke, not a glyph.
  if (stage >= 3) out.push(`<path class="r-draw" pathLength="1" d="M298 276C278 296 262 322 263 348C264 372 282 382 298 376C318 368 318 340 298 334C282 330 270 340 264 350" stroke="${COL.ink}" stroke-width="7" style="--t:${inkT}s"/>`);
  if (stage >= 4) {
    const cx = n ? 420 : 500, cy = n ? 352 : 360;
    out.push(`<path class="r-draw" pathLength="1" d="M${cx} ${cy}l18 22 38-52" stroke="${COL.green}" stroke-width="9" style="--t:${inkT + .2}s"/>`);
  }
  const box = n ? "128 -8 372 480" : "120 -8 640 420";
  return `<svg viewBox="${box}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Our board: 27 plus 39 in columns">${out.join("")}</svg>`;
}
const stageEl = (stage) => `<div class="r-stage${S.still ? "" : " r-play"}" data-stage>${stage === null ? "" : boardSvg(stage)}</div>`;
const qCrop = () => `<div class="q-crop" aria-label="Question 4: 27 plus 39"><span class="n">4.</span><span class="row"><span></span><span>27</span></span><span class="row"><span>+</span><span>39</span></span><span class="rule"></span><span class="gap"></span></div>`;
const qCard = (inCall) => `<figure class="desk-card${inCall ? " in-call" : ""}"><figcaption><b>4</b><span>Workbook 1 · Page 23</span></figcaption>${inCall ? `<div class="q-crop" style="font-size:20px;padding:6px 14px 8px"><span class="n">4.</span><span class="row"><span></span><span>27</span></span><span class="row"><span>+</span><span>39</span></span><span class="rule"></span></div>` : qCrop()}</figure>`;
const qTile = () => `<div class="q-tile" aria-label="Question 4, page 23"><b>4</b><span>27 + 39<small>Page 23</small></span></div>`;

// ---------- the call's states ----------
const LINES = {
  hello: "Hi, I'm Maya, an AI helper. Let's do page 23, number 4: 27 + 39.",
  tried: "What did you try for 27 + 39?",
  ones: "Let's look at the ones column: 7 and 9.",
  carry: "7 + 9 = 16. 16 is 1 ten and 6 ones. Write 6 in the ones. Carry 1 ten to the tens.",
  tens: "Now the tens. What is 1 + 2 + 3?",
  penask: "Yes, 6. Take the pen and write it in the tens.",
  paper: "Please write 66 on your paper.",
  why: "Hmm, let me think.",
  close: "We have one minute left. Let's finish this question.",
};
const CALL = {
  talking: { maya: "talking", label: "Maya is talking", stage: 1, caption: LINES.carry, time: "02:14", left: "19 min left this week", said: ["m:hello", "m:tried", "c:I got 56.", "m:ones", "c:16.", "m:carry"] },
  listening: { maya: "listening", label: "Maya is listening", stage: 2, caption: LINES.tens, yours: true, time: "02:41", left: "19 min left this week", said: ["m:tried", "c:I got 56.", "m:ones", "c:16.", "m:carry", "m:tens"] },
  pen: { maya: "listening", label: "Maya is listening", stage: 3, caption: LINES.penask, pen: "child", time: "03:02", left: "18 min left this week", said: ["c:16.", "m:carry", "m:tens", "c:6.", "m:penask"] },
  why: { maya: "moment", label: "One moment", stage: 1, caption: LINES.why, heard: "Why?", time: "02:19", left: "19 min left this week", said: ["c:I got 56.", "m:ones", "c:16.", "m:carry", "c:Why?", "m:why"] },
  wait: { maya: "waiting", label: "Maya is waiting", sub: "Take your time.", stage: 4, caption: LINES.paper, time: "03:40", left: "18 min left this week", said: ["m:tens", "c:6.", "m:penask", "m:paper"] },
  muted: { maya: "listening", label: "Your mic is off", stage: 2, caption: LINES.tens, muted: true, time: "02:44", left: "19 min left this week", note: { text: "Maya can't hear you.", small: "Tap the mic to talk." }, said: ["m:ones", "c:16.", "m:carry", "m:tens"] },
  reconnect: { maya: "away", label: "Getting Maya back", stage: 2, off: true, time: "02:52", left: "19 min left this week", note: { spin: true, text: "We lost the line. Getting Maya back.", small: "Your board is safe. This wait does not use your minutes." }, said: ["m:ones", "c:16.", "m:carry", "m:tens"] },
  micstop: { maya: "away", label: "Your mic stopped", stage: 2, time: "02:52", left: "19 min left this week", muted: true, note: { text: "Your mic stopped working.", small: "Close other apps that use it. Then tap the mic." }, said: ["m:ones", "c:16.", "m:carry", "m:tens"] },
  closing: { maya: "talking", label: "Maya is talking", stage: 2, caption: LINES.close, time: "07:02", left: "1 min left this week", low: true, note: { sun: true, text: "1 minute left this week.", small: "Maya will help you finish this question." }, said: ["m:carry", "m:tens", "c:6.", "m:close"] },
  closecall: { maya: "talking", label: "Maya is talking", stage: 2, caption: LINES.close, time: "09:02", left: "1 min left in this call", low: true, note: { sun: true, text: "1 minute left in this call.", small: "You can call Maya again after." }, said: ["m:carry", "m:tens", "c:6.", "m:close"] },
};
const CALL_STATES = Object.keys(CALL);

function said(c) {
  return c.said.map((l) => { const [w, t] = [l.slice(0, 1), l.slice(2)]; return w === "m" ? `<p class="desk-bubble"><span class="r-said">${icon("sound", 15)}</span>${LINES[t]}</p>` : `<p class="desk-bubble desk-child-bubble">${t}</p>`; }).join("");
}
function statusLine(c) {
  return `<span class="call-state">${c.label}${c.maya === "talking" ? wave("maya") : c.maya === "listening" && !c.muted ? wave("you") : ""}</span>${c.sub ? `<span class="call-state-sub">${c.sub}</span>` : ""}`;
}
function pill(c, withLeft) {
  return `<div class="call-pill has-state" aria-label="Call controls">${stateAvatar(34)}${wave(c.maya === "listening" ? "you" : "maya")}<time>${c.time}</time>${withLeft ? `<span class="left${c.low ? " low" : ""}">${c.left}</span>` : ""}<button class="hang" ${go(hangTo(c))} aria-label="Hang up">${icon("phone", 22)}</button></div>`;
}
function hangTo(c) { if (S.state === "closing") return "after-week"; if (S.state === "wait") return "after-solved"; return "after-stopped"; }
function overBoard(c) {
  const parts = [];
  if (c.note) parts.push(`<p class="call-note${c.note.sun ? " sun" : ""}">${c.note.spin ? '<span class="spin"></span>' : ""}<span>${c.note.text}<small>${c.note.small}</small></span></p>`);
  if (c.caption) parts.push(`<p class="call-caption${c.yours ? " yours" : ""}${c.heard ? " has-heard" : ""}">${c.yours ? "<b>Your turn</b>" : ""}${c.caption}</p>`);
  if (c.heard) parts.push(`<p class="call-heard">${c.heard}</p>`);
  return parts.join("");
}
const penBar = (c) => c.pen === "child"
  ? `<button class="ctl give" ${go("listening")}>${icon("pen", 18)}Give it back</button>`
  : `<button class="ctl take" ${go("pen")}>${icon("pen", 18)}Take the pen</button>`;
const micBtn = (c) => c.muted
  ? `<button class="ctl off" ${go("listening")} aria-pressed="false">${icon("micoff", 20)}Mic off</button>`
  : `<button class="ctl" ${go("muted")} ${c.off ? "disabled" : ""} aria-pressed="true">${icon("mic", 20)}Mic on</button>`;
const whyBtn = (c) => `<button class="ctl" ${go("why")} ${c.off || c.muted ? "disabled" : ""}>${icon("why", 20)}Ask why</button>`;
const toolRail = (c) => c.pen === "child" ? `<div class="r-tools" aria-label="Pen tools"><button aria-pressed="true" aria-label="Pen">${icon("pen")}</button><button aria-label="Eraser">${icon("eraser")}</button><button aria-label="Undo">${icon("undo")}</button><button>Clear</button></div>` : "";

// ---------- frames ----------
const topBar = (extra = "") => `<header class="desk-top"><p class="desk-title">${avatar(24)}<span class="desk-title-name">${NAME}'s desk</span><span class="desk-brand">Unica<b></b></span></p>${extra || `<button class="desk-sound">${icon("sound", 18)}Sound on</button>`}</header>`;
function rail(inCall) {
  return `<nav class="desk-rail" aria-label="Desk"><span class="desk-rail-item" aria-current="page">${icon("home")}<span>Desk</span></span><button class="desk-rail-item" ${inCall ? "disabled" : go("books")}>${icon("book")}<span>Workbooks</span></button><button class="desk-rail-item" disabled>${icon("chart")}<span>Progress</span></button><button class="desk-rail-item desk-lock" ${go("pin")}>${icon("lock")}<span>Leave</span></button></nav>`;
}
function head({ sub, calls = "22 min left this week", chat = "56 left today", state }) {
  return `<header class="desk-maya-head">${state ? stateAvatar(48) : avatar(48)}<div class="desk-who"><h1>Maya</h1><p>${sub || "Workbook 1 · Day 4"}</p></div><dl class="desk-limits" aria-label="Help from Maya"><div><dt>${icon("phone", 14)}Calls</dt><dd>${calls}</dd></div>${chat ? `<div><dt>${icon("chat", 14)}Chat</dt><dd>${chat}</dd></div>` : ""}</dl></header>`;
}
function tabs(active, off = []) {
  const t = [["Chat", "chat"], ["Call", "phone"], ["Call + board", "board"]];
  return `<div class="desk-modes" role="group" aria-label="How to talk with Maya">${t.map(([l, i]) => `<button type="button" aria-pressed="${l === active}" ${off.includes(l) ? "disabled" : ""}>${icon(i, 18)}${l}</button>`).join("")}</div>`;
}
function emptyBoard(tag, inner, canvasExtra = "") {
  return `<section class="desk-board" aria-labelledby="bt"><header><h2 id="bt">Our board</h2><p>${tag}</p></header><div class="desk-board-body" style="grid-template-columns:minmax(0,1fr)"><div class="desk-canvas" ${canvasExtra}>${inner}</div></div></section>`;
}
function deskFrame({ headOpt, talk, foot, main, inCall, opt = "", attrs = "" }) {
  return `<div class="look-root desk-root${inCall ? " in-call" : ""} ${opt}" data-look="warm" ${attrs}>${topBar()}${rail(inCall)}<main class="desk-body"><section class="desk-maya" aria-label="Maya">${head(headOpt || {})}<div class="desk-talk" aria-live="polite">${talk}</div>${foot ? `<footer class="desk-say">${foot}</footer>` : ""}</section><div class="desk-main">${main}</div></main></div>`;
}
const callTabs = () => tabs("Call + board");
const aiLine = `<p class="r-line">Maya is an AI teaching assistant. Your grown-up gets a short note after each call.</p>`;
const bubble = (t) => `<p class="desk-bubble">${t}</p>`;

// ---------- Option A: the desk goes live (the demo video, D-184) ----------
function optA(c) {
  const talk = qCard(true) + said(c);
  const body = `<div class="desk-board-body"><div class="desk-canvas" data-pen="${c.pen === "child" ? "child" : "maya"}" style="${c.pen === "child" ? "touch-action:none" : ""}">${stageEl(c.stage)}${pill(c)}${overBoard(c)}</div>${c.pen === "child" ? toolRail(c) : `<div class="desk-tools" aria-label="Pen tools, off while Maya has the pen"><button disabled aria-label="Pen">${icon("pen")}</button><button disabled aria-label="Eraser">${icon("eraser")}</button><button disabled aria-label="Undo">${icon("undo")}</button><button disabled class="desk-clear">Clear</button><div class="desk-ink"><i></i>Maya</div><div class="desk-ink you"><i></i>You</div></div>`}</div>`;
  const main = `${callTabs()}<section class="desk-board" aria-labelledby="bt"><header><h2 id="bt">Our board</h2><p>${c.pen === "child" ? `${icon("pen", 18)}You have the pen` : `${avatar(22)}Maya has the pen`}</p></header>${body}</section><div class="call-bar">${micBtn(c)}${whyBtn(c)}${penBar(c)}</div>`;
  const phoneTile = `<span class="r-phone-q" style="margin-left:auto">${qTile().replace('class="q-tile"', 'class="q-tile" style="position:static;box-shadow:none"')}</span>`;
  const html = deskFrame({ inCall: true, opt: "opt-a", attrs: `data-maya="${c.maya}"`, headOpt: { sub: statusLine(c), calls: c.left.replace("1 min left in this call", "1 min left in this call"), state: true }, talk, main });
  return html.replace("</header><div class=\"desk-talk\"", `</header><div class="desk-talk"`).replace(/(<div class="desk-who">.*?<\/div>)/, `$1${matchMedia("(max-width: 700px)").matches ? phoneTile : ""}`);
}

// ---------- Option B: the board is the room (the board-only video) ----------
function optB(c) {
  return `<div class="look-root b-root opt-b" data-look="warm" data-maya="${c.maya}">${topBar(`<span class="board-tag">${c.pen === "child" ? `${icon("pen", 18)}You have the pen` : `${avatar(22)}Maya has the pen`}</span>`)}<main class="b-main"><section class="desk-board"><header><h2>Our board</h2><p>${statusLine(c)}</p></header><div class="desk-board-body"><div class="desk-canvas" data-pen="${c.pen === "child" ? "child" : "maya"}">${stageEl(c.stage)}${qTile()}${pill(c, !narrow())}${overBoard(c)}</div>${toolRail(c)}</div></section></main><div class="b-foot"><div class="call-bar">${micBtn(c)}${whyBtn(c)}${penBar(c)}${narrow() ? "" : ""}</div></div></div>`;
}

// ---------- Option C: Maya beside the board (FigJam 103:53, spec #297) ----------
function optC(c) {
  const ctl = `<div class="c-ctl"><button class="${c.muted ? "o" : ""}" ${go(c.muted ? "listening" : "muted")} ${c.off ? "disabled" : ""}><i>${icon(c.muted ? "micoff" : "mic", 20)}</i>${c.muted ? "Mic off" : "Mic on"}</button><button ${go("why")} ${c.off || c.muted ? "disabled" : ""}><i>${icon("why", 20)}</i>Ask why</button><button class="${c.pen === "child" ? "" : "t"}" ${go(c.pen === "child" ? "listening" : "pen")}><i>${icon("pen", 20)}</i>${c.pen === "child" ? "Give it back" : "Take the pen"}</button><button class="h" ${go(hangTo(c))}><i>${icon("phone", 20)}</i>Hang up</button></div>`;
  return `<div class="look-root c-root opt-c" data-look="warm" data-maya="${c.maya}">${topBar(`<span class="c-live">Live · ${c.time}</span>`)}<main class="c-body"><div class="c-main"><section class="desk-board"><header><h2>Our board</h2><p>${c.pen === "child" ? `${icon("pen", 18)}You have the pen` : "Maya has the pen"}</p></header><div class="desk-board-body"><div class="desk-canvas" data-pen="${c.pen === "child" ? "child" : "maya"}">${stageEl(c.stage)}${qTile()}${c.note ? overBoard({ note: c.note }) : ""}${narrow() || matchMedia("(max-width: 1023px)").matches ? overBoard({ caption: c.caption, yours: c.yours, heard: c.heard }) : c.yours ? `<p class="call-caption yours"><b>Your turn</b>What is 1 + 2 + 3?</p>` : ""}</div>${toolRail(c)}</div></section></div><aside class="c-side"><div class="c-maya">${stateAvatar(matchMedia("(max-width: 1023px)").matches ? 52 : 104)}<div>${statusLine(c)}</div><span class="c-left${c.low ? " low" : ""}">${c.left}</span></div><div class="c-said"><h3>What Maya said</h3>${c.said.slice(-4).map((l) => { const [w, t] = [l.slice(0, 1), l.slice(2)]; return w === "m" ? `<p>${LINES[t]}</p>` : `<p class="you">${t}</p>`; }).join("")}</div>${ctl}</aside></main></div>`;
}

// ---------- "Call" tab during a call: the same call with no board on screen ----------
function callOnly() {
  const c = CALL.listening;
  const main = `${tabs("Call")}<section class="desk-board" style="align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center" data-maya="${c.maya}">${stateAvatar(120)}<div style="font:500 22px/1.2 var(--sans)">${statusLine(c)}</div><p class="r-line" style="max-width:40ch;font-size:16px">${LINES.tens}</p><p class="r-line">Maya keeps drawing on the board. Tap <b>Call + board</b> to see it.</p><div class="call-pill" style="position:static">${wave("you")}<time>${c.time}</time><button class="hang" ${go("after-stopped")} aria-label="Hang up">${icon("phone", 22)}</button></div></section><div class="call-bar">${micBtn(c)}${whyBtn(c)}</div>`;
  return deskFrame({ opt: "opt-a", attrs: `data-maya="${c.maya}"`, headOpt: { sub: statusLine(c), calls: c.left, state: true }, talk: qCard(true) + said(c), main });
}

// ---------- pre-call ----------
const deskQuestionBoard = () => emptyBoard(`${avatar(22)}Maya draws here in a call`, `${stageEl(0)}`);
const deskEmptyBoard = () => emptyBoard(`${avatar(22)}Maya draws here in a call`, "");
const greeting = `Hi ${NAME}! Which question are you on? Pick it from your page, or say it.`;
const pickFoot = `<button class="r-btn" ${go("popup")}>${icon("page", 20)}Pick from my page</button><button class="r-btn ghost" ${go("say")}>${icon("mic", 20)}Say page and number</button>`;
const screens = {
  pick: () => deskFrame({ talk: bubble(greeting), foot: pickFoot, main: tabs("Call + board") + deskEmptyBoard() }),
  say: () => deskFrame({ talk: bubble(greeting) + `<div class="r-listen" data-maya="listening" style="align-self:stretch"><span class="top"><span>Say "page 23, number 4".</span>${wave("you on")}</span></div>`, foot: `<button class="r-btn ghost" ${go("pick")}>Stop listening</button><button class="r-btn" ${go("popup")}>${icon("page", 20)}Pick from my page</button>`, main: tabs("Call + board") + deskEmptyBoard() }),
  "say-miss": () => deskFrame({ talk: bubble(greeting) + bubble("Page 40 is not in this workbook. Say the page again, or pick it from your page."), foot: `<button class="r-btn" ${go("popup")}>${icon("page", 20)}Pick from my page</button><button class="r-btn ghost" ${go("say")}>${icon("mic", 20)}Say it again</button>`, main: tabs("Call + board") + deskEmptyBoard() }),
  popup: () => screens.pick() + `<div class="r-overlay" style="padding:12px;place-items:center"><div class="r-sheet" style="width:min(720px,100%);padding:0;gap:0;overflow:hidden;border-radius:18px"><header style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 14px 12px 22px;border-bottom:1px solid var(--line)"><div><h2 style="font:600 20px/1.2 var(--sans)">Pick from my page</h2><p style="font-size:14px">Page 23 · Day 4</p></div><button class="desk-x" ${go("pick")} aria-label="Close">✕</button></header><div style="padding:14px;background:#f5f5f6;display:grid;gap:10px"><div style="position:relative;background:#fff;border:1px solid var(--line);padding:18px 20px 22px;display:grid;grid-template-columns:repeat(3,1fr);gap:14px">${[["1","35","+ 41"],["2","62","+ 18"],["3","14","+ 28"],["4","27","+ 39"],["5","46","+ 37"],["6","58","+ 25"]].map(([n,a,b]) => `<button ${n==="4"?go("confirm"):""} class="desk-area" style="position:static;display:grid;justify-items:end;padding:6px 14px 26px;font:500 clamp(18px,3vw,26px)/1.2 'Geist Mono',monospace;color:var(--ink)${n==="4"?";border:3px solid var(--tang);background:rgba(255,106,61,.1);box-shadow:0 0 0 5px rgba(255,106,61,.16)":""}" aria-pressed="${n==="4"}" aria-label="Question ${n}"><span style="justify-self:start;font:700 13px var(--sans)">${n}.</span><span>${a}</span><span>${b}</span><span style="width:100%;height:2px;background:var(--ink)"></span></button>`).join("")}</div><nav class="desk-pagebar" aria-label="Pages"><a class="prev" href="#">← Page 22</a><p>Tap the question you are on.</p><a class="next" href="#">Page 24 →</a></nav></div></div></div>`,
  confirm: () => deskFrame({ talk: bubble("Question 4 on page 23. Is that the one?") + qCard(), foot: `<button class="r-btn" ${go("mic-ask")}>${icon("phone", 20)}Yes, call Maya</button><button class="r-btn ghost" ${go("popup")}>${icon("page", 20)}Pick another question</button><p class="r-line">You have 22 minutes this week. A call can be up to 10 minutes.</p>${aiLine}`, main: tabs("Call + board") + deskQuestionBoard() }),
  held: () => deskFrame({ talk: bubble("Hi, I'm Maya, an AI helper. I can't help with this kind of question yet. You can pick another question, or ask a grown-up.") + `<figure class="desk-card"><figcaption><b>2</b><span>Workbook 1 · Page 24</span></figcaption><div class="q-crop" style="justify-items:start;font:500 18px/1.3 var(--sans)"><span style="padding-top:12px">True or false: 5 tens is the same as 50 ones.</span></div></figure>`, foot: `<button class="r-btn" ${go("popup")}>${icon("page", 20)}Pick another question</button><p class="r-line">No minutes were used.</p>`, main: tabs("Call + board") + deskEmptyBoard() }),
  "mic-ask": () => screens.confirm() + `<div class="r-overlay"><div class="r-sheet"><div class="who">${avatar(56)}<h2>Maya needs to hear you.</h2></div><p>Your browser will ask to use the microphone. Tap <b>Allow</b>.</p><div class="r-prompt" aria-hidden="true"><span>unicalearning.com wants to use your microphone</span><div class="acts"><span class="a">Don't allow</span><span class="a go">Allow</span></div></div><div class="btns"><button class="r-btn" ${go("connecting")}>OK</button><button class="r-btn ghost" ${go("confirm")}>Not now</button></div></div></div>`,
  "mic-refused": () => screens.confirm() + micRefused(device()),
  "mic-none": () => screens.confirm() + `<div class="r-overlay"><div class="r-sheet"><div class="who">${avatar(56)}<h2>We can't find a microphone.</h2></div><p>Ask a grown-up to plug one in or turn it on. Then press <b>Try again</b>. No minutes were used.</p><div class="btns"><button class="r-btn" ${go("connecting")}>Try again</button><button class="r-btn ghost" ${go("chat")}>${icon("chat", 20)}Chat with Maya instead</button></div></div></div>`,
  connecting: () => screens.confirm() + `<div class="r-overlay"><div class="r-sheet center"><div class="ring">${avatar(84)}</div><h2>Calling Maya…</h2><p>Turn your sound up so you can hear her.</p><div class="btns"><button class="r-btn ghost" ${go("confirm")}>Cancel</button></div></div></div>`,
  "no-answer": () => screens.confirm() + `<div class="r-overlay"><div class="r-sheet center">${`<div style="justify-self:center;filter:grayscale(1);opacity:.75">${avatar(84)}</div>`}<h2>Maya did not pick up.</h2><p>Try again in a minute. No minutes were used.</p><div class="btns"><button class="r-btn" ${go("connecting")}>${icon("phone", 20)}Call again</button><button class="r-btn ghost" ${go("confirm")}>Back to my page</button></div></div></div>`,
  lost: () => { const c = { ...CALL.reconnect, note: null }; return renderCall(c) + `<div class="r-overlay"><div class="r-sheet center"><div style="justify-self:center;filter:grayscale(1);opacity:.75">${avatar(84)}</div><h2>We could not get Maya back.</h2><p>Your work is still on the board. The time away did not use your minutes.</p><div class="btns"><button class="r-btn" ${go("connecting")}>${icon("phone", 20)}Call Maya again</button><button class="r-btn ghost" ${go("confirm")}>Back to my page</button></div></div></div>`; },
  "call-only": callOnly,
  "after-solved": () => after({ title: `Nice work, ${NAME}!`, line: "We finished 27 + 39 together.", paper: "Now write your answer on your page, next to number 4.", facts: ["18 minutes left this week.", "Your grown-up gets a short note about this call."], stage: 4, tag: "Call ended · 4 min", primary: ["Back to my page", "confirm-back"], secondary: ["Pick another question", "popup"] }),
  "after-stopped": () => after({ title: `Thanks for calling, ${NAME}.`, line: "You can go on with number 4 on your paper, or call Maya again.", facts: ["19 minutes left this week.", "Your grown-up gets a short note about this call."], stage: 2, tag: "Call ended · 3 min", primary: ["Back to my page", "confirm-back"], secondary: ["Call Maya again", "connecting"] }),
  "after-week": () => after({ title: `Thanks for calling, ${NAME}.`, line: "That was your last call this week. Maya is back on Monday, November 9.", paper: "You can keep going on your paper. Use what is on the board.", facts: ["Your grown-up gets a short note about this call."], stage: 2, tag: "Call ended · 8 min", primary: ["Back to my page", "desk-zero"], chat: "56 left today", calls: "Back on Monday" }),
  "confirm-back": () => deskFrame({ talk: bubble(`Hi ${NAME}! Which question are you on? Pick it from your page, or say it.`) + qCard(), foot: `<button class="r-btn" ${go("mic-ask")}>${icon("phone", 20)}Call Maya</button><button class="r-btn ghost" ${go("popup")}>${icon("page", 20)}Pick another question</button><p class="r-line">You have 18 minutes this week.</p>`, main: tabs("Call + board") + deskQuestionBoard(), headOpt: { calls: "18 min left this week" } }),
  "desk-zero": () => deskFrame({ headOpt: { calls: "Back on Monday" }, talk: bubble("You used your call minutes for this week. I'm back on Monday, November 9. You can still chat with me.") + qCard(), foot: `<button class="r-btn" ${go("chat")}>${icon("chat", 20)}Chat with Maya</button><button class="r-btn ghost" ${go("popup")}>${icon("page", 20)}Pick another question</button>`, main: tabs("Chat", ["Call", "Call + board"]) + deskQuestionBoard() }),
  "desk-soon": () => deskFrame({ headOpt: { calls: "Start soon", chat: null }, talk: bubble(`Hi ${NAME}! Which question are you on? Pick it from your page.`) + qCard(), foot: `<button class="r-btn" ${go("popup")}>${icon("page", 20)}Pick another question</button><p class="desk-soon">Chat and calls with Maya start soon.</p>`, main: tabs("Call + board", ["Chat", "Call", "Call + board"]) + deskQuestionBoard() }),
  "desk-off": () => deskFrame({ headOpt: { calls: "Off", chat: null }, talk: bubble(`Hi ${NAME}! Calls with me are off right now. Ask your grown-up to look at this. You can still see your pages here.`) + qCard(), foot: `<button class="r-btn" ${go("popup")}>${icon("page", 20)}Pick another question</button>`, main: `<div style="height:8px"></div>` + emptyBoard("", stageEl(0)) }),
  pin: () => screens["confirm-back"]() + `<div class="r-overlay"><div class="r-sheet"><h2 style="font:400 28px/1.15 var(--sans)">Leave the desk</h2><p>A grown-up enters the 4-digit PIN.</p><label for="pin" style="font:500 14px/1 var(--sans)">PIN</label><input id="pin" class="desk-pin" type="password" inputmode="numeric" maxlength="4" value="••"><div class="desk-dialog-btns"><button class="r-btn" style="flex:1" ${go("p-home")}>Leave the desk</button><button class="r-btn ghost" style="flex:1" ${go("confirm-back")}>Stay</button></div><a class="desk-forgot" href="#">Forgot the PIN?</a></div></div>`,
  "pin-call": () => renderCall(CALL.listening) + `<div class="r-overlay"><div class="r-sheet"><h2 style="font:400 28px/1.15 var(--sans)">Leave the desk</h2><p>A grown-up enters the 4-digit PIN. This ends the call with Maya.</p><label for="pin" style="font:500 14px/1 var(--sans)">PIN</label><input id="pin" class="desk-pin" type="password" inputmode="numeric" maxlength="4" value="••"><div class="desk-dialog-btns"><button class="r-btn" style="flex:1" ${go("p-home")}>End call and leave</button><button class="r-btn ghost" style="flex:1" ${go("listening")}>Stay</button></div><a class="desk-forgot" href="#">Forgot the PIN?</a></div></div>`,
  chat: () => deskFrame({ talk: bubble("Chat stays as it is today (#358).") + qCard(), foot: `<button class="r-btn" ${go("confirm")}>Back</button>`, main: tabs("Chat") + deskQuestionBoard() }),
  books: () => screens.pick(),
  // ---------- parent ----------
  "p-home": () => parentPage(tryCard("2 minutes left today") + notes()),
  "p-used": () => parentPage(tryUsed() + notes()),
  "p-ended": () => parentPage(`<div class="pd-card"><h3>Calls with Maya are off</h3><p>Maya stopped when ${NAME}'s plan ended on October 28. Your notes stay here. Restart the plan to turn calls on again.</p><div class="acts"><a class="r-btn sm" href="#" style="color:#fff">Restart the plan</a></div></div>` + notes(), { noWeek: true }),
  "p-failed": () => parentPage(`<div class="pd-card"><h3>Calls with Maya are off for now</h3><p>The last payment did not go through. ${NAME} can call Maya again when the card works.</p><div class="acts"><a class="r-btn sm" href="#" style="color:#fff">Update the card</a></div></div>` + notes(), { noWeek: true }),
  "try-mic": () => parentPage(tryCard("2 minutes left today") + notes()) + `<div class="r-overlay"><div class="r-sheet"><div class="who">${avatar(56)}<h2>Try Maya</h2></div><p>You talk with Maya on a sample question, the way ${NAME} would. Your browser will ask to use the microphone.</p><ul class="r-facts"><li>Up to 2 minutes a day.</li><li>It does not use ${NAME}'s minutes.</li><li>Nothing from this call goes in ${NAME}'s record.</li></ul><div class="btns"><button class="r-btn" ${go("try-call")}>${icon("phone", 20)}Start the sample call</button><button class="r-btn ghost" ${go("p-home")}>Not now</button></div></div></div>`,
  "try-call": () => tryCall({ maya: "talking", label: "Maya is talking", stage: 0, caption: "Hi, I'm Maya, an AI helper. Let's do this one: 27 + 39.", time: "1:48", left: "1:48 left today" }),
  "try-listen": () => tryCall({ maya: "listening", label: "Maya is listening", stage: 2, caption: LINES.tens, yours: true, time: "1:05", left: "1:05 left today" }),
  "try-closing": () => tryCall({ maya: "talking", label: "Maya is talking", stage: 2, caption: "We're almost out of time. Thanks for trying this with me.", time: "0:18", left: "0:18 left today", low: true, note: { sun: true, text: "18 seconds left today.", small: "Maya is saying goodbye." } }),
  "try-after": () => parentPage(`<div class="pd-after"><div class="pd-card try"><h3>That was Maya.</h3><p>${NAME}'s calls work the same way, on a question from ${NAME}'s own workbook. Up to 10 minutes a call and 30 minutes a week.</p><ul class="r-facts"><li>This call did not use ${NAME}'s minutes.</li><li>Nothing from this call went in ${NAME}'s record.</li><li>You used today's 2 minutes. You can try again tomorrow.</li></ul><div class="acts"><button class="pd-open" style="padding:0 16px" ${go("confirm-back")}>Open the desk →</button><a class="pd-link" href="#" ${go("p-used")}>Back to Maya</a></div></div></div>`, { noWeek: true, noNotes: true }),
};
function tryCard(left) { return `<div class="pd-card try"><h3>Try Maya yourself</h3><p>Call Maya on a sample question, so you know what ${NAME} hears. It does not use ${NAME}'s minutes, and nothing goes in ${NAME}'s record.</p><div class="acts"><button class="r-btn sm" ${go("try-mic")}>${icon("phone", 18)}Try Maya</button><span>${left}</span></div></div>`; }
function tryUsed() { return `<div class="pd-card try"><h3>Try Maya yourself</h3><p>You used today's 2 minutes. You can try again tomorrow.</p></div>`; }
function notes() { return `<h2>Notes from Maya</h2><div class="pd-card note"><div class="pd-note-head"><b>Call</b><span>Thursday, November 5 · 4:10 p.m. · 4 minutes</span></div><div style="display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center"><span class="pd-chip">Finished with help</span><span>Page 23, question 4</span></div><p class="ink">${NAME} got stuck on adding the ones and carrying.</p><p class="ink">Maya showed an easier example first. Then ${NAME} finished it.</p><p class="ink">${NAME} said the answer is on paper now.</p><div class="acts"><a class="pd-link" href="#">Read the call</a></div></div>`; }
function parentPage(body, o = {}) {
  const tabs = [["grid", "Overview"], ["chart", "Progress"], ["book", "Workbooks"], ["camera", "Scan pages"], ["chat", "Maya"], ["check", "Assessment"], ["user", "Account"]];
  const week = o.noWeek ? "" : `<div class="pd-card"><h3>Maya this week</h3><p>${NAME} used 12 of 30 minutes. 18 minutes left. The minutes start again on Monday, November 9.</p><p>${NAME} used 4 of 60 chat messages today. 56 left. Chat starts again at 12:00 a.m. on Friday, November 6.</p></div>`;
  return `<div class="pd-root" data-look="warm"><aside class="pd-side"><p class="pd-mark">Unica Learning<b></b></p><div class="pd-child"><i>L</i><div><b>${NAME}</b><span>Grade 3 · Workbook 1</span></div></div><button class="pd-open" ${go("confirm-back")}>Open the desk →</button><nav class="pd-tabs">${tabs.map(([i, l]) => `<a href="#" class="${l === "Maya" ? "on" : ""}">${icon(i, 19)}${l}</a>`).join("")}</nav></aside><main class="pd-main"><span class="pd-eyebrow">Maya</span><h1>${NAME}</h1>${week}${body}</main><nav class="pd-bottom">${[["grid", "Overview"], ["chart", "Progress"], ["camera", "Scan pages"], ["book", "Workbooks"], ["chat", "Maya"]].map(([i, l]) => `<a href="#" class="${l === "Maya" ? "on" : ""}">${icon(i, 21)}${l}</a>`).join("")}</nav></div>`;
}
function tryCall(c) {
  c = { ...c, pen: "maya" };
  const hang = "try-after";
  return `<div class="look-root b-root opt-b" data-look="warm" data-maya="${c.maya}">${topBar(`<span class="board-tag">Sample call · Not part of ${NAME}'s record</span>`).replace(`${NAME}'s desk`, "Try Maya")}<main class="b-main"><section class="desk-board"><header><h2>Our board</h2><p>${statusLine(c)}</p></header><div class="desk-board-body"><div class="desk-canvas" data-pen="maya">${stageEl(c.stage)}<div class="q-tile"><b>?</b><span>27 + 39<small>${narrow() ? "Sample" : "Sample question"}</small></span></div><div class="call-pill">${stateAvatar(34)}${wave(c.maya === "listening" ? "you" : "maya")}<time>${narrow() ? c.left.replace(" today", "") : c.left}</time><button class="hang" ${go(hang)} aria-label="Hang up">${icon("phone", 22)}</button></div>${overBoard(c)}</div></div></section></main><div class="b-foot"><div class="call-bar">${micBtn(c).replace('data-go="muted"', "").replace('data-go="listening"', "")}${whyBtn(c).replace('data-go="why"', "")}<button class="ctl take">${icon("pen", 18)}Take the pen</button></div></div></div>`;
}
function after(o) {
  const talk = `<div class="r-after"><h1>${o.title}</h1><p class="desk-bubble" style="max-width:none">${o.line}</p>${o.paper ? `<p class="r-paper">${icon("pen", 20)}${o.paper}</p>` : ""}${narrow() ? "" : qCard(true)}<ul class="r-facts">${o.facts.map((f) => `<li>${f}</li>`).join("")}</ul></div>`;
  const foot = `<button class="r-btn" ${go(o.primary[1])}>${o.primary[0]}</button>${o.secondary ? `<button class="r-btn ghost" ${go(o.secondary[1])}>${o.secondary[0]}</button>` : ""}`;
  return deskFrame({ headOpt: { sub: "Workbook 1 · Day 4", calls: o.calls || o.facts[0].replace(" minutes left this week.", " min left this week"), chat: o.chat || "56 left today" }, talk, foot, main: `${tabs("Call + board")}<section class="desk-board"><header><h2>Our board</h2><p>${o.tag}</p></header><div class="desk-board-body" style="grid-template-columns:minmax(0,1fr)"><div class="desk-canvas"><div class="r-stage" style="padding:16px"><!--saved-->${boardSvg(o.stage)}</div></div></div></section>` });
}
function device() {
  if (S.device) return S.device;
  return matchMedia("(max-width: 1100px)").matches ? "safari" : "chrome";
}
function micRefused(d) {
  const STEPS = {
    chrome: { url: `<span class="mark">${icon("grid", 15)}</span><span class="bar">unicalearning.com/tutor</span>`, steps: [`Click the small icon on the left of the web address.`, `Find <b>Microphone</b>. Choose <b>Allow</b>.`, `Come back here and press <b>Try again</b>.`] },
    safari: { url: `<span class="mark">aA</span><span class="bar">unicalearning.com</span>`, steps: [`Tap the <b>aA</b> button beside the web address.`, `Tap <b>Website Settings</b>.`, `Tap <b>Microphone</b>. Choose <b>Allow</b>.`, `Come back here and press <b>Try again</b>.`] },
    android: { url: `<span class="mark">${icon("grid", 15)}</span><span class="bar">unicalearning.com</span>`, steps: [`Tap the small icon beside the web address.`, `Tap <b>Permissions</b>. Turn on <b>Microphone</b>.`, `Come back here and press <b>Try again</b>.`] },
  }[d];
  return `<div class="r-overlay"><div class="r-sheet"><div class="who">${avatar(56)}<h2>Maya can't hear you yet.</h2></div><p>The microphone is turned off for this page. A grown-up can help you turn it on.</p><div class="r-url" aria-hidden="true">${STEPS.url}</div><ol class="r-steps">${STEPS.steps.map((s) => `<li><span>${s}</span></li>`).join("")}</ol><p style="font-size:14px">No minutes were used.</p><div class="btns"><button class="r-btn" ${go("connecting")}>Try again</button><button class="r-btn ghost" ${go("chat")}>${icon("chat", 20)}Chat with Maya instead</button></div></div></div>`;
}

// ---------- render ----------
function renderCall(c) { return S.opt === "b" ? optB(c) : S.opt === "c" ? optC(c) : optA(c); }
function render() {
  const app = document.getElementById("app");
  const st = S.state;
  const html = CALL[st] ? renderCall(CALL[st]) : (screens[st] || screens.pick)();
  app.innerHTML = html;
  document.documentElement.classList.toggle("still", S.still);
  document.title = `r337 · ${S.opt.toUpperCase()} · ${st}`;
  if (st === "connecting" && !S.still) setTimeout(() => S.state === "connecting" && set("talking"), 1800);
  if (CALL[st]?.pen === "child") wireInk();
  document.querySelectorAll(".in-call .desk-talk, .c-said").forEach((t) => { t.scrollTop = t.scrollHeight; });
  bar();
}
function set(state, push = true) {
  S.state = state;
  const q = new URLSearchParams(location.search); q.set("state", state); q.set("opt", S.opt);
  if (push) history.replaceState(null, "", "?" + q);
  render();
}
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-go]");
  if (el) { e.preventDefault(); set(el.dataset.go); }
});
addEventListener("resize", () => { clearTimeout(window.__r); window.__r = setTimeout(render, 120); });

// The child's pen: free drawing on the board, so the pen can be tried.
function wireInk() {
  const canvas = document.querySelector('.desk-canvas[data-pen="child"]');
  const svg = canvas?.querySelector("svg");
  if (!svg) return;
  let path = null;
  const at = (e) => { const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse()); return `${p.x.toFixed(1)} ${p.y.toFixed(1)}`; };
  svg.addEventListener("pointerdown", (e) => { path = document.createElementNS("http://www.w3.org/2000/svg", "path"); path.setAttribute("class", "r-draw"); path.setAttribute("stroke", "#0c0c0e"); path.setAttribute("stroke-width", "7"); path.style.strokeDashoffset = 0; path.style.strokeDasharray = "none"; path.style.animation = "none"; path.setAttribute("d", `M${at(e)}`); svg.appendChild(path); svg.setPointerCapture(e.pointerId); });
  svg.addEventListener("pointermove", (e) => { if (path) path.setAttribute("d", path.getAttribute("d") + `L${at(e)}`); });
  svg.addEventListener("pointerup", () => { path = null; });
}

// ---------- review bar (not part of the design) ----------
const GROUPS = {
  "Before the call": ["pick", "say", "say-miss", "popup", "confirm", "held", "mic-ask", "mic-refused", "mic-none", "connecting", "no-answer"],
  "The call": [...CALL_STATES, "call-only", "lost", "pin-call"],
  "After": ["after-solved", "after-stopped", "after-week", "confirm-back", "desk-zero", "pin"],
  "Others": ["desk-soon", "desk-off"],
  "Parent": ["p-home", "p-used", "p-ended", "p-failed", "try-mic", "try-call", "try-listen", "try-closing", "try-after"],
};
function bar() {
  document.querySelector(".rv")?.remove();
  if (S.bare) return;
  const d = document.createElement("div"); d.className = "rv";
  d.innerHTML = `<select id="rv-o" aria-label="Option">${["a", "b", "c"].map((o) => `<option value="${o}" ${o === S.opt ? "selected" : ""}>Option ${o.toUpperCase()}</option>`).join("")}</select><select id="rv-s" aria-label="Screen">${Object.entries(GROUPS).map(([g, l]) => `<optgroup label="${g}">${l.map((s) => `<option ${s === S.state ? "selected" : ""}>${s}</option>`).join("")}</optgroup>`).join("")}</select><a href="index.html">Board</a>`;
  document.body.appendChild(d);
  d.querySelector("#rv-o").onchange = (e) => { S.opt = e.target.value; set(S.state); };
  d.querySelector("#rv-s").onchange = (e) => set(e.target.value);
}
window.R337 = { set, S, GROUPS };
render();
