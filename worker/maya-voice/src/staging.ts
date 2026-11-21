// Lab settings of a non-production LiveKit deployment of Maya's worker (docs/maya-voice-deploy.md, #1137). LiveKit
// Cloud sets LIVEKIT_AGENT_DEPLOYMENT on every container: empty in production, the deployment's name (for example
// "staging") in a non-production copy. Secrets are shared by all deployments, so a staging-only setting cannot be a
// secret: it comes from the job's metadata, which only an admin test call can carry (src/lib/maya-voice-token.ts
// `staging`), and only a named deployment reads it. Production never does, whatever a job says.
import { inference, type voice } from "@livekit/agents";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import type { CallRecord } from "@/lib/maya-call";

/** One admin test call's settings on a non-production deployment. A setting left out keeps production's behaviour. */
export interface StagingLab {
  /** LiveKit's interruption handling: its adaptive model, or voice activity only. Production sets no mode. */
  interruption?: "adaptive" | "vad";
  /** Who ends the child's turn: the speech-to-text (production) or LiveKit's multimodal turn detector. */
  turnDetection?: "stt" | "multimodal";
  /** LiveKit Cloud's Krisp filter on the child's audio: noise only (NC), or background voices too (BVC). */
  noise?: "krisp-nc" | "krisp-bvc";
  /** How long LiveKit waits for words before it resumes a paused Maya (ms). Production: MAYA_FALSE_INTERRUPTION_MS. */
  falseInterruptionMs?: "500" | "700" | "1000" | "1500" | "2000";
}

const ALLOWED: { [K in keyof StagingLab]-?: readonly NonNullable<StagingLab[K]>[] } = {
  interruption: ["adaptive", "vad"],
  turnDetection: ["stt", "multimodal"],
  noise: ["krisp-nc", "krisp-bvc"],
  falseInterruptionMs: ["500", "700", "1000", "1500", "2000"],
};

/** The deployment's name and job settings. Production ignores the metadata. A named worker refuses an untargeted job. */
export function stagingLab(env: Readonly<Record<string, string | undefined>>, jobMetadata: string): { deployment: string; lab: StagingLab } | null | false {
  const deployment = env.LIVEKIT_AGENT_DEPLOYMENT?.trim() ?? "";
  if (!deployment || deployment === "production") return null;
  let job: { deployment?: unknown; lab?: unknown } | null;
  try { job = JSON.parse(jobMetadata); } catch { return false; }
  if (job?.deployment !== deployment) return false;
  const asked = job.lab;
  const lab: Record<string, string> = {};
  if (asked && typeof asked === "object") {
    for (const [key, values] of Object.entries(ALLOWED)) {
      const value = (asked as Record<string, unknown>)[key];
      if (typeof value === "string" && (values as readonly string[]).includes(value)) lab[key] = value;
    }
  }
  return { deployment, lab: lab as StagingLab };
}

/** Check current grants from the database before the named worker connects or opens the call. */
export async function authorizedStagingCall(
  db: SupabaseClient<Database>,
  call: Pick<CallRecord, "kind" | "mode" | "status" | "startedBy" | "parentId">,
): Promise<boolean> {
  if (call.kind !== "admin_test" || call.mode !== "voice" || call.status !== "live" || !call.startedBy) return false;
  try {
    const [admin, family] = await Promise.all([
      db.from("admin_users").select("user_id").eq("user_id", call.startedBy).maybeSingle(),
      db.from("test_accounts").select("parent_id").eq("parent_id", call.parentId).maybeSingle(),
    ]);
    return !admin.error && !family.error && admin.data?.user_id === call.startedBy && family.data?.parent_id === call.parentId;
  } catch {
    return false;
  }
}

/** The session's turn handling a lab changes (agent.ts `voiceSession`). Nothing without lab settings. */
export function labTurnHandling(lab: StagingLab | undefined): { turnDetection?: InstanceType<typeof inference.TurnDetector>; interruptionMode?: "adaptive" | "vad"; falseInterruptionMs?: number } {
  return {
    ...(lab?.falseInterruptionMs ? { falseInterruptionMs: Number(lab.falseInterruptionMs) } : {}),
    ...(lab?.turnDetection === "multimodal" ? { turnDetection: new inference.TurnDetector() } : {}),
    ...(lab?.interruption ? { interruptionMode: lab.interruption } : {}),
  };
}

/**
 * The session's room input a lab changes: LiveKit Cloud's Krisp filter on the child's audio. Nothing without one. The
 * package is imported only here: its import loads a native filter and sets OPENBLAS_NUM_THREADS, which production
 * must not get.
 */
export async function labInput(lab: StagingLab | undefined): Promise<Pick<voice.RoomInputOptions, "noiseCancellation">> {
  if (!lab?.noise) return {};
  const krisp = await import("@livekit/noise-cancellation-node");
  return { noiseCancellation: lab.noise === "krisp-bvc" ? krisp.BackgroundVoiceCancellation() : krisp.NoiseCancellation() };
}
