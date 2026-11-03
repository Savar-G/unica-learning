import { pageFullness, pageSpace, fullnessProblem } from "./workbook-template";
import type { DraftPage, MeasuredElement } from "./workbook-render";
import type { GeneratedPage } from "./workbook-generator";
import { dayTimeProblem, estimatedDayMinutes } from "./workbook-feedback-check";
import { printedNumbers } from "./workbook-book";
import { storyFrame, wordedTask, taskType, reasoningSteps, taskIdentity, printedForm, sentenceFrameOf } from "./workbook-task-identity";
import { dayDifficulty } from "./workbook-plan";

export interface BookIssue { page: number; kind: "repeat" | "progress" | "variety" | "time" | "coverage" | "challenge" | "step" | "range"; reason: string }
export interface DayQuality { day: number; minutes: number; formats: number; largestNumber: number }
export interface BookQuality {
  /**
   * #489: the average step rank of each day's step template questions (the progression check: the last day above the
   * first), and where the book's questions come from: step templates, #482's hand-built builders, the existing writer.
   */
  steps?: { day: number; average: number }[];
  sources?: { template: number; handBuilt: number; existing: number; total: number };
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

/** A question's type for the half-page and half-book limits: a step template item's context or format (#489), else its task. */
function typeKey(p: GeneratedPage, q: GeneratedPage["questions"][number]): string {
  if (q.itemPlan?.template) return printedForm(q.package!);
  return ["word-problems", "challenge"].includes(p.type) && wordedTask(q.package!) ? storyFrame(q.package!.text) : taskType(q.package!);
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
    if (p.content?.kind === "day") {
      const c=p.content;
      const printed=[c.title,c.subtitle,...c.blocks.flatMap(b=>[b.label,b.note,b.explain,...b.lines ?? [],...b.methods?.flatMap(m=>[m.label,...m.lines]) ?? []]),...p.questions.flatMap(q=>q.package?[q.package.text]:[])].filter((text):text is string=>typeof text==="string");
      if (printed.some(text=>/\b(?:watch one|finish two|stretch you|unit [ab])\b/i.test(text) || c.level>=4 && /\b(?:draw|for the grown-up)\b/i.test(text))) issues.push({page:p.number,kind:"coverage",reason:"the printed page contains rejected workbook wording"});
    }
    if(p.content?.kind==="day") for(const block of p.content.blocks.filter(b=>["worked-example","watch-one","reminder"].includes(b.slot))) {
      if (!block.methods?.some(m=>m.lines.some(line=>line.trim())) && !block.lines?.some(line=>line.trim()) && !block.figure) issues.push({page:p.number,kind:"coverage",reason:`the required ${block.slot} panel has no teaching example`});
    }
    if ((p.day !== null || p.content?.kind === "day") && p.questions.length === 0) issues.push({ page: p.number, kind: "coverage", reason: "a day page has no planned questions" });
    for (const expected of p.expected ?? []) {
      if (!p.questions.some(q => q.slot === expected.slot && q.package && q.check.status !== "failed")) issues.push({ page: p.number, kind: "coverage", reason: `required planned slot ${expected.slot} (${expected.part}) is missing or failed` });
    }
    const friday = p.type === "friday-5" || (p.expected ?? []).some(q => q.part === "friday-5") || p.questions.some(q => q.part === "friday-5") || p.omissions?.some(o => o.kind === "friday-5");
    if (friday && p.questions.filter(q => q.part === "friday-5" && q.package && q.check.status !== "failed").length !== 5) issues.push({ page: p.number, kind: "coverage", reason: "Friday 5 must contain five sound questions" });
    if ((p.leftOut?.length ?? 0) > 0 || p.omissions?.some(o => o.requested > o.placed)) issues.push({ page: p.number, kind: "coverage", reason: "the page lost planned questions" });
    const questions = p.questions.filter(q => q.package && q.place !== "warm-up" && !q.existing);
    const counts = new Map<string, number>();
    for (const q of questions) {
      const key = typeKey(p, q);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      types.set(key, (types.get(key) ?? 0) + 1);
    }
    const total=p.questions.filter(q=>q.package && q.place!=="warm-up").length;
    for (const [type, count] of counts) if (total >= 3 && count > Math.ceil(total / 2)) issues.push({ page: p.number, kind: "variety", reason: `${type} fills ${count} of ${total} questions; the page limit is half, rounded up` });
    // Cedric's section 9 (adopted as written): at least 3 contexts or formats on a page, read from what is printed,
    // the existing writer's questions too; and no sentence frame twice on a page.
    const printed = p.questions.filter(q => q.package && q.place !== "warm-up");
    const forms = new Set(printed.map(q => printedForm(q.package!)));
    if (printed.length >= 3 && forms.size < 3) issues.push({ page: p.number, kind: "variety", reason: `the page prints ${forms.size} context${forms.size === 1 ? "" : "s"} or format${forms.size === 1 ? "" : "s"} (${[...forms].join(", ")}); it needs at least 3` });
    const pageFrames = new Map<string, number>();
    for (const q of printed) {
      if (q.place === "how-do-you-know" && /first story on this page/i.test(q.package!.text)) continue;
      const frame = sentenceFrameOf(q.package!);
      if (!frame) continue;
      pageFrames.set(frame, (pageFrames.get(frame) ?? 0) + 1);
      if (pageFrames.get(frame) === 2) issues.push({ page: p.number, kind: "variety", reason: `question ${q.number} uses the sentence frame "${frame}" a second time on the page` });
    }
    for (const q of p.questions.filter(q => q.place === "how-do-you-know" && !q.existing)) if (!/first story on this page/i.test(q.package?.text ?? "") || !p.questions.some(s => ["word-problems", "picture-stories"].includes(s.place ?? "") && s.package && s.check.status !== "failed")) issues.push({ page: p.number, kind: "coverage", reason: "the explanation has no story on this page" });
  }
  for (const [type, count] of types) if (all.length >= 12 && count > all.length / 2) for (const p of pages.filter(p => p.questions.some(q => q.package && !q.existing && q.place !== "warm-up" && typeKey(p, q) === type))) issues.push({ page: p.number, kind: "variety", reason: `${type} exceeds half of the book's non-warm-up questions` });
  for (const p of pages) for (const q of p.questions) {
    if (!q.package || q.place === "warm-up") continue;
    const pkg = q.package;
    if (q.place === "how-do-you-know" && /first story on this page/.test(pkg.text)) continue;
    // A step template item's sentence frames are limited by page and day instead (#489).
    if (!q.existing && wordedTask(pkg) && !q.itemPlan?.template) {
      const frame = storyFrame(pkg.text), before = frames.get(frame);
      if (before !== undefined) issues.push({ page: p.number, kind: "repeat", reason: `question ${q.number} repeats the story or event frame on page ${before}` });
      else frames.set(frame, p.number);
    }
    // The task's mathematical data, not its printed form: "? = 9 × 2" repeats "9 × 2 = ?".
    const key = taskIdentity(pkg);
    const at = seen.get(key) ?? [];
    const limit = 1;
    if (at.includes(p.number) || at.length >= limit) issues.push({ page: p.number, kind: "repeat", reason: `question ${q.number} repeats pages ${at.join(", ")} (limit ${limit})` });
    seen.set(key, [...at, p.number]);
  }
  for (const day of [...new Set(pages.flatMap(p => p.day === null ? [] : [p.day]))].sort((a, b) => a - b)) {
    const ofDay = pages.filter(p => p.day === day);
    const questions = ofDay.flatMap(p => p.questions);
    const practice = questions.filter(q => q.place !== "challenge" && q.package);
    // #489: a template Challenge takes the hardest step reached that day (Cedric's sections 1 and 9).
    const dayTop = Math.max(0, ...questions.flatMap(q => q.itemPlan?.template && q.place !== "warm-up" && q.part !== "remember-these" ? [q.itemPlan.template.rank] : []));
    for (const p of ofDay) for (const q of p.questions.filter(q => q.place === "challenge" && !q.existing && q.itemPlan?.template)) {
      const t = q.itemPlan!.template!;
      if (t.rank < dayTop) issues.push({ page: p.number, kind: "challenge", reason: `Day ${day}'s Challenge must use the hardest step reached that day, never an easier step than practice` });
    }
    for (const p of ofDay) for (const q of p.questions.filter(q => q.place === "challenge" && !q.existing && !q.itemPlan?.template)) {
      const pkg = q.package;
      const demand = pkg ? reasoningSteps(pkg) : 0;
      const cap = pkg ? dayDifficulty(pkg.level, day).numberRange.max : undefined;
      const top = pkg ? Math.max(0, ...printedNumbers({ ...pkg, wrongAnswers: [], easierExample: null })) : 0;
      if (!pkg || pkg.item?.format === "circle" || !pkg.operation || demand <= Math.max(1, ...practice.map(q => reasoningSteps(q.package!))) || cap !== undefined && top < cap) issues.push({ page: p.number, kind: "challenge", reason: `Day ${day}'s Challenge must use the day's top number and require more reasoning steps than practice` });
    }
    const formats = new Set(questions.flatMap(q => q.package?.item ? [q.package.item.format] : []));
    // A sentence frame at most twice a day (Cedric's section 9).
    const dayFrames = new Map<string, number[]>();
    for (const p of ofDay) for (const q of p.questions) {
      if (!q.package || q.place === "warm-up" || q.place === "how-do-you-know" && /first story on this page/i.test(q.package.text)) continue;
      const frame = sentenceFrameOf(q.package);
      if (frame) dayFrames.set(frame, [...(dayFrames.get(frame) ?? []), p.number]);
    }
    for (const [frame, at] of dayFrames) if (at.length > 2) issues.push({ page: at[2], kind: "variety", reason: `Day ${day} uses the sentence frame "${frame}" ${at.length} times; the limit is 2 a day` });
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
  // Step template items show the step up by their steps instead (#489, the progression check below).
  const skills = new Set(pages.flatMap(p => p.questions.flatMap(q => q.existing || q.itemPlan?.template ? [] : q.package?.skill.skills ?? [])));
  for (const skill of skills) {
    // An earlier skill's fixed review range need not grow with the new unit.
    if (/make-10|partners-of-10|multiplication-facts|division-facts/.test(skill)) continue;
    if (skill.startsWith("K") && pages.some(p => p.questions.some(q => (q.package?.level ?? 0) > 3))) continue;
    const largest = (late: boolean) => Math.max(0, ...pages.filter(p => p.day !== null && (late ? p.day >= 8 : p.day <= 3)).flatMap(p => p.questions.flatMap(q => q.package?.skill.skills.includes(skill) && !q.itemPlan?.template ? printedNumbers({...q.package, wrongAnswers: [], easierExample: null}).map(Math.abs) : [])));
    const early = largest(false), late = largest(true);
    if (early > 0 && late > 0 && late <= early) {
      for (const p of pages.filter(p => (p.day ?? 0) >= 8 && p.questions.some(q => q.package?.skill.skills.includes(skill)))) issues.push({ page: p.number, kind: "progress", reason: `${skill}: days 8 to 10 do not use bigger numbers than days 1 to 3 (${late} versus ${early})` });
    }
  }
  // #489: every template question belongs to its page's step (or a step its review draws from), every number it prints
  // is inside that step's ranges (Cedric's section 11), and the last day's steps are above the first day's.
  for (const p of pages) for (const q of p.questions) {
    const t = q.itemPlan?.template;
    if (!t || !q.package) continue;
    const allowed = p.expected?.find(e => e.slot === q.slot)?.steps;
    if (allowed && !allowed.includes(`${t.skill}#${t.step}`)) issues.push({ page: p.number, kind: "step", reason: `question ${q.number} comes from ${t.skill} step ${t.step}, not one of the page's steps (${allowed.join(", ")})` });
    const out = t.bounds && (q.package.text.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).find(n => n < t.bounds!.min || n > t.bounds!.max);
    if (out !== undefined && out !== null && t.bounds) issues.push({ page: p.number, kind: "range", reason: `question ${q.number} prints ${out}, outside ${t.skill} step ${t.step}'s range (${t.bounds.min} to ${t.bounds.max})` });
  }
  const steps = [...new Set(pages.flatMap(p => p.day === null ? [] : [p.day]))].sort((a, b) => a - b).flatMap(day => {
    const ranks = pages.filter(p => p.day === day).flatMap(p => p.questions.flatMap(q => q.itemPlan?.template && q.place !== "warm-up" ? [q.itemPlan.template.rank] : []));
    return ranks.length ? [{ day, average: Math.round(ranks.reduce((a, b) => a + b, 0) / ranks.length * 10) / 10 }] : [];
  });
  if (steps.length >= 2 && steps.at(-1)!.average <= steps[0].average) for (const p of pages.filter(p => p.day === steps.at(-1)!.day)) issues.push({ page: p.number, kind: "progress", reason: `Day ${steps.at(-1)!.day}'s steps (average ${steps.at(-1)!.average}) are not above Day ${steps[0].day}'s (${steps[0].average})` });
  const counted = pages.flatMap(p => p.questions.filter(q => q.package && q.place !== "warm-up"));
  const sources = { template: counted.filter(q => q.itemPlan?.template).length, handBuilt: counted.filter(q => q.itemPlan && !q.itemPlan.template).length, existing: counted.filter(q => q.existing).length, total: counted.length };
  const questions = pages.flatMap(p => p.questions);
  const failedRate = questions.length ? questions.filter(q => q.check.status === "failed").length / questions.length : 1;
  return { steps, sources, failedRate, dropped: pages.reduce((n, p) => n + Math.max(p.leftOut?.length ?? 0, (p.omissions ?? []).reduce((n,o)=>n + Math.max(0,o.requested-o.placed),0)), 0), days, issues,
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

export interface PageUse { page: number; fraction: number | null; problem?: string | null; largestGap?: number; empty?: number }

/** Vertical use of the measured content area. Do not call this an ink-area
 * measurement: writing and work spaces are intentional page content. */
export function measuredPageUse(pages: readonly DraftPage[], measured: readonly MeasuredElement[]): PageUse[] {
  return pages.map((page, sheet) => {
    const map=new Map(measured.filter(m=>m.sheet===sheet).map(m=>[m.name,m]));
    const space=pageSpace(page,map);
    return {page:page.number,fraction:pageFullness(page,map),...(page.content?.kind==="day" && page.content.consistentLayout ? {problem:fullnessProblem(page,map),largestGap:space?.largestGap,empty:space?.empty} : {})};
  });
}
