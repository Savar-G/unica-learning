// The registration of every shape in shapes/index.ts, one file each (docs/workbook-v2-engine.md, "Adding a shape").
import type { ShapeRegistration } from "./shape-registration";
import { addColumnRegistration } from "./registrations/add-column";
import { mulColumnRegistration } from "./registrations/mul-column";
import { subColumnRegistration } from "./registrations/sub-column";
import { factAddRegistration } from "./registrations/fact-add";
import { factSubRegistration } from "./registrations/fact-sub";
import { factMulRegistration } from "./registrations/fact-mul";
import { repeatedAddRegistration } from "./registrations/add-repeated";
import { skipCountRegistration } from "./registrations/count-skip";
import { missingFactorRegistration } from "./registrations/missing-factor";
import { missingAddendRegistration } from "./registrations/missing-addend";
import { divFactRegistration } from "./registrations/div-fact";
import { divRemainderRegistration } from "./registrations/div-remainder";
import { divLongRegistration } from "./registrations/div-long";
import { placeValueRegistration } from "./registrations/place-value";
import { figureBarRegistration } from "./registrations/figure-bar";

// Keep at least three lines between the shape imports and the list below so git merge=union merges each block on its own.
// Adding a shape on two branches inserts one line in each block without conflict or hand edits.
// Every shape in SHAPES must appear here once; shapes.test.ts checks both lists.
export const SHAPE_REGISTRATIONS: readonly ShapeRegistration[] = [
  addColumnRegistration,
  mulColumnRegistration,
  subColumnRegistration,
  factAddRegistration,
  factSubRegistration,
  factMulRegistration,
  repeatedAddRegistration,
  skipCountRegistration,
  missingFactorRegistration,
  missingAddendRegistration,
  divFactRegistration,
  divRemainderRegistration,
  divLongRegistration,
  placeValueRegistration,
  figureBarRegistration,
];
