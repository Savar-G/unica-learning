// The input of one large book of one shape, for the production builder.
import type { BuildInput } from "../build/build-book";
import type { PageModel, Side } from "../contract";
import type { PageTemplate } from "../layout/templates";
import type { Limits } from "./shape-registration";

export interface BookSpace { limits: Limits; count: number; fitting: readonly PageTemplate[] }
/** One side of a sheet, before it is written down. */
interface BookSide { space: BookSpace; template: PageTemplate; items: number }
type BookSheet = [front: BookSide, back: BookSide];

/** Two sides ask for 16 questions. With fewer than two sheets of them, the build must try many times for each place. */
const FEW_QUESTIONS = 32;

const SIDES: readonly Side[] = ["front", "back"];
const isFew = ({ count }: BookSpace): boolean => count < FEW_QUESTIONS;
/** A sheet with one full side: the other side has one question. */
const withOneFull = ([front, back]: BookSheet, full: Side): BookSheet => (full === "front" ? [front, { ...back, items: 1 }] : [{ ...front, items: 1 }, back]);
const roomOf = (template: PageTemplate, name: Side): number => template.sides[name].places.length;

/**
 * First each side of each template that fits any limits, with a question in each place. Then enough sheets for the seeds
 * and for all limits, the largest first. With few questions a sheet has a full side and a side with one question.
 */
export function sampleBook(shapeId: string, spaces: readonly BookSpace[], seeds: number): BuildInput {
  const order = [...spaces].sort((a, b) => b.count - a.count);
  const templates = [...new Map(order.flatMap((s) => s.fitting).map((t) => [t.id, t])).values()];
  const targets = templates.flatMap((template) => {
    const space = order.find((s) => s.fitting.some((t) => t.id === template.id)) ?? order[0];
    const full = (name: Side): BookSide => ({ space, template, items: roomOf(template, name) });
    const sheet: BookSheet = [full("front"), full("back")];
    return isFew(space) ? SIDES.map((name) => withOneFull(sheet, name)) : [sheet];
  });

  const few = order.length > 0 && isFew(order[0]);
  const next = (name: Side, index: number, sheet: number): BookSide => {
    const space = order[index % order.length];
    const template = space.fitting[(few ? sheet >> 1 : sheet) % space.fitting.length];
    if (!template) throw new Error(`no template fits the widest question of ${JSON.stringify(space.limits)}`);
    return { space, template, items: Math.min(roomOf(template, name), space.count) };
  };
  const rounds = Math.max(Math.ceil(order.length / 2), few ? 2 : Math.ceil(seeds / 16) - targets.length);
  const rest = Array.from({ length: rounds }, (_, i) => {
    const sheet: BookSheet = [next("front", 2 * i, i), next("back", 2 * i + 1 + Math.floor((2 * i) / order.length), i)];
    return few ? withOneFull(sheet, SIDES[i % 2]) : sheet;
  });

  const write = (name: Side, { space, template, items }: BookSide) => {
    const each = Math.min(items, space.count);
    const rows = Array.from({ length: Math.ceil(items / each) }, (_, i) => ({ id: `${name}-${i}`, shape: shapeId, limits: space.limits, items: Math.min(each, items - i * each) }));
    return { instruction: "Work it out.", template: template.id, rows };
  };
  const sheets = [...targets, ...rest].map(([front, back], i) => ({ id: `sheet-${i}`, firstPage: 2 * i + 1, front: write("front", front), back: write("back", back) }));
  const ids = sheets.map((sheet) => sheet.id);
  const snapshot = { format: 1, id: "harness", level: { id: "level", name: "1" }, topics: [{ id: "topic", code: "1-1", title: "Harness", sheets: ids }], sheets };
  const book = { bookId: "book", childId: "child", sheets: ids.map((sheetId, i) => ({ sheetId, attempt: 1 + (i % 3), qr: { front: `f${i}`, back: `b${i}` } })) };
  return { snapshot, book };
}

/** The sides of these templates that no page fills. */
export function unfilledSides(pages: readonly PageModel[], templates: readonly PageTemplate[]): string[] {
  const isFull = (page: PageModel, template: PageTemplate, side: Side) => page.template === template.id && page.side === side && page.regions.filter((r) => r.role === "slot").length === roomOf(template, side);
  return templates.flatMap((template) => SIDES.filter((side) => !pages.some((page) => isFull(page, template, side))).map((side) => `${template.id}, ${side} side`));
}
