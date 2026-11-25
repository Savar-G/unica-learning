import { mulColumn } from "./mul-column";
import type { Shape } from "./shape";

export type { Item, Shape } from "./shape";

/** Every shape that a bank row can name. */
export type ShapeLibrary = ReadonlyMap<string, Shape>;
export const shapeLibrary = (shapes: readonly Shape[]): ShapeLibrary => new Map(shapes.map((s) => [s.id, s]));
export const SHAPES: ShapeLibrary = shapeLibrary([mulColumn]);
