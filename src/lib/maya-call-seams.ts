import "server-only";
import { randomInt, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aiClient } from "@/lib/ai-client";
import { mayaAiClient } from "@/lib/maya-ai-route";
import { assessmentQuestionReader } from "@/lib/assessment-questions";
import { rebuildChildProfile } from "@/lib/child-profile";
import { childProfileAiClient, type QuestionReader } from "@/lib/child-profile-ai";
import { childProfileStore } from "@/lib/child-profile-store";
import type { Database } from "@/lib/database";
import type { MailTransport } from "@/lib/email-delivery";
import { learningEvents } from "@/lib/learning-events";
import { learningEventStore } from "@/lib/learning-events-store";
import { mayaCalls, FAKE_MODEL_ID, type CallSeams, type MayaCalls, type SpendCall } from "@/lib/maya-call";
import { callAlerts } from "@/lib/maya-call-alert";
import { mayaAlertLedger } from "@/lib/maya-call-alert-store";
import { writeNoteAfterCall } from "@/lib/maya-call-note-server";
import { mayaCallStore, mayaConnectionLog } from "@/lib/maya-call-store";
import { conversationalMayaModel, type MayaModel } from "@/lib/maya-model";
import { ruleConversationalModel } from "@/lib/maya-model-fake";
import { aiTalkReviewer, REVIEW_DEFAULT_MODEL, type TalkReviewer } from "@/lib/maya-talk-review";
import { wordingHistoryStore } from "@/lib/maya-wording-history-store";
import { chargeOf, type SpendLedger } from "@/lib/maya-spend";
import { profileAi } from "@/lib/maya-spend-ai";
import { mayaCallSpend, mayaSpendLedger, meteredClient } from "@/lib/maya-spend-server";
import { workbookStore } from "@/lib/workbook-store";

// The seams of Maya's calls (src/lib/maya-call.ts) on a Supabase client with the secret key: the call store, the
// connection log of voice calls, the wording history, the learning events, the profile rebuild, the model and the
// free-talk review, the internal safety alerts (#333), the parent's call note (#331) and Maya's spending cap (D-290: every
// OpenRouter attempt of a call, the profile's findings after it included, is reserved and settled in the spending ledger
// for the call's child, or only toward the month's total on an admin test call and a safety read). The web server (src/lib/maya-call-server.ts) and Maya's voice worker (worker/maya-voice) both use
// it, so a voice call is stored exactly as a text call is. No Next.js import: the worker runs outside Next.

type Env = Readonly<Record<string, string | undefined>>;

/** The site a safety alert's admin link points to when the caller names none (the voice worker). */
const siteOrigin = (env: Env) => env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "") || "https://unicalearning.com";

/**
 * The model a call uses: null asks for the one a new call uses now (Maya's model through OpenRouter, `AI_MODEL`, when
 * OPENROUTER_API_KEY is set, else the fake rule player); an id asks for that model again, or null when it is gone.
 */
export function callModel(id: string | null, env: Env = process.env, metered?: { ledger: SpendLedger; call: SpendCall; newId: () => string; safetyRead?: boolean }): MayaModel | null {
  const client = metered ? meteredClient(env, metered.ledger, { charge: chargeOf(metered.call), callId: metered.call.id, budgetKey: metered.call.budgetKey, newId: metered.newId, safetyRead: metered.safetyRead }, "model") : mayaAiClient(env);
  if (id === null) return client ? conversationalMayaModel(client) : ruleConversationalModel();
  if (id === FAKE_MODEL_ID) return ruleConversationalModel();
  return client && client.model === id ? conversationalMayaModel(client) : null;
}

/**
 * The free-talk review of a call (D-197): MAYA_REVIEW_MODEL (default Claude Haiku 5.5) through OpenRouter, a second
 * model beside Maya's. Null for the fake rule player (it says no free talk) and without OPENROUTER_API_KEY.
 */
export function callReviewer(modelId: string, env: Env = process.env, metered?: { ledger: SpendLedger; call: SpendCall; newId: () => string }): TalkReviewer | null {
  if (modelId === FAKE_MODEL_ID) return null;
  const model = env.MAYA_REVIEW_MODEL?.trim() || REVIEW_DEFAULT_MODEL;
  const client = metered ? meteredClient(env, metered.ledger, { charge: chargeOf(metered.call), callId: metered.call.id, budgetKey: metered.call.budgetKey, newId: metered.newId }, "review", model) : mayaAiClient(env, model);
  return client ? aiTalkReviewer(client) : null;
}

async function isTestFamily(db: SupabaseClient<Database>, parentId: string): Promise<boolean> {
  const { data, error } = await db.from("test_accounts").select("parent_id").eq("parent_id", parentId).maybeSingle();
  if (error) throw new Error(`test family check: ${error.message}`);
  return data !== null;
}

/**
 * Rebuilds a child's profile on this client; true when it was built. Never throws. After a call (`options.call`) the AI's
 * request is behind the spending ledger; when the ledger does not allow it, no request goes and the earlier findings stay.
 * The development fake costs nothing and stays as it is.
 */
async function rebuild(db: SupabaseClient<Database>, env: Env, ledger: SpendLedger, childId: string, options: { factsOnly?: boolean; call?: SpendCall } = {}): Promise<boolean> {
  try {
    const plain = options.factsOnly ? null : childProfileAiClient();
    const { ai, keepFindings } = plain && options.call && plain.model !== "fake"
      ? await profileAi(ledger, options.call, () => randomUUID(), (hooks) => aiClient(env, undefined, { ...hooks, usage: { feature: "child_profile", parentId: options.call?.parentId, childId, source: options.call ? { kind: "maya_call", id: options.call.id } : null } })!)
      : { ai: plain, keepFindings: false };
    const workbooks = workbookStore(db);
    const tests = assessmentQuestionReader(db);
    const questions: QuestionReader = { question: (ref) => (ref.source === "workbook" ? workbooks.question(ref) : tests.question(ref)) };
    const result = await rebuildChildProfile(childId, { profiles: childProfileStore(db), events: learningEventStore(db), ai, keepFindings, questions });
    return result.built === true;
  } catch (e) {
    console.error("[maya call] profile rebuild failed", childId, e instanceof Error ? e.message : String(e));
    return false;
  }
}

/** `origin`: the site the safety alert's admin link points to; default NEXT_PUBLIC_SITE_URL, else the production site. `transport`: the alert's; default Resend. */
export function callSeams(db: SupabaseClient<Database>, options: { env?: Env; origin?: string; rebuild?: CallSeams["rebuild"]; transport?: MailTransport } = {}): CallSeams {
  const env = options.env ?? process.env;
  const ledger = mayaSpendLedger(db, { env });
  const meter = (call: SpendCall | undefined, how?: { safetyRead?: boolean }) => (call ? { ledger, call, newId: () => randomUUID(), ...how } : undefined);
  return {
    alerts: callAlerts({ ledger: mayaAlertLedger(db), to: env.SIGNUP_NOTIFY_EMAIL || null, origin: options.origin ?? siteOrigin(env), transport: options.transport }),
    store: mayaCallStore(db),
    connections: mayaConnectionLog(db),
    history: wordingHistoryStore(db),
    events: learningEvents(learningEventStore(db)),
    rebuild: options.rebuild ?? ((childId, o) => rebuild(db, env, ledger, childId, o)),
    model: (id, call, how) => callModel(id, env, meter(call, how)),
    reviewer: (modelId, call) => callReviewer(modelId, env, meter(call)),
    spend: mayaCallSpend(ledger, () => randomUUID()),
    isTestFamily: (parentId) => isTestFamily(db, parentId),
    note: writeNoteAfterCall(db, { ledger }),
    clock: () => Date.now(),
    newId: () => randomUUID(),
    seed: () => randomInt(0, 2 ** 32),
  };
}

/** The call module on a client with the secret key. */
export const callsOn = (db: SupabaseClient<Database>, options?: Parameters<typeof callSeams>[1]): MayaCalls => mayaCalls(callSeams(db, options));
