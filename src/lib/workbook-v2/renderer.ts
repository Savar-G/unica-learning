// What a build needs from a typesetter. This interface is the edge of the pure engine: behind it, render/ reads files and
// starts Typst. The modules on this side of it never import render/ (scripts/engine-guard.mjs).
import type { DrawnText, PageModel, Position } from "./contract";

/** A problem with the typesetter or its files. The message is for a person. */
export class RenderError extends Error {}

/** What the typesetter says of the pages. */
export interface Report { positions: Position[]; texts: DrawnText[] }

export interface Rendering extends Report {
  pdf: Uint8Array;
  /** One PNG a page, in page order. */
  images: Uint8Array[];
}

export interface Renderer {
  /** Everything that the renderer draws with, for the record of a book: the version of Typst, then SHA-256 hashes. */
  identity: { typst: string; program: string; template: string; fonts: Readonly<Record<string, string>> };
  /** The same pages always give the same bytes. */
  render(pages: readonly PageModel[]): Promise<Rendering>;
  /** Only the images of `render`, for pages that are not printed. */
  images(pages: readonly PageModel[]): Promise<Uint8Array[]>;
  /** Only the report of `render`, for texts that are not printed. */
  report(pages: readonly PageModel[]): Promise<Report>;
}
