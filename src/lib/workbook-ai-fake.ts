// A fake AI client for the workbook generator (#312): no network. In development (never in a production build),
// WORKBOOK_AI_FAKE=on fills every slot with a sound whole-number addition, so "Prepare next workbook" makes a draft
// without an OpenRouter key; WORKBOOK_AI_FAKE=slow waits 1.5 s a page, to watch the progress.
import type { AiClient, AiJsonRequest } from "@/lib/ai-client";
import { fakeAiClient } from "@/lib/ai-client-fake";

const num = (value: number) => ({
  type: "number", value, numerator: null, denominator: null, whole: null, unit: null, hours: null, minutes: null, period: null, parts: [], text: null,
});
const addOp = (a: number, b: number) => ({ kind: "add", operands: [num(a), num(b)], expression: null, unit: null, denominator: null, values: [] });

/** Sound items for every slot a page request asks, in the format its place takes. */
export function fakeWorkbookItems(r: AiJsonRequest) {
  const asked = JSON.parse((r.content[0] as { text: string }).text) as { day?: number; slots: { slot: string; place?: string; skills: string[] }[] };
  const day = asked.day ?? 1;
  return {
    items: asked.slots.map((s, i) => {
      const a = 120 + ((day * 37 + i * 53) % 700);
      const b = 15 + ((day * 11 + i * 29) % 180);
      if (s.place === "how-do-you-know") {
        return { slot: s.slot, skill: s.skills[0], difficulty: 1, text: "How do you know your answer to the last story is right?", format: "written-reason", operation: null, wrongAnswers: [], easier: null, shownWrong: null };
      }
      const story = ["word-problems", "picture-stories", "challenge", "math-in-the-world"].includes(s.place ?? "");
      const format = story ? "show-work" : s.place === "solve-it-two-ways" ? "two-ways" : s.place === "mixed-set" ? "tick-and-number" : s.place === "spot-the-error" ? "spot-the-error" : "write-number";
      const text = story ? `A shelf has ${a} books. Mom adds ${b} more. How many books are on the shelf now?` : format === "spot-the-error" ? "Find the wrong move. Write the fix." : `${a} + ${b} = ?`;
      return {
        slot: s.slot, skill: s.skills[0], difficulty: 2, text, format, operation: addOp(a, b),
        wrongAnswers: [
          { value: num(a + b - 10), cause: "O3", description: "Adds each column and forgets to carry.", step: "tens" },
          { value: num(Math.abs(a - b)), cause: "operation", description: "Takes away instead of adding.", step: null },
        ],
        easier: { text: "48 + 37 = ?", operation: addOp(48, 37) },
        shownWrong: format === "spot-the-error" ? 0 : null,
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
