// The board core's vocabulary (#315, spec #297): the commands the model may send, the named targets they point at, and
// the stroke paths the core returns. The model never gives coordinates: it names objects and their parts, and the core
// decides where everything goes. Later tickets add representations (division, fractions, number lines, models) as new
// create commands and new target parts; the common commands below stay the same.

/** Pen colours. The renderer maps them to the palette. */
export const INKS = ["blue", "red", "green", "yellow", "black"] as const;
export type Ink = (typeof INKS)[number];

/** Place names, smallest first. Decimal places come with decimal columns, later. */
export const PLACE_NAMES = ["ones", "tens", "hundreds", "thousands", "ten_thousands", "hundred_thousands", "millions"] as const;
export type PlaceName = (typeof PLACE_NAMES)[number];

/** A named part of an object on the board. Each part has its own exact selector; words use indices, not text. */
export type Target =
  | { objectId: string; part: "whole" }
  | { objectId: string; part: "column"; column: PlaceName }
  | { objectId: string; part: "row"; rowId: string }
  | { objectId: string; part: "cell"; rowId: string; column: PlaceName }
  | { objectId: string; part: "word"; index: number };

/**
 * Where a new object goes: the main area, below or right of an object, or next to a named target (an anchor). Only the
 * core turns this into grid positions.
 */
export type Place = { region: "main" } | { below: string } | { rightOf: string } | { near: Target; side: "right" | "below" };

export const MARK_STYLES = ["highlight", "circle", "underline", "strike", "check"] as const;
export type MarkStyle = (typeof MARK_STYLES)[number];
export const CLEAR_SCOPES = ["maya_annotations", "maya_objects"] as const;
export type ClearScope = (typeof CLEAR_SCOPES)[number];
export const OPERATIONS = ["add", "subtract", "multiply"] as const;
export type Operation = (typeof OPERATIONS)[number];
export const REGROUP_KINDS = ["carry", "borrow"] as const;
export type RegroupKind = (typeof REGROUP_KINDS)[number];

export interface ColumnsCommand {
  op: "columns";
  id: string;
  operation: Operation;
  operands: { id: string; value: string }[];
  place: Place;
}

export interface WriteCommand {
  op: "write";
  id: string;
  text: string;
  place: Place;
  ink?: Ink;
}

/** Carry or borrow one unit between adjacent places. The core computes the values; the model only names the step. */
export interface RegroupCommand {
  op: "regroup";
  id: string;
  objectId: string;
  rowId: string;
  kind: RegroupKind;
  from: PlaceName;
  to: PlaceName;
  ink?: Ink;
}

/** Commands that create a new math object with its own layout. Later representations join this union. */
export type CreateCommand = ColumnsCommand | WriteCommand;

export type Command =
  | CreateCommand
  | { op: "put"; target: Target; value: string; ink?: Ink }
  | RegroupCommand
  | { op: "mark"; id: string; target: Target; style: MarkStyle; ink?: Ink }
  | { op: "arrow"; id: string; from: Target; to: Target; ink?: Ink }
  | { op: "remove"; objectId: string }
  | { op: "undo"; transactionId: string }
  | { op: "clear"; page?: number; scope: ClearScope }
  | { op: "focus"; target: Target };

/** One group of commands, applied all or none. Undo names a transaction. */
export interface Batch {
  transactionId: string;
  /** Untrusted model output: every command is checked before the scene changes. */
  commands: readonly unknown[];
}

/** Why the core refused a batch. `valid` lists the targets the model may use instead, when that helps. */
export interface Refusal {
  /** The index of the refused command in the batch, or -1 for the batch itself. */
  index: number;
  code:
    | "invalid_command"
    | "duplicate_id"
    | "unknown_target"
    | "not_writable"
    | "already_written"
    | "wrong_value"
    | "not_allowed"
    | "protected_ink"
    | "unsafe_undo"
    | "no_room"
    | "unsupported";
  reason: string;
  valid?: TargetInfo[];
}

/** What a target is and holds: the semantic summary the model reads before it sends more commands. */
export interface TargetInfo {
  target: Target;
  label: string;
  page: number;
  /** True when `put` can write here now. */
  writable: boolean;
  /** What is shown there now, or null when it is still empty. */
  value: string | null;
  /** Values shown and crossed out before the current one (a borrow), oldest first. */
  crossedOut?: string[];
}

/** A board page in grid cells. A digit fills one cell. */
export interface PageSize {
  cols: number;
  rows: number;
}

/** A rectangle in grid cells. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type PathKind = "glyph" | "rule" | "strike" | "arrow" | "highlight" | "circle" | "underline" | "check";

/**
 * One pen stroke of Maya's, for any renderer: an open polyline drawn from its first point to its last. Points are in
 * board widths from the page's top-left corner (x and y both, as the test whiteboard keeps them), so the drawing keeps
 * its shape when the board changes size. `width` is in board widths too.
 */
export interface BoardPath {
  /** Stable across replays: the renderer can key on it. */
  id: string;
  owner: "maya";
  /** The board object or annotation this stroke belongs to. */
  objectId: string;
  /** The named target this stroke draws, when it draws one. */
  target: Target | null;
  kind: PathKind;
  /** The character this stroke is part of, for glyph strokes. */
  glyph?: string;
  page: number;
  /** behind: under the math (highlights); math: digits and rules; annotation: carries, marks and arrows. */
  layer: "behind" | "math" | "annotation";
  ink: Ink;
  opacity: number;
  width: number;
  pts: [number, number][];
  /** The polyline's length in board widths. */
  length: number;
  durationMs: number;
  /**
   * Where the stroke is painted among Maya's strokes in its layer (lower first): the command that revealed it, then its
   * place among that command's strokes. Stable: a stroke an undo brings back keeps it.
   */
  order: number;
}

/** A newly drawn stroke, with when it starts, in ms from the start of the batch. */
export type TimedPath = BoardPath & { startMs: number };

/** What the board shows now: the page in view and the focused target. The application decides the camera. */
export interface View {
  page: number;
  target: Target | null;
}

/** A thing the caller should know about an applied batch. */
export type Notice = { kind: "new_page"; objectId: string; page: number };
