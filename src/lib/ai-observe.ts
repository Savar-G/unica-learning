// AI monitoring (docs/sentry.md): each AI request is one Sentry span in the AI Agents view, with the feature, the model,
// the tokens, the cost, the time and whether it failed. Never the prompt or the answer: they hold a child's work, so the
// span has no gen_ai input or output attribute (DATA_COLLECTION.genAI is off too, and the span scrubber removes any).
// Each answer's cost also goes to the metric `ai.cost` and its tokens to `ai.tokens`.
import * as Sentry from "@sentry/nextjs";
import type { OpenRouterUsage } from "@/lib/ai-openrouter";

/** Runs one AI request inside its span. `run` gets the usage hook that the adapter calls once per answer. */
export function observeAiCall<T>(o: { model: string; feature: string; provider: string }, run: (onUsage: (u: OpenRouterUsage) => void) => Promise<T>): Promise<T> {
  return Sentry.startSpan({
    name: `chat ${o.model}`,
    op: "gen_ai.chat",
    attributes: {
      "gen_ai.operation.name": "chat",
      "gen_ai.provider.name": o.provider,
      "gen_ai.request.model": o.model,
      "gen_ai.agent.name": o.feature,
    },
  }, async (span) => {
    let input = 0, output = 0, cost = 0;
    const onUsage = (u: OpenRouterUsage) => {
      input += u.inputTokens ?? 0;
      output += u.outputTokens ?? 0;
      cost += u.costUsd ?? 0;
      span.setAttributes({ "gen_ai.usage.input_tokens": input, "gen_ai.usage.output_tokens": output, "gen_ai.usage.total_tokens": input + output, "gen_ai.cost.total_tokens": cost });
      const attributes = { feature: o.feature, model: o.model };
      if (u.costUsd !== null) Sentry.metrics.distribution("ai.cost", u.costUsd, { unit: "usd", attributes });
      Sentry.metrics.count("ai.tokens", (u.inputTokens ?? 0) + (u.outputTokens ?? 0), { attributes });
    };
    try {
      return await run(onUsage);
    } catch (e) {
      // The reason is our own short text ("time is up", "the model refused", an HTTP status), never the model's output.
      span.setStatus({ code: 2, message: e instanceof Error ? e.message.slice(0, 120) : "failed" });
      Sentry.metrics.count("ai.failures", 1, { attributes: { feature: o.feature, model: o.model } });
      throw e;
    }
  });
}
