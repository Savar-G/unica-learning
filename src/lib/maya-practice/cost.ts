// What a real practice run costs (#325): an estimate before it starts, and a spending cap while it runs. The estimate
// runs the whole suite once with the fakes (no network) and measures every request each model would get; prices come
// from the caller (the command line reads OpenRouter's public model list). The cap stops new model calls once the
// money spent, plus the next call's estimate, would pass it; the runs it cuts are saved as nothing, so the report
// counts them missing and the suite fails.
import type { AiClient, AiJsonRequest } from "@/lib/ai-client";
import { PROPOSAL_SCHEMA } from "@/lib/maya";
import { SYSTEM_PROMPT, type MayaModel } from "@/lib/maya-model";
import { ruleMayaModel } from "@/lib/maya-model-fake";
import type { PracticeCase } from "./cases";
import { fakeJudge, JUDGE_SCHEMA, JUDGE_SYSTEM, type AiJudge } from "./judge";
import { BudgetReached, memoryPracticeStore, planSuite, runSuite } from "./practice";
import { scriptedSimulator, SIMULATOR_SCHEMA, SIMULATOR_SYSTEM, type ChildSimulator } from "./simulator";

/** USD per token, in and out. */
export interface Price {
  input: number;
  output: number;
}
export type Role = "maya" | "simulator" | "judge";

/** About 3.5 characters a token for JSON and English; rounded up so the estimate errs high. */
export const tokensOf = (chars: number) => Math.ceil(chars / 3.5);

/** Output tokens a call of each role is assumed to take, reasoning included. */
export const OUTPUT_TOKENS: Record<Role, number> = { maya: 1_500, simulator: 150, judge: 4_000 };
/** The estimate assumes real calls are this much longer than the fake dry run (repairs, longer child turns). */
export const MARGIN = 1.5;

export interface CostEstimate {
  roles: Record<Role, { model: string; calls: number; inputTokens: number; outputTokens: number; usd: number }>;
  usd: number;
}

/** Runs the suite with the fakes and measures every request: calls and input size per role. */
export async function measureSuite(cases: readonly PracticeCase[], runs: number): Promise<Record<Role, { calls: number; inputChars: number }>> {
  const m: Record<Role, { calls: number; inputChars: number }> = { maya: { calls: 0, inputChars: 0 }, simulator: { calls: 0, inputChars: 0 }, judge: { calls: 0, inputChars: 0 } };
  const fixed = {
    maya: SYSTEM_PROMPT.length + JSON.stringify(PROPOSAL_SCHEMA).length,
    simulator: SIMULATOR_SYSTEM.length + JSON.stringify(SIMULATOR_SCHEMA).length,
    judge: JUDGE_SYSTEM.length + JSON.stringify(JUDGE_SCHEMA).length,
  };
  const rule = ruleMayaModel();
  const maya: MayaModel = { id: "estimate", promptVersion: rule.promptVersion, propose: (input, s) => { m.maya.calls++; m.maya.inputChars += fixed.maya + JSON.stringify(input).length; return rule.propose(input, s); } };
  const judge0 = fakeJudge();
  const judge: AiJudge = { id: "estimate", promptVersion: judge0.promptVersion, judge: (input, s) => { m.judge.calls++; m.judge.inputChars += fixed.judge + JSON.stringify(input).length; return judge0.judge(input, s); } };
  for (const c of cases) {
    const sim0 = scriptedSimulator(c.fakeScript);
    const simulator: ChildSimulator = { id: "estimate", promptVersion: sim0.promptVersion, next: (input, s) => { m.simulator.calls++; m.simulator.inputChars += fixed.simulator + JSON.stringify(input).length; return sim0.next(input, s); } };
    const plan = planSuite([c], { maya: { model: "estimate", promptVersion: "" }, simulator: { model: "estimate", promptVersion: "" }, judge: { model: "estimate", promptVersion: "" }, meta: {} }, { runs: 1 });
    await runSuite([c], plan, { maya, simulator, judge, store: memoryPracticeStore() });
  }
  // Every run of a case sends about what its first run sends. A judge is asked for every run in a real suite.
  for (const r of Object.values(m)) {
    r.calls *= runs;
    r.inputChars *= runs;
  }
  m.judge.inputChars = Math.round((m.judge.inputChars / Math.max(1, m.judge.calls)) * cases.length * runs);
  m.judge.calls = cases.length * runs;
  return m;
}

/** The estimate for a real suite: the dry run's measures, the prices, the output assumptions and the margin. */
export async function estimateCost(cases: readonly PracticeCase[], runs: number, models: Record<Role, string>, prices: Record<Role, Price>): Promise<CostEstimate> {
  const m = await measureSuite(cases, runs);
  const roles = {} as CostEstimate["roles"];
  let usd = 0;
  for (const role of ["maya", "simulator", "judge"] as Role[]) {
    const calls = Math.ceil(m[role].calls * MARGIN);
    const inputTokens = tokensOf(m[role].inputChars * MARGIN);
    const outputTokens = calls * OUTPUT_TOKENS[role];
    const cost = inputTokens * prices[role].input + outputTokens * prices[role].output;
    roles[role] = { model: models[role], calls, inputTokens, outputTokens, usd: cost };
    usd += cost;
  }
  return { roles, usd };
}

/** The money spent so far, against a cap (null: no cap). Shared by every model of a suite. */
export class Spending {
  spent = 0;
  /** Set once a call was refused: the suite stops, and the run that met the cap is not saved. */
  reached = false;
  private reserved = 0;
  constructor(readonly maxUsd: number | null) {}
  /** Reserves the next call's estimate; throws BudgetReached when it would pass the cap. */
  reserve(usd: number): void {
    if (this.reached || (this.maxUsd !== null && this.spent + this.reserved + usd > this.maxUsd)) {
      this.reached = true;
      throw new BudgetReached();
    }
    this.reserved += usd;
  }
  release(usd: number): void {
    this.reserved = Math.max(0, this.reserved - usd);
  }
  add(usd: number): void {
    if (Number.isFinite(usd) && usd > 0) this.spent += usd;
  }
}

/** The cost of one request as code estimates it before sending: its size in, and up to its output limit out. */
export function requestEstimate(request: AiJsonRequest, price: Price): number {
  const chars = request.system.length + JSON.stringify(request.content).length + JSON.stringify(request.schema).length;
  return tokensOf(chars) * price.input + (request.maxTokens ?? 4_000) * price.output;
}

/**
 * An AI client that keeps to the cap: before each call it reserves the call's worst case (its input and all its output
 * tokens) and refuses with BudgetReached when that would pass the cap. What the call really cost is added by
 * `meteredFetch`, per HTTP answer.
 */
export function cappedClient(client: AiClient, spending: Spending, price: Price): AiClient {
  return {
    model: client.model,
    async json(request, signal) {
      const worst = requestEstimate(request, price);
      spending.reserve(worst);
      try {
        return await client.json(request, signal);
      } finally {
        spending.release(worst);
      }
    },
  };
}

/**
 * A fetch for the OpenRouter adapter that adds each answer's cost to `spending`: OpenRouter's `usage.cost` when the
 * answer has it, else its token counts at `price`, else the request's worst case (so an unreported call is never free).
 */
export function meteredFetch(fetch: typeof globalThis.fetch, spending: Spending, price: Price): typeof globalThis.fetch {
  return async (input, init) => {
    const body = typeof init?.body === "string" ? init.body : "";
    let worst = 0;
    try {
      const b = JSON.parse(body) as { messages?: unknown; max_tokens?: number; response_format?: unknown };
      worst = tokensOf(JSON.stringify(b.messages ?? "").length + JSON.stringify(b.response_format ?? "").length) * price.input + (b.max_tokens ?? 4_000) * price.output;
    } catch {
      worst = tokensOf(body.length) * price.input + 4_000 * price.output;
    }
    let res: Response;
    try {
      res = await fetch(input, init);
    } catch (e) {
      // No answer: the provider may still have run it.
      spending.add(worst);
      throw e;
    }
    let cost = worst;
    try {
      const data = (await res.clone().json()) as { usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number } };
      const u = data.usage;
      if (u && typeof u.cost === "number") cost = u.cost;
      else if (u && typeof u.prompt_tokens === "number" && typeof u.completion_tokens === "number") cost = u.prompt_tokens * price.input + u.completion_tokens * price.output;
      else if (!res.ok) cost = 0;
    } catch {
      if (!res.ok) cost = 0;
    }
    spending.add(cost);
    return res;
  };
}
