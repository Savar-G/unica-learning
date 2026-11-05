import type { EditCall } from "@/lib/workbook-edit-calls";
// The workbook generator (#311, spec #296): a two-week plan (#308, src/lib/workbook-plan.ts) in, one coherent draft
// workbook out, stored as one unit through the draft store. The plan fixes every page and part; the AI fills the
// question slots of each page with content only (src/lib/workbook-generator-items.ts), one call per page; code
// computes every answer and worked step, and the answer checker (#306, #307, #362) runs on every question. The formats
// with no operation (places, order, compare, sequence, count, pattern) and the pictures are #377.
//
// - One AI call per day page fills its slots. Each slot comes with its room (textRoom, src/lib/workbook-template.ts:
//   the most characters its text has room for on the page) and its rules in plain words (the numbers, signs and ideas
//   its skills allow, digits only, an easier example with another answer). An AI call that throws (a time-out, a
//   refusal, output that is not JSON) is sent once more; if it throws again, its questions fail for that try.
// - Each question has one AI attempt, then at most one more for each reason: a failed check, and a page that does not
//   fit. A question that fails the check (or that the AI left out) is written again once, in one call for the page's
//   failed slots, with the reason; if it fails again it stays in the draft, marked failed with the reason. A question
//   code cannot check is kept, marked "not checked by code".
// - The fit check (FitCheck, a seam: the real templates' strict check, #310) runs on every page with questions. A page
//   that does not fit is written again once, every question shorter, with the problems and each text's length against
//   its room; of the two versions of a question the page keeps the sound one, and of two sound ones the shorter. If the
//   page still does not fit, it leaves out questions, one at a time, until it fits: the last question the fit check
//   names, else the page's last (on a parent-led page, it first tries its tall cards paired in rows). Nothing is shrunk.
// - The book plan (#380): before any AI call, code gives each slot its skill, kind of question, numbers and a person's
//   name, in book order (planBook): a page never has two slots on one pair of numbers, and each kind takes the pairs
//   the book has used least. A question that repeats one goes to the redo with the slot's spare numbers and next kind.
//   A sound question whose text runs past its room joins the same redo, to be written shorter (kept only if it is).
//   Round 6: each planned wording comes with what it works (its operation and picture); a slot of cards spreads them
//   across put together, take away, a missing part, compare and the ten-frame; and a repeat whose item is the planned
//   one takes the planned wording from code, with no AI call. Each question left out is in the page's `leftOut` and its part's
//   omission. A page keeps at least one question: if it does not fit with one, it keeps them all and is marked failed.
// - The book (CONTEXT.md sections 1 and 7, D-187, D-191): the cover (page 1), the How + Plan page, the ten days' pages
//   in plan order, the back cover, then blank pages to a multiple of 4. Page numbers run from the cover through the
//   book; question numbers restart on each page. The page type, day and numbers come from the plan and code, never from
//   the AI: the AI writes no layout, font, size or position.
// - Round 7 (R380-12-1): at U1 to U9 code prints its own wording of every whole-number +, -, missing part, × and ÷
//   (src/lib/workbook-wording.ts), filled from the operation the key comes from, and on a page the wording of a shape the
//   page does not have and the book has printed least. Every other printed text the AI wrote that has a key goes to the
//   solve check (GenerateDeps.solver, src/lib/workbook-solve-check.ts): a separate model answers it from the printed words
//   alone; a different answer, or a check that fails or is late, fails the question, which the redo writes once more.
//   The check is not a generation attempt.
// - Resumable runs (#312): with a page store (GenerateDeps.pages) each finished day page is kept as it is done, and a
//   later call with the same input writes only the missing ones; with an attempt ledger (GenerateDeps.attempts) each
//   AI attempt of a question or worked example is counted before its call, and a slot the ledger refuses is not asked
//   again (the job's ledger allows 3, one per reason: the first call, the check redo and the fit rewrite). The days
//   run in order; the pages of one day run at once (`concurrency`), and each of them reads what the days before asked
//   (the book memory), never its own day's other pages, so the draft is the same at any concurrency and after a resume.
//   With a call store (GenerateDeps.calls, R379-7-1) each AI call of a page is kept as it came back, built and
//   checked, with the attempts it counted, before anything else happens; a later call replays a page's kept calls in
//   order instead of asking again, so an attempt that was paid for is never lost or used twice, and a resumed page is
//   the page an uninterrupted run would have made.
//   R379-8-1: a call is kept as soon as the AI's answer is built, before its solve checks start; each solve check is
//   kept as it comes back, keyed by the call (book page and place) and the question's slot or panel, and a replay runs
//   only the checks that have no kept result. R379-8-2: a resume reads only what the run kept, checked against the book
//   this input plans: a kept page, attempt or call that does not fit the plan's pages and slots stops the generation
//   (ResumeMismatch), never mixing an old answer into a new plan. bookOutline gives the fingerprint of the planned book,
//   so a caller can refuse a resume whose curriculum, layouts or rooms changed.
// Pure TypeScript: no Next.js, React, network, database, clock or randomness (the caller passes the QR token maker).
import { BC_SKILL_MAP } from "@/lib/assessment";
import { withTimeLimit, type AiClient } from "@/lib/ai-client";
import { checkQuestionPackage, type QuestionPackage } from "@/lib/question-package";
import { isQrToken, isUuid } from "@/lib/workbook-content";
import type { Curriculum } from "@/lib/workbook-curriculum";
import { buildQuestion, isCodeWorded, ITEMS_SCHEMA, kindProblem, relationWordings, type BuiltQuestion, type QuestionCheck, type SlotWording } from "@/lib/workbook-generator-items";
import { isOneMoreLessSkill } from "@/lib/number-words";
import { solveCheck, solveReason, type SolveLog, type Solver, type SolveVerdict } from "@/lib/workbook-solve-check";
import { digestOf } from "@/lib/workbook-digest";
import { BOYS, fillFrame, frameDoes, framePair, framesFor, GIRLS, PEOPLE, THINGS, quantityStoryProblem, storyProblem, type Action, type WordingKind } from "@/lib/workbook-wording";
import {
  bookPageContent, dayPageContent, layoutDayPage, mistakesFor, rangeProblem, skillSigns, samFix, samProblem, skillRange, slotRanges, templateMethod, PANEL_SLOTS, SLOT_FORMATS, STRICT_SLOTS,
  type DayLayout, type NumberRange,
} from "@/lib/workbook-book";
import { pageId, type Omission, type PageContent, type SlotName } from "@/lib/workbook-page";
import { dayDifficulty, type PageType, type PlannedPage, type PlannedPart, type WorkbookPlan } from "@/lib/workbook-plan";
import { estimatedDayMinutes, scheduledItemProblem } from "@/lib/workbook-feedback-check";
import { workbookEditItem } from "@/lib/workbook-edit-item";
import type { DraftPage } from "@/lib/workbook-render";
import { textRoom, slotMax } from "@/lib/workbook-template";

import { checkWholeBook, pageMinimum, questionMinutes, typeKey, type BookQuality } from "@/lib/workbook-quality";
import { extraPracticeRepeats, twoWaysCountsAsStory } from "@/lib/workbook-early-levels";
import { approvedQuestionTypes, buildPlannedItem, planItem, itemExamples, itemNumber, ITEM_EXAMPLES, STORY_EXPLAIN, type ItemPlan } from "@/lib/workbook-item-plan";
import { isNumberStory } from "@/lib/workbook-code-story";
import { cardFrame, cardFrameProblem, cardNumbers, type CardFrameUse, largestNumber, operationStory, printedForm, sentenceFrameOf, stemOf, storyKind, storyFrame, taskIdentity, taskType, wordedTask } from "@/lib/workbook-task-identity";
import { COMPACT_STORY_FRAMES } from "@/lib/workbook-story-bank";
import { childSamMistakes, difficultyDay, daySchedule, INTEREST_SHARE, interestEligible, interestShareProblems, interestWords, printsInterest, shortStories, SHORT_STORY_WORDS, storyThings, styleKinds, templateSpotShown, warmUpFact, warmUpShareProblems, warmUpSkill, type WarmUpFact } from "@/lib/workbook-personal-items";
import { isTwoStep } from "@/lib/workbook-curriculum/house-templates";
import { buildStepItem, challengeTemplateCount, hasHardNumberTemplate, NO_TEMPLATE_PLACES, STEP_STORY_PLACES, stepAiItem, stepBounds, stepOf, stepRank, stepTemplateItem, stepTemplateOf, sumTemplate, templateProblem } from "@/lib/workbook-step-items";

/** A replacement must retain the practice page's own-step minimum before it can borrow review work. */
function needsOwnPractice(input: GenerateInput, w: PageWork, slot: Slot): boolean {
  // Four likelihood questions give a full pair in each U4 practice block before its earlier-step review rows.
  const youngLikelihood = input.plan.level === 4 && !!slot.part.step && /likelihood/.test(slot.part.step.skill);
  if ((input.plan.level < 10 && !youngLikelihood) || w.page.extraPractice || !["practice", "practice-2"].includes(w.page.type)) return false;
  const counted = (s: Slot) => !["remember-these", "spot-the-error", "solve-it-two-ways", "warm-up", "how-do-you-know"].includes(s.place ?? "");
  if (!slot.part.step || !counted(slot)) return false;
  const practice = w.slots.filter(counted);
  const own = practice.filter(s => s.id !== slot.id && s.contract && (!s.part.step || !s.contract.template
    || s.contract.template.skill === s.part.step.skill && s.contract.template.step === s.part.step.step)).length;
  return own < (youngLikelihood ? 4 : Math.min(3, Math.ceil(practice.length / 2)));
}

/** The slot's own step, or a step its review part draws from. Later attempts can borrow a taught step. */
function slotStep(input: GenerateInput, slot: Slot, attempt: number, level: number, day = 0, ownPractice = false): { skill: string; step: number } | null {
  const part = slot.part;
  if (part.step) {
    if (ownPractice) return { skill: part.step.skill, step: part.step.step };
    // A Challenge asks each of its step's Challenge templates once (the U16 review: three "saw the number on a sign"
    // cards); its other cards take a hard template of a step taught or reviewed by that day, largest numbers first.
    const review = challengeReviewSlot(input, slot, level, day);
    if (review) {
      const steps = challengeReviewSteps(input, slot, day, level);
      if (steps.length) return steps[(review - 1 + Math.floor(attempt / 6)) % steps.length];
    }
    if (slot.place === "solve-it-two-ways") {
      const sums = (x: { skill: string; step: number }) => stepOf(input.curriculum, x.skill, x.step)?.templates?.some(t => sumTemplate(t) && !templateProblem(t, level));
      const own = { skill: part.step.skill, step: part.step.step };
      if (!sums(own)) {
        const rank = stepRank(input.curriculum, own.skill, own.step) ?? 0;
        const prior = earlierSteps(input, slot, day, level, true)
          .filter(x => (stepRank(input.curriculum, x.skill, x.step) ?? Infinity) < rank && sums(x))
          .sort((a, b) => (stepRank(input.curriculum, b.skill, b.step) ?? 0) - (stepRank(input.curriculum, a.skill, a.step) ?? 0));
        if (prior.length) return prior[Math.floor(attempt / 6) % prior.length];
      }
    }
    const stretch = challengeStretch(input, slot, level, day, attempt);
    const stories = storySteps(input, slot, day, level);
    if (stories.length) return stories[Math.floor(attempt / 6) % stories.length];
    // The last questions of a practice block review an earlier step (the U16 and U4 reviews: a day mixes the new step
    // with earlier ones, not one task twenty times).
    const ordinal = Number(slot.id.split(".")[1]) || 1;
    if (!slot.refillOwnStep && (slot.place === "on-your-own" && ordinal >= 6 || slot.place === "practice-row" && ordinal >= 8) && attempt < LATE_ATTEMPT) {
      const earlier = earlierSteps(input, slot, day, level);
      if (earlier.length) return earlier[(ordinal + Math.floor(attempt / 12)) % earlier.length];
    }
    // Late attempts, when the step's own tasks have run out (late in a full book, or on a day of one small step): an
    // earlier step the book taught or the day reviews.
    if (attempt >= LATE_ATTEMPT && slot.place !== "challenge") {
      const taught = earlierSteps(input, slot, day, level, true);
      if (taught.length) return taught[((Number(slot.id.split(".")[1]) || 1) - 1 + Math.floor((attempt - LATE_ATTEMPT) / 6)) % taught.length];
    }
    return stretch ?? { skill: part.step.skill, step: part.step.step };
  }
  const own = part.reviewSteps;
  if (!own?.length) return null;
  // Late attempts, when its review steps have run out of tasks (the full U4 book's Day 8): every step the day reviews,
  // then every step the book has taught.
  const late = attempt >= LATE_ATTEMPT ? [...(input.plan.days.find((d) => d.day === day)?.pages ?? []).flatMap((p) => p.parts.flatMap((x) => x.reviewSteps ?? [])), ...taughtSteps(input, day, level)] : [];
  const list = [...new Map([...own, ...late].map((x) => [`${x.skill}#${x.step}`, x])).values()];
  const ordinal = (Number(slot.id.split(".")[1]) || 1) - 1;
  // G1: P6's checks of an early weak standard take the part's first items, their number each (C3's weakChecks).
  const checks = (part.weakChecks ?? []).flatMap((c) => Array.from({ length: c.items }, (_, i) => c.skills[i % c.skills.length]));
  if (ordinal < checks.length && attempt < 12) {
    const x = own.find((r) => r.skill === checks[ordinal]);
    const step = x && stepOf(input.curriculum, x.skill, x.step);
    if (x && step?.templates?.some((t) => !templateProblem(t, level))) return { skill: x.skill, step: step.number };
  }
  // From the slot's turn on, the first step that has a template this level can print.
  for (let k = 0; k < list.length; k++) {
    const x = list[(ordinal + Math.floor(attempt / 6) + k) % list.length];
    const step = stepOf(input.curriculum, x.skill, x.step);
    if (step?.templates?.some((t) => !templateProblem(t, level))) return { skill: x.skill, step: step.number };
  }
  return null;
}

/**
 * A slot's step template item (#489), or undefined when the slot is not one templates fill (no step, a warm-up fact,
 * a Mixed set, or a book before #489), or null when its step has no template that prints there. A question on a
 * ten-frame step keeps #482's "colour in N" builder on every third slot, with the step's own count range.
 */
function templateContractFor(input: GenerateInput, w: PageWork, slot: Slot, attempt: number): ItemPlan | null | undefined {
  if (input.itemPolicy !== "approved-v1" || !input.curriculum.contexts) return undefined;
  if (slot.place && NO_TEMPLATE_PLACES.has(slot.place) && slot.place !== "how-do-you-know") return undefined;
  const at = slotStep(input, slot, attempt, input.plan.level, w.day, needsOwnPractice(input, w, slot));
  if (!at) return undefined;
  const step = stepOf(input.curriculum, at.skill, at.step);
  if (!step?.templates?.length) return undefined;
  const level = input.plan.level;
  const bounds = stepBounds(step) ?? { min: 0, max: 0 };
  const dayRange = { min: bounds.min, max: bounds.max, pictures: false, help: "none" as const };
  // How do you know? asks how to check the page's first story, as #482's explanation does.
  if (slot.place === "how-do-you-know") {
    const item = stepAiItem(slot.id, { skill: at.skill, step: at.step, index: 0, format: "explain", difficulty: "medium", kind: "box", source: { answer: "0", check: null, derived: [], slots: [], values: null }, answer: "", frame: "", drill: false, rank: 0, bounds: null, hardest: false }, "How can you check the first story on this page?");
    return { type: "template", source: "explain", item: { ...item, format: "written-reason" }, numbers: [], dayRange };
  }
  const ordinal = (Number(slot.id.split(".")[1]) || 1) - 1;
  const frameStep = /ten-frame/i.test(`${step.name} ${step.representation}`) && approvedQuestionTypes(at.skill).includes("count") && level >= 4;
  // (Early attempts only: a later one, the capacity stage looking for a shorter question, takes a template.)
  if (frameStep && attempt < 8 && ordinal % 3 === 2 && slot.place && !STEP_STORY_PLACES.has(slot.place) && !["spot-the-error", "solve-it-two-ways"].includes(slot.place)) {
    const count = step.numbers?.count;
    if (count && !Array.isArray(count)) {
      const r = count as { min: number; max: number };
      const planned = planItem({ skill: at.skill, slot: slot.id, level, day: w.day, ordinal: w.number * 31 + ordinal + 1, attempt, range: { min: r.min, max: r.max, pictures: false, help: "none" } });
      if (planned?.type === "count" && planned.numbers[0] >= r.min && planned.numbers[0] <= r.max) return planned;
    }
  }
  const panel = /^e\d+$/.test(slot.id);
  // (A worked example's template does not turn with the page's questions: its task is chosen before them.)
  const used = new Map<number, number>();
  if (!panel) for (const s of w.slots) if (s !== slot && s.contract?.template && s.contract.template.skill === at.skill && s.contract.template.step === at.step) used.set(s.contract.template.index, (used.get(s.contract.template.index) ?? 0) + 1);
  // A template's text may wrap to twice a drill's room, or three of its lines: the measured capacity then plans the
  // page's items (#489).
  const drill = slot.place ? roomOf(input, slot.place, w.day) : null;
  // Spot the error prints its question above Sam's answer, so the measured fit alone decides its length.
  // Later attempts take longer templates too (U16: a page of only the short ones prints one form); the measured fit
  // then plans the page.
  // (A Show what you know card holds 3 lines, D-201: its room is 3 of its lines, not twice its 2-line room.)
  const card = slot.place === "show-what-you-know" || slot.place === "level-test";
  const room = drill && slot.place !== "spot-the-error" ? (card ? drill.perLine * 3 : Math.round(Math.max(drill.characters * 2, drill.perLine * 3) * (attempt >= 128 && LONGER_PLACES.has(slot.place!) ? 1.6 : 1))) : undefined;
  const fill = stepTemplateItem({
    curriculum: input.curriculum, skill: at.skill, step: at.step, place: panel ? "worked-example" : slot.place, level, day: difficultyDay(input.plan, w.day),
    seed: hashOf(`${input.workbookId}:${w.number}:${slot.id}`) % 1_000_000_007, attempt, ordinal, usedOnPage: used, room, avoid: input.book?.child || null,
    ...(slot.interest ? { interests: interestWords(input.plan) } : {}),
  });
  if (!fill) return null;
  // (A copy: the filler keeps its results, and a personal shown answer must not reach another request.)
  const filled = { ...fill };
  // G1 (item 3): the day's first Spot the error shows the child's own mistake when the step's pair is verified and the
  // sum allows it; else the template's plausible wrong answer, as today.
  if (slot.place === "spot-the-error" && filled.ref.kind === "spot" && samPrefer(input, w).length) {
    const shown = templateSpotShown(input.curriculum, input.plan, at.skill, at.step, filled.text);
    if (shown !== null && String(shown) !== filled.ref.answer) filled.ref = { ...filled.ref, shown: String(shown) };
  }
  // Likelihood panels supply the definitions in contentOf; other templates need their own method.
  if (panel && !/likelihood/.test(at.skill) && filled.ref.kind !== "sequence" && !templateMethod(filled.ref.source, filled.text)) return null;
  // Only a story template goes to the writer for its words; code keeps every other text as the template wrote it.
  const story = filled.ref.kind === "story" && filled.ref.format === "story" && !panel;
  return {
    type: "template", source: story ? "story" : "code", item: stepAiItem(slot.id, filled.ref, filled.text), numbers: filled.numbers, dayRange, template: filled.ref,
    ...(story && slot.place ? (() => { const r = roomOf(input, slot.place!, w.day); return r ? { textBudget: { ...r, perLine: Math.floor(r.perLine * .9) } } : {}; })() : {}),
  };
}

/** From this attempt on, a step slot may draw on another step the book has taught (its own tasks have run out). */
const LATE_ATTEMPT = 320;

/** Earlier steps a practice block reviews: this book's steps before the slot's, then the day's reviewed steps, the most advanced first. */
function earlierSteps(input: GenerateInput, slot: Slot, day: number, level: number, all = false): { skill: string; step: number }[] {
  const at = slot.part.step;
  if (!at) return [];
  const reviewed = (input.plan.days.find((d) => d.day === day)?.pages ?? []).flatMap((p) => p.parts.flatMap((x) => x.reviewSteps ?? []));
  const seen = new Set<string>([`${at.skill}#${at.step}`]);
  return [...taughtSteps(input, day, level), ...reviewed].flatMap((x) => {
    const step = stepOf(input.curriculum, x.skill, x.step);
    const k = `${x.skill}#${step?.number}`;
    if (!step || seen.has(k) || !step.templates?.some((t) => !templateProblem(t, level))) return [];
    seen.add(k);
    return [{ skill: x.skill, step: step.number }];
  }).sort((a, b) => (stepRank(input.curriculum, b.skill, b.step) ?? 0) - (stepRank(input.curriculum, a.skill, a.step) ?? 0)).slice(0, all ? undefined : 4);
}

/** The steps the book has taught by a day, latest first, each with a template that prints. */
function taughtSteps(input: GenerateInput, day: number, level: number): { skill: string; step: number }[] {
  return input.plan.newSteps.filter((x) => x.day <= day).reverse().flatMap((x) => {
    const step = stepOf(input.curriculum, x.skill, x.step);
    return step?.templates?.some((t) => !templateProblem(t, level)) ? [{ skill: x.skill, step: step.number }] : [];
  });
}

/**
 * The steps a Number stories page takes its stories from when its own step has no story that works out a sum (the U4
 * review: "Amara says 3. What does Amara say next?" is no story to work out): the steps the day reviews whose stories
 * add, take away, share or group. Empty when the page's own step has such a story.
 */
const storyFallbacks = new WeakMap<Curriculum, Map<string, { skill: string; step: number }[]>>();

function storySteps(input: GenerateInput, slot: Slot, day: number, level: number): { skill: string; step: number }[] {
  const at = slot.part.step;
  if (!at || slot.place !== "word-problems") return [];
  // (Not "gets 1 more": one more is a count, not a story to work out; the U4 review.)
  const sums = (skill: string, n: number | null) => !!stepOf(input.curriculum, skill, n)?.templates?.some((t) => t.format === "story" && !isTwoStep(t) && sumTemplate(t, true) && !/\b1 (?:more|less|fewer)\b/.test(t.text) && !templateProblem(t, level));
  // The page's own step first when it has such stories; then this book's steps taught by today and the day's reviewed
  // steps, the most advanced first (the U16 review: Grade 5 stories, not "Hana has 9 leaves. She gets 7 more").
  // If this step has no usable story, look backwards within the skill, then through
  // earlier skills. The required story format must not advance the child's step.
  if (!sums(at.skill, at.step)) {
    let cached = storyFallbacks.get(input.curriculum);
    if (!cached) { cached = new Map(); storyFallbacks.set(input.curriculum, cached); }
    const key = `${at.skill}#${at.step}:${level}`;
    const saved = cached.get(key);
    if (saved?.length) return saved;
    const rank = stepRank(input.curriculum, at.skill, at.step) ?? 0;
    const prior = input.curriculum.levels.flatMap(l => input.curriculum.levelSkills(l.id) ?? [])
      .flatMap(s => (input.curriculum.skillSteps(s.id) ?? []).map(st => ({ skill: s.id, step: st.number })))
      .filter(x => (stepRank(input.curriculum, x.skill, x.step) ?? Infinity) < rank && sums(x.skill, x.step)
        && (level < 16 || (stepBounds(stepOf(input.curriculum, x.skill, x.step)!)?.max ?? 0) >= 100))
      .sort((a, b) => (stepRank(input.curriculum, b.skill, b.step) ?? 0) - (stepRank(input.curriculum, a.skill, a.step) ?? 0));
    cached.set(key, prior);
    if (prior.length) return prior;
  }
  const seen = new Set<string>([`${at.skill}#${at.step}`]);
  const own = sums(at.skill, at.step) ? [{ skill: at.skill, step: at.step }] : [];
  const reviewed = (input.plan.days.find((d) => d.day === day)?.pages ?? []).flatMap((p) => p.parts.flatMap((x) => x.reviewSteps ?? []));
  const usable = (x: { skill: string; step: number | null }) => {
    const step = stepOf(input.curriculum, x.skill, x.step);
    const k = `${x.skill}#${step?.number}`;
    if (!step || seen.has(k) || !sums(x.skill, step.number) || (stepRank(input.curriculum, x.skill, step.number) ?? Infinity) > (stepRank(input.curriculum, at.skill, at.step) ?? 0)) return [];
    seen.add(k);
    return [{ skill: x.skill, step: step.number }];
  };
  // This book's steps nearest the day (its level's numbers: U16's stories add and take away big numbers), then the
  // day's reviewed steps of earlier levels, the most advanced first.
  // (Only steps already taught by that day: never a later step, #482 review at db3b1a0.)
  const book = [...input.plan.newSteps].filter((x) => x.day <= day).sort((a, b) => b.day - a.day).flatMap(usable);
  const more = reviewed.flatMap(usable).sort((a, b) => (stepRank(input.curriculum, b.skill, b.step) ?? 0) - (stepRank(input.curriculum, a.skill, a.step) ?? 0));
  return [...own, ...book, ...more];
}

/**
 * A Challenge's second and later questions stretch to the next step of the day's skill (the U4 review: three of the
 * same task are not a Challenge): its hardest templates, on the step the child meets next. Null when there is none.
 */
/** A stories page's question that is no story while its step has stories (a drill is shorter, "What is 2 more than 8?"). */
function notAStory(input: GenerateInput, slot: Slot, c: ItemPlan, p: QuestionPackage, pageType?: string): boolean {
  // (Two ways on a Number stories page is one of its stories, U4 to U9, D-226.)
  const storyPlace = STEP_STORY_PLACES.has(slot.place ?? "warm-up") && slot.place !== "challenge" || slot.place === "solve-it-two-ways" && pageType === "word-problems";
  if (storyPlace && !printedForm(p).startsWith("context:") && stepHasStory(input, c)) return true;
  // (A stories page's story works an operation, Savar 2026-11-04: never a place-value question dressed as a story.)
  return pageType === "word-problems" && storyPlace && !operationStory(p, c.template?.source?.answer);
}

/** Whether a Challenge or Show what you know card's frame may not print here (twice a book, cardFrameProblem). */
function cardFrameTaken(input: GenerateInput, work: PageWork[], slot: Slot, p: QuestionPackage): boolean {
  if (slot.place !== "challenge" && slot.place !== "show-what-you-know") return false;
  const f = cardFrame(p);
  if (!f) return false;
  const here = work.find((w) => w.slots.includes(slot));
  const uses = work.flatMap((w) => w.slots.flatMap((s) => {
    if (s === slot || (s.place !== "challenge" && s.place !== "show-what-you-know") || !s.contract) return [];
    const q = contractPackage(input, w, s.contract);
    return q && cardFrame(q) === f ? [{ day: w.day, challenge: s.place === "challenge", numbers: cardNumbers(q) }] : [];
  }));
  return !!cardFrameProblem(uses, { day: here?.day ?? null, challenge: slot.place === "challenge", numbers: cardNumbers(p) });
}

/** Whether a panel can work its example: a sum, a count, a sequence, an order or a relation code works out. */
const workableExample = (pkg: QuestionPackage): boolean => !!pkg.operation || !!pkg.item?.checks.some((c) => c.kind === "count" || c.kind === "sequence" || c.kind === "order" || c.kind === "relation" || c.kind === "template" || c.kind === "template-choice");

/** A template item's template words, its slots unfilled: one story whatever step lists it. */
function templateWords(input: GenerateInput, c: ItemPlan): string {
  const t = c.template!;
  return stepOf(input.curriculum, t.skill, t.step)?.templates?.[t.index]?.text ?? `${t.skill}#${t.step}.${t.index}`;
}

/**
 * Whether a replacement on a Number stories page loses one of its kinds of story (a shorter "gets 2 more" for "the
 * rest are blue", the real U4 sample's Day 10): a new kind, or its own, keeps them.
 */
function losesStoryKind(input: GenerateInput, w: PageWork, slot: Slot, p: QuestionPackage): boolean {
  if (w.page.type !== "word-problems" || !["word-problems", "solve-it-two-ways"].includes(slot.place ?? "")) return false;
  const kinds = (s: Slot) => { const q = s.contract ? contractPackage(input, w, s.contract) : null; return q ? storyKind(q.text) : null; };
  const others = w.slots.filter((s) => s !== slot && ["word-problems", "solve-it-two-ways"].includes(s.place ?? "")).map(kinds).filter(Boolean);
  const was = kinds(slot), now = storyKind(p.text);
  return now !== was && !!was && !others.includes(was) && (now === null || others.includes(now));
}

/** Whether a template item's step has a story template that prints at this level. */
function stepHasStory(input: GenerateInput, c: ItemPlan): boolean {
  if (!c.template) return false;
  return (stepOf(input.curriculum, c.template.skill, c.template.step)?.templates ?? []).some((t) => t.format === "story" && !isTwoStep(t) && !templateProblem(t, input.plan.level));
}

/** Whether a page already asks a template twice (outside its Challenge and warm-up): a template is one question stem. */
function templateTwice(w: PageWork, slot: Slot, c: ItemPlan, except?: Slot): boolean {
  const t = c.template;
  if (!t || slot.place === "challenge" || slot.place === "warm-up") return false;
  return w.slots.filter((s) => s !== except && s !== slot && !NUMBER_PLACES.has(s.place ?? "") && s.contract?.template && s.contract.template.skill === t.skill && s.contract.template.step === t.step && s.contract.template.index === t.index).length >= 2;
}

/** From U16 (Grade 5), a story or Challenge card from another step than its page's prints a number of 100 or more. */
const BIG_STORY_LEVEL = 16;

/**
 * Whether a story place's question is too easy for its level (the U16 review: "7 beads in each bag, 4 bags" on a
 * Grade 5 stories page): from another step than the page's, at U16 and up, no number it prints or answers reaches 100.
 * The page's own step keeps its ranges.
 */
function tooEasyStory(input: GenerateInput, slot: Slot, c: ItemPlan, p: QuestionPackage): boolean {
  if (input.plan.level < BIG_STORY_LEVEL || !c.template || !slot.place || !STEP_STORY_PLACES.has(slot.place)) return false;
  if (slot.part.step && c.template.skill === slot.part.step.skill && c.template.step === slot.part.step.step) return false;
  return largestNumber(p) < 100;
}

/**
 * A Challenge card past its step's Challenge templates: its place among those cards (from 1), or 0. A step that keeps 3
 * or more asks only them.
 */
function challengeReviewSlot(input: GenerateInput, slot: Slot, level: number, day: number): number {
  if (slot.place !== "challenge" || !slot.part.step) return 0;
  const own = challengeTemplateCount(input.curriculum, slot.part.step.skill, slot.part.step.step, level);
  const ordinal = Number(slot.id.split(".")[1]) || 1;
  return own >= 1 && own < 3 && ordinal > own && challengeReviewSteps(input, slot, day, level).length ? ordinal - own : 0;
}

/** Steps taught or reviewed by a day with a hard template to work out, the largest numbers first. */
function challengeReviewSteps(input: GenerateInput, slot: Slot, day: number, level: number): { skill: string; step: number }[] {
  const size = (x: { skill: string; step: number }) => { const st = stepOf(input.curriculum, x.skill, x.step); return st ? stepBounds(st)?.max ?? 0 : 0; };
  // (The steps of earlier days' reviews too: the book has practised them.)
  const before = input.plan.days.filter((d) => d.day < day).flatMap((d) => d.pages.flatMap((p) => p.parts.flatMap((x) => x.reviewSteps ?? []))).flatMap((x) => { const st = stepOf(input.curriculum, x.skill, x.step); return st ? [{ skill: x.skill, step: st.number }] : []; });
  const own = slot.part.step ? `${slot.part.step.skill}#${slot.part.step.step}` : "";
  const steps = [...new Map([...earlierSteps(input, slot, day, level, true), ...before].map((x) => [`${x.skill}#${x.step}`, x])).values()].filter((x) => `${x.skill}#${x.step}` !== own);
  // (G1: among steps of one size, C3's preferred secure standards first; with none, today's order.)
  const prefer = slot.part.preferStandards ?? [];
  const rank = (x: { skill: string }) => { const i = prefer.indexOf(input.curriculum.skill(x.skill)?.unit ?? ""); return i < 0 ? prefer.length : i; };
  return steps.filter((x) => hasHardNumberTemplate(input.curriculum, x.skill, x.step, level)).sort((a, b) => size(b) - size(a) || rank(a) - rank(b));
}

function challengeStretch(input: GenerateInput, slot: Slot, level: number, day = 0, attempt = 0): { skill: string; step: number } | null {
  // #482 review at db3b1a0: the Challenge stays on the hardest step reached that day (Cedric's brief); no later or
  // easier step. A small pool of hard templates is reported, not hidden.
  void input; void slot; void level; void day; void attempt;
  return null;
}

/** The steps a slot's question may come from (#489): its part's step, or the steps its review part draws from. */
function slotSteps(input: GenerateInput, slot: Slot, day = 0): { steps?: string[]; bounds?: { min: number; max: number } } {
  if (slot.part.step) {
    const stretch = challengeStretch(input, slot, input.plan.level, day);
    const stories = storySteps(input, slot, day, input.plan.level).map((x) => `${x.skill}#${x.step}`);
    // A Challenge may take any way of its list, and a slot whose tasks ran out a taught step: the step it printed.
    // The allowed steps, independent of the question printed (#482 review at db3b1a0): the slot's step, a story page's
    // taught or reviewed steps, and for a practice slot the earlier steps its block may review.
    const reviewing = slot.place !== "challenge" ? earlierSteps(input, slot, day, input.plan.level, true).map((x) => `${x.skill}#${x.step}`)
      : [];
    const steps = [...new Set([`${slot.part.step.skill}#${slot.part.step.step}`, ...(stretch ? [`${stretch.skill}#${stretch.step}`] : []), ...stories, ...reviewing])];
    // The numbers those steps allow, for every question of the slot, a fallback builder's too.
    const all = steps.flatMap((k) => { const [skill, n] = k.split("#"); const st = stepOf(input.curriculum, skill, Number(n)); const b = st ? stepBounds(st) : null; return b ? [b] : []; });
    return { steps, ...(all.length ? { bounds: { min: Math.min(...all.map((b) => b.min)), max: Math.max(...all.map((b) => b.max)) } } : {}) };
  }
  if (!slot.part.reviewSteps?.length) return {};
  // (Its review steps, then, as its late attempts take them, every step the day reviews and the book has taught.)
  const late = [...(input.plan.days.find((d) => d.day === day)?.pages ?? []).flatMap((p) => p.parts.flatMap((x) => x.reviewSteps ?? [])), ...taughtSteps(input, day, input.plan.level)];
  return { steps: [...new Set([...slot.part.reviewSteps, ...late].flatMap((x) => { const at = stepOf(input.curriculum, x.skill, x.step); return at ? [`${x.skill}#${at.number}`] : []; }))] };
}

/** Places in question rows, where a longer template wraps under its number (never a fact grid such as Friday 5). */
const LONGER_PLACES: ReadonlySet<string> = new Set(["practice-row", "remember-these", "on-your-own", "finish-these", "now-you"]);

/** A template item's size: the largest number its text or answer prints. */
const itemSize = (c: ItemPlan) => Math.max(0, ...[c.item.text, c.template?.answer ?? ""].flatMap(x => x.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number));

/**
 * Whether a practice item from a template the day's Challenge uses, of the same kind (a story beside a story; Spot the
 * error or one box already asks less), is as large as that Challenge: it must stay below.
 */
function reachesChallenge(work: PageWork[], day: number, c: ItemPlan): boolean {
  const t = c.template;
  if (!t) return false;
  const sizes = work.filter(p => p.day === day).flatMap(p => p.slots.filter(s => s.place === "challenge" && s.contract?.template
    && s.contract.template.skill === t.skill && s.contract.template.step === t.step && s.contract.template.index === t.index).map(s => itemSize(s.contract!)));
  return sizes.length > 0 && itemSize(c) >= Math.min(...sizes);
}

/**
 * A template page's "How do you know?" names its first story by its number once the page's questions are settled (the
 * U4 review: "How can you check the first story on this page?" is vague for a six-year-old): "How did you work out
 * question 1?". It never prints that story's answer (the U4 and U16 reviews). Code writes it; the writer never rewords it.
 */
function explainFirstStory(w: PageWork, work: PageWork[] = []): void {
  const explain = w.slots.find((s) => s.place === "how-do-you-know" && s.contract?.type === "template" && s.contract.source === "explain");
  if (!explain?.contract) return;
  const asked = w.slots.filter((s) => s.place !== "how-do-you-know");
  const first = asked.findIndex((s) => !!s.place && STEP_STORY_PLACES.has(s.place) && s.contract?.template && s.contract.template.kind !== "choice");
  if (first < 0) return;
  // Another page's wording is never repeated (the book check refuses a repeated question).
  const taken = new Set(work.filter((p) => p !== w).flatMap((p) => p.slots.flatMap((s) => s.place === "how-do-you-know" && s.contract ? [s.contract.item.text] : [])));
  const n = first + 1;
  const ways = [`How did you work out question ${n}?`, `How can you check your answer to question ${n}?`, `Explain how you worked out question ${n}.`];
  const text = ways.find((x) => !taken.has(x)) ?? ways[w.number % ways.length];
  explain.contract = { ...explain.contract, item: { ...explain.contract.item, text }, numbers: (text.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number) };
}

/** Places that take a template's number questions only. */
const NUMBER_PLACES: ReadonlySet<string> = new Set(["spot-the-error", "solve-it-two-ways"]);

/** Places of fluency facts: a fixed set of facts, not a growing range. */
const FLUENCY_PLACES: ReadonlySet<SlotName> = new Set<SlotName>(["warm-up", "in-your-head"]);

/** A question filled from its step's templates (#489): its own step's ranges bound it, not the level's. */
const isStepItem = (p: QuestionPackage) => !!stepTemplateOf(p);
const levelRange = (p: QuestionPackage, input: GenerateInput) => (isStepItem(p) ? null : rangeProblem(p, input.curriculum, input.plan.level));

/** The shared schedule bounds every code-picked item in its skill's range. */
function contractFor(input: GenerateInput, w: PageWork, slot: Slot, attempt = 0, skillOverride?: string): ItemPlan | null {
  if (slot.existing) return null;
  if (!skillOverride && attempt === 0 && slot.contract !== undefined) return slot.contract;
  if (!skillOverride) {
    // A step with no template that prints in this place falls back to #482's builders (or the existing writer).
    const template = templateContractFor(input, w, slot, attempt);
    if (template) return template;
    if (template === null && input.plan.level >= 10 && ["show-what-you-know", "level-test"].includes(slot.place ?? "")) return null;
    // A step whose templates print here takes another attempt, never a builder of other numbers.
    if (template === null && attempt > 0 && templateContractFor(input, w, slot, 0)) return null;
  }
  const challengeSkills = input.plan.days.find(d => d.day === w.day)?.pages.flatMap(p => p.parts.filter(p => p.unit === "A").flatMap(p => p.skills)) ?? [];
  const skill = skillOverride ?? (slot.place === "challenge" ? challengeSkills.find(s => /^1\.1-(?:count|read-write|number-line)/.test(s))
    : slot.aim && attempt === 0 && FLUENCY_PLACES.has(slot.place ?? "warm-up") ? slot.aim.skill
    : slot.part.skills[(((Number(slot.id.split(".")[1]) || 1) - 1) + attempt) % slot.part.skills.length]);
  if (!skill) return null;
  if (!approvedQuestionTypes(skill).length) return null;
  if (["mixed-set","spot-the-error","solve-it-two-ways"].includes(slot.place ?? "") && approvedQuestionTypes(skill).every(t=>["places","order","count","relation","likelihood"].includes(t))) {
    if(skillOverride) return null;
    for(const other of slot.part.skills.filter(s=>s!==skill)) {
      const alternative=contractFor(input,w,slot,attempt,other);
      if(alternative) return alternative;
    }
    return null;
  }
  const max = skillRange(input.curriculum, input.plan.level, skill).max;
  // G1: the plan's stretch shift moves the numbers and difficulty; picture help keeps the plan's day (today's, without signals).
  const sday = difficultyDay(input.plan, w.day);
  const schedule = { ...dayDifficulty(input.plan.level, sday), helpLevel: daySchedule(input.plan, w.day).helpLevel };
  const cap = Math.min(schedule.numberRange.max, Math.max(5, Math.ceil(max * schedule.rangeFraction)));
  const pictures = schedule.helpLevel === "pictures" || schedule.helpLevel === "new-ideas-only" && ["worked-example", "now-you", "try-first"].includes(slot.place ?? "");
  const format = slot.place === "spot-the-error" ? "spot-the-error" : slot.place === "solve-it-two-ways" ? "two-ways" : slot.place === "mixed-set" ? "tick-and-number" : "write-number";
  const room = slot.place ? roomOf(input, slot.place, w.day) : null;
  // A slot on a step keeps that step's numbers (#482 review at db3b1a0: a fallback printed 100001 on a step to 99999).
  const own = slot.part.step && slot.part.step.skill === skill ? stepOf(input.curriculum, skill, slot.part.step.step) : null;
  const bounds = own ? stepBounds(own) : null;
  const top = Math.min(max, cap, bounds?.max ?? Infinity);
  const low = Math.max(slot.place === "challenge" ? cap : sday >= 8 ? Math.floor(cap * 0.7) : 1, bounds?.min ?? 1);
  const planned = planItem({ skill, slot: slot.id, level: input.plan.level, day: sday, ordinal: w.number * 31 + (Number(slot.id.split(".")[1]) || 1),
    range: { min: Math.min(low, top), max: top, pictures, help: schedule.helpLevel === "pictures" ? "full" : schedule.helpLevel === "new-ideas-only" ? "partial" : "none" },
    // Late candidates on a review or practice place may be a story, a third context when the page needs one (Cedric's
    // section 9); its words go to the writer like any contract story.
    story: !!slot.place && (STORY_CHECK_PLACES.has(slot.place) || attempt >= 300 && ["remember-these", "unit-b-practice", "on-your-own", "now-you"].includes(slot.place)), explain: slot.place === "how-do-you-know", challenge: slot.place === "challenge", format, attempt, compact: ["practice-row", "warm-up", "finish-these", "on-your-own"].includes(slot.place ?? "") || shortStories(input.plan, w.day) && !!slot.place && STORY_CHECK_PLACES.has(slot.place),
    ...(room && (STORY_CHECK_PLACES.has(slot.place!) || slot.place === "challenge") ? { textBudget: { ...room, perLine: Math.floor(room.perLine * .9) } } : {}) });
  if (!planned && !skillOverride && slot.place !== "challenge") for (const other of slot.part.skills.filter(s => s !== skill)) {
    const candidate = contractFor(input, w, slot, attempt, other);
    if (candidate) return candidate;
  }
  return planned && slot.interest ? withInterestNoun(input, w, slot, planned, attempt) : planned;
}

/**
 * A code story with an interest thing in place of its counted thing (G1, item 5): code's own text, only the noun
 * changed, everywhere it prints; kept only when every number is under 1,000 (no one has 5,380 jerseys) and no other
 * form of the old noun is left. Otherwise the story as it was.
 */
function withInterestNoun(input: GenerateInput, w: PageWork, slot: Slot, c: ItemPlan, attempt: number): ItemPlan {
  const old = c.item.thing;
  const things = interestWords(input.plan).things;
  if (c.source !== "story" || c.template || !old || !things.length || c.numbers.some((n) => n >= 1000)) return c;
  const thing = things[(hashOf(`${w.number}:${slot.id}`) + attempt) % things.length];
  const escaped = old.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const text = c.item.text.replace(new RegExp(`\\b${escaped}\\b`, "g"), thing);
  const singular = old.replace(/(?:es|s)$/, "");
  if (text === c.item.text || singular && new RegExp(`\\b${singular.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)) return c;
  return { ...c, item: { ...c.item, text, thing } };
}
/** The day's number and picture check (scheduledItemProblem): with no signals exactly today's. */
const NEW_IDEA_PICTURES: ReadonlySet<string> = new Set(["worked-example", "now-you", "try-first"]);
function dayProblem(input: GenerateInput, p: QuestionPackage, day: number, place: string): string | null {
  const sday = difficultyDay(input.plan, day);
  const help = daySchedule(input.plan, day).helpLevel;
  if (!input.plan.personal?.hasAssessment || sday === day && help === dayDifficulty(input.plan.level, day).helpLevel) return scheduledItemProblem(p, input.curriculum, day, place);
  // G1: numbers and difficulty follow the stretched day; picture help follows the plan's own day (C3 keeps or extends
  // it). The stretched day's picture rule is the plan's, so its check reads the item without its picture.
  // (The plan's help is never less than the stretched day's, so a picture it refuses that day's check refuses too.)
  const pictures = help === "pictures" || help === "new-ideas-only" && NEW_IDEA_PICTURES.has(place);
  if (!p.item?.figure || !pictures) return scheduledItemProblem(p, input.curriculum, sday, place);
  return scheduledItemProblem({ ...p, item: { ...p.item, figure: null } }, input.curriculum, sday, place);
}

/** The child's Sam mistakes on the day's first page with Spot the error (at most once a day), else none. */
function samPrefer(input: GenerateInput, w: PageWork): import("@/lib/workbook-book").SamMistake[] {
  const own = childSamMistakes(input.plan);
  if (!own.length) return [];
  const first = input.plan.days.find((d) => d.day === w.day)?.pages.find((p) => p.parts.some((x) => x.kind === "spot-the-error"));
  return first?.number === w.page.number && !w.page.extraPractice ? own : [];
}

/** Spot the error's offered mistakes with the child's own first (G1, through the closed Sam table); else today's. */
function personalMistakes<T extends { name: string }>(input: GenerateInput, mistakes: T[]): T[] {
  const own = childSamMistakes(input.plan);
  const rank = (m: T) => { const i = own.indexOf(m.name as never); return i < 0 ? own.length : i; };
  // (The child's own first, in their order; the others keep today's order: sort is stable.)
  return own.length ? [...mistakes].sort((a, b) => rank(a) - rank(b)) : mistakes;
}

/** A code fact as the writer's item shape (G1, item 4): code's operation, operands, text and one careless wrong answer. */
function factItem(id: string, f: WarmUpFact) {
  const [a, b] = f.operands;
  const right = f.kind === "add" ? a + b : f.kind === "subtract" ? a - b : f.kind === "multiply" ? a * b : a / b;
  const op = (x: number, y: number) => ({ kind: f.kind, operands: [itemNumber(x), itemNumber(y)], expression: null, unit: null, denominator: null, values: [] });
  const sign = { add: "+", subtract: "−", multiply: "×", divide: "÷" }[f.kind];
  return {
    slot: id, skill: f.skill, difficulty: 1, text: f.text, format: "write-number", figure: null, numbers: [], places: null, direction: null, sequence: null, pattern: null, relation: null, figureShows: null, name: null, thing: null,
    operation: op(a, b), easier: f.kind === "divide" ? { text: "4 ÷ 2 = ?", operation: op(4, 2) } : { text: `2 ${sign} ${f.kind === "multiply" ? 2 : 1} = ?`, operation: op(2, f.kind === "multiply" ? 2 : 1) },
    wrongAnswers: [{ value: itemNumber(right + 1), cause: "careless", description: "One more than the answer.", step: null }], shownWrong: null,
  };
}

const wordsIn = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
const unapprovedBuild = (): BuiltQuestion => ({ package: null, stepIds: [], check: { status: "failed", reason: "this skill has no approved question type; add and review its item builder" } });

export type { QuestionCheck } from "@/lib/workbook-generator-items";

// ---------- The fit check seam ----------

/** A fit problem on a page: the question, or null for the page. */
export interface FitProblem {
  /**
   * "fullness": the page has room left; "layout": a layout check of the template (spacing, alignment, clipped text),
   * which more or fewer questions do not mend: the loops below leave the page as it is and report it.
   */
  kind?: "fullness" | "layout";
  question: number | null;
  reason: string;
}

export type FitResult = { ok: true } | { ok: false; problems: FitProblem[] };

/**
 * A fit check's answer for the decisions about room (more questions, fewer, shorter text): without its layout problems,
 * which more or fewer questions do not mend. The page's report keeps them (the fit check's own answer).
 */
const roomFit = (fit: FitResult): FitResult => {
  if (fit.ok) return fit;
  const problems = fit.problems.filter((p) => p.kind !== "layout");
  return problems.length ? { ok: false, problems } : { ok: true };
};
/** Whether a page fails for room only by its fullness: it has room for more. */
const lacksOnlyFullness = (fit: FitResult) => { const room = roomFit(fit); return !room.ok && room.problems.every((p) => p.kind === "fullness"); };

/** The book a page belongs to, as a template reads it. */
export interface FitBook {
  id: string;
  childId: string;
  number: number;
  levels: number[];
  profileBuild: string | null;
}

/**
 * Whether a page's content fits its template's slots. Adapters: the renderer on main (src/lib/workbook-fit.ts) and the
 * real templates' strict check (#310) once it merges.
 */
export interface FitCheck {
  fits(page: DraftPage, book: FitBook): Promise<FitResult>;
}

// ---------- The draft ----------

/** The pages of a book that are not day pages. */
export const BOOK_PAGE_TYPES = ["cover", "how-plan", "back-cover", "blank"] as const;
export type BookPageType = (typeof BOOK_PAGE_TYPES)[number];

export interface GeneratedQuestion {
  /** From 1; restarts on each page. */
  number: number;
  /** The plan's slot: "<part index>.<item index>", both from 1. */
  slot: string;
  /** The part of the day it fills. */
  part: PlannedPart["kind"];
  /** The template slot it sits in ("now-you", "word-problems"), when the book is laid out for the templates (#363). */
  place?: SlotName;
  check: QuestionCheck;
  /**
   * Its AI attempts: 1, then one more for each reason it was written again: a failed check, and a page that did not
   * fit. Never more than 3.
   */
  attempts: 1 | 2 | 3;
  /** Its package; null only when code could build none (the AI wrote nothing usable). */
  package: QuestionPackage | null;
  /** Saved with the question so an edit keeps its approved type and fixed math. */
  itemPlan?: ItemPlan;
  /** This skill still uses the existing writer until its approved builder exists. */
  existing?: boolean;
  /** The text code wrote for a question with no plan (code's wording of its operation): a story prints it exactly (B1). */
  codeText?: string;
}

export type PageFit = { status: "fits" } | { status: "failed"; problems: FitProblem[] } | { status: "not-needed" };

export interface GeneratedPage {
  /** From 1 at the cover; runs through the whole book. */
  number: number;
  type: PageType | BookPageType;
  /** "Day 3" on a day page; else null. */
  dayLabel: string | null;
  /** 1 to 10 on a day page; else null. */
  day: number | null;
  /** The page of the day, from 1; else null. */
  pageOfDay: number | null;
  qrToken: string;
  fit: PageFit;
  /**
   * 1, or 2 when the page was written again after a failed fit check (some question had an attempt left); 0 for a page
   * with no AI content.
   */
  attempts: 0 | 1 | 2;
  questions: GeneratedQuestion[];
  /**
   * What the template lays out (#363): the header, the slots with their question numbers, the panels and pictures.
   * Set on every page when the book is laid out for the templates (GenerateInput.book); else absent.
   */
  content?: PageContent;
  /** Checked examples stay with the page through whole-book repairs and recovery. */
  panelExamples?: (QuestionPackage | null)[];
  /**
   * Planned items the page has no room for, with why: from the layout (pageSlots), and the questions the fit check left
   * out (`leftOut`); only on a day page that leaves some out.
   */
  omissions?: Omission[];
  /** Questions left out because the page had no room for them after its shorter rewrite, in the order they went. */
  leftOut?: LeftOut[];
  /**
   * The shared capacity budget, fixed before any writer call; with each slot's steps (#489, "<skill>#<step>"): the
   * page's step, or the steps its review part draws from. A question filled from a template belongs to one of them.
   */
  expected?: { slot: string; part: PlannedPart["kind"]; place: SlotName | null; steps?: string[]; bounds?: { min: number; max: number } }[];
}

/** A question the page left out to fit: its slot, part, text and the fit problem that named it. */
export interface LeftOut {
  slot: string;
  part: PlannedPart["kind"];
  text: string | null;
  reason: string;
}

export interface GeneratedWorkbook {
  id: string;
  childId: string;
  /** The workbook's place in the child's sequence, from 1. */
  number: number;
  levels: number[];
  profileBuild: string | null;
  /** The AI model id. */
  model: string;
  pages: GeneratedPage[];
  quality?: BookQuality;
  counts: { pages: number; questions: number; checked: number; notChecked: number; failed: number; failedPages: number };
}

/**
 * The shape version of a stored GeneratedWorkbook. Raise it when the shape changes. Version 2 (#380): a question may
 * have 3 attempts, a page may have `leftOut`, and a package may hold the missing-addend kind (count-up steps), which
 * code before it cannot compute. A version 1 draft is a version 2 draft too, so both are read.
 */
export const GENERATED_DRAFT_VERSION = 2;
/** The stored shape versions this code reads. */
export const READABLE_DRAFT_VERSIONS: readonly number[] = [1, 2];

export type DraftSave = { status: "saved"; draftId: string } | { status: "refused"; reason: string };

/** The draft store. Adapters: Supabase (src/lib/workbook-draft-store.ts) and in memory (workbook-draft-memory.ts). */
export interface WorkbookDraftStore {
  /** Stores a whole draft as one unit, or nothing. */
  save(draft: GeneratedWorkbook): Promise<DraftSave>;
  draft(id: string): Promise<GeneratedWorkbook | null>;
}

/** What is wrong with a draft to store, or null: ids, numbering, tokens and each question's place and verdict. */
export function draftProblem(d: GeneratedWorkbook): string | null {
  if (!isUuid(d.id)) return "the draft id is not a UUID";
  if (!isUuid(d.childId)) return "the child id is not a UUID";
  if (!Number.isInteger(d.number) || d.number < 1 || d.number > 1000) return "the workbook number is not from 1 to 1000";
  if (d.levels.length === 0 || !d.levels.every((l) => Number.isInteger(l) && l >= 1 && l <= 30)) return "the levels are not U1 to U30";
  if (d.pages.length === 0 || d.pages.length % 4 !== 0) return "the page count is not a multiple of 4";
  const tokens = new Set<string>();
  const ids = new Set<string>();
  for (const [i, p] of d.pages.entries()) {
    if (p.number !== i + 1) return `page ${i + 1} is numbered ${p.number}`;
    if (!isQrToken(p.qrToken) || tokens.has(p.qrToken)) return `page ${p.number}: the QR token is not valid or is used twice`;
    tokens.add(p.qrToken);
    for (const [j, q] of p.questions.entries()) {
      const at = `page ${p.number}, question ${j + 1}`;
      if (q.number !== j + 1) return `${at} is numbered ${q.number}`;
      if (q.check.status !== "failed" && !q.package) return `${at} has no package but is not marked failed`;
      if (q.check.status !== "checked" && !q.check.reason) return `${at} is ${q.check.status} with no reason`;
      if (q.package) {
        const ref = q.package.ref;
        if (ref.source !== "workbook" || ref.workbookId !== d.id || ref.page !== p.number || ref.question !== q.number) return `${at}: the package names another place`;
        if (ids.has(q.package.id)) return `${at}: the question id is used twice`;
        ids.add(q.package.id);
      }
    }
  }
  return null;
}

// ---------- Generating ----------

export interface GenerateInput {
  /** The new draft's id (a UUID), made by the caller. */
  workbookId: string;
  childId: string;
  /** The workbook's place in the child's sequence. */
  number: number;
  /** The child profile build the plan was made from, or null. */
  profileBuild: string | null;
  plan: WorkbookPlan;
  /** The child's curriculum: what the AI is told about each skill and step. */
  curriculum: Curriculum;
  /**
   * Lay the book out for the real templates (#310, #363): each day page's questions fill the template's slots
   * (pageSlots, so a page asks the AI for no more than it holds), every page gets its content, and the fit check reads
   * it. `child` is the child's first name, as printed on the cover and in each page ID. Absent: the plan's parts give
   * the slots and no page has content.
   */
  book?: { child: string };
  /** Versioned item policy. Old stored runs keep their original pipeline. */
  itemPolicy?: "approved-v1";
}

/**
 * Where finished day pages are kept while a run works (#312), so a run that stops (a time limit) resumes without
 * writing them again. `save` throws when the run may no longer write: the generation stops.
 */
export interface PageStore {
  /** The day pages already finished for this draft. */
  load(): Promise<GeneratedPage[]>;
  save(page: GeneratedPage): Promise<void>;
}

/**
 * The AI attempts each question slot and worked example has used, kept outside this call (#312, R379-2-1, R379-3-1).
 * `use` asks to count one attempt of each slot before the AI call that makes it and answers the slots it refused (a
 * slot that used `max`); a refused slot is not asked. So a later call that goes on after an error or a crash never gives
 * a slot more than `max`, even when its page was never stored. Keys are "<book page>:<slot>" ("e1" for a worked
 * example). `use` throws when the run may no longer write: the generation stops.
 */
export interface AttemptLedger {
  /** The AI attempts a slot may use in all. */
  readonly max: number;
  load(): Promise<Map<string, number>>;
  use(page: number, slots: string[]): Promise<{ refused: string[] }>;
}

/** What one AI call of a page asked (R379-8-2): its name, and the slots and panels it covered, in order. */
export interface CallAsk {
  name: string;
  slots: string[];
  panels: string[];
}

/**
 * One AI call of a day page as it came back (#312, R379-7-1): what it asked (`ask`), its questions and worked examples
 * built and checked by code, before the solve check (R379-8-1: the solve checks are kept one by one, see CallStore),
 * the slots and panels it did not ask (refused), and the attempts each slot and panel it counted had used once counted.
 * Holds only what the AI wrote and code built from it: the AI is never told the child's name (pageRequest), so no call
 * holds it.
 */
export interface StoredCall {
  ask: CallAsk;
  built: BuiltQuestion[];
  examples: BuiltQuestion[];
  refused: string[];
  tries: Record<string, number>;
}

/**
 * Where each AI call of a day page is kept as soon as it comes back (#312, R379-7-1), keyed by its book page and its
 * place in that page's calls (`seq`: 0 the first call, then the redo, then the shorter rewrite). A later call replays
 * a page's kept calls instead of asking the AI again. The call is kept before its solve checks start, and each solve
 * check as it comes back, under its key (solveKey: the call's key and the question's slot or panel; one check reads
 * every box of its question at once), so a replay runs only the checks with no kept result (R379-8-1). `save` and
 * `saveSolve` throw when the run may no longer write: the generation stops. The first call or check kept at a key stays.
 */
export interface CallStore {
  /** The kept calls of these book pages. */
  load(pages: number[]): Promise<{ page: number; seq: number; call: StoredCall }[]>;
  save(page: number, seq: number, call: StoredCall): Promise<void>;
  /** The kept solve checks' verdicts by key, of these book pages. */
  solves(pages: number[]): Promise<Map<string, SolveVerdict>>;
  saveSolve(key: string, log: SolveLog): Promise<void>;
}

/** A solve check's key (R379-8-1): "<book page>:<call seq>:<slot or panel>", as "14:0:1.2" or "14:1:e1". */
export const solveKey = (page: number, seq: number, id: string) => `${page}:${seq}:${id}`;

/**
 * What a resume found kept that does not fit the book this input plans (R379-8-2): a page, an attempt, a call or its
 * answers of another plan. The generation stops and writes nothing more; trying again gives the same answer.
 */
export class ResumeMismatch extends Error {}

export class WriterPersistenceError extends Error {}

export interface GenerateDeps {
  /** Durable dispatches and results for edit writers and solves. */
  editCall?: EditCall;
  ai: AiClient;
  fit: FitCheck;
  store: WorkbookDraftStore;
  /** A new QR token (16 to 64 letters, digits, - or _), unique everywhere: random in live use. */
  qrToken(): string;
  /** The time limit of one AI call; 3 minutes when not given. */
  timeLimitMs?: number;
  /** Called after each day page is done, with the pages done and the day pages in all. */
  progress?(done: number, total: number): void;
  /** How many day pages are written at once; 1 when not given. The draft is the same in any order. */
  concurrency?: number;
  /**
   * The solve check (round 7): reads each printed question whose words the AI wrote and answers it; a question it does
   * not answer as the key does fails. The live one is a small model (aiSolver), the fake answers from the key.
   */
  solver: Solver;
  /** The time limit of one solve check; 60 seconds when not given. A late check fails its question. */
  solveTimeLimitMs?: number;
  /** Called after each solve check that ran (a kept one replayed is not), to log it. */
  onSolve?(log: SolveLog): void;
  /** The time in milliseconds, for the solve log only; none when not given. */
  now?(): number;
  /** Finished pages kept for a resume (#312); none when not given. */
  pages?: PageStore;
  /** The attempts used before this call (#312); none when not given (no limit past the generator's own). */
  attempts?: AttemptLedger;
  /** Each page's AI calls, kept for a resume (R379-7-1); none when not given (nothing is replayed). */
  calls?: CallStore;
  /** Asked before each day page starts: true stops starting pages (a time budget); the result is "paused". */
  stop?(): boolean;
}

export type GenerateResult =
  | { status: "stored"; draft: GeneratedWorkbook }
  /** `stop` said to stop before every day page was done: call again with the same input and page store to go on. */
  | { status: "paused"; done: number; total: number }
  | { status: "refused"; reason: string };

const TIME_LIMIT_MS = 180_000;
const SOLVE_TIME_LIMIT_MS = 60_000;

/** A question slot of a day page: in a laid-out book, also its template slot and that slot's index in the layout. */
interface Slot {
  id: string;
  part: PlannedPart;
  place: SlotName | null;
  layoutSlot: number;
  contract?: ItemPlan | null;
  existing?: boolean;
  /** How often the capacity stage gave the slot another task because its question was wider than its space. */
  refits?: number;
  /** How often the capacity stage gave the slot a shorter question of an earlier step instead of dropping one. */
  swaps?: number;
  /** A floor refill tries unused tasks of its own taught step before earlier-step review. */
  refillOwnStep?: boolean;
  /** G1 (item 5): the story slot's template takes the parent's interest nouns, as the book's share needs. */
  interest?: boolean;
  /** G1 (item 4): the warm-up fact code chose from the child's fact family; the writer is not asked for it. */
  fact?: WarmUpFact;
  /** The skill and the kind of question code chose for the slot (#380): the skill's kinds in turn through the book. */
  aim?: { skill: string; kind: QuestionKind; orElse: QuestionKind[] };
  /**
   * The numbers and the person code chose for the slot (#380, round 5), planned across the whole book: `use`, a pair no
   * other slot of the page has and the book has not used for this kind, if it can; `spare`, another such pair for a redo
   * after a repeat; `name`, a person's name (never Sam, the child of Spot the error).
   */
  planned?: {
    use: number[] | null; spare: number[] | null; name: string | null; say?: string | null; spareSay?: string | null;
    /** The thing the slot's wording counts (round 7), and the people and things the AI may choose from instead. */
    thing?: string; names?: string[]; things?: string[];
    /** What the planned wording works (round 6): its operation, and the picture it names; the same for the spare. */
    does?: PlannedDoes | null; spareDoes?: PlannedDoes | null;
  };
}

/** What a planned wording works: its operation on whole numbers, and its picture (what a missing part's shows). */
interface PlannedDoes {
  operation: { kind: "add" | "subtract" | "missing-addend"; operands: [number, number] };
  figure: "ten-frame" | "dots" | null;
  figureShows: "part" | "total" | null;
}

/** The kinds of question code turns through for a skill, so its questions differ (#380). */
export const QUESTION_KINDS = ["story", "picture", "fact", "missing-part", "sequence", "order", "relation", "pattern", "draw"] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

/** What each kind asks, for the AI. */
const KIND_WORDS: Record<QuestionKind, string> = {
  story: "a short story with a person and things, asking for a number (write-number with an operation)",
  picture: "the child reads a picture (figure dots or ten-frame): a count, or a sum the picture shows",
  fact: "a bare fact with no story: '6 + 3 = ?', 'What is 1 more than 6?'",
  "missing-part": "a missing part (missing-addend): '4 and what make 9?', 'How far is 7 from 10?'",
  sequence: "the sequence format: missing numbers in a count",
  order: "the order format: 2 to 4 numbers to put in order",
  relation: "the relation format: the child circles one of two choices code writes (less than 5 or not; close to 0 or 10; equal or not; which has more)",
  pattern: "the pattern format",
  draw: "the draw format: the child draws, a parent checks",
};

/**
 * The kinds of question a skill takes, from its words, in the order code turns through them. A relation comes first
 * for a skill about less than, close to, equal or more; a count for a skill about how many; a story for adding and
 * taking away.
 */
export function kindsOf(text: string): QuestionKind[] {
  const t = text.toLowerCase();
  if (/less than \d|benchmark|close to/.test(t)) return ["relation", "picture", "missing-part", "relation", "story"];
  if (/\bequal\b|balance/.test(t)) return ["relation", "missing-part", "story", "relation", "picture"];
  if (/compare|which has more|greater|which group has more/.test(t)) return ["relation", "picture", "order", "story"];
  if (/\border\b/.test(t)) return ["order", "sequence", "relation"];
  // No missing part on 1 more and 1 less: its missing part is always the 1 the text names (round 5).
  if (/1 more|2 more|more and \d|less than a quantity/.test(t)) return ["fact", "story", "picture", "sequence"];
  if (/before or just after|sequence|count forward|count on|count back|skip-count|count to/.test(t)) return ["sequence", "fact", "picture"];
  if (/make 5|make 10|part|decompose|ways to make|partners/.test(t)) return ["missing-part", "picture", "story", "fact"];
  if (/pattern/.test(t)) return ["pattern", "draw"];
  if (/how many|count|subitize|frame|numeral|graph/.test(t)) return ["picture", "story", "draw", "fact"];
  if (/add|take|subtract|change|purchase|total|sum|double|fact/.test(t)) return ["story", "picture", "fact", "missing-part"];
  return ["draw", "story"];
}

/** Places whose format is fixed by their layout: code chooses no kind there. */
const FIXED_KIND_PLACES: ReadonlySet<SlotName> = new Set<SlotName>([
  "warm-up", "spot-the-error", "solve-it-two-ways", "mixed-set", "how-do-you-know", "fix-it", "challenge", "math-in-the-world", "in-your-head", "try-first",
]);

const slotsOf = (page: PlannedPage): Slot[] =>
  page.parts.flatMap((part, i) => Array.from({ length: part.items }, (_, j) => ({ id: `${i + 1}.${j + 1}`, part, place: null, layoutSlot: -1 })));

/** The question slots of a laid-out page, in reading order: ids count each part's items across its template slots. */
function layoutSlots(page: PlannedPage, layout: DayLayout): Slot[] {
  const seen = new Map<number, number>();
  return layout.slots.flatMap((x, k) => Array.from({ length: x.items }, () => {
    const n = (seen.get(x.part) ?? 0) + 1;
    seen.set(x.part, n);
    return { id: `${x.part + 1}.${n}`, part: page.parts[x.part], place: x.slot, layoutSlot: k };
  }));
}

// ---------- The book plan: kinds, numbers and names (#380) ----------

/** The most numbers a sequence has on a parent-led card (U1 to U3): more wrap to a second line, and the page overflows. */
const PARENT_SEQUENCE_MOST = 5;
/** The kinds of question code plans numbers for: each has an operation, or a relation of one or two numbers. */
const NUMBERED_KINDS: ReadonlySet<QuestionKind> = new Set<QuestionKind>(["story", "picture", "fact", "missing-part", "relation"]);
/** Planned numbers stop at this range: beyond it the book has enough sums not to repeat, and the vary number does. */
const PLANNED_MAX = 20;

/** A fixed order of the candidates for a skill (a hash, never Math.random), so a book does not start at 1 + 1. */
const hashOf = (key: string) => {
  let h = 2166136261;
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
};

/**
 * The number pairs a slot may take for a kind on a skill, or null when code plans none (a range past PLANNED_MAX or not
 * of whole numbers). A sum's parts a + b (each from 1, the total at most the max); on a skill about 1 (or 2) more and
 * less, a and the 1 (or 2); a relation's two different numbers, never the halfway of a benchmark skill.
 */
function numberChoices(skill: string, text: string, kind: QuestionKind | "spot", r: NumberRange): number[][] | null {
  if (r.max > PLANNED_MAX || r.max < 2 || r.fractions || r.decimals || r.negatives) return null;
  const t = text.toLowerCase();
  const pairs: number[][] = [];
  if (kind === "relation") {
    const benchmark = /less than \d|benchmark|close to/.test(t);
    for (let a = 0; a <= r.max; a++) for (let b = 1; b <= r.max; b++) if (a !== b && !(benchmark && (a === 5 || 2 * a === r.max))) pairs.push([a, b]);
  } else {
    const step = /two-more-less|2 more/.test(`${skill} ${t}`) ? 2 : isOneMoreLessSkill(skill) || /1 more/.test(t) ? 1 : null;
    if (step && kind !== "missing-part") for (let a = 1; a + step <= r.max; a++) pairs.push([a, step]);
    else for (let a = 1; a < r.max; a++) for (let b = 1; a + b <= r.max; b++) pairs.push([a, b]);
  }
  return pairs.length ? pairs.sort((x, y) => hashOf(`${skill}:${x}`) - hashOf(`${skill}:${y}`)) : null;
}

/** Spot the error's sum is a bare sum, as a fact is: they share the book's pairs, so "5 + 1 = ?" is not asked twice. */
const group = (kind: QuestionKind | "spot") => (kind === "spot" ? "fact" : kind);

/** The wordings of a sequence (missing numbers), with no number in them. */
const SEQUENCE_FRAMES = [
  "Fill in the missing numbers.", "What numbers are missing?", "Count up. Fill in the boxes.", "Write the numbers that go in the gaps.",
  "Count on. Which numbers are missing?", "Find the missing numbers in the count.", "Count on. Write the numbers you skip.",
];

/**
 * Plans every slot of the book in book order (#380): its skill and kind of question (each skill's kinds in turn, and on
 * a page a skill takes another kind before it takes one again), its numbers and a person's name. A page's slots never
 * share a pair of numbers (in either order); across the book each kind takes the pair it has used least. Spot the
 * error slots take numbers too: Sam's sum.
 */
function planBook(input: GenerateInput, work: PageWork[]) {
  const { curriculum, plan } = input;
  const child = input.book?.child.toLowerCase();
  const people = PEOPLE.filter((n) => n.toLowerCase() !== child);
  const turns = new Map<string, number>();
  const used = new Map<string, number>();
  const frameUse = new Map<string, number>();
  const said = new Set<string>();
  const bookActs = new Map<Action, number>();
  const shapeUse = new Map<string, number>();
  const spotPairs = new Set<string>();
  // G1: with the parent's interests, 3 of every 5 story things are interest words (C1's checked lists); else today's.
  const things = [...storyThings(plan)];
  let person = 0;
  let thing = 0;
  for (const w of work) {
    const inPart = new Map<PlannedPart, number>();
    const pageKinds = new Set<string>();
    const pagePairs = new Set<string>();
    const pageFrames = new Set<string>();
    // What each template slot's cards ask so far (round 6), by the slot's index in the layout.
    const slotActs = new Map<number, Map<Action, number>>();
    const pageShapes = new Set<string>();
    const pageNumbers = new Map<number, number>();
    // G1: the child's style takes the first fitting slot of the page only (item 6: at most one item a page).
    let pageStyled = false;
    const pageFacts = new Set<string>();
    for (const slot of w.slots) {
      const k = inPart.get(slot.part) ?? 0;
      inPart.set(slot.part, k + 1);
      if (!slot.place || slot.part.skills.length === 0) continue;
      let numbered: { skill: string; kind: QuestionKind | "spot" } | null = null;
      // G1: a warm-up or In your head slot aims at the fact skills the child has not shown as known (item 4).
      const fact = FLUENCY_PLACES.has(slot.place) ? warmUpSkill(curriculum, plan, w.day, slot.part.skills, k, slot.place) : null;
      if (fact) slot.aim = { skill: fact, kind: "fact", orElse: [] };
      // (A warm-up fact is code's: its operation and operands come from the aimed family, never from the writer.)
      const chosen = fact && slot.place === "warm-up" ? warmUpFact(curriculum, plan, fact, hashOf(`${w.day}:${w.page.number}:${slot.id}`) % 997, pageFacts) : null;
      if (chosen) { slot.fact = chosen; pageFacts.add(chosen.text); }
      if (slot.place === "spot-the-error") {
        // Sam's sum: on the slot's skill with the widest range, so the sum fits each of its rules.
        const skill = [...slot.part.skills].sort((a, b) => skillRange(curriculum, plan.level, b).max - skillRange(curriculum, plan.level, a).max)[0];
        numbered = { skill, kind: "spot" };
      } else if (!FIXED_KIND_PLACES.has(slot.place)) {
        const skill = slot.part.skills[k % slot.part.skills.length];
        const storyPlace = slot.place === "picture-stories" || slot.place === "word-problems";
        const storyKind = (x: string) => x === "story" || x === "picture" || x === "missing-part";
        let kinds = kindsOf(curriculum.skill(skill)?.text ?? skill).filter((x) => storyPlace ? storyKind(x) : true);
        // A story slot later on the page for the skill needs the story kinds: another slot takes the others first.
        const laterStory = !storyPlace && w.slots.slice(w.slots.indexOf(slot) + 1).some((x) => (x.place === "picture-stories" || x.place === "word-problems") && x.part.skills.includes(skill));
        if (laterStory && kinds.some((x) => !storyKind(x))) kinds = kinds.filter((x) => !storyKind(x));
        if (kinds.length > 0) {
          const n = turns.get(skill) ?? 0;
          // The skill's next kind this page has not asked on it yet (all asked: the next in turn).
          const step = kinds.findIndex((_, j) => !pageKinds.has(`${skill}|${kinds[(n + j) % kinds.length]}`));
          const styled = pageStyled ? null : styleKinds(plan, kinds, true)[0];
          const kind = styled && styled !== kinds[0] && !pageKinds.has(`${skill}|${styled}`) ? styled : kinds[(n + Math.max(0, step)) % kinds.length];
          if (styled && kind === styled && styled !== kinds[0]) pageStyled = true;
          turns.set(skill, n + Math.max(0, step) + 1);
          pageKinds.add(`${skill}|${kind}`);
          slot.aim = { skill, kind, orElse: [...new Set(kinds)].filter((x) => x !== kind) };
          if (NUMBERED_KINDS.has(kind)) numbered = { skill, kind };
        }
      }
      let pair: number[] | null = null;
      let spare: number[] | null = null;
      if (numbered) {
        const choices = numberChoices(numbered.skill, curriculum.skill(numbered.skill)?.text ?? numbered.skill, numbered.kind, skillRange(curriculum, plan.level, numbered.skill));
        const bond = (p: number[]) => [...p].sort((a, b) => a - b).join(",");
        // The pair whose numbers the page prints least first, a number printed twice costing more (round 6: not "1 cat", "1 dot" and "1 red
        // button" on one page), then the pair its kind has used least.
        const seen = (p: number[]) => [p[0], p[1], p[0] + p[1]].reduce((n, x) => n + (pageNumbers.get(x) ?? 0) ** 2, 0);
        const ranked = (choices ?? []).filter((p) => !pagePairs.has(bond(p)))
          .map((p, j) => ({ p, j, n: used.get(`${group(numbered.kind)}|${p}`) ?? 0, s: seen(p) }))
          .sort((a, b) => a.s - b.s || a.n - b.n || a.j - b.j);
        // Spot the error prints its bare sum (round 7): a sum no Spot the error of the book has had, while there is one.
        if (numbered.kind === "spot" && ranked.some((x) => !spotPairs.has(`${x.p}`))) ranked.splice(0, ranked.length, ...ranked.filter((x) => !spotPairs.has(`${x.p}`)));
        // And one no bare fact of the book has printed yet, while there is one ("5 + 4 = ?" is a fact's wording too).
        if (numbered.kind === "spot" && ranked.some((x) => x.n === 0)) ranked.splice(0, ranked.length, ...ranked.filter((x) => x.n === 0));
        pair = ranked[0]?.p ?? null;
        if (pair && numbered.kind === "spot") spotPairs.add(`${pair}`);
        spare = ranked.find((x) => pair && bond(x.p) !== bond(pair))?.p ?? null;
        if (pair) {
          used.set(`${group(numbered.kind)}|${pair}`, (used.get(`${group(numbered.kind)}|${pair}`) ?? 0) + 1);
          pagePairs.add(bond(pair));
          if (spare) pagePairs.add(bond(spare));
        }
      }
      const name = slot.place === "spot-the-error" ? null : people[person++ % people.length];
      // Each named slot's thing, in turn (round 7): its wording counts it, whether planned here or written by code later.
      const thingHere = name ? things[thing++ % things.length] : null;
      // Outside practice a book asks one shape of question at most SHAPE_MOST times (duplicateProblem): so does the plan.
      const practice = PRACTICE_PLACES.has(slot.place);
      const withinShapes = (text: string) => practice || !shapeOf(text) || (shapeUse.get(shapeOf(text)) ?? 0) < SHAPE_MOST;
      const countShape = (text: string) => { if (!practice && shapeOf(text)) shapeUse.set(shapeOf(text), (shapeUse.get(shapeOf(text)) ?? 0) + 1); };
      // The wording: a frame of the kind, filled with the numbers, the name and a thing, within the slot's room. A slot
      // of several cards spreads them across what they ask (round 6): the action it has asked least first, then the
      // one the book has asked least, so no action takes more than its share of the cards.
      let say: string | null = null;
      let spareSay: string | null = null;
      let does: PlannedDoes | null = null;
      let spareDoes: PlannedDoes | null = null;
      if (numbered && numbered.kind !== "spot" && numbered.kind !== "relation" && name) {
        const range = skillRange(curriculum, plan.level, numbered.skill);
        const room = roomOf(input, slot.place, w.day)?.characters ?? Infinity;
        const text = curriculum.skill(numbered.skill)?.text ?? numbered.skill;
        const step = /two-more-less|2 more/.test(`${numbered.skill} ${text}`) || isOneMoreLessSkill(numbered.skill) || /1 more/.test(text.toLowerCase());
        const acts = slotActs.get(slot.layoutSlot) ?? new Map<Action, number>();
        slotActs.set(slot.layoutSlot, acts);
        const bond = (p: number[]) => [...p].sort((x, y) => x - y).join(",");
        // At most a third of a slot's cards ask one thing (2 of 6), when the level has that many things to ask.
        const cap = Math.max(1, Math.ceil(w.slots.filter((x) => x.layoutSlot === slot.layoutSlot).length / 3));
        const own = numbered.kind as QuestionKind;
        // On a page of stories, a card whose kind has nothing left under the cap borrows a wording of the slot's other
        // story kinds (a story for a picture), and takes that kind.
        const storyPlace = slot.place === "picture-stories" || slot.place === "word-problems";
        const shortDay = shortStories(plan, w.day);
        const kindsHere = [own, ...(storyPlace ? (slot.aim?.orElse ?? []).filter((k) => k === "story" || k === "picture" || k === "missing-part") : [])];
        const pick = (pairNow: number[] | null, thingNow: string, not: number[] | null = null, limit = true) => {
          if (!pairNow) return null;
          // A page of stories takes stories only (D-201: a person and real things), never a bare "9 + ? = 10".
          const frames = kindsHere.flatMap((k, o) => framesFor(k, step, range.subtraction).map((f) => ({ f, k, o })))
            .filter((x) => !storyPlace || x.f.f.includes("{name}"));
          const fills = frames.map((x, j) => ({ ...x, j, n: frameUse.get(x.f.f) ?? 0, a: acts.get(x.f.act) ?? 0 }))
            .filter((x) => !pageFrames.has(x.f.f))
            .sort((a, b) => Number(a.a >= cap) - Number(b.a >= cap) || a.o - b.o || a.a - b.a || (bookActs.get(a.f.act) ?? 0) - (bookActs.get(b.f.act) ?? 0)
              || a.n - b.n || hashOf(`${slot.id}:${w.number}:${a.j}`) - hashOf(`${slot.id}:${w.number}:${b.j}`))
            .flatMap((x) => {
              const numbers = framePair(x.f, pairNow);
              if (!numbers || numbers[0] + numbers[1] > range.max) return [];
              // A missing part to 10 changes the numbers: never to a pair another slot of the page (or `not`) has.
              if (bond(numbers) !== bond(pairNow) && (pagePairs.has(bond(numbers)) || (not && bond(numbers) === bond(not)))) return [];
              return [{ frame: x.f, kind: x.k, numbers, said: fillFrame(x.f.f, { a: numbers[0], b: numbers[1], t: numbers[0] + numbers[1] }, name, thingNow) }];
            })
            .filter((x) => x.said.length <= room && !said.has(x.said) && !pageShapes.has(shapeOf(x.said)) && (!limit || withinShapes(x.said)))
            // G1: a short-story day (reading load, item 8) takes stories of at most 20 words while there are any.
            .filter((x, _, all) => !shortDay || all.every((y) => wordsIn(y.said) > SHORT_STORY_WORDS) || wordsIn(x.said) <= SHORT_STORY_WORDS);
          // Late in the book every shape may be used 3 times (round 7): then the shape the book has used least, so a
          // slot never runs out of planned wordings.
          if (!limit) return fills.sort((a, b) => (shapeUse.get(shapeOf(a.said)) ?? 0) - (shapeUse.get(shapeOf(b.said)) ?? 0))[0] ?? null;
          return fills[0] ?? null;
        };
        const chosen = pick(pair, thingHere!) ?? pick(pair, thingHere!, null, false);
        if (chosen) {
          say = chosen.said;
          if (slot.aim && chosen.kind !== slot.aim.kind) slot.aim = { ...slot.aim, kind: chosen.kind, orElse: [slot.aim.kind, ...slot.aim.orElse.filter((k) => k !== chosen.kind)] };
          does = frameDoes(chosen.frame, chosen.numbers);
          frameUse.set(chosen.frame.f, (frameUse.get(chosen.frame.f) ?? 0) + 1);
          acts.set(chosen.frame.act, (acts.get(chosen.frame.act) ?? 0) + 1);
          bookActs.set(chosen.frame.act, (bookActs.get(chosen.frame.act) ?? 0) + 1);
          pageFrames.add(chosen.frame.f);
          pageShapes.add(shapeOf(chosen.said));
          countShape(chosen.said);
          said.add(chosen.said);
          // A missing part to 10 works a and 10 - a: those are the slot's numbers now.
          if (pair && chosen.numbers.join() !== pair.join()) {
            pair = chosen.numbers;
            pagePairs.add(bond(pair));
          }
        }
        // The spare's wording is for a redo only: it takes no frame from the page's other slots.
        const other = pick(spare, things[(thing + 7) % things.length], pair) ?? pick(spare, things[(thing + 7) % things.length], pair, false);
        if (other) {
          spare = other.numbers;
          spareSay = other.said;
          spareDoes = frameDoes(other.frame, other.numbers);
          // Kept for the redo: no later slot takes the same words.
          said.add(other.said);
        }
      }
      // A sequence names no number in its text (code can then fit it to a card): only its wording is planned.
      if (slot.aim?.kind === "sequence") {
        const room = roomOf(input, slot.place, w.day)?.characters ?? Infinity;
        const frame = SEQUENCE_FRAMES.map((f, j) => ({ f, j, n: frameUse.get(f) ?? 0 })).filter((x) => !pageFrames.has(x.f) && x.f.length <= room && withinShapes(x.f)).sort((a, b) => a.n - b.n || a.j - b.j)[0]?.f;
        if (frame) {
          say = frame;
          frameUse.set(frame, (frameUse.get(frame) ?? 0) + 1);
          pageFrames.add(frame);
          countShape(frame);
        }
      }
      // The numbers a card may print: both numbers and their total (a take-away and a missing part print it).
      if (pair && numbered?.kind !== "spot") for (const x of [pair[0], pair[1], pair[0] + pair[1]]) pageNumbers.set(x, (pageNumbers.get(x) ?? 0) + 1);
      const offered = <T,>(xs: T[], at: number) => [0, 1, 2].map((k) => xs[(at + k * 5) % xs.length]);
      slot.planned = {
        use: pair, spare, name, say, spareSay, does, spareDoes,
        ...(name && thingHere ? { thing: thingHere, names: offered(people, people.indexOf(name)), things: offered(things, things.indexOf(thingHere)) } : {}),
      };
    }
  }
}

/** A package with Sam (Spot the error's child) renamed: the slot's planned name, or one its pronouns fit, not in its text. */
function withoutSam(p: QuestionPackage, planned: string | null): QuestionPackage {
  const json = JSON.stringify(p);
  if (!/\bSam\b/.test(json)) return p;
  const text = `${p.text} ${p.easierExample?.text ?? ""}`;
  const free = (names: string[]) => names.find((n) => !new RegExp(`\\b${n}\\b`).test(json));
  const he = /\b(he|him|his)\b/i.test(text);
  const she = /\b(she|her|hers)\b/i.test(text);
  const fits = (n: string | null) => n && !new RegExp(`\\b${n}\\b`).test(json) && (he ? BOYS.includes(n) : she ? GIRLS.includes(n) : true);
  const name = fits(planned) ? planned! : (he ? free(BOYS) : she ? free(GIRLS) : free(PEOPLE)) ?? "Ben";
  return JSON.parse(json.replace(/\bSam\b/g, name)) as QuestionPackage;
}

/**
 * The AI's item with a sequence short enough for a parent-led card (U1 to U3): at most PARENT_SEQUENCE_MOST numbers, the
 * window with the most blanks (and one number printed). Only when the text names no number, which a window would change.
 */
function shortSequence(raw: unknown, level: number): unknown {
  if (level > 3 || typeof raw !== "object" || raw === null) return raw;
  const r = raw as { text?: unknown; sequence?: { start?: { type?: string; value?: number }; step?: { type?: string; value?: number }; terms?: unknown; blanks?: unknown } | null };
  const s = r.sequence;
  if (!s || typeof r.text !== "string" || /\d/.test(r.text) || typeof s.terms !== "number" || s.terms <= PARENT_SEQUENCE_MOST || !Array.isArray(s.blanks)) return raw;
  if (s.start?.type !== "number" || s.step?.type !== "number" || typeof s.start.value !== "number" || typeof s.step.value !== "number") return raw;
  const blanks = s.blanks.filter((b): b is number => Number.isInteger(b));
  let best: { at: number; n: number } | null = null;
  for (let at = 0; at + PARENT_SEQUENCE_MOST <= s.terms; at++) {
    const n = blanks.filter((b) => b >= at && b < at + PARENT_SEQUENCE_MOST).length;
    if (n >= 1 && n < PARENT_SEQUENCE_MOST && (!best || n > best.n)) best = { at, n };
  }
  if (!best) return raw;
  const { at } = best;
  return {
    ...r,
    sequence: {
      ...s, start: { ...s.start, value: s.start.value + at * s.step.value }, terms: PARENT_SEQUENCE_MOST,
      blanks: blanks.filter((b) => b >= at && b < at + PARENT_SEQUENCE_MOST).map((b) => b - at),
    },
  };
}

const SYSTEM = [
  "You write the questions of one page of a printed math workbook for a child in British Columbia, Canada.",
  "Fill every slot listed, one item per slot, with the slot's id. Use only the skills the slot names.",
  "A slot may name its place on the page (now-you, word-problems, mixed-set, ...) and the formats that place takes: use one of those formats.",
  "A slot may give its numbers: for each skill, the range of that skill's own level. Every number of an item on that skill is at most its max: the numbers in its text, the operation's numbers, the answer, every wrong answer, the easier example's numbers and answer, and every number in its sequence, places, comparison, choices and picture. None is negative unless its negatives is true, none is a fraction (1/2) unless its fractions is true, none is a decimal unless its decimals is true, and none is a percent unless its percents is true; no subtraction sign (-) unless its subtraction is true, no × (nor x as a times sign, nor '3 groups of 2', 'lots of' or 'rows of' unless the skill is about groups or skip-counting) unless its multiplication is true, no ÷ unless its division is true, and no < or > unless its comparison is true; a:b is a clock time (3:30) only when its time is true, and anywhere else a ratio, so off a time skill write a time as 3 o'clock; coin values and amounts with cents only when its money is true. So a review of an earlier skill uses that skill's small numbers.",
  "Write every number in digits. Never write numbers as words: 12, not twelve; -3, not minus three; 0.5, not zero point five; 1/2, not half; 50%, not fifty percent; 3:30, not half past three. The only number words allowed are order words (first, second, third), 'which one', 'each one', 'this one', 'that one', 'the one', place names (the tens digit, the ones place, 3 tens), ten-frame and five-frame, 'one more' and 'one less' on a skill about them, and the quarter coin on a money skill.",
  "The question text and the easier example's text use only plain ASCII letters and digits, spaces, the punctuation . , ? ! ' \" - : ( ) $ ¢ % / and the signs + = × ÷ < >. Write minus as -, never as a special character; never use ½, ⅓, superscripts or other special characters, and only plain ASCII names. Each number takes one of these forms, with no space inside: 345, 12,500, 0.5, 1/2, 50%, 3:30 (a clock time, on a time skill), 3:4 (a ratio), $4.75, 25¢, and -3 for a negative number.",
  "On the spot-the-error place, the question text is the sum only, such as '5 + 2 = ?' (Sam's work is printed above it). Pick one mistake from the slot's mistakes: write a sum it can happen on (its 'when'), give Sam's wrong answer as exactly what that mistake makes, put the mistake's name as that wrong answer's cause, and set its step as the mistake's 'step' says. Code writes Sam's steps.",
  "You write content only: the question text, the operation's numbers, expected wrong answers with their causes, an easier example of the same operation, and an item format from the list. The page's layout, fonts, sizes and positions are fixed by the template; never describe them.",
  "Never write the answer or the worked steps: code computes them from the operation. Give the operation as data: its kind and operands (numbers, fractions, amounts with units, clock times), or for evaluate and solve the expression.",
  "Each wrong answer is a mistake a child makes, with a short cause id (a misconception id such as O3 when the input names one, else a short word such as 'operation'), a plain description, and the worked step where it happens: a column's place ('ones', 'tens', 'hundreds') or null when it is not one step.",
  "The easier example is the same operation kind with smaller numbers or fewer steps, and a different answer (never the question's answer, never the question with its numbers swapped). With as many digits, sort both sets of numbers from least to greatest: each number of the easier example is no larger than the question's at its place, and one is smaller. For 4 + 3: 2 + 3 or 1 + 2, never 5 + 1 or 4 + 3. For 2 + 1 it is 1 + 1.",
  "Formats with an operation: write-number (one answer box); show-work (answer box and work box: stories, challenges); two-ways (Solve it two ways: Method 1 and Method 2); tick-and-number (Mixed set: tick the operation, write the answer; +, −, × or ÷ only); spot-the-error (Sam's wrong work shows one of your wrong answers: give its index in shownWrong); number-line (hop on a number line, then write where you land: + or − of whole numbers).",
  "Formats with no operation (set operation, easier and wrongAnswers to null and empty; code computes every answer): places (one number in numbers; places lists the places to ask, or null for all: 'How many tens and ones?'); order (2 to 6 numbers in numbers, direction up or down); compare (two numbers in numbers: tick or circle <, > or =); sequence (sequence: the first number, the step, how many terms and which terms from 0 are blanks: missing numbers, skip-counting); count (the picture's counts in numbers, with a figure: 'How many dots?'); pattern (pattern: the core that repeats, how many shapes are shown, and which one from 0 is the blank: 'What comes next?').",
  "Formats a parent checks: written-reason (How do you know?); draw (Draw 6 dots; make a set). No operation, no figure.",
  "Pictures: figure names a picture kind (dots, ten-frame, number-line, base-ten, array) or null. Code draws it from the operation (dots for 3 + 4 are 3 and 4 dots; an array for 3 × 4) or from numbers (count: dots take each group, a ten-frame each part, base-ten the hundreds, tens and ones, an array the rows and columns); you never draw, size or place it. Picture stories below U10 should have dots or a ten-frame with small whole numbers.",
  "Keep to the part's kind: practice builds from easy to harder in small changes; Fix it uses new numbers on the skills listed, never a question named in 'avoid'; Friday 5, mini-tests and the level test have no hints.",
  "Stories and every quantity-of-things question on practice and review pages, at every level, use plain story language; bare number sentences and pure equations stay as equations; code checks it and a story that breaks a rule is written again: (1) every story has a person, the slot's planned name, and real things: 'Gus has 2 plums.', never bare counts such as '2 plums' or '9 dots'; (2) one action per sentence: 'He finds 5 more.'; (3) the question names the counted thing again and says 'now' or asks plainly: 'How many plums does Gus have now?', never 'in all', 'altogether', 'total' or 'left over'; (4) things only do what they really can: '9 frogs. 7 hop away.' is fine, '9 dots. 7 hop off.' is wrong; (5) keep the math words the curriculum teaches (ten-frame, take away, equal groups, and so on): simplify only the everyday words; (6) a take-away takes the things away from the person with a verb that removes them (gives away, sells, eats, loses, uses, spends, takes out): 'Max puts 17 in a jar. How many does he have now?' is wrong, because he still has them; ask 'How many are not in the jar?' instead.",
  "Copy: short plain sentences a child can read; Canadian English (Mom, metre, litre, colour); money in Canadian dollars and cents; never a school grade, a brand name, or a prompt to scan or call anyone; no last names.",
  "Room: a slot may give its room: the most characters its question text has room for on the printed page (characters), in lines of about perLine characters. Count the characters of the text, spaces included, and stay within it: the page has no room for more, and nothing is shrunk to fit. Say it in short sentences: 'Gus has 2 plums. He finds 5 more. How many plums does Gus have now?', not a long story. On a card (lines 2 or 3), writing lines (written-reason) or a tall picture (number-line, base-ten) take the place of a line: then write one line at most. A ten-frame on a card is taller than its answer box: with a ten-frame, write one line. A written-reason card's lines take as much room as 2 lines of text, so a page of cards has at most 2 written-reason items. For another question with no number answer (Equal? Which has more?), use draw ('Draw 3 dots and 3 dots. Circle the bigger group.'): a parent checks it and it takes the room of an answer box. A write-number item always needs an operation.",
  "Vary: every page is written alone, and other days practise the same skills. So no two questions of a page are the same, and each slot gives a vary number: make it one of the item's numbers (its first number, its total or its count) when the rules allow, so the pages of different days differ.",
  "Pictures must show what the text says. A dots picture of a subtraction crosses out the dots taken away: use it only for take-away, never to compare two groups (how many more red than blue? has no picture). A missing part's picture shows only the part given. There is no five-frame picture: a five-frame question has no picture.",
  "Aim: a slot may give its aim: a skill and a kind of question code chose for it (what the kind means is in means). Write that kind of question on that skill. Only when that kind cannot ask that skill, use the first kind of orElse that can, or another of the slot's skills.",
  "Relation format: give numbers (one number, or two) and relation: kind less-than (to: [the benchmark], as 'Is 7 less than 5?'), closer (to: [two benchmarks], as 'Is 8 close to 0 or 10?', never halfway), equal (two numbers: 'Equal or not?'), more or fewer (two numbers and labels: one short word for each, as cats and dogs: 'Who has more?'). Code writes the choices the child circles and the answer; the text never says the answer. No < or > signs.",
  "A picture of a missing part shows the part given or the total: say which in figureShows ('Mia has 3 dots. How many more dots make 8?' shows the part, 3; 'Mia has 8 dots. 5 are blue. How many dots are not blue?' shows the total, 8). Any number the text says the picture shows ('8 dots', 'Ten-frame: 8') is what code draws.",
  "One question per item: the text never holds a worked fact or a second task ('5 and 0 more is 5. Show 6.' is not a question). A draw item says what to draw and never asks how many, which number or who; ask which has more with a relation item.",
  "Used up: the request may list usedUp, shapes of question the book already asks 3 times: each an example and its words (the question's lowercase words in order, without numbers, names or other capitalised words). Outside practice, write no question whose lowercase words are exactly one of them: use other words or another kind of question, not only other numbers or names.",
  "Planned: a slot may give planned numbers and a name, chosen by code across the whole book so its questions differ. Build the item on the numbers [a, b]: a sum is a + b; a take-away starts at a + b and takes b away; a missing part has the part a and the total a + b; a picture shows a and b (or a + b in all); 1 more than a is a + 1; a relation uses a (and b); Sam's sum in Spot the error is a + b (or a + b take away b). Keep to them unless a rule of the slot forbids it; then change as little as you can. A person in the question is the planned name. Never name anyone Sam outside Spot the error: Sam is the child whose work Spot the error shows. Planned say is the wording code chose for the slot, with those numbers, that name and a thing to count, so the book's questions do not all sound alike: write the question text as say, word for word, unless a rule of the slot forbids it (then change as few words as you can). Its operation, picture, wrong answers and easier example are of that text: 'Mia has 3 shells. How many more shells make 8?' is missing-addend [3, 8]; 'Mia has 3 counters. She adds 4. How many counters now?' is add 3 + 4 with a ten-frame. With say, planned gives its operation (kind and operands), figure and figureShows: use exactly those. Code checks that the text names the numbers the operation works: an operation of other numbers fails.",
  "Relation format: code writes the question text from your numbers, relation kind, benchmarks and labels (your text is replaced), so get those right: they are what the child reads.",
  "Asked: a slot may list asked, the questions the book already asks on its skills. Never repeat one of them. On this page, no two questions may be the same, work the same sum, or differ only by one number when another kind of question is possible: change the kind (a story, a picture to count, a missing part, a sequence), not only a number.",
  "Examples: the request may list examples. Each is the worked example a panel (worked-example, watch-one, reminder) shows for its own skill: fill it like a slot, with its id and on that skill only, of the kind its aim gives. Give a small sum of the skill (write-number with an operation), or a count, sequence, order or relation item code can show done. It is not printed as a question, so it has no room limit.",
  "A count from one number to another ('Count from 2 to 7', 'Count back from 10 to 1') is the sequence format, starting and ending at those numbers; if the text says 'start at 2', the sequence starts at 2.",
  "On a skill about 1 more and 1 less (or 2 more and 2 less), each item asks one of them: 'What is 1 more than 7?' in one slot, 'What is 1 less than 7?' in another, each with its operation (7 + 1, 7 - 1).",
  "A missing-addend's only worked step is named count: a wrong answer's step is count or null. Every item with an operation has at least one wrong answer and an easier example. Fill every slot and every example you are asked for, each with its own id.",
  "Never give the answer in the text: 'Red 6, blue 4. How many red?' is not a question, and adding or taking away 0 only hands back a number the text gives. At U1 to U3 an order item has 2 to 4 numbers, and a sequence at most 5 (more do not fit a card's line).",
  "A missing number in a list (4, 5, ?, 7) is the sequence format, with the blanks as data: never write _ or a gap in the text.",
  "Rules: a slot may give the rules of each of its skills in plain words: the largest number, the signs and ideas not taught yet, and the formats to leave out. Follow them exactly; they are checked by code, and an item that breaks one is thrown away.",
  "The operation's answer is exactly the number the child writes in the box. A missing part is the missing-addend kind, operands [the part given, the total]: '2 and what make 5?', '3 + ? = 5', 'Mia has 3. How many more make 5?' and 'How far is 7 from 10?' are missing-addend [2, 5], [3, 5], [3, 5] and [7, 10]; code's answer is the missing part (3, 2, 2, 3). Never write them as 2 + 3 (code would print 5 as the answer). It is a number bond, not subtraction, so it is allowed before subtraction is taught; its totals go to 20.",
  "The box takes the operation's number, so a question with an operation asks for that number: never a yes-or-no question (Is 8 close to 10? Are they equal?) or a choice (close to 10 or less than 5?). Ask 'How far is 8 from 10?' instead, or use the draw format.",
  "Printed words (round 7): at U1 to U9 code writes the printed text of an item with a whole-number add, subtract, missing-addend, multiply or divide operation, from your operation and picture: your text is not printed there, so get the operation and the figure right. Set name to one of the slot's planned names and thing to one of its planned things, or null for code's choice; on any other item set both to null. Every other text you write is read by a separate checker who sees only the printed words and picture and answers them: write it so it asks exactly what the answer key answers, with every number it needs.",
  "Before you write an easier example, work out both answers: the easier example's answer is a different number from the question's answer. For a missing part, easier means a smaller missing part (fewer to count on) with a total no larger, so its answer differs: for 3 + ? = 5 (answer 2) it is 3 + ? = 4 (answer 1), never 2 + ? = 4 (answer 2 again); for 'How far is 7 from 10?' (answer 3) it is 'How far is 9 from 10?' (answer 1). So ask a missing part of 2 or more: a missing part of 1 has no easier example. Every item with an operation has an easier example; for the smallest sums take a smaller number: 1 + 1 for 2 + 1, 1 + 0 for 1 + 1.",
  "Binding item contract (#480): a slot with contract has exactly one approved type and a code-built item. Copy every field of contract.item. Change only text. Keep the exact operation, operands, skill and format. Write every given number exactly once per occurrence in contract.numbers, with no extra numbers. Write only stories or explanations. Code writes all drills and worked examples; they are never sent to you. Follow exampleBank for the type and grade band.",
].join("\n");

/** A skill's rules in plain words for the AI, from its number range (skillRange): the checks rangeProblem makes. */
function rangeRules(skill: string, r: NumberRange): string {
  const whole = !r.fractions && !r.decimals && !r.negatives;
  const rules = [
    `Every number is ${whole ? `a whole number from 0 to ${r.max}` : `at most ${r.max}`}: the numbers in the text, the operation's numbers and its answer, every wrong answer, and the easier example's numbers and answer. Leave out a wrong answer that would be bigger (adding by mistake on a take-away often is).`,
  ];
  const no: string[] = [];
  if (!r.subtraction) no.push("subtraction (no subtract operation, no - sign; a missing part such as 2 + ? = 5 is the missing-addend kind, which is allowed)");
  if (!r.multiplication) no.push(r.grouping ? "multiplication (no multiply operation, no × sign)" : "multiplication (no multiply operation, no × sign, no 'groups of')");
  if (!r.division) no.push("division (no divide operation, no ÷ sign, no sharing into equal groups as an operation)");
  if (!r.comparison) no.push("comparison (no < or > anywhere, so never the compare format; to compare two numbers use the order format or ask which is more in words)");
  const ideas = ([["fractions", "fractions"], ["decimals", "decimals"], ["negatives", "negative numbers"], ["percents", "percents"], ["ratios", "ratios"]] as const)
    .filter(([k]) => !r[k]).map(([, name]) => name);
  if (ideas.length) no.push(`${ideas.slice(0, -1).join(", ")}${ideas.length > 1 ? " or " : ""}${ideas.at(-1)}`);
  if (!r.time && !r.ratios) no.push("clock times written with a colon (write 3 o'clock)");
  if (no.length) rules.push(`Not taught yet, so never use: ${no.join("; ")}.`);
  rules.push(`Numbers in digits only. Never write the word "one" (not "one by one", "one side", "one way"; write "a" or reword), except in "which one", "each one", "this one", "that one" and "the one"${isOneMoreLessSkill(skill) ? ", and \"one more\" and \"one less\"" : ""}.`);
  return rules.join(" ");
}

/** What the AI reads about a skill: its text and, where drafted, the step the part teaches. */
function skillFacts(curriculum: Curriculum, id: string, step: number | null) {
  const skill = curriculum.skill(id);
  const text = skill?.text ?? BC_SKILL_MAP.standards.flatMap((s) => s.skills).find((k) => k.id === id)?.text ?? id;
  const s = step !== null ? curriculum.skillSteps(id)?.find((x) => x.number === step) : undefined;
  return {
    id,
    text,
    step: s ? { name: s.name, rules: s.rules, example: s.example, representation: s.representation, mistakes: s.mistakes, spotTheError: s.spotTheError } : null,
  };
}

function pageRequest(input: GenerateInput, w: PageWork, slots: Slot[], note: string | null, panels: Panel[] = [], memory: BookMemory | null = null, pageTexts: string[] = [], attempt = 0) {
  const { plan, curriculum } = input;
  const { day, page } = w;
  // What the book asked on the skills, and (on a redo) the questions this page keeps.
  const asked = (skills: readonly string[]) => [...new Set([...skills.flatMap((k) => memory?.texts.get(k) ?? []).slice(-40), ...pageTexts])];
  const parts = page.parts.map((part, i) => ({
    part: i + 1,
    kind: part.kind,
    items: part.items,
    hints: part.hints,
    methods: part.methods ?? null,
    faded: part.faded ?? null,
    reviews: part.reviews ?? null,
    test: part.test ?? null,
    fixIt: part.fixIt?.map((f) => ({ skill: f.skill, mistakes: f.mistakes, stuckSteps: f.stuckSteps, avoid: f.avoid.questions })) ?? null,
    skills: part.skills.map((id) => skillFacts(curriculum, id, part.step?.skill === id ? part.step.step : null)),
  }));
  return {
    ...(input.itemPolicy ? { itemPolicy: input.itemPolicy } : {}),
    level: `U${plan.level}`,
    lead: plan.lead,
    instructions: page.instructions,
    day,
    page: page.number,
    pageType: page.type,
    parts,
    slots: slots.map((s) => {
      if (input.itemPolicy === "approved-v1" && !s.existing) {
        const full = contractFor(input, w, s, attempt);
        // The writer sees a template item's words and numbers, never its template source.
        const contract = full && full.template ? { type: full.type, source: full.source, item: full.item, numbers: full.numbers, dayRange: full.dayRange, ...(full.textBudget ? { textBudget: full.textBudget } : {}) } : full;
        return { slot: s.id, skills: contract ? [contract.item.skill] : [], contract, ...(s.place ? { room: roomOf(input, s.place, day) } : {}) };
      }
      if (!s.place) return { slot: s.id, part: s.part.kind, skills: s.part.skills };
      const numbers = slotRanges(curriculum, plan.level, s.part.skills);
      // Fluency facts (warm-up, in your head) are a fixed set: the day's number cap does not shrink them (#489).
      const sday = difficultyDay(plan, day);
      if (input.itemPolicy === "approved-v1" && !FLUENCY_PLACES.has(s.place)) for (const range of Object.values(numbers)) range.max = Math.min(dayDifficulty(plan.level, sday).numberRange.max, Math.max(5, Math.ceil(range.max * dayDifficulty(plan.level, sday).rangeFraction)));
      const room = roomOf(input, s.place, day);
      const max = Math.min(...Object.values(numbers).map((r) => r.max));
      return {
        // G1: a personal warm-up aim names its fact skill first (the writer and the fake take the first).
        slot: s.id, part: s.part.kind, skills: s.aim && FLUENCY_PLACES.has(s.place) ? [s.aim.skill, ...s.part.skills.filter((k) => k !== s.aim!.skill)] : s.part.skills, place: s.place, formats: SLOT_FORMATS[s.place] ?? null,
        ...(s.place === "spot-the-error" ? { mistakes: personalMistakes(input, mistakesFor(plan.level)) } : {}),
        numbers,
        rules: Object.fromEntries(Object.entries(numbers).map(([skill, r]) => [skill, rangeRules(skill, r)])),
        ...(room ? { room: { characters: room.characters, perLine: room.perLine, lines: room.lines } } : {}),
        ...(s.planned?.use ? {} : { vary: varyNumber(`${day}:${page.number}:${s.id}`, max) }),
        ...(memory ? { asked: asked(s.part.skills) } : {}),
        ...(s.aim ? { aim: { skill: s.aim.skill, kind: s.aim.kind, means: KIND_WORDS[s.aim.kind], orElse: s.aim.orElse } } : {}),
        ...(s.planned?.use || s.planned?.name ? {
          planned: {
            ...(s.planned.use ? { numbers: s.planned.use } : {}), ...(s.planned.name ? { name: s.planned.name } : {}), ...(s.planned.say ? { say: s.planned.say } : {}),
            ...(s.planned.names ? { names: s.planned.names, things: s.planned.things } : {}),
            ...(s.planned.say && s.planned.does ? { operation: s.planned.does.operation, figure: s.planned.does.figure, figureShows: s.planned.does.figureShows } : {}),
          },
        } : {}),
      };
    }),
    // Shapes of question the book has used up: none of the page's questions (outside practice) may take one again.
    ...(memory && [...memory.shapes.values()].some((x) => x.length >= SHAPE_MOST)
      ? { usedUp: [...memory.shapes].filter(([, x]) => x.length >= SHAPE_MOST).map(([k]) => ({ example: memory.shapeText.get(k)!, words: k })) }
      : {}),
    ...(panels.length ? {
      examples: panels.map((x) => {
        const numbers = slotRanges(curriculum, plan.level, [x.skill]);
        const sday = difficultyDay(plan, day);
        if (input.itemPolicy === "approved-v1") for (const range of Object.values(numbers)) range.max = Math.min(dayDifficulty(plan.level, sday).numberRange.max, Math.max(5, Math.ceil(range.max * dayDifficulty(plan.level, sday).rangeFraction)));
        const kind = kindsOf(curriculum.skill(x.skill)?.text ?? x.skill).find((k) => k !== "draw" && k !== "story") ?? "fact";
        return { slot: x.id, panel: x.place, skills: [x.skill], numbers, rules: { [x.skill]: rangeRules(x.skill, numbers[x.skill]) }, aim: { skill: x.skill, kind, means: KIND_WORDS[kind] } };
      }),
    } : {}),
    exampleBank: slots.flatMap(s => {
      const c = input.itemPolicy === "approved-v1" ? contractFor(input, w, s, attempt) : null;
      // A step template story (#489): the step's practice questions are the models of its difficulty and wording.
      if (c?.template) return [{ band: plan.level <= 9 ? "K-2" : plan.level <= 18 ? "3-5" : "6-9", type: `step:${c.template.format}`, items: (stepOf(curriculum, c.template.skill, c.template.step)?.practice ?? []).map(x => x.problem) }];
      if (c?.type === "template") return [{ band: plan.level <= 9 ? "K-2" : plan.level <= 18 ? "3-5" : "6-9", type: "explain", items: [...ITEM_EXAMPLES.early.explain] }];
      return c ? [itemExamples(c.type, plan.level, c.source)] : s.existing ? [{ ...itemExamples("add", plan.level, "story"), type: "existing", skills: s.part.skills }] : [];
    }),
    ...(slots.some(s=>s.existing) || panels.length && input.itemPolicy === "approved-v1" ? { existingWriter: true } : {}),
    note,
  };
}

/**
 * A number from 1 to `max` for a slot, fixed by its day, page and slot: the AI builds the item around it, so pages
 * written apart (each call sees one page) do not all ask "What is 1 more than 6?". The same plan always gives the same.
 */
function varyNumber(key: string, max: number): number {
  let h = 2166136261;
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return 1 + (h % Math.max(1, Math.min(max, 1000)));
}

/** A slot's text room on a day's page (textRoom), for the plan's level and the day's page count. */
function roomOf(input: GenerateInput, place: SlotName, day: number) {
  return textRoom(place, input.plan.level, input.plan.days.find((d) => d.day === day)?.pages.length ?? 8, input.itemPolicy === "approved-v1");
}

/**
 * The AI's items by slot id; an answer of another shape gives none. A call that throws (a time-out, a refusal, output
 * that is not JSON) is sent once more, the same; the second error is the one returned.
 */
const APPROVED_SYSTEM = [
  "You write only stories and explain-how questions for a printed math workbook in British Columbia.",
  "For every requested slot, copy contract.item with the same slot ID. Change only text. Never change the format, skill, operation, operands, figure or easier example. Code writes every drill and worked example.",
  "Use exactly the digits in contract.numbers in the question text, including repeated occurrences. Add no numbers and omit none. Do not write numbers as words. The operation and its operands are fixed data, not a choice.",
  "Use exampleBank for each question type and grade band. A story must use a named person and real things. Ask about the same things in the question. Use short sentences with one action each. Say now when it helps. Never use in all, altogether, all together, total or left over.",
  "Use plain, simple Canadian English. Keep taught math words. Never ask for tracing, an abstract drawing, a scan, a call or a school grade. Never write the answer or a worked solution.",
  "An explain item must ask how or why about the given math. It is parent-checked. A story must ask for exactly the answer computed by the given operation. For add combine the two operands; subtract takes the second from the first; missing-addend asks what to add to the first to reach the second; multiply asks for equal groups; divide shares equally.",
  "Keep every quantity plausible for a child's life: a large count of groups is packs bought, rows of seats, days or trips, never containers one person fills; a large count of things is people, pages, seats, kilometres or dollars, not leaves or beads.",
  "A story's last sentence is its question and ends with a question mark. Keep every count the question asks for (\"the next 3 numbers\"): never ask for numbers without saying how many.",
  "Stay within room.characters. When contract.textBudget is present, also keep its line count, characters per line and total characters. Code checks word wrapping before accepting the text. Every printed word outside text is code's. A note gives the reason a prior answer failed. Correct only that reason and keep the fixed contract.",
].join("\n");

async function callAi(deps: GenerateDeps, name: string, request: unknown, ids: string[] = []): Promise<{ items: Map<string, unknown>; error: string | null }> {
  const ask = async () => {
    const policy = request as { itemPolicy?: string; existingWriter?: boolean };
    const system = policy.itemPolicy === "approved-v1" ? policy.existingWriter ? `${SYSTEM}\nFor slots with a contract, copy contract.item and change only text. Keep its exact numbers, operation, skill and format. Meet contract.textBudget. Slots without a contract use the existing skill rules, formats, number limits and room. Code-declared coin givens cannot come from your output.` : APPROVED_SYSTEM : SYSTEM;
    const prompt = { name, system, content: [{ type: "text" as const, text: JSON.stringify(request) }], schema: ITEMS_SCHEMA, effort: "medium" as const };
    const dispatch = () => withTimeLimit(deps.timeLimitMs ?? TIME_LIMIT_MS, signal => deps.ai.json(prompt, signal));
    const response = deps.editCall ? await deps.editCall("write", "", prompt, dispatch) : await dispatch();
    return response;
  };
  const read = (out: unknown, into: Map<string, unknown>) => {
    const list = (out as { items?: unknown } | null)?.items;
    if (!Array.isArray(list)) return;
    for (const item of list) {
      const slot = (item as { slot?: unknown } | null)?.slot;
      if (typeof slot === "string" && !into.has(slot)) into.set(slot, item);
    }
  };
  try {
    let resent = false;
    const out = await ask().catch((error) => { if (error instanceof WriterPersistenceError) throw error; resent = true; return ask(); });
    const items = new Map<string, unknown>();
    read(out, items);
    // An answer that leaves out slots it was asked for is incomplete, like one that is not JSON: sent once more (if it
    // was not already), and the slots it gave are kept.
    if (!resent && ids.some((id) => !items.has(id))) read(await ask().catch((error) => { if (error instanceof WriterPersistenceError) throw error; return null; }), items);
    return { items, error: null };
  } catch (e) {
    if (e instanceof WriterPersistenceError) throw e;
    return { items: new Map(), error: e instanceof Error ? e.message : String(e) };
  }
}

/** A panel of a laid-out page (worked example, Watch one, reminder), and the skill its worked example teaches. */
interface Panel {
  id: string;
  layoutSlot: number;
  place: SlotName;
  skill: string;
  /** The attempt whose worked example asks a task no question of the book asks (planned once, #482 review at db3b1a0). */
  attempt?: number;
}

/** A panel as the slot its worked example is planned for. */
const panelSlot = (w: PageWork, p: Panel): Slot => ({ id: p.id, part: { ...w.page.parts[0], skills: [p.skill] }, place: p.place, layoutSlot: p.layoutSlot });

/** The tasks of a page's worked examples, as planned. */
function panelTasks(input: GenerateInput, w: PageWork): string[] {
  return w.panels.flatMap((p) => { const c = contractFor(input, w, panelSlot(w, p), p.attempt ?? 0); const pkg = c ? contractPackage(input, w, c) : null; return pkg ? [taskIdentity(pkg)] : []; });
}

/**
 * What the book has asked so far (#380): each skill's question texts, each question's key with its page, and each
 * question shape (outside practice) with the pages it is on.
 */
interface BookMemory {
  texts: Map<string, string[]>;
  keys: Map<string, number>;
  shapes: Map<string, number[]>;
  /** The first question of each shape, to show the AI which shapes are used up. */
  shapeText: Map<string, string>;
  /** Each shape of code's wordings (round 7) with how often the book prints it: code prints the least used. */
  codeShapes: Map<string, number>;
}

/**
 * A question's shape: its words without numbers, names or other capitalised words, and punctuation ("Mia has 3. How many
 * more make 10?" and "Ben has 6. How many more make 9?" are one shape: "has many more make").
 */
export const shapeOf = (text: string) => text.split(/\s+/).map((w) => w.replace(/[^A-Za-z]/g, "")).filter((w) => w && !/^[A-Z]/.test(w)).join(" ").toLowerCase();
/** Practice places ask one step again and again on purpose: no shape limit there. */
const PRACTICE_PLACES: ReadonlySet<SlotName> = new Set<SlotName>(["warm-up", "finish-these", "on-your-own", "practice-row", "unit-b-practice", "now-you"]);
/** How many questions of one shape a book may have outside practice. */
const SHAPE_MOST = 3;

const plainText = (t: string) => t.toLowerCase().replace(/[^a-z0-9+=?×÷−-]+/g, " ").trim();
/** A question's key: its words and numbers, and for an item with no operation its data too ("How many dots?" twice with other dots is not a repeat). */
const dupKey = (p: QuestionPackage) => `${plainText(p.text)}|${p.operation ? "" : JSON.stringify([p.item?.checks ?? [], p.item?.figure ?? null])}`;
const opKey = (p: QuestionPackage) => (p.operation ? JSON.stringify(p.operation) : null);
const numbersIn = (t: string) => plainText(t).match(/\d+/g) ?? [];
/** Review places: a page of them asks different things, not one question with a new number each time. */
const REVIEW_PLACES: ReadonlySet<SlotName> = new Set<SlotName>(["remember-these", "already-know-it", "friday-5", "show-what-you-know", "picture-stories", "mini-test", "unit-check"]);

/**
 * Why a question repeats one the book already has, or null (#380, round 3): the same question on an earlier page (its
 * text, or for an item with no operation its text and data; not for warm-up facts, which come back on purpose), or on
 * this page the same question, the same sum, or (on a review place) the same words with only one number changed.
 */
function duplicateProblem(p: QuestionPackage, place: SlotName | null, memory: BookMemory | null, siblings: { number: number; package: QuestionPackage }[], page?: number, extra = false): string | null {
  const key = dupKey(p);
  // Warm-up facts come back day after day on purpose (fluency): only a repeat on the same page counts there.
  // A code-written task or a drill is its mathematical data (#482 review): "? = 9 × 2" repeats "9 × 2 = ?". The AI's
  // stories keep their story-frame and shape rules.
  // A step template's Spot the error or Solve it two ways is another task than the drill it prints (its format family,
  // #482 review at 3134252): it repeats only the same task.
  const family = !!stepTemplateOf(p) && (p.item?.format === "spot-the-error" || p.item?.format === "two-ways");
  const at = place === "warm-up" ? undefined : family ? memory?.keys.get(`task:${taskIdentity(p)}`) : memory?.keys.get(key) ?? (byTask(p) ? memory?.keys.get(`task:${taskIdentity(p)}`) : undefined);
  // (Spaced review at U4 to U9, whose numbers are few: a step task five days back may come again, never a Challenge.)
  const spaced = at !== undefined && page !== undefined && extra && extraPracticeRepeats(p.level, true, at, page);
  if (at !== undefined && !spaced) return `it repeats a question already asked on page ${at} ("${p.text}"): write a different question`;
  const shape = shapeOf(p.text);
  // A relation's words are code's (round 6), and so are a whole-number question's at U1 to U9 (round 7): code prints the
  // wording the book has used least, so only the same words twice on a page count.
  const own = isRelation(p) || isCodeWorded(p);
  // (A template page's "How do you know the answer to question 1 is 4?" is code's, one a story page, on purpose.)
  const onPages = place && !PRACTICE_PLACES.has(place) && place !== "how-do-you-know" && shape && !own ? memory?.shapes.get(shape) ?? [] : [];
  if (onPages.length >= SHAPE_MOST) return `the book already asks this kind of question ${onPages.length} times (pages ${[...new Set(onPages)].join(", ")}): ask another kind of question`;
  for (const s of siblings) {
    if (dupKey(s.package) === key) return `it is the same as question ${s.number} on this page ("${s.package.text}")`;
    // The same words twice on a page read as one question asked again, whatever the numbers behind them (round 6).
    if (p.textSource !== "code" && plainText(s.package.text) === plainText(p.text)) return `its text is the same as question ${s.number}'s on this page ("${s.package.text}"): word it another way`;
    const op = opKey(p);
    if (op && op === opKey(s.package)) return `it works the same sum as question ${s.number} on this page ("${s.package.text}")`;
    if (place !== "warm-up" && byTask(p) && byTask(s.package) && taskIdentity(s.package) === taskIdentity(p)) return `it asks the same task as question ${s.number} on this page ("${s.package.text}")`;
    const [a, b] = [numbersIn(p.text), numbersIn(s.package.text)];
    if (p.textSource !== "code" && place && REVIEW_PLACES.has(place) && a.length > 0 && a.length === b.length && plainText(p.text).replace(/\d+/g, "#") === plainText(s.package.text).replace(/\d+/g, "#")
      && a.filter((x, i) => x !== b[i]).length <= 1) return `it differs from question ${s.number} on this page ("${s.package.text}") only by one number: ask another kind of question`;
    if (place && !PRACTICE_PLACES.has(place) && shape && !own && shape === shapeOf(s.package.text)) return `it asks the same kind of question as question ${s.number} on this page ("${s.package.text}") with other numbers or names: ask another kind of question`;
  }
  return null;
}

/** A question compared by its task (#482 review): code's wording, or a drill with no sentence (a bare sum, "Fill gaps."). */
const byTask = (p: QuestionPackage) => isCodeWorded(p) || !sentenceFrameOf(p);

/** A relation item: its text is code's (round 6). */
const isRelation = (p: QuestionPackage) => (p.item?.checks ?? []).some((c) => c.kind === "relation");

/** A copy of the memory to add to: `remember` replaces each list, so the copy shares none it changes. */
const cloneMemory = (m: BookMemory): BookMemory => ({
  texts: new Map(m.texts), keys: new Map(m.keys), shapes: new Map(m.shapes), shapeText: new Map(m.shapeText), codeShapes: new Map(m.codeShapes),
});

/** Adds a finished page's questions to what the book has asked. */
function remember(memory: BookMemory, page: number, questions: GeneratedQuestion[]) {
  for (const q of questions) {
    if (!q.package) continue;
    // (A step template's Spot the error or two ways counts by its task only, so a drill of the same words stays free.)
    const family = !!stepTemplateOf(q.package) && (q.package.item?.format === "spot-the-error" || q.package.item?.format === "two-ways");
    if (!family && !memory.keys.has(dupKey(q.package))) memory.keys.set(dupKey(q.package), page);
    if (q.place !== "warm-up" && (byTask(q.package) || stepTemplateOf(q.package)) && !memory.keys.has(`task:${taskIdentity(q.package)}`)) memory.keys.set(`task:${taskIdentity(q.package)}`, page);
    const shape = shapeOf(q.package.text);
    if (shape && q.place && !PRACTICE_PLACES.has(q.place) && q.check.status !== "failed" && isCodeWorded(q.package)) memory.codeShapes.set(shape, (memory.codeShapes.get(shape) ?? 0) + 1);
    else if (shape && q.place && !PRACTICE_PLACES.has(q.place) && q.check.status !== "failed" && !isRelation(q.package)) {
      memory.shapes.set(shape, [...(memory.shapes.get(shape) ?? []), page]);
      if (!memory.shapeText.has(shape)) memory.shapeText.set(shape, q.package.text);
    }
    for (const k of q.package.skill.skills) memory.texts.set(k, [...(memory.texts.get(k) ?? []), q.package.text]);
  }
}

interface PageWork {
  number: number;
  day: number;
  page: PlannedPage;
  slots: Slot[];
  layout: DayLayout | null;
  /** The page's panels, each asked for a worked example of its own skill (#380). */
  panels: Panel[];
  /** The AI attempts each slot and panel of the page used (#312), with those of earlier calls; shared by its redos. */
  tries: Tries;
  /** The page's AI calls in order (R379-7-1): the next call's place, and the calls an earlier try kept; shared too. */
  calls: { next: number; kept: Map<number, StoredCall> };
  /** The solve checks an earlier try kept of the page's calls, by solveKey (R379-8-1). */
  solves: Map<string, SolveVerdict>;
}

/** A page's AI attempts by slot or panel id, and the most a slot may use (the ledger's; no limit without one). */
interface Tries {
  used: Map<string, number>;
  max: number;
}

/** A question or worked example that used its AI attempts in an earlier try that stopped before its page was stored. */
const EXHAUSTED: QuestionCheck = { status: "failed", reason: "it used its AI attempts in an earlier try that stopped before its page was stored" };
const exhaustedBuild = (): BuiltQuestion => ({ check: EXHAUSTED, package: null, stepIds: [] });
/** The attempts a slot has used, as a question stores them (1 to 3). */
const triesOf = (w: PageWork, id: string) => Math.min(3, Math.max(1, w.tries.used.get(id) ?? 1)) as GeneratedQuestion["attempts"];
/** Whether a slot or panel may be asked again. */
const hasTry = (w: PageWork, id: string) => (w.tries.used.get(id) ?? 0) < w.tries.max;

const askText = (a: CallAsk | undefined) => (a ? `${a.name} of ${[...a.slots, ...a.panels].join(", ") || "nothing"}` : "a call of an older shape");
const sameAsk = (a: CallAsk | undefined, b: CallAsk) =>
  !!a && a.name === b.name && JSON.stringify(a.slots) === JSON.stringify(b.slots) && JSON.stringify(a.panels) === JSON.stringify(b.panels);

/** A slot's room for code's wordings: two thirds of it on a shorter rewrite. */
const shorterRoom = (room: number | undefined, shorter: boolean) => (room !== undefined && shorter ? Math.floor((room * 2) / 3) : room);

/**
 * Writes the page's slots at `which` (indexes) and its `panels` in one AI call and builds each. Each attempt is counted
 * before the call (#312, R379-2-1); a slot or panel with no attempt left, or that the ledger refuses (R379-3-1), is not
 * asked: it comes back failed with no package, and is in `refused`. Throws when the ledger or the call store does (the
 * run was lost), and when a kept call asked other slots than this one does (ResumeMismatch).
 */
async function writeSlots(input: GenerateInput, deps: GenerateDeps, w: PageWork, which: number[], note: string | null, name: string, panels: Panel[] = [], memory: BookMemory | null = null, pageTexts: string[] = [], o: { wordLater?: boolean; skipSolve?: boolean } = {}) {
  const seq = w.calls.next++;
  const ask: CallAsk = { name, slots: which.map((i) => w.slots[i].id), panels: panels.map((x) => x.id) };
  // A call an earlier try kept (R379-7-1): the same call of the same page, replayed as it came back, with the attempts
  // it counted; no attempt is counted again and the AI is not asked. It must have asked what this call asks (R379-8-2).
  const kept = w.calls.kept.get(seq);
  if (kept) {
    if (!sameAsk(kept.ask, ask) || kept.built.length !== which.length || kept.examples.length !== panels.length) {
      throw new ResumeMismatch(`page ${w.number}: its kept call ${seq} is ${askText(kept.ask)}, and the plan now asks ${askText(ask)}`);
    }
    for (const [id, n] of Object.entries(kept.tries)) w.tries.used.set(id, n);
    await solveChecks(deps, w, seq, ask, kept.built, kept.examples);
    return { built: kept.built, examples: kept.examples, refused: new Set(kept.refused) };
  }
  const attempt = input.itemPolicy === "approved-v1" ? 0 : name === "workbook_page_redo" ? 1 : 0;
  const contracts = new Map(which.map(i => [w.slots[i].id, input.itemPolicy === "approved-v1" ? contractFor(input, w, w.slots[i], attempt) : null]));
  const local = new Map<string, unknown>();
  if (input.itemPolicy === "approved-v1") {
    // Code's words, and a template page's explanation, which code writes from the page's first story.
    // (And every story: the writer no longer edits any story text, code prints its own, Savar 2026-11-04 B1.)
    for (const [id, c] of contracts) if (c?.source === "code" || c?.source === "story" || c?.type === "template" && c.source === "explain") local.set(id, c.item);
    for (const p of panels) {
      // The slot the planner chose the example's task for (#482: an example asked another page's task).
      const c = contractFor(input, w, panelSlot(w, p), p.attempt ?? 0);
      contracts.set(p.id, c);
      if (c) local.set(p.id, c.item);
    }
  }
  // G1: a code fact (item 4) is built here from code's operation; the writer is never asked for it.
  const facts = new Map(which.flatMap((i) => { const f = w.slots[i].fact; return f && w.slots[i].existing ? [[w.slots[i].id, f] as const] : []; }));
  for (const [id, f] of facts) local.set(id, factItem(id, f));
  const existing = new Set([...which.filter(i=>w.slots[i].existing).map(i=>w.slots[i].id), ...panels.filter(p=>!contracts.get(p.id)).map(p=>p.id)]);
  const ids = [...ask.slots, ...ask.panels].filter(id => !facts.has(id) && (input.itemPolicy !== "approved-v1" || existing.has(id) || contracts.get(id)?.source === "explain" && contracts.get(id)?.type !== "template"));
  const open = ids.filter((id) => hasTry(w, id));
  const denied = open.length > 0 && deps.attempts ? (await deps.attempts.use(w.number, open)).refused : [];
  const refused = new Set([...ids.filter((id) => !open.includes(id)), ...denied]);
  for (const id of open) w.tries.used.set(id, denied.includes(id) ? w.tries.max : (w.tries.used.get(id) ?? 0) + 1);
  const asked = which.map((i) => w.slots[i]).filter((x) => !refused.has(x.id) && !facts.has(x.id) && (input.itemPolicy !== "approved-v1" || x.existing || contracts.get(x.id)?.source === "explain" && contracts.get(x.id)?.type !== "template"));
  const askedPanels = panels.filter((x) => !refused.has(x.id) && (input.itemPolicy !== "approved-v1" || existing.has(x.id)));
  const out = asked.length + askedPanels.length > 0
    ? await callAi(deps, name, pageRequest(input, w, asked, note, askedPanels, memory, pageTexts, attempt), [...asked.map((x) => x.id), ...askedPanels.map((x) => x.id)])
    : { items: new Map<string, unknown>(), error: null };
  for (const [id, raw] of local) out.items.set(id, raw);
  const missing = (id: string) => (out.items.size ? ` (it answered slots ${[...out.items.keys()].join(", ")}, not ${id})` : " (its answer held no items)");
  // Each panel's worked example: of its own skill, one code can show worked out, in the level's numbers.
  const examples = panels.map((x) => {
    if (refused.has(x.id)) return exhaustedBuild();
    const c = contracts.get(x.id);
    const builder = input.itemPolicy === "approved-v1" && !existing.has(x.id) ? (raw: unknown, place: Parameters<typeof buildQuestion>[1]) => c ? buildPlannedItem(c, raw, place) : unapprovedBuild() : buildQuestion;
    const b = builder(shortSequence(out.items.get(x.id), input.plan.level), {
      id: `${input.workbookId}:d${w.day}p${w.page.number}${x.id}`, workbookId: input.workbookId, page: w.number, question: 1, level: input.plan.level, skills: [x.skill],
      signs: skillSigns(input.curriculum, input.plan.level, x.skill),
    });
    if (out.error && !out.items.has(x.id) && (input.itemPolicy !== "approved-v1" || c)) b.check = { status: "failed", reason: `the AI gave no answer: ${out.error}` };
    if (b.package) b.package = withoutSam(b.package, null);
    const pkg = b.package;
    if (b.check.status !== "failed" && pkg && !workableExample(pkg)) {
      b.check = { status: "failed", reason: "a panel's worked example is a sum, a count, a sequence, an order or a relation code can work out" };
    }
    if (b.check.status !== "failed" && pkg) {
      const problem = levelRange(pkg, input) ?? (input.itemPolicy === "approved-v1" ? dayProblem(input, pkg, w.day, x.place) : null);
      if (problem) b.check = { status: "failed", reason: problem };
    }
    return b;
  });
  const built = which.map((i) => {
    const slot = w.slots[i];
    if (refused.has(slot.id)) return exhaustedBuild();
    const c = contracts.get(slot.id);
    const builder = input.itemPolicy === "approved-v1" && !slot.existing ? (raw: unknown, place: Parameters<typeof buildQuestion>[1]) => c ? buildPlannedItem(c, raw, place) : unapprovedBuild() : buildQuestion;
    const b = builder(shortSequence(out.items.get(slot.id), input.plan.level), {
      id: `${input.workbookId}:d${w.day}p${w.page.number}s${slot.id}`,
      // A step template item's skill is its step's (a story page's reviewed step, a Challenge's stretch, a taught step
      // when the page's own tasks ran out): code picked it, so the place allows it.
      workbookId: input.workbookId, page: w.number, question: i + 1, level: input.plan.level, skills: c ? [...new Set([c.item.skill, ...slot.part.skills])] : slot.fact ? [...new Set([slot.fact.skill, ...slot.part.skills])] : slot.part.skills,
      signs: skillSigns(input.curriculum, input.plan.level, c ? c.item.skill : slot.part.skills[0]),
      // A shorter rewrite (the page did not fit) gives code's wordings two thirds of the room: a shorter one prints.
      ...(slot.place ? { room: shorterRoom(roomOf(input, slot.place, w.day)?.characters, name === "workbook_page_shorter") } : {}), variant: w.number + i,
      // (A code fact prints code's text as it is.)
      ...(slot.fact ? { preserveText: true } : slotWording(input, slot) ? { wording: slotWording(input, slot) } : {}),
      ...(slot.place && STORY_CHECK_PLACES.has(slot.place) ? { story: true } : {}),
    });
    // Sam is only Spot the error's child: anyone else named Sam takes the slot's planned name.
    if (b.package && slot.place && slot.place !== "spot-the-error") b.package = withoutSam(b.package, slot.planned?.name ?? null);
    if (b.package && facts.has(slot.id)) b.package.textSource = "code";
    if (out.error && !out.items.has(slot.id) && (input.itemPolicy !== "approved-v1" || c)) b.check = { status: "failed", reason: `the AI gave no answer: ${out.error}` };
    else if (input.itemPolicy !== "approved-v1" && !out.items.has(slot.id) && b.check.status === "failed") b.check = { status: "failed", reason: `${b.check.reason}${missing(slot.id)}` };
    // A slot with a layout of its own takes only its format: another would not lay out there.
    const format = b.package?.item?.format;
    // Before any other reason: a question of another format is never written into this place, whatever else it fails.
    if ((input.itemPolicy !== "approved-v1" || slot.existing) && slot.place && STRICT_SLOTS.includes(slot.place) && format && !SLOT_FORMATS[slot.place]?.includes(format)) {
      b.check = { status: "failed", reason: `the ${slot.place} place takes the ${SLOT_FORMATS[slot.place]!.join(" or ")} format, not ${format}` };
    }
    // Spot the error shows Sam's wrong steps, built by code: the shown wrong answer must be a mistake code can show.
    // A step template Spot the error shows Sam's answer, not code's steps of an operation (#489).
    if (slot.place === "spot-the-error" && b.package?.item?.format === "spot-the-error" && b.check.status !== "failed" && b.package && !isStepItem(b.package)) {
      let problem = samProblem(b.package, input.plan.level);
      // G1: on the day's first Spot the error page, Sam shows the child's own mistake when the sum allows it (item 3).
      const own = samPrefer(input, w);
      const mine = own.length ? samFix(b.package, input.plan.level, 0, (p) => own.includes(p.wrongAnswers[0]?.cause as never)
        && checkQuestionPackage(p).status === "checked" && !samProblem(p, input.plan.level) && !levelRange(p, input), own) : null;
      if (mine) {
        b.package = mine;
        problem = null;
      }
      if (problem) {
        // The AI's mistake cannot happen on its sum: show one that can (chosen in turn by the slot), checked again.
        const fixed = samFix(b.package, input.plan.level, varyNumber(`${w.day}:${w.page.number}:${slot.id}`, 100), (p) =>
          checkQuestionPackage(p).status === "checked" && !samProblem(p, input.plan.level) && !levelRange(p, input));
        if (fixed) {
          b.package = fixed;
          problem = null;
        }
      }
      if (problem) b.check = { status: "failed", reason: problem };
    }
    // Every number fits the level and slot: the range of the item's skill (an earlier skill's under review).
    if (slot.place && b.check.status !== "failed" && b.package) {
      const problem = levelRange(b.package, input) ?? (input.itemPolicy === "approved-v1" ? dayProblem(input, b.package, w.day, slot.place ?? "") : null);
      if (problem) b.check = { status: "failed", reason: problem };
    }
    return b;
  });
  if (!o.wordLater) chooseWordings(input, w, which, built, memory, pageTexts);
  // The call is kept with the attempts it counted as soon as it is built, before its solve checks and anything else
  // (R379-7-1, R379-8-1), so a try that stops later (a solve check, another page, the function's end) never loses an
  // answer it paid for. A call that counted none is not kept: it asked nothing, and a replay makes the same.
  if ((open.length > 0 || input.itemPolicy === "approved-v1") && deps.calls) {
    await deps.calls.save(w.number, seq, { ask, built, examples, refused: [...refused], tries: Object.fromEntries(open.map((id) => [id, w.tries.used.get(id)!])) });
  }
  if (!o.skipSolve) await solveChecks(deps, w, seq, ask, built, examples);
  return { built, examples, refused };
}

/**
 * The solve check (round 7) of a call's questions and worked examples: every sound one whose printed words the AI wrote
 * is read and answered by a separate model; one it answers otherwise than the key, or a check that fails or is late,
 * fails it. Each check is kept as it comes back, under its key (R379-8-1); a check an earlier try kept is not run
 * again, its verdict is used. Every check settles before this returns or throws, so none is still writing after.
 */
async function solveChecks(deps: GenerateDeps, w: PageWork, seq: number, ask: CallAsk, built: BuiltQuestion[], examples: BuiltQuestion[]) {
  const items = [...built.map((b, k) => ({ b, id: ask.slots[k] })), ...examples.map((b, k) => ({ b, id: ask.panels[k] }))];
  const settled = await Promise.allSettled(items.map(async ({ b, id }) => {
    if (b.check.status === "failed" || !b.package) return;
    const key = solveKey(w.number, seq, id);
    let verdict = w.solves.get(key);
    if (!verdict) {
      const log = await solveCheck(deps.solver, b.package, deps.solveTimeLimitMs ?? SOLVE_TIME_LIMIT_MS, deps.now);
      if (!log) return;
      deps.onSolve?.(log);
      await deps.calls?.saveSolve(key, log);
      verdict = log.verdict;
    }
    if (verdict.status !== "agreed") {
      // A step template story the reader could not answer as reworded keeps the template's own checked words: the
      // slot is not left empty for the writer's words (the U4 review, items 1 and 4).
      const c = w.slots.find((x) => x.id === id)?.contract;
      const pkg = b.package;
      if (c?.template && pkg.textSource === "ai") {
        const back = buildStepItem(c.template, c.item.text, { id: pkg.id, workbookId: pkg.ref.source === "workbook" ? pkg.ref.workbookId : "", page: pkg.ref.source === "workbook" ? pkg.ref.page : 0, question: pkg.ref.source === "workbook" ? pkg.ref.question : 1, level: pkg.level, skills: pkg.skill.skills }, "code");
        if (back.package && back.check.status !== "failed") { b.package = back.package; b.check = back.check; return; }
      }
      b.check = { status: "failed", reason: solveReason(verdict) };
    }
  }));
  const failure = settled.find((x) => x.status === "rejected");
  if (failure) throw (failure as PromiseRejectedResult).reason;
}

/**
 * Code's wording of the built questions, chosen against the page's other texts (`pageTexts`, then each one chosen) and
 * the book (`memory`); changes only their text, never their check.
 */
function chooseWordings(input: GenerateInput, w: PageWork, which: number[], built: BuiltQuestion[], memory: BookMemory | null, pageTexts: string[]) {
  // A relation's text is code's (round 6): of its wordings, one whose words no other question of the page has. So is a
  // whole-number question's at U1 to U9 (round 7): of code's sound wordings, one whose shape the page does not have yet
  // and the book has printed least (under 3 times when it can), so no slot runs out of wordings late in the book.
  // A bare sum has no words: its form is its signs ("# + ? = #"), so "1 + ? = 8" and "1 + ? = 9" are one form.
  const formOf = (x: string) => shapeOf(x) || plainText(x).replace(/\d+/g, "#");
  const taken = new Set(pageTexts.map(formOf));
  built.forEach((b, k) => {
    if (!b.package) return;
    const place = w.slots[which[k]].place;
    const room = (place ? roomOf(input, place, w.day)?.characters : null) ?? Infinity;
    const onPage = (x: string) => taken.has(formOf(x));
    if (b.wordings && b.check.status !== "failed") {
      const practice = !place || PRACTICE_PLACES.has(place);
      const used = (x: string) => (practice ? 0 : memory?.codeShapes.get(shapeOf(x)) ?? 0);
      // Not a question the book already printed word for word (warm-up facts come back on purpose).
      const printed = (x: string) => !!memory && place !== "warm-up" && memory.keys.has(dupKey({ ...b.package!, text: x }));
      // Within the room if it can; a sound question past its room beats a repeat (the fit check then decides).
      const unused = b.wordings.filter((x) => !onPage(x) && !printed(x));
      const fitting = unused.filter((x) => x.length <= room);
      const fresh = fitting.length ? fitting : unused.sort((x, y) => x.length - y.length).slice(0, 1);
      const best = fresh.find((x) => used(x) < SHAPE_MOST) ?? [...fresh].sort((x, y) => used(x) - used(y))[0];
      if (best && best !== b.package.text) b.package = { ...b.package, text: best };
    } else {
      const wordings = relationWordings(b.package);
      if (wordings.length > 0 && onPage(b.package.text)) {
        const free = wordings.find((x) => !onPage(x) && x.length <= room);
        if (free) b.package = { ...b.package, text: free };
      }
    }
    taken.add(formOf(b.package.text));
  });
}

type PageCall = Awaited<ReturnType<typeof writeSlots>>;

/**
 * A page's first call (#312): every slot and panel, told what the days before asked (`memory`), never this day's other
 * pages, so the pages of a day make it at once and the same at any concurrency. Code's wording and the rest of the page
 * (its repeats, the redo, the fit) are firstPass's, in page order. The solve check reads no code wording, so it runs here.
 */
const pageCall = (input: GenerateInput, deps: GenerateDeps, w: PageWork, memory: BookMemory | null) =>
  writeSlots(input, deps, w, w.slots.map((_, i) => i), null, PAGE_CALL, w.panels, memory, [], { wordLater: true });

/** The names of a page's AI calls: its first call, then the redo and the shorter rewrite. */
const PAGE_CALL = "workbook_page";
const LATER_CALLS: readonly string[] = ["workbook_page_redo", "workbook_page_shorter"];

/** Places that print bare sums, and places that print stories: what code's wording of a whole-number question takes. */
const BARE_PLACES: ReadonlySet<SlotName> = new Set<SlotName>(["warm-up", "in-your-head", "practice-row", "finish-these", "on-your-own", "unit-b-practice", "solve-it-two-ways"]);
const STORY_PLACES: ReadonlySet<SlotName> = new Set<SlotName>(["word-problems", "picture-stories", "challenge", "math-in-the-world", "mixed-set"]);
const WORDING_KINDS: readonly string[] = ["story", "picture", "fact", "missing-part"];
/** Places whose every question is a story, checked for plain story language (D-201, storyProblem). */
const STORY_CHECK_PLACES: ReadonlySet<SlotName> = new Set<SlotName>(["word-problems", "picture-stories", "mixed-set"]);

/**
 * What code words a slot's whole-number question with at U1 to U9 (round 7): the planned person and thing (and the
 * ones the AI may choose instead), the kinds of question its place and aim take, and the planned wording. Undefined
 * for a slot the book plan named no one for (code's defaults then).
 */
function slotWording(input: GenerateInput, slot: Slot): SlotWording | undefined {
  const p = slot.planned;
  if (!p?.name || !p.thing) return undefined;
  const skill = slot.aim?.skill ?? slot.part.skills[0];
  const text = input.curriculum.skill(skill)?.text ?? skill;
  const step = /two-more-less|2 more/.test(`${skill} ${text}`) || isOneMoreLessSkill(skill) || /1 more/.test(text.toLowerCase());
  const aimed = slot.aim ? [slot.aim.kind, ...slot.aim.orElse].filter((k) => WORDING_KINDS.includes(k)) as WordingKind[] : [];
  const kinds: WordingKind[] = slot.place && BARE_PLACES.has(slot.place) ? ["fact", "missing-part"]
    : slot.place && STORY_PLACES.has(slot.place) ? ["story", "picture", "missing-part"]
      : aimed.length ? aimed : ["story", "picture", "missing-part", "fact"];
  return {
    name: p.name, thing: p.thing, names: p.names ?? [p.name], things: p.things ?? [p.thing], kinds, step,
    subtraction: skillRange(input.curriculum, input.plan.level, skill).subtraction,
    planned: p.say && p.does ? { say: p.say, operation: p.does.operation, figure: p.does.figure } : null,
  };
}

/**
 * A question given its slot's planned wording by code (round 6), or null: when the AI's text failed as a repeat of its
 * page or book but its item works the planned operation (with the planned picture), code's wording of the same item.
 * The rewritten question is checked again in full; null when it would fail.
 */
function withPlannedWording(input: GenerateInput, b: BuiltQuestion, slot: Slot): BuiltQuestion | null {
  if (b.package?.textSource) return null;
  const say = slot.planned?.say;
  const does = slot.planned?.does;
  const p = b.package;
  if (!say || !does || !p?.operation || p.text === say) return null;
  if (p.operation.kind !== does.operation.kind || JSON.stringify(p.operation.operands) !== JSON.stringify(does.operation.operands)) return null;
  if (does.figure && p.item?.figure?.kind !== does.figure) return null;
  const pkg: QuestionPackage = { ...p, text: say };
  const check = checkQuestionPackage(pkg);
  const facts = { thing: slot.planned?.thing ?? null };
  const story = slot.place && STORY_CHECK_PLACES.has(slot.place) ? storyProblem(say, facts) : quantityStoryProblem(say, facts);
  if (check.status === "failed" || kindProblem(pkg, {}) || story || levelRange(pkg, input)) return null;
  return { ...b, package: pkg, check: check.status === "checked" ? { status: "checked" } : { status: "not-checked", reason: check.reason } };
}

/** A failed repeat given its planned wording by code, when that is sound and repeats nothing on the page (round 6). */
function rewordRepeat(input: GenerateInput, b: BuiltQuestion, slot: Slot, memory: BookMemory | null, others: { number: number; package: QuestionPackage }[]): BuiltQuestion {
  if (b.check.status !== "failed" || !NEEDS_NEW.test(b.check.reason)) return b;
  const again = withPlannedWording(input, b, slot);
  if (!again) return b;
  markRepeat(again, slot.place, memory, others);
  return again.check.status === "failed" ? b : again;
}

const generated = (w: PageWork, i: number, b: BuiltQuestion, attempts: GeneratedQuestion["attempts"]): GeneratedQuestion => ({
  number: i + 1, slot: w.slots[i].id, part: w.slots[i].part.kind, ...(w.slots[i].place ? { place: w.slots[i].place! } : {}), check: b.check, attempts, package: b.package,
  ...(w.slots[i].contract ? { itemPlan: structuredClone(w.slots[i].contract!) } : {}),
  ...(w.slots[i].existing ? { existing: true } : {}),
  ...(!w.slots[i].contract && b.package && b.wordings?.includes(b.package.text) ? { codeText: b.package.text } : {}),
});

/** What to do about a failed check, said plainly for the redo; null when the reason says it all. */
function hintFor(reason: string): string | null {
  if (/is too big for this question/.test(reason)) return "Every number counts: the text, the operation and its answer, each wrong answer and the easier example. Leave out a wrong answer past the limit.";
  if (/easier example has the question's answer/.test(reason)) return "Work out both answers first: the easier example's answer must be a different number. For a missing part, make it 1 smaller (3 + ? = 4 for 3 + ? = 5), and ask a missing part of 2 or more.";
  if (/is a number in words/.test(reason)) return "Write numbers in digits, and do not use the word \"one\": write \"a\" or reword.";
  if (/this question uses no /.test(reason)) return "Keep to the slot's rules: only an operation kind and a format they allow.";
  if (/easier example is not smaller/.test(reason)) return "Sort both sets of numbers from least to greatest: each easier number is no larger than the question's at its place, and one is smaller (for 4 + 3: 1 + 2 or 2 + 3).";
  if (/needs an operation code can compute/.test(reason)) return "A question with no number answer is a draw item (a parent checks it); else give the operation.";
  if (/has no easier example/.test(reason)) return "Give an easier example of the same kind: a smaller missing part (3 + ? = 4 for 3 + ? = 5), or smaller numbers (1 + 1 for 2 + 1).";
  if (/but its answer is the operation's number/.test(reason)) return "Ask for the number the operation gives, or make it a draw item.";
  if (/repeats a question|same as question|text is the same as question|same sum as question|only by one number|same kind of question|this kind of question/.test(reason)) return "Write a different question: another kind (a story, a picture to count, a missing part, a sequence) or other numbers, never one in the slot's asked list.";
  if (/is a count: write it as the sequence format|the sequence goes from|the sequence starts at/.test(reason)) return "Make it a sequence item whose first and last numbers are the ones the text says.";
  if (/gives its own answer|adding or taking away 0/.test(reason)) return "Ask for a number the child works out; the text gives only what the child needs.";
  if (/the solve check/.test(reason)) return "A reader who sees only the printed text and picture must work out exactly the answer code computes from your data: name every number it works, ask for what it gives, and say nothing that points to another operation.";
  return null;
}

/** A reason that the question repeats one of the book or of its page, or gives its own answer: its redo takes new numbers. */
const NEEDS_NEW = /repeats a question|same as question|same task as question|text is the same as question|same sum as question|only by one number|same kind of question|this kind of question|gives its own answer/;

/** The redo's words for a failed question or worked example. */
function failNote(id: string, b: BuiltQuestion, slot?: Slot): string {
  const reason = (b.check as { reason: string }).reason;
  const steps = b.stepIds.length ? ` Its operation's worked steps are named: ${b.stepIds.join(", ")}.` : "";
  const hint = hintFor(reason);
  // A repeat: the slot's next kind of question and its spare numbers (as its planned numbers), so the redo asks it
  // another way.
  const again = slot && NEEDS_NEW.test(reason);
  const next = again && slot.aim && !/gives its own answer/.test(reason) ? slot.aim.orElse[0] : undefined;
  const kind = next ? ` Write it as a ${next} question: ${KIND_WORDS[next]}.` : "";
  const numbers = again && slot.planned?.spare
    ? ` Use the numbers ${slot.planned.spare.join(" and ")} (its planned numbers now)${slot.planned.spareSay ? `, worded as "${slot.planned.spareSay}"` : ""}.` : "";
  return `Slot ${id} failed the check: ${reason}.${steps}${hint ? ` ${hint}` : ""}${kind}${numbers} Write it again.`;
}

/** The slot as its redo asks it after `reason`: a repeat takes the slot's next kind and its spare numbers. */
function redoSlot(slot: Slot, reason: string): Slot {
  if (!NEEDS_NEW.test(reason)) return slot;
  const next = slot.aim && !/gives its own answer/.test(reason) ? slot.aim.orElse[0] : undefined;
  return {
    ...slot,
    ...(slot.aim && next ? { aim: { ...slot.aim, kind: next, orElse: slot.aim.orElse.filter((k) => k !== next) } } : {}),
    ...(slot.planned?.spare ? { planned: { ...slot.planned, use: slot.planned.spare, spare: null, say: slot.planned.spareSay ?? null, spareSay: null, does: slot.planned.spareDoes ?? null, spareDoes: null } } : {}),
  };
}

/**
 * Why a sound question is too long for its place, for the redo, or null: its text runs past its slot's room, or (on a
 * parent-led card) its sequence has more numbers than a line holds. `length` is what a shorter redo must beat.
 */
function overRoom(input: GenerateInput, w: PageWork, i: number, b: BuiltQuestion): { length: number; note: string } | null {
  const place = w.slots[i].place;
  const room = place ? roomOf(input, place, w.day) : null;
  // Code's wording is already the shortest that fits (round 7): an AI redo would not change it.
  if (!room || b.check.status === "failed" || !b.package || isCodeWorded(b.package)) return null;
  const id = w.slots[i].id;
  const n = b.package.text.length;
  if (n > room.characters) {
    return { length: n, note: `Slot ${id} is sound but too long for its place: its text has ${n} characters and its room is ${room.characters}. Write the same kind of question again, on the same skill, in at most ${room.characters} characters (short sentences: 'Mia has 5 cars. She gets 3 more. How many cars now?').` };
  }
  const terms = (b.package.item?.checks ?? []).flatMap((c) => (c.kind === "sequence" ? [c.terms.length] : []))[0] ?? 0;
  if (input.plan.level <= 3 && terms > PARENT_SEQUENCE_MOST) {
    return { length: n, note: `Slot ${id} is sound but too long for its card: its sequence has ${terms} numbers and a card's line holds ${PARENT_SEQUENCE_MOST}. Write it again with at most ${PARENT_SEQUENCE_MOST} numbers (count from 3 to 7, not from 1 to 10).` };
  }
  return null;
}

/** Fails a sound question that repeats one of the book or of `others` on this page. */
function markRepeat(b: BuiltQuestion, place: SlotName | null, memory: BookMemory | null, others: { number: number; package: QuestionPackage }[], page?: number, extra = false) {
  if (b.check.status === "failed" || !b.package || !memory) return;
  if (place === "how-do-you-know" && STORY_EXPLAIN.test(b.package.text)) return;
  const problem = duplicateProblem(b.package, place, memory, others, page, extra);
  if (problem) b.check = { status: "failed", reason: problem };
}

/** The sound questions of `built` other than `except`, as siblings to compare with. */
const siblingsOf = (built: BuiltQuestion[], upTo: number, except = -1) =>
  built.flatMap((b, j) => (j < upTo && j !== except && b.check.status !== "failed" && b.package ? [{ number: j + 1, package: b.package }] : []));

/**
 * The first pass at a page: the page call (with its panels' worked examples), then one redo call for its failed
 * questions and examples (their one try for a failed check). A question that repeats one the book already asked, or
 * another on its page, fails the check with the reason (round 3); its redo takes the slot's next kind and spare numbers.
 * A sound question whose text runs past its room goes to the same redo to be written shorter (round 5): the page keeps
 * the redo only when it is sound and shorter, so a long question is never marked failed for its length.
 */
async function firstPass(input: GenerateInput, deps: GenerateDeps, w: PageWork, memory: BookMemory | null, first: PageCall): Promise<{ questions: GeneratedQuestion[]; examples: (QuestionPackage | null)[] }> {
  const all = w.slots.map((_, i) => i);
  const built = first.built;
  // The page call left code's wording to now (#312): it reads this day's pages before this one too.
  chooseWordings(input, w, all, built, memory, []);
  built.forEach((b, i) => {
    // (An extra practice page asks this workbook's questions again: the book plan allows each once more.)
    markRepeat(b, w.slots[i].place, memory, siblingsOf(built, i), w.number, !!w.page.extraPractice);
    // A repeat whose item is the planned one takes the planned wording from code, with no AI call (round 6).
    built[i] = rewordRepeat(input, b, w.slots[i], memory, siblingsOf(built, i));
  });
  const examples = first.examples;
  const questions = all.map((i) => generated(w, i, built[i], triesOf(w, w.slots[i].id)));
  // Only a slot or panel with an attempt left goes to the redo (#312): one that used them keeps what it has.
  const failed = all.filter((i) => built[i].check.status === "failed" && hasTry(w, w.slots[i].id));
  const long = input.book ? all.flatMap((i) => {
    const over = hasTry(w, w.slots[i].id) ? overRoom(input, w, i, built[i]) : null;
    return over ? [{ i, ...over }] : [];
  }) : [];
  const failedPanels = w.panels.flatMap((x, k) => (examples[k].check.status === "failed" && hasTry(w, x.id) ? [k] : []));
  if (failed.length > 0 || failedPanels.length > 0 || long.length > 0) {
    const note = [
      ...failed.map((i) => failNote(w.slots[i].id, built[i], w.slots[i])),
      ...long.map((x) => x.note),
      ...failedPanels.map((k) => failNote(w.panels[k].id, examples[k])),
    ].join("\n");
    const which = [...failed, ...long.map((x) => x.i)].sort((a, b) => a - b);
    const kept = built.flatMap((b) => (b.check.status !== "failed" && b.package ? [b.package.text] : []));
    // A repeat's redo asks the slot its next kind with its spare numbers.
    const redoWork: PageWork = { ...w, slots: w.slots.map((x, i) => (failed.includes(i) ? redoSlot(x, (built[i].check as { reason: string }).reason) : x)) };
    const redo = await writeSlots(input, deps, redoWork, which, note, "workbook_page_redo", failedPanels.map((k) => w.panels[k]), memory, memory ? kept : []);
    which.forEach((i, k) => {
      // The ledger refused it after all (#312): it keeps its first version.
      if (redo.refused.has(w.slots[i].id)) {
        questions[i] = generated(w, i, built[i], triesOf(w, w.slots[i].id));
        return;
      }
      let fresh = redo.built[k];
      markRepeat(fresh, w.slots[i].place, memory, siblingsOf(built, built.length, i), w.number, !!w.page.extraPractice);
      fresh = rewordRepeat(input, fresh, redoWork.slots[i], memory, siblingsOf(built, built.length, i));
      const wasLong = long.find((x) => x.i === i);
      // A long question keeps its first version unless the redo is sound and shorter.
      if (wasLong && (fresh.check.status === "failed" || !fresh.package || !!overRoom(input, w, i, fresh) && fresh.package.text.length >= wasLong.length)) {
        questions[i] = generated(w, i, built[i], triesOf(w, w.slots[i].id));
        return;
      }
      built[i] = fresh;
      questions[i] = generated(w, i, built[i], triesOf(w, w.slots[i].id));
    });
    failedPanels.forEach((k, j) => { if (!redo.refused.has(w.panels[k].id)) examples[k] = redo.examples[j]; });
  }
  return { questions, examples: examples.map((e) => (e.check.status === "failed" ? null : e.package)) };
}

const sound = (q: GeneratedQuestion) => q.check.status !== "failed";
const textLength = (q: GeneratedQuestion) => q.package?.text.length ?? Infinity;

/** What the shorter rewrite is told: the fit problems, and each question's text length against its room. */
function shorterNote(input: GenerateInput, w: PageWork, questions: GeneratedQuestion[], problems: FitProblem[]): string {
  const lengths = questions.flatMap((q, i) => {
    const place = w.slots[i].place;
    const room = place ? roomOf(input, place, w.day) : null;
    return q.package ? [`slot ${q.slot}: ${q.package.text.length} characters${room ? ` (room ${room.characters})` : ""}${q.package.item?.format === "written-reason" ? ", with writing lines" : ""}`] : [];
  });
  return [
    `The page did not fit its template: ${problems.map((p) => (p.question ? `question ${p.question}: ` : "") + p.reason).join("; ")}.`,
    "Write every slot again, shorter, so the page fits: keep each question's text well within its room (fewer characters than its room if you can), with no writing lines (written-reason) or tall picture on a card, and the same skill and rules.",
    `Now: ${lengths.join("; ")}.`,
  ].join(" ");
}

/**
 * The shorter rewrite after a failed fit check: every question is written once more (its one try for a page that does
 * not fit). Of the two versions the page keeps the sound one, and of two sound (or two failed) ones the shorter text: a
 * rewrite never puts a failed question in place of a sound one, nor a longer one in place of a shorter. A question with
 * no attempt left (#312: the job allows 3) is not written again and keeps its version. Null: no question had one.
 */
async function shorterRewrite(input: GenerateInput, deps: GenerateDeps, w: PageWork, previous: GeneratedQuestion[], note: string, memory: BookMemory | null): Promise<GeneratedQuestion[] | null> {
  const all = previous.map((_, i) => i);
  const open = all.filter((i) => hasTry(w, w.slots[i].id));
  if (open.length === 0) return null;
  const written = await writeSlots(input, deps, w, open, note, "workbook_page_shorter", [], memory);
  const built = new Map(open.flatMap((i, k) => (written.refused.has(w.slots[i].id) ? [] : [[i, written.built[k]] as const])));
  // Each question is compared with the ones the page keeps before it (whichever version they keep), so two shorter
  // versions never come back as copies of each other.
  const chosen: GeneratedQuestion[] = [];
  for (const i of all) {
    const old = previous[i];
    const attempts = triesOf(w, w.slots[i].id);
    const before = chosen.flatMap((q, j) => (q.package && q.check.status !== "failed" ? [{ number: j + 1, package: q.package }] : []));
    const again = built.get(i);
    if (again) markRepeat(again, w.slots[i].place, memory, before, w.number, !!w.page.extraPractice);
    const fresh = again ? generated(w, i, again, attempts) : null;
    const keepOld = !fresh || (sound(old) !== sound(fresh) ? sound(old) : textLength(fresh) > textLength(old));
    let pick: GeneratedQuestion = keepOld || !fresh ? { ...old, attempts } : fresh;
    // The old version may repeat one kept before it too (written before those changed): then it fails with the reason.
    if (pick === fresh || !pick.package || pick.check.status === "failed" || !memory) {
      chosen.push(pick);
      continue;
    }
    const problem = duplicateProblem(pick.package, w.slots[i].place, null, before);
    if (problem) pick = { ...pick, check: { status: "failed", reason: problem } };
    chosen.push(pick);
  }
  return chosen;
}

/** The questions numbered again from 1 in their order, each package's place with its new number. */
const renumbered = (questions: GeneratedQuestion[]): GeneratedQuestion[] => questions.map((q, k) => ({
  ...q, number: k + 1, package: q.package ? { ...q.package, ref: { ...q.package.ref, question: k + 1 } } : null,
}));

/**
 * How tall a question's card is, roughly, for pairing: a picture and a format drawn under the text (a sequence, order,
 * relation or pattern, a drawing) each add to it, and so does each line of text past the first.
 */
function tallness(input: GenerateInput, w: PageWork, q: GeneratedQuestion): number {
  const p = q.package;
  if (!p) return 0;
  const place = w.slots.find((x) => x.id === q.slot)?.place;
  const perLine = (place ? roomOf(input, place, w.day)?.perLine : null) ?? 23;
  const drawn = p.item?.format === "draw" || (p.item?.checks ?? []).some((c) => c.kind === "sequence" || c.kind === "order" || c.kind === "relation" || c.kind === "pattern");
  return (p.item?.figure ? 2 : 0) + (drawn ? 2 : 0) + Math.max(0, Math.ceil(p.text.length / perLine) - 1);
}

/**
 * A parent-led page's questions with its tall cards paired in rows (#380, round 5): a row of 2 cards is as tall as its
 * taller card, so in each slot of 3 or more cards the tallest go first, side by side. Null when the order is the same.
 */
function pairedTall(input: GenerateInput, w: PageWork, questions: GeneratedQuestion[]): GeneratedQuestion[] | null {
  if (input.plan.level > 3) return null;
  const layoutSlot = (q: GeneratedQuestion) => w.slots.find((x) => x.id === q.slot)?.layoutSlot ?? -1;
  const out: GeneratedQuestion[] = [];
  for (let i = 0; i < questions.length;) {
    let j = i;
    while (j < questions.length && layoutSlot(questions[j]) === layoutSlot(questions[i])) j++;
    const block = questions.slice(i, j);
    out.push(...(block.length >= 3 ? block.map((q, k) => ({ q, k, t: tallness(input, w, q) })).sort((a, b) => b.t - a.t || a.k - b.k).map((x) => x.q) : block));
    i = j;
  }
  return out.every((q, k) => q === questions[k]) ? null : renumbered(out);
}

/** Optional drills yield to teaching cards. A planned error item is never removed to make a page fit. */
function toLeaveOut(questions: GeneratedQuestion[], problems: FitProblem[]): { index: number; reason: string } | null {
  const removable = questions.map((q, index) => ({ q, index })).filter(({ q }) => q.place !== "spot-the-error" && q.part !== "spot-the-error");
  if (!removable.length) return null;
  const drills = removable.filter(({ q }) => q.part === "practice" || q.part === "remember-these" || q.part === "warm-up");
  const candidates = drills.length ? drills : removable;
  const named = problems.filter(p => p.question !== null && candidates.some(({ q }) => q.number === p.question));
  const last = named.reduce<FitProblem | null>((a, p) => (!a || p.question! > a.question! ? p : a), null);
  const chosen = last ? candidates.find(({ q }) => q.number === last.question)! : candidates.at(-1)!;
  return { index: chosen.index, reason: last?.reason ?? problems[0]?.reason ?? "the page does not fit" };
}

/** The layout's omissions with the questions left out added to their parts' (the page placed fewer of them). */
function omissionsWith(w: PageWork, leftOut: { slot: Slot }[]): Omission[] {
  const omissions = (w.layout?.omissions ?? []).map((o) => ({ ...o }));
  const why = (n: number) => `${n} question${n === 1 ? "" : "s"} left out: the page had no room for ${n === 1 ? "its" : "their"} text`;
  w.page.parts.forEach((part, index) => {
    const n = leftOut.filter((x) => x.slot.part === part).length;
    if (n === 0) return;
    const had = omissions.find((o) => o.part === index);
    if (had) {
      had.placed = Math.max(0, had.placed - n);
      had.reason = `${had.reason}; ${why(n)}`;
    } else {
      const placed = w.slots.filter((x) => x.part === part && x.place !== "how-do-you-know").length;
      omissions.push({ part: index, kind: part.kind, requested: placed, placed: Math.max(0, placed - n), reason: why(n) });
    }
  });
  return omissions.sort((a, b) => a.part - b.part);
}

/**
 * A laid-out day page's content for its questions; null when the book is not laid out. A slot left with no question
 * (every one left out to fit) is not on the page; a panel stays.
 */
function contentOf(input: GenerateInput, w: PageWork, questions: GeneratedQuestion[], examples: (QuestionPackage | null)[] = []): PageContent | null {
  if (!input.book || !w.layout) return null;
  const layoutSlot = (q: GeneratedQuestion) => w.slots.find((x) => x.id === q.slot)!.layoutSlot;
  const keep = w.layout.slots.flatMap((x, k) => (PANEL_SLOTS.includes(x.slot) || questions.some((q) => layoutSlot(q) === k) ? [k] : []));
  const content = dayPageContent({
    curriculum: input.curriculum, plan: input.plan, day: w.day, page: w.page, layout: { ...w.layout, slots: keep.map((k) => w.layout!.slots[k]) },
    child: input.book.child, workbook: input.number,
    questions: questions.map((q) => ({
      number: q.number, slot: keep.indexOf(layoutSlot(q)), package: q.package, ...(q.check.status === "failed" ? { failed: q.check.reason } : {}),
    })),
    examples: w.panels.flatMap((x, k) => (examples[k] ? [{ slot: keep.indexOf(x.layoutSlot), package: examples[k]! }] : [])),
  });
  if (input.itemPolicy === "approved-v1" && content.kind === "day") {
    content.blocks.forEach((block, index) => {
      const part = w.page.parts[w.layout!.slots[keep[index]]?.part];
      if (block.slot === "reminder" && !part?.skills.every(skill=>/likelihood/.test(skill))) { block.explain=undefined; block.lines=block.lines?.slice(-2); }
      if (block.slot === "spot-the-error" && block.lines) block.lines=block.lines.slice(-1);
      if (["worked-example", "watch-one", "reminder"].includes(block.slot) && part?.skills.every(skill => /likelihood/.test(skill))) {
        block.label = "Likelihood words";
        block.methods = [];
        block.figure = undefined;
        // The page's own example (a task no question asks), so a day's panels differ (the full U4 book printed one
        // fixed sentence on two pages of Day 9).
        const own = w.panels.map((x, k) => (keep.indexOf(x.layoutSlot) === index ? examples[k] : null)).find(Boolean);
        const answer = own?.item?.regions.find((r) => r.kind === "choice")?.answer;
        // (The answer on its question's line, and the words' meanings short: the full U4 book's Day 9 panel took a third
        // of its practice page.)
        block.lines = own && answer ? [`${own.text} Answer: [${answer}]`] : ["A stone cannot grow legs. Answer: [never]"];
        block.explain = "Never: it cannot happen. Sometimes: it may happen. Always: every time.";
        // (Once: a panel's lines and its explanation printed it twice, the full U4 book's Day 9.)
        if (block.slot !== "worked-example") { block.lines.push(block.explain); block.explain = undefined; }
      }
    });
  }
  if (content.kind === "day" && w.page.compactPanel) for (const block of content.blocks) {
    if (block.slot !== "watch-one") continue;
    // (One line: the example with its answer.)
    const line = (block.lines ?? []).find((l) => /\[[^\]]+\]/.test(l)) ?? block.lines?.[0];
    Object.assign(block, { slot: "reminder", label: "Remember", lines: line ? [line] : [], methods: [], explain: undefined, figure: undefined });
  }
  if (content.kind === "day") {
    content.extraGap = w.page.extraGap ?? 0;
    content.consistentLayout = input.itemPolicy === "approved-v1";
    content.fillingComplete = w.page.fillingComplete;
    if (w.page.timeLimited) content.timeLimited = true;
    if (w.page.atMaximum) content.atMaximum = true;
    // The page's instruction says what its questions ask (the U4 review, item 15), on practice and review pages; the
    // other pages keep their own line.
    // What to circle, said on every page that has a circled choice (Savar, 2026-11-04: true or false never said to
    // circle): "Circle true or false.", "Circle yes or no.", else "Circle your answer.".
    const circled = questions.filter(q => q.package && q.place !== "warm-up").flatMap(q => (q.package!.item?.regions ?? []).flatMap(r => r.kind === "choice" && r.mark !== "tick" ? [r.choices.map(c => c.toLowerCase()).sort().join(",")] : []));
    const circleLine = !circled.length ? null : circled.every(c => c === "false,true") ? "Circle true or false." : circled.every(c => c === "no,yes") ? "Circle yes or no." : "Circle your answer.";
    // (A new idea page's chip says "Read how it works, then try it.": its instruction line says what to write and circle,
    // never the same words twice, Savar 2026-11-04.)
    if (["practice", "practice-2", "remember-these", "remember-these-mixed-set", "new-idea"].includes(w.page.type)) {
      const formats = new Set(questions.filter(q => q.package && q.place !== "warm-up").map(q => q.package!.item?.format ?? "write-number"));
      const circle = !!circleLine, boxes = formats.has("boxes"), write = [...formats].some(f => !["circle", "boxes"].includes(f));
      const writes = questions.some(q => q.package && q.place !== "warm-up" && (q.package.item?.regions ?? []).some(r => r.kind === "box"));
      const boxLine = writes && write ? (input.plan.level === 4 ? "Fill in the boxes." : "Fill in the missing numbers and write the answers in the boxes.") : "Fill in the missing numbers.";
      const parts = [boxes ? boxLine : writes ? "Write the answer in the box." : null, circle ? circleLine : null].filter(Boolean);
      if (parts.length) content.subtitle = parts.join(" ");
    } else if (circleLine && !/\bcircle\b/i.test(content.subtitle ?? "")) content.subtitle = `${content.subtitle ? `${content.subtitle.replace(/\s*$/, "")} ` : ""}${circleLine}`;
    if (w.page.extraPractice) Object.assign(content, { extraPractice: true, title: "Extra practice", subtitle: `Answer questions from this workbook.${circleLine ? ` ${circleLine}` : ""}` });
  }
  return content;
}

const fitPage = (w: PageWork, qrToken: string, questions: GeneratedQuestion[], content: PageContent | null): DraftPage => ({
  number: w.number,
  dayLabel: `Day ${w.day}`,
  type: w.page.type,
  qrToken,
  questions: questions.filter((q) => q.package).map((q) => ({ number: q.number, package: q.package! })),
  ...(content ? { content } : {}),
});

/**
 * Runs `run` on the items, at most `limit` at once, in item order, and stops taking items once `stop` says so. On the
 * first error no new item starts, and every item in flight settles before the error is thrown (#312, R379-2), so
 * nothing of this call is still writing when its caller tries again.
 */
async function pool<T>(items: T[], limit: number, run: (item: T) => Promise<void>, stop: () => boolean): Promise<void> {
  let next = 0;
  let failure: { error: unknown } | null = null;
  const worker = async () => {
    while (!failure && next < items.length && !stop()) {
      try {
        await run(items[next++]);
      } catch (error) {
        failure ??= { error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  if (failure) throw (failure as { error: unknown }).error;
}

/**
 * The book's pages and their numbers, before any AI call: the cover, How + Plan, the days, the back cover, blanks. Each
 * day page with its layout, slots and panels, and each slot planned (#380). The same input always gives the same.
 */
/** Apply the template capacity before assigning an item or asking the writer. */
export function workbookCapacityPlan(curriculum: Curriculum, plan: WorkbookPlan): WorkbookPlan {
  const taught = new Set<string>();
  return { ...plan, days: plan.days.map(day => ({ ...day, pages: day.pages.map(page => {
    page = { ...page, parts: page.parts.map(p=>p.kind === "remember-these" && taught.size ? {...p,skills:[...new Set([...p.skills,...taught])]} : p) };
    if (page.capacity) return page;
    const layout = layoutDayPage(curriculum, plan, day.day, page);
    // Friday 5 owns its five places. Optional review shares the remaining room.
    const friday = page.parts.findIndex(p => p.kind === "friday-5");
    if (friday >= 0) {
      const at = layout.slots.find(s => s.slot === "friday-5");
      if (at) at.items = 5; else layout.slots.push({ slot: "friday-5", part: friday, items: 5 });
    }
    if(page.type === "unit-b") for(const s of layout.slots) if(s.slot === "worked-example") s.slot="reminder";
    const reduced = plan.level >= 19;
    const target = (n: number) => reduced ? Math.ceil(n * .75) : n;
    const has = (name: SlotName) => layout.slots.some(s => s.slot === name);
    for (const s of layout.slots) {
      if(page.type === "remember-these" && s.slot === "picture-stories") s.slot="unit-b-practice";
      if (s.slot === "remember-these") s.items = ["word-problems","challenge","unit-b","new-idea"].includes(page.type) ? 0 : target(friday >= 0 ? 4 : has("mixed-set") ? 4 : 8);
      if (s.slot === "now-you") s.items = target(3);
      if (s.slot === "finish-these") s.items = target(2);
      if (s.slot === "on-your-own") s.items = target(6);
      // 8 practice questions beside the page's Spot the error and two ways (the adopted count; they do not count).
      if (s.slot === "practice-row") s.items = target(8);
      if (s.slot === "word-problems") s.items = target(3);
      if (s.slot === "unit-b-practice" && page.type !== "remember-these") s.items = target(6);
      if (s.slot === "mixed-set") s.items = target(4);
      if (s.slot === "spot-the-error" && page.parts[s.part]?.skills.every(skill => /likelihood/.test(skill))) { s.slot = "unit-b-practice"; s.items = 1; }
      if (s.slot === "challenge") s.items = target(3);
      // The page's 6 cards (the U4 review: 4 cards left the page half empty; 8 put U16's Day 10 over 30 minutes); the measured fit
      // drops one when they do not fit, down to 4.
      if (s.slot === "show-what-you-know") s.items = target(6);
    }
    // The page's 8 practice questions across its rows, not 8 a row (D-229: 8 to 10 a page; U16's Practice 2 held 14).
    const rows = layout.slots.filter(s => s.slot === "practice-row");
    if (rows.length > 1) rows.forEach((s, k) => { s.items = Math.floor(target(8) / rows.length) + (k < target(8) % rows.length ? 1 : 0); });
    if (page.type === "unit-b") {
      const practice=layout.slots.find(s=>s.slot==="unit-b-practice");
      if(practice) practice.items=Math.max(1,target(6)-layout.slots.filter(s=>s!==practice && !PANEL_SLOTS.includes(s.slot)).reduce((n,s)=>n+s.items,0));
    }
    if (page.type === "remember-these" && friday < 0) {
      const other=layout.slots.filter(s=>s.slot!=="remember-these" && !PANEL_SLOTS.includes(s.slot)).reduce((n,s)=>n+s.items,0);
      const reviews=layout.slots.filter(s=>s.slot==="remember-these");
      if(reviews.length) { reviews[0].items=target(Math.max(4,8-other)); for(const s of reviews.slice(1)) s.items=0; }
    }
    if (page.type === "new-idea" && !layout.slots.some(s=>s.slot==="now-you")) {
      const part=page.parts.findIndex(p=>p.kind==="new-idea");
      if(part>=0) layout.slots.push({slot:"now-you",part,items:3});
    }
    for(const p of page.parts) if(p.step && p.unit === "A") for(const skill of p.skills) taught.add(skill);
    const parts = page.parts.map((part, i) => ({ ...part, items: layout.slots.filter(s => s.part === i && s.slot !== "how-do-you-know").reduce((n,s) => n + s.items, 0) + (part.kind === "practice" ? part.faded?.watch ?? 0 : 0) }));
    const likelihood = layout.slots.filter(s => s.slot !== "challenge" && !PANEL_SLOTS.includes(s.slot) && parts[s.part].skills.every(skill => /likelihood/.test(skill)));
    if (likelihood.reduce((n,s) => n+s.items,0) >= 3) {
      const review = day.pages.flatMap(p => p.parts).find(p => p.unit === "A" && p.skills.length);
      if (review) {
        let room = Math.floor(likelihood.reduce((n,s)=>n+s.items,0)/2);
        const budget = room;
        for (const s of likelihood) { s.items = Math.min(s.items, room); room -= s.items; }
        const items = budget - room;
        parts.push({ ...review, kind: "remember-these", unit: null, step: null, items, faded: undefined, methods: undefined, hints: true });
        layout.slots.push({ slot: "remember-these", part: parts.length - 1, items });
        for (const s of likelihood) parts[s.part].items = layout.slots.filter(x => x.part === s.part).reduce((n,x) => n+x.items,0);
      }
    }
    return { ...page, parts, capacity: layout.slots };
  }) })) };
}

function layOut(input: GenerateInput) {
  if (input.itemPolicy === "approved-v1") input = { ...input, plan: workbookCapacityPlan(input.curriculum, input.plan) };
  const work: PageWork[] = [];
  let number = 2;
  for (const day of input.plan.days) {
    for (const page of day.pages) {
      const layout = input.book ? layoutDayPage(input.curriculum, input.plan, day.day, page) : null;
      // A likelihood skill has no numeric wrong solution. Use the existing
      // practice block for its approved circle task, rather than an error strip.
      const panels = (layout?.slots ?? []).flatMap((x, k): Panel[] => {
        const part = page.parts[x.part];
        const skill = part?.step?.skill ?? part?.skills[0];
        return PANEL_SLOTS.includes(x.slot) && skill ? [{ id: `e${k + 1}`, layoutSlot: k, place: x.slot, skill }] : [];
      });
      work.push({
        number: ++number, day: day.day, page, layout, slots: layout ? layoutSlots(page, layout) : slotsOf(page), panels,
        tries: { used: new Map(), max: Infinity }, calls: { next: 0, kept: new Map() }, solves: new Map(),
      });
    }
  }
  if (input.itemPolicy === "approved-v1" && input.book) {
    const count = Math.ceil((number + 1) / 4) * 4 - number;
    const last = input.plan.days.at(-1)!;
    const main = [...new Set(input.plan.days.flatMap(d => d.pages.flatMap(p => p.parts.filter(p => p.step && p.unit === "A").flatMap(p => p.skills))))];
    const practised=[...new Set(input.plan.days.flatMap(d=>d.pages.flatMap(p=>p.parts.flatMap(p=>p.skills))))];
    const covered=main.filter(s=>approvedQuestionTypes(s).length);
    // Every approved skill the book practised, main skills first: two pages of new tasks need more than the main skill.
    const taught=[...new Set([...covered,...practised.filter(s=>approvedQuestionTypes(s).length)])];
    const extras = input.plan.extraPractice ?? Array.from({ length: count }, (_, i): PlannedPage => ({
      ...last.pages[0], number: last.pages.length + i + 1, type: "remember-these", extraPractice: true,
      parts: [{ kind: "remember-these", unit: null, step: null, skills: taught.length ? taught : last.pages[0].parts[0].skills, items: input.plan.level >= 19 ? 6 : 8, hints: false,
        // #489: extra practice from the steps this book taught.
        ...(input.plan.newSteps.length ? { reviewSteps: input.plan.newSteps.map(s => ({ skill: s.skill, step: s.step })) } : {}) }],
      capacity: [{ slot: "remember-these", part: 0, items: input.plan.level >= 19 ? 6 : 8 }],
    }));
    for (const page of extras) {
      const layout = layoutDayPage(input.curriculum, input.plan, last.day, page);
      work.push({ number: ++number, day: last.day, page, layout, slots: layoutSlots(page, layout), panels: [],
        tries: { used: new Map(), max: Infinity }, calls: { next: 0, kept: new Map() }, solves: new Map() });
    }
  }
  // Each slot's skill, kind of question, numbers and person, planned in book order (#380), so the same skill is not
  // asked the same way page after page and no two questions of a page work one sum.
  if (input.book) planBook(input, work);
  if (input.itemPolicy === "approved-v1") {
    const used = new Map<string, number>(), frames = new Set<string>();
    const usedAt = new Map<string, number>();
    const byDay = <T,>() => { const m = new Map<number, Map<string, T>>(); return (day: number) => { if (!m.has(day)) m.set(day, new Map()); return m.get(day)!; }; };
    const framesOf = byDay<number>();
    // The smallest size of the day's Challenge questions by template: practice from the same template stays below it.
    const challengeOf = byDay<number>();
    // How often the day's practice used a step's Challenge templates: 3 at most, so the Challenge keeps tasks.
    const reservedOf = byDay<number>();
    // How often the day used each template: 4 at most while other tasks are left (the real U4 sample: one true or false
    // nine times on Day 5).
    const templatesOf = byDay<number>();
    // A Challenge card from an earlier step, by step: the day's practice of that step stays below its difficulty (the
    // real U4 sample: "? and 9 make 10" beside practice's "has 4 cookies and wants 10", both hard).
    const cardStepsOf = byDay<number>();
    const sizeOf = itemSize;
    const truthOf = (c: ItemPlan): string | null => {
      if (c.template?.format !== "true-false") return null;
      const answer = c.template.answer.toLowerCase();
      return ["true", "yes"].includes(answer) ? "true" : ["false", "no"].includes(answer) ? "false" : null;
    };
    // Every day's Challenge is planned first, so its step's hardest tasks are its own before any page spends them, an
    // earlier day's practice too (#482 review at 3134252: reserve scarce Challenge tasks; the U4 review: Day 3's
    // practice took the "7 + 1" Day 5's Challenge needed).
    // Then every number stories page: stories are scarce at the young levels (the full U4 book: Day 10's ran out), and
    // the other pages can take drills.
    // U4's final review reserves its small task pool too, before practice takes every printable alternative.
    const first = (w: PageWork) => w.page.type === "challenge" || input.plan.level === 4 && w.page.type === "show-what-you-know" ? 0 : w.page.type === "word-problems" ? 1
      : input.plan.level === 4 && w.page.type === "new-idea" ? 2 : 3;
    // (The Challenges from the last day back: a later day reaches larger numbers, so it takes the largest, and an earlier
    // day's still fit its smaller range. The full U4 book: Day 2's took "7 + 1", which Day 5's needed.)
    const planning = work.map((w, i) => ({ w, i })).sort((a, b) => first(a.w) - first(b.w) || (first(a.w) === 0 ? b.i - a.i : a.i - b.i)).map(x => x.w);
    // Each page's worked examples are chosen first: no other page's example asks their task, and the book's questions
    // then leave it (#482 review at db3b1a0: an example answered a later question; the full U4 book: the questions had
    // used every task of a small step before its examples were chosen).
    for (const w of work) for (const panel of w.panels) {
      for (let attempt = 0; attempt < 64; attempt++) {
        const c = contractFor(input, w, panelSlot(w, panel), attempt);
        const pkg = c ? contractPackage(input, w, c) : null;
        if (!pkg) { if (attempt === 0) break; continue; }
        // (One the panel can work: a colouring task fails as an example and the panel takes a question's place.)
        if (!workableExample(pkg) && attempt < 63) continue;
        const key = taskIdentity(pkg);
        if (used.has(key)) continue;
        panel.attempt = attempt;
        // (Twice: not even an extra practice repeat asks it.)
        used.set(key, 2);
        break;
      }
    }
    // A Challenge or Show what you know frame once a book (the U16 r13 review: "Write N thousands, ... as a number" on
    // the Challenge of Days 1, 5 and 10): a step with no other hard frame takes the hard items of steps reached so far.
    const cardFrames = new Map<string, CardFrameUse[]>();
    const cardUse = (w: PageWork, slot: Slot, p: QuestionPackage): CardFrameUse => ({ day: w.day, challenge: slot.place === "challenge", numbers: cardNumbers(p) });
    const cardPlace = (slot: Slot) => slot.place === "challenge" || slot.place === "show-what-you-know";
    // G1 (item 5): the book's eligible code stories so far and how many name an interest, in book order.
    const interesting = interestWords(input.plan).things.length > 0;
    const interest = { eligible: 0, named: 0 };
    // G1 (item 8): the reading-load story share caps stories in a page's practice and review slots.
    const storyShare = input.plan.personal?.hasAssessment ? input.plan.personal.adjustments.storyShare : null;
    for (const w of planning) {
      let pageStoryCount = 0;
      const storyCap = storyShare === null ? Infinity : Math.max(1, Math.floor(storyShare * w.slots.filter((x) => x.place && x.place !== "warm-up" && !STORY_CHECK_PLACES.has(x.place)).length));
      const pageOps = new Set<string>();
      // The same words twice on a page read as one question asked again, whatever its format family.
      const pageTexts = new Set<string>();
      const pageStems = new Map<string, number>();
      const pageKinds = new Set<string>();
      const pageStories = new Set<string>();
      const pageStoryKinds = new Set<string>();
      const pageTypes = new Map<string, number>();
      const partTypes = new Map<string, number>();
      const truthCounts = new Map<string, number>();
      // One template a third of the page at most, half when nothing else is left (the U4 review: six "counts N in a
      // circle and says M" on one page pass as six contexts).
      const pageTemplates = new Map<string, number>();
      const templateKey = (c: ItemPlan) => c.template ? `${c.template.skill}#${c.template.step}.${c.template.index}` : null;
      // (By template: a Spot the error or two ways on the Challenge's template stays below it too, #482 review at db3b1a0.)
      const kindKey = (c: ItemPlan) => templateKey(c);
      // Cedric's section 9: at least 3 contexts or formats on the page, no sentence frame twice on it, 2 at most a day.
      const pageForms = new Set<string>(), pageFrames = new Set<string>();
      const dayFrames = framesOf(w.day), dayChallenge = challengeOf(w.day), dayReserved = reservedOf(w.day), dayTemplates = templatesOf(w.day), dayCardSteps = cardStepsOf(w.day);
      // Slots whose place takes number templates only (Spot the error, Solve it two ways) are planned first, so the
      // page's other slots can still bring its third context or format (#489).
      const order = [...w.slots.keys()].sort((a, b) => Number(!NUMBER_PLACES.has(w.slots[a].place ?? "")) - Number(!NUMBER_PLACES.has(w.slots[b].place ?? "")) || a - b);
      for (const [index, slot] of order.map((i, k) => [k, w.slots[i]] as const)) {
        const skill = slot.aim && FLUENCY_PLACES.has(slot.place ?? "warm-up") ? slot.aim.skill : slot.part.skills[((Number(slot.id.split(".")[1]) || 1) - 1) % slot.part.skills.length];
        const challengeSkill = input.plan.days.find(d=>d.day===w.day)?.pages.flatMap(p=>p.parts.filter(p=>p.unit==="A").flatMap(p=>p.skills)).find(s=>/^1\.1-(?:count|read-write|number-line)/.test(s));
        // G1: a code fact of the child's family is built from its own operation, with no writer and no contract.
        if (slot.fact && !w.page.existingSlots) { slot.existing = true; slot.contract = null; continue; }
        // G1 (item 5): a slot offers the interest nouns while the book's printed share of them is below its target.
        if (interesting && slot.place !== "warm-up") slot.interest = interest.named < INTEREST_SHARE.target * (interest.eligible + 1);
        // A slot its step's templates fill (#489) never goes to the existing writer.
        // (A few attempts: a long hard template fits a Challenge card's room only with some of its numbers.)
        const templated = !w.page.existingSlots && [0, 1, 2, 3, 6, 12, 128].some((k) => !!templateContractFor(input, w, { ...slot, contract: undefined }, k));
        slot.existing = w.page.existingSlots ? w.page.existingSlots.includes(slot.id) : templated ? false : slot.place === "challenge" ? !challengeSkill : !approvedQuestionTypes(skill).length;
        if (slot.existing) {
          slot.contract = null;
          const range = skillRange(input.curriculum, input.plan.level, skill);
          const d = { ...dayDifficulty(input.plan.level, difficultyDay(input.plan, w.day)), helpLevel: daySchedule(input.plan, w.day).helpLevel };
          const cap = Math.min(d.numberRange.max, Math.max(5,Math.ceil(range.max*d.rangeFraction)));
          if (slot.planned && (slot.planned.use?.some(n=>n>cap) || (slot.planned.use?.reduce((a,b)=>a+b,0) ?? 0)>cap || d.helpLevel!=="pictures" && slot.planned.does?.figure)) slot.planned={...slot.planned,use:null,spare:null,say:null,spareSay:null,does:null,spareDoes:null};
          continue;
        }
        if (w.page.itemContracts && Object.hasOwn(w.page.itemContracts, slot.id)) {
          slot.contract = structuredClone(w.page.itemContracts[slot.id]);
          if (slot.place === "challenge" && slot.contract) slot.part = { ...slot.part, skills: [slot.contract.item.skill] };
          continue;
        }
        // The page's printed questions still to plan, this one included (warm-up facts are fluency, not variety).
        // Existing-writer slots are not counted: their form is the writer's, so code makes the page's three alone.
        const left = order.slice(index).map(i => w.slots[i]).filter(x => x.place !== "warm-up" && !x.existing).length;
        const needForm = slot.place !== "warm-up" && pageForms.size < 3 && pageForms.size + left <= 3;
        let best: { c: ItemPlan; p: QuestionPackage; key: string; op: string; type: string; frame: string | null; sentence: string | null } | null = null;
        // A step template slot whose candidates all fail falls back to #482's builders for its skill (#489).
        // (Never for a Challenge: #482's builders are not on the day's hardest step.)
        // A page that still needs a third form, and whose step's templates print no other, takes #482's builder for the
        // skill when it prints one (#482 review at 3134252: valid alternatives before a repeated form).
        const builder = templated && slot.place !== "challenge" ? slot.part.step?.skill ?? skill : null;
        // (Last, a review card whose part reviews one exhausted step takes the page's practice part, its earlier steps'
        // hard review items: the full U4 book's Day 9 "Remember these" had no likelihood task left, Savar 2026-11-04.)
        const practicePart = slot.place === "remember-these" ? w.slots.find((s) => s.part !== slot.part && s.part.step && ["on-your-own", "finish-these", "practice-row"].includes(s.place ?? ""))?.part : undefined;
        const passes: { strict: boolean; override?: string; borrow?: boolean }[] = [{ strict: true }, ...(builder && needForm ? [{ strict: true, override: builder }] : []), { strict: false }, ...(builder ? [{ strict: false, override: builder }] : []), ...(practicePart ? [{ strict: false, borrow: true }] : [])];
        for (const { strict, override, borrow } of passes) {
          if (borrow && practicePart) slot.part = practicePart;
          for (let candidate = 0; candidate < (strict ? 512 : 1024) && !best; candidate++) {
            if (borrow && candidate >= 512) break;
            const c = contractFor(input, w, slot, borrow ? LATE_ATTEMPT + candidate : candidate, override);
            if (!c) continue;
            // A template item's sentence frames are limited by page and day instead (Cedric's section 9).
            const frame = !c.template && (c.source === "story" || c.type === "likelihood") ? storyFrame(c.item.text) : null;
            if (frame && frames.has(frame)) continue;
            const built = buildPlannedItem(c, c.item, { id: "capacity", workbookId: input.workbookId, page: w.number, question: 1, level: input.plan.level, skills: [c.item.skill] });
            const p = built.package;
            if (!p || built.check.status === "failed" || dayProblem(input, p, w.day,slot.place ?? "")) continue;
            // G1: a short-story day takes stories of at most 20 words first (reading load, item 8).
            if (strict && candidate < 256 && slot.place && STORY_CHECK_PLACES.has(slot.place) && shortStories(input.plan, w.day) && wordsIn(p.text) > SHORT_STORY_WORDS) continue;
            // (An interest slot takes a story that names an interest first, while its early attempts find one, item 5.)
            if (strict && candidate < 64 && slot.interest && interestEligible(input.curriculum, c) && !printsInterest(input.plan, p.text)) continue;
            // (And at most its story share of the page's practice and review items are stories, item 8.)
            if (strict && slot.place && !STORY_CHECK_PLACES.has(slot.place) && !STEP_STORY_PLACES.has(slot.place) && isNumberStory(p.text) && pageStoryCount >= storyCap) continue;
            // The task is its mathematical data: "? = 9 × 2" repeats "9 × 2 = ?" (warm-up facts come back on purpose).
            const key = slot.place === "warm-up" ? JSON.stringify(["warm-up", c.item.text, c.item.operation]) : taskIdentity(p);
            const op = c.item.operation ? JSON.stringify(c.item.operation) : key;
            // A template item's type is its context or format, as the three-forms rule reads it (#489).
            const type = c.template ? printedForm(p) : ["word-problems","challenge"].includes(w.page.type) && c.source === "story" ? storyFrame(c.item.text) : p ? taskType(p) : c.type;
            // A Challenge page asks the step's few hardest templates: it may print fewer forms (the book check agrees).
            const fewChallenge = w.page.type === "challenge" && slot.place === "challenge" && (c.template?.challengeTemplates ?? 3) < 3;
            if (w.slots.length >= 3 && !fewChallenge && (pageTypes.get(type) ?? 0) >= Math.ceil(w.slots.length / 2)) continue;
            // (And half of its own part while the part has 4 or more: a Mixed set is the page when its other part plans away,
            // the full U16 book's Day 2 printed three "then 17 more" stories of four.)
            const partSlots = w.slots.filter((x) => x.part === slot.part && x.place !== "warm-up").length;
            if (partSlots >= 4 && !fewChallenge && (partTypes.get(`${slot.layoutSlot}|${type}`) ?? 0) >= Math.ceil(partSlots / 2)) continue;
            const truth = truthOf(c);
            if (strict && truth && ["true", "false"].includes(truth) && (truthCounts.get(truth) ?? 0) > (truthCounts.get(truth === "true" ? "false" : "true") ?? 0)) continue;
            const tk = templateKey(c);
            const kk = kindKey(c);
            // (Show what you know reviews the book with each step's hardest version: the Challenge's limits on practice
            // are not its own.)
            const topReview = slot.place === "show-what-you-know" || slot.place === "level-test";
            if (kk && slot.place !== "challenge" && !topReview && dayChallenge.has(kk) && sizeOf(c) >= dayChallenge.get(kk)!) continue;
            if (tk && c.template?.reserved && slot.place !== "challenge" && !topReview && (dayReserved.get(tk) ?? 0) >= 3) continue;
            // (6 for the page's own step, so its pages mix its templates, the U16 review.)
            const ownTemplate = !!c.template && !!slot.part.step && c.template.skill === slot.part.step.skill && c.template.step === slot.part.step.step;
            if (tk && strict && slot.place !== "challenge" && slot.place !== "warm-up" && (dayTemplates.get(tk) ?? 0) >= (ownTemplate ? 8 : 4)) continue;
            // (A quarter while other tasks are left: the real U4 sample printed four "counts N in a circle" in a row.)
            // A Challenge asks each of its step's few Challenge templates once when earlier steps can bring its other cards.
            // (Each of its templates once while it has three: two "orders N boxes" cards on one Challenge, the U16 sample.)
            if (tk && slot.place === "challenge" && (pageTemplates.get(tk) ?? 0) >= 1 && ((c.template?.challengeTemplates ?? 3) >= 3 || challengeReviewSteps(input, slot, w.day, input.plan.level).length)) continue;
            if (tooEasyStory(input, slot, c, p)) continue;
            const stepKey = c.template ? `${c.template.skill}#${c.template.step}` : null;
            const difficultyRank = c.template ? ["easy", "medium", "hard"].indexOf(c.template.difficulty) : -1;
            // (Not on a stories page: it may tell the stories of the steps the day reviews.)
            if (stepKey && slot.place !== "challenge" && slot.place !== "warm-up" && !topReview && !STEP_STORY_PLACES.has(slot.place ?? "warm-up") && dayCardSteps.has(stepKey) && difficultyRank >= dayCardSteps.get(stepKey)!) continue;
            // A Challenge's cards are three kinds of question while the steps have them: a story, a count, a missing
            // number ("Count on. Write the next four numbers." beside "Count back. ..." is one kind, the real U4 sample).
            // (Among the step's hardest templates only: a later attempt that widens to easier ones waits for the next pass.)
            if (strict && slot.place === "challenge" && w.page.type === "challenge" && (pageKinds.has(printedForm(p).split(":")[0]) || candidate >= 256)) continue;
            // A stories page prints stories on every pass while its steps have them: a story again with other numbers, never
            // a drill ("What is 2 more than 5?" on the real U4 sample's Number stories page).
            // (On every pass: a late fallback printed "Missing number: 10 000 − ? = 4913" on the real U16 r13 Word problems.)
            if (notAStory(input, slot, c, p, w.page.type)) continue;
            if (cardPlace(slot) && cardFrame(p) && cardFrameProblem(cardFrames.get(cardFrame(p)!) ?? [], cardUse(w, slot, p))) continue;
            // (A Challenge card is on the day's step, Codex at 24751f16, B3: a card of an earlier step asks less.)
            if (slot.place === "challenge" && w.page.type === "challenge" && c.template && slot.part.step && `${c.template.skill}#${c.template.step}` !== `${slot.part.step.skill}#${slot.part.step.step}`) continue;
            // A template is one question stem: twice a page (the U16 review: six "In N, which digit is in the thousands
            // place?" on one page; the real U4 sample: four "counts N in a circle" in a row).
            if (tk && slot.place !== "challenge" && slot.place !== "warm-up" && (pageTemplates.get(tk) ?? 0) >= 2) continue;
            // A stories page tells each story once while it has other templates (the real U16 sample: "Each box holds N
            // stamps" twice on Day 10's word problems).
            // (By its words: several steps share one story template, "Each {container} holds {a} {things}. ...".)
            const storyKey = c.template ? templateWords(input, c) : null;
            // (A story told again beats a drill: the second pass allows it, never a drill while stories are left.)
            if (storyKey && strict && slot.place && STEP_STORY_PLACES.has(slot.place) && slot.place !== "challenge" && pageStories.has(storyKey)) continue;
            // A stories page mixes kinds of story (join, take away, compare, ...) while its steps have others (the U4 review).
            const kind = slot.place === "word-problems" || slot.place === "solve-it-two-ways" && w.page.type === "word-problems" ? storyKind(p.text) : null;
            // (A kind once a page: strict, then while the page has fewer than 3 kinds; the book check fails a kind twice, and
            // the whole-book repair takes another, the real U16 r17's two take-aways from 10,000.)
            if (kind && pageStoryKinds.has(kind) && (strict || candidate < 768)) continue;
            // An extra practice page asks questions from this workbook again ("Answer questions from this workbook").
            const limit = slot.place === "warm-up" || c.source === "explain" ? Infinity : 1;
            // (U4 to U9, D-226: an extra practice page may ask a task of the book once more, 40 pages on.)
            const spaced = (used.get(key) ?? 0) === 1 && extraPracticeRepeats(input.plan.level, !!w.page.extraPractice, usedAt.get(key) ?? w.number, w.number);
            if ((used.get(key) ?? 0) >= limit && !spaced || pageOps.has(op) || pageTexts.has(p.text)) continue;
            // A sentence frame once a page and twice a day, the Challenge's too (the U16 review: three "saw the number N
            // on a sign" cards); a stem with no person in it twice a page.
            const sentence = slot.place === "warm-up" || c.source === "explain" ? null : sentenceFrameOf(p);
            if (sentence && (pageFrames.has(sentence) || (dayFrames.get(sentence) ?? 0) >= 2)) continue;
            // (Spot the error and two ways print Sam's work or two methods, not the stem as a question: they do not count.)
            const stem = slot.place === "warm-up" || c.source === "explain" || NUMBER_PLACES.has(slot.place ?? "") ? null : stemOf(p);
            if (stem && (pageStems.get(stem) ?? 0) >= 2) continue;
            if (strict && needForm && !fewChallenge && pageForms.has(printedForm(p))) continue;
                      best = { c, p, key, op, type, frame, sentence };
          }
          if (best) break;
          // No new form for a page that needs one: a template slot is planned away rather than print a third question
          // of a form the page has (another of its block stays), as a step with small ranges runs out (#489).
        }
        if (best) {
          if (slot.place && !STORY_CHECK_PLACES.has(slot.place) && !STEP_STORY_PLACES.has(slot.place) && isNumberStory(best.p.text)) pageStoryCount++;
          if (interesting && interestEligible(input.curriculum, best.c)) { interest.eligible++; if (printsInterest(input.plan, best.p.text)) interest.named++; }
          const truth = truthOf(best.c);
          if (truth) {
            truthCounts.set(truth, (truthCounts.get(truth) ?? 0) + 1);
          }
          used.set(best.key, (used.get(best.key) ?? 0) + 1); if (!usedAt.has(best.key)) usedAt.set(best.key, w.number); pageOps.add(best.op); pageTexts.add(best.p.text);
          if (cardPlace(slot) && cardFrame(best.p)) cardFrames.set(cardFrame(best.p)!, [...(cardFrames.get(cardFrame(best.p)!) ?? []), cardUse(w, slot, best.p)]);
          if (slot.place === "challenge") pageKinds.add(printedForm(best.p).split(":")[0]);
          if (best.c.template && slot.place && STEP_STORY_PLACES.has(slot.place)) pageStories.add(templateWords(input, best.c));
          if ((slot.place === "word-problems" || slot.place === "solve-it-two-ways" && w.page.type === "word-problems") && storyKind(best.p.text)) pageStoryKinds.add(storyKind(best.p.text)!);
          const bestStem = slot.place === "warm-up" || best.c.source === "explain" || NUMBER_PLACES.has(slot.place ?? "") ? null : stemOf(best.p);
          if (bestStem) pageStems.set(bestStem, (pageStems.get(bestStem) ?? 0) + 1); pageTypes.set(best.type, (pageTypes.get(best.type) ?? 0) + 1); partTypes.set(`${slot.layoutSlot}|${best.type}`, (partTypes.get(`${slot.layoutSlot}|${best.type}`) ?? 0) + 1);
          const tk = templateKey(best.c);
          if (tk && !NUMBER_PLACES.has(slot.place ?? "")) pageTemplates.set(tk, (pageTemplates.get(tk) ?? 0) + 1);
          if (tk && slot.place !== "challenge" && slot.place !== "warm-up") dayTemplates.set(tk, (dayTemplates.get(tk) ?? 0) + 1);
          if (best.c.template && slot.place === "challenge" && challengeReviewSlot(input, slot, input.plan.level, w.day)) {
            const k = `${best.c.template.skill}#${best.c.template.step}`, d = ["easy", "medium", "hard"].indexOf(best.c.template.difficulty);
            dayCardSteps.set(k, Math.min(dayCardSteps.get(k) ?? Infinity, d));
          }
          const kk = kindKey(best.c);
          if (tk && best.c.template?.reserved && slot.place !== "challenge") dayReserved.set(tk, (dayReserved.get(tk) ?? 0) + 1);
          if (kk && slot.place === "challenge") dayChallenge.set(kk, Math.min(dayChallenge.get(kk) ?? Infinity, sizeOf(best.c)));
          if (best.frame) frames.add(best.frame);
          if (slot.place !== "warm-up") pageForms.add(printedForm(best.p));
          if (best.sentence && !pageFrames.has(best.sentence)) { pageFrames.add(best.sentence); dayFrames.set(best.sentence, (dayFrames.get(best.sentence) ?? 0) + 1); }
        }
        slot.contract = best?.c ?? null;
        // Nothing approved fits: the step has no new question left for this slot. It stays planned, and fails as such
        // (#482 review at 3134252: a slot that cannot be filled is a failure, never a silent removal).
        if (best && slot.place === "challenge") slot.part = { ...slot.part, skills: [best.c.item.skill] };
      }
    }
  }
  const backCover = number + 1;
  return { work, backCover, total: input.itemPolicy === "approved-v1" && input.book ? number : Math.ceil(backCover / 4) * 4 };
}

/**
 * The fingerprint of the book this input plans (#312, R379-8-2): every day page's number, day, type, layout, panels,
 * and each slot with its place, room, skill, kind, numbers and planned wording. It changes when the curriculum, the
 * layouts or the templates' rooms give another book. It says nothing of the child's name: it is taken with no name
 * (the plan leaves the child's own name out of the people it names, so the real name would show in it).
 */
export function bookOutline(input: GenerateInput): string {
  const { work, total } = layOut(input.book ? { ...input, book: { child: "" } } : input);
  return digestOf({
    number: input.number, level: input.plan.level, total, laidOut: !!input.book, ...(input.itemPolicy === "approved-v1" ? { itemPipeline: { version: 5, examples: ITEM_EXAMPLES, compactExamples: COMPACT_STORY_FRAMES } } : {}),
    pages: work.map((w) => ({
      number: w.number, day: w.day, page: w.page.number, type: w.page.type, layout: w.layout, panels: w.panels,
      slots: w.slots.map((x) => ({
        id: x.id, part: x.part.kind, skills: x.part.skills, place: x.place, layoutSlot: x.layoutSlot, aim: x.aim ?? null,
        room: x.place ? roomOf(input, x.place, w.day) ?? null : null, planned: x.planned ?? null, ...(input.itemPolicy === "approved-v1" ? { contract: contractFor(input, w, x), existing: !!x.existing } : {}),
      })),
    })),
  });
}

/** Why a kept day page does not fit the page the plan has at its number (R379-8-2), or null. */
function keptPageProblem(input: GenerateInput, w: PageWork | undefined, p: GeneratedPage): string | null {
  if (!w) return `kept page ${p.number} is not a day page of the plan`;
  if (p.day !== (w.page.extraPractice ? null : w.day) || p.pageOfDay !== (w.page.extraPractice ? null : w.page.number) || p.type !== w.page.type) {
    return `kept page ${p.number} is day ${p.day}, page ${p.pageOfDay} (${p.type}); the plan has day ${w.day}, page ${w.page.number} (${w.page.type}) there`;
  }
  const ids = new Set(w.slots.map((x) => x.id));
  const stray = [...p.questions.map((q) => q.slot), ...(p.leftOut ?? []).map((x) => x.slot)].find((id) => !ids.has(id));
  if (stray) return `kept page ${p.number} has slot ${stray}, which the plan's page does not have`;
  if (!!input.book !== !!p.content) return `kept page ${p.number} ${p.content ? "is" : "is not"} laid out, and the plan's book ${input.book ? "is" : "is not"}`;
  // The page's ID prints the child's name and the workbook number: a name changed since the page was kept would mix two.
  const id = (p.content as { id?: string } | undefined)?.id;
  if (input.book && id !== undefined && !id.startsWith(pageId(input.book.child, input.number, ""))) return `kept page ${p.number} was made for another name or workbook number`;
  return null;
}

/** Page filling stops adding items once the day's estimate reaches this; the book check fails a day at 35 (Savar, 2026-11-04: the time is an estimate; fill the page, never reach 35). */
const DAY_MINUTES_FILL = 32.3;
/** The same, on a day with existing-writer slots, whose planned minutes are a guess (the writer's text comes later). */
const DAY_MINUTES_FILL_ESTIMATED = 31.5;
/** A day's review pages fill first, up to this (short questions; a margin under 30 for the writer's stories). */
const DAY_MINUTES_REVIEW = 32.8;
/** Above this estimate a day plans template practice items fewer before any writing. */
const DAY_MINUTES_MOST = 33.3;

/** Places whose items capacity may plan fewer of: practice and review, never a teaching panel, Friday 5 or a test. */
const DROP_PLACES: ReadonlySet<string> = new Set(["remember-these", "on-your-own", "finish-these", "practice-row", "unit-b-practice", "now-you", "word-problems", "challenge", "picture-stories", "show-what-you-know", "mixed-set", "math-in-the-world"]);

/** The page's last practice item that can go above its type's minimum, a template item first; never a teaching item. */
const droppable = (w: PageWork, level = 0) => {
  // The page's practice questions count (Cedric's table), not its warm-up, explanation, Spot the error or two ways.
  const storyTwoWays = twoWaysCountsAsStory(level, w.page.type);
  const counted = w.slots.reduce((n, s) => n + (s.place === "how-do-you-know" || s.place === "warm-up" || NUMBER_PLACES.has(s.place ?? "") && !(storyTwoWays && s.place === "solve-it-two-ways") ? 0 : 1), 0);
  if (counted <= pageMinimum(w.page.type, level, !!w.page.extraPractice)) return undefined;
  // (A block's last item too, when the page keeps its floor without it: a page of two big blocks, U26.)
  const weight = (s: Slot) => NUMBER_PLACES.has(s.place ?? "") ? 0 : 1;
  const floor = pageMinimum(w.page.type, level, !!w.page.extraPractice);
  const can = (s: Slot) => (s.contract?.template || s.existing || !s.contract) && DROP_PLACES.has(s.place ?? "") && s.place !== "challenge"
    && (w.slots.filter(x => x.layoutSlot === s.layoutSlot).length > 1 || counted - weight(s) >= floor);
  // A slot the planner found no task for goes first, while the page keeps its floor; then a template item.
  // Of the template items, one of the kind the page has most of, so the page keeps its forms.
  const kind = (s: Slot) => s.contract?.template ? `${s.contract.template.kind}:${s.contract.template.format}` : "";
  const most = (s: Slot) => w.slots.filter(x => x.place !== "warm-up" && kind(x) === kind(s)).length;
  const templated = w.slots.filter(s => can(s) && !!s.contract?.template);
  const pick = templated.reduce<Slot | undefined>((best, s) => !best || most(s) >= most(best) ? s : best, undefined);
  return w.slots.findLast(s => can(s) && !s.contract && !s.existing) ?? pick ?? w.slots.findLast(can);
};

const unwrittenPackages = new WeakMap<Slot, QuestionPackage | null>();

/** A day's estimated minutes from its planned items and the existing writer's declared formats. */
function plannedDayMinutes(input: GenerateInput, work: PageWork[], day: number): number {
  const pages = work.filter((p) => p.day === day && !p.page.extraPractice);
  // Include the existing writer's reading and answer format. A mixed-set story
  // takes more time than a bare fact, even when its words are not written yet.
  let others = 0;
  const packages = pages.flatMap((p) => p.slots.flatMap((s, i) => {
    if (!s.contract && s.existing && !unwrittenPackages.has(s)) unwrittenPackages.set(s, standIn(input, p, s, i).package);
    const pkg = s.contract ? contractPackage(input, p, s.contract) : unwrittenPackages.get(s);
    if (pkg) return [pkg];
    others++;
    return [];
  }));
  const panels = pages.reduce((n, p) => n + p.panels.length, 0);
  // A story the writer words reads longer than code's text (the U16 sample: Day 10 planned under 29.3, printed at 30.2).
  const worded = pages.reduce((n, p) => n + p.slots.filter((s) => s.contract?.source === "story").length, 0) * .15;
  const asked = packages.reduce((n, pkg) => n + questionMinutes({ package: pkg } as GeneratedQuestion), 0) + others * .3 + worded;
  return Math.max(asked + pages.length * .35, estimatedDayMinutes(packages, panels) + others * .3 + worded);
}

/**
 * A stand-in for an existing-writer slot when its page is measured before writing (#489): a question in the slot's
 * format whose text is as long as the slot's room, the most the writer may print there.
 */
function standIn(input: GenerateInput, w: PageWork, s: Slot, i: number): BuiltQuestion {
  const room = s.place ? roomOf(input, s.place, w.day)?.characters ?? 40 : 40;
  const format = s.place === "spot-the-error" ? "spot-the-error" : s.place === "mixed-set" ? "tick-and-number" : s.place === "solve-it-two-ways" ? "two-ways"
    : s.place === "how-do-you-know" ? "written-reason" : s.place && STORY_PLACES.has(s.place) ? "show-work" : "write-number";
  // As long as the slot's room allows (the writer's limit): a story when one fits, else the bare sum.
  const story = "Mia has 12 shells. She finds 34 more. How many shells does Mia have now?";
  const core = format === "written-reason" ? "How do you know?" : format !== "spot-the-error" && room >= story.length ? story : room >= 44 && format !== "spot-the-error" ? "Mia has 12. She gets 34 more. How many now?" : "12 + 34 = ?";
  const pad = "On a sunny day at the beach by the old pier, ";
  let text = core;
  while (core === story && text.length + pad.length <= room) text = pad + text;
  const op = { kind: "add", operands: [itemNumber(12), itemNumber(34)], expression: null, unit: null, denominator: null, values: [] };
  const raw = {
    slot: s.id, skill: s.part.skills[0], difficulty: 2, text, format, figure: null, numbers: [], places: null, direction: null, sequence: null, pattern: null, relation: null, figureShows: null, name: null, thing: null,
    operation: format === "written-reason" ? null : op, easier: format === "written-reason" ? null : { text: "1 + 2 = ?", operation: { ...op, operands: [itemNumber(1), itemNumber(2)] } },
    wrongAnswers: format === "written-reason" ? [] : [{ value: itemNumber(format === "spot-the-error" ? 47 : 45), cause: format === "spot-the-error" ? "counted-one-extra" : "careless", description: "A slip.", step: null }],
    shownWrong: format === "spot-the-error" ? 0 : null,
  };
  const b = buildQuestion(raw, { id: `budget:${w.number}:${s.id}`, workbookId: input.workbookId, page: w.number, question: i + 1, level: input.plan.level, skills: s.part.skills, preserveText: true });
  // Spot the error prints Sam's steps: the stand-in shows a mistake code can show, as a written one would.
  if (format === "spot-the-error" && b.package && samProblem(b.package, input.plan.level)) {
    const fixed = samFix(b.package, input.plan.level, 1, (p) => checkQuestionPackage(p).status === "checked" && !samProblem(p, input.plan.level));
    if (fixed) return { ...b, package: fixed, check: { status: "checked" } };
  }
  return b;
}

/** A contract's code-built package as the page plans it, for its task identity and printed form (cached). */
const contractPackages = new WeakMap<ItemPlan, QuestionPackage | null>();
function contractPackage(input: GenerateInput, w: PageWork, c: ItemPlan): QuestionPackage | null {
  if (!contractPackages.has(c)) contractPackages.set(c, buildPlannedItem(c, c.item, { id: "capacity", workbookId: input.workbookId, page: w.number, question: 1, level: input.plan.level, skills: [c.item.skill] }).package);
  return contractPackages.get(c)!;
}

/**
 * A page's worked examples ask no task the book's questions or other examples ask (#482 review at db3b1a0). The
 * example's task depends on the templates its page uses, so the capacity stage asks again after it changes them.
 */
function repickPanels(input: GenerateInput, work: PageWork[], w: PageWork): void {
  if (!w.panels.length) return;
  const taken = new Set([
    ...work.flatMap((p) => p.slots.flatMap((s) => { const pkg = s.contract ? contractPackage(input, p, s.contract) : null; return pkg && s.place !== "warm-up" ? [taskIdentity(pkg)] : []; })),
    ...work.filter((p) => p !== w).flatMap((p) => panelTasks(input, p)),
  ]);
  for (const panel of w.panels) {
    const task = (attempt: number) => { const c = contractFor(input, w, panelSlot(w, panel), attempt); const pkg = c ? contractPackage(input, w, c) : null; return pkg && workableExample(pkg) ? taskIdentity(pkg) : null; };
    const now = task(panel.attempt ?? 0);
    // (One it cannot work, or one the book asks, takes another.)
    if (now === null || taken.has(now)) for (let attempt = 0; attempt < 64; attempt++) {
      const t = task(attempt);
      if (t && !taken.has(t)) { panel.attempt = attempt; break; }
    }
    const kept = task(panel.attempt ?? 0);
    if (kept) taken.add(kept);
  }
}

/** How often a page's questions ask a stem, outside its warm-up, Spot the error and two ways (and one slot left out). */
function stemCount(input: GenerateInput, w: PageWork, stem: string, except?: Slot): number {
  return w.slots.filter((s) => s !== except && s.contract && s.place !== "warm-up" && !NUMBER_PLACES.has(s.place ?? "")).filter((s) => { const p = contractPackage(input, w, s.contract!); return !!p && stemOf(p) === stem; }).length;
}

/** How tall a planned question prints, in characters of text: a figure counts as 200. */
const plannedTallness = (s: { contract?: ItemPlan | null }) => (s.contract?.item.text.length ?? 0)
  + (s.contract?.item.figure || s.contract?.type === "count" ? 200 : 0)
  // (Never, sometimes and always print on a row of their own under the question: about 60 characters of height.)
  + (s.contract?.type === "likelihood" || /\bnever, sometimes or always\b/i.test(s.contract?.item.text ?? "") ? 60 : 0)
  // (A count with boxes prints a row of them under its words: "Count on. Write the next four numbers." is tall.)
  + (/\bnext (?:two|three|four|five) numbers\b|^Count (?:on|back)\b/i.test(s.contract?.item.text ?? "") ? 80 : 0);

/** A block's questions on its own step first, its review of earlier steps after them under "Remember these". */
function ownStepFirst(w: PageWork): void {
  const own = (s: Slot) => !s.part.step || !s.contract?.template || s.contract.template.skill === s.part.step.skill && s.contract.template.step === s.part.step.step;
  const order = new Map(w.slots.map((s, k) => [s, k]));
  const contracts = [...w.slots].sort((a, b) => a.layoutSlot - b.layoutSlot || Number(!own(a)) - Number(!own(b)) || order.get(a)! - order.get(b)!);
  // (Slot ids stay with their places: only the questions move, so a block's numbers read in order.)
  const byBlock = new Map<number, Slot[]>();
  for (const s of w.slots) byBlock.set(s.layoutSlot, [...(byBlock.get(s.layoutSlot) ?? []), s]);
  for (const [block, slots] of byBlock) {
    if (!["on-your-own", "practice-row", "finish-these"].includes(slots[0]?.place ?? "") || slots.some((s) => s.existing || !s.contract)) continue;
    const sorted = contracts.filter((s) => s.layoutSlot === block).map((s) => s.contract!);
    slots.forEach((s, k) => { s.contract = { ...sorted[k], item: { ...sorted[k].item, slot: s.id } }; });
  }
}

/** A measured capacity is saved before any writer call or run fingerprint. */
async function fitWorkBudget(input: GenerateInput, fitCheck: FitCheck, work: PageWork[]): Promise<string | null> {
  if (input.itemPolicy === "approved-v1" && input.book) {
    // Measure the code-picked questions before a provider sees a slot. The same
    // retained slot IDs feed generation, checkpoints, content and coverage checks.
    // A day's review pages (short questions, many to a page) fill first: a day at its time limit leaves its larger
    // practice items, not a half-empty review page.
    const review = (w: PageWork) => w.page.type === "remember-these" || w.page.type === "remember-these-mixed-set";
    const firstOfDay = new Map<number, number>();
    work.forEach((w, i) => { if (!firstOfDay.has(w.day)) firstOfDay.set(w.day, i); });
    const order = work.map((w, i) => ({ w, i })).sort((a, b) => firstOfDay.get(a.w.day)! - firstOfDay.get(b.w.day)! || Number(review(b.w)) - Number(review(a.w)) || a.i - b.i).map(x => x.w);
    for (const w of order) {
      if (w.page.capacityChecked) continue;
      // A day over its time budget plans one template practice item fewer on this page, and again (#489).
      // (Never Show what you know: the book's test keeps one of each step; the day's practice pages give the time.)
      for (let trimmed = 0; trimmed < 6 && w.layout && !w.page.extraPractice && w.page.type !== "show-what-you-know" && plannedDayMinutes(input, work, w.day) > DAY_MINUTES_MOST; trimmed++) {
        // (A warm-up page's facts too, down to 8, when the day's other pages keep their adopted counts: the U16 sample.)
        const drop = droppable(w, input.plan.level) ?? (w.page.type === "warm-up" && w.slots.filter(s => s.place === "warm-up").length > 8 ? w.slots.findLast(s => s.place === "warm-up") : undefined);
        if (!drop) break;
        w.slots = w.slots.filter(s => s !== drop);
        w.layout.slots[drop.layoutSlot].items--;
        w.page.timeLimited = true;
        // Reported (#482 review at db3b1a0: the time pass removed slots with no record), above the adopted count.
        const part = (Number(drop.id.split(".")[0]) || 1) - 1;
        const had = w.layout.omissions.find(o => o.part === part && o.time);
        if (had) had.requested++;
        else w.layout.omissions.push({ part, kind: drop.part.kind, requested: w.slots.filter(x => x.part === drop.part).length + 1, placed: w.slots.filter(x => x.part === drop.part).length, reason: "left out to keep the day under 30 minutes", time: true });
      }
      // A page of the existing writer alone keeps its layout; one that also has template items is measured, with a
      // stand-in of the room's length for each existing slot (#489: template items are longer than drills).
      if (w.slots.some(s=>s.existing) && !w.slots.some(s=>s.contract?.template)) {
        // The trimmed layout is the page's capacity too, so a resume plans the same slots.
        const parts = w.page.parts.map((p, i) => ({ ...p, items: (w.layout?.slots ?? []).filter(s => s.part === i && s.slot !== "how-do-you-know").reduce((n,s)=>n+s.items,0) + (p.kind === "practice" ? p.faded?.watch ?? 0 : 0) }));
        // (Its questions are the writer's: it is filled as planned, its rows grow to fill the page.)
        w.page={...w.page,parts,...(w.layout ? { capacity: w.layout.slots } : {}),capacityChecked:true,fillingComplete:true,atMaximum:true,itemContracts:Object.fromEntries(w.slots.map(s=>[s.id,s.contract??null])),existingSlots:w.slots.filter(s=>s.existing).map(s=>s.id)};
        continue;
      }
      const minimum = w.slots.length;
      // U4 has few distinct small-number tasks. Keep practice and review at their floors so early pages leave alternatives
      // available when a later page must replace a long question. Extra practice keeps its separate repeat rules.
      const max = w.page.extraPractice ? (input.plan.level >= 19 ? 12 : 14)
        : input.plan.level === 4 && ["practice", "practice-2"].includes(w.page.type) ? 8 + w.slots.filter(s => ["spot-the-error", "solve-it-two-ways", "warm-up", "how-do-you-know"].includes(s.place ?? "")).length
        : w.page.type === "remember-these" ? (input.plan.level === 4 ? 8 : input.plan.level >= 19 ? 10 : 12) : ["practice","practice-2"].includes(w.page.type) ? (input.plan.level >= 19 ? 8 : 10)
        : w.page.type === "new-idea" ? minimum + 2 : w.page.type === "unit-b" ? minimum + 2
        : w.page.type === "word-problems" || w.page.type === "challenge" ? minimum + 1
        // (A review page with a Mixed set fills its review: its maximum is not its planned count, #482 review at 3134252.)
        : w.page.type === "remember-these-mixed-set" || w.page.type === "friday-5" ? minimum + 4 : minimum;
      let ceiling = max;
      let added: Slot | null = null;
      const rejectedRefills = new Set<string>();
      let pendingRefill: { key: string; rollback(): void } | null = null;
      for (let round = 0; round < 64; round++) {
        // A worked example's task turns with the page's templates: once they change, it takes a free task again.
        repickPanels(input, work, w);
        // (Measured in the order it prints: review last, under its label.)
        ownStepFirst(w);
        const questions = w.slots.map((s, i) => {
          const c = s.contract;
          const b = c ? buildPlannedItem(c, c.item, { id: `budget:${w.number}:${s.id}`, workbookId: input.workbookId, page: w.number, question: i + 1, level: input.plan.level, skills: [c.item.skill] }) : s.existing ? standIn(input, w, s, i) : unapprovedBuild();
          // Measure the name that writeSlots prints. A shorter replacement can remove a wrapped line.
          if (b.package && s.place && s.place !== "spot-the-error") b.package = withoutSam(b.package, s.planned?.name ?? null);
          return generated(w, i, b, 1);
        });
        const examples = w.panels.map(p => {
          const c = contractFor(input, w, panelSlot(w, p), p.attempt ?? 0);
          const pkg = c ? buildPlannedItem(c, c.item, { id: `budget:${w.number}:${p.id}`, workbookId: input.workbookId, page: w.number, question: 1, level: input.plan.level, skills: [p.skill] }).package : null;
          return pkg ? withoutSam(pkg, null) : null;
        });
        // (Room only: a layout problem is the template's, reported when the page is written.)
        const fit = roomFit(await fitCheck.fits(fitPage(w, "token-000000000001", questions, contentOf(input, w, questions, examples)), {
          id: input.workbookId, childId: input.childId, number: input.number, levels: [input.plan.level], profileBuild: input.profileBuild,
        }));
        // (A page that fits below its planned count fills on too: 5 large questions met the fullness check, the full U4
        // book's Day 9, where the floor is 8.)
        // (Refills stop well before the round limit, so the page's last state is always one that was checked.)
        // (Practice pages only: their floor is 8, Savar's 8 to 10; a new idea's is 2.)
        const refillPage = ["practice", "practice-2", "word-problems"].includes(w.page.type)
          || input.plan.level === 4 && w.page.type === "remember-these";
        // (Below the page's floor too, whatever the plan gave it: 7 practice questions fit a U4 page and met its
        // fullness, while its floor is 8, Savar's 8 to 10.)
        const counted = w.slots.filter((s) => !["spot-the-error", "solve-it-two-ways", "warm-up", "how-do-you-know"].includes(s.place ?? "")).length;
        const belowFloor = !w.page.extraPractice && counted < pageMinimum(w.page.type, input.plan.level, false);
        const wanted = Math.max(minimum, w.slots.length + (belowFloor ? 1 : 0));
        const restoringFloor = input.plan.level === 4 && belowFloor;
        const canRefill = restoringFloor ? round < 63 : (w.page.refills ?? 0) < 8 && round < 48;
        const short = refillPage && fit.ok && w.slots.length < wanted && canRefill;
        // (Its floor does not fit beside the full example panel, two refills on: the panel becomes a one-line reminder,
        // U4 to U9, Savar 2026-11-04 "make the practice-page panel a one-line reminder rather than a full panel".)
        if (belowFloor && (fit.ok || (w.page.refills ?? 0) >= 2) && !w.page.compactPanel && input.plan.level <= 9 && ["practice", "practice-2"].includes(w.page.type) && w.panels.some((x) => x.place === "watch-one")) {
          w.page.compactPanel = true; w.page.refills = 0; continue;
        }
        if (fit.ok && !short) break;
        if (short || !fit.ok && fit.problems.every(p => p.kind === "fullness")) {
          added = null;
          pendingRefill = null;
          let refillKey = "";
          const open = (s: Slot) => !s.existing && ["remember-these","on-your-own","finish-these","practice-row","unit-b-practice","now-you","word-problems","challenge"].includes(s.place ?? "") && !!s.place && w.slots.filter(x=>x.layoutSlot===s.layoutSlot).length < slotMax(s.place,{level:input.plan.level,pages:input.plan.pagesADay.max,consistentLayout:true,extraPractice:!!w.page.extraPractice});
          // (A page refilling below its planned count adds to its practice, which may take a short question of an earlier
          // step, not to a review of one tall kind: the full U4 book's Day 9.)
          const refilling = refillPage && w.slots.length >= ceiling && w.slots.length < wanted;
          const target = (refilling ? w.slots.findLast(s => open(s) && ["on-your-own", "finish-these", "practice-row"].includes(s.place ?? "")) : undefined) ?? w.slots.findLast(open);
          // An added item must keep the day's estimate under 30 minutes, with a margin (#489: templates read longer).
          // (A refill back to the planned count may use the day's last minutes, under 30: the full U4 book's Day 1 page 6.)
          // (A review page's extra questions leave the day's later practice pages the minutes their floor needs, about
          // 0.4 each: the full U4 book's Day 1 review took 12 and its last practice page lost its 8th.)
          const reserve = !refilling && review(w) ? 0.4 * work.filter(p => p !== w && p.day === w.day && !p.page.capacityChecked && ["practice", "practice-2"].includes(p.page.type)).length : 0;
          const timeOk = w.page.extraPractice || plannedDayMinutes(input, work, w.day) + reserve < (refilling ? DAY_MINUTES_MOST - 0.4 : work.some(p => p.day === w.day && p.slots.some(s => s.existing)) ? DAY_MINUTES_FILL_ESTIMATED : review(w) ? DAY_MINUTES_REVIEW : DAY_MINUTES_FILL);
          // The day at its time limit is the page's maximum: its gaps may spread (the report shows its occupied height).
          // (A page below its planned count takes questions again once it has room: a drop lowered its ceiling while a
          // tall question was still on it, the full U4 book's Day 9 at 24 minutes with 4 of 8 questions.)
          const refill = refillPage && w.slots.length < wanted && canRefill;
          if (target && (w.slots.length < ceiling || refill) && w.layout && !timeOk) w.page.timeLimited = true;
          if (target && (w.slots.length < ceiling || refill) && w.layout && timeOk) {
            if (w.slots.length >= ceiling) w.page.refills = (w.page.refills ?? 0) + 1;
            const layoutSlot=target.layoutSlot;
            const ordinal=w.slots.filter(s=>s.layoutSlot===layoutSlot).length+1;
            const slot={...target,id:`${Number(target.id.split(".")[0])}.${target.place === "challenge" ? ordinal : 99+ordinal}`,contract:null,
              refillOwnStep: restoringFloor };
            // Every planned task of the book by its mathematical data, and the sentence frames of this page and its day.
            const planned=(p:PageWork)=>p.slots.flatMap(s=>{ const pkg=s.contract ? contractPackage(input,p,s.contract) : null; return pkg && s.place!=="warm-up" ? [pkg] : []; });
            const taken=new Set([...work.flatMap(p=>planned(p).map(taskIdentity)), ...work.flatMap(p=>panelTasks(input,p))]);
            const frames=new Set(work.flatMap(p=>p.slots.flatMap(s=>s.contract && (s.contract.source==="story" || s.contract.type==="likelihood") ? [storyFrame(s.contract.item.text)] : [])));
            const onPage=new Set(planned(w).flatMap(p=>sentenceFrameOf(p) ?? []));
            const today=work.filter(p=>p.day===w.day).flatMap(p=>planned(p).flatMap(q=>sentenceFrameOf(q) ?? []));
            for(let attempt=0;attempt<512;attempt++) {
              const c=contractFor(input,w,slot,attempt);
              if (!c || !c.template && (c.source==="story" || c.type==="likelihood") && frames.has(storyFrame(c.item.text))) continue;
              const built=buildPlannedItem(c,c.item,{id:"capacity",workbookId:input.workbookId,page:w.number,question:w.slots.length+1,level:input.plan.level,skills:[c.item.skill]});
              if (!built.package || built.check.status === "failed" || dayProblem(input, built.package, w.day,slot.place ?? "")) continue;
              const trialKey = JSON.stringify([layoutSlot, taskIdentity(built.package), built.package.text, built.package.item]);
              if (rejectedRefills.has(trialKey)) continue;
              if (taken.has(taskIdentity(built.package))) continue;
              if (slot.place !== "challenge" && slot.place !== "show-what-you-know" && reachesChallenge(work, w.day, c)) continue;
              // A template twice a page at most (as the planner).
              if (c.template && w.page.type !== "challenge" && slot.place !== "warm-up" && w.slots.filter(s => s.contract?.template && s.contract.template.skill === c.template!.skill && s.contract.template.step === c.template!.step && s.contract.template.index === c.template!.index).length >= 2) continue;
              const sentence=c.source==="explain" ? null : sentenceFrameOf(built.package);
              if (sentence && (onPage.has(sentence) || today.filter(x=>x===sentence).length>=2)) continue;
              const stem=c.source==="explain" ? null : stemOf(built.package);
              if (stem && !NUMBER_PLACES.has(slot.place ?? "") && stemCount(input,w,stem)>=2) continue;
              if (tooEasyStory(input,slot,c,built.package) || notAStory(input,slot,c,built.package,w.page.type) || cardFrameTaken(input,work,slot,built.package)) continue;
              if (!["word-problems","challenge"].includes(w.page.type)) {
                // (Counted as the book check counts them: a template item by its printed form.)
                const type=typeKey(w.page,{itemPlan:c,package:built.package});
                const same=w.slots.filter(s=>s.contract && s.place!=="warm-up").filter(s=>{
                  const p=buildPlannedItem(s.contract!,s.contract!.item,{id:"capacity",workbookId:input.workbookId,page:w.number,question:1,level:input.plan.level,skills:[s.contract!.item.skill]}).package;
                  return p && typeKey(w.page,{itemPlan:s.contract!,package:p})===type;
                }).length;
                if (same>=Math.ceil((w.slots.length+1)/2)) continue;
              }
              // A floor candidate takes the physical fit check, including a sequence with a short instruction.
              if (refilling && !restoringFloor && plannedTallness({ contract: c }) > 70) continue;
              added={...slot,contract:c}; refillKey=trialKey; break;
            }
            if (added) {
              // ownStepFirst can move contracts between slot objects. Roll back the whole trial, not the last slot.
              const beforeSlots = w.slots.map(s => ({ ...s }));
              const beforeLayout = structuredClone(w.layout);
              const beforeGap = w.page.extraGap, beforeMaximum = w.page.atMaximum;
              pendingRefill = { key: refillKey, rollback: () => {
                w.slots = beforeSlots; w.layout = beforeLayout;
                w.page.extraGap = beforeGap; w.page.atMaximum = beforeMaximum;
              } };
              w.slots.splice(w.slots.findLastIndex(s=>s.layoutSlot===layoutSlot)+1,0,added); w.layout.slots[layoutSlot].items++;
              // (A new question is measured with the page's normal gaps: grown gaps would push it off the page.)
              w.page.extraGap = 0; w.page.atMaximum = false;
              // (A question taken again where one was dropped for room: the part's omission is made good.)
              const part = (Number(added.id.split(".")[0]) || 1) - 1;
              const lost = w.layout.omissions.find(o => o.part === part && o.requested > o.placed && !o.time) ?? w.layout.omissions.find(o => o.requested > o.placed && !o.time);
              if (lost) { lost.placed++; if (lost.placed >= lost.requested) w.layout.omissions = w.layout.omissions.filter(o => o !== lost); }
              continue;
            }
            ceiling=w.slots.length;
          }
          // (Nothing more fits beside the full example panel, below the floor: the panel becomes a one-line reminder.)
          if (belowFloor && !w.page.compactPanel && input.plan.level <= 9 && ["practice", "practice-2"].includes(w.page.type) && w.panels.some((x) => x.place === "watch-one")) {
            w.page.compactPanel = true; w.page.refills = 0; ceiling = Math.max(ceiling, w.slots.length + 2); continue;
          }
          if (short) break;
          if (!w.page.fillingComplete) { w.page.fillingComplete=true; continue; }
          if ((w.page.extraGap ?? 0)<(w.page.gapCap ?? 48) && !w.page.atMaximum) { w.page.extraGap=(w.page.extraGap ?? 0)+4; continue; }
          // At its maximum with its gaps at their widest and still half empty (no question the book's rules allow is
          // left, or the day is at its time): its rows grow instead, with the gaps back to normal (Codex at 47c5fd78).
          if (!w.page.atMaximum) { w.page.atMaximum = true; w.page.extraGap = 0; continue; }
          break;
        }
        if (fit.ok) break;
        // Overflowing only because its gaps grew: the gaps come back, never a question (the full U4 book's Practice 2).
        if (!added && (w.page.extraGap ?? 0) > 0 && !fit.problems.some(p => p.kind === "fullness")) {
          w.page.extraGap = Math.max(0, (w.page.extraGap ?? 0) - 8);
          w.page.gapCap = w.page.extraGap;
          continue;
        }
        if (added && w.layout) {
          if (!pendingRefill) throw new Error("a capacity refill has no rollback state");
          rejectedRefills.add(pendingRefill.key);
          pendingRefill.rollback();
          ceiling=w.slots.length; added=null; pendingRefill=null; continue;
        }
        // A worked example with its method has no room for its Watch out line too: the method stays, the line goes.
        if (!w.page.noWatchOut && fit.problems.some(p => /panel must fit/.test(p.reason))) { w.page.noWatchOut = true; continue; }
        // A question wider than its own space takes the next task of its slot (a long count, a wide figure), before the
        // page loses a question.
        const wide = fit.problems.map(p => /\bquestion (\d+)(?: does not fit its space|'s text takes \d+ lines)/.exec(p.reason)?.[1]).find(Boolean);
        const wideSlot = wide ? w.slots[Number(wide) - 1] : undefined;
        if (wideSlot && !wideSlot.existing && (wideSlot.refits ?? 0) < 8) {
          wideSlot.refits = (wideSlot.refits ?? 0) + 1;
          const planned=(p:PageWork)=>p.slots.flatMap(s=>{ const pkg=s.contract && s!==wideSlot ? contractPackage(input,p,s.contract) : null; return pkg && s.place!=="warm-up" ? [pkg] : []; });
          const taken=new Set([...work.flatMap(p=>planned(p).map(taskIdentity)), ...work.flatMap(p=>panelTasks(input,p))]);
          const was = wideSlot.contract ? contractPackage(input, w, wideSlot.contract) : null;
          let other: ItemPlan | null = null;
          for (let attempt = 1 + 16 * (wideSlot.refits - 1); attempt < 16 * wideSlot.refits + 1 && !other; attempt++) {
            const c = contractFor(input, w, { ...wideSlot, contract: undefined }, attempt);
            if (!c) continue;
            const b = buildPlannedItem(c, c.item, { id: "capacity", workbookId: input.workbookId, page: w.number, question: 1, level: input.plan.level, skills: [c.item.skill] });
            if (!b.package || b.check.status === "failed" || dayProblem(input, b.package, w.day, wideSlot.place ?? "") || taken.has(taskIdentity(b.package))) continue;
            if (was && taskIdentity(b.package) === taskIdentity(was)) continue;
            // (Too many lines on its card: a shorter text.)
            if (was && fit.problems.some(p => p.reason.includes(`question ${wide}'s text takes`)) && b.package.text.length >= was.text.length) continue;
            const stem = stemOf(b.package);
            if (stem && !NUMBER_PLACES.has(wideSlot.place ?? "") && stemCount(input, w, stem, wideSlot)>=2) continue;
            if (tooEasyStory(input, wideSlot, c, b.package)) continue;
            if (templateTwice(w, wideSlot, c)) continue;
            if (notAStory(input, wideSlot, c, b.package, w.page.type) || losesStoryKind(input, w, wideSlot, b.package) || cardFrameTaken(input, work, wideSlot, b.package)) continue;
            if (wideSlot.place !== "challenge" && wideSlot.place !== "show-what-you-know" && reachesChallenge(work, w.day, c)) continue;
            other = c;
          }
          if (other) { wideSlot.contract = other; continue; }
        }
        // Too tall: first the page's longest template question takes a shorter template or numbers of its step.
        // (The next longest when it has no shorter one: a page drops a question only when none of them can shorten.)
        let shortened = false;
        // (Any question code planned, a hand-built one too: the U4 review's long "Which is right? ... A) likely" choice.)
        for (const longest of [...w.slots].filter(s=>s.contract && !s.existing && s.place !== "how-do-you-know" && (s.place !== "challenge" || !!s.contract.template)).sort((a,b)=>plannedTallness(b)-plannedTallness(a)).slice(0, 8)) {
          // (A question with a printed figure, a ten-frame to colour, is taller than any line of text: it counts as 200
          // characters, and any question with no figure is shorter, the U4 sample's Day 5.)
          const was = plannedTallness(longest);
          let shorter: ItemPlan | null = null;
          // Never a task the book already plans, nor a sentence frame this page or day has used up.
          const planned=(p:PageWork)=>p.slots.flatMap(s=>{ const pkg=s.contract && s!==longest ? contractPackage(input,p,s.contract) : null; return pkg && s.place!=="warm-up" ? [pkg] : []; });
          const taken=new Set([...work.flatMap(p=>planned(p).map(taskIdentity)), ...work.flatMap(p=>panelTasks(input,p))]);
          const onPage=new Set(planned(w).flatMap(p=>sentenceFrameOf(p) ?? []));
          const today=work.filter(p=>p.day===w.day).flatMap(p=>planned(p).flatMap(q=>sentenceFrameOf(q) ?? []));
          // It keeps the page's forms: as many as it had (up to 3), and none over half the page (#482 review at 3134252).
          const formOf=(s:Slot)=>{ const pkg=s.contract ? contractPackage(input,w,s.contract) : null; return pkg && s.place!=="warm-up" ? printedForm(pkg) : null; };
          const others=w.slots.filter(s=>s!==longest).map(formOf).filter((f):f is string=>!!f);
          const before=new Set([...others, formOf(longest) ?? ""].filter(Boolean)).size;
          // (Its own step first, then an earlier step the book taught, when the page's own stems are used up.)
          for (const attempt of [...Array.from({ length: 95 }, (_, k) => k + 1), ...Array.from({ length: 48 }, (_, k) => LATE_ATTEMPT + k)]) {
            if (shorter) break;
            const c = contractFor(input, w, { ...longest, contract: undefined }, attempt);
            // (A template question takes another template: a hand-built fallback is easier, "Write the digits in 700000".)
            if (!c || plannedTallness({ contract: c }) >= was - 4 || longest.contract!.template && !c.template) continue;
            const b = buildPlannedItem(c, c.item, { id: "capacity", workbookId: input.workbookId, page: w.number, question: 1, level: input.plan.level, skills: [c.item.skill] });
            if (!b.package || b.check.status === "failed" || dayProblem(input, b.package, w.day, longest.place ?? "") || taken.has(taskIdentity(b.package))) continue;
            const form=printedForm(b.package);
            if (longest.place !== "challenge" && longest.place !== "show-what-you-know" && reachesChallenge(work, w.day, c)) continue;
            if (longest.place!=="challenge" && (new Set([...others, form]).size < Math.min(3, before) || others.length>=2 && others.filter(f=>f===form).length+1>Math.ceil((others.length+1)/2))) continue;
            const sentence = sentenceFrameOf(b.package);
            if (sentence && (onPage.has(sentence) || today.filter(x=>x===sentence).length>=2)) continue;
            const stem = stemOf(b.package);
            if (stem && !NUMBER_PLACES.has(longest.place ?? "") && stemCount(input, w, stem, longest)>=2) continue;
            if (tooEasyStory(input, longest, c, b.package)) continue;
            if (templateTwice(w, longest, c)) continue;
            // (A stories page's question stays a story: a drill is shorter, "What is 2 more than 8?".)
            if (notAStory(input, longest, c, b.package, w.page.type) || losesStoryKind(input, w, longest, b.package) || cardFrameTaken(input, work, longest, b.package)) continue;
            // Shorter to read is not always quicker to do: the day's estimate must not grow (U16's Day 10).
            const had = longest.contract!;
            const minutesBefore = plannedDayMinutes(input, work, w.day);
            longest.contract = c;
            const minutesAfter = plannedDayMinutes(input, work, w.day);
            longest.contract = had;
            if (minutesAfter > minutesBefore + 1e-9 && minutesAfter >= DAY_MINUTES_MOST) continue;
            shorter = c;
          }
          if (shorter) { longest.contract = shorter; shortened = true; break; }
        }
        if (shortened) continue;
        // Then a worked example takes a shorter free task (the real U4 sample: a three-line example cost two questions).
        const taskOf = (panel: Panel, attempt: number) => { const c = contractFor(input, w, panelSlot(w, panel), attempt); const pkg = c ? contractPackage(input, w, c) : null; return c && pkg && workableExample(pkg) ? { text: c.item.text, task: taskIdentity(pkg) } : null; };
        const usedTasks = new Set([...work.flatMap((p) => p.slots.flatMap((s) => { const pkg = s.contract ? contractPackage(input, p, s.contract) : null; return pkg && s.place !== "warm-up" ? [taskIdentity(pkg)] : []; })), ...work.filter((p) => p !== w).flatMap((p) => panelTasks(input, p))]);
        let shorterPanel = false;
        for (const panel of w.panels) {
          const now = taskOf(panel, panel.attempt ?? 0);
          if (!now) continue;
          let best: { attempt: number; length: number } | null = null;
          for (let attempt = 0; attempt < 64; attempt++) {
            const t = taskOf(panel, attempt);
            if (t && !usedTasks.has(t.task) && t.text.length <= now.text.length - 10 && (!best || t.text.length < best.length)) best = { attempt, length: t.text.length };
          }
          if (best) { panel.attempt = best.attempt; shorterPanel = true; break; }
        }
        if (shorterPanel) continue;
        // Then one practice item fewer, while the page keeps its type's minimum (Cedric's table), before any writing.
        const drop = w.layout && droppable(w, input.plan.level);
        // A young review may keep four of six cards. Remove the card that cannot print before a shorter card.
        const fewer = drop && input.plan.level === 4 && w.page.type === "show-what-you-know" && wideSlot?.contract?.template
          ? wideSlot : drop;
        if (fewer && w.layout) {
          w.slots=w.slots.filter(s=>s!==fewer);
          w.layout.slots[fewer.layoutSlot].items--;
          ceiling=Math.min(ceiling,w.slots.length); continue;
        }
        // Still too tall: before a question goes, the tallest practice question takes a shorter one of an earlier step
        // the book taught (Savar, 2026-11-03, the full U4 book's likelihood days: mix in review rather than lose work).
        let swapped = false;
        // (A hand-built likelihood card too: "Will a sock lay an egg?" with its three words prints taller than "8 is 5 and ?".)
        // (U4 to U9: from U10 a practice page keeps its own step, so a review question never replaces one there.)
        if (input.plan.level <= 9) for (const tall of [...w.slots].filter(s => s.contract && !s.existing && (s.swaps ?? 0) < 3 && ["on-your-own", "finish-these", "practice-row", "now-you", "unit-b-practice", "remember-these"].includes(s.place ?? "")).sort((a, b) => plannedTallness(b) - plannedTallness(a)).slice(0, 4)) {
          const was = plannedTallness(tall);
          const planned = (p: PageWork) => p.slots.flatMap(s => { const pkg = s.contract && s !== tall ? contractPackage(input, p, s.contract) : null; return pkg && s.place !== "warm-up" ? [pkg] : []; });
          const taken = new Set([...work.flatMap(p => planned(p).map(taskIdentity)), ...work.flatMap(p => panelTasks(input, p))]);
          const onPage = new Set(planned(w).flatMap(p => sentenceFrameOf(p) ?? []));
          const today = work.filter(p => p.day === w.day).flatMap(p => planned(p).flatMap(q => sentenceFrameOf(q) ?? []));
          // (A review card whose part reviews the day's new idea only takes the page's practice part, its earlier steps.)
          const practicePart = w.slots.find((s) => s.part !== tall.part && s.part.step && ["on-your-own", "finish-these", "practice-row"].includes(s.place ?? ""))?.part;
          const parts = tall.place === "remember-these" && practicePart ? [tall.part, practicePart] : [tall.part];
          for (let k = 0; k < parts.length * 192 && !swapped; k++) {
            const part = parts[Math.floor(k / 192)], attempt = LATE_ATTEMPT + (k % 192);
            const c = contractFor(input, w, { ...tall, part, contract: undefined }, attempt);
            if (!c?.template || plannedTallness({ contract: c }) > was - 20) continue;
            const b = buildPlannedItem(c, c.item, { id: "capacity", workbookId: input.workbookId, page: w.number, question: 1, level: input.plan.level, skills: [c.item.skill] });
            if (!b.package || b.check.status === "failed" || dayProblem(input, b.package, w.day, tall.place ?? "") || taken.has(taskIdentity(b.package))) continue;
            if (reachesChallenge(work, w.day, c) || templateTwice(w, tall, c) || tooEasyStory(input, tall, c, b.package) || notAStory(input, tall, c, b.package, w.page.type)) continue;
            const sentence = sentenceFrameOf(b.package);
            if (sentence && (onPage.has(sentence) || today.filter(x => x === sentence).length >= 2)) continue;
            const stem = stemOf(b.package);
            if (stem && stemCount(input, w, stem, tall) >= 2) continue;
            // (Half a page of one kind at most, as the book check counts kinds.)
            const kind = typeKey(w.page, { itemPlan: c, package: b.package });
            const others = w.slots.filter((s) => s !== tall && s.contract && s.place !== "warm-up").map((s) => { const q = contractPackage(input, w, s.contract!); return q ? typeKey(w.page, { itemPlan: s.contract!, package: q }) : ""; });
            if (others.filter((k) => k === kind).length + 1 > Math.ceil((others.length + 1) / 2)) continue;
            tall.contract = c; tall.part = part; tall.swaps = (tall.swaps ?? 0) + 1; swapped = true;
          }
          if (swapped) break;
        }
        if (swapped) continue;
        // Still too tall: an item goes below the minimum, and the page reports it (an omission fails the book check).
        const forced = w.layout && w.slots.length > 1 ? w.slots.findLast(s => s.place === "try-first") ?? w.slots.findLast(s => !s.contract && !s.existing && DROP_PLACES.has(s.place ?? ""))
          ?? w.slots.findLast(s => s.contract?.template && DROP_PLACES.has(s.place ?? "") && s.place !== "challenge") ?? w.slots.findLast(s => s.contract?.template && DROP_PLACES.has(s.place ?? "")) : undefined;
        if (forced && w.layout) {
          w.slots = w.slots.filter(s => s !== forced);
          w.layout.slots[forced.layoutSlot].items--;
          const part = (Number(forced.id.split(".")[0]) || 1) - 1;
          const had = w.layout.omissions.find(o => o.part === part);
          if (had) { had.requested++; had.reason = "a planned question had no room on the page"; }
          else w.layout.omissions.push({ part, kind: forced.part.kind, requested: w.slots.filter(x => x.part === forced.part).length + 1, placed: w.slots.filter(x => x.part === forced.part).length, reason: "a planned question had no room on the page" });
          ceiling = Math.min(ceiling, w.slots.length); continue;
        }
        return `Page ${w.number}: the required questions exceed the template capacity: day ${w.day} ${w.page.type} (${w.slots.map(s => s.place).join(", ")}): ${fit.problems.map(p => p.reason).join(" ")}`;
      }
      if (input.plan.level === 4 && !w.page.extraPractice && ["practice", "practice-2", "remember-these", "show-what-you-know"].includes(w.page.type)) {
        const count = w.slots.filter(s => (s.contract || s.existing) && !["spot-the-error", "solve-it-two-ways", "warm-up", "how-do-you-know"].includes(s.place ?? "")).length;
        const floor = pageMinimum(w.page.type, input.plan.level, false);
        if (count < floor) return `Page ${w.number}: capacity could not restore ${floor} distinct valid practice questions; ${count} remain`;
      }
      const oldSlots = w.slots;
      w.page = { ...w.page, parts: w.page.parts.map((p, i) => ({ ...p, items: (w.layout?.slots ?? []).filter(s => s.part === i && s.slot !== "how-do-you-know").reduce((n,s)=>n+s.items,0) + (p.kind === "practice" ? p.faded?.watch ?? 0 : 0) })), capacity: w.layout?.slots, capacityChecked: true };
      if (w.layout) {
        w.slots = layoutSlots(w.page, w.layout);
        const used = new Map<number, number>();
        for (const slot of w.slots) {
          const index = used.get(slot.layoutSlot) ?? 0;
          used.set(slot.layoutSlot, index + 1);
          const was = oldSlots.filter(s => s.layoutSlot === slot.layoutSlot)[index];
          const old = was?.contract;
          slot.contract = old ? { ...old, item: { ...old.item, slot: slot.id } } : null;
          if (was?.existing) slot.existing = true;
          // The book plan's numbers, name and kind of question stay with the slot (the existing writer reads them).
          if (was?.planned) slot.planned = was.planned;
          if (was?.aim) slot.aim = was.aim;
          if (slot.place === "challenge" && old) slot.part = { ...slot.part, skills: [old.item.skill] };
        }
      }
      ownStepFirst(w);
      explainFirstStory(w, work);
      w.page.itemContracts = Object.fromEntries(w.slots.map(s=>[s.id,s.contract ?? null]));
      if (w.layout?.omissions.length) w.page.capacityOmissions = structuredClone(w.layout.omissions);
      if (w.slots.some(s => s.existing)) w.page.existingSlots = w.slots.filter(s => s.existing).map(s => s.id);
    }
  }
  return null;
}

export async function prepareWorkbookCapacity(input: GenerateInput, fitCheck: FitCheck): Promise<WorkbookPlan> {
  const { work } = layOut(input);
  const problem = await fitWorkBudget(input, fitCheck, work);
  if (problem) throw new Error(problem);
  return { ...input.plan, extraPractice: work.filter(w=>w.page.extraPractice).map(w=>w.page), days: input.plan.days.map(d=>({ ...d, pages:d.pages.map(p=>work.find(w=>w.day===d.day && w.page.number===p.number)!.page) })) };
}

/**
 * Generates a draft from a plan and stores it as one unit. Refused, with nothing stored and no AI call, when the input
 * is not sound; refused after generation when the store refuses the draft. Throws ResumeMismatch when a kept page,
 * attempt or call does not fit the plan (R379-8-2).
 */
export async function generateWorkbook(input: GenerateInput, deps: GenerateDeps): Promise<GenerateResult> {
  if (!isUuid(input.workbookId)) return { status: "refused", reason: "the workbook id is not a UUID" };
  if (!isUuid(input.childId)) return { status: "refused", reason: "the child id is not a UUID" };
  if (input.plan.days.length === 0) return { status: "refused", reason: "the plan has no days" };

  if (input.itemPolicy === "approved-v1") input = { ...input, plan: workbookCapacityPlan(input.curriculum, input.plan) };
  const { work, backCover, total } = layOut(input);
  const capacityProblem = await fitWorkBudget(input, deps.fit, work);
  if (capacityProblem) return { status: "refused", reason: capacityProblem };
  const byNumber = new Map(work.map((w) => [w.number, w]));
  // A resumed run (#312) keeps its stored pages and their tokens; a new token never repeats a kept one (a bounded
  // number of tries; a maker that keeps repeating is caught by draftProblem). Each page starts with the attempts its
  // slots used in earlier calls. Everything kept must fit the plan's pages and slots, else nothing goes on (R379-8-2).
  const kept = new Map((await deps.pages?.load() ?? []).map((p) => [p.number, p]));
  for (const p of kept.values()) {
    const problem = keptPageProblem(input, byNumber.get(p.number), p);
    if (problem) throw new ResumeMismatch(problem);
  }
  const spentBefore = await deps.attempts?.load() ?? new Map<string, number>();
  for (const key of spentBefore.keys()) {
    const [page, id] = [Number(key.slice(0, key.indexOf(":"))), key.slice(key.indexOf(":") + 1)];
    const w = byNumber.get(page);
    if (!w || ![...w.slots, ...w.panels].some((x) => x.id === id)) throw new ResumeMismatch(`the attempts kept for page ${page}, slot ${id} name a slot the plan does not have`);
  }
  for (const w of work) {
    w.tries.max = deps.attempts?.max ?? Infinity;
    for (const id of [...w.slots.map((x) => x.id), ...w.panels.map((x) => x.id)]) {
      const n = spentBefore.get(`${w.number}:${id}`);
      if (n) w.tries.used.set(id, n);
    }
  }
  // The AI calls earlier tries kept of the pages still to write (R379-7-1): each page replays them in order, with
  // their kept solve checks (R379-8-1).
  const open = work.filter((w) => !kept.has(w.number) && w.slots.length > 0);
  if (deps.calls && open.length > 0) {
    const numbers = open.map((w) => w.number);
    const openByNumber = new Map(open.map((w) => [w.number, w]));
    for (const c of await deps.calls.load(numbers)) {
      const w = openByNumber.get(c.page);
      if (!w) throw new ResumeMismatch(`a call kept for page ${c.page} is of a page the plan does not have to write`);
      // Checked before any AI call: a page's first call asks all its slots and panels; a later one some of them. Its
      // exact slots are checked again when it is replayed (writeSlots).
      const ids = new Set([...w.slots, ...w.panels].map((x) => x.id));
      const first: CallAsk = { name: PAGE_CALL, slots: w.slots.map((x) => x.id), panels: w.panels.map((x) => x.id) };
      const ask = c.call.ask as CallAsk | undefined;
      const fits = c.seq === 0 ? sameAsk(ask, first) : !!ask && LATER_CALLS.includes(ask.name) && [...ask.slots, ...ask.panels].every((id) => ids.has(id));
      if (!fits) throw new ResumeMismatch(`page ${w.number}: its kept call ${c.seq} is ${askText(ask)}, which the plan's page does not make`);
      w.calls.kept.set(c.seq, c.call);
    }
    for (const [key, verdict] of await deps.calls.solves(numbers)) openByNumber.get(Number(key.slice(0, key.indexOf(":"))))?.solves.set(key, verdict);
  }
  const used = new Set([...kept.values()].map((p) => p.qrToken));
  const tokens = Array.from({ length: total }, (_, i) => kept.get(i + 1)?.qrToken ?? (() => {
    let t = deps.qrToken();
    for (let tries = 0; used.has(t) && tries < 1000; tries++) t = deps.qrToken();
    used.add(t);
    return t;
  })());
  const book: FitBook = { id: input.workbookId, childId: input.childId, number: input.number, levels: [input.plan.level], profileBuild: input.profileBuild };

  const plain = (n: number, type: BookPageType): GeneratedPage => ({
    number: n, type, dayLabel: null, day: null, pageOfDay: null, qrToken: tokens[n - 1], fit: { status: "not-needed" }, attempts: 0, questions: [],
    ...(input.book ? { content: bookPageContent({ curriculum: input.curriculum, plan: input.plan, child: input.book.child, workbook: input.number, type, number: n }) } : {}),
  });
  // What the days before have asked, for a laid-out book: each page is told it, and a repeat goes to the redo. It
  // changes only between days (#312), so the pages of a day read the same memory however many run at once.
  let memory: BookMemory | null = input.book ? { texts: new Map(), keys: new Map(), shapes: new Map(), shapeText: new Map(), codeShapes: new Map() } : null;
  const finished = new Map<number, GeneratedPage>();
  for (const w of work) if (kept.has(w.number)) finished.set(w.number, kept.get(w.number)!);
  if (finished.size > 0) deps.progress?.(finished.size, work.length);
  const writePage = async (w: PageWork, first: PageCall | null, memory: BookMemory | null): Promise<GeneratedPage> => {
    const qrToken = tokens[w.number - 1];
    const page = { number: w.number, type: w.page.type, dayLabel: w.page.extraPractice ? "Extra practice" : `Day ${w.day}`, day: w.page.extraPractice ? null : w.day, pageOfDay: w.page.extraPractice ? null : w.page.number, qrToken };
    let examples: (QuestionPackage | null)[] = [];
    const check = async (questions: GeneratedQuestion[]) => {
      let fit = await deps.fit.fits(fitPage(w, qrToken, questions, contentOf(input, w, questions, examples)), book);
      if (input.itemPolicy === "approved-v1" && w.slots.some(s=>s.existing)) {
        w.page.fillingComplete=true;
        for(let extra=w.page.extraGap ?? 0;lacksOnlyFullness(fit) && extra<=48;extra+=4) {
          w.page.extraGap=extra;
          fit=await deps.fit.fits(fitPage(w,qrToken,questions,contentOf(input,w,questions,examples)),book);
        }
      }
      return fit;
    };
    let result: GeneratedPage;
    if (w.slots.length === 0 || !first) {
      const content = contentOf(input, w, []);
      result = { ...page, fit: { status: "not-needed" }, attempts: 0, questions: [], ...(content ? { content } : {}), ...(w.layout?.omissions.length ? { omissions: w.layout.omissions } : {}) };
    } else {
      const pass = await firstPass(input, deps, w, memory, first);
      let questions = pass.questions;
      examples = pass.examples;
      let fit = await check(questions);
      let attempts: 1 | 2 = 1;
      // (The rewrite, the pairing and the leaving out answer a lack of room: never a layout problem, which the page's
      // report keeps.)
      const room = roomFit(fit);
      const shorter = room.ok || room.problems.every(p => p.kind === "fullness") ? null : await shorterRewrite(input, deps, w, questions, shorterNote(input, w, questions, room.problems), memory);
      if (shorter) {
        questions = shorter;
        fit = await check(questions);
        attempts = 2;
      }
      // Still no room: first pair the tall cards in rows (parent-led pages), then leave out questions one at a time
      // until the page fits; if it never does, keep them all.
      if (!roomFit(fit).ok) {
        const paired = pairedTall(input, w, questions);
        const pairedFit = paired ? await check(paired) : null;
        if (paired && pairedFit && roomFit(pairedFit).ok) {
          questions = paired;
          fit = pairedFit;
        }
      }
      const leftOut: { question: GeneratedQuestion; slot: Slot; reason: string }[] = [];
      let kept = questions;
      let left = fit;
      // A page keeps at least one question: its panels take their sums from its questions.
      for (let room = roomFit(left); !room.ok && !room.problems.every(p => p.kind === "fullness") && kept.length > 1; room = roomFit(left)) {
        const candidates = input.itemPolicy === "approved-v1" ? kept.filter(q=>q.existing) : kept;
        const selected = toLeaveOut(candidates, room.problems);
        const out = selected ? {...selected,index:kept.indexOf(candidates[selected.index])} : null;
        if (!out) break;
        leftOut.push({ question: kept[out.index], slot: w.slots.find((x) => x.id === kept[out.index].slot)!, reason: out.reason });
        kept = renumbered(kept.filter((_, k) => k !== out.index));
        left = await check(kept);
      }
      const leftRoom = roomFit(left);
      if ((leftRoom.ok || leftRoom.problems.every(p => p.kind === "fullness")) && leftOut.length > 0) {
        questions = kept;
        fit = left;
      } else leftOut.length = 0;
      const content = contentOf(input, w, questions, examples);
      const omissions = omissionsWith(w, leftOut);
      result = {
        ...page, fit: fit.ok ? { status: "fits" } : { status: "failed", problems: fit.problems }, attempts, questions,
        panelExamples: examples,
        ...(input.itemPolicy === "approved-v1" ? { expected: w.slots.map(s => ({ slot: s.id, part: s.part.kind, place: s.place, ...slotSteps(input, s, w.day) })) } : {}),
        ...(content ? { content } : {}), ...(omissions.length ? { omissions } : {}),
        ...(leftOut.length ? { leftOut: leftOut.map((x) => ({ slot: x.question.slot, part: x.question.part, text: x.question.package?.text ?? null, reason: x.reason })) } : {}),
      };
    }
    return result;
  };
  // Day by day, in order, so each day's pages know what the days before asked (#312). The first calls of a day's pages
  // run at once (`concurrency`), each told what the days before asked; the rest of each page (its repeats against the
  // book and this day's pages before it, the redo, the fit) runs in page order, and the page is stored then. So the
  // draft is the same at any concurrency, and a resumed day reads what its stored pages asked.
  for (const day of input.plan.days) {
    const pagesOfDay = work.filter((w) => w.day === day.day);
    const before = memory;
    const seen = memory ? cloneMemory(memory) : null;
    const turns = pagesOfDay.map(() => {
      let settle!: (error?: unknown) => void;
      const done = new Promise<void>((resolve, reject) => { settle = (error) => (error === undefined ? resolve() : reject(error)); });
      done.catch(() => undefined);
      return { done, settle };
    });
    await pool(pagesOfDay.map((w, k) => ({ w, k })), deps.concurrency ?? 1, async ({ w, k }) => {
      try {
        const kept = finished.get(w.number);
        const first = kept || w.slots.length === 0 ? null : await pageCall(input, deps, w, before);
        if (k > 0) await turns[k - 1].done;
        const page = kept ?? await writePage(w, first, seen);
        // Every call kept for the page was replayed: one the page never reached is of another plan (R379-8-2).
        const unread = [...w.calls.kept.keys()].filter((seq) => seq >= w.calls.next);
        if (!kept && unread.length > 0) throw new ResumeMismatch(`page ${w.number} has kept call ${unread.join(", ")}, which the plan's page does not make`);
        if (!kept) {
          await deps.pages?.save(page);
          finished.set(w.number, page);
          deps.progress?.(finished.size, work.length);
        }
        if (seen) remember(seen, w.number, page.questions);
        turns[k].settle();
      } catch (error) {
        turns[k].settle(error ?? new Error("a page failed"));
        throw error;
      }
    }, () => deps.stop?.() ?? false);
    if (pagesOfDay.some((w) => !finished.has(w.number))) return { status: "paused", done: finished.size, total: work.length };
    memory = seen;
  }
  // With a page store, the stored pages are the truth (#312, R379-2): the draft is built from them.
  if (deps.pages) {
    const stored = new Map((await deps.pages.load()).map((p) => [p.number, p]));
    for (const w of work) {
      const page = stored.get(w.number);
      if (!page) throw new Error(`day page ${w.number} is not stored`);
      finished.set(w.number, page);
    }
  }
  let pages: GeneratedPage[] = [plain(1, "cover"), plain(2, "how-plan"), ...work.map((w) => finished.get(w.number)!)];
  for (let n = backCover; n <= total; n++) pages.push(plain(n, "blank"));

  let quality: BookQuality | undefined;
  if (input.itemPolicy === "approved-v1") {
    const repairKeys=new Set<string>(), repairFrames=new Set<string>();
    const reviewed = await checkWholeBook(pages, async (page, issues) => {
      const w = byNumber.get(page.number);
      if (!w) return null;
      const keyOf=(pkg:QuestionPackage)=>taskIdentity(pkg);
      const current=[...page.questions];
      const questions = page.questions.map((q,index) => {
        // Issues that each name their question change only those questions (a repeat, a Challenge card, a story too easy).
        // (A day's time estimate names no question, and a new question does not fix it.)
        const named=(i:{reason:string})=>/\bquestion \d+ /.test(i.reason);
        const fixable=issues.filter(i=>i.kind!=="time");
        if (fixable.every(i=>i.kind === "repeat" || named(i)) && !fixable.some(i=>i.reason.includes(`question ${q.number} `))) return q;
        const slot=w.slots.find(s=>s.id===q.slot);
        if(!slot || q.existing) return q;
        const counts=new Map<string,number>();
        // Counted as the book check counts them (a template item by its printed form, #489).
        const kindOf=(o:{itemPlan?:ItemPlan|null;package:QuestionPackage|null})=>typeKey(page,{itemPlan:o.itemPlan ?? undefined,package:o.package});
        for(const other of current) if(other.package && other.place!=="warm-up") counts.set(kindOf(other),(counts.get(kindOf(other)) ?? 0)+1);
        const limit=Math.ceil(current.filter(q=>q.package && q.place!=="warm-up").length/2);
        // Too few contexts or formats: a question whose form another question shares takes a new one, until there are 3.
        const forms=()=>new Set(current.flatMap(o=>o.package && o.place!=="warm-up" ? [printedForm(o.package)] : []));
        const fewForms=issues.some(i=>/contexts? or formats?/.test(i.reason)) && forms().size<3 && !!q.package && q.place!=="warm-up" && current.filter(o=>o.package && printedForm(o.package)===printedForm(q.package!)).length>=2;
        const frameAgain=issues.some(i=>i.reason.startsWith(`question ${q.number} uses the sentence frame`) || /sentence frame/.test(i.reason) && i.reason.includes("times") && !!q.package && i.reason.includes(`"${sentenceFrameOf(q.package)}"`));
        if(fixable.every(i=>i.kind==="variety") && q.package && (counts.get(kindOf(q)) ?? 0)<=limit && !fewForms && !frameAgain) return q;
        const others=pages.flatMap(p=>p.questions.filter(other=>p.number!==page.number || other.number!==q.number)).concat(current.slice(0,index));
        const keys=new Set([...others.flatMap(other=>other.package && other.place!=="warm-up" ? [keyOf(other.package)] : []), ...pages.flatMap(p=>(p.panelExamples ?? []).flatMap(e=>e ? [keyOf(e)] : []))]);
        const frames=new Set(others.flatMap(other=>other.package && wordedTask(other.package) ? [storyFrame(other.package.text)] : []));
        // Its own step first, then (late attempts) an earlier step the book taught or the day reviews.
        for(const attempt of [...Array.from({length:128},(_,k)=>k+2), ...Array.from({length:96},(_,k)=>LATE_ATTEMPT+k)]) {
          const c=contractFor(input,w,slot,attempt);
          if(!c || c.source!=="code") continue;
          const b=buildPlannedItem(c,c.item,{id:q.package?.id ?? `${input.workbookId}:${page.number}:${q.slot}`,workbookId:input.workbookId,page:page.number,question:q.number,level:input.plan.level,skills:[c.item.skill]});
          if(!b.package || b.check.status==="failed" || levelRange(b.package, input) || dayProblem(input, b.package, w.day,slot.place ?? "")) continue;
          if(keys.has(keyOf(b.package)) || repairKeys.has(keyOf(b.package)) || wordedTask(b.package) && !c.template && (frames.has(storyFrame(b.package.text)) || repairFrames.has(storyFrame(b.package.text)))) continue;
          const type=kindOf({itemPlan:c,package:b.package}),old=q.package ? kindOf(q) : "";
          if(current.length>=3 && (counts.get(type) ?? 0)-(type===old ? 1 : 0)>=limit) continue;
          if(fewForms && forms().has(printedForm(b.package))) continue;
          const sentence=sentenceFrameOf(b.package);
          if(sentence && current.some((o,k)=>k!==index && o.package && sentenceFrameOf(o.package)===sentence)) continue;
          // A stem twice a page; a story too easy for the level; a Challenge template once (as the planner).
          const stem=stemOf(b.package);
          if(stem && current.filter((o,k)=>k!==index && o.package && o.place!=="warm-up" && stemOf(o.package)===stem).length>=2) continue;
          if(tooEasyStory(input,slot,c,b.package)) continue;
          if(c.template && slot.place!=="challenge" && slot.place!=="warm-up" && current.filter((o,k)=>k!==index && o.place!=="warm-up" && o.place!=="challenge" && o.itemPlan?.template && o.itemPlan.template.skill===c.template!.skill && o.itemPlan.template.step===c.template!.step && o.itemPlan.template.index===c.template!.index).length>=2) continue;
          if(slot.place==="challenge" && c.template && (c.template.challengeTemplates ?? 3)<3 && current.some((o,k)=>k!==index && o.itemPlan?.template && o.itemPlan.template.skill===c.template!.skill && o.itemPlan.template.step===c.template!.step && o.itemPlan.template.index===c.template!.index)) continue;
          // At most twice a day: the day's other pages count too.
          if(sentence && pages.filter(p=>p.day===page.day && p.number!==page.number).flatMap(p=>p.questions).filter(o=>o.package && o.place!=="warm-up" && sentenceFrameOf(o.package)===sentence).length + current.filter((o,k)=>k!==index && o.package && sentenceFrameOf(o.package)===sentence).length>=2) continue;
          const fresh={...q,check:b.check,package:b.package,itemPlan:c};
          slot.contract = c;
          current[index]=fresh;
          repairKeys.add(keyOf(b.package));
          if(wordedTask(b.package)) repairFrames.add(storyFrame(b.package.text));
          return fresh;
        }
        return q;
      });
      const content = contentOf(input, w, questions, page.panelExamples ?? []);
      // Older checkpoints keep the checked teaching blocks, even if their
      // separate example packages predate panelExamples.
      if (content?.kind === "day" && page.content?.kind === "day") {
        const old = page.content.blocks.filter(b=>PANEL_SLOTS.includes(b.slot));
        for (const block of content.blocks.filter(b=>PANEL_SLOTS.includes(b.slot))) {
          const index = old.findIndex(b=>b.slot===block.slot);
          if (index>=0) Object.assign(block,structuredClone(old.splice(index,1)[0]));
        }
      }
      const fit = await deps.fit.fits(fitPage(w, page.qrToken, questions, content), book);
      return { ...page, questions, ...(content ? { content } : {}), fit: fit.ok ? { status: "fits" } : { status: "failed", problems: fit.problems } };
    });
    quality = reviewed.quality;
    // G1: the personal book checks read the printed book: the warm-up's fact families (item 4) and the interest share
    // (item 5). A failure is a whole-book issue on its page; with no signals there are none.
    const personal = [...warmUpShareProblems(input.curriculum, input.plan, reviewed.pages), ...interestShareProblems(input.curriculum, input.plan, reviewed.pages)];
    if (personal.length) quality = { ...quality, ready: false, issues: [...quality.issues, ...personal.map((x) => ({ page: x.page, kind: "variety" as const, reason: x.reason }))] };
    pages = reviewed.pages.map(p => {
      const issues = quality!.issues.filter(i => i.page === p.number);
      return issues.length ? { ...p, fit: { status: "failed" as const, problems: [...(p.fit.status === "failed" ? p.fit.problems : []), ...issues.map(i => ({ question: null, reason: `whole-book check: ${i.reason}` }))] } } : p;
    });
    // Checkpoints keep pre-review pages. These code-only repairs are deterministic
    // and repeat after a resume without spending another provider call.
    // The plan page says "about N minutes" from the book's own day estimates, their mean to the nearest five (D-229: a
    // day is about 30 minutes; the real U4 sample said "20 to 25 minutes" beside days estimated at 28.7). Never copy
    // written apart from the estimate.
    const minutes = quality.days.map(d => d.minutes).filter(m => m > 0);
    if (minutes.length) {
      const about = Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length / 5) * 5;
      const range = { min: about, max: about };
      pages = pages.map(p => p.content && (p.content.kind === "how-plan" || p.content.kind === "cover") ? { ...p, content: { ...p.content, minutes: range } } : p);
    }
  }
  const questions = pages.flatMap((p) => p.questions);
  const draft: GeneratedWorkbook = {
    ...book,
    model: deps.ai.model,
    pages,
    ...(quality ? { quality } : {}),
    counts: {
      pages: pages.length,
      questions: questions.length,
      checked: questions.filter((q) => q.check.status === "checked").length,
      notChecked: questions.filter((q) => q.check.status === "not-checked").length,
      failed: questions.filter((q) => q.check.status === "failed").length,
      failedPages: pages.filter((p) => p.fit.status === "failed").length,
    },
  };
  const saved = await deps.store.save(draft);
  return saved.status === "saved" ? { status: "stored", draft } : saved;
}

/** Numeric data of items without an operation, including their pictures. Ignore editable words and labels. */
function editNumbers(value: unknown): number[] {
  if (typeof value === "number") return [value];
  if (Array.isArray(value)) return value.flatMap(editNumbers);
  if (value && typeof value === "object") return Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).flatMap(([, v]) => editNumbers(v));
  return [];
}

/** Replace only the selected questions of a stored day page. The plan, checks and templates stay binding. */
export async function reviseWorkbookPage(input: GenerateInput, deps: GenerateDeps, page: GeneratedPage,
  change: { question: number | number[] | null; note: string; item?: unknown; items?: Record<number, unknown> }): Promise<GeneratedPage> {
  if (page.questions.some(q => q.itemPlan)) input = { ...input, itemPolicy: "approved-v1" };
  const w = layOut(input).work.find((x) => x.number === page.number);
  if (!w || !page.content || page.content.kind !== "day") throw new Error("This page has no questions to rewrite.");
  const targets = page.questions.filter((q) => change.question === null || (Array.isArray(change.question) ? change.question.includes(q.number) : q.number === change.question));
  if (!targets.length) throw new Error("This question is unavailable. Reload the page.");
  const which = targets.map((q) => w.slots.findIndex((s) => s.id === q.slot));
  if (which.some((i) => i < 0)) throw new Error("The page plan changed. Prepare a new workbook.");
  const note = change.note.replace(/(?:Whole page|Question \d+): /g, "");
  const keepNumbers = /keep (?:the )?numbers/i.test(note) || !(/\d|\b(?:change|replace|different|new)\b.{0,25}\b(?:numbers|operands|calculation)\b/i.test(note));
  // Keep the current data, including edits from earlier revisions. The note can change its nouns and wording.
  for (let k = 0; k < which.length; k++) {
    const slot = w.slots[which[k]], old = slot.planned;
    const op = targets[k].package?.operation;
    const operands = op && "operands" in op && op.operands.every(v => typeof v === "number") ? op.operands as number[] : null;
    const numbers = operands && op?.kind === "subtract" ? [operands[0] - operands[1], operands[1]] : operands;
    slot.planned = { use: keepNumbers ? numbers : null, spare: null, name: old?.name ?? "Mia", thing: old?.thing ?? "apples",
      names: PEOPLE.filter(name => name !== input.book?.child), things: [...THINGS] };
    delete slot.aim;
    if (input.itemPolicy === "approved-v1") {
      const saved = targets[k].itemPlan;
      if (!saved && targets[k].existing) { slot.existing = true; slot.contract = null; continue; }
      if (!saved) throw new Error("This question has no saved item policy. Prepare a new workbook.");
      slot.contract = structuredClone(saved);
      slot.contract.item.text = targets[k].package?.text ?? saved.item.text;
      if (!keepNumbers) {
        slot.contract = contractFor(input, w, slot, 1);
        if (!slot.contract) throw new Error("There is no approved replacement for this skill.");
      }
    }
  }
  const currentQuestions = targets.map(q => ({ number: q.number, text: q.package?.text ?? null, data: workbookEditItem(q) }));
  const writer = deps.ai;
  deps = { ...deps, ai: { model: writer.model, json: (request, signal) => writer.json({ ...request,
    system: `${request.system} For an edit, read currentQuestions. Keep each question's numbers, operation and data unless the comment explicitly asks to change them.`,
    content: request.content.map(part => part.type === "text" ? { ...part, text: JSON.stringify({ ...JSON.parse(part.text), currentQuestions }) } : part),
  }, signal) } };
  const built: BuiltQuestion[] = [];
  let examples: (QuestionPackage | null)[] = [];
  const manual = change.items ?? (change.item !== undefined ? { [targets[0].number]: change.item } : {});
  const aiWhich = which.filter((_, k) => !Object.hasOwn(manual, targets[k].number));
  const result = aiWhich.length ? await writeSlots(input, deps, w, aiWhich, change.note, "workbook_page_redo",
    change.question === null ? w.panels : [], null,
    page.questions.filter((q) => !targets.includes(q)).flatMap((q) => q.package ? [q.package.text] : []), { skipSolve: true }) : null;
  if (result) examples = result.examples.map((b) => {
    if (b.check.status === "failed") throw new Error(b.check.reason);
    return b.package;
  });
  for (let k = 0; k < targets.length; k++) {
    const q = targets[k], slot = w.slots[which[k]];
    if (!Object.hasOwn(manual, q.number)) { built.push(result!.built[aiWhich.indexOf(which[k])]); continue; }
    const raw = manual[q.number] as { text?: unknown; easier?: { text?: unknown } };
    if (input.itemPolicy === "approved-v1" && slot.contract?.source === "code" && raw.text !== slot.contract.item.text) throw new Error("Code writes this drill. Change its numbers through the approved builder.");
    // A story prints the generator's own words, a manual edit too (Codex at 09a095cd: an edit saved "Ben" over code's "Mia").
    const storyText = slot.contract?.source === "story" ? slot.contract.item.text : !slot.contract && q.codeText ? q.codeText : null;
    if (typeof raw.text === "string" && (storyText ? raw.text !== storyText : isNumberStory(raw.text) && raw.text !== q.package?.text))
      throw new Error("Stories print the generator's own wording. Change the numbers or regenerate the question instead.");
    const builder = input.itemPolicy === "approved-v1" && !slot.existing ? (raw: unknown, place: Parameters<typeof buildQuestion>[1]) => slot.contract ? buildPlannedItem(slot.contract, raw, place) : unapprovedBuild() : buildQuestion;
    const b = builder(raw, { id: q.package?.id ?? `${input.workbookId}:p${page.number}q${q.number}`,
      workbookId: input.workbookId, page: page.number, question: q.number, level: input.plan.level,
      skills: slot.contract ? [...new Set([slot.contract.item.skill, ...slot.part.skills])] : slot.part.skills, signs: skillSigns(input.curriculum, input.plan.level, slot.contract ? slot.contract.item.skill : slot.part.skills[0]), story: !!slot.place && STORY_CHECK_PLACES.has(slot.place) });
    if (b.package && typeof raw.text === "string") {
      b.package.text = raw.text;
      if (input.itemPolicy !== "approved-v1" || slot.contract?.source !== "code" && slot.contract?.source !== "story" && !q.codeText) b.package.textSource = "human";
      if (b.package.easierExample && typeof raw.easier?.text === "string") b.package.easierExample.text = raw.easier.text;
      const codeCheck = checkQuestionPackage(b.package);
      if (codeCheck.status !== "checked") throw new Error("The code cannot derive and check every answer from these fields.");
      const problem = kindProblem(b.package, raw as Record<string, unknown>)
        ?? (slot.place && STORY_CHECK_PLACES.has(slot.place) ? storyProblem(raw.text) : quantityStoryProblem(raw.text));
      if (problem) b.check = { status: "failed", reason: problem };
    }
    built.push(b);
  }
  for (let k = 0; k < built.length; k++) {
    const b = built[k], q = targets[k], slot = w.slots[which[k]];
    if (b.check.status === "failed" || !b.package) throw new Error(b.check.status === "failed" ? b.check.reason : "The question could not be made.");
    b.package = { ...b.package, id: q.package?.id ?? b.package.id,
      ref: { source: "workbook", workbookId: input.workbookId, page: page.number, question: q.number } };
    if (Object.hasOwn(manual, q.number) && b.check.status !== "checked") throw new Error("The code cannot derive every answer from these fields.");
    if (!Object.hasOwn(manual, q.number) && keepNumbers && JSON.stringify(b.package.operation) !== JSON.stringify(q.package?.operation)) throw new Error("The rewrite changed the numbers. Try again and ask to keep the calculation.");
    if (!Object.hasOwn(manual, q.number) && keepNumbers && !q.package?.operation && JSON.stringify(editNumbers([b.package.item?.checks, b.package.item?.figure])) !== JSON.stringify(editNumbers([q.package?.item?.checks, q.package?.item?.figure]))) throw new Error("The rewrite changed the numbers. Try again and ask to keep the calculation.");
    const format = b.package.item?.format;
    if (slot.place && STRICT_SLOTS.includes(slot.place) && format && !SLOT_FORMATS[slot.place]?.includes(format)) throw new Error("The question does not fit this part of the page.");
    const problem = levelRange(b.package, input)
      ?? (input.itemPolicy === "approved-v1" ? dayProblem(input, b.package, w.day, slot.place ?? "") : null)
      ?? (slot.place === "spot-the-error" && !isStepItem(b.package) ? samProblem(b.package, input.plan.level) : null);
    if (problem) throw new Error(problem);
  }
  await Promise.all([...built, ...examples.filter((p): p is QuestionPackage => p !== null).map((p) => ({ package: p }))].map(async (b) => {
    if (!b.package) return;
    const pkg = b.package;
    const dispatch = () => solveCheck(deps.solver, pkg, deps.solveTimeLimitMs ?? SOLVE_TIME_LIMIT_MS, deps.now);
    const log = deps.editCall ? await deps.editCall("solve", pkg.id, pkg, dispatch) : await dispatch();
    if (log) {
      deps.onSolve?.(log);
      if (log.verdict.status !== "agreed") throw new Error(solveReason(log.verdict));
    }
  }));
  const questions = page.questions.map((q) => {
    const k = targets.indexOf(q);
    return k < 0 ? q : { ...q, package: built[k].package, check: built[k].check, ...(w.slots[which[k]].contract ? { itemPlan: w.slots[which[k]].contract! } : {}) };
  });
  // Keep the original slot positions and panels on a question edit. Rebuild only its dependent picture and hints.
  const content = structuredClone(page.content);
  if (change.question === null) {
    const made = contentOf(input, w, questions, examples);
    if (!made || made.kind !== "day") throw new Error("The page could not be laid out.");
    content.blocks = made.blocks;
  } else {
    const { pageFigure } = await import("@/lib/workbook-book");
    for (const block of content.blocks) {
      for (let k = 0; k < targets.length; k++) {
        const number = targets[k].number;
        const at = block.items.indexOf(number);
        if (at < 0) continue;
        const pkg = built[k].package!;
        const figure = pageFigure(pkg.item?.figure);
        if (!block.figures && figure) block.figures = block.items.map(() => null);
        if (block.figures) block.figures[at] = figure;
        if (block.hints) block.hints[at] = null;
        if (block.missing) block.missing = block.missing.filter((m) => m.number !== number);
        if (block.slot === "spot-the-error") {
          const made = contentOf(input, w, questions);
          if (made?.kind === "day") Object.assign(block, made.blocks.find((b) => b.slot === block.slot));
        }
      }
    }
  }
  const next = { ...page, questions, content, ...(change.question === null ? {panelExamples:examples} : {}), fit: { status: "fits" } as PageFit };
  const fit = await deps.fit.fits(fitPage(w, page.qrToken, questions, content), {
    id: input.workbookId, childId: input.childId, number: input.number, levels: [input.plan.level], profileBuild: input.profileBuild,
  });
  if (!fit.ok) throw new Error(`The page does not fit: ${fit.problems.map((p) => p.reason).join(" ")}`);
  return next;
}
