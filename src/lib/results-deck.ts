// The results call deck: what a founder shows a family on the call, built from the same report view the parent reads,
// so the deck never disagrees with the report. Workbook 1 comes from the real planner (ReportView.bookOne). Pure: no
// network, database or clock. Children are named, never he or she.
import {
  bookOneView,
  factsView,
  gapsView,
  levelName,
  nextView,
  sharePercent,
  STATUS_LABEL,
  strengthsView,
  workingLevelNote,
  type ReportView,
} from "@/lib/report-view";
import type { BookMixPart } from "@/lib/report-book-one";

export type DeckTone = "good" | "mid" | "low";

export interface DeckArea { name: string; count: string; share: number | null; label: string; tone: DeckTone }
export interface DeckAnswer { label: string; question: string; answer: string; rightAnswer: string; cause: string | null }
export interface DeckBookRow { kind: string; title: string; detail: string; questions: number; share: number }
export interface DeckPathStep { title: string; text: string }

export interface DeckBook {
  title: string;
  /** The one grade the book teaches. Earlier skills come back as review and are never shown as a second grade. */
  grade: string;
  days: string;
  /** All the planned questions in the book. */
  questions: number;
  why: string | null;
  rows: DeckBookRow[];
  path: DeckPathStep[];
  footnote: string;
}

export interface DeckChild {
  name: string;
  schoolGrade: string;
  working: string;
  stats: string;
  rushed: number;
  ladder: { label: string; state: "book" | "goal" }[];
  areas: DeckArea[];
  strong: string[];
  fill: string[];
  answers: DeckAnswer[];
  levelNote: string;
  book: DeckBook | null;
  /** School grade 3 and up can type to Maya, the AI Teaching Assistant. */
  chat: boolean;
  /** Signed images of real pages from a prepared workbook, or empty. */
  pages: string[];
}

export interface ResultsDeck {
  parentName: string;
  month: string;
  names: string;
  children: DeckChild[];
  /** Show empty frames where the real pages go: only for the sample template. */
  placeholderPages: boolean;
}

export interface DeckInput {
  view: ReportView;
  pages?: string[];
}

const SKILLS_SHOWN = 5;
const LIST_SHOWN = 3;
const ANSWERS_SHOWN = 4;

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const gradeName = (level: number) => capital(levelName(level));
const shortGrade = (level: number) => (level === 0 ? "K" : String(level));


/** "Leah", "Leah and Noah", "Leah, Noah and Mia". */
export function joinNames(names: string[]): string {
  if (names.length < 2) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Whole percents that add up to 100 (largest remainder). */
export function wholePercents(values: number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return values.map(() => 0);
  const exact = values.map((v) => (v / total) * 100);
  const out = exact.map(Math.floor);
  const order = exact.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  const missing = 100 - out.reduce((a, b) => a + b, 0);
  for (let k = 0; k < missing; k += 1) out[order[k % order.length][1]] += 1;
  return out;
}

function bookOf(v: ReportView): DeckBook | null {
  const raw = v.bookOne;
  const view = bookOneView(v);
  if (!raw || !view) return null;
  const skills = (list: string[]) => [...new Set(list)].slice(0, SKILLS_SHOWN).join(", ");
  const lastDay = view.challenge?.items.filter((t) => t.startsWith("Last day")) ?? [];
  const row = (p: BookMixPart): Omit<DeckBookRow, "share"> | null => {
    if (p.kind === "main") {
      const unit = raw.main.find((u) => u.code === p.code);
      return unit ? { kind: "Main focus", title: unit.title, detail: skills(unit.skills), questions: p.items } : null;
    }
    if (p.kind === "review") return { kind: "Review", title: "Earlier skills", detail: [skills(raw.review.flatMap((u) => u.skills)), ...lastDay].filter(Boolean).join(", "), questions: p.items };
    if (p.kind === "challenge") return { kind: "Challenge", title: view.challenge?.title ?? "Harder problems", detail: (view.challenge?.items ?? []).filter((t) => !lastDay.includes(t)).join(", "), questions: p.items };
    return { kind: "Warm-up", title: "Daily facts", detail: skills(raw.warmUp), questions: p.items };
  };
  const listed = raw.mix.flatMap((p) => row(p) ?? []);
  const total = listed.reduce((sum, r) => sum + r.questions, 0);
  const shares = wholePercents(listed.map((r) => r.questions));
  const rows = listed.map((r, i): DeckBookRow => ({ ...r, share: shares[i] }));
  return {
    title: view.main.title,
    grade: gradeName(raw.next.grade),
    days: `${raw.days} days${raw.minutes ? `, about ${raw.minutes} minutes a day` : ""}`,
    why: view.main.why?.replace(/^Why: /, "").replace(" of these right on the test", " right on this topic on the test") ?? null,
    questions: total,
    rows,
    // Workbook 1 has its own slide, so the path starts after it.
    path: view.path.slice(1),
    footnote: view.footnote,
  };
}

function childOf({ view: v, pages = [] }: DeckInput): DeckChild {
  const name = v.childName;
  const { working, grade } = v.model.level;
  const book = bookOf(v);
  const start = v.bookOne?.next.grade ?? working;
  const goal = Math.max(grade, start + 1);
  const areas = v.model.strands.map((s): DeckArea => ({
    name: s.name,
    count: `${s.correct}/${s.total}`,
    share: sharePercent(s),
    label: STATUS_LABEL[s.status],
    tone: s.status === "secure" ? "good" : s.status === "developing" ? "mid" : "low",
  }));
  const facts = factsView(v)?.accuracy;
  if (facts) areas.push({ name: "Number facts", count: facts.value, share: null, label: facts.label, tone: "good" });
  const gaps = gapsView(v) ?? [];
  const later = nextView(v) ?? [];
  const missed = [...gaps, ...later];
  const answers = [...missed.filter((s) => s.cause), ...missed.filter((s) => !s.cause)].slice(0, ANSWERS_SHOWN);
  return {
    name,
    schoolGrade: gradeName(grade),
    working: gradeName(working),
    stats: `${v.questions} questions · ${v.minutes} min`,
    rushed: v.model.leftOut ?? 0,
    ladder: [{ label: shortGrade(start), state: "book" }, { label: shortGrade(goal), state: "goal" }],
    areas,
    strong: (strengthsView(v) ?? []).slice(0, LIST_SHOWN).map((t) => t.title),
    // "First" has to be true: with a plan, only what workbook 1 takes up.
    fill: missed.filter((t) => !book || (t.cover !== null && t.cover !== "In a later book")).slice(0, LIST_SHOWN).map((t) => `${t.title} (${t.count})`),
    answers: answers.map((s) => ({ label: `${s.grade} · ${s.title}`, question: s.question, answer: s.answer, rightAnswer: s.rightAnswer, cause: s.cause })),
    levelNote: book
      ? `Working level is the grade where ${name}'s answers show secure skills today. Workbook 1 is made at this level, and ${name} moves up once these skills are mastered.`
      : workingLevelNote(v),
    book,
    chat: grade >= 3,
    pages,
  };
}

export function resultsDeck({ parentName, month, children, placeholderPages = false }: { parentName: string; month: string; children: DeckInput[]; placeholderPages?: boolean }): ResultsDeck {
  const list = children.map(childOf);
  return { parentName, month, names: joinNames(list.map((c) => c.name)), children: list, placeholderPages };
}

/** Which real pages to show from a rendered book: spread through it, so a family sees the start, the middle and later work. */
export function samplePageIndexes(total: number, count = 3): number[] {
  if (total <= 0) return [];
  if (total <= count) return Array.from({ length: total }, (_, i) => i);
  return Array.from({ length: count }, (_, i) => Math.floor((i * total) / count));
}
