import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { contentsRefOf, makeMethodKey, methodFileName, methodRef, parsePageRef, refBelongsTo } from "./identity";

const segment = fc.stringMatching(/^[A-Za-z0-9]{1,6}$/);

describe("the topic key", () => {
  it("stores the level in upper case, so one level has one key", () => {
    expect(makeMethodKey("demo", "z", 3)).toEqual({ ok: true, key: { source: "demo", level: "Z", topic: 3 } });
    expect(makeMethodKey("demo", "Z", 2_147_483_647).ok).toBe(true);
    expect(parsePageRef("demo:Z:2147483647a").ok).toBe(true);
    expect(makeMethodKey("demo", "Z", "3")).toEqual(makeMethodKey("demo", "z", 3));
  });

  it.each([
    ["", "Z", 1],
    ["de-mo", "Z", 1],
    ["demo", "", 1],
    ["demo", "Z:1", 1],
    ["demo", "../Z", 1],
    ["demo", "\u00DF", 1],
    ["demo", "Z", 0],
    ["demo", "Z", -1],
    ["demo", "Z", 1.5],
    ["demo", "Z", "01"],
    ["demo", "Z", "1e2"],
    ["demo", "Z", "x"],
    ["demo", "Z", 2_147_483_648],
    ["demo", "Z", "2147483648"],
    ["demo", "Z", null],
  ])("refuses source %j, level %j, topic %j", (source, level, topic) => {
    expect(makeMethodKey(source, level, topic).ok).toBe(false);
  });

  it("gives two different topics two different refs and file names", () => {
    fc.assert(
      fc.property(segment, segment, fc.nat(400), segment, segment, fc.nat(400), (s1, l1, t1, s2, l2, t2) => {
        const a = makeMethodKey(s1, l1, t1 + 1);
        const b = makeMethodKey(s2, l2, t2 + 1);
        if (!a.ok || !b.ok) throw new Error("expected valid keys");
        const same = s1 === s2 && l1.toUpperCase() === l2.toUpperCase() && t1 === t2;
        expect(methodRef(a.key) === methodRef(b.key)).toBe(same);
        expect(methodFileName(a.key) === methodFileName(b.key)).toBe(same);
      }),
    );
  });
});

describe("page refs", () => {
  it("reads a page ref and refuses a second spelling of the same page", () => {
    expect(parsePageRef("demo:Z:12a")).toEqual({ ok: true, page: { source: "demo", level: "Z", sheet: 12, side: "a" } });
    for (const ref of ["demo:Z:012a", "demo:z:12a", "demo:Z:99999999999999999999a", "demo:Z:2147483648a", "demo:Z:contents", "demo:Z:0a"]) {
      expect(parsePageRef(ref).ok, ref).toBe(false);
    }
  });

  it("names a ref that is the same level in another spelling", () => {
    const key = { source: "demo", level: "Z", topic: 1 };
    expect(refBelongsTo("demo:Z:1a", key)).toBe("yes");
    expect(refBelongsTo(contentsRefOf(key), key)).toBe("yes");
    expect(refBelongsTo("demo:z:1a", key)).toBe("other_spelling");
    expect(refBelongsTo("Demo:Z:1a", key)).toBe("other_spelling");
    expect(refBelongsTo("demo:Y:1a", key)).toBe("no");
    expect(refBelongsTo("other:Z:1a", key)).toBe("no");
  });
});
