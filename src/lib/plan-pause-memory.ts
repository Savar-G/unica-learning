import type { PauseContext, PauseOperation, PauseSeams } from "@/lib/plan-pause";
/** Local public-interface fixture. Atomic synchronous admission models the SQL child lock. */
export function memoryPauses(context: PauseContext, charge = "2026-12-02T18:00:00.000Z") {
  const operations = new Map<string, PauseOperation>();
  const landed = new Set<string>();
  let sends = 0, lose = false, fenced = false;
  const seams: PauseSeams = {
    token: quote => JSON.stringify(quote),
    store: {
      async context(parent, card) { return parent === "p" && card === "c" ? { ...context, blocked: fenced || [...operations.values()].some(o => o.state === "open"), pending: undefined } : null; },
      async operation(parent, card, token) { const o = parent === "p" && card === "c" ? operations.get(token) : null; return o ? { ...o, send: false } : null; },
      async admit(parent, card, token, quote) {
        if (parent !== "p" || card !== "c" || fenced) return null;
        const prior = operations.get(token);
        if (prior) return { ...prior, send: false };
        if ([...operations.values()].some(o => o.state === "open") || context.used !== quote.used || context.used + quote.weeks > 8 || context.book?.id !== quote.bookId) return null;
        const operation: PauseOperation = { id: `op-${operations.size}`, state: "open", send: false, quote };
        context.used += quote.weeks;
        operations.set(token, operation);
        return { ...operation, send: true };
      },
      async finish(id, state) {
        const o = [...operations.values()].find(o => o.id === id)!;
        if (o.state !== "open") return;
        o.state = state;
        if (state === "refused") context.used -= o.quote.weeks;
        else if (!o.quote.late) context.mailingWeeks += o.quote.weeks;
      },
    },
    provider: {
      async plan() { return { id: "sub", kind: "trial", chargeAt: charge }; },
      async apply(_parent, _card, operation) { sends++; if (lose) return "pending"; landed.add(operation.id); charge = operation.quote.chargeAt; return "applied"; },
      async recover(_parent, _card, operation) { return landed.has(operation.id); },
    },
  };
  return { seams, context, operations, sends: () => sends, lose: () => { lose = true; }, land: () => { for (const o of operations.values()) if (o.state === "open") { landed.add(o.id); charge = o.quote.chargeAt; } }, fence: () => { fenced = true; }, held: () => [...operations.values()].some(o => o.state === "open") };
}
