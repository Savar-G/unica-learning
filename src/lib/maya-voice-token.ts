import "server-only";
import { AccessToken, AgentDispatchClient, RoomAgentDispatch, RoomConfiguration, TrackSource } from "livekit-server-sdk";
import { callNeedsNotice, type MayaNotice } from "@/lib/maya-notice";
import { ATTR, childGrant, childIdentity, VOICE_AGENT_NAME, VOICE_TOKEN_TTL_SECONDS, voiceRoom, type VoiceCallFacts, type VoiceTicket } from "@/lib/maya-voice";

export type { VoiceTicket } from "@/lib/maya-voice";

// The LiveKit token of a voice call (#326): short-lived, for one participant (the call's child) in one room (the
// call's), and only for a live voice call of that family. Minted on the server with LIVEKIT_API_SECRET, which never
// leaves it. The token also asks LiveKit to send Maya's worker (agent name maya-voice) to the room, with the call id.

export type MintResult = { ok: true; ticket: VoiceTicket } | { ok: false; error: "not_voice" | "ended" | "wrong_family" | "notice_required" };

/**
 * Mints the token for `parentId` and `childId` to join `call`. Refused unless the call is a live voice call of that
 * parent and that child: a family never gets a token for another family's call, and a token never names another room.
 * Also refused unless the family agreed to the Maya notice (#529), except an admin test call. `notice` is required, so a
 * later caller cannot forget it; null (no secret key) refuses every call that needs it.
 */
export async function mintVoiceToken(input: {
  call: VoiceCallFacts & { kind: string };
  notice: Pick<MayaNotice, "accepted"> | null;
  parentId: string;
  childId: string;
  project: { url: string; apiKey: string; apiSecret: string };
  /** The child's first name, shown to Maya's worker; never trusted for anything. */
  name?: string | null;
  now?: number;
  /** Sends Maya's worker to the room now. Default: LiveKit's dispatch API. Tests pass their own, or null for none. */
  dispatch?: ((room: string, metadata: string, deployment: string) => Promise<void>) | null;
  /**
   * An admin test call only: the non-production LiveKit deployment of Maya's worker that takes the call, and the lab
   * settings that deployment reads from the job (worker/maya-voice/src/staging.ts). The site's routes never pass it, so
   * every family call goes to production (docs/maya-voice-deploy.md).
   */
  staging?: { deployment: string; lab?: Record<string, string> };
}): Promise<MintResult> {
  const { call } = input;
  const deployment = stagingDeployment(call.kind, input.staging);
  if (call.mode !== "voice") return { ok: false, error: "not_voice" };
  if (call.status !== "live") return { ok: false, error: "ended" };
  if (call.parentId !== input.parentId || call.childId !== input.childId) return { ok: false, error: "wrong_family" };
  if (callNeedsNotice(call.kind) && !(await input.notice?.accepted(call.parentId))) return { ok: false, error: "notice_required" };
  const identity = childIdentity(call.childId);
  const at = new AccessToken(input.project.apiKey, input.project.apiSecret, {
    identity,
    name: input.name?.slice(0, 60) || "Child",
    ttl: VOICE_TOKEN_TTL_SECONDS,
    attributes: { [ATTR.call]: call.id, [ATTR.parent]: call.parentId, [ATTR.child]: call.childId },
  });
  const grant = childGrant(call.id);
  at.addGrant({ ...grant, canPublishSources: [TrackSource.MICROPHONE] });
  const metadata = JSON.stringify({ callId: call.id, ...(deployment ? { deployment, lab: input.staging?.lab } : {}) });
  at.roomConfig = new RoomConfiguration({
    agents: [new RoomAgentDispatch({ agentName: VOICE_AGENT_NAME, metadata, deployment })],
  });
  // The worker is sent now, while the child checks the microphone, so Maya is ready when the child connects (the
  // opening's speed, 2026-11-13). The token's own dispatch stays: LiveKit applies it only when the join creates the
  // room, so it covers a failed early dispatch and a child who connects after the waiting worker has left.
  // Tests make no network call unless they pass their own dispatch.
  const dispatch = input.dispatch === undefined ? (process.env.NODE_ENV === "test" ? null : earlyDispatch(input.project)) : input.dispatch;
  if (dispatch) {
    try { await Promise.race([dispatch(voiceRoom(call.id), metadata, deployment), new Promise((_, no) => setTimeout(() => no(new Error("timeout")), EARLY_DISPATCH_LIMIT_MS))]); }
    catch (e) { console.warn("[maya voice] early dispatch failed", call.id, e instanceof Error ? e.message : "unknown"); }
  }
  const token = await at.toJwt();
  const now = input.now ?? Date.now();
  return { ok: true, ticket: { url: input.project.url, token, room: voiceRoom(call.id), identity, expiresAt: new Date(now + VOICE_TOKEN_TTL_SECONDS * 1000).toISOString() } };
}

/** LiveKit's deployment names (docs.livekit.io/deploy/agents/deployments): `production` is the default, never named. */
const DEPLOYMENT_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,61}[A-Za-z0-9])?$/;

export function assertStagingDeploymentName(name: string): void {
  if (name.toLowerCase() === "production" || !DEPLOYMENT_NAME.test(name)) throw new Error("not a non-production deployment name");
}

/** The deployment that takes the call: "" (production) unless an admin test call names a non-production one. */
function stagingDeployment(kind: string, staging: { deployment: string } | undefined): string {
  if (!staging) return "";
  if (kind !== "admin_test") throw new Error("a non-production deployment takes admin test calls only");
  assertStagingDeploymentName(staging.deployment);
  return staging.deployment;
}

/** The longest a ticket waits for the early dispatch. The token's own dispatch covers a miss. */
export const EARLY_DISPATCH_LIMIT_MS = 1500;

/** One dispatch per room: a ticket made again for a room that already has Maya's dispatch sends no second worker. */
function earlyDispatch(project: { url: string; apiKey: string; apiSecret: string }) {
  return async (room: string, metadata: string, deployment: string) => {
    const client = new AgentDispatchClient(project.url.replace(/^ws/, "http"), project.apiKey, project.apiSecret);
    const existing = await client.listDispatch(room).catch(() => []);
    if (existing.some(d => d.agentName === VOICE_AGENT_NAME && d.deployment === deployment)) return;
    await client.createDispatch(room, VOICE_AGENT_NAME, { metadata, ...(deployment ? { deployment } : {}) });
  };
}
