// What a build needs from a typesetter. This interface is the edge of the pure engine: behind it, render/ reads files and
// starts Typst. The modules on this side of it never import render/ (scripts/engine-guard.mjs).
import type { DrawnText, PageModel, Position } from "./contract";

/** A problem with the typesetter or its files. The message is for a person. */
export class RenderError extends Error {}

export interface Rendering {
  pdf: Uint8Array;
  /** One PNG a page, in page order. */
  images: Uint8Array[];
  positions: Position[];
  texts: DrawnText[];
}

export interface Renderer {
  /** The exact program and fonts, for the record of a book. */
  identity: { typst: string; fonts: string };
  /** The same pages always give the same bytes. */
  render(pages: readonly PageModel[]): Promise<Rendering>;
}
