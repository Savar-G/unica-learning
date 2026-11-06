// Maya's paid AI requests through the spending ledger (src/lib/maya-spend.ts, D-290): a client that reserves before each
// provider attempt, retries included, and settles it with the cost OpenRouter reports for it (usage accounting, the same
// as `costingFetch` in src/lib/ai-openrouter.ts). A refused reservation sends nothing and throws SpendRefused; a ledger
// that cannot answer sends nothing and throws its error. An attempt's cost is not known when it got no answer (a
// time-out, a lost connection) or an answer with no cost: its reservation then stays counted, beside the known cost of
// any other attempt. An HTTP error with no cost, and an attempt that was never sent, count nothing.
//
// A safety read (`Meter.safetyRead`) is the child's words read for danger at the cap. It cannot be refused and is sent
// even with no ledger, and it counts only toward the month's total, never the child's week.
import type { AiClient } from "@/lib/ai-client";
import { chargeOf, RESERVE_USD, usdToMicros, type Charge, type SpendCall, type SpendLedger } from "@/lib/maya-spend";

/** A paid request the cap refused: the week is used up. Nothing was sent. */
export class SpendRefused extends Error {
  constructor(readonly state: "week_used" | "paused") {
    super(state === "week_used" ? "Maya's time for this week is used up" : "Maya could not check her time");
    this.name = "SpendRefused";
  }
}

/** Who a client charges, and how it names each reservation. */
export interface Meter {
  ledger: SpendLedger;
  charge: Charge;
  callId: string | null;
  newId: () => string;
  safetyRead?: boolean;
}

/** What a metered client asks of the client it wraps: send with this fetch, and take this step before each attempt. */
export interface MeterHooks {
  fetch: typeof globalThis.fetch;
  onRequest: () => Promise<void>;
}

/**
 * The client `make` builds with hooks that reserve RESERVE_USD[what] for each attempt and read its cost. `base`: the
 * network fetch (tests give a fake).
 */
export function meteredAi(make: (hooks: MeterHooks) => AiClient, meter: Meter, what: keyof typeof RESERVE_USD, base: typeof globalThis.fetch = globalThis.fetch): AiClient {
  const { ledger, safetyRead = false } = meter;
  const charge: Charge = safetyRead ? { kind: "global", parentId: meter.charge.parentId, childId: meter.charge.childId } : meter.charge;
  const settle = async (id: string, usd: number | null) => {
    await ledger.settleUsd(id, usd).catch((e: unknown) => {
      console.error("[maya spend] not settled", id, e instanceof Error ? e.message : String(e));
    });
  };
  return {
    model: make({ fetch: base, onRequest: async () => {} }).model,
    async json(request, signal) {
      /** The reservation of the attempt under way. */
      const attempt: { id: string | null; sent: boolean } = { id: null, sent: false };
      const onRequest = async () => {
        const id = meter.newId();
        try {
          const reserved = await ledger.reserve({ id, charge, callId: meter.callId, what, micros: usdToMicros(RESERVE_USD[what], ledger.config), force: safetyRead });
          if (!reserved.ok) throw new SpendRefused(reserved.state);
          attempt.id = id;
          attempt.sent = false;
        } catch (e) {
          if (!safetyRead) throw e;
          attempt.id = null;
          console.error("[maya spend] a safety read goes without the ledger", e instanceof Error ? e.message : String(e));
        }
      };
      const counted: typeof globalThis.fetch = async (input, init) => {
        let body = init?.body;
        if (typeof body === "string") {
          try {
            body = JSON.stringify({ ...JSON.parse(body), usage: { include: true } });
          } catch {
            // Not JSON: sent as it is.
          }
        }
        const id = attempt.id;
        attempt.sent = true;
        let res: Response;
        try {
          res = await base(input, { ...init, body });
        } catch (e) {
          attempt.id = null;
          if (id) await settle(id, null);
          throw e;
        }
        let cost: unknown;
        try {
          cost = (JSON.parse(await res.clone().text()) as { usage?: { cost?: unknown } }).usage?.cost;
        } catch {
          cost = undefined;
        }
        attempt.id = null;
        if (id) await settle(id, typeof cost === "number" && Number.isFinite(cost) && cost >= 0 ? cost : res.ok ? null : 0);
        return res;
      };
      try {
        return await make({ fetch: counted, onRequest }).json(request, signal);
      } finally {
        // An attempt reserved and then stopped before it was sent cost nothing.
        if (attempt.id) await settle(attempt.id, attempt.sent ? null : 0);
      }
    },
  };
}

/**
 * The AI of a child profile rebuild after a call: behind the ledger for the call's child while the ledger is open, else
 * none, with the earlier findings kept (`keepFindings` of src/lib/child-profile.ts).
 */
export async function profileAi(ledger: SpendLedger, call: SpendCall, newId: () => string, make: (hooks: MeterHooks) => AiClient, base: typeof globalThis.fetch = globalThis.fetch): Promise<{ ai: AiClient | null; keepFindings: boolean }> {
  const charge = chargeOf(call);
  if ((await ledger.state(charge)) !== "open") return { ai: null, keepFindings: true };
  return { ai: meteredAi(make, { ledger, charge, callId: call.id, newId }, "profile", base), keepFindings: false };
}
