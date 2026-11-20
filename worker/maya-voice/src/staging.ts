// Lab settings of a non-production LiveKit deployment of Maya's worker (docs/maya-voice-deploy.md, #1137). LiveKit
// Cloud sets LIVEKIT_AGENT_DEPLOYMENT on every container: empty in production, the deployment's name (for example
// "staging") in a non-production copy. Secrets are shared by all deployments, so a staging-only setting cannot be a
// secret: it comes from the job's metadata, which only an admin test call can carry (src/lib/maya-voice-token.ts
// `staging`), and only a named deployment reads it. Production never does, whatever a job says.
import { inference, type voice } from "@livekit/agents";

/** One admin test call's settings on a non-production deployment. A setting left out keeps production's behaviour. */
export interface StagingLab {
  /** LiveKit's interruption handling: its adaptive model, or voice activity only. Production sets no mode. */
  interruption?: "adaptive" | "vad";
  /** Who ends the child's turn: the speech-to-text (production) or LiveKit's multimodal turn detector. */
  turnDetection?: "stt" | "multimodal";
  /** LiveKit Cloud's Krisp filter on the child's audio: noise only (NC), or background voices too (BVC). */
  noise?: "krisp-nc" | "krisp-bvc";
}

const ALLOWED: { [K in keyof StagingLab]-?: readonly NonNullable<StagingLab[K]>[] } = {
  interruption: ["adaptive", "vad"],
  turnDetection: ["stt", "multimodal"],
  noise: ["krisp-nc", "krisp-bvc"],
};

/** The deployment's name and the job's lab settings, or null in production (no deployment name). */
export function stagingLab(env: Readonly<Record<string, string | undefined>>, jobMetadata: string): { deployment: string; lab: StagingLab } | null {
  const deployment = env.LIVEKIT_AGENT_DEPLOYMENT?.trim() ?? "";
  if (!deployment || deployment === "production") return null;
  let asked: unknown = null;
  try { asked = (JSON.parse(jobMetadata) as { lab?: unknown }).lab; } catch { /* Not JSON: no lab settings. */ }
  const lab: Record<string, string> = {};
  if (asked && typeof asked === "object") {
    for (const [key, values] of Object.entries(ALLOWED)) {
      const value = (asked as Record<string, unknown>)[key];
      if (typeof value === "string" && (values as readonly string[]).includes(value)) lab[key] = value;
    }
  }
  return { deployment, lab: lab as StagingLab };
}

/** The session's turn handling a lab changes (agent.ts `voiceSession`). Nothing without lab settings. */
export function labTurnHandling(lab: StagingLab | undefined): { turnDetection?: InstanceType<typeof inference.TurnDetector>; interruptionMode?: "adaptive" | "vad" } {
  return {
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
