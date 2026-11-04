import { pageFullness, pageSpace, fullnessProblem } from "./workbook-template";
import type { DraftPage, MeasuredElement } from "./workbook-render";
import type { GeneratedPage } from "./workbook-generator";
import { STORY_EXPLAIN } from "./workbook-item-plan";
import { hyphenMinus, takeAwayProblem } from "./workbook-wording";
import { codeStoryProblem } from "./workbook-code-story";
import { numberAnswer } from "./workbook-generator-items";
import { likelihoodChoicesProblem, likelihoodWord } from "./workbook-likelihood";
import { extraPracticeRepeats, newIdeaFloor, twoWaysCountsAsStory } from "./workbook-early-levels";
import { dayTimeProblem, estimatedDayMinutes } from "./workbook-feedback-check";
import { printedNumbers } from "./workbook-book";
import { storyFrame, wordedTask, taskType, reasoningSteps, taskIdentity, printedForm, sentenceFrameOf, stemOf, largestNumber, storyKind, cardFrame, cardFrameProblem, cardNumbers, operationStory, type CardFrameUse } from "./workbook-task-identity";
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
  /** Extra practice questions that ask a task of the book once more (the U4 to U9 rule, D-226). */
  extraRepeats?: number;
  failedRate: number;
  dropped: number;
  days: DayQuality[];
  issues: BookIssue[];
  ready: boolean;
}

/** Planning estimate, not a claim about a child's measured completion time. */
/** A Challenge page whose step keeps fewer than 3 templates for it: it may repeat their forms and frames (#489). */
export function fewChallengePage(p: GeneratedPage): boolean {
  const printed = p.questions.filter(q => q.package && q.place !== "warm-up");
  return printed.length > 0 && printed.every(q => q.place === "challenge" && q.itemPlan?.template) && Math.max(1, ...printed.map(q => q.itemPlan!.template!.challengeTemplates ?? 3)) < 3;
}

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
/** What the half-page rule counts a question as: a step template item by its printed form, else its task type. */
export function typeKey(p: Pick<GeneratedPage, "type">, q: Pick<GeneratedPage["questions"][number], "itemPlan" | "package">): string {
  if (q.itemPlan?.template) return printedForm(q.package!);
  return ["word-problems", "challenge"].includes(p.type) && wordedTask(q.package!) ? storyFrame(q.package!.text) : taskType(q.package!);
}

/** Inspect actual questions, not the promised schedule or a model's score. */
/**
 * A page type's fewest practice and review items (Cedric's section 8 table; about 25% fewer from U19): capacity
 * plans fewer items than this only by reporting the omission, and the book check fails a page below it. (U4 to U9: a
 * new idea's floor is 2, D-226, workbook-early-levels.ts.)
 */
export function pageMinimum(type: string, level: number, extra: boolean): number {
  // The adopted counts (Cedric's section 8, #482 review at db3b1a0): 8 to 10 practice questions on a practice or review
  // page, a new idea's 3 to 5 beside its Spot the error. Spot the error and Solve it two ways do not count toward them.
  // (A review page that also carries a Mixed set and a Challenge, 6 pages a day, has no adopted count: its Mixed set's 4.)
  // Every day page kind has its count (Codex at 47c5fd78); a warm-up page's is its one In your head question.
  const FLOORS: Record<string, number> = { practice: 8, "practice-2": 8, "remember-these": 8, "remember-these-mixed-set": 4, "friday-5": 9,
    "word-problems": 3, challenge: 3, "math-in-the-world": 2, "show-what-you-know": 4, "unit-b": 4, "level-test": 4, "mini-test": 4,
    "already-know-it": 4, "warm-up": 1 };
  const n = extra ? 8 : type === "new-idea" ? newIdeaFloor(level) : FLOORS[type] ?? 1;
  // From U19 three quarters: Cedric's upper band (a new idea's 3 becomes 2 there, as his table has it; Savar, 2026-11-03).
  return level >= 19 ? Math.max(1, Math.round(n * .75)) : n;
}

/** Spot the error and Solve it two ways do not count toward a page's practice questions. */
const NOT_COUNTED: ReadonlySet<string> = new Set(["spot-the-error", "solve-it-two-ways", "warm-up", "how-do-you-know"]);

/** Words of an answer expression that are not its numbers (functions and keywords). */
const ANSWER_WORDS: ReadonlySet<string> = new Set(["if", "else", "and", "or", "not", "in", "str", "int", "max", "min", "abs", "round", "floor", "ceil", "sqrt", "isqrt", "gcd", "lcm", "sum", "len", "sorted", "Fraction", "True", "False"]);

export function workbookQuality(pages: readonly GeneratedPage[]): BookQuality {
  const issues: BookIssue[] = [];
  const days: DayQuality[] = [];
  const seen = new Map<string, number[]>();
  let extraRepeats = 0;
  const storyUses = new Map<string, { page: number; day: number | null }[]>();
  const types = new Map<string, number>();
  const all = pages.flatMap(p => p.questions).filter(q => q.package && q.place !== "warm-up");
  for (const p of pages) {
    // A Number stories page mixes its kinds of story (the U4 review: three "gets 2 more"): two stories or more, two kinds.
    if (p.type === "word-problems") {
      const stories = p.questions.filter(q => q.package && ["word-problems", "solve-it-two-ways"].includes(q.place ?? "")).map(q => storyKind(q.package!.text)).filter(Boolean);
      if (stories.length >= 2 && new Set(stories).size < 2) issues.push({ page: p.number, kind: "variety", reason: `the stories page tells one kind of story (${stories[0]}); it needs at least two` });
      // (Three kinds where it has three stories, at every level: two take-aways and a join on the real U16 r17's Word
      // problems, Savar 2026-11-04.)
      // (From U10; U4 to U9 keep two kinds, their stories being the few young steps' joins, take-aways and compares.)
      else if ((p.content?.kind === "day" ? p.content.level : 0) >= 10 && new Set(stories).size < Math.min(3, stories.length)) issues.push({ page: p.number, kind: "variety", reason: `the stories page tells ${stories.length} stories of ${new Set(stories).size} kinds; it needs ${Math.min(3, stories.length)} (join, take-away, compare)` });
    }
    // A circled choice on a page whose instruction never says to circle fails (Savar, 2026-11-04).
    if (p.content?.kind === "day" && p.questions.some(q => q.package && q.place !== "warm-up" && (q.package.item?.regions ?? []).some(r => r.kind === "choice" && r.mark !== "tick")) && !/\bcircle\b/i.test(p.content.subtitle ?? ""))
      issues.push({ page: p.number, kind: "coverage", reason: "the page has a question to circle, but its instruction does not say to circle" });
    // A minus between numbers prints as "−" (the U16 r14 review): a hyphen there fails.
    for (const q of p.questions) if (q.package && hyphenMinus(q.package.text)) issues.push({ page: p.number, kind: "coverage", reason: `question ${q.number} prints a hyphen as a minus ("${q.package.text.slice(0, 40)}")` });
    // A story's numbers and question are code's (Codex at e6d79b6a, B1): its plan's text, or code's wording of its
    // operation, with only the person and the thing changed.
    for (const q of p.questions) {
      const problem = q.package && q.place !== "how-do-you-know" ? codeStoryProblem(q.package, q.itemPlan?.item?.text ?? q.codeText) : null;
      if (problem) issues.push({ page: p.number, kind: "coverage", reason: `question ${q.number}: ${problem}` });
    }
    // A take-away story takes the things away (Codex at 24751f16, P0): every question, whatever wrote it.
    for (const q of p.questions) {
      const problem = q.package ? takeAwayProblem(q.package.text, numberAnswer(q.package)) : null;
      if (problem) issues.push({ page: p.number, kind: "coverage", reason: `question ${q.number}: ${problem}` });
    }
    // A stories page prints stories only (the real U16 r13: "Missing number: 10 000 − ? = 4913" on Word problems):
    // every question in its stories (two ways there too) has a person or a thing, whatever wrote it.
    if (p.type === "word-problems") for (const q of p.questions) {
      if (!q.package || !["word-problems", "picture-stories", "solve-it-two-ways"].includes(q.place ?? "")) continue;
      if (!printedForm(q.package).startsWith("context:") || !operationStory(q.package, q.itemPlan?.template?.source?.answer)) issues.push({ page: p.number, kind: "coverage", reason: `question ${q.number} on the stories page is no story with an operation ("${q.package.text.slice(0, 40)}")` });
    }
    // A practice page practises its own step: at least half its practice questions (Codex at 47c5fd78: U16's Day 4
    // Practice 2 printed 13 review questions and 1 on "Place value to millions").
    if (p.content?.kind === "day" && p.content.level >= 4 && ["practice", "practice-2"].includes(p.type) && !p.content.extraPractice && p.expected?.length) {
      const practice = p.questions.filter(q => q.package && q.check.status !== "failed" && !NOT_COUNTED.has(q.place ?? "") && q.place !== "remember-these");
      const ownStep = (q: GeneratedPage["questions"][number]) => { const first = p.expected?.find(e => e.slot === q.slot)?.steps?.[0]; const t = q.itemPlan?.template; return !first || !t || first === `${t.skill}#${t.step}`; };
      const own = practice.filter(ownStep).length;
      // (Half, or 3 for a step with few printable templates.)
      const need = Math.min(3, Math.ceil(practice.length / 2));
      // (From U10: at U4 to U9 a small step can run out of new tasks late in the book, D-226, and its page prints its
      // review under "Remember these".)
      if (p.content.level >= 10 && practice.length >= 4 && own < need) issues.push({ page: p.number, kind: "step", reason: `the page practises its own step in ${own} of ${practice.length} questions; it needs ${need}` });
    }
    // A step template page prints its type's adopted count of practice questions (Cedric's section 8); at U4 to U9 a
    // new idea's is 2, and two ways counts as a story on the Number stories page (D-226, workbook-early-levels.ts).
    // (Every page kind from U4, whatever wrote its questions: Codex at 47c5fd78 found a hand-built page skipped.)
    if (p.content?.kind === "day" && p.content.consistentLayout && p.content.level >= 4) {
      const level = p.content.level;
      const counted = p.questions.filter(q => q.package && q.check.status !== "failed" && (!NOT_COUNTED.has(q.place ?? "") || q.place === "solve-it-two-ways" && twoWaysCountsAsStory(level, p.type))).length;
      const floor = pageMinimum(p.type, level, !!p.content.extraPractice);
      if (counted < floor) issues.push({ page: p.number, kind: "coverage", reason: `the page prints ${counted} practice question${counted === 1 ? "" : "s"}; a ${p.type} page needs ${floor}` });
    }
    if (p.content?.kind === "day") {
      const c=p.content;
      const printed=[c.title,c.subtitle,...c.blocks.flatMap(b=>[b.label,b.note,b.explain,...b.lines ?? [],...b.methods?.flatMap(m=>[m.label,...m.lines]) ?? []]),...p.questions.flatMap(q=>q.package?[q.package.text]:[])].filter((text):text is string=>typeof text==="string");
      if (printed.some(text=>/\b(?:watch one|finish two|stretch you|unit [ab])\b/i.test(text) || c.level>=4 && /\b(?:draw|for the grown-up)\b/i.test(text))) issues.push({page:p.number,kind:"coverage",reason:"the printed page contains rejected workbook wording"});
      // Likelihood words: never, sometimes or always only, in every text and every choice (Savar's decision).
      const word=printed.map(likelihoodWord).find(Boolean) ?? p.questions.flatMap(q=>q.package?.item?.regions ?? []).flatMap(r=>r.kind==="choice" ? [likelihoodChoicesProblem(r.choices) ?? r.choices.map(likelihoodWord).find(Boolean) ?? null] : []).find(Boolean);
      if (word) issues.push({page:p.number,kind:"coverage",reason:`the page rates likelihood with "${word}"; use never, sometimes or always`});
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
    if ((p.leftOut?.length ?? 0) > 0 || p.omissions?.some(o => o.requested > o.placed && !o.time)) issues.push({ page: p.number, kind: "coverage", reason: "the page lost planned questions" });
    const questions = p.questions.filter(q => q.package && q.place !== "warm-up" && !q.existing);
    const counts = new Map<string, number>();
    for (const q of questions) {
      const key = typeKey(p, q);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      types.set(key, (types.get(key) ?? 0) + 1);
    }
    const total=p.questions.filter(q=>q.package && q.place!=="warm-up").length;
    const printed = p.questions.filter(q => q.package && q.place !== "warm-up");
    const forms = new Set(printed.map(q => printedForm(q.package!)));
    // A Challenge page asks its step's hardest questions only: it can show as many forms as the step keeps for it.
    const challengeOnly = printed.length > 0 && printed.every(q => q.place === "challenge" && q.itemPlan?.template);
    const need = challengeOnly ? Math.min(3, Math.max(1, ...printed.map(q => q.itemPlan!.template!.challengeTemplates ?? 3))) : 3;
    for (const [type, count] of counts) if (total >= 3 && count > Math.ceil(total / 2) && !(challengeOnly && need < 3)) issues.push({ page: p.number, kind: "variety", reason: `${type} fills ${count} of ${total} questions; the page limit is half, rounded up` });
    // Cedric's section 9 (adopted as written): at least 3 contexts or formats on a page, read from what is printed,
    // the existing writer's questions too; and no sentence frame twice on a page.
    if (printed.length >= 3 && forms.size < need) issues.push({ page: p.number, kind: "variety", reason: `the page prints ${forms.size} context${forms.size === 1 ? "" : "s"} or format${forms.size === 1 ? "" : "s"} (${[...forms].join(", ")}); it needs at least 3` });
    const pageFrames = new Map<string, number>();
    for (const q of printed) {
      if (q.place === "how-do-you-know" && STORY_EXPLAIN.test(q.package!.text)) continue;
      const frame = sentenceFrameOf(q.package!);
      if (!frame) continue;
      pageFrames.set(frame, (pageFrames.get(frame) ?? 0) + 1);
      // Once a page, the Challenge's too (the U16 review: three "saw the number N on a sign" cards).
      if (pageFrames.get(frame) === 2) issues.push({ page: p.number, kind: "variety", reason: `question ${q.number} uses the sentence frame "${frame}" a second time on the page` });
    }
    // From U16, a story or Challenge question from another step than its page's prints or answers a number of 100 or
    // more (the U16 review: "7 beads in each bag, 4 bags" on a Grade 5 stories page).
    for (const q of printed) {
      const t = q.itemPlan?.template;
      if (!t || (q.package!.level ?? 0) < 16 || !["word-problems", "picture-stories", "math-in-the-world", "challenge"].includes(q.place ?? "")) continue;
      const first = p.expected?.find(e => e.slot === q.slot)?.steps?.[0];
      if (!first || first === `${t.skill}#${t.step}`) continue;
      if (largestNumber(q.package!) < 100) issues.push({ page: p.number, kind: "progress", reason: `question ${q.number} is a single-digit fact from an earlier step; at this level a story works with larger numbers` });
    }
    // Show what you know asks each step's hardest version, numbers in the top half of the step's range.
    for (const q of printed) {
      const t = q.itemPlan?.template;
      if (q.place === "show-what-you-know" && t?.bounds && t.bounds.max >= 10 && largestNumber(q.package!) < t.bounds.min + (t.bounds.max - t.bounds.min) / 2) issues.push({ page: p.number, kind: "progress", reason: `Show what you know question ${q.number} uses small numbers for its step; this page asks each step's hardest` });
    }
    // Show what you know asks each step's hardest version: never an easy template of a step that has harder ones.
    for (const q of printed) {
      const t = q.itemPlan?.template;
      // (A step of this book's level: a late card reviewing an earlier level takes what is left of it.)
      if (q.place === "show-what-you-know" && t && t.difficulty === "easy" && t.hardest === false && Math.floor(t.rank / 10000) === (q.package!.level ?? 0)) issues.push({ page: p.number, kind: "progress", reason: `Show what you know question ${q.number} is an easy question of its step; this page asks each step's hardest` });
    }
    // A stem with no person in it ("In N, which digit is in the thousands place?") twice a page at most (the U16 review).
    const pageStems = new Map<string, number>();
    const pageTemplates = new Map<string, number>();
    for (const q of printed) {
      if (q.place === "how-do-you-know" || q.place === "spot-the-error" || q.place === "solve-it-two-ways") continue;
      // A template is one stem too (outside the Challenge, which asks each of its few once).
      const t = q.itemPlan?.template;
      if (t && q.place !== "challenge") {
        const k = `${t.skill}#${t.step}.${t.index}`;
        pageTemplates.set(k, (pageTemplates.get(k) ?? 0) + 1);
        if (pageTemplates.get(k) === 3) issues.push({ page: p.number, kind: "variety", reason: `question ${q.number} asks its template a third time on the page` });
      }
      const stem = stemOf(q.package!);
      if (!stem) continue;
      pageStems.set(stem, (pageStems.get(stem) ?? 0) + 1);
      if (pageStems.get(stem) === 3) issues.push({ page: p.number, kind: "variety", reason: `question ${q.number} asks "${stem}" a third time on the page` });
    }
    for (const q of p.questions.filter(q => q.place === "how-do-you-know" && !q.existing)) if (!STORY_EXPLAIN.test(q.package?.text ?? "") || !p.questions.some(s => ["word-problems", "picture-stories"].includes(s.place ?? "") && s.package && s.check.status !== "failed")) issues.push({ page: p.number, kind: "coverage", reason: "the explanation has no story on this page" });
  }
  for (const [type, count] of types) if (all.length >= 12 && count > all.length / 2) for (const p of pages.filter(p => p.questions.some(q => q.package && !q.existing && q.place !== "warm-up" && typeKey(p, q) === type))) issues.push({ page: p.number, kind: "variety", reason: `${type} exceeds half of the book's non-warm-up questions` });
  // A Challenge or Show what you know frame twice a book at most, never on two Challenge days in a row, with fresh
  // numbers (the U16 r13 review; Savar, 2026-11-03).
  const cards = new Map<string, (CardFrameUse & { page: number })[]>();
  for (const p of pages) for (const q of p.questions) {
    if (!q.package || (q.place !== "challenge" && q.place !== "show-what-you-know")) continue;
    const f = cardFrame(q.package);
    if (!f) continue;
    const use = { day: p.day, challenge: q.place === "challenge", numbers: cardNumbers(q.package), page: p.number };
    const uses = cards.get(f) ?? [];
    const problem = cardFrameProblem(uses, use);
    if (problem) issues.push({ page: p.number, kind: "repeat", reason: `question ${q.number}: ${problem} (page ${uses.map((u) => u.page).join(", ")}: "${q.package.text.slice(0, 40)}")` });
    cards.set(f, [...uses, use]);
  }
  // A worked example gives its answer away: its task is never a question of the book, nor another page's example,
  // before or after it (#482 review at db3b1a0).
  const examples = new Map<string, number[]>();
  for (const p of pages) for (const e of p.panelExamples ?? []) if (e) {
    const key = taskIdentity(e);
    const at = examples.get(key) ?? [];
    if (at.length) issues.push({ page: p.number, kind: "repeat", reason: `the worked example repeats the one on page ${at[0]}` });
    examples.set(key, [...at, p.number]);
  }
  for (const p of pages) for (const q of p.questions) {
    if (!q.package || q.place === "warm-up" || q.place === "how-do-you-know") continue;
    const at = examples.get(taskIdentity(q.package));
    if (at) issues.push({ page: p.number, kind: "repeat", reason: `question ${q.number} asks the task of the worked example on page ${at[0]}` });
  }
  for (const p of pages) for (const q of p.questions) {
    if (!q.package || q.place === "warm-up") continue;
    const pkg = q.package;
    if (q.place === "how-do-you-know" && STORY_EXPLAIN.test(pkg.text)) continue;
    // A step template item's sentence frames are limited by page and day instead (#489).
    // A story frame: code's own wordings print now (Codex at e6d79b6a, B1), so a frame comes back at most 3 times a book
    // (the planner's shape limit), never twice a day.
    if (!q.existing && wordedTask(pkg) && !q.itemPlan?.template) {
      const frame = storyFrame(pkg.text), before = storyUses.get(frame) ?? [];
      const sameDay = before.find((u) => u.day !== null && u.day === p.day);
      if (before.length >= 3 || sameDay) issues.push({ page: p.number, kind: "repeat", reason: `question ${q.number} repeats the story or event frame on page ${(sameDay ?? before[0]).page}` });
      storyUses.set(frame, [...before, { page: p.number, day: p.day }]);
    }
    // The task's mathematical data, not its printed form: "? = 9 × 2" repeats "9 × 2 = ?".
    const key = taskIdentity(pkg);
    const at = seen.get(key) ?? [];
    const limit = 1;
    // (U4 to U9, D-226: an extra practice page may ask a task of the book once more, 40 pages on.)
    const spaced = at.length === 1 && p.day === null && extraPracticeRepeats(pkg.level, true, at[0], p.number);
    if (spaced) extraRepeats++;
    if (at.includes(p.number) || at.length >= limit && !spaced) issues.push({ page: p.number, kind: "repeat", reason: `question ${q.number} repeats pages ${at.join(", ")} (limit ${limit})` });
    seen.set(key, [...at, p.number]);
  }
  for (const day of [...new Set(pages.flatMap(p => p.day === null ? [] : [p.day]))].sort((a, b) => a - b)) {
    const ofDay = pages.filter(p => p.day === day);
    // A worked example shows its method: a line after the question that is not its answer alone (Codex at db3b1a0 and
    // 47c5fd78: "Answer: 6 000" under "How it works" teaches nothing).
    for (const p of ofDay) if (p.content?.kind === "day" && p.content.level >= 4) for (const b of p.content.blocks.filter(b => ["worked-example", "watch-one"].includes(b.slot))) {
      // (A panel's explanation, the likelihood words' meanings, is its method too; a Watch out line is not.)
      const lines = [...(b.methods ?? []).flatMap(m => m.lines), ...(b.lines ?? []), ...(b.explain ? [b.explain] : [])].filter(l => !/^Watch out:/.test(l));
      if (!lines.length) continue;
      const asked = new Set((p.panelExamples ?? []).flatMap(e => e ? [e.text] : []));
      const method = lines.some((l, k) => k > 0 && !asked.has(l) && !/^Answer:/.test(l) && (l.replace(/\[[^\]]*\]/g, "").match(/[a-z]{2,}/gi) ?? []).length >= 2);
      if (!method) issues.push({ page: p.number, kind: "coverage", reason: `the worked example shows its answer without a method ("${lines[0].slice(0, 40)}")` });
    }
    // A worked example and a Watch out line once a day (the real U4 sample: one mistake on three pages of Day 1).
    const panelSeen = new Map<string, number>();
    for (const p of ofDay) if (p.content?.kind === "day") for (const b of p.content.blocks.filter(b => ["worked-example", "watch-one", "reminder"].includes(b.slot))) {
      // (The whole example, its lines together: two examples may share a question stem with other numbers.)
      const example = [...(b.lines ?? []), ...(b.methods ?? []).flatMap(m => m.lines)].filter(t => t !== b.explain).join(" / ");
      const texts = [b.explain?.startsWith("Watch out:") ? b.explain : null, example || null].filter((t): t is string => !!t);
      for (const t of new Set(texts)) {
        const at = panelSeen.get(t);
        if (at !== undefined && at !== p.number) issues.push({ page: p.number, kind: "repeat", reason: `the teaching panel repeats "${t.slice(0, 50)}" from page ${at}` });
        else panelSeen.set(t, p.number);
      }
    }
    const questions = ofDay.flatMap(p => p.questions);
    const practice = questions.filter(q => q.place !== "challenge" && q.package);
    // #489: a template Challenge takes the hardest step reached that day (Cedric's sections 1 and 9).
    // The day's teaching parts, not its reviews (Show what you know reviews the whole book).
    const reviewParts = new Set(["remember-these", "show-what-you-know", "friday-5", "mixed-set", "picture-stories", "fix-it", "unit-check", "already-know-it", "level-test", "mini-test"]);
    // (Not the Challenge's own questions: its later ones stretch to the step the child meets next. Not a story page's,
    // which may take stories from the steps the day reviews.)
    // (Only questions on their own page's step: a slot whose tasks ran out may take a taught step.)
    const ownStep = (q: GeneratedPage["questions"][number]) => {
      const page = ofDay.find(p => p.questions.includes(q));
      const first = page?.expected?.find(e => e.slot === q.slot)?.steps?.[0];
      return !first || first === `${q.itemPlan!.template!.skill}#${q.itemPlan!.template!.step}`;
    };
    const dayTop = Math.max(0, ...questions.flatMap(q => q.itemPlan?.template && q.place !== "warm-up" && q.place !== "challenge" && !["word-problems", "picture-stories"].includes(q.place ?? "") && !reviewParts.has(q.part) && ownStep(q) ? [q.itemPlan.template.rank] : []));
    for (const p of ofDay) {
      // A step that keeps fewer than 3 Challenge templates asks each once (the U16 review): the page's other cards are
      // hard questions of steps taught or reviewed before.
      const cards = p.questions.filter(q => q.place === "challenge" && !q.existing && q.itemPlan?.template);
      const seenTemplates = new Set<string>();
      for (const q of cards) {
        const t = q.itemPlan!.template!;
        const k = `${t.skill}#${t.step}.${t.index}`;
        if (t.rank === dayTop && (t.challengeTemplates ?? 3) < 3 && seenTemplates.has(k)) issues.push({ page: p.number, kind: "challenge", reason: `Day ${day}'s Challenge question ${q.number} asks its step's only Challenge template again` });
        seenTemplates.add(k);
      }
    }
    // (No card from an earlier step, Codex at 24751f16, B3: an earlier step's "hard" label asks less than the day's
    // practice; a card is compared by its step's level and rank first, then its difficulty.)
    for (const p of ofDay) for (const q of p.questions.filter(q => q.place === "challenge" && !q.existing && q.itemPlan?.template)) {
      const t = q.itemPlan!.template!;
      // Every question is on the hardest step reached that day (Cedric's brief; #482 review at db3b1a0), or is such a
      // card from an earlier step.
      if (t.rank < dayTop) issues.push({ page: p.number, kind: "challenge", reason: `Day ${day}'s Challenge question ${q.number} must use the hardest step reached that day, never an easier step than practice` });
      // Every question asks more than every question of the day's teaching on that step: Cedric's template difficulty
      // (easy, medium, hard), then the work (a computed answer above a circled choice), then on one template the larger
      // numbers. A context sentence or a larger unrelated number is no proof of more work.
      const level = (o: typeof q) => ["easy", "medium", "hard"].indexOf(o.itemPlan!.template!.difficulty);
      // (A circled choice, then a number to write, then a story to work out: "Which is more: 7 or 10?" asks less than
      // "Leah has 9 shells and gets 1 more".)
      const work = (o: typeof q) => o.itemPlan!.template!.kind === "choice" ? 0 : o.itemPlan!.template!.kind === "story" ? 2 : 1;
      const size = (o: typeof q) => Math.max(0, ...[o.package?.text ?? "", o.itemPlan!.template!.answer].flatMap(x => x.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number));
      const same = (a: typeof q, b: typeof q) => a.itemPlan!.template!.skill === b.itemPlan!.template!.skill && a.itemPlan!.template!.step === b.itemPlan!.template!.step && a.itemPlan!.template!.index === b.itemPlan!.template!.index;
      // (Then the numbers its answer combines, its steps: "a + b + c" asks two where "w - p" asks one, Codex at 24751f16.)
      const steps = (o: typeof q) => new Set(((o.itemPlan!.template!.source?.answer ?? "").replace(/'[^']*'|"[^"]*"/g, "").match(/\b[a-z_][a-z_0-9]*\b/gi) ?? []).filter((v) => !ANSWER_WORDS.has(v))).size;
      const above = (a: typeof q, b: typeof q) => level(a) !== level(b) ? level(a) > level(b) : work(a) !== work(b) ? work(a) > work(b) : steps(a) !== steps(b) ? steps(a) > steps(b) : same(a, b) && size(a) > size(b);
      const mine = questions.filter(o => o.itemPlan?.template && o.place !== "challenge" && o.place !== "warm-up" && !reviewParts.has(o.part) && ownStep(o) && o.itemPlan.template.rank === dayTop);
      // (Every card is on the day's hardest step, so it is compared with that step's practice of the day.)
      if (mine.length && !mine.every(o => above(q, o))) issues.push({ page: p.number, kind: "challenge", reason: `Day ${day}'s Challenge question ${q.number} is no harder than that day's practice of its step` });
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
      if (!q.package || q.place === "warm-up" || q.place === "how-do-you-know" && STORY_EXPLAIN.test(q.package.text)) continue;
      const frame = sentenceFrameOf(q.package);
      // Such a Challenge page counts each of its frames once.
      if (frame && fewChallengePage(p) && (dayFrames.get(frame) ?? []).includes(p.number)) continue;
      if (frame) dayFrames.set(frame, [...(dayFrames.get(frame) ?? []), p.number]);
    }
    for (const [frame, at] of dayFrames) if (at.length > 2) issues.push({ page: at[2], kind: "variety", reason: `Day ${day} uses the sentence frame "${frame}" ${at.length} times; the limit is 2 a day` });
    // Include time to read worked examples and move between pages.
    const packages = questions.flatMap(q => q.package ? [q.package] : []);
    const panels = ofDay.reduce((n,p)=>n + (p.content?.kind === "day" ? p.content.blocks.filter(b => ["worked-example", "watch-one", "reminder"].includes(b.slot)).length : 0),0);
    const minutes = Math.max(questions.reduce((n, q) => n + questionMinutes(q), 0) + ofDay.length * .35, estimatedDayMinutes(packages, panels));
    const largestNumber = Math.max(0, ...questions.flatMap(q => q.package ? printedNumbers({...q.package, wrongAnswers: [], easierExample: null}).map(Math.abs) : []));
    days.push({ day, minutes: Math.round(minutes * 10) / 10, formats: formats.size, largestNumber });
    if (minutes >= 35 || dayTimeProblem(packages, panels)) for (const p of ofDay) issues.push({ page: p.number, kind: "time", reason: `Day ${day} is estimated at ${minutes.toFixed(1)} minutes; keep it below 35` });
    if (questions.length >= 8 && formats.size < 2) for (const p of ofDay) issues.push({ page: p.number, kind: "variety", reason: `Day ${day} uses only ${formats.size} answer format` });
  }
  // Compare the numbers of the same skills, so changing Unit B does not hide a
  // flat main-unit sequence. A short review need not contain days 8 to 10.
  // Step template items show the step up by their steps instead (#489, the progression check below).
  // (A template page's "How can you check the first story?" asks about that story, not numbers of its own.)
  const stepItem = (q: GeneratedPage["questions"][number]) => !!q.itemPlan?.template || q.itemPlan?.type === "template";
  const skills = new Set(pages.flatMap(p => p.questions.flatMap(q => q.existing || stepItem(q) ? [] : q.package?.skill.skills ?? [])));
  for (const skill of skills) {
    // An earlier skill's fixed review range need not grow with the new unit.
    if (/make-10|partners-of-10|multiplication-facts|division-facts/.test(skill)) continue;
    if (skill.startsWith("K") && pages.some(p => p.questions.some(q => (q.package?.level ?? 0) > 3))) continue;
    const largest = (late: boolean) => Math.max(0, ...pages.filter(p => p.day !== null && (late ? p.day >= 8 : p.day <= 3)).flatMap(p => p.questions.flatMap(q => q.package?.skill.skills.includes(skill) && !stepItem(q) && !q.existing ? printedNumbers({...q.package, wrongAnswers: [], easierExample: null}).map(Math.abs) : [])));
    const early = largest(false), late = largest(true);
    if (early > 0 && late > 0 && late <= early) {
      for (const p of pages.filter(p => (p.day ?? 0) >= 8 && p.questions.some(q => q.package?.skill.skills.includes(skill)))) issues.push({ page: p.number, kind: "progress", reason: `${skill}: days 8 to 10 do not use bigger numbers than days 1 to 3 (${late} versus ${early})` });
    }
  }
  // #489: every template question belongs to its page's step (or a step its review draws from), every number it prints
  // is inside that step's ranges (Cedric's section 11), and the last day's steps are above the first day's.
  for (const p of pages) for (const q of p.questions) {
    const t = q.itemPlan?.template;
    // A hand-built item on a step slot keeps that slot's step numbers too (#482 review at db3b1a0: 100001 on a step to
    // 99999). Warm-up facts keep their whole fixed range; a written explanation has none.
    const slotBounds = p.expected?.find(e => e.slot === q.slot)?.bounds;
    if (!t && q.package && slotBounds && !q.existing && q.place !== "warm-up" && q.place !== "in-your-head" && q.place !== "how-do-you-know") {
      const out = (q.package.text.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).find(n => n < slotBounds.min || n > slotBounds.max);
      if (out !== undefined) issues.push({ page: p.number, kind: "range", reason: `question ${q.number} prints ${out}, outside its steps' range (${slotBounds.min} to ${slotBounds.max})` });
    }
    if (!t || !q.package) continue;
    const allowed = p.expected?.find(e => e.slot === q.slot)?.steps;
    if (allowed && !allowed.includes(`${t.skill}#${t.step}`)) issues.push({ page: p.number, kind: "step", reason: `question ${q.number} comes from ${t.skill} step ${t.step}, not one of the page's steps (${allowed.join(", ")})` });
    const out = t.bounds && (q.package.text.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).find(n => n < t.bounds!.min || n > t.bounds!.max);
    if (out !== undefined && out !== null && t.bounds) issues.push({ page: p.number, kind: "range", reason: `question ${q.number} prints ${out}, outside ${t.skill} step ${t.step}'s range (${t.bounds.min} to ${t.bounds.max})` });
  }
  const steps = [...new Set(pages.flatMap(p => p.day === null ? [] : [p.day]))].sort((a, b) => a - b).flatMap(day => {
    // The day's teaching: not its reviews, its Challenge (which stretches) or its stories (which may come from reviewed steps).
    const review = new Set(["remember-these", "show-what-you-know", "friday-5", "mixed-set", "picture-stories", "fix-it", "unit-check", "already-know-it", "level-test", "mini-test"]);
    const teaching = (q: GeneratedPage["questions"][number]) => q.place !== "warm-up" && q.place !== "challenge" && q.place !== "word-problems" && q.place !== "picture-stories" && !review.has(q.part);
    const all = pages.filter(p => p.day === day).flatMap(p => p.questions.flatMap(q => q.itemPlan?.template && q.place !== "warm-up" ? [{ p, q }] : []));
    // (On their page's own step: a practice block's last questions review earlier steps.)
    const own = ({ p, q }: { p: GeneratedPage; q: GeneratedPage["questions"][number] }) => {
      const first = p.expected?.find(e => e.slot === q.slot)?.steps?.[0];
      return !first || first === `${q.itemPlan!.template!.skill}#${q.itemPlan!.template!.step}`;
    };
    const taught = all.filter(x => teaching(x.q) && own(x));
    const pick = (taught.length ? taught : all).map(x => x.q);
    const ranks = pick.map(q => q.itemPlan!.template!.rank);
    return ranks.length ? [{ day, average: Math.round(ranks.reduce((a, b) => a + b, 0) / ranks.length * 10) / 10 }] : [];
  });
  if (steps.length >= 2 && steps.at(-1)!.average <= steps[0].average) for (const p of pages.filter(p => p.day === steps.at(-1)!.day)) issues.push({ page: p.number, kind: "progress", reason: `Day ${steps.at(-1)!.day}'s steps (average ${steps.at(-1)!.average}) are not above Day ${steps[0].day}'s (${steps[0].average})` });
  const counted = pages.flatMap(p => p.questions.filter(q => q.package && q.place !== "warm-up"));
  const sources = { template: counted.filter(q => q.itemPlan?.template).length, handBuilt: counted.filter(q => q.itemPlan && !q.itemPlan.template).length, existing: counted.filter(q => q.existing).length, total: counted.length };
  const questions = pages.flatMap(p => p.questions);
  const failedRate = questions.length ? questions.filter(q => q.check.status === "failed").length / questions.length : 1;
  return { steps, sources, extraRepeats, failedRate, dropped: pages.reduce((n, p) => n + Math.max(p.leftOut?.length ?? 0, (p.omissions ?? []).filter(o => !o.time).reduce((n,o)=>n + Math.max(0,o.requested-o.placed),0)), 0), days, issues,
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
