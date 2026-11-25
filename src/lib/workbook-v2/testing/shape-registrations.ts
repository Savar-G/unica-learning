// The registration of every shape in shapes/index.ts, one file each (docs/workbook-v2-engine.md, "Adding a shape").
// Keep both lists in the order of the names.
import { mulColumnRegistration } from "./registrations/mul-column";
import type { ShapeRegistration } from "./shape-registration";

export const SHAPE_REGISTRATIONS: readonly ShapeRegistration[] = [
  mulColumnRegistration,
];
