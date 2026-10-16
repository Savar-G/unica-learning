import { describe, expect, it } from "vitest";
import { STROKES_MAX_BYTES, WORK_IMAGE_MAX_BYTES, WORK_TEXT_MAX } from "@/lib/test-api";
import { parseWork, workPath } from "@/lib/work-payload";

// A real 1 x 1 PNG.
const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** PNG-looking bytes of an exact size: the signature, then filler. */
const pngOfSize = (bytes: number) => {
  const buf = Buffer.alloc(bytes, 7);
  Buffer.from(SIGNATURE).copy(buf);
  return buf.toString("base64");
};

describe("the work sent with an answer (#67)", () => {
  it("no work at all is an empty board", () => {
    for (const raw of [undefined, null, {}]) expect(parseWork(raw), String(raw)).toEqual({ ok: true, png: null, text: "", strokes: null });
  });

  it("takes a PNG drawing and typed working", () => {
    const parsed = parseWork({ image: PNG_1PX, text: "  45 + 30 = 75\n" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect([...parsed.png!.subarray(0, 8)]).toEqual(SIGNATURE);
    expect(parsed.png!.length).toBe(Buffer.from(PNG_1PX, "base64").length);
    expect(parsed.text).toBe("45 + 30 = 75");
  });

  it("takes a drawing exactly at the size limit, and refuses one byte more with a clear message", () => {
    expect(parseWork({ image: pngOfSize(WORK_IMAGE_MAX_BYTES) }).ok).toBe(true);
    const over = parseWork({ image: pngOfSize(WORK_IMAGE_MAX_BYTES + 1) });
    expect(over).toMatchObject({ ok: false, error: "work_too_big" });
    expect(!over.ok && over.message).toMatch(/drawing/i);
  });

  it("refuses a huge drawing before decoding it", () => {
    expect(parseWork({ image: "A".repeat(WORK_IMAGE_MAX_BYTES * 2) })).toMatchObject({ ok: false, error: "work_too_big" });
  });

  it("takes typed working up to the limit in characters, and refuses more with a clear message", () => {
    expect(parseWork({ text: "7".repeat(WORK_TEXT_MAX) }).ok).toBe(true);
    // An emoji is one character to the child, two UTF-16 units to JavaScript.
    expect(parseWork({ text: "🍎".repeat(WORK_TEXT_MAX) }).ok).toBe(true);
    const over = parseWork({ text: "7".repeat(WORK_TEXT_MAX + 1) });
    expect(over).toMatchObject({ ok: false, error: "work_too_big" });
    expect(!over.ok && over.message).toMatch(/typed/i);
  });

  it("refuses anything that is not a PNG or not text", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46]).toString("base64");
    for (const raw of [
      "work",
      { image: jpeg },
      { image: "not base64!" },
      { image: `data:image/png;base64,${PNG_1PX}` },
      { image: 42 },
      { image: "" },
      { text: 42 },
      { text: ["a"] },
    ]) {
      expect(parseWork(raw), JSON.stringify(raw)).toMatchObject({ ok: false, error: "invalid" });
    }
  });
});

describe("the whiteboard strokes sent with an answer (#186)", () => {
  const RECORDING = { v: 1, width: 800, height: 600, events: [
    { kind: "stroke", erase: false, w: 3.2, pts: [[0.1, 0.2, 400], [0.15, 0.25, 480]] },
    { kind: "undo", t: 900 },
    { kind: "stroke", erase: true, w: 26, pts: [[0.12, 0.22, 1000]] },
    { kind: "clear", t: 2000 },
  ] };

  it("are stored as JSON holding only the recording, whatever else the request adds", () => {
    const parsed = parseWork({ image: PNG_1PX, strokes: { ...RECORDING, name: "Asha", events: RECORDING.events.map((e) => ({ ...e, note: "x" })) } });
    expect(parsed.ok && parsed.strokes !== null && JSON.parse(parsed.strokes)).toEqual(RECORDING);
  });

  /** A recording whose JSON is exactly `size` bytes: one stroke of [0,0,0] points, the last point's time sets the rest. */
  const ofSize = (size: number) => {
    const make = (n: number, t: number) => ({ v: 1, width: 800, height: 600, events: [{ kind: "stroke", erase: false, w: 3, pts: [...Array.from({ length: n - 1 }, () => [0, 0, 0]), [0, 0, t]] }] });
    const extra = size - JSON.stringify(make(1, 0)).length;
    const made = make(1 + Math.floor(extra / 8), extra % 8 === 0 ? 0 : 10 ** (extra % 8));
    expect(JSON.stringify(made).length).toBe(size);
    return made;
  };

  it("are taken up to the size limit; over it they are left out and the answer still goes", () => {
    expect(parseWork({ image: PNG_1PX, strokes: ofSize(STROKES_MAX_BYTES) })).toMatchObject({ ok: true, strokes: expect.any(String) });
    const over = parseWork({ image: PNG_1PX, text: "12", strokes: ofSize(STROKES_MAX_BYTES + 1) });
    expect(over).toMatchObject({ ok: true, text: "12", strokes: null, strokesDropped: "too_big" });
    expect(over.ok && over.png).not.toBeNull();
  });

  it("that are not a recording are left out, and the answer still goes", () => {
    const stroke = RECORDING.events[0];
    for (const strokes of [
      "strokes",
      [],
      { ...RECORDING, v: 2 },
      { ...RECORDING, width: 0 },
      { ...RECORDING, events: [] },
      { ...RECORDING, events: [{ kind: "undo", t: 5 }] },
      { ...RECORDING, events: [{ ...stroke, pts: [] }] },
      { ...RECORDING, events: [{ ...stroke, pts: [[0.1, 0.2]] }] },
      { ...RECORDING, events: [{ ...stroke, pts: [[0.1, "0.2", 5]] }] },
      { ...RECORDING, events: [{ ...stroke, pts: [[0.1, 0.2, -1]] }] },
      { ...RECORDING, events: [{ ...stroke, pts: [[0.1, 0.2, 2.5]] }] },
      { ...RECORDING, events: [{ ...stroke, w: 0 }] },
      { ...RECORDING, events: [{ ...stroke, erase: "no" }] },
      { ...RECORDING, events: [stroke, { kind: "redo", t: 5 }] },
    ]) {
      expect(parseWork({ image: PNG_1PX, strokes }), JSON.stringify(strokes)).toMatchObject({ ok: true, strokes: null, strokesDropped: "invalid" });
    }
  });
});

describe("where a drawing is stored", () => {
  it("in the parent's folder, then the test's, so storage rules can check the owner", () => {
    expect(workPath("p-1", "a-2", "s1-3", "x9")).toBe("p-1/a-2/s1-3-x9.png");
  });
});
