import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { aiClient, type AiClient } from "@/lib/ai-client";
import { resendTransport } from "@/lib/email-resend";
import type { MailTransport } from "@/lib/email-delivery";
import { familyZone, formatInZone, type FamilyZone } from "@/lib/family-time";
import { loadFamilyProvince } from "@/lib/family-time-server";
import { callSpend, createSpendLedger, spendConfig, MICROS_PER_CAD, SPEND_MONTH_ZONE, type CallSpend, type Charge, type SpendLedger } from "@/lib/maya-spend";
import { meteredAi } from "@/lib/maya-spend-ai";
import { mayaSpendStore } from "@/lib/maya-spend-store";

// Maya's spending ledger on the server (D-290, D-291): the Supabase store with the secret key, the family's time zone
// from the parent's row (the shared family-zone rule), the monthly alert email to SIGNUP_NOTIFY_EMAIL, and the metered
// OpenRouter clients of Maya's model, her free-talk review and the call note. The web server and Maya's voice worker
// both use it through src/lib/maya-call-seams.ts.

type Env = Readonly<Record<string, string | undefined>>;

/** The family's time zone: parents.time_zone, else the postal code, else the oldest child's province, else Pacific. */
export function familyZoneLookup(db: SupabaseClient<Database>): (parentId: string) => Promise<FamilyZone> {
  const known = new Map<string, Promise<FamilyZone>>();
  return (parentId) => {
    let zone = known.get(parentId);
    if (!zone) {
      zone = (async () => {
        const [{ data, error }, province] = await Promise.all([
          db.from("parents").select("time_zone, postal").eq("id", parentId).maybeSingle(),
          loadFamilyProvince(db, parentId),
        ]);
        if (error) throw new Error(`family time zone: ${error.message}`);
        return familyZone({ timeZone: data?.time_zone, postal: data?.postal, province });
      })();
      zone.catch(() => known.delete(parentId));
      known.set(parentId, zone);
    }
    return zone;
  };
}

/** The team's email when Maya's monthly total is reached. Plain words, no family data. */
export function spendAlertEmail(month: string, monthlyMicros: number): { subject: string; text: string } {
  const name = formatInZone(Date.parse(`${month}T12:00:00Z`), SPEND_MONTH_ZONE, { month: "long", year: "numeric" });
  const cad = (monthlyMicros / MICROS_PER_CAD).toFixed(2);
  return {
    subject: "Maya is paused: the monthly spending total is reached",
    text: [
      `Maya's spending for ${name} reached the monthly total of CAD ${cad}.`,
      "New chats and calls are paused until the month ends. Families see \"Maya is taking a short break. There's no extra charge.\"",
      "To go on this month, raise MAYA_MONTHLY_CAP_CAD in Vercel and in the voice worker's settings.",
      "This email is sent once a month.",
    ].join("\n\n"),
  };
}

/** The spending ledger on a client with the secret key. `transport`: Resend when not given. */
export function mayaSpendLedger(db: SupabaseClient<Database>, options: { env?: Env; transport?: MailTransport; clock?: () => number } = {}): SpendLedger {
  const env = options.env ?? process.env;
  const config = spendConfig(env);
  const to = env.SIGNUP_NOTIFY_EMAIL?.trim() || null;
  return createSpendLedger({
    store: mayaSpendStore(db),
    clock: options.clock ?? Date.now,
    config,
    zone: familyZoneLookup(db),
    async alert(month) {
      if (!to) return console.error("[maya spend] the monthly total is reached; SIGNUP_NOTIFY_EMAIL is not set");
      const sent = await (options.transport ?? resendTransport()).send({ sender: { to: "savar" }, to, ...spendAlertEmail(month, config.monthlyMicros) });
      if (sent.status !== "sent") console.error("[maya spend] the monthly alert did not go", sent.status, sent.error);
    },
  });
}

/** The call seam of the spending ledger (src/lib/maya-call.ts `spend`). */
export function mayaCallSpend(ledger: SpendLedger, newId: () => string): CallSpend {
  return callSpend(ledger, { clock: Date.now, newId });
}

/**
 * An OpenRouter client behind the ledger: the model `model` (or AI_MODEL), charged to `charge`. Null without
 * OPENROUTER_API_KEY.
 */
export function meteredClient(env: Env, ledger: SpendLedger, meter: { charge: Charge; callId: string | null; newId: () => string }, what: "model" | "review" | "note", model?: string): AiClient | null {
  if (!aiClient(env, model)) return null;
  return meteredAi((fetch) => aiClient(env, model, fetch)!, { ledger, ...meter }, what);
}
