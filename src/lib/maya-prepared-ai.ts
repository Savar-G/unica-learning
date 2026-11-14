// One speculative model request, paid by the text session's existing handle. This client never reserves or settles
// that handle. The session settles it after both the request and its use/discard decision finish. A handle permits
// one dispatch: a provider retry must not reuse it. Each client is bound to one handle, never a shared "next" slot.
import type { AiClient } from "@/lib/ai-client";
import type { CallBudget, Handle } from "@/lib/maya-spend-block";
import { requestContext, withRequestContext } from "@/lib/maya-request-trace";
import { SpendRefused, type MeterHooks } from "@/lib/maya-spend-ai";

export function preparedAi(make: (hooks: MeterHooks) => AiClient, budget: Pick<CallBudget, "canSend">, handle: Handle, base: typeof globalThis.fetch = globalThis.fetch): AiClient {
  let claimed = false;
  let dispatched = false;
  const allowed = () => !dispatched && budget.canSend(handle);
  return {
    model: make({ fetch: base, onRequest: async () => {} }).model,
    async json(request, signal) {
      if (claimed) throw new SpendRefused("paused");
      claimed = true;
      const client = make({
        onRequest: async () => { if (!allowed()) throw new SpendRefused("paused"); },
        fetch: async (input, init) => {
          if (signal.aborted || !allowed()) throw new SpendRefused("paused");
          dispatched = true;
          const response = await base(input, init);
          if (!response.ok) request.onCost?.(0);
          return response;
        },
      });
      // A prepared request belongs to no turn yet, whatever turn was running when the controller prepared it
      // (src/lib/maya-request-trace.ts). An interim hint named itself; anything else is the controller's expected turn.
      const source = requestContext().source === "prepared_interim" ? "prepared_interim" : "prepared_expected";
      try { return await withRequestContext({ source, turnId: null }, () => client.json(request, signal)); }
      finally {
        // A stop or expiry before dispatch costs zero. No callback means the provider's cost is still unknown.
        if (!dispatched) request.onCost?.(0);
      }
    },
  };
}
