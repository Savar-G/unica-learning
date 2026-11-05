// Maya's paid AI requests through the spending ledger (src/lib/maya-spend.ts, D-290): a client that reserves before
// each request and settles with the cost OpenRouter reports for it (usage accounting, the same as `costingFetch` in
// src/lib/ai-openrouter.ts). A refused reservation sends nothing and throws SpendRefused; a ledger that cannot answer
// sends nothing and throws its error. The cost is not known when a try got no answer (a time-out, a lost connection)
// or an answer with no cost: the reservation then stays counted. An HTTP error answer with no cost counts nothing.
import type { AiClient } from "@/lib/ai-client";
import { RESERVE_USD, usdToMicros, type Charge, type SpendLedger } from "@/lib/maya-spend";

/** A paid request the cap refused: the week is used, or Maya is paused. Nothing was sent. */
export class SpendRefused extends Error {
  constructor(readonly state: "week_used" | "paused") {
    super(state === "week_used" ? "Maya's time for this week is used up" : "Maya is taking a short break");
    this.name = "SpendRefused";
  }
}

/** Who a client charges, and how it names each reservation. */
export interface Meter {
  ledger: SpendLedger;
  charge: Charge;
  callId: string | null;
  newId: () => string;
}

/**
 * The client `make` builds with a fetch that asks for and reads the cost, behind a reservation of RESERVE_USD[what]
 * per request (retries included). `base`: the network fetch (tests give a fake).
 */
export function meteredAi(make: (fetch: typeof globalThis.fetch) => AiClient, meter: Meter, what: keyof typeof RESERVE_USD, base: typeof globalThis.fetch = globalThis.fetch): AiClient {
  return {
    model: make(base).model,
    async json(request, signal) {
      const id = meter.newId();
      const reserved = await meter.ledger.reserve({ id, charge: meter.charge, callId: meter.callId, what, micros: usdToMicros(RESERVE_USD[what], meter.ledger.config) });
      if (!reserved.ok) throw new SpendRefused(reserved.state);
      let usd = 0;
      let unknown = false;
      const counted: typeof globalThis.fetch = async (input, init) => {
        let body = init?.body;
        if (typeof body === "string") {
          try {
            body = JSON.stringify({ ...JSON.parse(body), usage: { include: true } });
          } catch {
            // Not JSON: sent as it is.
          }
        }
        let res: Response;
        try {
          res = await base(input, { ...init, body });
        } catch (e) {
          unknown = true;
          throw e;
        }
        let cost: unknown;
        try {
          cost = (JSON.parse(await res.clone().text()) as { usage?: { cost?: unknown } }).usage?.cost;
        } catch {
          cost = undefined;
        }
        if (typeof cost === "number" && Number.isFinite(cost) && cost >= 0) usd += cost;
        else if (res.ok) unknown = true;
        return res;
      };
      try {
        return await make(counted).json(request, signal);
      } finally {
        await meter.ledger.settleUsd(id, unknown ? null : usd).catch((e: unknown) => {
          console.error("[maya spend] not settled", id, e instanceof Error ? e.message : String(e));
        });
      }
    },
  };
}
