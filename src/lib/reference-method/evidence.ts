import {
  EXAMPLE_MARK_KINDS,
  EXAMPLE_POSITIONS,
  EXAMPLE_RELATIONS,
  EXAMPLE_STEP_KINDS,
  EXPR_KINDS,
  ITEM_FORMS,
  NOT_STATED,
  SCAFFOLD_KINDS,
  type NotStated,
  type ScaffoldKind,
} from "@/lib/reference-record";
import { isPlainObject } from "@/lib/reference-record/validate-parts";
import { canonicalSha256 } from "./canonical";
import { comparePages, pageRefOf, type PageId } from "./identity";
import { placePages, type EvidenceInput, type PlacedPage } from "./placement";
import { stepId, stepOf, unknownStepId } from "./steps";
import { knownOr, trustedView } from "./trusted";
import {
  TEACHING_SCAFFOLD_KINDS,
  type ExampleFact,
  type FormatChangeFact,
  type MachineReadMark,
  type ScaffoldFact,
  type SheetFact,
  type StepFact,
  type StepFeatures,
  type TopicEvidence,
  type TopicGap,
} from "./types";

export type { EvidenceInput };

export type BuiltEvidence =
  | { ok: true; evidence: TopicEvidence; views: Map<string, Record<string, unknown>> }
  | { ok: false; problems: string[] };

// Everything that code takes from one page.
interface PageReading {
  ref: string;
  id: PageId;
  questions: number | NotStated;
  // Step id of each question, in order.
  questionSteps: string[];
  features: Map<string, StepFeatures | NotStated>;
  shown: Set<string>;
  // An example or scaffold that code cannot match to a step.
  unmatched: boolean;
  formats: string[] | NotStated;
  examples: ExampleFact[];
  examplesKnown: boolean;
  scaffolds: Set<ScaffoldKind>;
  scaffoldsKnown: boolean;
}

function listOf(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function readPage(page: PlacedPage, view: Record<string, unknown>): PageReading {
  const ref = page.record.source_ref;
  const unknown = unknownStepId(ref);
  const out: PageReading = {
    ref,
    id: page.id,
    questions: 0,
    questionSteps: [],
    features: new Map(),
    shown: new Set(),
    unmatched: false,
    formats: [],
    examples: [],
    examplesKnown: true,
    scaffolds: new Set(),
    scaffoldsKnown: true,
  };
  const formats = new Set<string>();
  let count = 0;
  let itemsKnown = true;
  let formatsKnown = true;
  let unknownQuestions = 0;
  let unknownCovered = 0;
  const addUnknownItems = (): void => {
    itemsKnown = false;
    out.features.set(unknown, NOT_STATED);
    unknownQuestions += 1;
  };

  const sections = listOf(view.sections);
  if (!sections) {
    addUnknownItems();
    out.scaffoldsKnown = false;
    out.unmatched = true;
  }
  for (const section of sections ?? []) {
    if (!isPlainObject(section)) {
      addUnknownItems();
      out.scaffoldsKnown = false;
      out.unmatched = true;
      continue;
    }
    // Step id of each question of this section; null: code cannot tell the step.
    const inSection: Array<{ n: unknown; id: string | null }> = [];
    const items = listOf(section.items);
    if (!items) {
      addUnknownItems();
      inSection.push({ n: null, id: null });
    }
    for (const item of items ?? []) {
      if (!isPlainObject(item) || (item.expr !== null && !isPlainObject(item.expr))) {
        addUnknownItems();
        inSection.push({ n: null, id: null });
        continue;
      }
      if (item.expr === null) continue;
      count += 1;
      const kind = knownOr((item.expr as Record<string, unknown>).kind, EXPR_KINDS);
      const form = knownOr(item.form, ITEM_FORMS);
      if (kind === NOT_STATED || form === NOT_STATED) formatsKnown = false;
      else formats.add(`${kind} ${form}`);
      const step = stepOf(item.expr, item.form);
      const id = step ? stepId(step) : unknown;
      if (!step) unknownQuestions += 1;
      out.features.set(id, step ?? NOT_STATED);
      out.questionSteps.push(id);
      inSection.push({ n: item.n, id: step ? id : null });
    }

    const scaffolds = listOf(section.scaffolds);
    if (!scaffolds) {
      out.scaffoldsKnown = false;
      out.unmatched = true;
    }
    const covered = new Set<number>();
    for (const scaffold of scaffolds ?? []) {
      const kind = knownOr(isPlainObject(scaffold) ? scaffold.kind : undefined, SCAFFOLD_KINDS);
      if (kind === NOT_STATED || !isPlainObject(scaffold)) {
        out.scaffoldsKnown = false;
        out.unmatched = true;
        continue;
      }
      out.scaffolds.add(kind);
      if (kind === "other") out.unmatched = true;
      if (!TEACHING_SCAFFOLD_KINDS.includes(kind)) continue;
      const appliesTo = scaffold.applies_to;
      const list = listOf(appliesTo);
      if (appliesTo !== "all" && !list) {
        out.unmatched = true;
        continue;
      }
      inSection.forEach((question, i) => {
        if (list && !list.includes(question.n)) return;
        if (question.id === null) covered.add(i);
        else out.shown.add(question.id);
      });
    }
    unknownCovered += covered.size;
  }

  const examples = listOf(view.examples);
  if (!examples) {
    out.examplesKnown = false;
    out.unmatched = true;
  }
  let unknownExample = false;
  for (const example of examples ?? []) {
    if (!isPlainObject(example)) {
      out.examplesKnown = false;
      out.unmatched = true;
      continue;
    }
    const parts = (listOf(example.parts) ?? [NOT_STATED]).map((part) => (isPlainObject(part) ? part : {}));
    for (const part of parts) {
      const step = stepOf(part.expr, part.form);
      if (step) {
        const id = stepId(step);
        out.features.set(id, step);
        out.shown.add(id);
      } else {
        unknownExample = true;
        out.unmatched = true;
      }
    }
    out.examples.push({
      page: ref,
      position: knownOr(example.position, EXAMPLE_POSITIONS),
      relation: knownOr(example.relation, EXAMPLE_RELATIONS),
      forms: parts.map((part) => knownOr(part.form, ITEM_FORMS)),
      expr_kinds: parts.map((part) => knownOr(isPlainObject(part.expr) ? part.expr.kind : undefined, EXPR_KINDS)),
      steps_shown: kindsOf(example.steps, "shows", EXAMPLE_STEP_KINDS),
      marks: kindsOf(example.marks, "kind", EXAMPLE_MARK_KINDS),
    });
  }
  // Code cannot match an example to a question whose step it cannot tell, so the page is the unit:
  // such an example on the page, or teaching scaffolds on all of these questions, show the step.
  if (unknownQuestions > 0 && (unknownExample || unknownCovered === unknownQuestions)) out.shown.add(unknown);

  out.questions = itemsKnown ? count : NOT_STATED;
  out.formats = itemsKnown && formatsKnown ? [...formats].sort() : NOT_STATED;
  return out;
}

function kindsOf<T extends string>(value: unknown, field: string, allowed: readonly T[]): Array<T | NotStated> | NotStated {
  const list = listOf(value);
  return list ? list.map((entry) => knownOr(isPlainObject(entry) ? entry[field] : undefined, allowed)) : NOT_STATED;
}

export function buildEvidence(input: EvidenceInput): BuiltEvidence {
  const placed = placePages(input);
  if (!placed.ok) return placed;
  const { placement } = placed;
  const views = new Map<string, Record<string, unknown>>();
  const readings: PageReading[] = [];
  const machineRead = new Set<string>();
  for (const page of placement.pages) {
    if (!page.used) continue;
    const ref = page.record.source_ref;
    const view = trustedView(page.record);
    views.set(ref, view);
    readings.push(readPage(page, view));
    if (page.status === "machine_read") machineRead.add(ref);
  }
  const mark = (refs: Iterable<string>): MachineReadMark => {
    const marked = [...new Set(refs)].filter((ref) => machineRead.has(ref));
    return marked.length > 0 ? { machine_read: marked } : {};
  };
  const order = new Map(placement.pages.map((p) => [p.record.source_ref, p.id]));
  const inOrder = (refs: Iterable<string>): string[] =>
    [...new Set(refs)].sort((a, b) => comparePages(order.get(a) as PageId, order.get(b) as PageId));

  // Pages of the topic that give no facts: no photo, or withheld.
  const blank = [
    ...(placement.missing === NOT_STATED ? [] : placement.missing),
    ...placement.pages.filter((p) => !p.used).map((p) => p.id),
  ];
  const between = (from: PageId, to: PageId | null, unknown: PageId[]): string[] =>
    [...blank, ...unknown]
      .filter((id) => comparePages(id, from) > 0 && (to === null || comparePages(id, to) < 0))
      .sort(comparePages)
      .map((id) => pageRefOf(input.key, id.sheet, id.side));

  const steps = new Map<string, StepFact>();
  for (const reading of readings) {
    for (const [id, features] of reading.features) {
      const fact = steps.get(id) ?? { id, features, pages: [], shown_on: [] };
      fact.pages.push(reading.ref);
      steps.set(id, fact);
    }
    for (const id of reading.shown) steps.get(id)?.shown_on.push(reading.ref);
  }
  const stepFacts = [...steps.values()].map((fact): StepFact => ({
    ...fact,
    pages: inOrder(fact.pages),
    shown_on: inOrder(fact.shown_on),
    ...mark(fact.pages),
  }));
  const unmatched = new Set(readings.filter((r) => r.unmatched).map((r) => r.ref));
  const gaps = stepFacts
    .filter((fact) => fact.shown_on.length === 0)
    .map((fact): TopicGap => ({
      step: fact.id,
      kind: fact.features === NOT_STATED ? "step_not_known" : "no_method",
      pages: fact.pages,
      check_pages: fact.pages.filter((ref) => unmatched.has(ref)),
      ...mark(fact.pages),
    }));

  const scaffolds = SCAFFOLD_KINDS.flatMap((kind): ScaffoldFact[] => {
    const on = readings.filter((r) => r.scaffolds.has(kind));
    const last = on.at(-1);
    if (!last) return [];
    const unknown = readings.filter((r) => !r.scaffoldsKnown && !r.scaffolds.has(kind)).map((r) => r.id);
    const pages = on.map((r) => r.ref);
    return [{ kind, pages, last_page: last.ref, not_known_after: between(last.id, null, unknown), ...mark(pages) }];
  });

  const formatChanges: FormatChangeFact[] = [];
  const unknownFormats = readings.filter((r) => r.formats === NOT_STATED).map((r) => r.id);
  let previous: PageReading | undefined;
  for (const reading of readings) {
    // A page with no question prints no question format.
    if (reading.formats === NOT_STATED || reading.formats.length === 0) continue;
    if (previous && previous.formats !== NOT_STATED && previous.formats.join() !== reading.formats.join()) {
      formatChanges.push({
        from: previous.ref,
        to: reading.ref,
        before: previous.formats,
        after: reading.formats,
        not_known_between: between(previous.id, reading.id, unknownFormats),
        ...mark([previous.ref, reading.ref]),
      });
    }
    previous = reading;
  }

  return {
    ok: true,
    views,
    evidence: {
      include_machine_read: input.includeMachineRead,
      contents: {
        ref: placement.contents.source_ref,
        status: placement.contentsStatus,
        sha256: canonicalSha256(placement.contents),
      },
      topic: {
        title: placement.title,
        sheet_range: placement.sheetRange,
        std_time_min: placement.stdTimeMin,
        ...(placement.contentsStatus === "machine_read" ? { machine_read: [placement.contents.source_ref] } : {}),
      },
      pages: placement.pages.map((page) => ({
        ref: page.record.source_ref,
        status: page.status,
        sha256: canonicalSha256(page.record),
        facts: page.used ? "used" : "withheld",
        ...(page.titleDiffers ? { printed_title_differs: true as const } : {}),
      })),
      pages_without_photo:
        placement.missing === NOT_STATED
          ? NOT_STATED
          : placement.missing.map((id) => pageRefOf(input.key, id.sheet, id.side)),
      unplaced_pages: placement.unplaced,
      sheets: readings.map((r): SheetFact => ({
        page: r.ref,
        questions: r.questions,
        steps: [...new Set(r.questionSteps)].map((id) => ({
          id,
          questions: r.questionSteps.filter((other) => other === id).length,
        })),
        ...mark([r.ref]),
      })),
      steps: stepFacts,
      examples: readings.flatMap((r) => r.examples.map((example) => ({ ...example, ...mark([r.ref]) }))),
      examples_not_known: readings.filter((r) => !r.examplesKnown).map((r) => r.ref),
      scaffolds,
      format_changes: formatChanges,
      gaps,
    },
  };
}
