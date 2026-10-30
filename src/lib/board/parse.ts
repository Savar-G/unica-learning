// Checks one command from the model before anything changes. The model's output is untrusted: a command with an unknown
// op, a missing or extra field, a coordinate, or a value out of bounds is refused with a reason, never repaired.
import { refuse, type RefusalBody } from "@/lib/board/representation";
import { MAX_NUMBER_TEXT, valueName } from "@/lib/board/rational";
import { CLEAR_SCOPES, FRACTION_PARTS, INKS, LINE_LABELS, MARK_STYLES, NUMBER_FORMS, OPERATIONS, PLACE_NAMES, REGROUP_KINDS, type Command, type Place, type Target } from "@/lib/board/types";

const ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const OPS = ["columns", "division", "write", "put", "regroup", "mark", "arrow", "remove", "undo", "clear", "focus", "fraction", "number_line", "jump"] as const;
const LATER = ["model"];

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
  const base = object(v, what, ["objectId", "part"], ["rowId", "column", "index", "value"]);
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
    case "value":
      object(v, what, ["objectId", "part", "value"]);
      return { objectId, part: "value", value: exactValue(base.value, `${what}.value`) };
    default:
      if (FRACTION_PARTS.includes(base.part as never)) {
        object(v, what, ["objectId", "part"]);
        return { objectId, part: base.part as (typeof FRACTION_PARTS)[number] };
      }
      return fail(`${what}.part must be one of whole, column, row, cell, word, ${FRACTION_PARTS.join(", ")}, value.`);
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

function wholeNumber(v: unknown, what: string, max: number, where: string): string {
  const value = text(v, what, max);
  if (/^\d+\.\d+$/.test(value)) fail(`Decimals in ${where} are not supported yet.`);
  if (!/^(0|[1-9]\d*)$/.test(value)) fail(`${what} must be a whole number without leading zeros.`);
  return value;
}

/** A whole number written as digits, without leading zeros. */
function digits(v: unknown, what: string): string {
  const t = text(v, what, 3);
  if (!/^(0|[1-9]\d*)$/.test(t)) fail(`${what} must be a whole number of up to 3 digits, without leading zeros.`);
  return t;
}
/** An exact number as text ("-2", "0.25", "2/6", "1 1/2"), in its lowest-terms key ("1/3" for "2/6"). */
function exactValue(v: unknown, what: string): string {
  const name = valueName(text(v, what, MAX_NUMBER_TEXT));
  return typeof name === "string" ? name : fail(`${what}: ${name.reason}`);
}

function parse(raw: unknown): Command {
  const head = object(raw, "A command", ["op"], ["id", "operation", "operands", "dividend", "divisor", "place", "text", "ink", "target", "value", "objectId", "rowId", "kind", "from", "to", "style", "transactionId", "page", "scope", "numerator", "denominator", "whole", "min", "max", "tick", "labels", "form", "lineId", "fromValue", "toValue", "label"]);
  if (LATER.includes(head.op as string)) return fail(`The board cannot draw "${head.op}" yet.`);
  const op = oneOf(head.op, OPS, "op");
  switch (op) {
    case "columns": {
      const c = object(raw, "columns", ["op", "id", "operation", "operands", "place"]);
      if (!Array.isArray(c.operands) || c.operands.length > 4) fail("columns.operands must be a list of up to 4 numbers.");
      const operands = (c.operands as unknown[]).map((o, i) => {
        const operand = object(o, `operand ${i + 1}`, ["id", "value"]);
        return { id: id(operand.id, `operand ${i + 1} id`), value: wholeNumber(operand.value, `operand ${i + 1} value`, 7, "columns") };
      });
      return { op, id: id(c.id, "columns.id"), operation: oneOf(c.operation, OPERATIONS, "columns.operation"), operands, place: placement(c.place) };
    }
    case "division": {
      const c = object(raw, "division", ["op", "id", "dividend", "divisor", "place"]);
      return {
        op,
        id: id(c.id, "division.id"),
        dividend: wholeNumber(c.dividend, "division.dividend", 6, "division"),
        divisor: wholeNumber(c.divisor, "division.divisor", 3, "division"),
        place: placement(c.place),
      };
    }
    case "write": {
      const c = object(raw, "write", ["op", "id", "text", "place"], ["ink"]);
      return { op, id: id(c.id, "write.id"), text: text(c.text, "write.text", 24), place: placement(c.place), ink: ink(c.ink) };
    }
    case "put": {
      const c = object(raw, "put", ["op", "target"], ["value", "ink"]);
      // A digit, an answer row or a number-line label: each representation checks its own form and length.
      return { op, target: target(c.target), ...(c.value === undefined ? {} : { value: text(c.value, "put.value", MAX_NUMBER_TEXT) }), ink: ink(c.ink) };
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
    case "fraction": {
      const c = object(raw, "fraction", ["op", "id", "numerator", "denominator", "place"], ["whole", "ink"]);
      const whole = c.whole === undefined ? {} : { whole: digits(c.whole, "fraction.whole") };
      return { op, id: id(c.id, "fraction.id"), numerator: digits(c.numerator, "fraction.numerator"), denominator: digits(c.denominator, "fraction.denominator"), ...whole, place: placement(c.place), ink: ink(c.ink) };
    }
    case "number_line": {
      const c = object(raw, "number_line", ["op", "id", "min", "max", "tick", "place"], ["labels", "form"]);
      return {
        op,
        id: id(c.id, "number_line.id"),
        min: text(c.min, "number_line.min", MAX_NUMBER_TEXT),
        max: text(c.max, "number_line.max", MAX_NUMBER_TEXT),
        tick: text(c.tick, "number_line.tick", MAX_NUMBER_TEXT),
        ...(c.labels === undefined ? {} : { labels: oneOf(c.labels, LINE_LABELS, "number_line.labels") }),
        ...(c.form === undefined ? {} : { form: oneOf(c.form, NUMBER_FORMS, "number_line.form") }),
        place: placement(c.place),
      };
    }
    case "jump": {
      const c = object(raw, "jump", ["op", "id", "lineId", "fromValue", "toValue"], ["label", "ink"]);
      const label = c.label === undefined ? {} : { label: text(c.label, "jump.label", MAX_NUMBER_TEXT) };
      return { op, id: id(c.id, "jump.id"), lineId: id(c.lineId, "jump.lineId"), fromValue: text(c.fromValue, "jump.fromValue", MAX_NUMBER_TEXT), toValue: text(c.toValue, "jump.toValue", MAX_NUMBER_TEXT), ...label, ink: ink(c.ink) };
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
