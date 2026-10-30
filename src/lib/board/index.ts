// Maya's board core (#315, spec #297): the one tested seam. Import from "@/lib/board" only.
// Pure TypeScript: no React, DOM, network, clock or randomness. Renderers and the transport live elsewhere.
export {
  addChildInk,
  applyBatch,
  boardPages,
  boardPaths,
  boardTargets,
  boardView,
  childInk,
  createScene,
  sameTarget,
  DEFAULT_PAGE,
  MAX_COMMANDS,
  MAX_PAGES,
  TIMING,
  type ApplyResult,
  type ChildInk,
  type Scene,
} from "./scene";
export { PLACEHOLDER_GLYPHS, type GlyphSet, type Point } from "./glyphs";
export * from "./types";
