// The pace model every variant shares. Same rules the build will use (src/lib/progress-path.ts):
// - A book is 10 practice days (workbook-plan.ts DAYS). At d days a week a book takes 10/d weeks.
// - Each level has its planned books (curriculum `workbooks`, an average); the last one is the level test book.
// - Book 1 starts at the first level of the working grade (placement P5). The goal is reached when the child
//   starts the first level of the goal grade.
// - Goal: below grade -> the school grade; at grade -> school grade + 2; ahead -> working level + 2. Never above 9.
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

window.plan = (c, daysPerWeek) => {
  const goal = goalFor(c);
  const levels = LEVELS.filter((l) => l.grade >= c.working && l.grade < goal);
  const weeksPerBook = 10 / daysPerWeek;
  const at = (n) => new Date(START_DATE.getTime() + n * weeksPerBook * 7 * 864e5);
  const books = [];
  for (const l of levels) for (let i = 0; i < l.books; i++) {
    books.push({ n: books.length + 1, grade: l.grade, title: l.title, test: i === l.books - 1, start: at(books.length) });
  }
  const goalDate = at(books.length);
  // One stop per grade: the book that starts it and its date.
  const grades = [];
  for (let g = c.working; g <= goal; g++) {
    const first = books.find((b) => b.grade === g);
    grades.push({ grade: g, firstBook: first ? first.n : books.length + 1, date: first ? first.start : goalDate,
      books: books.filter((b) => b.grade === g),
      levels: levels.filter((l) => l.grade === g) });
  }
  const months = Math.round((goalDate - START_DATE) / (30.44 * 864e5));
  return { c, goal, books, goalDate, grades, months, daysPerWeek };
};

window.headline = (p) => {
  const n = p.c.name;
  return `At ${p.daysPerWeek} days a week, ${n} can reach a ${gradeName(p.goal)} level by about ${monthYear(p.goalDate)}.`;
};
window.basis = (p) => `${p.books.length} books of 10 days each, counted from Book 1 in ${monthYear(START_DATE)}. Each book adapts to ${p.c.name}'s marked pages, so the real pace can be faster or slower.`;

// Shared controls: case tabs and the pace switch. Each variant calls mount(render).
window.mount = (render) => {
  let caseKey = new URLSearchParams(location.search).get("case") || "below";
  let pace = Number(new URLSearchParams(location.search).get("pace") || 5);
  const bar = document.querySelector("[data-cases]");
  bar.innerHTML = Object.values(CASES).map((c) => `<button type="button" data-case="${c.key}"><b>${c.label}</b><span>${c.sub}</span></button>`).join("");
  const draw = () => {
    bar.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.case === caseKey)));
    render(plan(CASES[caseKey], pace), (d) => { pace = d; draw(); });
  };
  bar.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { caseKey = b.dataset.case; draw(); } });
  draw();
};

window.paceSwitch = (p) => `<div class="pace" role="group" aria-label="Days a week">
  <span class="pace-k">Days a week</span>
  ${[3, 4, 5].map((d) => `<button type="button" data-pace="${d}" aria-pressed="${d === p.daysPerWeek}">${d}</button>`).join("")}
</div>`;
window.wirePace = (root, setPace) => root.querySelectorAll("[data-pace]").forEach((b) => b.addEventListener("click", () => setPace(Number(b.dataset.pace))));
