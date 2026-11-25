import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canonicalJson, seedFrom } from "../hash";
import { SHAPES, shapeLibrary, type Shape } from "../shapes";
import { mulColumn } from "../shapes/mul-column";
import { addItem, addQuestions, addRegistration, addShape, lessRegistration, lessShape, type AddLimits, type AddQuestion, type LessLimits, type LessQuestion } from "./example-shapes";
import { addShapeFingerprints, fingerprintFileName, fingerprintFileText, fingerprintProblem, FINGERPRINTS_DIR, readShapeFingerprints, shapeFingerprint, type ShapeFingerprints } from "./shape-fingerprints";
import { step, type ShapeRegistration } from "./shape-registration";
import { SHAPE_REGISTRATIONS } from "./shape-registrations";

const committed = readShapeFingerprints();

const add = (change: Partial<Shape<AddLimits, AddQuestion>> = {}): Shape => ({ ...addShape, ...change }) as Shape;
const other = { steps: ({ a, b }: AddQuestion) => [step(`${b} + ${a} = ${a + b}`), step(String(a + b))] };
const A = "a".repeat(64);
const now = (shape = add(), registration: ShapeRegistration = addRegistration) => shapeFingerprint(shape, registration);

describe("the fingerprint of a shape", () => {
  const was = now();

  it("is the same in each run", () => expect(now()).toBe(was));

  it("changes with any part of the output of any one question of a listed space", () => {
    const all = addQuestions(addRegistration.cases[0].limits as unknown as AddLimits);
    const changes: ((question: AddQuestion) => Partial<Shape<AddLimits, AddQuestion>>)[] = [
      (one) => ({ steps: (q) => (canonicalJson(q) === canonicalJson(one) ? [step("?")] : addShape.steps(q)) }),
      (one) => ({ answer: (q) => (canonicalJson(q) === canonicalJson(one) ? { kind: "whole-number", value: "0" } : addShape.answer(q)) }),
      (one) => ({ difficulty: (q) => addShape.difficulty(q) + (canonicalJson(q) === canonicalJson(one) ? 1 : 0) }),
      (one) => ({ face: (q) => ({ ...addShape.face(q), ...(canonicalJson(q) === canonicalJson(one) ? { sign: "-" } : {}) }) }),
      (one) => ({ solveAgain: (rows) => (rows.join() === `${one.a},+${one.b}` ? null : addShape.solveAgain(rows)) }),
    ];
    fc.assert(fc.property(fc.constantFrom(...all), fc.constantFrom(...changes), (question, change) => { expect(now(add(change(question)))).not.toBe(was); }), { numRuns: 60 });
  });

  it.each<[string, Partial<Shape<AddLimits, AddQuestion>>]>([
    ["count", { count: (l) => addShape.count(l) + 1 }],
    ["range", { difficultyRange: (l) => ({ ...addShape.difficultyRange(l), hardest: 500 }) }],
    ["worst case", { worstCase: () => addItem({ a: 1, b: 1 }) }],
    ["question of a seed", { generate: (l, seed) => addShape.generate(l, `${seed}.`) }],
    ["answer of a seed", { generate: (l, seed) => ({ ...addShape.generate(l, seed), answer: { kind: "whole-number", value: "0" } }) }],
    ["id", { id: "test.other" }],
    ["answer kind", { answerKind: "word" as "whole-number" }],
  ])("changes with the %s", (_name, change) => expect(now(add(change))).not.toBe(was));

  it.each<[string, Partial<ShapeRegistration>]>([
    ["cases", { cases: addRegistration.cases.slice(1) }],
    ["small spaces", { smallSpaces: addRegistration.smallSpaces.slice(1) }],
    ["space", { space: (addRegistration.space as string[][]).slice(1) }],
  ])("changes with the registered %s, so that another list is no way round it", (_name, change) => expect(now(add(), { ...addRegistration, ...change })).not.toBe(was));

  it("covers 1,000 questions of seeds of the form of the build, and each small space, when the space cannot be listed", () => {
    const seeds: string[] = [];
    const questions = new Set<string>();
    const watched = { ...lessShape, generate: (l: LessLimits, seed: string) => { seeds.push(seed); const item = lessShape.generate(l, seed); questions.add(canonicalJson(item.question)); return item; } } as Shape;
    const base = shapeFingerprint(watched, lessRegistration);
    expect(seeds.length).toBeGreaterThanOrEqual(1000);
    expect(seeds.every((s) => s.length === seedFrom("a").length && /^[0-9a-f]+$/.test(s))).toBe(true);
    const changedAt = (key: string) => shapeFingerprint({ ...lessShape, steps: (q: LessQuestion) => (canonicalJson(q) === key ? [step("?")] : lessShape.steps(q)) } as Shape, lessRegistration);
    const covered = [...questions].filter((_q, i) => i % 125 === 0);
    for (const key of [...covered, ...[[200, 5], [200, 6], [201, 5], [201, 6]].map(([a, b]) => canonicalJson({ a, b }))]) expect(changedAt(key)).not.toBe(base);
  });

  it("also covers every listed question of a large space that no seed or small space hits", () => {
    const listedRow: [string, string] = ["777", "-77"];
    const listedKey = canonicalJson({ a: 777, b: 77 });
    const regWithListed: ShapeRegistration = { ...lessRegistration, space: { ...(lessRegistration.space as Exclude<ShapeRegistration["space"], readonly unknown[]>), listed: [listedRow] } };
    const seenBySeed = new Set<string>();
    const watched = { ...lessShape, generate: (l: LessLimits, seed: string) => { const item = lessShape.generate(l, seed); seenBySeed.add(canonicalJson(item.question)); return item; } } as Shape;
    const base = shapeFingerprint(watched, regWithListed);
    expect(seenBySeed.has(listedKey)).toBe(false);
    const mutated = { ...lessShape, steps: (q: LessQuestion) => (canonicalJson(q) === listedKey ? [step("?")] : lessShape.steps(q)) } as Shape;
    expect(shapeFingerprint(mutated, regWithListed)).not.toBe(base);
  });
});

describe("the version and the stored fingerprints of a shape", () => {
  it.each<[string, Shape, unknown, RegExp]>([
    ["another output with the same version", add(other), { "test.add": { 1: now() } }, /the output changed and the version is still 1/],
    ["a version with no fingerprint", add({ version: 2 }), { "test.add": { 1: A } }, /version 2 has no fingerprint/],
    ["a shape with no fingerprint", add(), {}, /version 1 has no fingerprint/],
    ["a version that is gone", add({ version: 3 }), { "test.add": { 1: A, 3: A } }, /the fingerprint of version 2 is gone/],
    ["a version above the one of the shape", add(), { "test.add": { 1: A, 2: A } }, /the stored version 2 is higher than the version 1/],
    ["a version that is no number", add(), { "test.add": { "01": A } }, /the stored entry "01"/],
    ["a fingerprint that is no SHA-256", add(), { "test.add": { 1: "a" } }, /the stored entry "1"/],
    ["a shape with a list", add(), { "test.add": [A] }, /must be an object/],
    ["a store that is a list", add(), [], /must hold an object/],
    ["a fingerprint that the store inherits", add({ id: "constructor" }), {}, /version 1 has no fingerprint/],
    ...[0, -2, 1.5, Number.NaN].map((version): [string, Shape, unknown, RegExp] => [`the version ${version}`, add({ version }), {}, /must be a whole number of 1 or more/]),
  ])("%s is a problem", (_name, shape, store, message) => expect(fingerprintProblem(shape, addRegistration, store)).toMatch(message));

  it("a new version with its fingerprint is good, with any older ones", () => {
    const next = add({ ...other, version: 2 });
    expect(fingerprintProblem(next, addRegistration, { "test.add": { 1: A, 2: now(next) } })).toBeNull();
  });
});

describe("adding fingerprints", () => {
  const library = (change: Partial<Shape<AddLimits, AddQuestion>> = {}) => shapeLibrary([add(change)]);
  const first: ShapeFingerprints = { "test.add": { 1: now() } };
  it.each<[string, Parameters<typeof addShapeFingerprints>, ReturnType<typeof addShapeFingerprints>]>([
    ["adds the first version", [library(), [addRegistration], {}], { ok: true, added: ["test.add@1"], fingerprints: first }],
    ["adds nothing when the output is the same", [library(), [addRegistration], first], { ok: true, added: [], fingerprints: first }],
    ["adds a new version and keeps the older ones, and other shapes", [library({ ...other, version: 2 }), [addRegistration], { ...first, "a.other": { 1: A } }], { ok: true, added: ["test.add@2"], fingerprints: { "a.other": { 1: A }, "test.add": { ...first["test.add"], 2: now(add({ ...other, version: 2 })) } } }],
  ])("%s", (_name, args, result) => expect(addShapeFingerprints(...args)).toEqual(result));

  it("writes one file for each shape with its versions sorted", () => {
    const text = fingerprintFileText("a.one", { 2: A, 1: A });
    expect(text.split("\n")).toEqual(["{", `  "a.one": { "1": "${A}", "2": "${A}" }`, "}", ""]);
    expect(JSON.parse(text)).toEqual({ "a.one": { 1: A, 2: A } });
    expect(["a.one", "a-one"].map(fingerprintFileName)).toEqual(["a.one.json", "a-one.json"]);
  });

  it.each<[string, Parameters<typeof addShapeFingerprints>, RegExp]>([
    ["another output with the same version", [library(other), [addRegistration], first], /\[test\.add\] fingerprint: the output changed.*a stored fingerprint never changes/],
    ["an older version that is gone", [library({ version: 2 }), [addRegistration], {}], /the fingerprint of version 1 is gone/],
    ["a version that is no number", [new Map([["test.add", add({ version: 0.5 })]]), [addRegistration], {}], /must be a whole number/],
    ["a shape with no registration", [library(), [], {}], /\[test\.add\] registration: the shape is in SHAPES and has no registration/],
    ["a registration with an empty list", [library(), [{ ...addRegistration, refusedRows: [] }], {}], /refusedRows must not be empty/],
    ["a file that holds a list", [library(), [addRegistration], []], /must hold an object/],
  ])("refuses %s", (_name, args, message) => {
    const result = addShapeFingerprints(...args);
    expect(result.ok ? "added" : result.problems.join("\n")).toMatch(message);
  });
});

describe("the command", () => {
  let dir = "";
  beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "shape-fingerprints-")); });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const run = (folder: string) => new Promise<{ code: number; output: string }>((done) => {
    execFile(process.execPath, ["scripts/shape-fingerprints.mjs", "--dir", folder], (error, stdout, stderr) => done({ code: error ? 1 : 0, output: stdout + stderr }));
  });
  const current = String(mulColumn.version);
  const olderVersions = Object.fromEntries(Object.entries(committed["mul.column"]).filter(([v]) => v !== current));

  it("adds what is missing, and changes no stored fingerprint", async () => {
    const [missing, changed] = [join(dir, "missing"), join(dir, "changed")];
    mkdirSync(missing);
    mkdirSync(changed);
    const fileName = fingerprintFileName("mul.column");
    writeFileSync(join(missing, fileName), fingerprintFileText("mul.column", olderVersions));
    writeFileSync(join(changed, fileName), fingerprintFileText("mul.column", { ...olderVersions, [current]: A }));
    const [added, refused] = await Promise.all([run(missing), run(changed)]);
    expect(added).toEqual({ code: 0, output: expect.stringContaining(`mul.column@${current}`) as unknown });
    expect(readFileSync(join(missing, fileName), "utf8")).toBe(readFileSync(join(FINGERPRINTS_DIR, fileName), "utf8"));
    expect(refused).toEqual({ code: 1, output: expect.stringMatching(/a stored fingerprint never changes/) as unknown });
    expect(readFileSync(join(changed, fileName), "utf8")).toContain(A);
    expect(addShapeFingerprints(SHAPES, SHAPE_REGISTRATIONS, committed)).toEqual({ ok: true, added: [], fingerprints: committed });
  });
});
