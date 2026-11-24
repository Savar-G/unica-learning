// A bank snapshot: the frozen content of one level, as a file. `validateSnapshot` is the only way to get one, so every
// other module can trust its ids, references, limits and item counts.
import { PRINT_RULES, type Side } from "../contract";
import { canonicalJson, sha256 } from "../hash";
import { digitPlaces, TEMPLATES, type PageTemplate } from "../layout/templates";
import { SHAPES, type Shape, type ShapeLibrary } from "../shapes";
import { isRecord } from "../shapes/shape";
import { FieldReader, isId, type Fields } from "./fields";

export const SNAPSHOT_FORMAT = 1;

export interface SnapshotRow { id: string; shape: Shape; limits: unknown; items: number }
export interface SnapshotSide { instruction: string; template: PageTemplate; rows: SnapshotRow[] }
export interface SnapshotTopic { id: string; code: string; title: string }
export interface SnapshotSheet { id: string; topic: SnapshotTopic; firstPage: number; front: SnapshotSide; back: SnapshotSide }
export interface Snapshot { id: string; level: { id: string; name: string }; sheets: ReadonlyMap<string, SnapshotSheet> }

export type SnapshotResult = { ok: true; snapshot: Snapshot; hash: string } | { ok: false; problems: string[] };

const SIDES: readonly Side[] = ["front", "back"];
const sheetPlace = (id: string) => `Sheet "${id}"`;

/** How a problem names an entry of a list: by its id when that is readable, else by its place in the list. */
const nameOf = (what: string, raw: unknown, index: number) => (isRecord(raw) && isId(raw.id) ? `${what} "${raw.id}"` : `${what} ${index + 1}`);

function readRow(r: FieldReader, place: string, raw: unknown, index: number, shapes: ShapeLibrary): SnapshotRow | null {
  const at = `${place}, ${nameOf("row", raw, index)}`;
  const fields = r.object(at, raw, ["id", "shape", "items", "limits"]);
  if (!fields) return null;
  const id = r.id(at, fields);
  const items = r.count(at, fields, "items");
  const shape = typeof fields.shape === "string" ? shapes.get(fields.shape) : undefined;
  if (!shape) {
    r.problem(at, `there is no shape ${JSON.stringify(fields.shape)}`);
    return null;
  }
  const limits = shape.readLimits(fields.limits);
  if (!limits.ok) {
    r.problem(at, limits.problem);
    return null;
  }
  if (id === null || items === null) return null;
  const possible = shape.count(limits.limits);
  if (possible < items) r.problem(at, `the row asks for ${items} different questions and its limits allow ${possible}`);
  return { id, shape, limits: limits.limits, items };
}

/** A row may not have an easier end than the row of the same shape above it. */
function checkRowsRise(r: FieldReader, place: string, rows: readonly SnapshotRow[]): void {
  rows.forEach((row, i) => {
    const above = rows[i - 1];
    if (!above || above.shape !== row.shape) return;
    const now = row.shape.difficultyRange(row.limits);
    const before = above.shape.difficultyRange(above.limits);
    if (now.easiest < before.easiest || now.hardest < before.hardest) r.problem(`${place}, row "${row.id}"`, "this row is easier than the row above it");
  });
}

function checkFit(r: FieldReader, place: string, template: PageTemplate, rows: readonly SnapshotRow[]): void {
  const asked = rows.reduce((sum, row) => sum + row.items, 0);
  const places = template.sides.front.places.length;
  if (asked > places) r.problem(place, `${asked} questions do not fit the template "${template.id}", which has ${places} places`);
  for (const row of rows) {
    const worst = row.shape.worstCase(row.limits);
    const face = row.shape.face(worst.question);
    const at = `${place}, row "${row.id}"`;
    const needed = digitPlaces(face, worst.answer.value);
    if (!template.faces.includes(face.kind)) r.problem(at, `the template "${template.id}" has no place for a ${face.kind} question`);
    else if (needed > template.digits) r.problem(at, `the widest question, ${face.top} ${face.sign} ${face.bottom} = ${worst.answer.value}, needs ${needed} digit places and the template "${template.id}" has ${template.digits}`);
  }
}

function readSide(r: FieldReader, sheet: string, side: Side, raw: unknown, shapes: ShapeLibrary): SnapshotSide | null {
  const place = `${sheet}, ${side} side`;
  const fields = r.object(place, raw, ["instruction", "template", "rows"]);
  if (!fields) return null;
  const instruction = r.text(place, fields, "instruction", PRINT_RULES.maxInstructionCharacters);
  const template = typeof fields.template === "string" ? TEMPLATES.get(fields.template) : undefined;
  if (!template) r.problem(place, `there is no template ${JSON.stringify(fields.template)}`);
  const rows = r.list(place, fields, "rows").map((row, i) => readRow(r, place, row, i, shapes)).filter((row) => row !== null);
  checkRowsRise(r, place, rows);
  if (template) checkFit(r, place, template, rows);
  return instruction !== null && template ? { instruction, template, rows } : null;
}

type ReadSheet = Omit<SnapshotSheet, "topic">;

function readSheet(r: FieldReader, raw: unknown, index: number, shapes: ShapeLibrary): ReadSheet | null {
  const place = nameOf("Sheet", raw, index);
  const fields = r.object(place, raw, ["id", "firstPage", "front", "back"]);
  if (!fields) return null;
  const id = r.id(place, fields);
  const firstPage = r.count(place, fields, "firstPage");
  if (firstPage !== null && firstPage % 2 === 0) r.problem(place, "firstPage must be odd, because the front of a sheet is a right-hand page");
  const [front, back] = SIDES.map((side) => readSide(r, place, side, fields[side], shapes));
  r.unique("row id", [...(front?.rows ?? []), ...(back?.rows ?? [])].map((row) => row.id), place);
  return id !== null && firstPage !== null && front && back ? { id, firstPage, front, back } : null;
}

type ReadTopic = SnapshotTopic & { sheets: string[] };

function readTopic(r: FieldReader, raw: unknown, index: number, levelName: string): ReadTopic | null {
  const name = nameOf("Topic", raw, index);
  const fields = r.object(name, raw, ["id", "code", "title", "sheets"]);
  if (!fields) return null;
  const id = r.id(name, fields);
  const title = r.text(name, fields, "title", PRINT_RULES.maxTitleCharacters);
  const code = r.text(name, fields, "code", 8);
  const prefix = `${levelName}-`;
  const codeIsGood = code !== null && code.startsWith(prefix) && /^[1-9]\d?$/.test(code.slice(prefix.length));
  if (code !== null && !codeIsGood) r.problem(name, `the code "${code}" must be the level name, a dash and a number, such as ${prefix}1`);
  const sheets: string[] = [];
  for (const sheet of r.list(name, fields, "sheets")) {
    if (typeof sheet === "string") sheets.push(sheet);
    else r.problem(name, "sheets must hold the ids of sheets");
  }
  return id !== null && title !== null && codeIsGood ? { id, code, title, sheets } : null;
}

function readLevel(r: FieldReader, fields: Fields): Snapshot["level"] | null {
  const level = r.object("The level", fields.level, ["id", "name"]);
  if (!level) return null;
  const id = r.id("The level", level);
  const name = r.text("The level", level, "name", 8);
  return id !== null && name !== null ? { id, name } : null;
}

/** Joins each sheet to its topic. Every sheet is in exactly one. */
function joinTopics(r: FieldReader, topics: readonly ReadTopic[], sheets: readonly ReadSheet[], knownSheets: ReadonlySet<string>): Map<string, SnapshotSheet> {
  const owners = new Map<string, SnapshotTopic[]>();
  for (const { sheets: ids, ...topic } of topics) {
    for (const id of ids) {
      if (!knownSheets.has(id)) r.problem(`Topic "${topic.id}"`, `there is no sheet "${id}"`);
      owners.set(id, [...(owners.get(id) ?? []), topic]);
    }
  }
  const joined = new Map<string, SnapshotSheet>();
  for (const sheet of sheets) {
    const [topic, second] = owners.get(sheet.id) ?? [];
    if (!topic) r.problem(sheetPlace(sheet.id), "no topic names this sheet");
    else if (second) r.problem(sheetPlace(sheet.id), "more than one topic names this sheet");
    else joined.set(sheet.id, { ...sheet, topic });
  }
  return joined;
}

export function validateSnapshot(raw: unknown, shapes: ShapeLibrary = SHAPES): SnapshotResult {
  if (!isRecord(raw)) return { ok: false, problems: ["The snapshot must be an object."] };
  const r = new FieldReader();
  const place = "The snapshot";
  const fields = r.object(place, raw, ["format", "id", "level", "topics", "sheets"]);
  if (!fields) return { ok: false, problems: r.problems };
  if (fields.format !== SNAPSHOT_FORMAT) r.problem(place, `format must be ${SNAPSHOT_FORMAT}`);
  const id = r.id(place, fields);
  const level = readLevel(r, fields);
  const rawSheets = r.list(place, fields, "sheets");
  const topics = level ? r.list(place, fields, "topics").map((t, i) => readTopic(r, t, i, level.name)).filter((t) => t !== null) : [];
  const sheets = rawSheets.map((s, i) => readSheet(r, s, i, shapes)).filter((s) => s !== null);
  r.unique("topic id", topics.map((t) => t.id));
  r.unique("topic code", topics.map((t) => t.code));
  r.unique("sheet id", sheets.map((s) => s.id));
  r.unique("page number", sheets.map((s) => s.firstPage));
  const known = new Set(rawSheets.filter(isRecord).map((s) => s.id).filter((s) => typeof s === "string"));
  const joined = joinTopics(r, topics, sheets, known);
  if (r.problems.length > 0 || id === null || level === null) return { ok: false, problems: r.problems };
  return { ok: true, snapshot: { id, level, sheets: joined }, hash: sha256(canonicalJson(raw)) };
}
