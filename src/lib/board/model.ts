// Math models on the board (#318): one `model` command with closed kinds, each with bounded fields. The code computes
// every count, position and named part from the fields; the model never supplies a drawn position. A model is drawn
// whole when it is made and does not change after; marks, arrows, focus, remove, undo and clear work on its parts.
import { array, type ArraySpec } from "@/lib/board/model-array";
import { baseTen, type BaseTenSpec } from "@/lib/board/model-base-ten";
import { fractionStrip, type FractionStripSpec } from "@/lib/board/model-fraction-strip";
import { geometry, type GeometrySpec } from "@/lib/board/model-geometry";
import { coordinateGrid, type CoordinateGridSpec } from "@/lib/board/model-grid";
import { choice, ModelInvalid, type Fields, type ModelKind } from "@/lib/board/model-kind";
import { isRefusal, type Representation } from "@/lib/board/representation";
import type { Ink, ModelCommand } from "@/lib/board/types";

export { ARRAY_LIMITS, type ArraySpec } from "@/lib/board/model-array";
export { BASE_TEN_LIMITS, type BaseTenSpec } from "@/lib/board/model-base-ten";
export { FRACTION_STRIP_LIMITS, type FractionStripSpec } from "@/lib/board/model-fraction-strip";
export { GEOMETRY_LIMITS, LABEL_SHOWS, SHAPES, type GeometrySpec, type LabelShow, type Shape } from "@/lib/board/model-geometry";
export { GRID_LIMITS, type CoordinateGridSpec } from "@/lib/board/model-grid";

export type ModelSpec = BaseTenSpec | ArraySpec | FractionStripSpec | GeometrySpec | CoordinateGridSpec;

const KINDS: { [K in ModelSpec["kind"]]: ModelKind<Extract<ModelSpec, { kind: K }>> } = {
  base_ten: baseTen,
  array,
  fraction_strip: fractionStrip,
  geometry,
  coordinate_grid: coordinateGrid,
};
export const MODEL_KINDS = Object.keys(KINDS) as ModelSpec["kind"][];
const kindOf = (spec: ModelSpec) => KINDS[spec.kind] as ModelKind<ModelSpec>;

/** The model's fields, or why they are refused. */
export function parseModel(raw: unknown): ModelSpec | string {
  try {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return "model must be an object.";
    const o = raw as Fields;
    return KINDS[choice(o.kind, MODEL_KINDS, "model.kind")].parse(o);
  } catch (e) {
    if (e instanceof ModelInvalid) return e.message;
    throw e;
  }
}

export interface ModelState {
  spec: ModelSpec;
  ink: Ink;
  seq: number;
}

export const model: Representation<ModelState, ModelCommand> = {
  op: "model",
  create(cmd, ctx) {
    const size = kindOf(cmd.model).layout(cmd.model, ctx.glyphs);
    if (isRefusal(size)) return size;
    return { state: { spec: cmd.model, ink: cmd.ink ?? "blue", seq: ctx.seq }, size };
  },
  targets: (state, objectId) => kindOf(state.spec).targets(state.spec, objectId),
  draw: (state, objectId, ctx) => kindOf(state.spec).draw(state.spec, { objectId, ink: state.ink, seq: state.seq }, ctx.glyphs),
};
