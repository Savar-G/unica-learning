// The admin table per question template (#199, spec #181): for each template, across all children, the times shown,
// the percent correct, the median time and each wrong answer chosen with its count. Pure: no network, database or
// clock. The database counts the live answers (migration add_template_stats, function admin_template_stats);
// templateStats below is the same count in TypeScript, for the local demo and as the written rules of that function.
import { MISCONCEPTIONS, type Grade, type Level, type MisconceptionId, type Province, type Strand, type Template } from "@/lib/assessment";
import { ADMIN_PATH, GRADES, PROVINCES } from "@/lib/admin-view";

/** The table. */
export const ADMIN_TEMPLATES_PATH = `${ADMIN_PATH}/templates`;
/** One template: what it asks, sample questions and its numbers. */
export const adminTemplatePath = (id: string) => `${ADMIN_TEMPLATES_PATH}/${encodeURIComponent(id)}`;
/** A BC standard on the skill map (#192). */
export const skillMapStandardPath = (code: string) => `${ADMIN_PATH}/skill-map#${standardAnchor(code)}`;
/** The id of a standard's cell on the skill map. */
export const standardAnchor = (code: string) => `standard-${code}`;

/** One answer, with what the filters need from its test. */
export interface AnswerFact {
  templateId: string;
  correct: boolean;
  /** The thinking time the browser measured (answers.time_ms). */
  timeMs: number;
  response: string;
  misconception: string | null;
  /** The child's school grade and curriculum when the test started (assessments.grade, province). */
  grade: number;
  province: Province;
  /** The family is an admin's own or is marked as a test (D-099). */
  testFamily: boolean;
}

/** Which answers count. By default every answer of every real family (D-099). */
export interface TemplateFilters {
  /** Count the team and test families too. */
  withTests: boolean;
  grade: Grade | null;
  province: Province | null;
}

export interface WrongCount {
  response: string;
  misconception: string | null;
  count: number;
}

/** One row of admin_template_stats. "Shown" counts the answers: a question is answered before the next one shows. */
export interface TemplateStat {
  template_id: string;
  shown: number;
  correct: number;
  /** The median thinking time; null when nothing was answered. */
  median_ms: number | null;
  /** Each different wrong answer (the same response and misconception), with how many times it was chosen. */
  wrong: WrongCount[];
}

/** The median as percentile_cont(0.5): the mean of the two middle values when the count is even. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** The counts per template of the answers the filters keep, as admin_template_stats returns them. */
export function templateStats(answers: readonly AnswerFact[], f: TemplateFilters): TemplateStat[] {
  const byTemplate = new Map<string, AnswerFact[]>();
  for (const a of answers) {
    if (!f.withTests && a.testFamily) continue;
    if (f.grade !== null && a.grade !== f.grade) continue;
    if (f.province !== null && a.province !== f.province) continue;
    const rows = byTemplate.get(a.templateId);
    if (rows) rows.push(a);
    else byTemplate.set(a.templateId, [a]);
  }
  return [...byTemplate].map(([id, rows]) => {
    const wrong = new Map<string, WrongCount>();
    for (const r of rows) {
      if (r.correct) continue;
      const key = JSON.stringify([r.response, r.misconception]);
      const w = wrong.get(key) ?? { response: r.response, misconception: r.misconception, count: 0 };
      w.count++;
      wrong.set(key, w);
    }
    return {
      template_id: id,
      shown: rows.length,
      correct: rows.filter((r) => r.correct).length,
      median_ms: median(rows.map((r) => r.timeMs)),
      wrong: [...wrong.values()],
    };
  });
}

/** The wrong answers a row lists; the rest are summed. */
export const WRONG_SHOWN = 5;

const STRAND_ORDER: readonly Strand[] = ["N", "O", "F", "A", "MG", "DP"];

export interface WrongLine extends WrongCount {
  /** What the coded mistake means; null when the answer is not coded or the code is unknown. */
  meaning: string | null;
}

/** One row of the table. */
export interface TemplateLine {
  id: string;
  /** From the bank; null for a template that is no longer in it. */
  strand: Strand | null;
  standard: string | null;
  /** The template's BC grade (K is 0). */
  level: Level | null;
  shown: number;
  /** Whole percent; null when never answered. */
  percentCorrect: number | null;
  medianMs: number | null;
  /** The WRONG_SHOWN most chosen wrong answers, most chosen first. */
  wrong: WrongLine[];
  /** The other wrong answers: how many different ones, and how many times they were chosen together. */
  moreWrong: { answers: number; times: number };
  href: string;
  standardHref: string | null;
}

export interface TemplateTable {
  /** Every bank template, by BC grade from K up. */
  grades: { level: Level; lines: TemplateLine[] }[];
  /** Answers to templates that are no longer in the bank. */
  retired: TemplateLine[];
  /** All the answers counted. */
  answers: number;
}

const byText = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

function line(id: string, t: Template | undefined, s: TemplateStat | undefined): TemplateLine {
  const wrong = [...(s?.wrong ?? [])].sort((a, b) => b.count - a.count || byText(a.response, b.response));
  const rest = wrong.slice(WRONG_SHOWN);
  return {
    id,
    strand: t?.strand ?? null,
    standard: t?.standard ?? null,
    level: t?.grades.BC ?? null,
    shown: s?.shown ?? 0,
    percentCorrect: s && s.shown > 0 ? Math.round((100 * s.correct) / s.shown) : null,
    medianMs: s?.median_ms ?? null,
    wrong: wrong.slice(0, WRONG_SHOWN).map((w) => ({
      ...w,
      meaning: w.misconception ? (MISCONCEPTIONS[w.misconception as MisconceptionId]?.description ?? null) : null,
    })),
    moreWrong: { answers: rest.length, times: rest.reduce((n, w) => n + w.count, 0) },
    href: adminTemplatePath(id),
    standardHref: t ? skillMapStandardPath(t.standard) : null,
  };
}

/** The table: every template in the bank once (the bands share some), each with its counts. */
export function templateTable(stats: readonly TemplateStat[], bank: readonly Template[]): TemplateTable {
  const counted = new Map(stats.map((s) => [s.template_id, s]));
  const templates = [...new Map(bank.map((t) => [t.id, t])).values()];
  const order = (a: Template, b: Template) =>
    STRAND_ORDER.indexOf(a.strand) - STRAND_ORDER.indexOf(b.strand) || byText(a.standard, b.standard) || byText(a.id, b.id);
  const levels = [...new Set(templates.map((t) => t.grades.BC))].sort((a, b) => a - b);
  const known = new Set(templates.map((t) => t.id));
  return {
    grades: levels.map((level) => ({
      level,
      lines: templates.filter((t) => t.grades.BC === level).sort(order).map((t) => line(t.id, t, counted.get(t.id))),
    })),
    retired: stats.filter((s) => !known.has(s.template_id)).sort((a, b) => byText(a.template_id, b.template_id)).map((s) => line(s.template_id, undefined, s)),
    answers: stats.reduce((n, s) => n + s.shown, 0),
  };
}

type Query = Record<string, string | string[] | undefined>;

/** The filters in the page's address (?grade=3&province=BC&tests=1). Anything else is ignored. */
export function parseTemplateFilters(query: Query): TemplateFilters {
  const one = (k: string) => (typeof query[k] === "string" ? query[k] : null);
  return {
    withTests: one("tests") === "1",
    grade: GRADES.find((g) => String(g) === one("grade")) ?? null,
    province: PROVINCES.find((p) => p === one("province")) ?? null,
  };
}
