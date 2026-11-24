// The input of one large book of one shape, for the production builder.
import type { BuildInput } from "../build/build-book";
import type { Side } from "../contract";
import type { PageTemplate } from "../layout/templates";
import type { Limits } from "./shape-registration";

export interface BookSpace { limits: Limits; count: number; fitting: readonly PageTemplate[] }

/** The sides of a template that a book fills, so that each place holds a question. */
const sideKey = (template: PageTemplate, side: Side): string => `${template.id}, ${side} side`;
const SIDES: readonly Side[] = ["front", "back"];

/** Two sides ask for 16 questions. With fewer than two sheets of them, the build must try many times for each place. */
const FEW_QUESTIONS = 32;

/**
 * Enough sheets for the seeds and for all limits, each side with the next limits. The first use of a side of a template fills it. A shape
 * with few questions gets few sheets, and each fills one side only.
 */
export function sampleBook(shapeId: string, spaces: readonly BookSpace[], seeds: number): { input: BuildInput; unfilled: string[] } {
  const order = [...spaces].sort((a, b) => b.count - a.count);
  const filled = new Set<string>();
  const few = (order[0]?.count ?? 0) < FEW_QUESTIONS;
  const templates = order[0]?.fitting ?? [];
  const side = (name: Side, index: number, sheet: number) => {
    const { limits, count, fitting } = order[index % order.length];
    const template = fitting[(few ? sheet >> 1 : sheet) % fitting.length];
    if (!template) throw new Error(`no template fits the widest question of ${JSON.stringify(limits)}`);
    const key = sideKey(template, name);
    const room = template.sides[name].places.length;
    const isOther = few && (sheet % 2 === 0) !== (name === "front");
    const items = isOther ? 1 : filled.has(key) ? Math.min(room, count) : room;
    if (items === room) filled.add(key);
    const each = Math.min(room, count);
    const rows = Array.from({ length: Math.ceil(items / each) }, (_, i) => ({ id: `${name}-${i}`, shape: shapeId, limits, items: Math.min(each, items - i * each) }));
    return { instruction: "Work it out.", template: template.id, rows };
  };
  const ids = Array.from({ length: Math.max(Math.ceil(order.length / 2), few ? 2 * templates.length + 2 : Math.ceil(seeds / 16), 1) }, (_, i) => `sheet-${i}`);
  const sheets = ids.map((id, i) => ({ id, firstPage: 2 * i + 1, front: side("front", 2 * i, i), back: side("back", 2 * i + 1 + Math.floor((2 * i) / order.length), i) }));
  const snapshot = { format: 1, id: "harness", level: { id: "level", name: "1" }, topics: [{ id: "topic", code: "1-1", title: "Harness", sheets: ids }], sheets };
  const book = { bookId: "book", childId: "child", sheets: ids.map((sheetId, i) => ({ sheetId, attempt: 1 + (i % 3), qr: { front: `f${i}`, back: `b${i}` } })) };
  const wanted = templates.flatMap((template) => SIDES.map((name) => sideKey(template, name)));
  return { input: { snapshot, book }, unfilled: wanted.filter((key) => !filled.has(key)) };
}
