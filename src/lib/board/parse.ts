// Checks one command from the model before anything changes. The model's output is untrusted: a command with an unknown
// op, a missing or extra field, a coordinate, or a value out of bounds is refused with a reason, never repaired.
import { parseModel } from "@/lib/board/model";
import { refuse, type RefusalBody } from "@/lib/board/representation";
import { CLEAR_SCOPES, INKS, MARK_STYLES, OPERATIONS, PLACE_NAMES, REGROUP_KINDS, type Command, type Place, type Target } from "@/lib/board/types";

const ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const OPS = ["columns", "write", "model", "put", "regroup", "mark", "arrow", "remove", "undo", "clear", "focus"] as const;
const LATER = ["division", "fraction", "number_line", "jump"];

class Invalid extends Error {}
const fail = (reason: string): never => {
  throw new Invalid(reason);
};

type Obj = Record<string, unknown>;
function object(v: unknown, what: string, required: string[], optional: string[] = []): Obj {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return fail(`${what} must be an object.`);
  const o = v as Obj;
  for (const k of required) if (o[k] === undefined) fail(`${what} needs "${k}".`);
  for (const k of Object.keys(o)) if (!required.includes(k) && !optional.includes(k)) fail(`${what} has an unknown field "${k}".`);
  return o;
}
function id(v: unknown, what: string): string {
  if (typeof v !== "string" || !ID.test(v)) return fail(`${what} must be a short id of letters, digits, "_" or "-", starting with a letter.`);
  if (v.startsWith("child-")) fail(`${what} cannot start with "child-": those ids are the child's writing.`);
  return v;
}
function oneOf<T extends string>(v: unknown, values: readonly T[], what: string): T {
  if (!values.includes(v as T)) fail(`${what} must be one of ${values.join(", ")}.`);
  return v as T;
}
const ink = (v: unknown) => (v === undefined ? undefined : oneOf(v, INKS, "ink"));
const place = (v: unknown) => oneOf(v, PLACE_NAMES, "column");

function target(v: unknown, what = "target"): Target {
  const base = object(v, what, ["objectId", "part"], ["rowId", "column", "index", "piece"]);
  const objectId = id(base.objectId, `${what}.objectId`);
  switch (base.part) {
    case "whole":
      object(v, what, ["objectId", "part"]);
      return { objectId, part: "whole" };
    case "column":
      object(v, what, ["objectId", "part", "column"]);
      return { objectId, part: "column", column: place(base.column) };
    case "row":
      object(v, what, ["objectId", "part", "rowId"]);
      return { objectId, part: "row", rowId: id(base.rowId, `${what}.rowId`) };
    case "cell":
      object(v, what, ["objectId", "part", "rowId", "column"]);
      return { objectId, part: "cell", rowId: id(base.rowId, `${what}.rowId`), column: place(base.column) };
    case "word":
      object(v, what, ["objectId", "part", "index"]);
      if (!Number.isInteger(base.index) || (base.index as number) < 0 || (base.index as number) > 50) fail(`${what}.index must be a word number from 0.`);
      return { objectId, part: "word", index: base.index as number };
    case "piece":
      object(v, what, ["objectId", "part", "piece"]);
      if (typeof base.piece !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(base.piece)) fail(`${what}.piece must be a part name the board gave.`);
      return { objectId, part: "piece", piece: base.piece as string };
    default:
      return fail(`${what}.part must be one of whole, column, row, cell, word, piece.`);
  }
}

function placement(v: unknown): Place {
  const o = object(v, "place", [], ["region", "below", "rightOf", "near", "side"]);
  if (o.near !== undefined) {
    object(v, "place", ["near", "side"]);
    return { near: target(o.near, "place.near"), side: oneOf(o.side, ["right", "below"] as const, "place.side") };
  }
  const keys = Object.keys(o);
  if (keys.length !== 1) fail('place needs exactly one of "region", "below", "rightOf" or "near" with "side".');
  if (keys[0] === "region") return { region: oneOf(o.region, ["main"] as const, "place.region") };
  if (keys[0] === "below") return { below: id(o.below, "place.below") };
  return { rightOf: id(o.rightOf, "place.rightOf") };
}

function text(v: unknown, what: string, max: number): string {
  if (typeof v !== "string" || v.length === 0 || v.length > max) return fail(`${what} must be text of 1 to ${max} characters.`);
  return v;
}

function parse(raw: unknown): Command {
  const head = object(raw, "A command", ["op"], ["id", "operation", "operands", "model", "place", "text", "ink", "target", "value", "objectId", "rowId", "kind", "from", "to", "style", "transactionId", "page", "scope"]);
  if (LATER.includes(head.op as string)) return fail(`The board cannot draw "${head.op}" yet.`);
  const op = oneOf(head.op, OPS, "op");
  switch (op) {
    case "columns": {
      const c = object(raw, "columns", ["op", "id", "operation", "operands", "place"]);
      if (!Array.isArray(c.operands) || c.operands.length > 4) fail("columns.operands must be a list of up to 4 numbers.");
      const operands = (c.operands as unknown[]).map((o, i) => {
        const operand = object(o, `operand ${i + 1}`, ["id", "value"]);
        const value = text(operand.value, `operand ${i + 1} value`, 7);
        if (/^\d+\.\d+$/.test(value)) fail("Decimals in columns are not supported yet.");
        if (!/^(0|[1-9]\d*)$/.test(value)) fail(`operand ${i + 1} value must be a whole number without leading zeros.`);
        return { id: id(operand.id, `operand ${i + 1} id`), value };
      });
      return { op, id: id(c.id, "columns.id"), operation: oneOf(c.operation, OPERATIONS, "columns.operation"), operands, place: placement(c.place) };
    }
    case "write": {
      const c = object(raw, "write", ["op", "id", "text", "place"], ["ink"]);
      return { op, id: id(c.id, "write.id"), text: text(c.text, "write.text", 24), place: placement(c.place), ink: ink(c.ink) };
    }
    case "model": {
      const c = object(raw, "model", ["op", "id", "model", "place"], ["ink"]);
      const spec = parseModel(c.model);
      if (typeof spec === "string") return fail(spec);
      return { op, id: id(c.id, "model.id"), model: spec, place: placement(c.place), ink: ink(c.ink) };
    }
    case "put": {
      const c = object(raw, "put", ["op", "target", "value"], ["ink"]);
      return { op, target: target(c.target), value: text(c.value, "put.value", 7), ink: ink(c.ink) };
    }
    case "regroup": {
      const c = object(raw, "regroup", ["op", "id", "objectId", "rowId", "kind", "from", "to"], ["ink"]);
      return {
        op,
        id: id(c.id, "regroup.id"),
        objectId: id(c.objectId, "regroup.objectId"),
        rowId: id(c.rowId, "regroup.rowId"),
        kind: oneOf(c.kind, REGROUP_KINDS, "regroup.kind"),
        from: place(c.from),
        to: place(c.to),
        ink: ink(c.ink),
      };
    }
    case "mark": {
      const c = object(raw, "mark", ["op", "id", "target", "style"], ["ink"]);
      return { op, id: id(c.id, "mark.id"), target: target(c.target), style: oneOf(c.style, MARK_STYLES, "mark.style"), ink: ink(c.ink) };
    }
    case "arrow": {
      const c = object(raw, "arrow", ["op", "id", "from", "to"], ["ink"]);
      return { op, id: id(c.id, "arrow.id"), from: target(c.from, "arrow.from"), to: target(c.to, "arrow.to"), ink: ink(c.ink) };
    }
    case "remove": {
      const c = object(raw, "remove", ["op", "objectId"]);
      if (typeof c.objectId === "string" && c.objectId.startsWith("child-")) return { op, objectId: c.objectId };
      return { op, objectId: id(c.objectId, "remove.objectId") };
    }
    case "undo": {
      const c = object(raw, "undo", ["op", "transactionId"]);
      return { op, transactionId: text(c.transactionId, "undo.transactionId", 64) };
    }
    case "clear": {
      const c = object(raw, "clear", ["op", "scope"], ["page"]);
      if (c.page !== undefined && (!Number.isInteger(c.page) || (c.page as number) < 1)) fail("clear.page must be a page number from 1.");
      return { op, scope: oneOf(c.scope, CLEAR_SCOPES, "clear.scope"), ...(c.page === undefined ? {} : { page: c.page as number }) };
    }
    case "focus": {
      const c = object(raw, "focus", ["op", "target"]);
      return { op, target: target(c.target) };
    }
  }
}

/** The command, or why it is refused. */
export function parseCommand(raw: unknown): Command | RefusalBody {
  try {
    return parse(raw);
  } catch (e) {
    if (e instanceof Invalid) return refuse(/cannot draw|not supported/.test(e.message) ? "unsupported" : "invalid_command", e.message);
    throw e;
  }
}
