import { describe, expect, it } from "vitest";
import { readAnswer, readNumbers, takenBack, valuesIn, type ReadOptions } from "@/lib/maya/numbers";
import { READ_REUSE_LIMIT, readReuse, reuseInUse, reuseRead, withReadReuse, type ReadReuse } from "@/lib/maya/read-reuse";
import { speechWords } from "@/lib/maya/speech";

// Reads kept for one text session (PR #941): with a ReadReuse installed, readNumbers, readAnswer and speechWords give
// the same result as with none, every caller owns what it gets, and a ReadReuse is used only inside its own
// synchronous run. A read made with none installed is the reader as it always was.

/** JSON with object identity: an object seen before is written as its first-visit number. */
function shape(x: unknown): string {
  const ids = new Map<object, number>();
  const walk = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return Object.is(v, -0) ? "-0" : v === undefined ? "<undefined>" : v;
    if (ids.has(v)) return `<same ${ids.get(v)}>`;
    ids.set(v, ids.size);
    return Array.isArray(v) ? { id: ids.get(v), items: v.map(walk) } : { id: ids.get(v), keys: Object.keys(v), values: Object.values(v).map(walk) };
  };
  return JSON.stringify(walk(x));
}

const TEXTS = [
  "", "66", "sixty-six", "two hundred and five", "1,000", "27 and 66", "I added 2 and 3 and 1.", "sixty... no, sixty-six", "minus, uh, 66",
  "66, no, 56", "No 66", "7 plus 9 is 16", "seven and nine make sixteen", "7 plus 9 is 6 and I carry the 1", "2 + 3 = 5", "I got 66. 2 plus 3 is 5, so 56.",
  "3/4", "three quarters", "a half", "one and three eighths", "three quarter", "1 3/8", "2 and a half", "3 groups of 4", "4 rows of 5 is 20", "3 x 4 = 12",
  "?", "9000 − ? = 3000", "the missing number is 5", "0.85", ".85", "point eight five", "point sixty-six", "66 cm", "66 cm²", "26 R 1", "26 remainder 1",
  "1st", "the 2nd one", "6:53", "six fifty-three", "seven o'clock", "-66", "negative 5", "27 minus 66", "66 because six tens and six ones",
  "maybe 66", "is it 66 or 56?", "I'm stuck.", "I'm done", "66 squared", "half of 66", "6 tens", "6 ten thousands", "the one I carried",
  "I carry 1. I got 66.", "I already said 16. It's 66.", "I got 66. I added 20 and 30.", "Yes, it's 66. I got it from the steps you showed me.",
  "I reject this answer:\n66", "Maybe\n66", "constructor",
];
const OPTIONS: (ReadOptions | undefined)[] = [undefined, {}, { fractions: true }, { fractions: false }, { times: true }, { times: false }, { fractions: true, operands: true }, { known: [] },
  { known: [20, 30] }, { known: [-0] }, { known: [0] }, { carries: [1] }, { carries: [6] }, { saidBefore: [16] }, { fractions: true, known: [3, 4], carries: [1], saidBefore: [7] }];
const READERS = [
  ["readNumbers", (t: string, o?: ReadOptions) => readNumbers(t, o)], ["valuesIn", (t: string, o?: ReadOptions) => valuesIn(t, o)],
  ["readAnswer", (t: string, o?: ReadOptions) => readAnswer(t, o)], ["takenBack", (t: string, o?: ReadOptions) => takenBack(t, o)],
] as const;

describe("reads kept for one text session", () => {
  it("give every reader the result it gives with none installed: first read, second read, and a store shared by every input", () => {
    const shared = readReuse();
    for (const t of TEXTS) for (const o of OPTIONS) for (const [name, read] of READERS) {
      const plain = shape(read(t, structuredClone(o)));
      const own = readReuse();
      expect(shape(withReadReuse(own, () => read(t, structuredClone(o)))), `${name} ${t} first`).toBe(plain);
      expect(shape(withReadReuse(own, () => read(t, structuredClone(o)))), `${name} ${t} second`).toBe(plain);
      expect(shape(withReadReuse(shared, () => read(t, structuredClone(o)))), `${name} ${t} shared`).toBe(plain);
    }
    for (const t of TEXTS) expect(withReadReuse(shared, () => speechWords(t))).toBe(speechWords(t));
  });

  it("keep options that differ apart: the list options decide whether the answer is sure", () => {
    const r = readReuse();
    const read = (o: ReadOptions) => withReadReuse(r, () => readAnswer("I carry 1. I got 66.", o).sure);
    expect([read({ carries: [1] }), read({ carries: [] }), read({ carries: [1] })]).toEqual([true, false, true]);
    expect(withReadReuse(r, () => readAnswer("I got 66. I added 20 and 30.", { known: [20, 30] }).sure)).toBe(readAnswer("I got 66. I added 20 and 30.", { known: [20, 30] }).sure);
    expect(withReadReuse(r, () => readAnswer("I got 66. I added 20 and 30.", { known: [] }).sure)).toBe(readAnswer("I got 66. I added 20 and 30.", { known: [] }).sure);
    expect(withReadReuse(r, () => valuesIn("three quarters", { fractions: true }))).toEqual(valuesIn("three quarters", { fractions: true }));
    expect(withReadReuse(r, () => valuesIn("three quarters", {}))).toEqual(valuesIn("three quarters", {}));
    expect(withReadReuse(r, () => readAnswer("three quarters", { fractions: true }))).toEqual(readAnswer("three quarters", { fractions: true }));
    expect(withReadReuse(r, () => readAnswer("three quarters", { fractions: false }))).toEqual(readAnswer("three quarters", { fractions: false }));
  });

  it("give each caller its own copy: a caller that changes its result changes nothing another caller reads", () => {
    const r = readReuse();
    for (const t of ["I got 66.", "66 squared because 6 tens", "3/4", "I carry 1. I got 66."]) {
      const numbers = shape(readNumbers(t)), answer = shape(readAnswer(t, { fractions: true }));
      for (let n = 0; n < 3; n++) withReadReuse(r, () => {
        const a = readNumbers(t);
        expect(shape(a)).toBe(numbers);
        a.values.push({ type: "number", value: 999 }); a.notAnswer.push(true); a.operand.length = 0; a.unreadable = !a.unreadable;
        for (const v of a.values) if (v.type === "number") v.value += 1;
        const b = readAnswer(t, { fractions: true });
        expect(shape(b)).toBe(answer);
        b.kept.push({ type: "number", value: 1 }); b.outside.length = 0; b.sure = !b.sure;
        if (b.final?.type === "number") b.final.value = -1;
      });
    }
  });

  it("are used only inside their own run: nested, after a throw, after an await, and between two sessions", async () => {
    const a = readReuse(), b = readReuse();
    expect(reuseInUse()).toBeNull();
    withReadReuse(a, () => {
      readNumbers("sixty-six");
      withReadReuse(b, () => { expect(reuseInUse()).toBe(b); readNumbers("twenty-seven"); });
      expect(reuseInUse()).toBe(a);
    });
    expect(reuseInUse()).toBeNull();
    expect([...a.numbers.keys()].map((k) => k.split("\u0000")[0])).toEqual(["sixty-six"]);
    expect([...b.numbers.keys()].map((k) => k.split("\u0000")[0])).toEqual(["twenty-seven"]);
    expect(() => withReadReuse(a, () => withReadReuse(b, () => { throw new Error("stop"); }))).toThrow("stop");
    expect(reuseInUse()).toBeNull();
    expect(await withReadReuse(a, async () => { await Promise.resolve(); return reuseInUse(); })).toBeNull();
    const kept = new Map<string, number>();
    expect(() => reuseRead(kept, "k", () => { throw new Error("read failed"); }, (n) => n)).toThrow("read failed");
    expect(kept.size).toBe(0);
    const before = a.numbers.size;
    readNumbers("forty"); readAnswer("I got 40."); speechWords("I got 40.");
    expect(a.numbers.size).toBe(before);
    // Two sessions whose synchronous steps take turns across awaits.
    const c = readReuse(), d = readReuse(); const seen: boolean[] = [];
    const session = async (own: ReadReuse, texts: string[]) => {
      for (const t of texts) {
        withReadReuse(own, () => { seen.push(reuseInUse() === own); readAnswer(t); speechWords(t); });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    };
    await Promise.all([session(c, ["I got 66.", "maybe 56"]), session(d, ["27 plus 39 is 66", "Yes."])]);
    expect(seen).toEqual([true, true, true, true]);
    expect([...c.words.keys()]).toEqual(["I got 66.", "maybe 56"]);
    expect([...d.words.keys()]).toEqual(["27 plus 39 is 66", "Yes."]);
  });

  it("read options of any other shape again each time, and never hold more than the limit", () => {
    class Options { fractions = true; }
    const odd: unknown[] = [Object.defineProperty({}, "fractions", { get: () => true, enumerable: true }), { fractions: true, extra: 1 }, new Options(),
      Object.assign(Object.create(null), { fractions: true }), { fractions: "yes" }, { known: ["66"] }, { known: [1, , 2] }, { known: 66 }];
    const r = readReuse();
    for (const o of odd) {
      expect(withReadReuse(r, () => readAnswer("three quarters", o as ReadOptions))).toEqual(readAnswer("three quarters", o as ReadOptions));
      expect(r.answers.size).toBe(0);
    }
    const full = readReuse(); let most = 0;
    withReadReuse(full, () => { for (let i = 0; i < READ_REUSE_LIMIT + 3; i++) { readNumbers(`${i} apples`); most = Math.max(most, full.numbers.size); } });
    expect(most).toBe(READ_REUSE_LIMIT);
    expect(full.numbers.size).toBe(3);
  });
});
