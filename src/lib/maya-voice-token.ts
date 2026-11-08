import "server-only";
import { AccessToken, RoomAgentDispatch, RoomConfiguration, TrackSource } from "livekit-server-sdk";
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
}): Promise<MintResult> {
  const { call } = input;
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
  at.roomConfig = new RoomConfiguration({
    agents: [new RoomAgentDispatch({ agentName: VOICE_AGENT_NAME, metadata: JSON.stringify({ callId: call.id }) })],
  });
  const token = await at.toJwt();
  const now = input.now ?? Date.now();
  return { ok: true, ticket: { url: input.project.url, token, room: voiceRoom(call.id), identity, expiresAt: new Date(now + VOICE_TOKEN_TTL_SECONDS * 1000).toISOString() } };
}
