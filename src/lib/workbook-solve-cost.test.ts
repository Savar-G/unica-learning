import { describe, expect, it } from "vitest";
import { openRouterClient } from "@/lib/ai-openrouter";
import { costedSolver } from "@/lib/workbook-solve-cost";
import type { SolveLog, SolveRequest } from "@/lib/workbook-solve-check";

// The live solve check's cost (#312 round 3) through its public interface, with a fake fetch in place of OpenRouter.

const request = (text: string): SolveRequest => ({
  questions: [{ id: "question", text, picture: null, shown: null, boxes: [{ id: "answer", asks: "a box for the answer" }] }],
  key: [{ question: "question", box: "answer", right: ["7"], choice: false }],
});
const logOf = (r: SolveRequest) => ({ questions: r.questions }) as SolveLog;
const signal = () => new AbortController().signal;

/** OpenRouter's answer: the reader's JSON, and the call's cost when `cost` is given. Keeps each request body. */
function openRouter(cost: number | null, sent: Record<string, unknown>[]): typeof fetch {
  return async (_url, init) => {
    sent.push(JSON.parse(String(init?.body)));
    const content = JSON.stringify({ answers: [{ question: "question", box: "answer", answer: "7" }], problem: null });
    return new Response(JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content } }],
      ...(cost === null ? {} : { usage: { cost, prompt_tokens: 100, completion_tokens: 20 } }),
    }), { status: 200 });
  };
}

const reader = (base: typeof fetch) => costedSolver((fetch) => openRouterClient({ apiKey: "key", model: "reader", fetch, maxRetries: 0 }), base);

describe("the solve check's cost", () => {
  it("asks OpenRouter for each answer's cost and gives it to the check of the same printed question, once", async () => {
    const sent: Record<string, unknown>[] = [];
    const costed = reader(openRouter(0.00042, sent))!;
    expect(costed.solver.model).toBe("reader");
    const a = request("Mia has 3 and gets 4 more. How many?");
    const b = request("Ben has 2 and gets 5 more. How many?");
    expect(await costed.solver.solve(a, signal())).toMatchObject({ answers: [{ answer: "7" }] });
    await costed.solver.solve(b, signal());
    expect(sent.every((body) => (body.usage as { include?: boolean })?.include === true)).toBe(true);
    // The reader never sees the key.
    expect(JSON.stringify(sent)).not.toContain('"right"');
    expect(costed.cost(logOf(b))).toBe(0.00042);
    expect(costed.cost(logOf(a))).toBe(0.00042);
    // Each cost goes to one check only.
    expect(costed.cost(logOf(a))).toBeNull();
  });

  it("has no cost when the provider gives none, and no solver when the AI is off", async () => {
    const costed = reader(openRouter(null, []))!;
    const a = request("Mia has 3 and gets 4 more. How many?");
    await costed.solver.solve(a, signal());
    expect(costed.cost(logOf(a))).toBeNull();
    expect(costedSolver(() => null)).toBeNull();
  });
});
