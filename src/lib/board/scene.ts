// The board scene: applies batches of semantic commands, places objects on a grid of board pages, keeps the child's ink
// apart from Maya's work, and returns ordered stroke paths. Pure: no DOM, network, clock or randomness.
//
// History is a log of committed transactions. The visible state is the replay of the transactions that are not undone,
// with each object's page and position recorded on its first placement, so an undo never moves anything else.
import { columns } from "@/lib/board/columns";
import { annotationStrokes, MARK_INK, type ArrowObject, type MarkObject } from "@/lib/board/annotations";
import { overlaps, polylineLength } from "@/lib/board/geometry";
import { PLACEHOLDER_GLYPHS, type GlyphSet } from "@/lib/board/glyphs";
import { note } from "@/lib/board/note";
import { parseCommand } from "@/lib/board/parse";
import { isRefusal, refuse, type Ctx, type LocalStroke, type LocalTarget, type RefusalBody, type Representation } from "@/lib/board/representation";
import type { Batch, BoardPath, Command, CreateCommand, Notice, Place, Rect, Refusal, Target, TargetInfo, TimedPath, View } from "@/lib/board/types";
import type { Stroke } from "@/lib/whiteboard";

/** The representations the board can create, by their create command. Later ones are added here. */
const REPRESENTATIONS = { columns, write: note } satisfies Record<CreateCommand["op"], unknown>;
const representation = (op: CreateCommand["op"]) => REPRESENTATIONS[op] as unknown as Representation<unknown, CreateCommand>;
const isCreate = (c: Command): c is CreateCommand => c.op in REPRESENTATIONS;

/** A board page in grid cells. A digit fills one cell. */
export interface PageSize {
  cols: number;
  rows: number;
}
export const DEFAULT_PAGE: PageSize = { cols: 24, rows: 16 };
export const MAX_PAGES = 20;
export const MAX_COMMANDS = 40;
/** Cells kept free at each page edge and between objects. */
const MARGIN = 1;

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
  /** Annotations a representation owns (regroups), to their object. */
  owners: Record<string, string>;
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

/** One stroke of the child's, as the test whiteboard records it. Maya never changes or removes it. */
export interface ChildInk {
  id: string;
  page: number;
  stroke: Stroke;
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

const emptyState = (): SceneState => ({ objects: [], owners: {}, view: { page: 1, target: null }, lastPage: 1 });

export function createScene(options: { page?: PageSize; glyphs?: GlyphSet } = {}): Scene {
  return { page: options.page ?? DEFAULT_PAGE, glyphs: options.glyphs ?? PLACEHOLDER_GLYPHS, log: [], child: [], nextSeq: 1, state: emptyState() };
}

// ---------- targets ----------

const targetKey = (t: Target) => [t.objectId, t.part, "rowId" in t ? t.rowId : "", "column" in t ? t.column : "", "index" in t ? t.index : ""].join("|");
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
  const rep = findRep(s, target.objectId) ?? findRep(s, s.owners[target.objectId] ?? "");
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

function childRect(scene: Pick<Scene, "page">, ink: ChildInk): Rect | null {
  const pts = ink.stroke.pts;
  if (ink.stroke.erase || pts.length === 0) return null;
  const xs = pts.map(([x]) => x * scene.page.cols);
  const ys = pts.map(([, y]) => y * scene.page.cols);
  const pad = 0.25;
  return { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + 2 * pad, h: Math.max(...ys) - Math.min(...ys) + 2 * pad };
}

const pageCount = (scene: Pick<Scene, "child">, s: SceneState) => Math.max(1, ...reps(s).map((o) => o.page), ...scene.child.map((c) => c.page));

function fits(scene: Scene, s: SceneState, page: number, r: Rect): boolean {
  const { cols, rows } = scene.page;
  if (r.x < MARGIN || r.y < MARGIN || r.x + r.w > cols - MARGIN || r.y + r.h > rows - MARGIN) return false;
  const around: Rect = { x: r.x - MARGIN, y: r.y - MARGIN, w: r.w + 2 * MARGIN, h: r.h + 2 * MARGIN };
  if (reps(s).some((o) => o.page === page && overlaps(around, o.rect))) return false;
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

const takenIds = (scene: Scene, s: SceneState) => new Set([...s.objects.map((o) => o.id), ...Object.keys(s.owners), ...scene.child.map((c) => c.id)]);

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
    if ("near" in cmd.place) read(cmd.place.near.objectId, s.owners[cmd.place.near.objectId] ?? cmd.place.near.objectId);
    return null;
  }

  switch (cmd.op) {
    case "put":
    case "regroup": {
      const objectId = cmd.op === "put" ? cmd.target.objectId : cmd.objectId;
      const rep = findRep(s, objectId);
      if (!rep) {
        if (s.owners[objectId] || s.objects.some((o) => o.id === objectId)) return refuse("not_writable", `"${objectId}" is an annotation: ${cmd.op} works on a math object.`);
        return resolve(s, { objectId, part: "whole" }) as RefusalBody;
      }
      if (cmd.op === "regroup") {
        const taken = fresh(cmd.id);
        if (taken) return taken;
      }
      const r = representation(rep.op);
      const next =
        cmd.op === "put"
          ? (r.put?.(rep.state, cmd.target, cmd.value, cmd.ink, ctx) ?? refuse("not_writable", `Put does not write in "${rep.id}".`))
          : (r.regroup?.(rep.state, cmd, ctx) ?? refuse("not_allowed", "Regroup works on columns."));
      if (isRefusal(next)) return next.code === "unknown_target" && cmd.op === "put" ? { ...next, valid: repTargets(rep).filter((t) => t.writable).map(publicInfo) } : next;
      rep.state = next;
      write(rep.id);
      if (cmd.op === "regroup") {
        s.owners[cmd.id] = rep.id;
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
      s.objects.push({ kind: "arrow", id: cmd.id, from: cmd.from, to: cmd.to, ink: cmd.ink ?? "red", page: a.page, seq: step.seq });
      step.creates = [cmd.id];
      read(cmd.from.objectId, cmd.to.objectId, a.rep.id, b.rep.id);
      return null;
    }
    case "remove": {
      const id = cmd.objectId;
      if (scene.child.some((c) => c.id === id) || id.startsWith("child-")) return refuse("protected_ink", "That is the child's writing: Maya never removes it.");
      if (s.owners[id]) {
        const rep = findRep(s, s.owners[id])!;
        const next = representation(rep.op).removeOwned?.(rep.state, id) ?? refuse("not_allowed", `"${id}" cannot be removed on its own.`);
        if (isRefusal(next)) return next;
        rep.state = next;
        delete s.owners[id];
        write(id, rep.id, ...dropAnnotationsOn(s, [id]));
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
  const owned = Object.keys(s.owners).filter((k) => s.owners[k] === obj.id);
  for (const k of owned) delete s.owners[k];
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
  return { ok: true, scene: next, drawn: schedule(after.filter((p) => !before.has(p.id))), erased: [...before].filter((id) => !kept.has(id)), notices };
}

/** Adds a stroke the child drew. Child ink is never removed, undone or cleared by Maya's commands. */
export function addChildInk(scene: Scene, ink: { page: number; stroke: Stroke }): { scene: Scene; id: string } {
  const pages = pageCount(scene, scene.state);
  if (!Number.isInteger(ink.page) || ink.page < 1 || ink.page > pages) throw new RangeError(`The board has pages 1 to ${pages}.`);
  const id = `child-${scene.child.length + 1}`;
  return { scene: { ...scene, child: [...scene.child, { id, page: ink.page, stroke: ink.stroke }] }, id };
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

/** The strokes with the command that revealed each one. */
function sequencedPaths(scene: Scene): (BoardPath & { seq: number })[] {
  const s = scene.state;
  const local: { stroke: LocalStroke; owner: string; page: number; dx: number; dy: number }[] = [];
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
