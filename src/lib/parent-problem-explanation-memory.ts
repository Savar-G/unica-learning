import { createHash } from "node:crypto";
import { EXPLANATION_CAP_MICROS, EXPLANATION_MODEL, EXPLANATION_VERSION, type Explanation, type ExplanationContext, type ExplanationRef, type ExplanationStore } from "@/lib/parent-problem-explanation";

/** Synthetic store. Public methods match the service RPC. Its synchronous mutation blocks model database locks. */
export function explanationMemory(now: () => number = Date.now) {
  const contexts = new Map<string, ExplanationContext>();
  const claims = new Map<string, { token: string; until: number; result: Explanation | null }>();
  const spend = new Map<string, { period: string; reserve: number; charged: number | null }>();
  let maximum: number | null = null, verifiedUntil = 0;
  const key = (r: ExplanationRef) => `${r.parent}:${r.photo}:${r.itemId}`;
  const period = () => new Date(now()).toISOString().slice(0, 7);
  const current = (r: ExplanationRef, version?: string) => {
    const c = contexts.get(key(r));
    return c && c.parent === r.parent && c.itemId === r.itemId && c.version === r.version && (!version || c.context === version) ? c : null;
  };
  const owned = (r: ExplanationRef, version: string, token: string) => {
    const claim = claims.get(version);
    return current(r, version) && claim?.token === token && claim.until > now() ? claim : null;
  };
  const store: ExplanationStore = {
    async context(r) { return structuredClone(current(r)); },
    async claim(r, version, token) {
      if (!current(r, version)) return "refused";
      const old = claims.get(version);
      if (old?.result) return { explanation: structuredClone(old.result) };
      if (old && old.until > now()) return "busy";
      claims.set(version, { token, until: now() + 20_000, result: null }); return "claimed";
    },
    async admit(r, version, token, model) {
      if (!owned(r, version, token)) return "refused";
      if (model !== EXPLANATION_MODEL || maximum === null || verifiedUntil <= now()) return "unavailable";
      if ([...spend.values()].some(s => s.charged !== null && s.charged > s.reserve)
        || [...spend.values()].filter(s => s.period === period()).reduce((n, s) => n + (s.charged ?? s.reserve), 0) + maximum > EXPLANATION_CAP_MICROS) return "cap";
      const dispatch = crypto.randomUUID(); spend.set(dispatch, { period: period(), reserve: maximum, charged: null }); return { dispatch };
    },
    async settle(dispatch, cost) { const row = spend.get(dispatch); if (row && cost !== null && Number.isSafeInteger(cost) && cost >= 0) row.charged = Math.max(row.charged ?? 0, cost); },
    async finish(r, version, token, explanation) { const row = owned(r, version, token); if (!row || row.result) return false; row.result = structuredClone(explanation); return true; },
    async read(r, version) { return current(r, version) ? structuredClone(claims.get(version)?.result ?? null) : null; },
    async release(r, version, token) { const row = claims.get(version); if (current(r, version) && row?.token === token && !row.result) row.until = 0; },
  };
  return { store, spend,
    put(ref: ExplanationRef, value: Omit<ExplanationContext, "context">) { const context = createHash("sha256").update(JSON.stringify([EXPLANATION_VERSION, value])).digest("hex"); contexts.set(key(ref), structuredClone({ ...value, context })); return context; },
    remove(parent: string) { for (const [k, c] of contexts) if (c.parent === parent) { contexts.delete(k); claims.delete(c.context); } },
    price(micros: number, until = now() + 86_400_000) { maximum = micros; verifiedUntil = until; },
  };
}
