import { type AnswerValue, type Operation } from "@/lib/question-package";
import type { AiItem, AiOperation, AiValue } from "@/lib/workbook-generator-items";
import { figureCount } from "@/lib/question-package-items";
import type { GeneratedQuestion } from "@/lib/workbook-generator";

const value = (v: AnswerValue | number): AiValue => ({ value: null, numerator: null, denominator: null,
  whole: null, unit: null, hours: null, minutes: null, period: null, parts: [], text: null,
  ...(typeof v === "number" ? { type: "number", value: v } : v),
} as AiValue);
const operation = (op: Operation): AiOperation => ({ kind: op.kind,
  operands: op.kind === "solve" || op.kind === "evaluate" ? [] : op.operands.map((v) => value(v)),
  expression: op.kind === "solve" || op.kind === "evaluate" ? op.operands[0] : null,
  unit: "unit" in op ? op.unit ?? null : null, denominator: "denominator" in op ? op.denominator : null,
  values: "values" in op ? Object.entries(op.values ?? {}).map(([name, value]) => ({ name, value })) : [],
});

/** Data for the form and AI. Answers and worked steps are outputs, never editable inputs. */
export function workbookEditItem(q: GeneratedQuestion): AiItem | null {
  const p = q.package;
  if (!p) return null;
  const item: AiItem = { slot: q.slot, skill: p.skill.skills[0], difficulty: p.difficulty,
    text: p.text, format: (p.item?.format ?? "write-number") as AiItem["format"],
    operation: p.operation ? operation(p.operation) : null,
    wrongAnswers: p.wrongAnswers.map((w) => ({ ...w, value: value(w.value) })),
    easier: p.easierExample ? { text: p.easierExample.text, operation: operation(p.easierExample.operation) } : null,
    shownWrong: p.item?.error ? p.wrongAnswers.findIndex((w) => JSON.stringify(w.value) === JSON.stringify(p.item!.error!.answer)) : null,
    figure: p.item?.figure?.kind === "pattern" ? null : p.item?.figure?.kind ?? null,
    figureShows: null, numbers: [], places: null, direction: null, sequence: null, pattern: null, relation: null,
    name: null, thing: null,
  };
  for (const c of p.item?.checks ?? []) {
    if (c.kind === "places") { item.numbers = [value(c.number)]; item.places = c.parts.map((x) => x.place); }
    if (c.kind === "order") { item.numbers = c.numbers.map(value); item.direction = c.direction; }
    if (c.kind === "compare") item.numbers = [value(c.left), value(c.right)];
    if (c.kind === "relation") { item.numbers = c.numbers.map(value); item.relation = { kind: c.relation, to: c.to, labels: c.labels }; }
    if (c.kind === "sequence") {
      const first = c.terms[0];
      const n = first && "region" in first ? p.item?.regions.find((r) => r.id === first.region && r.kind === "box") : null;
      const start = n?.kind === "box" ? n.answer : first;
      if (start && "type" in start) item.sequence = { start: value(start), step: value(c.step), terms: c.terms.length,
        blanks: c.terms.flatMap((t, i) => "region" in t ? [i] : []) };
    }
  }
  const f = p.item?.figure;
  if (p.operation?.kind === "missing-addend" && f) item.figureShows = figureCount(f) === p.operation.operands[1] ? "total" : "part";
  if (!p.operation && f) {
    if (f.kind === "dots") item.numbers = f.groups.map(value);
    if (f.kind === "ten-frame") item.numbers = f.counters.map(value);
    if (f.kind === "base-ten") item.numbers = [f.hundreds, f.tens, f.ones].map(value);
    if (f.kind === "array") item.numbers = [f.rows, f.columns].map(value);
    if (f.kind === "pattern") item.pattern = { core: f.core, shapes: f.length, blank: f.blank };
  }
  return item;
}
