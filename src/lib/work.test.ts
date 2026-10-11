import { describe, expect, it } from "vitest";
import { WORK_IMAGE_MAX_BYTES, WORK_TEXT_MAX } from "@/lib/test-api";
import { parseWork, workPath } from "@/lib/work";

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
    for (const raw of [undefined, null, {}]) expect(parseWork(raw), String(raw)).toEqual({ ok: true, png: null, text: "" });
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

describe("where a drawing is stored", () => {
  it("in the parent's folder, then the test's, so storage rules can check the owner", () => {
    expect(workPath("p-1", "a-2", "s1-3", "x9")).toBe("p-1/a-2/s1-3-x9.png");
  });
});
