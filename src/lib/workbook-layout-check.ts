// The layout checks of a day page (Savar's page reviews, 2026-11-04): what he found by eye, one round at a time, as
// checks on the page as the print engine laid it out. The template's fit check (src/lib/workbook-template.ts, `fit`)
// runs them on every render, so a page that fails is reported, and repaired by the generator's fit loops where it can
// be; the book check (src/lib/workbook-quality.ts) runs the ones that read the page's words. The checks:
// 1. Bottom gap: no empty band at the foot of a day page that would hold another row of the page's questions (at most
//    60 px, less where the page's rows are shorter; `bottomGapLimit`, read by the template's fullness check).
// 2. Even spacing: the gaps between the rows of a slot vary by at most 4 px across the page; a section label (a chip,
//    a heading, Remember these) has the same room above it as the page's other labels, at least a row gap, and more
//    than below it (on a page that grows its rows to fill it, its rows' ink may be further apart than a label's gap,
//    and a label's gap is from the grown cells of the row above it; the other rules hold); nothing sits closer than
//    4 px to the next thing.
// 3. Alignment: the questions of a row the template prints (its plan, never where they printed) share their numbers'
//    and first lines' baselines; each answer region the template prints beside a question's first line sits at that
//    line (a box's top at the line's top, a word on its baseline, a fact's box centred on it) and the answers end at
//    the column's edge the template gives. A region missing from its place fails.
// 4. One number style: every question number on a page is in one font, on its sentence's baseline (Spot the error's
//    too).
// 5. Circle instruction: a page with a question to circle says "circle" in its instruction (`circleProblem`).
// 6. No instruction twice: no sentence of the page's instruction lines is printed twice on the page, in one line or in
//    two (`repeatedInstruction`).
// 7. Clipping: no line of printed text is cut by a box.
// The measured checks (2, 3, 4, 7) read what only the real print engine gives (MeasuredElement.firstLine); with a print
// engine that gives no lines (the test fake) they do not run.
// Pure TypeScript: no Next.js, React, network, database or clock.
import type { DayContent, SlotName } from "@/lib/workbook-page";
import type { DraftPage, FitProblem, MeasuredElement } from "@/lib/workbook-render";
import type { QuestionPackage } from "@/lib/question-package";
import type { PagePlan } from "@/lib/workbook-template";
import { questionWorkSpace } from "./workbook-work-space";
import { answerInstruction, isWarmUpPage, workbookPageInstruction, workbookWorkLine } from "@/lib/workbook-page-instructions";

/** How far measured things may differ and still count as lined up or even, in CSS pixels. */
export const LAYOUT_TOLERANCE = {
  /** Two baselines. */
  baseline: 1.5,
  /** A box's top and its question's first line's top. */
  top: 3,
  /** A target's right edge and its column's. */
  edge: 1.5,
  /** The gaps between rows on one page. */
  rows: 4,
  /** The least gap between two things on a page (Practice 2's rows, D-226, are 4 apart). */
  least: 4,
  /**
   * The most of a line's height a box may cut off at its top and its bottom (a line's rect is its font's full height:
   * its letters start about a fifth of it in from the top, and their tails end a little in from the bottom), and the
   * most pixels at its sides.
   */
  clipTop: 0.15,
  clipBottom: 0.08,
  clipSide: 1,
} as const;

/** The most empty room at a page's foot (Savar, 2026-11-04: "space for another question"). */
const BOTTOM_MOST = 60;

type Measured = ReadonlyMap<string, MeasuredElement>;
interface Band {
  top: number;
  bottom: number;
  /** A row's cells' bottom (its questions' measured rects): below its ink where the row grew to fill its page. */
  cell?: number;
  kind: "row" | "label" | "box";
  name: string;
  questions: number[];
}

const bottomOf = (m: { y: number; height: number }) => m.y + m.height;
const shown = (m: MeasuredElement | undefined): m is MeasuredElement => !!m && m.visible && m.width > 0 && m.height > 0;
const inside = (m: MeasuredElement, box: MeasuredElement) =>
  m.x >= box.x - 0.5 && m.y >= box.y - 0.5 && m.x + m.width <= box.x + box.width + 0.5 && bottomOf(m) <= bottomOf(box) + 0.5;
const px = (n: number) => `${Math.round(n)} px`;

/** Slots whose questions print as cards or stories with an outline or a rule: the card itself is what shows. */
const CARDS = new Set<SlotName>(["word-problems", "challenge", "show-what-you-know", "level-test", "fix-it", "picture-stories", "mixed-set"]);

/** A question's measured parts: its number, its text, and every answer region. */
function partsOf(n: number, measured: Measured): MeasuredElement[] {
  const out: MeasuredElement[] = [];
  for (const [name, m] of measured) {
    if (!shown(m)) continue;
    if (name === `number-${n}` || name === `question-${n}-content` || name === `question-${n}-answer` || name === `workspace-${n}` || name.startsWith(`region-${n}-`)) out.push(m);
  }
  return out;
}

/** Whether the page was measured by an engine that gives lines (the real one). */
export const hasLines = (measured: Measured) => [...measured.values()].some((m) => m.firstLine !== undefined);

/**
 * The most empty room at the foot of a day page: 60 px, or less where the page's shortest row of questions (with the gap
 * above it) would fit in less, so that room never holds another row of the page's questions.
 */
export function bottomGapLimit(page: DraftPage, measured: Measured): number {
  const rows = questionRows(page, measured);
  if (rows.length === 0) return BOTTOM_MOST;
  const heights = rows.map((r) => r.bottom - r.top);
  const gaps = rows.slice(1).map((r, i) => r.top - rows[i].bottom).filter((g) => g > 0);
  const row = Math.min(...heights) + (gaps.length ? Math.min(...gaps) : 0);
  return Math.min(BOTTOM_MOST, row);
}

/** The page's questions as rows: questions side by side (their rects overlap top to bottom) make one row. */
function questionRows(page: DraftPage, measured: Measured): Band[] {
  const bands = page.questions.flatMap((q) => {
    const m = measured.get(`question-${q.number}`);
    return shown(m) ? [{ top: m.y, bottom: bottomOf(m), kind: "row" as const, name: `question-${q.number}`, questions: [q.number] }] : [];
  });
  return merge(bands);
}

/** Bands sorted top to bottom, those that overlap top to bottom merged (a row of two questions, a chip beside a note). */
function merge(bands: Band[]): Band[] {
  const out: Band[] = [];
  for (const b of [...bands].sort((a, c) => a.top - c.top)) {
    const last = out.at(-1);
    // (A note under a label is the label's: "Mental math", then "Work it out without writing it down.")
    if (last && (b.top < last.bottom - 0.5 || (b.name.startsWith("note-") && last.kind === "label" && b.top - last.bottom < 8))) {
      last.bottom = Math.max(last.bottom, b.bottom);
      if (b.cell !== undefined) last.cell = Math.max(last.cell ?? b.cell, b.cell);
      if (b.kind === "row") { last.kind = "row"; last.questions.push(...b.questions); }
      else if (last.kind !== "row" && b.kind === "box") last.kind = "box";
    } else out.push({ ...b, questions: [...b.questions] });
  }
  return out;
}

const day = (page: DraftPage): DayContent | null => (page.content?.kind === "day" ? page.content : null);
const slotOf = (c: DayContent, n: number) => c.blocks.find((b) => b.items.includes(n))?.slot ?? null;
const where = (page: DraftPage, c: DayContent) => `day ${c.day} page ${c.page} (${page.type})`;

/**
 * Check 2: even spacing. Within each box of the page (the content area, each outlined box), the things in it top to
 * bottom: rows of questions (what prints of them: a card or story whole, else its number, text and answer spaces),
 * section labels and boxes. Every gap is at least `least`; the gaps between rows vary by at most `rows`; a gap above a
 * section label or box is at least the page's widest row gap less the tolerance, and larger than the gap under a label.
 */
function spacingProblems(page: DraftPage, c: DayContent, measured: Measured): FitProblem[] {
  const area = measured.get("slot-content");
  if (!shown(area)) return [];
  const T = LAYOUT_TOLERANCE;
  const stretched = !!(c.fillingComplete && c.atMaximum);
  const frames = [...measured].filter(([name, m]) => /^(?:frame|panel)-/.test(name) && shown(m)).map(([name, m]) => ({ name, m }));
  const containers = [{ name: "slot-content", m: area }, ...frames.filter((f) => f.name.startsWith("frame-"))];
  // The innermost frame or panel holding an element (the content area when none).
  const holder = (m: MeasuredElement, self?: string) =>
    frames.filter((f) => f.name !== self && inside(m, f.m)).sort((a, b) => a.m.width * a.m.height - b.m.width * b.m.height)[0]?.name ?? "slot-content";
  const bandsIn = new Map<string, Band[]>(containers.map((x) => [x.name, []]));
  const add = (container: string, band: Band) => bandsIn.get(container)?.push(band);
  for (const q of page.questions) {
    const el = measured.get(`question-${q.number}`);
    if (!shown(el)) continue;
    const slot = slotOf(c, q.number);
    // (A card or a story: the card itself is what shows. A row that grew to fill its page is measured by its ink too,
    // so rows that grew unevenly fail: the full U4 books of seeds ed6ecc9f and 19bacf2a.)
    const card = c.level <= 3 || (slot !== null && CARDS.has(slot));
    const parts = card ? [el] : partsOf(q.number, measured);
    const ink = parts.length ? parts : [el];
    add(holder(el), { top: Math.min(...ink.map((m) => m.y)), bottom: Math.max(...ink.map(bottomOf)), cell: bottomOf(el), kind: "row", name: `question ${q.number}`, questions: [q.number] });
  }
  for (const [name, m] of measured) {
    if (!shown(m)) continue;
    const label = /^(?:label|heading|review|note)-/.test(name) || /^chip-\d+-\d+$/.test(name);
    const box = /^(?:frame|panel)-/.test(name);
    if (!label && !box) continue;
    const at = holder(m, name);
    // A label inside a teaching panel is the panel's own: the panel is one thing on the page.
    if (at.startsWith("panel-")) continue;
    add(at, { top: m.y, bottom: bottomOf(m), kind: box ? "box" : "label", name, questions: [] });
  }
  const problems: FitProblem[] = [];
  const fail = (question: number | null, reason: string) => problems.push({ question, slot: question ? slotOf(c, question) : null, reason: `${where(page, c)}: ${reason}` });
  const what = (b: Band) => (b.kind === "row" ? `question ${b.questions.join(" and ")}` : b.kind === "box" ? "a box" : `the label "${measured.get(b.name)?.text.slice(0, 30) ?? b.name}"`);
  const rowGaps: { gap: number; below: Band }[] = [];
  const sectionGaps: { gap: number; below: Band; above: Band }[] = [];
  const labelGaps: { gap: number; label: Band }[] = [];
  for (const [, bands] of bandsIn) {
    const seq = merge(bands);
    seq.forEach((b, i) => {
      if (i === 0) return;
      const a = seq[i - 1];
      const gap = b.top - a.bottom;
      if (gap < T.least - 0.5) fail(b.questions[0] ?? a.questions[0] ?? null, `${what(b)} sits ${px(Math.max(0, gap))} under ${what(a)}; leave at least ${T.least} px`);
      // (Rows of one slot; the next slot's questions start a new section.)
      const block = (x: Band) => c.blocks.findIndex((k) => k.items.includes(x.questions[0]));
      if (a.kind === "row" && b.kind === "row" && block(a) === block(b)) rowGaps.push({ gap, below: b });
      else if (a.kind === "row" && b.kind === "row") return;
      // (On a page whose rows grew, a label's gap is from the cells of the row above: its grown room is the row's.)
      else if (b.kind !== "row") sectionGaps.push({ gap: stretched && a.kind === "row" ? b.top - (a.cell ?? a.bottom) : gap, below: b, above: a });
      else if (a.kind === "label") labelGaps.push({ gap, label: a });
    });
  }
  if (rowGaps.length > 1) {
    const least = Math.min(...rowGaps.map((g) => g.gap));
    const most = rowGaps.reduce((x, g) => (g.gap > x.gap ? g : x));
    if (most.gap - least > T.rows + 0.5) fail(most.below.questions[0] ?? null, `the gaps between rows run from ${px(least)} to ${px(most.gap)} (above ${what(most.below)}); keep them within ${T.rows} px`);
  }
  // (A box, outlined or shaded, stands apart by its own edge: only a label needs the room. A page at its maximum grows
  // its rows, so its rows' gap may be wider than a label's; every other label rule holds there too.)
  const rowGap = rowGaps.length ? Math.max(...rowGaps.map((g) => g.gap)) : 0;
  const labels = sectionGaps.filter((s) => s.above.kind === "row" && s.below.kind === "label");
  for (const s of stretched ? [] : labels) {
    if (s.gap < rowGap - T.rows - 0.5) fail(s.above.questions[0] ?? null, `${what(s.above)} sits ${px(s.gap)} above ${what(s.below)}, closer than the ${px(rowGap)} between rows`);
  }
  if (labels.length > 1) {
    const least = labels.reduce((x, g) => (g.gap < x.gap ? g : x));
    const most = Math.max(...labels.map((g) => g.gap));
    if (most - least.gap > T.rows + 0.5) fail(least.above.questions[0] ?? null, `the gaps above the page's labels run from ${px(least.gap)} (above ${what(least.below)}) to ${px(most)}; keep them within ${T.rows} px`);
  }
  for (const l of labelGaps) {
    const above = sectionGaps.find((s) => s.below === l.label);
    if (above && above.above.kind === "row" && above.gap < l.gap - 0.5) fail(above.above.questions[0] ?? null, `${what(l.label)} sits ${px(above.gap)} under ${what(above.above)} and ${px(l.gap)} above its questions; it belongs to the questions under it`);
  }
  return problems;
}

/** Checks 3 and 4: rows, answer spaces and numbers lined up; one number style. */
function alignmentProblems(page: DraftPage, c: DayContent, measured: Measured, plan: PagePlan): FitProblem[] {
  const T = LAYOUT_TOLERANCE;
  const problems: FitProblem[] = [];
  const fail = (question: number | null, reason: string) => problems.push({ question, slot: question ? slotOf(c, question) : null, reason: `${where(page, c)}: ${reason}` });
  const line = (name: string) => { const m = measured.get(name); return shown(m) ? m.firstLine : undefined; };
  // 4: one number style, each number on its sentence's baseline.
  const fonts = new Map<string, number[]>();
  for (const q of page.questions) {
    const number = measured.get(`number-${q.number}`);
    if (!shown(number) || !number.font) continue;
    fonts.set(number.font, [...(fonts.get(number.font) ?? []), q.number]);
    const own = line(`number-${q.number}`), text = line(`question-${q.number}-content`);
    if (own && text && Math.abs(own.baseline - text.baseline) > T.baseline) {
      fail(q.number, `question ${q.number}'s number sits ${px(Math.abs(own.baseline - text.baseline))} ${own.baseline < text.baseline ? "above" : "below"} its sentence's baseline`);
    }
  }
  if (fonts.size > 1) {
    const [main] = [...fonts].sort((a, b) => b[1].length - a[1].length);
    for (const [font, qs] of fonts) if (font !== main[0]) fail(qs[0], `question ${qs.join(", ")}'s number is in ${font}; the page's other numbers are in ${main[0]}`);
  }
  // 3: the questions of each printed row (the template's grid, however they printed) share their numbers' and first
  // lines' baselines.
  for (const row of plan.rows) {
    for (const part of ["number", "content"] as const) {
      const lines = row.flatMap((n) => { const l = line(part === "number" ? `number-${n}` : `question-${n}-content`); return l ? [{ n, l }] : []; });
      if (lines.length < 2) continue;
      const base = lines.map((x) => x.l.baseline);
      if (Math.max(...base) - Math.min(...base) > T.baseline) {
        fail(lines[1].n, `questions ${lines.map((x) => x.n).join(" and ")} share a row, but their ${part === "number" ? "numbers" : "first lines"} are ${px(Math.max(...base) - Math.min(...base))} apart`);
      }
    }
  }
  // 3: each answer region the template prints beside a question's first line (by its role) sits at that line, and the
  // answers end at the column's edge the template gives (the question's right edge less a card's border and padding);
  // a unit word after a box ends there instead.
  for (const [n, at] of plan.beside) {
    const text = line(`question-${n}-content`);
    const el = measured.get(`question-${n}`);
    if (!text || !shown(el)) continue;
    const regions = at.regions.map((name) => ({ name, m: measured.get(name) }));
    const missing = regions.find((r) => !shown(r.m));
    if (missing) { fail(n, `question ${n}'s answer space ${missing.name} is not printed beside it`); continue; }
    for (const { m: r } of regions as { m: MeasuredElement }[]) {
      if (at.align === "centre") {
        const centre = r.y + r.height / 2 - (text.y + text.height / 2);
        if (Math.abs(centre) > T.top) fail(n, `question ${n}'s answer box is ${px(Math.abs(centre))} ${centre < 0 ? "above" : "below"} the middle of its line`);
      } else if (r.firstLine) {
        const d = r.firstLine.baseline - text.baseline;
        if (Math.abs(d) > T.baseline) fail(n, `question ${n}'s "${r.text.split(/\s+/)[0]}" sits ${px(Math.abs(d))} ${d < 0 ? "above" : "below"} its first line`);
      } else if (Math.abs(r.y - text.y) > T.top) fail(n, `question ${n}'s answer box starts ${px(Math.abs(r.y - text.y))} ${r.y < text.y ? "above" : "below"} its first line`);
    }
    const units = [...measured].filter(([name, m]) => name.startsWith(`unit-${n}-`) && shown(m)).map(([, m]) => m);
    const right = Math.max(...[...regions.map((r) => r.m!), ...units].map((m) => m.x + m.width));
    const edge = el.x + el.width - at.inset;
    if (Math.abs(edge - right) > T.edge) fail(n, `question ${n}'s answer space ends ${px(Math.abs(edge - right))} ${right < edge ? "short of" : "past"} its column's edge`);
  }
  return problems;
}

/** Check 7: no line of printed text is cut by a box. */
function clippingProblems(page: DraftPage, c: DayContent, measured: Measured): FitProblem[] {
  const problems: FitProblem[] = [];
  for (const [name, m] of measured) {
    if (!shown(m) || !m.clip || !m.firstLine || name === "sheet") continue;
    // (A box that holds marked text is measured with it: report the innermost.)
    if (/^(?:block|slot-content|frame|panel|scan-|chip-\d+$)/.test(name)) continue;
    const T = LAYOUT_TOLERANCE, h = m.firstLine.height;
    if (m.clip.top > T.clipTop * h || m.clip.bottom > T.clipBottom * h || m.clip.left > T.clipSide || m.clip.right > T.clipSide) {
      const q = /^(?:question|number|region)-(\d+)/.exec(name);
      problems.push({ question: q ? Number(q[1]) : null, slot: q ? slotOf(c, Number(q[1])) : null, reason: `${where(page, c)}: the text "${m.text.slice(0, 30)}" is cut by its box` });
    }
  }
  return problems;
}

/** Check 6 on a printed page: a sentence of an instruction line printed twice (the page's instruction, a chip's note). */
function measuredRepeat(page: DraftPage, c: DayContent, measured: Measured): FitProblem[] {
  const texts = [...measured].filter(([name, m]) => shown(m) && /^(?:slot-subtitle|slot-grown-up|chipnote-|note-)/.test(name)).map(([, m]) => m.text);
  const repeat = repeatedInstruction(texts);
  return repeat ? [{ question: null, slot: null, reason: `${where(page, c)}: "${repeat}" is printed twice on the page` }] : [];
}

/** The sentences of a line of text, for comparing ("Read how it works, then try it." → "read how it works then try it"). */
const sentences = (t: string) => t.split(/(?<=[.!?])\s+/).map((s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()).filter((s) => s.split(" ").length >= 3);

/** Check 6: the first sentence (of three words or more) the lines print twice, in one line or in two; or null. */
export function repeatedInstruction(lines: readonly (string | null | undefined)[]): string | null {
  const seen = new Set<string>();
  for (const line of lines) {
    for (const s of sentences(line ?? "")) {
      if (seen.has(s)) return s;
      seen.add(s);
    }
  }
  return null;
}

/** The questions of a page a child circles an answer on (true or false, yes or no, a choice), warm-up facts aside. */
export const circled = (questions: readonly { package: QuestionPackage | null; place?: string | null }[]) =>
  questions.filter((q) => q.package && q.place !== "warm-up" && (q.package.item?.regions ?? []).some((r) => r.kind === "choice" && r.mark !== "tick"));

type ChoiceQuestions = readonly { package: QuestionPackage | null; place?: string | null }[];

/** Spot the error prints yes/no even when its region uses tick marks. Other tick choices have their own labels. */
function choiceKinds(questions: ChoiceQuestions): string[] {
  const kinds = new Set(questions.filter(q => q.package && q.place !== "warm-up").flatMap(q =>
    (q.package!.item?.regions ?? []).flatMap(r => {
      if (r.kind !== "choice") return [];
      const pair = r.choices.map(c => c.trim().toLowerCase()).sort().join(",");
      return pair === "false,true" ? ["true or false"] : pair === "no,yes" ? ["yes or no"] : r.mark !== "tick" ? ["your answer"] : [];
    })));
  return ["true or false", "yes or no", "your answer"].filter(kind => kinds.has(kind));
}

/** Name each printed choice kind, keeping the existing wording for a single kind. */
export function choiceInstruction(questions: ChoiceQuestions): string | null {
  const kinds = choiceKinds(questions);
  if (!kinds.length) return null;
  // (More than one kind: one short line. "Circle true or false, or another answer." wrapped and stopped U4's Day 10
  // review pages filling, 14 questions to 8, Codex on #633.)
  return kinds.length === 1 ? `Circle ${kinds[0]}.` : "Circle your answers.";
}

/** Check 5: every circled page says "circle" and names each printed choice kind (true or false, yes or no, any other). */
export function circleProblem(content: DayContent | null | undefined, questions: readonly { package: QuestionPackage | null; place?: string | null }[]): string | null {
  if (!content) return null;
  const instruction = content.subtitle ?? "";
  // (A warm-up page names no choice: each choice question prints its own cue, isWarmUpPage.)
  const warmUp = isWarmUpPage(content);
  if (content.level === 16 && content.consistentLayout) {
    const expected = answerInstruction(questions, !warmUp);
    // (A warm-up's instruction says what it is first: "A warm-up on things you learned before. Do every question.")
    return instruction === expected || instruction.startsWith(`${expected} `) || instruction.endsWith(` ${expected}`) ? null
      : "the page instruction does not match its boxed, circled and ticked answers";
  }
  if (warmUp) return null;
  if (circled(questions).length && !/\bcircle\b/i.test(instruction)) return "the page has a question to circle, but its instruction does not say to circle";
  // (Every kind, other choices too: "Circle true or false" on a page that also prints never/sometimes/always passed,
  // Codex on #633.)
  const kinds = choiceKinds(questions);
  // A page with more than one kind says "Circle your answers." (each kind is then a choice to circle).
  if (kinds.length > 1) return /\bcircle\s+your\s+answers\b/i.test(instruction) ? null : `the page prints ${kinds.join(", ")}, but its instruction does not say "Circle your answers."`;
  const missing = kinds.find(kind => kind === "true or false"
    ? !/\b(?:true\s+or\s+false|false\s+or\s+true)\b/i.test(instruction)
    : kind === "yes or no" ? !/\b(?:yes\s+or\s+no|no\s+or\s+yes)\b/i.test(instruction)
    : !/\b(?:your|another)\s+answer\b/i.test(instruction));
  return missing ? `the page prints ${missing}, but its instruction does not name ${missing}` : null;
}

/**
 * Every measured layout problem of a day page (checks 2, 3, 4, 6 and 7), with the template's plan of the page
 * (`pagePlan` in src/lib/workbook-template.ts): its printed rows and the answers it prints beside each first line. None
 * for other pages; only check 6 without line data.
 */
export function layoutProblems(page: DraftPage, measured: Measured, plan: PagePlan | null): FitProblem[] {
  const c = day(page);
  if (!c || !c.consistentLayout || !plan) return [];
  const repeat = measuredRepeat(page, c, measured);
  const work: FitProblem[] = [];
  if (page.type === "warm-up" && c.blocks.some(b => b.slot === "in-your-head" || /mental math|in your head/i.test(b.label ?? ""))) work.push({ question: null, slot: null, reason: "a warm-up prints a redundant mental-math block" });
  const area = measured.get("slot-content");
  // Check the physical cells too. A full-width row in the plan must actually span the grid.
  if (shown(area)) for (const block of c.blocks.filter(b => ["warm-up", "remember-these", "now-you", "finish-these", "on-your-own", "practice-row", "unit-b-practice", "mixed-set", "friday-5", "unit-check", "mini-test", "already-know-it"].includes(b.slot))) {
    const cells = block.items.flatMap(n => {
      const m = measured.get(`question-${n}`);
      return shown(m) ? [{ n, m }] : [];
    });
    for (const { n, m } of cells) if (m.width < area.width * .7 && !cells.some(other => other.n !== n && Math.abs(other.m.y - m.y) <= LAYOUT_TOLERANCE.top)) work.push({ question: n, slot: block.slot, reason: `the printed question grid has an empty cell beside question ${n}` });
  }
  for (const q of page.questions) {
    const need = questionWorkSpace(q.package, slotOf(c, q.number));
    if (!need) continue;
    const spaces = [measured.get(`workspace-${q.number}`), ...(q.package.item?.regions ?? []).flatMap(r => r.kind === "work" ? [measured.get(`region-${q.number}-${r.id}`)] : [])].filter(shown);
    if (!spaces.some(m => m.height >= need - .5)) work.push({ question: q.number, slot: null, reason: `question ${q.number} needs at least ${need} px of white work space` });
  }
  // (The work line under the instruction names the questions to work: the template's fit check measures it.)
  const scopedInstruction = workbookPageInstruction(page);
  if (scopedInstruction !== null && c.subtitle !== scopedInstruction)
    work.push({ question: null, slot: null, reason: "the page instruction names different answer or work regions" });
  if (/\bshow your work\b/i.test(c.subtitle) && workbookWorkLine(page))
    work.push({ question: null, slot: null, reason: "the page instruction says the work line again" });
  const all = hasLines(measured)
    ? [...spacingProblems(page, c, measured), ...alignmentProblems(page, c, measured, plan), ...clippingProblems(page, c, measured), ...repeat, ...work]
    : [...repeat, ...work];
  return all.map((p) => ({ ...p, kind: "layout" as const }));
}
