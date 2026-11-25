import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "./hash";

/** The definition: JSON of objects whose keys are put in order. Stored hashes depend on each byte of it. */
const definition = (value: unknown): string => JSON.stringify(value, (_key, v: unknown) =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    : v);

describe("canonical JSON", () => {
  it.each<[string, unknown]>([
    ["keys in another order", { b: 1, a: { d: [1, { z: 1, y: 2 }], c: null } }], ["keys that are numbers", { b: 1, 10: 2, 9: 3, "01": 4, "-1": 5 }],
    ["a field with no value", { a: undefined, b: [undefined, 1], c: () => 1, d: Symbol("d") }], ["numbers that JSON has no text for", [Number.NaN, Number.POSITIVE_INFINITY, -0, 1e21, 1e-7]],
    ["a date", { at: new Date(0), b: 1, a: 2 }], ["a value that says its own JSON", { toJSON: () => ({ b: 1, a: 2 }) }], ["a list that says its own JSON", Object.assign([1], { toJSON: () => [2] })], ["nothing", undefined], ["text", "a\"\\ \ud800"], ["no object", null],
    ["an object with no parent", Object.assign(Object.create(null), { b: 1, a: 2 })], ["inherited fields", Object.create({ a: 1 })], ["an object of a number", [new Number(5), new String("x")]], ["a list with a hole", Array.from({ length: 2 }).concat(new Array(2))],
    ["array-index and special keys", JSON.parse('{"a":4,"__proto__":{"x":7},"2":1,"10":2,"00":3,"4294967295":73,"4294967294":74,"🐈":"猫"}')],
    ["inherited toJSON", Object.create({ toJSON() { return { x: 7 }; } })],
  ])("is the same text as the definition: %s", (_name, value) => expect(canonicalJson(value)).toBe(definition(value)));

  it("reads each getter at most one time, also beside an undefined field", () => {
    const make = () => { let calls = 0; return { get a() { return ++calls; }, z: undefined }; };
    expect(canonicalJson(make())).toBe(definition(make()));
    let nestedCalls = 0;
    const nested = { b: [{ get x() { return ++nestedCalls; }, y: undefined }], a: 1 };
    expect(canonicalJson(nested)).toBe('{"a":1,"b":[{"x":1}]}');
    expect(nestedCalls).toBe(1);
  });

  it("is the same text as the definition for any JSON value", () => {
    fc.assert(fc.property(fc.anything({ withNullPrototype: true, withSparseArray: true, withDate: true }), (value) => { expect(canonicalJson(value)).toBe(definition(value)); }), { numRuns: 500 });
    fc.assert(fc.property(fc.jsonValue(), (value) => { expect(canonicalJson(value)).toBe(definition(value)); }), { numRuns: 300 });
  });

  it("does not depend on the order of keys", () => {
    fc.assert(fc.property(fc.dictionary(fc.string(), fc.jsonValue()), (value) => { expect(canonicalJson(Object.fromEntries(Object.entries(value).reverse()))).toBe(canonicalJson(value)); }));
  });
});
