// The plan model every variant shares. One pace: 5 days a week (Savar, 2026-11-11: every child does 5 days a week).
// Same rules the build will use:
// - A book is 10 practice days, 5 a week, so a new book every 2 weeks (workbook-plan.ts DAYS).
// - Each level has its planned books (curriculum `workbooks`); Book 1 starts at the first level of the working grade.
// - The goal is reached when the child starts the first level of the goal grade.
// - Goal: below grade -> the school grade; at grade -> school grade + 2; ahead -> working level + 2. Never above 9.
// - Pages a day and minutes come from the level band (D-186, .design/workbooks/CONTEXT.md).
// - Dates count from Book 1's start. In this mockup Book 1 starts 5 weeks after the report (open decision).
window.CASES = {
  below: { key: "below", name: "Leah", grade: 3, working: 1, label: "Below grade", sub: "Grade 3, working at Grade 1" },
  at:    { key: "at",    name: "Leah", grade: 3, working: 3, label: "At grade",    sub: "Grade 3, working at Grade 3" },
  ahead: { key: "ahead", name: "Leah", grade: 3, working: 4, label: "Ahead",       sub: "Grade 3, working at Grade 4" },
};
window.REPORT_DATE = new Date(2026, 10, 11);
window.START_DATE = new Date(2026, 11, 16);
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
window.gradeName = (g) => (g === 0 ? "Kindergarten" : `Grade ${g}`);
window.monthYear = (d) => `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
window.monthShort = (d) => MONTHS[d.getMonth()].slice(0, 3);
window.goalFor = (c) => Math.min(9, c.working < c.grade ? c.grade : c.working === c.grade ? c.grade + 2 : c.working + 2);
// D-186 bands, by the grade's first level.
window.dayFor = (g) => g === 0 ? { pages: "4 to 6", min: "15 to 20" } : g <= 2 ? { pages: "8", min: "20 to 25" } : g <= 5 ? { pages: "8", min: "25 to 30" } : { pages: "6", min: "about 30" };
// One example per grade, from that grade's BC units. The build takes them from the question templates.
window.EX = {
  0: ["3 + 2 = ", "5"], 1: ["8 + 5 = ", "13"], 2: ["47 + 28 = ", "75"], 3: ["348 + 275 = ", "623"],
  4: ["6 × 7 = ", "42"], 5: ["426 × 3 = ", "1278"], 6: ["25% of $40 = ", "$10"], 7: ["2x + 3 = 11, x = ", "4"],
  8: ["√49 = ", "7"], 9: ["3² × 3³ = ", "3⁵"],
};
window.plan = (c) => {
  const goal = goalFor(c);
  const levels = LEVELS.filter((l) => l.grade >= c.working && l.grade < goal);
  const at = (n) => new Date(START_DATE.getTime() + n * 14 * 864e5);
  const books = [];
  for (const l of levels) for (let i = 0; i < l.books; i++) books.push({ n: books.length + 1, grade: l.grade, title: l.title, start: at(books.length) });
  const goalDate = at(books.length);
  const stages = [];
  for (let g = c.working; g < goal; g++) {
    const bs = books.filter((b) => b.grade === g);
    stages.push({ grade: g, from: bs[0].start, to: at(bs.at(-1).n), books: bs, levels: levels.filter((l) => l.grade === g) });
  }
  return { c, goal, books, goalDate, stages, day: dayFor(c.working) };
};
window.prediction = (p) => `We predict ${p.c.name} can reach a ${gradeName(p.goal)} level by ${monthYear(p.goalDate)}.`;
window.basis = (p) => `How we count: ${p.books.length} workbooks of 10 days each, 5 days a week, from Book 1 in ${monthYear(START_DATE)}, through the BC curriculum. Each book adapts to ${p.c.name}'s marked pages, so the real date can be earlier or later.`;
window.mount = (render) => {
  let caseKey = new URLSearchParams(location.search).get("case") || "below";
  const bar = document.querySelector("[data-cases]");
  bar.innerHTML = Object.values(CASES).map((c) => `<button type="button" data-case="${c.key}"><b>${c.label}</b><span>${c.sub}</span></button>`).join("");
  const draw = () => { bar.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.case === caseKey))); render(plan(CASES[caseKey])); };
  bar.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { caseKey = b.dataset.case; draw(); } });
  draw();
};
