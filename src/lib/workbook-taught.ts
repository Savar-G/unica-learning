// Shown before used (#1214): no question may name a method pair or use a registered word (workbook-terms.ts) that an
// earlier block of the book has not shown. The ledger walks the pages in order, noting what each block shows (a teaching
// strip, or a worked example or Watch one panel of a step); a question that reaches a method or a word first is a book
// issue that carries the strip to print above its block (the whole-book repair attaches it, withIntros). Only the levels
// with a family are checked: U10 and U19. Pure TypeScript: no network, database, clock or randomness.
import type { GeneratedPage } from "./workbook-generator";
import type { Intro, PageContent } from "./workbook-page";
import type { QuestionPackage } from "./question-package";
import type { BookIssue } from "./workbook-quality";
import { methodIntro, pairKey, taskText } from "./workbook-intro-examples";
import { termsIntro, TERMS } from "./workbook-terms";
import { TWO_WAYS_LEVELS, twoWaysByKind, twoWaysMethods } from "./workbook-two-ways";

export { writtenTwoWaysProblem } from "./workbook-two-ways";

/** The levels whose books are checked (Cedric, 2026-11-21: the levels of the current families). */
export const ENFORCED_LEVELS: ReadonlySet<number> = TWO_WAYS_LEVELS;
/** The panels that teach a step. */
const TEACHING = new Set(["worked-example", "watch-one"]);

/** What the book has shown so far: method pairs and words by id, and the steps whose worked example or Watch one came. */
interface Ledger { methods: Set<string>; words: Set<string>; taught: Set<string> }
const emptyLedger = (): Ledger => ({ methods: new Set(), words: new Set(), taught: new Set() });
type Asked = { n: number; text: string; templateId: string | null; operation: QuestionPackage["operation"]; level: number };

/** The strips a block's questions need beyond what the ledger holds (and the ledger takes them), with why; and the questions that have no pair. */
function needs(ledger: Ledger, slot: string, asked: readonly Asked[], taken: ReadonlySet<string>): { strips: Intro[]; reasons: string[]; noPair: Asked[] } {
  const strips: Intro[] = [], reasons: string[] = [], noPair: Asked[] = [];
  if (slot === "solve-it-two-ways") for (const q of asked) {
    const pair = twoWaysMethods(q);
    if (!pair && twoWaysByKind(q)) noPair.push(q);
    if (!pair || ledger.methods.has(pairKey(pair))) continue;
    const strip = methodIntro(pair, (q.text.match(/\d+/g) ?? []).map(Number), taken);
    if (!strip) continue;
    strips.push(strip);
    ledger.methods.add(pairKey(pair));
    reasons.push(`question ${q.n} names "${pair[0]}" and "${pair[1]}" before the book shows them`);
  }
  const missing = TERMS.filter((t) => !ledger.words.has(t.id) && !ledger.taught.has(t.taughtBy) && asked.some((q) => t.pattern.test(q.text)));
  if (missing.length) {
    strips.push(termsIntro(missing));
    for (const t of missing) ledger.words.add(t.id);
    reasons.push(`a question uses ${missing.map((t) => `"${t.term}"`).join(", ")} before the book teaches it`);
  }
  return { strips, reasons, noPair };
}

/** The book's issues of methods and words used before they are shown, each with the strips that fix it (`levels`: an audit may count other levels). */
export function introIssues(pages: readonly GeneratedPage[], levels: ReadonlySet<number> = ENFORCED_LEVELS): BookIssue[] {
  // (A lone page is not a book: the page-fit checks run the quality check on one page at a time.)
  if (!pages.some((p) => p.type === "cover")) return [];
  const ledger = emptyLedger();
  const issues: BookIssue[] = [];
  // (An example's answer is printed: no other question of the book may be the example's task.)
  const taken = new Set(pages.flatMap((p) => p.questions.flatMap((q) => (q.package ? [taskText(q.package.text)] : []))));
  for (const p of [...pages].sort((a, b) => a.number - b.number)) {
    const c = p.content;
    if (c?.kind !== "day") continue;
    c.blocks.forEach((b, i) => {
      const asked = b.items.flatMap((n) => { const q = p.questions.find((x) => x.number === n)?.package; return q ? [{ ...q, n }] : []; });
      const keys = new Set(b.slot === "solve-it-two-ways" ? asked.flatMap((q) => { const pair = twoWaysMethods(q); return pair ? [pairKey(pair)] : []; }) : []);
      // A planned strip whose pair no question here uses (the plan guessed a writer's question): replaced if one is needed.
      const unused = (b.intro ?? []).filter((s) => s.kind === "methods" && !s.ids.some((id) => keys.has(id)));
      for (const intro of b.intro ?? []) if (!unused.includes(intro)) for (const id of intro.ids) (intro.kind === "methods" ? ledger.methods : ledger.words).add(id);
      if (b.step && TEACHING.has(b.slot)) ledger.taught.add(b.step);
      if (!levels.has(c.level)) return;
      const { strips, reasons, noPair } = needs(ledger, b.slot, asked, taken);
      const replace = strips.some((s) => s.kind === "methods") ? unused : [];
      for (const intro of unused) if (!replace.includes(intro)) for (const id of intro.ids) ledger.methods.add(id);
      for (const q of noPair) issues.push({ page: p.number, kind: "coverage", reason: `question ${q.n} asks for 2 ways but has no two methods of its kind ("${q.text}")` });
      if (strips.length) issues.push({ page: p.number, kind: "intro", reason: reasons.join("; "), fix: { block: i, intro: strips, ...(replace.length ? { drop: replace.flatMap((s) => s.ids) } : {}) } });
    });
  }
  return issues;
}

/** A page of the plan, as far as the strips need it (the generator's PageWork fits it). */
export interface PlannedWork {
  number: number;
  slots: readonly { layoutSlot: number; place: string | null; contract?: unknown }[];
  layout: { slots: readonly { slot: string; part: number }[] } | null;
  page: { parts: readonly { step?: { skill: string; step: number } | null }[] };
}

/** The strips planned for each page, by layout slot: measured with the page, so the capacity stage leaves room for them. */
const planned = new WeakMap<object, { layoutSlot: number; intro: Intro }[]>();

/** A page's content with its planned strips on their blocks (`keep`: the layout slots the page prints, in order). */
export function withPlanned<C extends PageContent | null>(content: C, work: object, keep: readonly number[]): C {
  if (content?.kind !== "day") return content;
  for (const p of planned.get(work) ?? []) {
    const block = content.blocks[keep.indexOf(p.layoutSlot)];
    if (block) block.intro = [...(block.intro ?? []), p.intro];
  }
  return content;
}

/**
 * Plans the strips of a book before its pages are written, from the tasks its capacity plan chose (`packageOf`: a slot's
 * planned question, or null for one the writer will write): the strips take room, and a page that has none for them must
 * fit fewer questions. A question that differs when written is caught by the whole-book check (introIssues).
 */
export function planIntros<W extends PlannedWork>(work: readonly W[], level: number, packageOf: (w: W, slot: W["slots"][number]) => QuestionPackage | null): void {
  const ledger = emptyLedger();
  const taken = new Set(work.flatMap((w) => w.slots.flatMap((s) => { const q = packageOf(w, s); return q ? [taskText(q.text)] : []; })));
  for (const w of [...work].sort((a, b) => a.number - b.number)) {
    planned.delete(w);
    for (const [k, x] of (w.layout?.slots ?? []).entries()) {
      const step = w.page.parts[x.part]?.step;
      if (step && TEACHING.has(x.slot)) ledger.taught.add(`${step.skill}#${step.step}`);
      if (!ENFORCED_LEVELS.has(level)) continue;
      const slots = w.slots.filter((s) => s.layoutSlot === k);
      // (A Use 2 ways question the writer will write: the likeliest pair reserves the room; the repair swaps it if it differs.)
      const guess: Asked = { n: 1, text: "47 + 28 = ?", templateId: null, operation: null, level };
      const asked = slots.flatMap((s, n) => { const q = packageOf(w, s); return q ? [{ ...q, n: n + 1 }] : x.slot === "solve-it-two-ways" ? [guess] : []; });
      // (Methods only: a word's strip is the whole-book repair's, so a page that has no room for it is reported, never a capacity error.)
      const strips = needs(ledger, x.slot, asked, taken).strips.filter((t) => t.kind === "methods");
      if (strips.length) planned.set(w, [...(planned.get(w) ?? []), ...strips.map((intro) => ({ layoutSlot: k, intro }))]);
    }
  }
}

/** A page's content with the strips its intro issues carry attached to their blocks. */
export function withIntros(content: PageContent | null, issues: readonly BookIssue[]): PageContent | null {
  if (content?.kind !== "day") return content;
  for (const issue of issues) {
    const block = issue.fix ? content.blocks[issue.fix.block] : undefined;
    const drop = issue.fix?.drop ?? [];
    if (issue.fix && block) block.intro = [...(block.intro ?? []).filter((s) => !s.ids.some((id) => drop.includes(id))), ...issue.fix.intro];
  }
  return content;
}
