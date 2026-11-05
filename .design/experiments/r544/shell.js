// Round r544: renders every option of both sets from one place, so content, tokens and states stay identical and only
// the option's axis changes. The page sets <html data-set="pre|phone" data-opt="a|b|c">; the address hash picks the
// stage (set 1) or the phone state (set 2). Static: no network, no build. Report markup: report-data.js.
(function () {
  const root = document.documentElement;
  const SET = root.dataset.set;
  const OPT = root.dataset.opt;
  const R = window.REPORT;
  // The state: the address hash, or window.__STATE for an inlined copy of the page.
  const hash = () => window.__STATE || location.hash.slice(1);

  const I = {
    overview: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></svg>',
    progress: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3.5 19.5h17"/><path d="M5 15.5l4.5-4.5 3.5 3 6-6.5"/><path d="M15 7.5h4v4"/></svg>',
    scan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.8l1.4-2h4.6l1.4 2h1.8A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.5" r="3.5"/></svg>',
    workbooks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5v13c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5z"/><path d="M12 6v13"/></svg>',
    maya: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-7l-4.5 3.5v-3.5H5A1.5 1.5 0 0 1 3.5 15V7A1.5 1.5 0 0 1 5 5.5z"/></svg>',
    assessment: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="5" y="4.5" width="14" height="16" rx="2"/><path d="M9 4.5V3.5h6v1"/><path d="M8.5 12.5l2.2 2.2 4.8-4.8"/></svg>',
    account: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5.5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18.5" cy="12" r="1.7"/></svg>',
    chev: '<svg class="chev" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M7 10l5 5 5-5"/></svg>',
    go: '<svg class="go" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  };
  const TAB = {
    overview: "Overview", progress: "Progress", workbooks: "Workbooks", scan: "Scan pages", maya: "Maya", assessment: "Assessment", account: "Account",
  };
  const NAME = "Leah";
  const arr = ' <span class="arr" aria-hidden="true">→</span>';

  // ---------- shared pieces ----------
  const kidBlock = ({ sub, many }) => `${many ? '<button type="button" class="kid" aria-label="Switch child: Leah selected">' : '<div class="kid">'}
      <span class="kid-av" aria-hidden="true">L</span><span class="kid-t"><b>${NAME}</b><span>${sub}</span></span>${many ? I.chev + "</button>" : "</div>"}`;

  const sideNav = (tabs, current) => `<nav class="dash-nav" aria-label="Dashboard">${tabs
    .map((t) => `<a href="#" ${t === current ? 'aria-current="page"' : ""}>${I[t]}${TAB[t]}</a>`)
    .join("")}</nav>`;

  function sidebar({ tabs, current, sub, many, desk, foot }) {
    return `<aside class="dash-side">
      <a class="logo" href="#">Unica Learning<b></b></a>
      ${kidBlock({ sub, many })}
      ${desk ? '<button type="button" class="btn sm desk-btn">Open the desk' + arr + "</button>" : ""}
      ${sideNav(tabs, current)}
      <div class="side-foot">${foot || ""}<a href="#">Sign out</a></div>
    </aside>`;
  }

  const reportWrap = (inner) => `<div class="support-page support-wide"><article class="rpt" aria-labelledby="rpt-title">${inner.replace(/^<article[^>]*>/, "")}</article></div>`;

  // ---------- set 1: pre-trial stages ----------
  const STAGES = {
    no_test: "No test yet",
    test_running: "Test open",
    test_waiting: "Test done, report being made",
    report_ready_bc: "Report ready, BC",
    report_ready_waitlist: "Report ready, outside BC",
  };
  const PRE_TABS = ["assessment", "account"];

  // The words of each stage's one action, shared by all three options.
  const ACTION = {
    no_test: {
      k: "Next step", h: `Start ${NAME}'s free math test`,
      p: `${NAME} takes the test alone, on this device, in one sitting. Start when ${NAME} is ready.`,
      btn: "Start test", note: "Your child takes the test on a laptop or tablet.",
      phone: { h: "Use a laptop or tablet for the test.", p: "A phone screen is too small for the test. We email you a sign-in link: open it on the laptop or tablet, and it opens your child's start screen. The link works once and only for 24 hours.", btn: "Email me the link", ghost: true },
    },
    test_running: {
      k: "Next step", h: `${NAME}'s test is open`,
      p: `The answers are saved. ${NAME} can continue until 4:30 p.m. on Thursday, November 5.`,
      btn: "Continue test", note: "Your child takes the test on a laptop or tablet.",
      phone: { h: `${NAME}'s test is open`, p: `The answers are saved. ${NAME} can continue until 4:30 p.m. on Thursday, November 5, on the laptop or tablet.`, btn: "Email me the link", ghost: true },
    },
    test_waiting: {
      k: "Report", h: `${NAME} finished the test`,
      p: "The report comes by email, within minutes. It also opens here when it is ready.",
      btn: null, note: null,
    },
    report_ready_bc: {
      k: "Next step", h: `Start ${NAME}'s free month`,
      p: "Math is CAD 79.99 a month, delivery included. The first month is free, starting when the first workbook arrives at your home. Cancel anytime.",
      btn: "Start free month", note: "You add your card and shipping address on a secure payment page. Nothing is charged today.",
    },
    report_ready_waitlist: {
      k: "Next step", h: "Books for the Ontario curriculum are coming",
      p: `Join the waitlist and we will email you when they are ready. ${NAME}'s report stays in your account.`,
      btn: "Join the waitlist", note: null,
    },
  };
  const isReport = (s) => s === "report_ready_bc" || s === "report_ready_waitlist";
  const rep = (s) => (s === "report_ready_waitlist" ? R.wait : R.bc);

  const head = (s) => {
    const t = isReport(s)
      ? { h: `${NAME}'s report`, sub: "Finished on October 5, 2026. The next test opens at 4:12 p.m. on November 4." }
      : s === "no_test" ? { h: `${NAME}'s math test`, sub: "Free. The report shows the level Leah works at and the skills to work on next." }
      : s === "test_running" ? { h: `${NAME}'s math test`, sub: "Started today at 4:30 p.m." }
      : { h: `${NAME}'s math test`, sub: "Finished today at 5:08 p.m." };
    return `<header class="pg-head"><div><p class="eyebrow">Assessment</p><h1>${t.h}</h1><p class="pg-sub">${t.sub}</p></div>${isReport(s) ? '<span class="sample">Sample data</span>' : ""}</header>`;
  };

  // The action block. `place` styles it per option; the words never change.
  function action(s, place, phone) {
    const a = phone && ACTION[s].phone ? { ...ACTION[s], ...ACTION[s].phone } : ACTION[s];
    const button = a.btn ? `<button type="button" class="btn${a.ghost ? " ghost" : ""}${place === "rail" || place === "panel" ? " wide" : ""}">${a.btn}${a.ghost ? "" : arr}</button>` : "";
    const wait = s === "test_waiting" ? '<p class="wait-line"><span class="status-dot is-wait" aria-hidden="true"></span>Making the report</p>' : "";
    return `<section class="pd-nx pd-nx-${place}" aria-labelledby="pd-nx-${place}">
      <div class="pd-nx-t"><p class="k">${a.k}</p><h2 id="pd-nx-${place}">${a.h}</h2><p>${a.p}</p>${wait}</div>
      ${button || a.note ? `<div class="pd-nx-go">${button}${a.note ? `<p class="small">${a.note}</p>` : ""}</div>` : ""}
    </section>`;
  }

  // What happens after the button (rail and panel only): facts from DESIGN.md, D-144.
  const after = (s) => s !== "report_ready_bc" ? "" : `<div class="pd-nx-after"><p class="k">What happens next</p><ol class="pd-steps">
      <li><span><b>We make Workbook 1</b><span>From this report, for ${NAME} only.</span></span></li>
      <li><span><b>We mail it to your home</b><span>Delivery is included.</span></span></li>
      <li><span><b>The free month starts when it arrives</b><span>We email you before the first charge.</span></span></li>
    </ol></div>`;

  const learnLink = (s) => s === "report_ready_bc" ? `<p class="small pd-nx-learn"><a href="#">Tell us how ${NAME} learns</a> (optional, for Workbook 1)</p>` : "";

  // The report's own Next step row, at the end of the report, in the same words.
  const nextRow = (s) => `<section class="rpt-row" aria-labelledby="rpt-next"><div class="rpt-row-h"><h2 id="rpt-next">Next step</h2></div><div class="rpt-row-c">
      <div class="rpt-next is-card"><h3>${ACTION[s].h}</h3><p>${ACTION[s].p}</p><div class="rpt-plans"><button class="btn" type="button">${ACTION[s].btn}${arr}</button></div>${s === "report_ready_bc" ? '<p class="rpt-small">You add your card and shipping address on a secure payment page. We use the address to ship your workbook.</p>' : ""}</div>
      ${R.call}</div></section>`;

  // Before the report: the three steps of /start, then a link to the sample report.
  const testInfo = (s) => {
    if (s === "no_test") return `<section class="pd-card info"><h2>How it works</h2><ol class="pd-steps" style="margin-top:16px">
        <li><span><b>${NAME} takes the test</b><span>On a laptop or tablet, alone, in one sitting.</span></span></li>
        <li><span><b>You get the report</b><span>By email, within minutes. It shows ${NAME}'s math level and the gaps to work on.</span></span></li>
        <li><span><b>You choose what comes next</b><span>For the BC curriculum, start the free month from the report. Nothing is charged until the first workbook arrives at your home.</span></span></li>
      </ol><p class="small" style="margin-top:18px"><a href="#">See a sample report →</a></p></section>`;
    if (s === "test_running") return `<section class="pd-card info"><h2>While the test is open</h2><ol class="pd-steps" style="margin-top:16px">
        <li><span><b>The answers are saved</b><span>${NAME} can stop and continue later, until the time above.</span></span></li>
        <li><span><b>It closes after 24 hours</b><span>A test that is not finished by then closes. The new test has new questions.</span></span></li>
      </ol></section>`;
    return `<section class="pd-card info"><h2>What the report shows</h2><p class="muted" style="margin-top:10px">The level ${NAME} works at, each area of math, the topics ${NAME} has secure and the ones to work on, with one of ${NAME}'s answers for each.</p><p class="small" style="margin-top:14px"><a href="#">See a sample report →</a></p></section>`;
  };

  function preMain(s, phone) {
    const r = rep(s);
    if (OPT === "a") {
      // A: the action card above the report; the report's own Next step at the end says the same.
      const body = isReport(s) ? reportWrap(r.body + nextRow(s) + r.meta) : testInfo(s);
      return head(s) + action(s, "strip", phone) + `<div class="below">${body}</div>`;
    }
    if (OPT === "b") {
      // B: the report in the main column, the action in a rail that stays in view (a bar at the bottom on a phone).
      const body = isReport(s) ? reportWrap(r.body + nextRow(s) + r.meta) : testInfo(s);
      return head(s) + `<div class="split"><div class="split-main">${body}</div><aside class="split-rail" aria-label="Next step">${action(s, "rail", phone)}${after(s)}${learnLink(s)}</aside></div>`;
    }
    // C: the result and the action in one first screen; the rest of the report opens below.
    if (!isReport(s)) return head(s) + `<div class="pd-focus">${action(s, "panel", phone)}${testInfo(s)}</div>`;
    const rest = r.body.replace(r.head, "").replace(r.overall, "");
    return head(s) + `<div class="pd-sum">${reportWrap(r.overall)}<div class="pd-sum-side">${action(s, "panel", phone)}${after(s)}</div></div>
      <details class="full" ${hash().includes("open") ? "open" : ""}><summary><span>Read the full report</span><span class="small">By area, strengths, to work on, number facts and how we help</span></summary>${reportWrap(r.head + rest + nextRow(s) + r.meta)}</details>`;
  }

  function renderPre() {
    const s = (hash().split("&")[0] || "report_ready_bc");
    const stage = STAGES[s] ? s : "report_ready_bc";
    const phone = matchMedia("(max-width: 899px)").matches;
    const sticky = OPT === "b" && phone && isReport(stage);
    document.body.innerHTML = `<div class="dash opt-${OPT}${sticky ? " has-sticky" : ""}" data-look="warm" data-stage="${stage}">
      ${sidebar({ tabs: PRE_TABS, current: "assessment", sub: stage === "report_ready_waitlist" ? "Grade 3 · Ontario" : "Grade 3 · BC", many: false, foot: isReport(stage) ? '<span class="sample">Sample data</span><span>The report is the sample report.</span>' : "" })}
      <header class="ph-top"><a class="logo" href="#">Unica Learning<b></b></a><span class="sp"></span><a class="ph-link" href="#">${I.account}Account</a></header>
      <main class="dash-main">${preMain(stage, phone)}</main>
      ${sticky ? `<div class="ph-sticky"><button type="button" class="btn">${ACTION[stage].btn}${arr}</button>${stage === "report_ready_bc" ? "<p>Nothing is charged today. The free month starts when the first workbook arrives.</p>" : ""}</div>` : ""}
    </div>`;
  }

  // ---------- set 2: phone navigation (desktop stays the mock's sidebar) ----------
  const ALL_TABS = ["overview", "progress", "workbooks", "scan", "maya", "assessment", "account"];
  const TODAY_TABS = ["overview", "workbooks", "assessment", "account"];

  const tiles = (today) => today
    ? `<div class="pd-tiles">
        <div class="pd-tile"><p class="k">Level</p><p class="v">Working at Grade 3</p><p class="d">In Grade 3</p></div>
        <div class="pd-tile"><p class="k">This workbook</p><p class="v">Workbook 1</p><p class="d">Being made. We email you when it ships.</p></div>
      </div>`
    : `<div class="pd-tiles">
        <div class="pd-tile"><p class="k">Level</p><p class="v">Working at Grade 3</p><p class="d">In Grade 3</p></div>
        <div class="pd-tile"><p class="k">Skills mastered</p><p class="v">12 of 31</p><p class="d">At this level, 3 more this month</p></div>
        <div class="pd-tile"><p class="k">This workbook</p><p class="v">Workbook 3</p><p class="d">7 of 10 days scanned</p></div>
        <div class="pd-tile"><p class="k">Maya this week</p><p class="v">2 calls</p><p class="d">12 of 30 minutes</p></div>
      </div>`;

  // Area bars on a K to grade 5 axis; the line marks the school grade (3).
  const BARS = [
    ["Number and operations", "At grade", "at", 3],
    ["Fractions and decimals", "Building up", "build", 2],
    ["Patterns and algebra", "Ahead", "ahead", 4],
    ["Shapes, measurement and data", "Early sign", "early", 3],
  ];
  const pct = (g) => ((g + 0.5) / 6) * 100;
  const bars = () => `<section class="pd-card areas-card" aria-labelledby="areas-h"><h2 id="areas-h">Level by area</h2><p class="small" style="margin-top:6px">From the test. The line marks ${NAME}'s school grade.</p>
      <div class="bars">${BARS.map(([n, l, c, g]) => `<div class="bar-row"><div><b>${n}</b><span class="lab is-${c}">${l}</span></div><div class="track" role="img" aria-label="${n}: grade ${g}, ${l}"><i class="is-${c}" style="width:${pct(g)}%"></i><span class="line" style="left:${pct(3)}%"></span></div></div>`).join("")}
      <div class="axis"><span></span><span class="ticks"><span>K</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span></span></div></div></section>`;

  const actionCard = (today) => today
    ? `<section class="act" aria-label="To do"><div><b>Tell us how ${NAME} learns</b><span class="small">A few questions about how ${NAME} learns. Workbook 1 uses the answers.</span></div><a class="btn ghost" href="#">Answer the questions</a></section>`
    : `<section class="act" aria-label="To do"><div><b>Pages to scan</b><span class="small">No pages scanned for 4 days. Scan ${NAME}'s finished pages so we can make the next book.</span></div><a class="btn" href="#">Scan pages${arr}</a></section>`;

  const overview = (today) => `<header class="pg-head"><div><p class="eyebrow">Overview</p><h1>Where ${NAME} is now</h1><p class="pg-sub">${today ? "From the test on October 5." : "Updated after the scan on Friday, October 30."}</p></div><span class="sample">Sample data</span></header>
      ${tiles(today)}${bars()}${actionCard(today)}`;

  // The bottom bar for each option. More is the fifth item when there are more than five tabs.
  function barItems(today) {
    if (!today) return ["overview", "progress", "scan", "workbooks", "more"];
    if (OPT === "a") return ["overview", "workbooks", "assessment", "account"];
    if (OPT === "b") return ["overview", "workbooks", "assessment", "more"];
    return ["overview", "workbooks", "assessment"];
  }
  const barLabel = (t) => (t === "more" ? "More" : TAB[t]);
  const bar = (items, current, moreOpen) => `<nav class="ph-bar" aria-label="Dashboard">${items
    .map((t) => `<a href="#${t === "more" ? (OPT === "b" ? "more" : "more") : "overview"}" ${t === current ? 'aria-current="page"' : ""} ${t === "more" && OPT !== "b" ? `aria-expanded="${moreOpen}" aria-haspopup="true"` : ""}>${I[t]}<span>${barLabel(t)}</span></a>`)
    .join("")}</nav>`;

  const moreRows = (tabs) => `<ul class="more-list">${tabs.map((t) => `<li><a href="#">${I[t]}<span class="pd-t"><b>${TAB[t]}</b><span>${{
      maya: "Minutes left this week and a note per call",
      assessment: "Leah's report and older tests",
      account: "Plans and invoices, card, children, password and PIN",
    }[t]}</span></span>${I.go}</a></li>`).join("")}</ul>`;

  function phoneTop() {
    if (OPT === "c") {
      return `<header class="ph-top"><button type="button" class="ph-link" aria-label="Switch child: Leah selected"><span class="kid-av" aria-hidden="true">L</span>${NAME}${I.chev}</button><span class="sp"></span><a class="ph-link" href="#" aria-label="Account">${I.account}Account</a></header>`;
    }
    return `<header class="ph-top"><a class="logo" href="#">Unica Learning<b></b></a></header>`;
  }

  const phKid = (today) => OPT === "c"
    ? (today ? "" : `<div class="ph-kid"><span class="small" style="flex:1">${NAME} · Grade 3 · Workbook 3</span><button type="button" class="btn">Open the desk${arr}</button></div>`)
    : `<div class="ph-kid">${kidBlock({ sub: today ? "Grade 3" : "Grade 3 · Workbook 3", many: true })}${today ? "" : `<button type="button" class="btn">Open the desk${arr}</button>`}</div>`;

  function morePage() {
    return `<div class="more-page"><header class="pg-head"><div><p class="eyebrow">More</p><h1>${NAME} and your family</h1></div></header>
      <div class="kids">
        <div class="kid-card is-on">${kidBlock({ sub: "Grade 3 · Workbook 3", many: false })}<button type="button" class="btn sm">Open the desk${arr}</button></div>
        <div class="kid-card"><div class="kid"><span class="kid-av is-sky" aria-hidden="true">S</span><span class="kid-t"><b>Sam</b><span>Grade 1</span></span></div><a class="small" href="#" style="margin-left:auto">Switch to Sam</a></div>
      </div>
      <h2>${NAME}</h2>${moreRows(["maya", "assessment"])}
      <h2>Family account</h2><ul class="more-list">${[
        ["Plans and invoices", "Next charge, receipts"], ["Card", "Update the card"], ["Pause or cancel", "Whole weeks, up to 8 a year"],
        ["Children", "Names, learning cards, add a child"], ["Password, PIN and time zone", ""], ["Delete", "One child or the whole family"],
      ].map(([t, d]) => `<li><a href="#">${I.account}<span class="pd-t"><b>${t}</b>${d ? `<span>${d}</span>` : ""}</span>${I.go}</a></li>`).join("")}
      <li><a href="#"><span class="pd-t"><b>Sign out</b></span></a></li></ul></div>`;
  }

  function renderPhone() {
    const st = hash() || "overview";
    const today = st === "today";
    const moreOpen = st === "more";
    const items = barItems(today);
    let main = overview(today);
    let current = "overview";
    if (OPT === "b" && moreOpen) { main = morePage(); current = "more"; }
    const sheet = moreOpen && OPT === "a"
      ? `<div class="ph-scrim is-open"></div><div class="ph-sheet is-open" role="dialog" aria-label="More"><div class="grab"></div><h2>More</h2>${moreRows(["maya", "assessment", "account"])}</div>`
      : moreOpen && OPT === "c"
        ? `<div class="ph-scrim is-open" style="background:transparent"></div><div class="ph-menu is-open" role="menu" aria-label="More">${moreRows(["maya", "assessment"])}</div>`
        : "";
    const tabs = today ? TODAY_TABS : ALL_TABS;
    document.body.innerHTML = `<div class="dash has-bar opt-${OPT}" data-look="warm">
      ${sidebar({ tabs, current: "overview", sub: today ? "Grade 3" : "Grade 3 · Workbook 3", many: true, desk: !today, foot: '<span class="sample">Sample data</span>' })}
      ${phoneTop()}
      <main class="dash-main">${OPT === "b" && moreOpen ? "" : phKid(today)}${main}</main>
      ${bar(items, current, moreOpen)}${sheet}
    </div>`;
  }

  const render = SET === "pre" ? renderPre : renderPhone;
  render();
  addEventListener("hashchange", render);
  matchMedia("(max-width: 899px)").addEventListener("change", render);
})();
