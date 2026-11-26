import { addColumn } from "./add-column";
import { factAdd, factMul, factSub } from "./facts";
import { missingAddend, missingFactor } from "./missing";
import { mulColumn } from "./mul-column";
import { subColumn } from "./sub-column";
import { repeatedAdd } from "./repeated-add";
import { skipCount } from "./skip-count";
import { divFact } from "./div-fact";
import { divRemainder } from "./div-remainder";
import { divLong } from "./div-long";
import { placeValue } from "./place-value";
import type { Shape } from "./shape";

export type { Item, Shape } from "./shape";

/** Every shape that a bank row can name. */
export type ShapeLibrary = ReadonlyMap<string, Shape>;
export function shapeLibrary(shapes: readonly Shape[]): ShapeLibrary {
  const library = new Map<string, Shape>();
  for (const shape of shapes) {
    if (library.has(shape.id)) throw new Error(`duplicate shape "${shape.id}"`);
    if (!Number.isSafeInteger(shape.version) || shape.version < 1) {
      throw new Error(`shape "${shape.id}" must have a whole-number version of 1 or more, not ${shape.version}`);
    }
    library.set(shape.id, shape);
  }
  return library;
}
export const SHAPES: ShapeLibrary = shapeLibrary([
  addColumn,
  mulColumn,
  subColumn,
  factAdd,
  factSub,
  factMul,
  repeatedAdd,
  skipCount,
  missingFactor,
  missingAddend,
  divFact,
  divRemainder,
  divLong,
  placeValue,
]);
