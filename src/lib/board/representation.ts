// A representation is one kind of math object on the board (columns now; division, fractions, number lines and models
// later). Each one owns its layout in grid cells, its named targets, its math checks and its strokes. The scene places
// it on a page, routes the common commands to it, and turns its strokes into board paths. To add a representation,
// add its create command to `CreateCommand`, write a module with this interface, and register it in `scene.ts`.
import type { GlyphSet, Point } from "@/lib/board/glyphs";
import type { CreateCommand, Ink, JumpCommand, MarkStyle, PathKind, Rect, Refusal, RegroupCommand, Target, TargetInfo } from "@/lib/board/types";

export type RefusalBody = Omit<Refusal, "index">;

export const refuse = (code: Refusal["code"], reason: string): RefusalBody => ({ code, reason });
export const isRefusal = (x: unknown): x is RefusalBody => typeof x === "object" && x !== null && "code" in x && "reason" in x;

/** A target of a representation, with its rectangle in grid cells from the object's top-left corner. */
export type LocalTarget = Omit<TargetInfo, "page"> & { rect: Rect };

/** One stroke in grid cells from the object's top-left corner, before the scene places the object. */
export interface LocalStroke {
  /** Unique and stable within the object. */
  key: string;
  /** The object, or an annotation the object owns (a regroup). */
  objectId: string;
  target: Target | null;
  kind: PathKind;
  glyph?: string;
  layer: "behind" | "math" | "annotation";
  ink: Ink;
  /** Line width in cells. */
  width: number;
  opacity?: number;
  pts: Point[];
  /** The command that revealed it: the board draws in this order. */
  seq: number;
}

/** What later commands will write in an object: the strokes when they are known now, else the boxes they will fill. */
export interface Reserved {
  strokes: LocalStroke[];
  boxes: Rect[];
}

export interface Ctx {
  seq: number;
  glyphs: GlyphSet;
}

/**
 * One kind of math object. `create`, `targets` and `draw` are required; the rest are optional, and the scene refuses
 * the command (put, regroup) or does nothing (owned annotations, mark checks) for a representation without them.
 */
export interface Representation<S, C extends CreateCommand> {
  op: C["op"];
  /** Checks the command and lays the object out. `size` is in grid cells and never changes after creation. */
  create(cmd: C, ctx: Ctx): { state: S; size: { w: number; h: number } } | RefusalBody;
  /** Every named target, including the annotations the object owns. */
  targets(state: S, objectId: string): LocalTarget[];
  /** Reveals a value in a writable target, after checking it. */
  put?(state: S, target: Target, value: string, ink: Ink | undefined, ctx: Ctx): S | RefusalBody;
  regroup?(state: S, req: RegroupCommand, ctx: Ctx): S | RefusalBody;
  /** Adds a jump the object owns (a number line). */
  jump?(state: S, req: JumpCommand, ctx: Ctx): S | RefusalBody;
  /** Removes an annotation the object owns (a regroup, a jump); the scene knows them from `targets`. */
  removeOwned?(state: S, id: string): S | RefusalBody;
  /**
   * What later commands may still write (empty answer and work-row digits, carries, borrows), in grid cells from the
   * object's top-left corner: the strokes when they are known now, else boxes. An arrow keeps clear of both, so the math
   * written there later never meets it.
   */
  reserved?(state: S, objectId: string, ctx: Ctx): Reserved;
  /** A reason to refuse a mark on a target (a check on an unfinished answer), or null. */
  refuseMark?(state: S, target: Target, style: MarkStyle): RefusalBody | null;
  draw(state: S, objectId: string, ctx: Ctx): LocalStroke[];
}

/** Lays out the strokes of a text in a box, one character per `advance` cells. Null when a glyph is missing. */
export function glyphStrokes(
  glyphs: GlyphSet,
  text: string,
  box: Rect,
  base: Omit<LocalStroke, "key" | "kind" | "glyph" | "pts">,
  keyPrefix: string,
): LocalStroke[] {
  const out: LocalStroke[] = [];
  const advance = box.w / Math.max(1, text.length);
  [...text].forEach((char, i) => {
    const strokes = glyphs.strokes(char) ?? [];
    strokes.forEach((stroke, j) => {
      const pts = stroke.map(([x, y]): Point => [box.x + advance * i + x * advance, box.y + y * box.h]);
      out.push({ ...base, key: `${keyPrefix}/${i}/${j}`, kind: "glyph", glyph: char, pts });
    });
  });
  return out;
}

/** The characters of a text the glyph set cannot draw. */
export const missingGlyphs = (glyphs: GlyphSet, text: string) => [...new Set([...text].filter((c) => glyphs.strokes(c) === null))];
