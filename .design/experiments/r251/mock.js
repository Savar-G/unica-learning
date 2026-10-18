// r251 mockup (#251, spec #249): Back, tappable progress steps and "Check your answers".
// Static markup that copies the real TakeTest DOM (test.tsx, test-progress.tsx, test-extra.tsx, whiteboard.tsx) and uses
// the real CSS. Open as mock.html?v=A&s=question. v: A | B | C. s: question | stress | grid | gridstress | intro | resume | extra.
(function () {
  const p = new URLSearchParams(location.search);
  const V = (p.get("v") || "A").toUpperCase();
  const S = p.get("s") || "question";

  // ---------- scenarios: the same content in every variant ----------
  const SC = {
    // Grade 1, 24 questions (12 + 12). Part 1 is locked. On screen: question 16, opened again; the newest is 19.
    question: { name: "Maya", n: 24, s1: 12, open: 2, answered: 18, now: 16, newest: 19, q: "choice" },
    // Grade 6, 42 questions (21 + 21): the most steps in one part. Part 1 open; on screen 9, the newest is 15.
    stress: { name: "Leo", n: 42, s1: 21, open: 1, answered: 14, now: 9, newest: 15, q: "number" },
    // The part 1 grid of a grade 1 child: every question of part 1 answered, nothing locked yet.
    grid: { name: "Maya", n: 24, s1: 12, open: 1, answered: 12, now: null, newest: null, grid: true },
    gridstress: { name: "Leo", n: 42, s1: 21, open: 1, answered: 21, now: null, newest: null, grid: true },
  };

  // Short prompts for variant C's grid cards (the start of each question, never the answer).
  const PROMPTS = ["How many dots?", "5 + 3 = ?", "Which is more: 14 or 41?", "Count by 2s: 2, 4, 6, ...", "Which shape has 3 sides?", "9 - 4 = ?", "What time does the clock show?", "Which number comes after 29?", "Mia has 6 apples ...", "10 + 10 = ?", "Which is the longest pencil?", "How many tens in 40?",
    "8 + 7 = ?", "Which coin is worth the most?", "Half of 10 is ...", "Which number is 10 more than 47?", "Tom has 12 cards ...", "Which group has more?", "Order these numbers", "15 - 6 = ?", "Which shape is a cube?", "Skip count by 5s", "Ben reads 3 books ...", "What comes next in the pattern?"];
  const PROMPTS_42 = Array.from({ length: 42 }, (_, i) => ["What is 3/4 of 24?", "Round 4,782 to the nearest hundred", "Which fraction is bigger?", "Solve: x + 7 = 15", "Area of a 6 by 4 rectangle", "0.6 as a fraction", "A bus has 48 seats ...", "Which angle is acute?"][i % 8]);

  const ICON = {
    speaker: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
    pencil: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l4-1 11-11-3-3L5 16l-1 4z"/><path d="M14 6l3 3"/></svg>',
    eraser: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 4l4 4-10 10H6l-2-2z"/><path d="M11 9l4 4"/></svg>',
    undo: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>',
    left: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="m11 18-6-6 6-6"/></svg>',
    right: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>',
  };

  // ---------- step state ----------
  // locked: a part the test has moved past (never tappable). later: not reached yet (not tappable).
  // done: answered, in the open part (tappable). now: on the screen. next: the newest question, not answered yet (tappable).
  function state(sc, i) {
    const part = i <= sc.s1 ? 1 : 2;
    if (part < sc.open) return "locked";
    if (part > sc.open) return "later";
    if (i === sc.now) return "now";
    if (i <= sc.answered) return "done";
    if (i === sc.newest) return "next";
    return "later";
  }
  const range = (a, b) => Array.from({ length: Math.max(0, b - a + 1) }, (_, k) => a + k);
  const partRange = (sc, part) => (part === 1 ? range(1, sc.s1) : range(sc.s1 + 1, sc.n));
  const label = (st, i) => ({ done: `Question ${i}, answered. Tap to look again.`, now: `Question ${i}, on screen now`, next: `Question ${i}, not answered yet` }[st]);

  // Today's read-only bar (test-progress.tsx), for variants B and C.
  function todayBar(sc) {
    const seg = (i) => { const st = state(sc, i); const cls = st === "now" ? "is-now" : st === "done" || st === "locked" ? "is-done" : ""; return `<span class="${cls}"></span>`; };
    const ring = sc.open === 2 ? "is-done" : "";
    return `<div class="test-progress"><div class="test-progress-bar" role="progressbar" aria-label="Test progress">
      <div class="test-progress-seg" aria-hidden="true">${range(1, sc.s1).map(seg).join("")}</div>
      <span class="test-progress-ring ${ring}" aria-hidden="true"></span>
      <div class="test-progress-seg" aria-hidden="true">${range(sc.s1 + 1, sc.n).map(seg).join("")}</div>
    </div><span class="test-progress-count" aria-hidden="true">${count(sc)}</span></div>`;
  }
  const count = (sc) => (sc.grid ? "Check" : `${sc.now} of ${sc.n}`);

  // A: the bar itself. The open part grows into numbered steps; the other parts shrink to thin bars.
  function barA(sc) {
    const part = (n) => {
      const ids = partRange(sc, n);
      if (n !== sc.open) return `<div class="za-thin ${n < sc.open ? "is-locked" : ""}" aria-hidden="true">${ids.map(() => "<span></span>").join("")}</div>`;
      return `<div class="za-open ${ids.length > 12 ? "is-many" : ""}">${ids.map((i) => step(sc, i, "za-step")).join("")}</div>`;
    };
    const ring = sc.open === 2 ? "is-done" : "";
    return `<nav class="za-bar" aria-label="Questions">${part(1)}<span class="test-progress-ring ${ring}" aria-hidden="true"></span>${part(2)}</nav>
      <span class="test-progress-count">${count(sc)}</span>`;
  }
  function step(sc, i, cls) {
    const st = state(sc, i);
    if (st === "later") return `<span class="${cls} is-later" aria-hidden="true"></span>`;
    return `<button type="button" class="${cls} is-${st}" aria-label="${label(st, i)}"${st === "now" ? ' aria-current="step"' : ""}>${i}</button>`;
  }

  // B: a row of round number steps under the bar, for the open part only.
  function rowB(sc) {
    const ids = partRange(sc, sc.open);
    return `<nav class="zb-row" aria-label="Questions in part ${sc.open}"><div class="zb-in">
      <span class="zb-part">Part ${sc.open}</span>${ids.map((i) => step(sc, i, "zb-step")).join("")}</div></nav>`;
  }

  // C: a block of number tiles above Back and Next, in the question pane.
  function mapC(sc) {
    const ids = partRange(sc, sc.open);
    return `<nav class="zc-map" aria-label="Questions in part ${sc.open}"><p class="zc-map-label">Part ${sc.open}: tap a number to look again</p>
      <div class="zc-tiles">${ids.map((i) => step(sc, i, "zc-step")).join("")}</div></nav>`;
  }

  // ---------- Back and Next ----------
  function nextRow(sc) {
    const first = sc.now === partRange(sc, sc.open)[0];
    const back = first ? "" : {
      A: `<button type="button" class="btn ghost">Back</button>`,
      B: `<button type="button" class="btn ghost zb-back">${ICON.left}<span>Back</span></button>`,
      C: `<button type="button" class="btn ghost zc-back" aria-label="Back">${ICON.left}</button>`,
    }[V];
    const next = V === "B" ? `<button type="submit" class="btn zb-next"><span>Next</span>${ICON.right}</button>` : `<button type="submit" class="btn">Next</button>`;
    return `<div class="test-next">${back}${next}</div>`;
  }

  // ---------- whiteboard (whiteboard.tsx), with the child's work back on the board ----------
  function board(sc, typing) {
    const work = sc.q === "choice"
      ? `<svg class="mk-ink" viewBox="0 0 600 420" preserveAspectRatio="xMinYMin meet" aria-hidden="true">
          <text x="40" y="90">47 + 10</text>
          <path d="M40 170 H520" /><path d="M60 158 v24 M160 158 v24 M260 158 v24 M360 158 v24 M460 158 v24" />
          <text x="40" y="225" class="sm">47</text><text x="440" y="225" class="sm">57</text>
          <path d="M70 150 C 180 70, 330 70, 450 150" /><path d="M440 138 l12 14 -18 2" />
          <text x="40" y="320">= 57</text></svg>`
      : `<svg class="mk-ink" viewBox="0 0 600 420" preserveAspectRatio="xMinYMin meet" aria-hidden="true">
          <text x="40" y="90">24 ÷ 4 = 6</text><text x="40" y="180">6 × 3 = 18</text></svg>`;
    return `<section class="wb" data-mode="draw" aria-label="Whiteboard">
      <div class="wb-head"><h2>My work</h2><p>Use it if it helps</p></div>
      <div class="wb-body"><div class="wb-surface">${work}</div>
        <div class="wb-rail" role="toolbar">
          ${typing ? `<div class="wb-modes"><button type="button" aria-pressed="true">${ICON.pencil} Draw</button><button type="button" aria-pressed="false"><span class="wb-aa">Aa</span> Type</button></div>` : ""}
          <div class="wb-tools"><button class="wb-tool" aria-pressed="true">${ICON.pencil}</button><button class="wb-tool">${ICON.eraser}</button><button class="wb-tool">${ICON.undo}</button><button class="wb-tool wb-clear">Clear</button></div>
        </div></div></section>`;
  }

  // ---------- screens ----------
  function question(sc) {
    const prompt = sc.q === "choice" ? "Which number is 10 more than 47?" : "What is 3/4 of 24?";
    const answer = sc.q === "choice"
      ? `<div class="test-choices" role="radiogroup">${["37", "48", "57", "147"].map((c) => `<button type="button" role="radio" class="test-choice" aria-checked="${c === "57"}"><span class="test-dot"></span>${c}</button>`).join("")}</div>`
      : `<div class="test-num"><output class="test-display">18</output><div class="test-pad">${["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"].map((k) => `<button type="button">${k}</button>`).join("")}</div></div>`;
    return `<form class="test-split test-desk">
      <div class="test-pane test-pane-l">
        <div class="test-qrow"><button type="button" class="test-read" aria-label="Read it to me">${ICON.speaker}</button><h1 class="test-prompt">${prompt}</h1></div>
        <div class="test-response">${answer}${V === "C" ? mapC(sc) : ""}${nextRow(sc)}</div>
      </div>
      <div class="test-pane test-pane-r">${board(sc, sc.q === "number")}</div>
    </form>`;
  }

  function grid(sc) {
    const ids = partRange(sc, 1);
    const prompts = sc.n === 42 ? PROMPTS_42 : PROMPTS;
    const words = `<p class="test-kicker">Part 1 · ${ids.length} questions</p>
      <h1 class="test-title">Check your answers, ${sc.name}.</h1>
      <p class="test-lead">${V === "C" ? "Tap a question to look at it again. You can change your answer." : "Tap a number to look at that question again. You can change your answer."}</p>`;
    const done = `<p class="test-intro-note">When you press Done checking, part 1 is finished. Then you get a break.</p>`;
    const btn = `<button type="button" class="btn">Done checking</button>`;
    if (V === "A") {
      return `<section class="test-split za-check"><div class="test-pane test-pane-l is-msg">${words}${done}${btn}</div>
        <div class="test-pane test-pane-r test-field"><div class="za-tiles ${ids.length > 12 ? "is-many" : ""}">${ids.map((i) => `<button type="button" class="za-tile" aria-label="Question ${i}, answered"><b>${i}</b><span class="za-tick">Answered</span></button>`).join("")}</div></div></section>`;
    }
    if (V === "B") {
      return `<section class="zb-check"><div class="zb-check-in">${words}
        <div class="zb-tiles ${ids.length > 12 ? "is-many" : ""}">${ids.map((i) => `<button type="button" class="zb-tile" aria-label="Question ${i}, answered">${i}</button>`).join("")}</div>
        <div class="zb-check-foot">${done}${btn}</div></div></section>`;
    }
    return `<section class="test-split zc-check"><div class="test-pane test-pane-l">${words}
        <div class="zc-cards ${ids.length > 12 ? "is-many" : ""}">${ids.map((i) => `<button type="button" class="zc-card" aria-label="Question ${i}, answered: ${prompts[i - 1]}"><b>${i}</b><span>${prompts[i - 1]}</span></button>`).join("")}</div>
        <div class="zc-check-foot">${done}${btn}</div></div>
      <div class="test-pane test-pane-r test-field" aria-hidden="true"></div></section>`;
  }

  // The intro copy (replaces "You cannot go back").
  const COPY = {
    A: {
      start: `<p class="test-intro-note">Answer one question at a time. Until the break, you can go back and change an answer. If you do not know an answer, make your best guess.</p>`,
      resume: `<p class="test-intro-note">Your answers are saved. You go on from the question where you stopped. You can go back and change an answer until the end of the test.</p>`,
      extra: `<p class="test-intro-note">Answer one question at a time. You can go back and change an answer until you finish the extra questions.</p>`,
      rule: "", ruleExtra: "",
    },
    B: {
      start: `<p class="test-intro-note">Answer one question at a time. If you do not know an answer, make your best guess.</p>`,
      resume: `<p class="test-intro-note">Your answers are saved. You go on from the question where you stopped.</p>`,
      extra: `<p class="test-intro-note">Answer one question at a time.</p>`,
      rule: `<li><b>You can go back.</b> Press Back, or tap a number at the top, to change an answer. You can do this until the break.</li>`,
      ruleResume: `<li><b>You can go back.</b> Press Back, or tap a number at the top, to change an answer. You can do this until the end of the test.</li>`,
      ruleExtra: `<li><b>You can go back.</b> Press Back, or tap a number at the top, to change an answer. You can do this until you finish.</li>`,
    },
    C: {
      start: `<p class="test-intro-note">Made a mistake? Press Back to fix it. You can change your answers until the break. If you do not know an answer, make your best guess.</p>`,
      resume: `<p class="test-intro-note">Your answers are saved. You go on from the question where you stopped. Made a mistake? Press Back to fix it. You can change your answers until the end of the test.</p>`,
      extra: `<p class="test-intro-note">Made a mistake? Press Back to fix it. You can change your answers until you finish the extra questions.</p>`,
      rule: "", ruleExtra: "",
    },
  }[V];

  function intro(kind) {
    const extra = kind === "extra";
    const title = extra ? "Hi Maya! Here are 8 more questions." : kind === "resume" ? "Welcome back, Maya! Before you go on:" : "Hi Maya! Before you start:";
    const rules = `<li><b>No calculator.</b> Work the answers out yourself.</li>
      <li><b>No help from a parent.</b> Do the ${extra ? "questions" : "test"} on your own. Grown-ups, please let your child work alone.</li>
      <li><b>Scrap paper is fine.</b> Work things out on paper or on the whiteboard, if it helps. We only need your answers.</li>
      ${extra ? COPY.ruleExtra || "" : kind === "resume" ? COPY.ruleResume || COPY.rule : COPY.rule}`;
    return `<section class="test-split test-intro"><div class="test-pane test-pane-l is-msg">
      <p class="test-kicker">${extra ? "Extra questions" : "Math test"}</p>
      <h1 class="test-title">${title}</h1>
      <ul class="test-rules">${rules}</ul>
      ${extra ? COPY.extra : kind === "resume" ? COPY.resume : COPY.start}
      <button type="button" class="btn">${extra ? "Start" : kind === "resume" ? "Continue the test" : "Start the test"}</button>
    </div><div class="test-pane test-pane-r test-field" aria-hidden="true"></div></section>`;
  }

  // ---------- page ----------
  const sc = SC[S];
  let top = "", sub = "", main;
  if (sc) {
    top = V === "A" ? barA(sc) : todayBar(sc);
    // On the grid screen the grid is the way to jump, so B leaves its row out there.
    if (V === "B" && !sc.grid) sub = rowB(sc);
    main = sc.grid ? grid(sc) : question(sc);
  } else {
    main = intro(S);
  }
  document.getElementById("app").innerHTML = `<div class="look-root test-root v-${V}" data-look="warm">
    <header class="test-top"><span class="logo">Unica Learning<b></b></span>${top}</header>${sub}
    <main id="main" class="test-main">${main}</main>
    <span class="mk-tag">r251 · ${V} · ${S}</span>
  </div>`;
  // B: when the row is wider than the screen, it scrolls; keep the step on screen in view and fade the cut edge.
  const row = document.querySelector(".zb-row");
  if (row && row.scrollWidth > row.clientWidth + 1) {
    row.classList.add("is-cut");
    const now = row.querySelector(".is-now");
    if (now) row.scrollLeft = Math.max(0, now.offsetLeft - row.clientWidth / 2);
  }
  // Measure: the smallest tappable step and tile, written to <body data-min> (read with --dump-dom).
  const sizes = [...document.querySelectorAll("button[class*='-step'], button[class*='-tile'], button[class*='-card']")].map((b) => b.getBoundingClientRect());
  if (sizes.length) document.body.dataset.min = `${Math.round(Math.min(...sizes.map((r) => r.width)))}x${Math.round(Math.min(...sizes.map((r) => r.height)))}`;
})();
