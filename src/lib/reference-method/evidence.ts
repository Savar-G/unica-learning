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
import { canonicalJson, canonicalSha256 } from "./canonical";
import { comparePages, pageRefOf, type PageId } from "./identity";
import { placePages, statusOf, type EvidenceInput, type PlacedPage } from "./placement";
import { partlyKnown, stepId, stepOf, unknownStepId } from "./steps";
import { holdsSentinel, knownOr, trustedView } from "./trusted";
import type {
  ExampleFact,
  FormatChangeFact,
  GapHint,
  MachineReadMark,
  PartlyKnown,
  ScaffoldFact,
  SheetFact,
  StepFact,
  StepFeatures,
  TopicEvidence,
  TopicGap,
} from "./types";

export type BuiltEvidence =
  | { ok: true; evidence: TopicEvidence; views: Map<string, Record<string, unknown>> }
  | { ok: false; problems: string[] };

function listOf(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

// A list that is not known has one entry, which is not known.
function entriesOf(value: unknown): unknown[] {
  return listOf(value) ?? [NOT_STATED];
}

function placeOf(list: unknown, field: string, index: number): string {
  return Array.isArray(list) ? `${field}[${index}]` : field;
}

function fieldsOf(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
}

// Everything that code takes from one page.
function readPage(page: PlacedPage, view: Record<string, unknown>) {
  const ref = page.record.source_ref;
  // Step id of each question, in order.
  const questionSteps: string[] = [];
  const steps = new Map<string, StepFeatures | NotStated>();
  const partlyKnowns: PartlyKnown[] = [];
  // The worked examples of each step.
  const methods = new Map<string, Set<number>>();
  // steps null: code cannot tell which steps it is about.
  const hints: Array<{ hint: GapHint; steps: string[] | null }> = [];
  const formats: string[] = [];
  const examples: ExampleFact[] = [];
  const scaffolds = new Set<ScaffoldKind>();
  let itemsKnown = true;
  let formatsKnown = true;
  let examplesKnown = true;
  let scaffoldsKnown = true;
  const addHint = (at: string, kind: GapHint["kind"], about: string[] | null): void =>
    void hints.push({ hint: { page: ref, at, kind }, steps: about });

  entriesOf(view.sections).forEach((entry, si) => {
    const section = fieldsOf(entry);
    const sectionAt = placeOf(view.sections, "sections", si);
    const questions: Array<{ n: unknown; id: string }> = [];
    for (const item of entriesOf(section.items)) {
      const { n, expr, form } = fieldsOf(item);
      if (expr === null) continue;
      const known = isPlainObject(expr);
      const partly = partlyKnown(expr, form);
      const step = stepOf(expr, form);
      const id = step ? stepId(step) : unknownStepId(ref);
      steps.set(id, step ?? NOT_STATED);
      questions.push({ n, id });
      if (known) questionSteps.push(id);
      else itemsKnown = false;
      if (!step && !partlyKnowns.some((p) => canonicalJson(p) === canonicalJson(partly))) partlyKnowns.push(partly);
      const format = `${partly.expr_kind} ${partly.form}`;
      if (partly.expr_kind === NOT_STATED || partly.form === NOT_STATED) formatsKnown = false;
      else if (formats.at(-1) !== format) formats.push(format);
    }

    entriesOf(section.scaffolds).forEach((scaffold, i) => {
      const kind = knownOr(fieldsOf(scaffold).kind, SCAFFOLD_KINDS);
      if (kind === NOT_STATED) scaffoldsKnown = false;
      else scaffolds.add(kind);
      // An answer box only holds an answer.
      if (kind === "answer_boxes") return;
      const appliesTo = fieldsOf(scaffold).applies_to;
      const list = listOf(appliesTo);
      const about = questions.filter((q) => appliesTo === "all" || typeof q.n !== "number" || list?.includes(q.n));
      addHint(placeOf(section.scaffolds, `${sectionAt}.scaffolds`, i), kind, appliesTo === "all" || list ? about.map((q) => q.id) : null);
    });
  });

  entriesOf(view.examples).forEach((entry, index) => {
    const at = placeOf(view.examples, "examples", index);
    if (!isPlainObject(entry)) {
      examplesKnown = false;
      return addHint(at, "example", null);
    }
    const parts = entriesOf(entry.parts).map(fieldsOf);
    const partSteps = parts.map((part) => stepOf(part.expr, part.form));
    const ids = partSteps.map((step) => step && stepId(step));
    // Its parts and its working are trusted, and code can tell which part the working belongs to.
    const clear = !holdsSentinel([entry.parts, entry.steps]);
    // A setup line is the question written again, so it shows no method.
    const shown = listOf(entry.steps)?.some((s) => fieldsOf(s).shows !== "setup") ?? false;
    const worksOneStep = shown && new Set(ids).size === 1;
    parts.forEach((part, p) => {
      const step = partSteps[p];
      const id = ids[p];
      if (!step || !id) return addHint(at, "example", null);
      steps.set(id, step);
      if (!clear || !(worksOneStep || typeof part.shown_answer === "string")) return addHint(at, "example", [id]);
      methods.set(id, (methods.get(id) ?? new Set()).add(index));
    });
    examples.push({
      page: ref,
      position: knownOr(entry.position, EXAMPLE_POSITIONS),
      relation: knownOr(entry.relation, EXAMPLE_RELATIONS),
      forms: parts.map((part) => knownOr(part.form, ITEM_FORMS)),
      expr_kinds: parts.map((part) => knownOr(fieldsOf(part.expr).kind, EXPR_KINDS)),
      steps_shown: kindsOf(entry.steps, "shows", EXAMPLE_STEP_KINDS),
      marks: kindsOf(entry.marks, "kind", EXAMPLE_MARK_KINDS),
    });
  });

  return {
    ref,
    id: page.id,
    questions: itemsKnown ? questionSteps.length : (NOT_STATED as NotStated),
    formats: itemsKnown && formatsKnown ? formats : (NOT_STATED as NotStated),
    questionSteps,
    steps,
    partlyKnown: partlyKnowns,
    methods,
    hints,
    examples,
    examplesKnown,
    scaffolds,
    scaffoldsKnown,
  };
}

function kindsOf<T extends string>(value: unknown, field: string, allowed: readonly T[]): Array<T | NotStated> | NotStated {
  return listOf(value)?.map((entry) => knownOr(fieldsOf(entry)[field], allowed)) ?? NOT_STATED;
}

export function buildEvidence(input: EvidenceInput): BuiltEvidence {
  const placed = placePages(input);
  if (!placed.ok) return placed;
  const { placement } = placed;
  const contentsRef = placement.contents.source_ref;
  const views = new Map<string, Record<string, unknown>>();
  // In the order of the pages, so every list of pages below is in that order.
  const readings: Array<ReturnType<typeof readPage>> = [];
  for (const page of placement.pages) {
    if (!page.used) continue;
    const view = trustedView(page.record);
    views.set(page.record.source_ref, view);
    readings.push(readPage(page, view));
  }
  // Every fact rests on the contents record too, because it decides which pages belong to the topic.
  const mark = (refs: readonly string[]): MachineReadMark => {
    const marked = [contentsRef, ...refs].filter((ref) => input.includeMachineRead && statusOf(input, ref) === "machine_read");
    return marked.length > 0 ? { machine_read: [...new Set(marked)] } : {};
  };

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
    for (const [id, features] of reading.steps) {
      const partly = features === NOT_STATED ? { partly_known: reading.partlyKnown } : {};
      const fact = steps.get(id) ?? { id, features, ...partly, pages: [], methods: [] };
      fact.pages.push(reading.ref);
      for (const example of reading.methods.get(id) ?? []) fact.methods.push({ page: reading.ref, example });
      steps.set(id, fact);
    }
  }
  const stepFacts = [...steps.values()].map((fact): StepFact => ({ ...fact, ...mark(fact.pages) }));
  const gaps = stepFacts
    .filter((fact) => fact.methods.length === 0)
    .map((fact): TopicGap => ({
      step: fact.id,
      kind: fact.features === NOT_STATED ? "step_not_known" : "no_method",
      pages: fact.pages,
      hints: readings
        .filter((r) => fact.pages.includes(r.ref))
        .flatMap((r) => r.hints.filter((h) => h.steps === null || h.steps.includes(fact.id)).map((h) => h.hint))
        // Two parts of one example are one hint.
        .filter((hint, i, all) => i === 0 || canonicalJson(hint) !== canonicalJson(all[i - 1])),
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
  let previous: ReturnType<typeof readPage> | undefined;
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
      contents: { ref: contentsRef, status: statusOf(input, contentsRef), sha256: canonicalSha256(placement.contents) },
      topic: {
        title: placement.topic.title,
        sheet_range: placement.topic.sheets,
        std_time_min: placement.topic.time,
        ...mark([]),
      },
      pages: placement.pages.map((page) => ({
        ref: page.record.source_ref,
        status: page.status,
        sha256: canonicalSha256(page.record),
        facts: page.used ? "used" : "withheld",
        ...(page.titleDiffers ? { printed_title_differs: true as const } : {}),
        ...mark([page.record.source_ref]),
      })),
      pages_without_photo: {
        pages:
          placement.missing === NOT_STATED
            ? NOT_STATED
            : placement.missing.map((id) => pageRefOf(input.key, id.sheet, id.side)),
        ...mark([]),
      },
      unplaced_pages: { pages: placement.unplaced, ...mark(placement.unplaced) },
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
