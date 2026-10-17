// Words-or-numbers reach simulation (#234, spec #181): can one real test give a skill enough word-problem and
// bare-number answers for the words-or-numbers finding (WORDS_MIN_ANSWERS of each kind)? Runs the real question bank
// and routes through the public assessment interface only (createSession, submitAnswer, extraRoundOffer,
// startExtraRound, finish, learnerProfile), the way src/lib/test-attempt.ts starts and finishes a BC test.
// Deterministic: fixed seeds, and the child's right or wrong answers come from a seeded generator in this script.
// No network, database or clock. A research tool: nothing in src imports it, and it changes no product behaviour.
//
// Usage: npx esbuild scripts/sim-words-numbers.ts --bundle --platform=node --format=esm --log-level=warning \
//          --outfile=/tmp/sim-words-numbers.mjs && node /tmp/sim-words-numbers.mjs [seeds]
// Prints markdown tables (seeds per cell, default 500).
import {
  BANKS,
  REPORTED_STRAND,
  WORDS_MIN_ANSWERS,
  bankFor,
  createSession,
  extraRoundOffer,
  finish,
  learnerProfile,
  levelFor,
  nextQuestion,
  startExtraRound,
  submitAnswer,
  templateSkills,
  wordingOf,
  type Grade,
  type ProfileAnswer,
  type Question,
  type Session,
} from "@/lib/assessment";

const SEEDS = Number(process.argv[2] ?? 500);
const GRADES: Grade[] = [1, 2, 3, 4, 5, 6, 7];
/** Chance of a right answer on each question. */
const PATTERNS = { "all-right": 1, mixed: 0.7, weak: 0.4 } as const;
type Pattern = keyof typeof PATTERNS;
/** [word problems, bare numbers] on one skill. */
const THRESHOLDS = [[3, 3], [3, 2], [2, 3], [2, 2]] as const;
const label = ([w, n]: readonly [number, number]) => `${w}+${n}`;

// mulberry32, for the simulated child only (the library has its own seeded generator).
function chance(seed: number, salt: number): () => number {
  let a = (Math.imul(seed, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca6b)) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Answers every question still open, right with probability p, 20 seconds each (never rushed, #189). */
function answerAll(session: Session, p: number, next: () => number): Session {
  for (let q = nextQuestion(session); q; q = nextQuestion(session)) {
    const response = next() < p ? q.answer : "no idea";
    session = submitAnswer(session, { questionId: q.id, response, timeMs: 20_000 });
  }
  return session;
}

const asked = (s: Session): Question[] => [...s.stage1, ...s.stage2[s.route!], ...(s.extra ?? [])];

function profileOf(session: Session) {
  const placement = finish(session);
  const answers: ProfileAnswer[] = asked(session).map((question, i) => ({
    question,
    response: session.answers[i].response,
    correct: session.answers[i].correct,
    misconception: session.answers[i].misconception,
    timeMs: session.answers[i].timeMs,
    work: { required: question.showWork === true, drawing: false, typed: false },
    readAloud: null,
    away: null,
  }));
  return learnerProfile({ placement, answers, help: null, learning: null })!;
}

type Kinds = { words: number; numbers: number };
const reaches = (k: Kinds, [w, n]: readonly [number, number]) => k.words >= w && k.numbers >= n;

/**
 * Word and bare-number answers at or below the school grade, grouped by `group` (option 3, counting across related
 * skills: all of a BC standard's skills, or a whole reported area).
 */
function grouped(session: Session, group: (q: Question, standard: string) => string): Map<string, Kinds> {
  const bank = new Map(bankFor(session.profile.grade).map((t) => [t.id, t]));
  const out = new Map<string, Kinds>();
  for (const q of asked(session)) {
    const t = bank.get(q.templateId);
    const wording = wordingOf(q.templateId);
    if (!t || !wording || q.level > session.profile.grade) continue;
    const key = group(q, t.standard);
    const k = out.get(key) ?? { words: 0, numbers: 0 };
    if (wording === "word-problem") k.words++;
    else k.numbers++;
    out.set(key, k);
  }
  return out;
}

/** Counted answers (at or below the school grade, any wording) on the most-asked skill. */
function topSkillCount(session: Session): number {
  const per = new Map<string, number>();
  for (const q of asked(session)) {
    if (q.level > session.profile.grade || !wordingOf(q.templateId)) continue;
    for (const s of templateSkills(q.templateId)) per.set(s.id, (per.get(s.id) ?? 0) + 1);
  }
  return Math.max(0, ...per.values());
}

interface Cell {
  tests: number;
  offered: number;
  reach: Record<string, number>;
  reachStandard: Record<string, number>;
  reachArea: Record<string, number>;
  /** Sums over tests: the most counted answers on one skill and on one standard; word and bare answers in the test. */
  topSkill: number;
  topStandard: number;
  words: number;
  numbers: number;
  skills: Record<string, Map<string, number>>;
  routes: Record<string, number>;
  maxWords: number;
}
const emptyCell = (): Cell => ({
  tests: 0, offered: 0, reach: {}, reachStandard: {}, reachArea: {}, topSkill: 0, topStandard: 0, words: 0, numbers: 0, skills: Object.fromEntries(THRESHOLDS.map((t) => [label(t), new Map()])), routes: {}, maxWords: 0,
});

function record(cell: Cell, session: Session) {
  const profile = profileOf(session);
  cell.tests++;
  cell.routes[session.route!] = (cell.routes[session.route!] ?? 0) + 1;
  const skills = profile.wordsOrNumbers.skills.map((s) => ({ id: s.id, words: s.words.total, numbers: s.numbers.total }));
  cell.maxWords = Math.max(cell.maxWords, ...skills.map((s) => s.words), 0);
  const standards = [...grouped(session, (_, standard) => standard).values()];
  const areas = [...grouped(session, (q) => REPORTED_STRAND[q.strand]).values()];
  const whole = [...grouped(session, () => "test").values()][0] ?? { words: 0, numbers: 0 };
  cell.topSkill += topSkillCount(session);
  cell.topStandard += Math.max(0, ...standards.map((k) => k.words + k.numbers));
  cell.words += whole.words;
  cell.numbers += whole.numbers;
  for (const t of THRESHOLDS) {
    const hit = skills.filter((s) => reaches(s, t));
    if (hit.length) cell.reach[label(t)] = (cell.reach[label(t)] ?? 0) + 1;
    for (const s of hit) cell.skills[label(t)].set(s.id, (cell.skills[label(t)].get(s.id) ?? 0) + 1);
    if (standards.some((k) => reaches(k, t))) cell.reachStandard[label(t)] = (cell.reachStandard[label(t)] ?? 0) + 1;
    if (areas.some((k) => reaches(k, t))) cell.reachArea[label(t)] = (cell.reachArea[label(t)] ?? 0) + 1;
  }
}

const pct = (n: number | undefined, d: number) => (d ? `${(((n ?? 0) / d) * 100).toFixed(1)}%` : "-");

// ---------- Static capacity: distinct templates per skill that a test at this grade can ask and that count ----------
// A BC test never asks a template twice (main test and extra round), and each template has one wording, so a skill's
// word-problem count in one test is at most its number of word-problem templates at or below the school grade.
console.log(`# Words-or-numbers reach simulation (#234)\n\nWORDS_MIN_ANSWERS = ${WORDS_MIN_ANSWERS}. Seeds per cell: ${SEEDS}. Province BC.\n`);
console.log("## Capacity: skills with word-problem and bare-number templates the grade's test can ask\n");
console.log("Templates in the grade's bank at or below the school grade (only those answers count). Most questions come from the school grade (stage 1, stay, up's strand minimum) and one level below (down, extra round); the strand minimum on the down route can go lower. A skill can reach w+n only if it has at least w word-problem and n bare-number templates.\n");
console.log("| Grade | Skills with both kinds | Best skill (words/numbers templates, level <= grade) | Skills with >=3 word templates | Skills >=3+3 | >=2+2 |");
console.log("|---|---|---|---|---|---|");
for (const grade of GRADES) {
  const per = new Map<string, Kinds>();
  for (const t of bankFor(grade)) {
    const level = levelFor(t, "BC");
    if (level > grade) continue;
    for (const s of templateSkills(t.id)) {
      const k = per.get(s.id) ?? { words: 0, numbers: 0 };
      if (t.wording === "word-problem") k.words++;
      else k.numbers++;
      per.set(s.id, k);
    }
  }
  const both = [...per].filter(([, k]) => k.words > 0 && k.numbers > 0);
  const score = ([, k]: [string, Kinds]) => Math.min(k.words, 3) * 10 + Math.min(k.numbers, 3);
  const best = [...both].sort((a, b) => score(b) - score(a)).slice(0, 4);
  const w3 = [...per].filter(([, k]) => k.words >= 3).map(([id, k]) => `${id} (${k.words}/${k.numbers})`);
  console.log(`| ${grade} | ${both.length} | ${best.map(([id, k]) => `${id} ${k.words}/${k.numbers}`).join(", ")} | ${w3.join(", ") || "none"} | ${both.filter(([, k]) => reaches(k, [3, 3])).length} | ${both.filter(([, k]) => reaches(k, [2, 2])).length} |`);
}
console.log(`\nBank sizes: ${Object.entries(BANKS).map(([id, b]) => `${id}: ${b.length}`).join(", ")}.\n`);

// ---------- Simulation ----------
const cells = new Map<string, Cell>();
for (const grade of GRADES) {
  for (const pattern of Object.keys(PATTERNS) as Pattern[]) {
    const without = emptyCell();
    const withRound = emptyCell();
    for (let seed = 1; seed <= SEEDS; seed++) {
      const next = chance(seed, grade * 10 + Object.keys(PATTERNS).indexOf(pattern));
      const main = answerAll(createSession({ grade, province: "BC" }, seed), PATTERNS[pattern], next);
      record(without, main);
      // "With the extra round": the child takes the round whenever it is offered; otherwise the test is the same.
      if (extraRoundOffer(main)) {
        withRound.offered++;
        record(withRound, answerAll(startExtraRound(main), PATTERNS[pattern], next));
      } else {
        record(withRound, main);
      }
    }
    cells.set(`${grade}|${pattern}|no`, without);
    cells.set(`${grade}|${pattern}|yes`, withRound);
  }
}

console.log("## Reach rate: one finished test with at least one skill at the threshold\n");
console.log(`| Grade | Pattern | Extra round | Round offered | Routes (up/stay/down) | Max words on a skill | ${THRESHOLDS.map(label).join(" | ")} |`);
console.log(`|---|---|---|---|---|---|${THRESHOLDS.map(() => "---").join("|")}|`);
for (const [key, c] of cells) {
  const [grade, pattern, extra] = key.split("|");
  const routes = ["up", "stay", "down"].map((r) => c.routes[r] ?? 0).join("/");
  console.log(`| ${grade} | ${pattern} | ${extra} | ${extra === "yes" ? pct(c.offered, c.tests) : "-"} | ${routes} | ${c.maxWords} | ${THRESHOLDS.map((t) => pct(c.reach[label(t)], c.tests)).join(" | ")} |`);
}

console.log("\n## Why: how concentrated one test is (averages per test, with the extra round)\n");
console.log("| Grade | Pattern | Most answers on one skill | Most answers on one standard | Word problems in the test | Bare numbers in the test |");
console.log("|---|---|---|---|---|---|");
for (const grade of GRADES) {
  for (const pattern of Object.keys(PATTERNS)) {
    const c = cells.get(`${grade}|${pattern}|yes`)!;
    const avg = (n: number) => (n / c.tests).toFixed(1);
    console.log(`| ${grade} | ${pattern} | ${avg(c.topSkill)} | ${avg(c.topStandard)} | ${avg(c.words)} | ${avg(c.numbers)} |`);
  }
}

console.log("\n## Which skills reach each threshold (tests, all patterns, with the extra round)\n");
for (const grade of GRADES) {
  for (const t of THRESHOLDS) {
    const total = new Map<string, number>();
    for (const pattern of Object.keys(PATTERNS)) {
      for (const [id, n] of cells.get(`${grade}|${pattern}|yes`)!.skills[label(t)]) total.set(id, (total.get(id) ?? 0) + n);
    }
    const list = [...total].sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id} (${n})`).join(", ");
    console.log(`- Grade ${grade}, ${label(t)}: ${list || "none"}`);
  }
}

for (const [title, pick] of [
  ["per BC standard (all of a standard's skills together)", (c: Cell) => c.reachStandard],
  ["per reported area (all skills of the area together)", (c: Cell) => c.reachArea],
] as const) {
  console.log(`\n## Option 3 check: counted ${title}, with the extra round\n`);
  console.log(`| Grade | Pattern | ${THRESHOLDS.map(label).join(" | ")} |`);
  console.log(`|---|---|${THRESHOLDS.map(() => "---").join("|")}|`);
  for (const grade of GRADES) {
    for (const pattern of Object.keys(PATTERNS)) {
      const c = cells.get(`${grade}|${pattern}|yes`)!;
      console.log(`| ${grade} | ${pattern} | ${THRESHOLDS.map((t) => pct(pick(c)[label(t)], c.tests)).join(" | ")} |`);
    }
  }
}
