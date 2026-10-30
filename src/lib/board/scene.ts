// The board scene: applies batches of semantic commands, places objects on a grid of board pages, keeps the child's ink
// apart from Maya's work, and returns ordered stroke paths. Pure: no DOM, network, clock or randomness.
//
// History is a log of committed transactions. The visible state is the replay of the transactions that are not undone,
// with each object's page and position recorded on its first placement, so an undo never moves anything else.
import { columns } from "@/lib/board/columns";
import { annotationStrokes, arrowLines, MARK_INK, routeArrow, type ArrowObject, type ArrowObstacles, type ArrowRoute, type MarkObject } from "@/lib/board/annotations";
import { fraction } from "@/lib/board/fraction";
import { contains, overlaps, polylineHitsRect, polylineLength, traceTouches, type Trace } from "@/lib/board/geometry";
import { PLACEHOLDER_GLYPHS, type GlyphSet } from "@/lib/board/glyphs";
import { note } from "@/lib/board/note";
import { numberLine } from "@/lib/board/number-line";
import { parseCommand } from "@/lib/board/parse";
import { readNumber, valueKey } from "@/lib/board/rational";
import { isRefusal, refuse, type Ctx, type LocalStroke, type LocalTarget, type RefusalBody, type Representation } from "@/lib/board/representation";
import type { Batch, BoardPath, Command, CreateCommand, Notice, PageSize, PathKind, Place, Rect, Refusal, Target, TargetInfo, TimedPath, View } from "@/lib/board/types";
import type { Stroke } from "@/lib/whiteboard";

/** The representations the board can create, by their create command. Later ones are added here. */
const REPRESENTATIONS = { columns, write: note, fraction, number_line: numberLine } satisfies Record<CreateCommand["op"], unknown>;
const representation = (op: CreateCommand["op"]) => REPRESENTATIONS[op] as unknown as Representation<unknown, CreateCommand>;
const isCreate = (c: Command): c is CreateCommand => c.op in REPRESENTATIONS;

export const DEFAULT_PAGE: PageSize = { cols: 24, rows: 16 };
export const MAX_PAGES = 20;
export const MAX_COMMANDS = 40;
/** Cells kept free at each page edge and between objects. */
const MARGIN = 1;
/** Cells kept free between a new object and an arrow already on the board. */
const ARROW_GAP = 0.1;

/** Drawing speed: ms per cell of pen travel, with bounds per stroke, and the pauses between strokes and commands. */
export const TIMING = { msPerCell: 110, minMs: 60, maxMs: 1200, highlightMinMs: 350, penLiftMs: 40, commandGapMs: 200 };

interface RepObject {
  kind: "rep";
  id: string;
  op: CreateCommand["op"];
  state: unknown;
  page: number;
  rect: Rect;
}
type BoardObject = RepObject | MarkObject | ArrowObject;

interface SceneState {
  objects: BoardObject[];
  /** Annotations a representation owns (regroups), to their object, in the order they were made. A Map, so an id such as
   * "constructor" is never mistaken for an inherited property. */
  owners: Map<string, string>;
  view: View;
  /** The page the last object went on: "main" places there. */
  lastPage: number;
}

interface Step {
  cmd: Command;
  seq: number;
  /** Where a created object went, recorded on its first placement. */
  at?: { page: number; x: number; y: number };
  /** The page a clear cleared, recorded on its first run, so a replay clears the same page. */
  page?: number;
  /** An arrow's route, chosen on its first run, so a replay draws the same arrow. */
  route?: ArrowRoute;
  /** Ids this step created, changed or removed, and only looked at: what an undo depends on. */
  creates: string[];
  writes: string[];
  reads: string[];
}

interface Transaction {
  id: string;
  steps: Step[];
  /** The transaction this one undid, for an undo. */
  undid: string | null;
  undone: boolean;
}

/** One stroke of the child's, as the test whiteboard records it. Maya never changes, removes or covers it. */
export interface ChildInk {
  id: string;
  page: number;
  stroke: Stroke;
  /** The board's width in CSS pixels when the child drew it: `stroke.w` is in CSS pixels, its points in board widths. */
  boardWidth: number;
}

/** The board: an immutable value. Read it only through the functions of this module. */
export interface Scene {
  readonly page: PageSize;
  readonly glyphs: GlyphSet;
  readonly log: readonly Transaction[];
  readonly child: readonly ChildInk[];
  readonly nextSeq: number;
  readonly state: SceneState;
}

export type ApplyResult =
  | { ok: true; scene: Scene; drawn: TimedPath[]; erased: string[]; notices: Notice[] }
  | { ok: false; refusal: Refusal };

const emptyState = (): SceneState => ({ objects: [], owners: new Map(), view: { page: 1, target: null }, lastPage: 1 });

export function createScene(options: { page?: PageSize; glyphs?: GlyphSet } = {}): Scene {
  return { page: options.page ?? DEFAULT_PAGE, glyphs: options.glyphs ?? PLACEHOLDER_GLYPHS, log: [], child: [], nextSeq: 1, state: emptyState() };
}

// ---------- targets ----------

const targetKey = (t: Target) => [t.objectId, t.part, "rowId" in t ? t.rowId : "", "column" in t ? t.column : "", "index" in t ? t.index : "", "value" in t ? valueName(t.value) : ""].join("|");
/** A number line value's one name, so "2/6" and "1/3" are the same target. */
function valueName(text: string): string {
  const read = readNumber(text);
  return "reason" in read ? text : valueKey(read.value);
}
export const sameTarget = (a: Target, b: Target) => targetKey(a) === targetKey(b);

const reps = (s: SceneState) => s.objects.filter((o): o is RepObject => o.kind === "rep");
const findRep = (s: SceneState, id: string) => reps(s).find((o) => o.id === id);
const ctxOf = (scene: Pick<Scene, "glyphs">, seq = 0): Ctx => ({ seq, glyphs: scene.glyphs });

function repTargets(o: RepObject): (LocalTarget & { page: number })[] {
  return representation(o.op)
    .targets(o.state, o.id)
    .map((t) => ({ ...t, page: o.page, rect: { ...t.rect, x: t.rect.x + o.rect.x, y: t.rect.y + o.rect.y } }));
}

function publicInfo(t: LocalTarget & { page: number }): TargetInfo {
  const info: Partial<typeof t> = { ...t };
  delete info.rect;
  return info as TargetInfo;
}

/** A target's page and rectangle on the page, or why it cannot be used. */
function resolve(s: SceneState, target: Target): { rep: RepObject; page: number; rect: Rect } | RefusalBody {
  const owner = s.owners.get(target.objectId);
  const rep = findRep(s, target.objectId) ?? (owner === undefined ? undefined : findRep(s, owner));
  if (!rep) {
    const r = refuse("unknown_target", `There is no object "${target.objectId}" on the board.`);
    return { ...r, valid: reps(s).map((o) => publicInfo(repTargets(o)[0])) };
  }
  const all = repTargets(rep);
  const found = all.find((t) => sameTarget(t.target, target));
  if (!found) return { ...refuse("unknown_target", `"${target.objectId}" has no such ${target.part}.`), valid: all.slice(0, 60).map(publicInfo) };
  return { rep, page: rep.page, rect: found.rect };
}

// ---------- placement ----------

/** The child's stroke in grid cells, with its line width, or null for an eraser stroke or an empty one. */
function childTrace(scene: Pick<Scene, "page">, ink: ChildInk): Trace | null {
  if (ink.stroke.erase || ink.stroke.pts.length === 0) return null;
  const { cols } = scene.page;
  return { pts: ink.stroke.pts.map(([x, y]) => [x * cols, y * cols]), width: (ink.stroke.w / ink.boardWidth) * cols };
}

/** The rectangle around a child's stroke in grid cells: its points, its line width and a small gap. */
function childRect(scene: Pick<Scene, "page">, ink: ChildInk): Rect | null {
  const trace = childTrace(scene, ink);
  if (!trace) return null;
  const xs = trace.pts.map(([x]) => x);
  const ys = trace.pts.map(([, y]) => y);
  const pad = 0.25 + trace.width / 2;
  return { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + 2 * pad, h: Math.max(...ys) - Math.min(...ys) + 2 * pad };
}

const pageCount = (scene: Pick<Scene, "child">, s: SceneState) => Math.max(1, ...reps(s).map((o) => o.page), ...scene.child.map((c) => c.page));

function fits(scene: Scene, s: SceneState, page: number, r: Rect): boolean {
  const { cols, rows } = scene.page;
  if (r.x < MARGIN || r.y < MARGIN || r.x + r.w > cols - MARGIN || r.y + r.h > rows - MARGIN) return false;
  const around: Rect = { x: r.x - MARGIN, y: r.y - MARGIN, w: r.w + 2 * MARGIN, h: r.h + 2 * MARGIN };
  if (reps(s).some((o) => o.page === page && overlaps(around, o.rect))) return false;
  // An arrow's route is fixed: new work goes past it, never under it.
  const clear: Rect = { x: r.x - ARROW_GAP, y: r.y - ARROW_GAP, w: r.w + 2 * ARROW_GAP, h: r.h + 2 * ARROW_GAP };
  if (s.objects.some((o) => o.kind === "arrow" && o.page === page && arrowLines(o.route).some((pts) => polylineHitsRect(pts, clear)))) return false;
  return !scene.child.some((c) => {
    const cr = c.page === page ? childRect(scene, c) : null;
    return cr !== null && overlaps(r, cr);
  });
}

/** What a relative placement is relative to: an object (with a gap) or a named target (an anchor). */
function anchorOf(s: SceneState, where: Exclude<Place, { region: "main" }>): { page: number; rect: Rect; gap: number; below: boolean } | RefusalBody {
  if ("near" in where) {
    const found = resolve(s, where.near);
    return isRefusal(found) ? found : { page: found.page, rect: found.rect, gap: 0, below: where.side === "below" };
  }
  const refId = "below" in where ? where.below : where.rightOf;
  const ref = findRep(s, refId);
  if (!ref) return refuse("unknown_target", `There is no object "${refId}" to place this next to.`);
  return { page: ref.page, rect: ref.rect, gap: MARGIN, below: "below" in where };
}

function place(scene: Scene, s: SceneState, where: Place, size: { w: number; h: number }): { page: number; x: number; y: number } | RefusalBody {
  const { cols, rows } = scene.page;
  if (size.w > cols - 2 * MARGIN || size.h > rows - 2 * MARGIN) return refuse("no_room", "This is too big for one board page.");
  let page = s.lastPage;
  let spot: { x: number; y: number } | null = null;
  if ("region" in where) {
    for (let y = MARGIN; !spot && y + size.h <= rows - MARGIN; y++)
      for (let x = MARGIN; !spot && x + size.w <= cols - MARGIN; x++) if (fits(scene, s, page, { x, y, ...size })) spot = { x, y };
  } else {
    const anchor = anchorOf(s, where);
    if (isRefusal(anchor)) return anchor;
    page = anchor.page;
    // Below slides down and right slides right, past anything in the way, before the work moves to a new page.
    const { rect, gap, below } = anchor;
    const start = below ? { x: Math.floor(rect.x), y: Math.ceil(rect.y + rect.h) + gap } : { x: Math.ceil(rect.x + rect.w) + gap, y: Math.floor(rect.y) };
    for (let step = 0; !spot && step < Math.max(cols, rows); step++) {
      const candidate = below ? { x: start.x, y: start.y + step } : { x: start.x + step, y: start.y };
      if (fits(scene, s, page, { ...candidate, ...size })) spot = candidate;
    }
  }
  if (spot) return { page, ...spot };
  const next = pageCount(scene, s) + 1;
  if (next > MAX_PAGES) return refuse("no_room", `The board is full: it has ${MAX_PAGES} pages.`);
  return { page: next, x: MARGIN, y: MARGIN };
}

// ---------- commands ----------

const takenIds = (scene: Scene, s: SceneState) => new Set([...s.objects.map((o) => o.id), ...s.owners.keys(), ...scene.child.map((c) => c.id)]);

/** Applies one command to a draft state. Records the step's placement, cleared page and ids on its first run. */
function exec(scene: Scene, s: SceneState, step: Step, notices: Notice[]): RefusalBody | null {
  const { cmd } = step;
  const ctx = ctxOf(scene, step.seq);
  const fresh = (id: string) => (takenIds(scene, s).has(id) ? refuse("duplicate_id", `The id "${id}" is already on the board.`) : null);
  const note = (list: string[], ids: string[]) => {
    for (const id of ids) if (!list.includes(id)) list.push(id);
  };
  const read = (...ids: string[]) => note(step.reads, ids);
  const write = (...ids: string[]) => note(step.writes, ids);

  if (isCreate(cmd)) {
    const taken = fresh(cmd.id);
    if (taken) return taken;
    const made = representation(cmd.op).create(cmd, ctx);
    if (isRefusal(made)) return made;
    if (!step.at) {
      const spot = place(scene, s, cmd.place, made.size);
      if (isRefusal(spot)) return spot;
      step.at = spot;
      if (spot.page > pageCount(scene, s)) notices.push({ kind: "new_page", objectId: cmd.id, page: spot.page });
    }
    const { page, x, y } = step.at;
    if (page !== s.view.page) s.view = { page, target: null };
    s.objects.push({ kind: "rep", id: cmd.id, op: cmd.op, state: made.state, page, rect: { x, y, ...made.size } });
    s.lastPage = page;
    step.creates = [cmd.id];
    if ("below" in cmd.place) read(cmd.place.below);
    if ("rightOf" in cmd.place) read(cmd.place.rightOf);
    if ("near" in cmd.place) read(cmd.place.near.objectId, s.owners.get(cmd.place.near.objectId) ?? cmd.place.near.objectId);
    return null;
  }

  switch (cmd.op) {
    case "put":
    case "regroup":
    case "jump": {
      const objectId = cmd.op === "put" ? cmd.target.objectId : cmd.op === "jump" ? cmd.lineId : cmd.objectId;
      const rep = findRep(s, objectId);
      if (!rep) {
        if (s.owners.has(objectId) || s.objects.some((o) => o.id === objectId)) return refuse("not_writable", `"${objectId}" is an annotation: ${cmd.op} works on a math object.`);
        return resolve(s, { objectId, part: "whole" }) as RefusalBody;
      }
      if (cmd.op !== "put") {
        const taken = fresh(cmd.id);
        if (taken) return taken;
      }
      const r = representation(rep.op);
      const next =
        cmd.op === "put"
          ? (r.put?.(rep.state, cmd.target, cmd.value, cmd.ink, ctx) ?? refuse("not_writable", `Put does not write in "${rep.id}".`))
          : cmd.op === "regroup"
            ? (r.regroup?.(rep.state, cmd, ctx) ?? refuse("not_allowed", "Regroup works on columns."))
            : (r.jump?.(rep.state, cmd, ctx) ?? refuse("not_allowed", "Jump works on a number line."));
      if (isRefusal(next)) return next.code === "unknown_target" && cmd.op === "put" ? { ...next, valid: repTargets(rep).filter((t) => t.writable).map(publicInfo) } : next;
      rep.state = next;
      write(rep.id);
      if (cmd.op !== "put") {
        s.owners.set(cmd.id, rep.id);
        step.creates = [cmd.id];
      }
      return null;
    }
    case "mark": {
      const taken = fresh(cmd.id);
      if (taken) return taken;
      const found = resolve(s, cmd.target);
      if (isRefusal(found)) return found;
      const why = representation(found.rep.op).refuseMark?.(found.rep.state, cmd.target, cmd.style);
      if (why) return why;
      s.objects.push({ kind: "mark", id: cmd.id, target: cmd.target, style: cmd.style, ink: cmd.ink ?? MARK_INK[cmd.style], page: found.page, seq: step.seq });
      step.creates = [cmd.id];
      read(cmd.target.objectId, found.rep.id);
      return null;
    }
    case "arrow": {
      const taken = fresh(cmd.id);
      if (taken) return taken;
      const a = resolve(s, cmd.from);
      if (isRefusal(a)) return a;
      const b = resolve(s, cmd.to);
      if (isRefusal(b)) return b;
      if (sameTarget(cmd.from, cmd.to)) return refuse("not_allowed", "An arrow joins two different things.");
      if (a.page !== b.page) return refuse("not_allowed", "An arrow joins two things on the same page.");
      if (!step.route) {
        const route = routeArrow(a.rect, b.rect, obstacles(scene, s, a.page, [a, b]), scene.page);
        if (!route) return refuse("no_room", "There is no clear way to draw this arrow without crossing other work: point it at other targets.");
        step.route = route;
      }
      s.objects.push({ kind: "arrow", id: cmd.id, from: cmd.from, to: cmd.to, route: step.route, ink: cmd.ink ?? "red", page: a.page, seq: step.seq });
      step.creates = [cmd.id];
      read(cmd.from.objectId, cmd.to.objectId, a.rep.id, b.rep.id);
      return null;
    }
    case "remove": {
      const id = cmd.objectId;
      if (scene.child.some((c) => c.id === id) || id.startsWith("child-")) return refuse("protected_ink", "That is the child's writing: Maya never removes it.");
      if (s.owners.has(id)) {
        const removed = removeOwned(s, id);
        if (isRefusal(removed)) return removed;
        write(...removed);
        return null;
      }
      const obj = s.objects.find((o) => o.id === id);
      if (!obj) return { ...refuse("unknown_target", `There is no object "${id}" on the board.`), valid: reps(s).map((o) => publicInfo(repTargets(o)[0])) };
      write(...removeObject(s, obj));
      return null;
    }
    case "clear": {
      if (step.page === undefined) {
        const page = cmd.page ?? s.view.page;
        const pages = pageCount(scene, s);
        if (page > pages) return refuse("unknown_target", `The board has pages 1 to ${pages}.`);
        step.page = page;
      }
      const onPage = s.objects.filter((o) => o.page === step.page && (cmd.scope === "maya_objects" || o.kind !== "rep"));
      for (const o of onPage) if (s.objects.includes(o)) write(...removeObject(s, o));
      if (cmd.scope === "maya_annotations") {
        // The annotations the math objects own (carries, borrows) go too, newest first: a borrow chain unwinds in order
        // and the top number shows its first digits again.
        const owned = [...s.owners].filter(([, owner]) => findRep(s, owner)?.page === step.page).map(([id]) => id);
        for (const id of owned.reverse()) {
          const removed = removeOwned(s, id);
          if (isRefusal(removed)) return removed;
          write(...removed);
        }
      }
      return null;
    }
    case "focus": {
      const found = resolve(s, cmd.target);
      if (isRefusal(found)) return found;
      s.view = { page: found.page, target: cmd.target };
      return null;
    }
    case "undo":
      return refuse("not_allowed", "Send undo on its own.");
  }
}

/** Removes an annotation a math object owns, with the marks and arrows on it. Returns the changed and removed ids. */
function removeOwned(s: SceneState, id: string): string[] | RefusalBody {
  const rep = findRep(s, s.owners.get(id) ?? "");
  if (!rep) return refuse("unknown_target", `There is no object "${id}" on the board.`);
  const next = representation(rep.op).removeOwned?.(rep.state, id) ?? refuse("not_allowed", `"${id}" cannot be removed on its own.`);
  if (isRefusal(next)) return next;
  rep.state = next;
  s.owners.delete(id);
  return [id, rep.id, ...dropAnnotationsOn(s, [id])];
}

/** Removes marks and arrows that point at any of the ids. Returns the removed ids. */
function dropAnnotationsOn(s: SceneState, ids: string[]): string[] {
  const hit = (t: Target) => ids.includes(t.objectId);
  const gone = s.objects.filter((o) => (o.kind === "mark" && hit(o.target)) || (o.kind === "arrow" && (hit(o.from) || hit(o.to))));
  s.objects = s.objects.filter((o) => !gone.includes(o));
  return gone.map((o) => o.id);
}

/** Removes an object with its owned annotations and the marks and arrows on them. Returns every removed id. */
function removeObject(s: SceneState, obj: BoardObject): string[] {
  s.objects = s.objects.filter((o) => o !== obj);
  if (obj.kind !== "rep") return [obj.id];
  const owned = [...s.owners].filter(([, owner]) => owner === obj.id).map(([k]) => k);
  for (const k of owned) s.owners.delete(k);
  return [obj.id, ...owned, ...dropAnnotationsOn(s, [obj.id, ...owned])];
}

// ---------- history ----------

/** The state the live transactions build, replayed from the start, or why a later step no longer applies. */
function replay(scene: Scene, log: readonly Transaction[]): SceneState | RefusalBody {
  const s = emptyState();
  for (const tx of log) {
    if (tx.undone || tx.undid) continue;
    for (const step of tx.steps) {
      const refused = exec(scene, s, { ...step, creates: [], writes: [], reads: [] }, []);
      if (refused) return refuse("unsafe_undo", `Transaction "${tx.id}" depends on it (${refused.reason}): undo that first.`);
    }
  }
  return s;
}

function undo(scene: Scene, transactionId: string): { log: Transaction[]; state: SceneState } | RefusalBody {
  const at = scene.log.findIndex((t) => t.id === transactionId);
  if (at < 0) return refuse("unknown_target", `There is no transaction "${transactionId}".`);
  const tx = scene.log[at];
  if (tx.undid) return refuse("not_allowed", "An undo cannot be undone.");
  if (tx.undone) return refuse("not_allowed", `Transaction "${transactionId}" is already undone.`);
  // Later work depends on this transaction when it changes or reuses what this one made or changed, or looks at what
  // this one made. The replay catches the rest (a check on an answer this one wrote).
  const created = new Set(tx.steps.flatMap((s) => s.creates));
  const changed = new Set([...created, ...tx.steps.flatMap((s) => s.writes)]);
  for (const later of scene.log.slice(at + 1)) {
    if (later.undone || later.undid) continue;
    for (const step of later.steps) {
      const used = [...step.creates, ...step.writes].find((id) => changed.has(id)) ?? step.reads.find((id) => created.has(id));
      if (used) return refuse("unsafe_undo", `Transaction "${later.id}" uses "${used}" later: undo it first.`);
    }
  }
  const log = scene.log.map((t, i) => (i === at ? { ...t, undone: true } : t));
  const state = replay(scene, log);
  if (isRefusal(state)) return state;
  const before = new Set(reps(scene.state).map((o) => o.id));
  for (const o of reps(state)) {
    if (before.has(o.id)) continue;
    if (scene.child.some((c) => c.page === o.page && overlaps(o.rect, childRect(scene, c) ?? { x: 0, y: 0, w: 0, h: 0 })))
      return refuse("unsafe_undo", `The child has written where "${o.id}" was: undoing would cover their work.`);
  }
  return { log, state };
}

// ---------- the public functions ----------

/** Applies a batch of commands, all or none. Refuses invalid commands, unknown targets and wrong math with a reason. */
export function applyBatch(scene: Scene, batch: Batch): ApplyResult {
  const refused = (index: number, r: RefusalBody): ApplyResult => ({ ok: false, refusal: { index, ...r } });
  if (typeof batch.transactionId !== "string" || batch.transactionId.length === 0 || batch.transactionId.length > 64)
    return refused(-1, refuse("invalid_command", "A batch needs a transaction id of 1 to 64 characters."));
  if (scene.log.some((t) => t.id === batch.transactionId)) return refused(-1, refuse("duplicate_id", `Transaction "${batch.transactionId}" is already applied.`));
  if (!Array.isArray(batch.commands) || batch.commands.length === 0 || batch.commands.length > MAX_COMMANDS)
    return refused(-1, refuse("invalid_command", `A batch has 1 to ${MAX_COMMANDS} commands.`));

  const commands: Command[] = [];
  for (const [i, raw] of batch.commands.entries()) {
    const parsed = parseCommand(raw);
    if (isRefusal(parsed)) return refused(i, parsed);
    commands.push(parsed);
  }

  let next: Scene;
  const notices: Notice[] = [];
  if (commands.some((c) => c.op === "undo")) {
    if (commands.length > 1) return refused(commands.findIndex((c) => c.op === "undo"), refuse("not_allowed", "Send undo on its own."));
    const cmd = commands[0] as Extract<Command, { op: "undo" }>;
    const done = undo(scene, cmd.transactionId);
    if (isRefusal(done)) return refused(0, done);
    next = { ...scene, log: [...done.log, { id: batch.transactionId, steps: [], undid: cmd.transactionId, undone: false }], state: done.state };
  } else {
    const state = structuredClone(scene.state);
    let seq = scene.nextSeq;
    const steps: Step[] = [];
    for (const [i, cmd] of commands.entries()) {
      const step: Step = { cmd, seq: seq++, creates: [], writes: [], reads: [] };
      const why = exec(scene, state, step, notices);
      if (why) return refused(i, why);
      steps.push(step);
    }
    next = { ...scene, log: [...scene.log, { id: batch.transactionId, steps, undid: null, undone: false }], nextSeq: seq, state };
  }

  const before = new Set(sequencedPaths(scene).map((p) => p.id));
  const after = sequencedPaths(next);
  const kept = new Set(after.map((p) => p.id));
  const drawn = after.filter((p) => !before.has(p.id));
  // Every stroke this batch makes visible, from any command or an undo, keeps clear of the child's ink.
  const covering = drawn.find((p) => coversChild(next, p));
  if (covering) {
    if (next.log.at(-1)?.undid) return refused(0, refuse("unsafe_undo", "The child has written where this would come back: undoing would cover their work."));
    return refused(covering.seq - scene.nextSeq, refuse("protected_ink", "The child has written there: Maya never draws over their work."));
  }
  // An arrow's route is fixed when it is drawn. Nothing this batch makes visible may run through an arrow, and no arrow
  // it brings back may run through work on the board.
  const crossing = arrowCrossing(next, after, (p) => !before.has(p.id));
  if (crossing) {
    if (next.log.at(-1)?.undid)
      return refused(0, refuse("unsafe_undo", `Undoing would bring back work that runs through the arrow "${crossing.arrowId}": remove that arrow first.`));
    return refused(crossing.seq - scene.nextSeq, refuse("not_allowed", `This would run through the arrow "${crossing.arrowId}": remove that arrow first, or put the work somewhere else.`));
  }
  return { ok: true, scene: next, drawn: schedule(drawn), erased: [...before].filter((id) => !kept.has(id)), notices };
}

/**
 * Adds a stroke the child drew. Child ink is never removed, undone, cleared or covered by Maya's commands. `boardWidth`
 * is the board's width in CSS pixels when the child drew it, to read the stroke's width (`stroke.w`, CSS pixels).
 */
export function addChildInk(scene: Scene, ink: { page: number; stroke: Stroke; boardWidth: number }): { scene: Scene; id: string } {
  const pages = pageCount(scene, scene.state);
  if (!Number.isInteger(ink.page) || ink.page < 1 || ink.page > pages) throw new RangeError(`The board has pages 1 to ${pages}.`);
  if (!Number.isFinite(ink.boardWidth) || ink.boardWidth <= 0) throw new RangeError("The board width must be a positive number of CSS pixels.");
  const id = `child-${scene.child.length + 1}`;
  return { scene: { ...scene, child: [...scene.child, { id, page: ink.page, stroke: ink.stroke, boardWidth: ink.boardWidth }] }, id };
}

/**
 * The first arrow that touches a stroke it must keep clear of, where the arrow or the stroke is new, with the command
 * that revealed the newer of the two. What an arrow keeps clear of is what its route kept clear of when it was drawn.
 */
function arrowCrossing(scene: Scene, paths: (BoardPath & { seq: number })[], isNew: (p: BoardPath) => boolean): { arrowId: string; seq: number } | null {
  const s = scene.state;
  for (const arrow of s.objects) {
    if (arrow.kind !== "arrow") continue;
    const ends = [arrow.from, arrow.to].flatMap((t) => {
      const found = resolve(s, t);
      return isRefusal(found) ? [] : [found.rect];
    });
    const onEnd = marksOnEnds(s, arrow.page, ends);
    const own = paths.filter((p) => p.objectId === arrow.id);
    const others = paths.filter((p) => p.page === arrow.page && p.objectId !== arrow.id && blocksArrows(p.kind) && !onEnd.has(p.objectId));
    for (const a of own)
      for (const o of others) {
        if (!isNew(a) && !isNew(o)) continue;
        if (traceTouches(a, o)) return { arrowId: arrow.id, seq: Math.max(isNew(a) ? a.seq : 0, isNew(o) ? o.seq : 0) };
      }
  }
  return null;
}

/** The marks on a page on or around any of the rectangles: an arrow that ends there has to reach through them. */
function marksOnEnds(s: SceneState, page: number, ends: readonly Rect[]): Set<string> {
  return new Set(
    s.objects
      .filter((o): o is MarkObject => o.kind === "mark" && o.page === page)
      .filter((o) => {
        const found = resolve(s, o.target);
        return !isRefusal(found) && ends.some((e) => overlaps(found.rect, e));
      })
      .map((o) => o.id),
  );
}

/** True when a stroke of Maya's would cover a stroke of the child's on its page, counting both line widths. */
function coversChild(scene: Scene, p: BoardPath): boolean {
  return scene.child.some((c) => {
    if (c.page !== p.page || c.stroke.erase || c.stroke.pts.length === 0) return false;
    return traceTouches({ pts: p.pts, width: p.width }, { pts: c.stroke.pts, width: c.stroke.w / c.boardWidth });
  });
}

/** The child's strokes, in the order drawn, for the child-ink layer. */
export const childInk = (scene: Scene): readonly ChildInk[] => scene.child;

/** Every named target on the board with what it holds: the summary the model reads before it sends more commands. */
export const boardTargets = (scene: Scene): TargetInfo[] => reps(scene.state).flatMap((o) => repTargets(o).map(publicInfo));

export const boardView = (scene: Scene): View => scene.state.view;
export const boardPages = (scene: Scene): number => pageCount(scene, scene.state);

/** Maya's strokes on the board, in drawing order. */
export const boardPaths = (scene: Scene): BoardPath[] =>
  sequencedPaths(scene).map((p) => {
    const path: Partial<typeof p> = { ...p };
    delete path.seq;
    return path as BoardPath;
  });

interface PlacedStroke {
  stroke: LocalStroke;
  owner: string;
  page: number;
  /** Where the stroke's object sits on the page: add to the stroke's points for page cells. */
  dx: number;
  dy: number;
}

/** Every stroke of Maya's in a state, with where it sits, in the order of the objects. */
function placedStrokes(scene: Pick<Scene, "glyphs">, s: SceneState): PlacedStroke[] {
  const local: PlacedStroke[] = [];
  for (const o of s.objects) {
    if (o.kind === "rep") {
      for (const stroke of representation(o.op).draw(o.state, o.id, ctxOf(scene))) local.push({ stroke, owner: o.id, page: o.page, dx: o.rect.x, dy: o.rect.y });
      continue;
    }
    const rectOf = (t: Target) => {
      const found = resolve(s, t);
      if (isRefusal(found)) throw new Error(`board annotation ${o.id} points at a missing target`);
      return found.rect;
    };
    for (const stroke of annotationStrokes(scene.glyphs, o, rectOf)) local.push({ stroke, owner: o.id, page: o.page, dx: 0, dy: 0 });
  }
  return local;
}

/**
 * The strokes an arrow may cross: rules (an arrow from a number to its answer crosses the line between them) and
 * highlights, which lie under everything.
 */
const ROUTE_ACROSS = new Set<PathKind>(["rule", "highlight"]);
const blocksArrows = (kind: PathKind) => !ROUTE_ACROSS.has(kind);

/**
 * What a new arrow on a page must keep clear of, in page cells: Maya's writing, arrows and marks, the child's ink, the
 * boxes of the objects it does not join, and the math later commands will write. A mark on or around either end is left
 * out: the arrow has to reach that end.
 */
function obstacles(scene: Scene, s: SceneState, page: number, ends: { rep: RepObject; rect: Rect }[]): ArrowObstacles {
  const markOnEnd = marksOnEnds(s, page, ends.map((e) => e.rect));
  const trace = ({ stroke, dx, dy }: { stroke: LocalStroke; dx: number; dy: number }): Trace => ({ pts: stroke.pts.map(([x, y]) => [x + dx, y + dy]), width: stroke.width });
  const maya = placedStrokes(scene, s)
    .filter((p) => p.page === page && blocksArrows(p.stroke.kind) && !markOnEnd.has(p.owner))
    .map(trace);
  const child = scene.child.filter((c) => c.page === page).flatMap((c) => childTrace(scene, c) ?? []);
  const boxes = reps(s)
    .filter((o) => o.page === page && !ends.some((e) => e.rep.id === o.id))
    .map((o) => o.rect);
  // What later math writes, in every object on the page (the joined ones too). A reserved box inside an end does not
  // count (a strike across the digit the arrow points at); a box that reaches past the end does, so the arrow comes in
  // from a side that later work leaves free.
  const later = reps(s)
    .filter((o) => o.page === page)
    .map((o) => ({ o, r: representation(o.op).reserved?.(o.state, o.id, ctxOf(scene)) ?? { strokes: [], boxes: [] } }));
  const laterStrokes = later.flatMap(({ o, r }) => r.strokes.filter((st) => blocksArrows(st.kind)).map((stroke) => trace({ stroke, dx: o.rect.x, dy: o.rect.y })));
  const laterBoxes = later
    .flatMap(({ o, r }) => r.boxes.map((b) => ({ ...b, x: b.x + o.rect.x, y: b.y + o.rect.y })))
    .filter((b) => !ends.some((e) => contains(e.rect, b)));
  return { strokes: [...maya, ...laterStrokes, ...child], boxes: [...boxes, ...laterBoxes] };
}

/** The strokes with the command that revealed each one. */
function sequencedPaths(scene: Scene): (BoardPath & { seq: number })[] {
  const local = placedStrokes(scene, scene.state);
  local.sort((a, b) => a.stroke.seq - b.stroke.seq);
  const unit = 1 / scene.page.cols;
  const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
  return local.map(({ stroke, owner, page, dx, dy }) => {
    const pts = stroke.pts.map(([x, y]): [number, number] => [r4((x + dx) * unit), r4((y + dy) * unit)]);
    const cells = polylineLength(stroke.pts);
    const ms = Math.round(Math.min(TIMING.maxMs, Math.max(stroke.kind === "highlight" ? TIMING.highlightMinMs : TIMING.minMs, cells * TIMING.msPerCell)));
    return {
      // The command that revealed a stroke is part of its id: an id reused after a remove draws as a new stroke.
      id: `${owner}:${stroke.key}@${stroke.seq}`,
      owner: "maya",
      objectId: stroke.objectId,
      target: stroke.target,
      kind: stroke.kind,
      ...(stroke.glyph === undefined ? {} : { glyph: stroke.glyph }),
      page,
      layer: stroke.layer,
      ink: stroke.ink,
      opacity: stroke.opacity ?? 1,
      width: r4(stroke.width * unit),
      pts,
      length: r4(cells * unit),
      durationMs: ms,
      seq: stroke.seq,
    };
  });
}

/** Gives new strokes their start times: one after another, with a pen lift between strokes and a pause between commands. */
function schedule(paths: (BoardPath & { seq: number })[]): TimedPath[] {
  let t = 0;
  return paths.map(({ seq, ...p }, i) => {
    if (i > 0) t += seq === paths[i - 1].seq ? TIMING.penLiftMs : TIMING.commandGapMs;
    const timed = { ...p, startMs: t };
    t += p.durationMs;
    return timed;
  });
}
