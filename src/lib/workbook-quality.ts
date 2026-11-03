import { pageFullness } from "./workbook-template";
import type { DraftPage, MeasuredElement } from "./workbook-render";
import type { GeneratedPage } from "./workbook-generator";
import { dayTimeProblem, estimatedDayMinutes } from "./workbook-feedback-check";
import { printedNumbers } from "./workbook-book";
import { storyFrame, wordedTask, taskType, reasoningSteps } from "./workbook-task-identity";
import { dayDifficulty } from "./workbook-plan";

export interface BookIssue { page: number; kind: "repeat" | "progress" | "variety" | "time" | "coverage" | "challenge"; reason: string }
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
  const frames = new Map<string, number>();
  const types = new Map<string, number>();
  const all = pages.flatMap(p => p.questions).filter(q => q.package && q.place !== "warm-up");
  for (const p of pages) {
    if (p.day !== null && p.questions.length === 0) issues.push({ page: p.number, kind: "coverage", reason: "a day page has no planned questions" });
    for (const expected of p.expected ?? []) {
      if (!p.questions.some(q => q.slot === expected.slot && q.package && q.check.status !== "failed")) issues.push({ page: p.number, kind: "coverage", reason: `required planned slot ${expected.slot} (${expected.part}) is missing or failed` });
    }
    const friday = p.type === "friday-5" || (p.expected ?? []).some(q => q.part === "friday-5") || p.questions.some(q => q.part === "friday-5") || p.omissions?.some(o => o.kind === "friday-5");
    if (friday && p.questions.filter(q => q.part === "friday-5" && q.package && q.check.status !== "failed").length !== 5) issues.push({ page: p.number, kind: "coverage", reason: "Friday 5 must contain five sound questions" });
    if ((p.leftOut?.length ?? 0) > 0 || p.omissions?.some(o => o.requested > o.placed)) issues.push({ page: p.number, kind: "coverage", reason: "the page lost planned questions" });
    const questions = p.questions.filter(q => q.package && q.place !== "warm-up");
    const counts = new Map<string, number>();
    for (const q of questions) {
      const key = taskType(q.package!);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      types.set(key, (types.get(key) ?? 0) + 1);
    }
    for (const [type, count] of counts) if (questions.length >= 3 && count > Math.ceil(questions.length / 2)) issues.push({ page: p.number, kind: "variety", reason: `${type} fills ${count} of ${questions.length} questions; the page limit is half, rounded up` });
    for (const q of p.questions.filter(q => q.place === "how-do-you-know")) if (!/first story on this page/i.test(q.package?.text ?? "") || !p.questions.some(s => ["word-problems", "picture-stories"].includes(s.place ?? "") && s.package && s.check.status !== "failed")) issues.push({ page: p.number, kind: "coverage", reason: "the explanation has no story on this page" });
  }
  for (const [type, count] of types) if (all.length >= 12 && count > all.length / 2) for (const p of pages.filter(p => p.questions.some(q => q.package && taskType(q.package) === type))) issues.push({ page: p.number, kind: "variety", reason: `${type} exceeds half of the book's non-warm-up questions` });
  for (const p of pages) for (const q of p.questions) {
    if (!q.package || q.place === "warm-up") continue;
    const pkg = q.package;
    if (q.place === "how-do-you-know" && /first story on this page/.test(pkg.text)) continue;
    if (wordedTask(pkg)) {
      const frame = storyFrame(pkg.text), before = frames.get(frame);
      if (before !== undefined) issues.push({ page: p.number, kind: "repeat", reason: `question ${q.number} repeats the story or event frame on page ${before}` });
      else frames.set(frame, p.number);
    }
    const key = JSON.stringify([pkg.text, pkg.operation, pkg.item?.checks, pkg.item?.figure]);
    const at = seen.get(key) ?? [];
    const limit = pkg.textSource === "code" ? 3 : 1;
    if (at.includes(p.number) || at.length >= limit) issues.push({ page: p.number, kind: "repeat", reason: `question ${q.number} repeats pages ${at.join(", ")} (limit ${limit})` });
    seen.set(key, [...at, p.number]);
  }
  for (const day of [...new Set(pages.flatMap(p => p.day === null ? [] : [p.day]))].sort((a, b) => a - b)) {
    const ofDay = pages.filter(p => p.day === day);
    const questions = ofDay.flatMap(p => p.questions);
    const practice = questions.filter(q => q.place !== "challenge" && q.package);
    for (const p of ofDay) for (const q of p.questions.filter(q => q.place === "challenge")) {
      const pkg = q.package;
      const demand = pkg ? reasoningSteps(pkg) : 0;
      const cap = pkg ? dayDifficulty(pkg.level, day).numberRange.max : undefined;
      const top = pkg ? Math.max(0, ...printedNumbers({ ...pkg, wrongAnswers: [], easierExample: null })) : 0;
      if (!pkg || pkg.item?.format === "circle" || !pkg.operation || demand <= Math.max(1, ...practice.map(q => reasoningSteps(q.package!))) || cap !== undefined && top < cap) issues.push({ page: p.number, kind: "challenge", reason: `Day ${day}'s Challenge must use the day's top number and require more reasoning steps than practice` });
    }
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
  return { failedRate, dropped: pages.reduce((n, p) => n + Math.max(p.leftOut?.length ?? 0, (p.omissions ?? []).reduce((n,o)=>n + Math.max(0,o.requested-o.placed),0)), 0), days, issues,
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
export function measuredPageUse(pages: readonly DraftPage[], measured: readonly MeasuredElement[]): PageUse[] {
  return pages.map((page, sheet) => ({ page: page.number, fraction: pageFullness(page, new Map(measured.filter(m=>m.sheet===sheet).map(m=>[m.name,m]))) }));
}
