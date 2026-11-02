import type { GeneratedPage } from "./workbook-generator";
import { dayTimeProblem, estimatedDayMinutes } from "./workbook-feedback-check";
import { printedNumbers } from "./workbook-book";

export interface BookIssue { page: number; kind: "repeat" | "progress" | "variety" | "time"; reason: string }
export interface DayQuality { day: number; minutes: number; formats: number; largestNumber: number }
export interface BookQuality {
  failedRate: number;
  dropped: number;
  days: DayQuality[];
  issues: BookIssue[];
  ready: boolean;
}

/** Planning estimate, not a claim about a child's measured completion time. */
export function questionMinutes(q: GeneratedPage["questions"][number]): number {
  const p = q.package;
  if (!p) return .5;
  const text = p.text.trim().split(/\s+/).length / 80;
  const f = p.item?.format;
  const work = f === "written-reason" || f === "two-ways" ? 1.25 : f === "show-work" || f === "draw" ? .8 : .25;
  const boxes = Math.max(0, (p.item?.regions.filter(r => r.kind === "box").length ?? 1) - 1) * .08;
  return text + work + boxes;
}

/** Inspect actual questions, not the promised schedule or a model's score. */
export function workbookQuality(pages: readonly GeneratedPage[]): BookQuality {
  const issues: BookIssue[] = [];
  const days: DayQuality[] = [];
  const seen = new Map<string, number[]>();
  for (const p of pages) for (const q of p.questions) {
    if (!q.package || q.check.status === "failed" || q.place === "warm-up") continue;
    const pkg = q.package;
    const key = JSON.stringify([pkg.text, pkg.operation, pkg.item?.checks, pkg.item?.figure]);
    const at = seen.get(key) ?? [];
    const limit = pkg.textSource === "code" ? 3 : 1;
    if (at.includes(p.number) || at.length >= limit) issues.push({ page: p.number, kind: "repeat", reason: `question ${q.number} repeats pages ${at.join(", ")} (limit ${limit})` });
    seen.set(key, [...at, p.number]);
  }
  for (const day of [...new Set(pages.flatMap(p => p.day === null ? [] : [p.day]))].sort((a, b) => a - b)) {
    const ofDay = pages.filter(p => p.day === day);
    const questions = ofDay.flatMap(p => p.questions);
    const formats = new Set(questions.flatMap(q => q.package?.item ? [q.package.item.format] : []));
    // Include time to read worked examples and move between pages.
    const packages = questions.flatMap(q => q.package ? [q.package] : []);
    const panels = ofDay.reduce((n,p)=>n + (p.content?.kind === "day" ? p.content.blocks.filter(b => ["worked-example", "watch-one", "reminder"].includes(b.slot)).length : 0),0);
    const minutes = Math.max(questions.reduce((n, q) => n + questionMinutes(q), 0) + ofDay.length * .35, estimatedDayMinutes(packages, panels));
    const largestNumber = Math.max(0, ...questions.flatMap(q => q.package ? printedNumbers({...q.package, wrongAnswers: [], easierExample: null}).map(Math.abs) : []));
    days.push({ day, minutes: Math.round(minutes * 10) / 10, formats: formats.size, largestNumber });
    if (minutes >= 30 || dayTimeProblem(packages, panels)) for (const p of ofDay) issues.push({ page: p.number, kind: "time", reason: `Day ${day} is estimated at ${minutes.toFixed(1)} minutes; keep it below 30` });
    if (questions.length >= 8 && formats.size < 2) for (const p of ofDay) issues.push({ page: p.number, kind: "variety", reason: `Day ${day} uses only ${formats.size} answer format` });
  }
  // Compare the numbers of the same skills, so changing Unit B does not hide a
  // flat main-unit sequence. A short review need not contain days 8 to 10.
  const skills = new Set(pages.flatMap(p => p.questions.flatMap(q => q.package?.skill.skills ?? [])));
  for (const skill of skills) {
    // An earlier skill's fixed review range need not grow with the new unit.
    if (/make-10|partners-of-10/.test(skill)) continue;
    if (skill.startsWith("K") && pages.some(p => p.questions.some(q => (q.package?.level ?? 0) > 3))) continue;
    const largest = (late: boolean) => Math.max(0, ...pages.filter(p => p.day !== null && (late ? p.day >= 8 : p.day <= 3)).flatMap(p => p.questions.flatMap(q => q.package?.skill.skills.includes(skill) ? printedNumbers({...q.package, wrongAnswers: [], easierExample: null}).map(Math.abs) : [])));
    const early = largest(false), late = largest(true);
    if (early > 0 && late > 0 && late <= early) {
      for (const p of pages.filter(p => (p.day ?? 0) >= 8 && p.questions.some(q => q.package?.skill.skills.includes(skill)))) issues.push({ page: p.number, kind: "progress", reason: `${skill}: days 8 to 10 do not use bigger numbers than days 1 to 3 (${late} versus ${early})` });
    }
  }
  const questions = pages.flatMap(p => p.questions);
  const failedRate = questions.length ? questions.filter(q => q.check.status === "failed").length / questions.length : 1;
  return { failedRate, dropped: pages.reduce((n, p) => n + (p.leftOut?.length ?? 0), 0), days, issues,
    ready: failedRate < .05 && issues.length === 0 && pages.every(p => p.fit.status !== "failed") };
}

/** At most one whole-book repair per weak page. A bad repair never replaces a
 * sound page. The caller owns the fit check and the durable page store. */
export async function checkWholeBook(pages: GeneratedPage[], rewrite: (page: GeneratedPage, issues: BookIssue[]) => Promise<GeneratedPage | null>): Promise<{ pages: GeneratedPage[]; quality: BookQuality }> {
  const first = workbookQuality(pages);
  const result = [...pages];
  for (const number of [...new Set(first.issues.map(i => i.page))]) {
    const index = result.findIndex(p => p.number === number);
    const fresh = await rewrite(result[index], first.issues.filter(i => i.page === number));
    if (!fresh || fresh.fit.status === "failed" || fresh.questions.length !== result[index].questions.length || fresh.questions.some((q, i) => q.slot !== result[index].questions[i].slot)) continue;
    const candidate = result.map((p, i) => i === index ? fresh : p);
    const next = workbookQuality(candidate);
    const oldFailures = result[index].questions.filter(q => q.check.status === "failed").length;
    if (fresh.questions.filter(q => q.check.status === "failed").length > oldFailures) continue;
    if (next.issues.length < workbookQuality(result).issues.length) result[index] = fresh;
  }
  return { pages: result, quality: workbookQuality(result) };
}

export interface PageUse { page: number; fraction: number | null }

/** Vertical use of the measured content area. Do not call this an ink-area
 * measurement: writing and work spaces are intentional page content. */
export function measuredPageUse(measured: readonly { sheet: number; name: string; y: number; height: number; visible: boolean }[]): PageUse[] {
  return [...new Set(measured.map(m => m.sheet))].map(sheet => {
    const content = measured.find(m => m.sheet === sheet && m.name === "slot-content");
    const blocks = measured.filter(m => m.sheet === sheet && /^block-\d+$/.test(m.name) && m.visible && m.height > 0);
    const fraction = content && content.height > 0 && blocks.length ? Math.min(1, Math.max(0, (Math.max(...blocks.map(b => b.y + b.height)) - content.y) / content.height)) : null;
    return { page: sheet + 1, fraction };
  });
}
