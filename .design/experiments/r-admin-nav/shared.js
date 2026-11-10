// r-admin-nav shared shell: sample data, the sidebar, routing and the test-family switch. Every option loads this
// file and defines window.OPTION = { renderHome(ctx), renderWorkbooks(ctx) } returning HTML strings.
// Sample data only: made-up families. "Today" is Tuesday 10 November 2026, Pacific time.
(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- sample data ----------
  const STAGES = [
    { key: "signed", label: "Signed up", tone: "muted" },
    { key: "testing", label: "Taking the test", tone: "info" },
    { key: "tested", label: "Report sent", tone: "info" },
    { key: "card", label: "Card saved", tone: "warn" },
    { key: "paying", label: "Customer", tone: "ok" },
    { key: "waitlist", label: "Waitlist", tone: "muted" },
  ];
  const FAMILIES = [
    { id: "f2", parent: "Daniel Okafor", email: "d.okafor@example.com", kids: [{ id: "c2", name: "Theo", grade: "Grade 5" }], stage: "card", stageAt: "Yesterday, 7:42 pm", note: "Card saved. First workbook is being made.", joined: "Nov 2", last: "5 h ago", isNew: true, color: "#ffd9b8" },
    { id: "f3", parent: "Mei Lin", email: "mei.lin@example.com", kids: [{ id: "c3", name: "Ethan", grade: "Grade 2" }, { id: "c3b", name: "Chloe", grade: "Kindergarten" }], stage: "card", stageAt: "Today, 9:15 am", note: "Card saved. No workbook started yet.", joined: "Nov 8", last: "1 h ago", isNew: true, color: "#c9dbff" },
    { id: "f1", parent: "Priya Shah", email: "priya.s@example.com", kids: [{ id: "c1", name: "Mira", grade: "Grade 3" }], stage: "paying", stageAt: "Nov 6", note: "Free month, day 5 of 30. First charge Dec 6.", joined: "Oct 21", last: "2 h ago", color: "#c8f0dc" },
    { id: "f4", parent: "Omar Haddad", email: "omar.h@example.com", kids: [{ id: "c4", name: "Yusuf", grade: "Grade 3" }], stage: "card", stageAt: "Nov 3", note: "Book 1 shipped. Free month starts on delivery.", joined: "Oct 28", last: "Yesterday", color: "#ffe9a8" },
    { id: "f10", parent: "Fatima Noor", email: "fatima.noor@example.com", kids: [{ id: "c10", name: "Zain", grade: "Grade 5" }], stage: "tested", stageAt: "Today, 8:02 am", note: "Report sent this morning.", joined: "Nov 9", last: "3 h ago", color: "#f3d1ff" },
    { id: "f5", parent: "Hannah Wright", email: "hannah.w@example.com", kids: [{ id: "c5", name: "Leo", grade: "Grade 4" }], stage: "tested", stageAt: "Nov 8", note: "Report sent 2 days ago. No card yet.", joined: "Nov 7", last: "2 days ago", color: "#d6f5ff" },
    { id: "f7", parent: "Sofia Romero", email: "sofia.r@example.com", kids: [{ id: "c7", name: "Lucia", grade: "Grade 1" }], stage: "testing", stageAt: "Today, 10:40 am", note: "On question 18 of 40.", joined: "Nov 10", last: "Now", live: true, color: "#ffd2c4" },
    { id: "f6", parent: "Arjun Mehta", email: "arjun.m@example.com", kids: [{ id: "c6", name: "Kabir", grade: "Grade 6" }], stage: "signed", stageAt: "Today, 11:20 am", note: "Signed up. Test not started.", joined: "Nov 10", last: "40 min ago", color: "#e2e2e6" },
    { id: "f9", parent: "Tomás Reyes", email: "tomas.r@example.com", kids: [{ id: "c9", name: "Ana", grade: "Grade 2" }], stage: "signed", stageAt: "Nov 7", note: "Test not started. Reminder sent yesterday.", joined: "Nov 7", last: "3 days ago", color: "#e2e2e6" },
    { id: "f8", parent: "Grace Kim", email: "grace.kim@example.com", kids: [{ id: "c8", name: "Noah", grade: "Grade 7" }], stage: "waitlist", stageAt: "Nov 4", note: "Ontario. Joined the waitlist from the report.", joined: "Nov 3", last: "6 days ago", color: "#e2e2e6" },
    // test families: hidden unless "Show test families" is on
    { id: "t1", parent: "Workbook samples", email: "workbook-samples@…", kids: [{ id: "tc1", name: "Ava", grade: "Grade 1" }, { id: "tc2", name: "Kai", grade: "Grade 4" }, { id: "tc3", name: "Nora", grade: "Kindergarten" }], kidsMore: 29, stage: "paying", stageAt: "Oct 31", note: "Sample children for the workbook generator.", joined: "Oct 31", last: "Yesterday", test: true, color: "#eee" },
    { id: "t2", parent: "Savar Gupta", email: "team account", kids: [{ id: "tc4", name: "Testkid", grade: "Grade 3" }], stage: "tested", stageAt: "Oct 24", note: "Team account.", joined: "Oct 24", last: "Today", test: true, color: "#eee" },
    { id: "t3", parent: "Cedric Tanafranca", email: "team account", kids: [{ id: "tc5", name: "Alex", grade: "Grade 4" }], stage: "tested", stageAt: "Nov 4", note: "Team account.", joined: "Oct 12", last: "Nov 6", test: true, color: "#eee" },
  ];
  // Book states in order. "none" = a customer child with no workbook started.
  const BOOK_STEPS = [
    { key: "making", label: "Being made" },
    { key: "review", label: "Ready to review" },
    { key: "approved", label: "Approved" },
    { key: "printed", label: "Printed" },
    { key: "shipped", label: "Shipped" },
    { key: "delivered", label: "Delivered" },
  ];
  const BOOKS = [
    { id: "b1", child: "Theo", childId: "c2", family: "f2", n: 1, state: "making", progress: 64, detail: "Page 26 of 40. Started 11:02 am.", eta: "About 20 min left", history: [
      { when: "Today, 9:31 am", what: "Stopped", why: "Stopped by Savar to change the book plan." },
      { when: "Yesterday, 10:22 pm", what: "Failed", why: "One step took too long. It was started again." } ] },
    { id: "b2", child: "Ethan", childId: "c3", family: "f3", n: 1, state: "none", detail: "Card saved today. No workbook yet." },
    { id: "b2b", child: "Chloe", childId: "c3b", family: "f3", n: 1, state: "none", detail: "Card saved today. No workbook yet." },
    { id: "b3", child: "Mira", childId: "c1", family: "f1", n: 2, state: "review", detail: "40 pages, 582 questions.", checks: { fix: 0, byHand: 0, fit: 2, missing: 0, mathOk: 582, mathAll: 582 }, made: "Yesterday, 4:10 pm", history: [
      { when: "Nov 8", what: "Stopped", why: "Stopped to use the new marks from Book 1." } ] },
    { id: "b4", child: "Mira", childId: "c1", family: "f1", n: 1, state: "delivered", detail: "Delivered Nov 6. Free month started.", done: "Nov 6" },
    { id: "b5", child: "Yusuf", childId: "c4", family: "f4", n: 1, state: "shipped", detail: "Canada Post. Expected Nov 12.", done: "Nov 7" },
    { id: "b6", child: "Ava", childId: "tc1", family: "t1", n: 1, state: "review", detail: "40 pages, 247 questions.", checks: { fix: 0, byHand: 62, fit: 0, missing: 0, mathOk: 185, mathAll: 247 }, made: "Nov 1", test: true },
    { id: "b7", child: "Kai", childId: "tc2", family: "t1", n: 2, state: "review", detail: "40 pages, 629 questions.", checks: { fix: 0, byHand: 0, fit: 2, missing: 2, mathOk: 629, mathAll: 629 }, made: "Nov 9", test: true, history: [
      { when: "Nov 9", what: "Stopped", why: "Stopped by Savar." } ] },
    { id: "b8", child: "Kai", childId: "tc2", family: "t1", n: 1, state: "delivered", detail: "Delivered Nov 7.", done: "Nov 7", test: true },
  ];
  const MARKING = [
    { id: "m1", child: "Mira", family: "f1", book: "Book 1", where: "Day 3 · Page 2 · Question 4", read: "45", reason: "The AI is not sure", since: "3 h", sinceMin: 180 },
    { id: "m2", child: "Mira", family: "f1", book: "Book 1", where: "Day 4 · Page 1 · Question 2", read: "Could not read", reason: "The photo is blurry", since: "1 h", sinceMin: 60 },
    { id: "m3", child: "Mira", family: "f1", book: "Book 1", where: "Day 4 · Page 1 · Question 6", read: "3/8", reason: "The AI is not sure", since: "1 h", sinceMin: 60 },
    { id: "m4", child: "Kai", family: "t1", book: "Book 1", where: "Day 2 · Page 3 · Question 1", read: "12", reason: "The AI is not sure", since: "2 days", sinceMin: 2880, test: true },
  ];
  const MARKED = { pages: 22, of: 40, child: "Mira", today: 6 };
  // 14 days to today (Nov 10): signups, tests finished, cards saved
  const DAYS = ["Oct 28", "Oct 29", "Oct 30", "Oct 31", "Nov 1", "Nov 2", "Nov 3", "Nov 4", "Nov 5", "Nov 6", "Nov 7", "Nov 8", "Nov 9", "Nov 10"];
  const SERIES = {
    signups: [1, 2, 0, 1, 0, 1, 1, 2, 0, 1, 2, 1, 1, 3],
    finished: [1, 1, 0, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1],
    cards: [0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 1],
  };
  const KPIS = [
    { key: "customers", label: "New customers", value: 2, prev: 1, period: "this week", hint: "Families who saved a card" },
    { key: "signups", label: "Signups", value: 6, prev: 4, period: "this week", hint: "New parent accounts" },
    { key: "tests", label: "Tests finished", value: 4, prev: 4, period: "this week", hint: "Children who finished the test" },
    { key: "active", label: "Active plans", value: 3, prev: 2, period: "now", hint: "1 in the free month, 2 waiting for delivery" },
  ];
  const ACTIVITY = [
    { at: "11:20 am", who: "Arjun Mehta", family: "f6", what: "signed up", detail: "Kabir, Grade 6", kind: "signup" },
    { at: "11:02 am", who: "Theo", family: "f2", what: "workbook started", detail: "Book 1 is being made", kind: "book" },
    { at: "10:40 am", who: "Lucia", family: "f7", what: "started the test", detail: "Grade 1", kind: "test" },
    { at: "9:15 am", who: "Mei Lin", family: "f3", what: "saved a card", detail: "Ethan and Chloe", kind: "customer" },
    { at: "8:02 am", who: "Zain", family: "f10", what: "finished the test", detail: "Report emailed", kind: "test" },
    { at: "Yesterday", who: "Daniel Okafor", family: "f2", what: "saved a card", detail: "Theo", kind: "customer" },
    { at: "Yesterday", who: "Mira", family: "f1", what: "6 pages marked", detail: "3 answers need our team", kind: "marking" },
  ];

  // ---------- navigation ----------
  const ICON = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
    families: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.2c2.9-.4 5.5 1.8 5.5 4.8"/>',
    tests: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    feedback: '<path d="M4 5h16v11H9l-5 4z"/>',
    production: '<path d="M4 4h11l5 5v11H4z"/><path d="M15 4v5h5"/><path d="M8 13h8M8 17h5"/>',
    delivery: '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>',
    marking: '<path d="M4 12l5 5L20 6"/>',
    calls: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14c1 1.4 2.2 2 3.5 2s2.5-.6 3.5-2"/><path d="M9 9.5h.01M15 9.5h.01"/>',
    flyers: '<path d="M4 4h16v16H4z"/><path d="M8 8h3v3H8zM13 8h3v3h-3zM8 13h3v3H8z"/>',
    emails: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6 8.5 7 8.5-7"/>',
    templates: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
    skillmap: '<circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M7.5 7.5l3.5 8.5M16.5 7.5 13 16M8 6h8"/>',
    reviews: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    preview: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
    export: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 19h16"/>',
    chev: '<path d="m6 9 6 6 6-6"/>',
    side: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>',
  };
  const icon = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k] || ""}</svg>`;
  const NAV = [
    { key: "home", label: "Home", purpose: "What changed today and what needs you." },
    { folder: "Families", items: [
      { key: "families", label: "Families", purpose: "Every parent and their children, by stage." },
      { key: "tests", label: "Tests", purpose: "Every assessment, with its result and flags." },
      { key: "feedback", label: "Feedback", purpose: "What parents wrote to us." } ] },
    { folder: "Workbooks", items: [
      { key: "production", label: "Production", purpose: "Every workbook from draft to delivery." },
      { key: "delivery", label: "Plans and delivery", purpose: "Saved cards, free months and the waitlist." },
      { key: "marking", label: "Marking", purpose: "Answers from scanned pages that our team must check." } ] },
    { folder: "Maya", items: [
      { key: "calls", label: "Calls", purpose: "Maya's calls with children, and test calls." } ] },
    { folder: "Marketing", items: [
      { key: "flyers", label: "Flyers", purpose: "Flyer A against flyer B: scans, signups and cards." },
      { key: "emails", label: "Emails", purpose: "Every email we sent, and whether it arrived." } ] },
    { folder: "Quality", items: [
      { key: "templates", label: "Templates", purpose: "How children answer each question type." },
      { key: "skillmap", label: "Skill map", purpose: "The BC curriculum, skill by skill." },
      { key: "reviews", label: "AI reviews", purpose: "How the AI marked shown work, and how sure it was." } ] },
    { folder: "Team tools", items: [
      { key: "preview", label: "Parent app preview", purpose: "See the parent app with sample families." },
      { key: "export", label: "Export", purpose: "Download test data as CSV or JSON." } ] },
  ];
  const ALL = NAV.flatMap((n) => n.items ?? [n]);

  const store = {
    get(k, d) { try { const v = localStorage.getItem("adm-nav:" + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("adm-nav:" + k, JSON.stringify(v)); } catch { /* private window */ } },
  };
  const state = { showTests: store.get("tests", false), min: store.get("min", false), shut: store.get("shut", ["Maya", "Quality", "Team tools"]) };

  function data() {
    const keep = (x) => state.showTests || !x.test;
    const families = FAMILIES.filter(keep);
    const books = BOOKS.filter(keep);
    const marking = MARKING.filter(keep);
    return { families, books, marking };
  }
  function badges(d) {
    const fresh = d.families.filter((f) => f.isNew).length;
    const review = d.books.filter((b) => b.state === "review" || b.state === "none").length;
    return {
      families: fresh ? { text: `${fresh} new`, tone: "is-hot" } : null,
      feedback: { text: "1" },
      production: d.books.some((b) => b.state === "making") ? { text: `${review} to do`, tone: "" } : review ? { text: String(review) } : null,
      delivery: { text: "1 to start", tone: "" },
      marking: d.marking.length ? { text: String(d.marking.length), tone: "is-hot" } : null,
    };
  }

  function sidebar(route, d) {
    const b = badges(d);
    const item = (n) => {
      const bd = b[n.key];
      return `<a class="nav-item" href="#/${n.key}" title="${esc(n.label)}" ${route === n.key ? 'aria-current="page"' : ""} ${bd?.tone === "is-hot" ? "data-dot" : ""}>${icon(n.key)}<span class="label">${esc(n.label)}</span>${bd ? `<span class="badge ${bd.tone || ""}">${esc(bd.text)}</span>` : ""}</a>`;
    };
    return `
      <div class="side-top">
        <a class="brand" href="#/home"><b></b><span>Unica Learning</span><small>Admin</small></a>
        <button class="collapse" type="button" data-act="min" aria-label="${state.min ? "Open the sidebar" : "Close the sidebar"}" title="${state.min ? "Open the sidebar" : "Close the sidebar"}">${icon("side")}</button>
      </div>
      <div class="find" role="search">${icon("search").replace("<svg", '<svg width="15" height="15" style="stroke:currentColor;fill:none;stroke-width:1.7"')}<span>Find a family or child</span><kbd>/</kbd></div>
      <nav class="nav" aria-label="Admin">
        ${NAV.map((n) => n.items ? `
          <div class="folder ${state.shut.includes(n.folder) && !n.items.some((i) => i.key === route) ? "is-shut" : ""}">
            <button class="folder-head" type="button" data-folder="${esc(n.folder)}" aria-expanded="${!state.shut.includes(n.folder)}">${esc(n.folder)}<svg class="chev" viewBox="0 0 24 24" aria-hidden="true">${ICON.chev}</svg></button>
            <div class="folder-items">${n.items.map(item).join("")}</div>
          </div>` : item(n)).join("")}
      </nav>
      <div class="side-foot">
        <label class="switch" title="Show test families"><input type="checkbox" data-act="tests" ${state.showTests ? "checked" : ""}><span>Show test families</span></label>
        <div class="who">savar@unicalearning.com</div>
      </div>`;
  }

  function render() {
    const route = (location.hash.replace(/^#\/?/, "") || "home").split("?")[0];
    const page = ALL.find((n) => n.key === route) ?? ALL[0];
    const d = data();
    const shell = document.querySelector(".shell");
    shell.classList.toggle("is-min", state.min);
    shell.classList.remove("is-open");
    shell.querySelector(".side").innerHTML = sidebar(page.key, d);
    document.querySelector(".topbar b").textContent = page.label;
    const ctx = {
      ...d, all: { FAMILIES, BOOKS, MARKING }, STAGES, BOOK_STEPS, KPIS, SERIES, DAYS, ACTIVITY, MARKED,
      showTests: state.showTests, esc, icon, family: (id) => FAMILIES.find((f) => f.id === id),
      testbar: state.showTests ? `<div class="testbar">Test families are showing. They are marked <span class="chip test">test</span> and are not in any number.</div>` : "",
    };
    const O = window.OPTION || {};
    let html;
    if (page.key === "home" && O.renderHome) html = O.renderHome(ctx);
    else if (page.key === "production" && O.renderWorkbooks) html = O.renderWorkbooks(ctx);
    else html = `<header class="page-head"><div><h1>${esc(page.label)}</h1><p>${esc(page.purpose)}</p></div></header><div class="placeholder">This page is not in the prototype. Home and Workbooks › Production are.</div>`;
    const main = document.querySelector(".content");
    main.innerHTML = html;
    document.title = `${page.label} · Admin`;
    O.after?.(main, ctx);
  }

  function toast(text) {
    let t = document.querySelector(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.append(t); }
    t.textContent = text; t.classList.add("is-on");
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("is-on"), 2200);
  }

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act],[data-folder],[data-toast],[data-go]");
    if (!el) return;
    if (el.dataset.folder) {
      const f = el.dataset.folder;
      state.shut = state.shut.includes(f) ? state.shut.filter((x) => x !== f) : [...state.shut, f];
      store.set("shut", state.shut); render(); return;
    }
    if (el.dataset.act === "min") { state.min = !state.min; store.set("min", state.min); render(); return; }
    if (el.dataset.act === "menu") { document.querySelector(".shell").classList.add("is-open"); return; }
    if (el.dataset.go) { e.preventDefault(); location.hash = "#/" + el.dataset.go; return; }
    if (el.dataset.toast) { e.preventDefault(); toast(el.dataset.toast); }
  });
  document.addEventListener("change", (e) => {
    if (e.target.matches('[data-act="tests"]')) { state.showTests = e.target.checked; store.set("tests", state.showTests); render(); }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") document.querySelector(".shell").classList.remove("is-open"); });
  document.addEventListener("pointerdown", (e) => {
    const shell = document.querySelector(".shell");
    if (shell.classList.contains("is-open") && !e.target.closest(".side")) shell.classList.remove("is-open");
  });
  window.addEventListener("hashchange", render);

  window.ADMIN = { esc, icon, toast, render };
  document.addEventListener("DOMContentLoaded", () => {
    document.body.insertAdjacentHTML("afterbegin", `
      <div class="shell">
        <aside class="side"></aside>
        <div class="page">
          <div class="topbar"><button type="button" data-act="menu" aria-label="Open the menu">${icon("menu")}</button><b></b></div>
          <main class="content" id="main"></main>
        </div>
      </div>`);
    const style = document.createElement("style");
    style.textContent = `.toast{position:fixed;left:50%;bottom:24px;transform:translate(-50%,20px);opacity:0;padding:10px 16px;border-radius:8px;background:var(--ink);color:#fff;font-size:14px;transition:all .2s;pointer-events:none;z-index:50}.toast.is-on{opacity:1;transform:translate(-50%,0)}`;
    document.head.append(style);
    render();
  });
})();
