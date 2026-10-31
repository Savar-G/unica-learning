// A fake AI client for the workbook generator (#312): no network. In development (never in a production build),
// WORKBOOK_AI_FAKE=on fills every slot with a sound whole-number addition, so "Prepare next workbook" makes a draft
// without an OpenRouter key; WORKBOOK_AI_FAKE=slow waits 1.5 s a page, to watch the progress.
import type { AiClient, AiJsonRequest } from "@/lib/ai-client";
import { fakeAiClient } from "@/lib/ai-client-fake";

const num = (value: number) => ({
  type: "number", value, numerator: null, denominator: null, whole: null, unit: null, hours: null, minutes: null, period: null, parts: [], text: null,
});
const op = (kind: "add" | "subtract", a: number, b: number) => ({ kind, operands: [num(a), num(b)], expression: null, unit: null, denominator: null, values: [] });

/**
 * Sam's sum for each mistake a Spot the error slot may offer (#380): a sum that mistake fits, small enough for the
 * early levels, and Sam's answer exactly what it makes.
 */
const SAM: Record<string, { kind: "add" | "subtract"; a: number; b: number; wrong: number; step: string | null }> = {
  "forgot-carry": { kind: "add", a: 48, b: 37, wrong: 75, step: "tens" },
  "smaller-from-larger": { kind: "subtract", a: 52, b: 17, wrong: 45, step: "ones" },
  "regroup-not-taken": { kind: "subtract", a: 62, b: 28, wrong: 44, step: "tens" },
  "counted-one-extra": { kind: "add", a: 2, b: 2, wrong: 5, step: null },
  "counted-one-short": { kind: "add", a: 3, b: 2, wrong: 4, step: null },
  "wrong-start": { kind: "add", a: 3, b: 2, wrong: 4, step: null },
  "wrong-operation": { kind: "add", a: 3, b: 2, wrong: 1, step: null },
  "swapped-digits": { kind: "add", a: 7, b: 5, wrong: 21, step: null },
};

interface AskedSlot { slot: string; place?: string; skills: string[]; mistakes?: { name: string }[]; numbers?: Record<string, { max: number }> }

/**
 * Sound items for every slot a page request asks, in the format its place takes. Every number keeps to the range the
 * slot gives for its skill and is written in digits, as the real AI is asked to (#380).
 */
export function fakeWorkbookItems(r: AiJsonRequest) {
  const asked = JSON.parse((r.content[0] as { text: string }).text) as { day?: number; slots: AskedSlot[] };
  const day = asked.day ?? 1;
  return {
    items: asked.slots.map((s, i) => {
      if (s.place === "how-do-you-know") {
        return { slot: s.slot, skill: s.skills[0], difficulty: 1, text: "How do you know your answer to the last story is right?", format: "written-reason", operation: null, wrongAnswers: [], easier: null, shownWrong: null };
      }
      if (s.place === "spot-the-error" && s.mistakes?.length) {
        // The offered mistakes in turn by day; the slot's skill with the widest range, so Sam's sum fits it.
        const name = s.mistakes[day % s.mistakes.length].name;
        const x = SAM[name] ?? SAM["counted-one-extra"];
        const skill = [...s.skills].sort((p, q) => (s.numbers?.[q]?.max ?? 0) - (s.numbers?.[p]?.max ?? 0))[0];
        return {
          slot: s.slot, skill, difficulty: 2, text: `${x.a} ${x.kind === "add" ? "+" : "-"} ${x.b} = ?`, format: "spot-the-error", operation: op(x.kind, x.a, x.b),
          wrongAnswers: [{ value: num(x.wrong), cause: SAM[name] ? name : "counted-one-extra", description: `Sam's mistake: ${name}`, step: x.step }],
          easier: { text: x.kind === "add" ? "1 + 1 = ?" : "5 - 2 = ?", operation: x.kind === "add" ? op("add", 1, 1) : op("subtract", 5, 2) },
          shownWrong: 0,
        };
      }
      // a + b + 1 stays within the skill's range (to 10 at the first level), below 100 so a page of them fits.
      const max = Math.min(100, s.numbers?.[s.skills[0]]?.max ?? 100);
      const b = max >= 20 ? Math.floor(max * 0.15) : 2;
      const a = 2 + ((day * 7 + i * 3) % Math.max(1, max - b - 2));
      const story = ["word-problems", "picture-stories", "challenge", "math-in-the-world"].includes(s.place ?? "");
      const format = story ? "show-work" : s.place === "solve-it-two-ways" ? "two-ways" : s.place === "mixed-set" ? "tick-and-number" : "write-number";
      const text = story ? `A shelf has ${a} books. Mom adds ${b} more. How many books are on the shelf now?` : `${a} + ${b} = ?`;
      return {
        slot: s.slot, skill: s.skills[0], difficulty: 2, text, format, operation: op("add", a, b),
        wrongAnswers: [
          { value: num(a + b + 1), cause: "careless", description: "Counts 1 too many.", step: null },
          { value: num(Math.abs(a - b)), cause: "operation", description: "Takes away instead of adding.", step: null },
        ],
        easier: { text: "1 + 1 = ?", operation: op("add", 1, 1) },
        shownWrong: null,
      };
    }),
  };
}

/** The fake, or null when WORKBOOK_AI_FAKE is not on (or in production). */
export function workbookFakeAi(env: Record<string, string | undefined> = process.env): AiClient | null {
  const mode = env.WORKBOOK_AI_FAKE;
  if (env.NODE_ENV === "production" || (mode !== "on" && mode !== "slow")) return null;
  return fakeAiClient({
    model: "fake",
    answer: async (r) => {
      if (mode === "slow") await new Promise((done) => setTimeout(done, 1500));
      return fakeWorkbookItems(r);
    },
  });
}
