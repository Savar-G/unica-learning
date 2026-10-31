// A fake AI client for the workbook generator (#312): no network. In development (never in a production build),
// WORKBOOK_AI_FAKE=on fills every slot with a sound whole-number addition, so "Prepare next workbook" makes a draft
// without an OpenRouter key; WORKBOOK_AI_FAKE=slow waits 1.5 s a page, to watch the progress.
import type { AiClient, AiJsonRequest } from "@/lib/ai-client";
import { fakeAiClient } from "@/lib/ai-client-fake";

const num = (value: number) => ({
  type: "number", value, numerator: null, denominator: null, whole: null, unit: null, hours: null, minutes: null, period: null, parts: [], text: null,
});
const addOp = (a: number, b: number) => ({ kind: "add", operands: [num(a), num(b)], expression: null, unit: null, denominator: null, values: [] });

function items(r: AiJsonRequest) {
  const asked = JSON.parse((r.content[0] as { text: string }).text) as { day: number; slots: { slot: string; skills: string[] }[] };
  return {
    items: asked.slots.map((s, i) => {
      const a = 120 + ((asked.day * 37 + i * 53) % 700);
      const b = 15 + ((asked.day * 11 + i * 29) % 180);
      return {
        slot: s.slot, skill: s.skills[0], difficulty: 2, text: `${a} + ${b} = ?`, format: "write-number", operation: addOp(a, b),
        wrongAnswers: [
          { value: num(a + b - 10), cause: "O3", description: "Adds each column and forgets to carry.", step: "tens" },
          { value: num(Math.abs(a - b)), cause: "operation", description: "Takes away instead of adding.", step: null },
        ],
        easier: { text: "48 + 37 = ?", operation: addOp(48, 37) },
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
      return items(r);
    },
  });
}
