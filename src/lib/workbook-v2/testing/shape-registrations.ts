// The registration of every shape in shapes/index.ts, one file each (docs/workbook-v2-engine.md, "Adding a shape").
import type { ShapeRegistration } from "./shape-registration";
import { mulColumnRegistration } from "./registrations/mul-column";

// Keep at least three lines between the shape imports and the list below so git merge=union merges each block on its own.
// Adding a shape on two branches inserts one line in each block without conflict or hand edits.
// Every shape in SHAPES must appear here once; shapes.test.ts checks both lists.
export const SHAPE_REGISTRATIONS: readonly ShapeRegistration[] = [
  mulColumnRegistration,
];
