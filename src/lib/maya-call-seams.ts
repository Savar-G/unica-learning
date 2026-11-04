import "server-only";
import { randomInt, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aiClient } from "@/lib/ai-client";
import { assessmentQuestionReader } from "@/lib/assessment-questions";
import { rebuildChildProfile } from "@/lib/child-profile";
import { childProfileAiClient, type QuestionReader } from "@/lib/child-profile-ai";
import { childProfileStore } from "@/lib/child-profile-store";
import type { Database } from "@/lib/database";
import { learningEvents } from "@/lib/learning-events";
import { learningEventStore } from "@/lib/learning-events-store";
import { mayaCalls, FAKE_MODEL_ID, type CallSeams, type MayaCalls } from "@/lib/maya-call";
import { callAlerts } from "@/lib/maya-call-alert";
import { mayaAlertLedger } from "@/lib/maya-call-alert-store";
import { writeNoteAfterCall } from "@/lib/maya-call-note-server";
import { mayaCallStore, mayaConnectionLog } from "@/lib/maya-call-store";
import { aiMayaModel, type MayaModel } from "@/lib/maya-model";
import { ruleMayaModel } from "@/lib/maya-model-fake";
import { aiTalkReviewer, REVIEW_DEFAULT_MODEL, type TalkReviewer } from "@/lib/maya-talk-review";
import { wordingHistoryStore } from "@/lib/maya-wording-history-store";
import { workbookStore } from "@/lib/workbook-store";

// The seams of Maya's calls (src/lib/maya-call.ts) on a Supabase client with the secret key: the call store, the
// connection log of voice calls, the wording history, the learning events, the profile rebuild, the model and the
// free-talk review, the internal safety alerts (#333) and the parent's call note (#331). The web server (src/lib/maya-call-server.ts) and Maya's voice worker (worker/maya-voice) both use
// it, so a voice call is stored exactly as a text call is. No Next.js import: the worker runs outside Next.

type Env = Readonly<Record<string, string | undefined>>;

/** The site a safety alert's admin link points to when the caller names none (the voice worker). */
const siteOrigin = (env: Env) => env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "") || "https://unicalearning.com";

/**
 * The model a call uses: null asks for the one a new call uses now (Maya's model through OpenRouter, `AI_MODEL`, when
 * OPENROUTER_API_KEY is set, else the fake rule player); an id asks for that model again, or null when it is gone.
 */
export function callModel(id: string | null, env: Env = process.env): MayaModel | null {
  const client = aiClient(env);
  if (id === null) return client ? aiMayaModel(client) : ruleMayaModel();
  if (id === FAKE_MODEL_ID) return ruleMayaModel();
  return client && client.model === id ? aiMayaModel(client) : null;
}

/**
 * The free-talk review of a call (D-197): MAYA_REVIEW_MODEL (default Claude Haiku 5.5) through OpenRouter, a second
 * model beside Maya's. Null for the fake rule player (it says no free talk) and without OPENROUTER_API_KEY.
 */
export function callReviewer(modelId: string, env: Env = process.env): TalkReviewer | null {
  if (modelId === FAKE_MODEL_ID) return null;
  const client = aiClient(env, env.MAYA_REVIEW_MODEL?.trim() || REVIEW_DEFAULT_MODEL);
  return client ? aiTalkReviewer(client) : null;
}

async function isTestFamily(db: SupabaseClient<Database>, parentId: string): Promise<boolean> {
  const { data, error } = await db.from("test_accounts").select("parent_id").eq("parent_id", parentId).maybeSingle();
  if (error) throw new Error(`test family check: ${error.message}`);
  return data !== null;
}

/** Rebuilds a child's profile on this client; true when it was built. Never throws. */
async function rebuild(db: SupabaseClient<Database>, childId: string, factsOnly = false): Promise<boolean> {
  try {
    const workbooks = workbookStore(db);
    const tests = assessmentQuestionReader(db);
    const questions: QuestionReader = { question: (ref) => (ref.source === "workbook" ? workbooks.question(ref) : tests.question(ref)) };
    const result = await rebuildChildProfile(childId, { profiles: childProfileStore(db), events: learningEventStore(db), ai: factsOnly ? null : childProfileAiClient(), questions });
    return result.built === true;
  } catch (e) {
    console.error("[maya call] profile rebuild failed", childId, e instanceof Error ? e.message : String(e));
    return false;
  }
}

/** `origin`: the site the safety alert's admin link points to; default NEXT_PUBLIC_SITE_URL, else the production site. */
export function callSeams(db: SupabaseClient<Database>, options: { env?: Env; origin?: string; rebuild?: CallSeams["rebuild"] } = {}): CallSeams {
  const env = options.env ?? process.env;
  return {
    alerts: callAlerts({ ledger: mayaAlertLedger(db), to: env.SIGNUP_NOTIFY_EMAIL || null, origin: options.origin ?? siteOrigin(env) }),
    store: mayaCallStore(db),
    connections: mayaConnectionLog(db),
    history: wordingHistoryStore(db),
    events: learningEvents(learningEventStore(db)),
    rebuild: options.rebuild ?? ((childId, o) => rebuild(db, childId, o?.factsOnly)),
    model: (id) => callModel(id, env),
    reviewer: (modelId) => callReviewer(modelId, env),
    isTestFamily: (parentId) => isTestFamily(db, parentId),
    note: writeNoteAfterCall(db),
    clock: () => Date.now(),
    newId: () => randomUUID(),
    seed: () => randomInt(0, 2 ** 32),
  };
}

/** The call module on a client with the secret key. */
export const callsOn = (db: SupabaseClient<Database>, options?: Parameters<typeof callSeams>[1]): MayaCalls => mayaCalls(callSeams(db, options));
