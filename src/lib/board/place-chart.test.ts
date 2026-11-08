// The place chart (design: .design/research/maya-place-value-design.md). Synthetic numbers only.
import { describe, expect, it } from "vitest";
import { applyBatch, boardTargets, createScene, type Scene } from "@/lib/board";

const ok = (scene: Scene, ...commands: unknown[]) => {
  const r = applyBatch(scene, { transactionId: `t${scene.log.length}`, commands });
  if (!r.ok) throw new Error(JSON.stringify(r.refusal));
  return r.scene;
};
const refused = (scene: Scene, ...commands: unknown[]) => {
  const r = applyBatch(scene, { transactionId: `r${scene.log.length}`, commands });
  if (r.ok) throw new Error("expected a refusal");
  return r.refusal;
};
const chart = (number: string, mode?: "build") => ({ op: "place_chart", id: "c", number, ...(mode ? { mode } : {}), place: { region: "main" } });
const cell = (rowId: string, column: string) => ({ objectId: "c", part: "cell", rowId, column });
const row = (rowId: string) => ({ objectId: "c", part: "row", rowId });
const targetsOf = (scene: Scene) => boardTargets(scene);

describe("place chart", () => {
  it("lays out one column for each place of the number, with the digits read from the number", () => {
    const scene = ok(createScene(), chart("53172"));
    const t = targetsOf(scene);
    const digit = (column: string) => t.find((x) => x.target.part === "cell" && x.target.rowId === "digits" && x.target.column === column)?.value;
    expect([digit("ten_thousands"), digit("thousands"), digit("hundreds"), digit("tens"), digit("ones")]).toEqual(["5", "3", "1", "7", "2"]);
  });

  it("pads a short number with empty columns, so every chart is about as wide", () => {
    const columns = (n: string) => targetsOf(ok(createScene(), chart(n))).filter((x) => x.target.part === "column").length;
    expect(columns("312")).toBe(4);
    expect(columns("53172")).toBe(5);
    expect(columns("785243")).toBe(6);
    expect(columns("5.8")).toBe(4);
  });

  it("refuses a wrong value and a sentence the number does not make; accepts the right ones", () => {
    const scene = ok(createScene(), chart("53172"));
    expect(refused(scene, { op: "put", target: cell("value", "ten_thousands"), value: "5000" })).toMatchObject({ code: "wrong_value" });
    expect(refused(scene, { op: "put", target: row("equation"), value: "5 × 10,000 = 5,000" })).toMatchObject({ code: "wrong_value" });
    expect(refused(scene, { op: "put", target: row("equation"), value: "1 > 7" })).toMatchObject({ code: "wrong_value" });
    const next = ok(scene, { op: "put", target: cell("value", "ten_thousands"), value: "50000" }, { op: "put", target: row("equation"), value: "5 × 10,000 = 50,000" });
    expect(refused(next, { op: "put", target: row("equation"), value: "5 × 10,000 = 50,000" })).toMatchObject({ code: "already_written" });
    expect(targetsOf(next).find((x) => x.target.part === "row" && x.target.rowId === "equation")?.value).toBe("5 × 10,000 = 50,000");
  });

  it("compares two digits of the number: only the true sentence is written", () => {
    const scene = ok(createScene(), chart("785243"));
    expect(refused(scene, { op: "put", target: row("equation"), value: "8 < 2" })).toMatchObject({ code: "wrong_value" });
    expect(() => ok(scene, { op: "put", target: row("equation"), value: "8 > 2" })).not.toThrow();
  });

  it("builds a decimal from its parts: the digit row starts empty and only the right digit goes in", () => {
    const scene = ok(createScene(), chart("5.8", "build"));
    const digit = (s: Scene, column: string) => targetsOf(s).find((x) => x.target.part === "cell" && x.target.rowId === "digits" && x.target.column === column);
    expect(digit(scene, "ones")).toMatchObject({ value: null, writable: true });
    expect(refused(scene, { op: "put", target: cell("digits", "tenths"), value: "5" })).toMatchObject({ code: "wrong_value" });
    expect(refused(scene, { op: "put", target: cell("value", "tenths"), value: "0.8" })).toMatchObject({ code: "not_allowed" });
    const next = ok(scene, { op: "put", target: cell("digits", "ones"), value: "5" });
    expect(digit(next, "ones")).toMatchObject({ value: "5", writable: false });
    expect(refused(next, { op: "put", target: cell("digits", "ones"), value: "5" })).toMatchObject({ code: "already_written" });
  });

  it("values of a decimal place are exact", () => {
    const scene = ok(createScene(), chart("5.8", "build"), { op: "put", target: cell("digits", "tenths"), value: "8" });
    expect(() => ok(scene, { op: "put", target: cell("value", "tenths"), value: "0.8" })).not.toThrow();
  });

  it("never writes in a padded column, and refuses a decimal build of a whole number", () => {
    const scene = ok(createScene(), chart("312"));
    expect(refused(scene, { op: "put", target: cell("value", "thousands"), value: "0" })).toMatchObject({ code: "not_writable" });
    expect(refused(createScene(), chart("312", "build"))).toMatchObject({ code: "unsupported" });
  });

  it("highlights a column through its band, a rounded stripe inside the chart's frame", () => {
    const scene = ok(createScene(), chart("53172"));
    const marked = applyBatch(scene, { transactionId: "m", commands: [{ op: "mark", id: "m1", target: { objectId: "c", part: "piece", piece: "band-ten_thousands" }, style: "highlight" }] });
    expect(marked.ok).toBe(true);
    if (!marked.ok) return;
    const stripe = marked.drawn.find((p) => p.kind === "highlight")!;
    // It is vertical (one x), and it keeps to the digit's column.
    expect(new Set(stripe.pts.map((p) => p[0])).size).toBe(1);
    expect(stripe.pts[1][1]).toBeGreaterThan(stripe.pts[0][1]);
  });
});
