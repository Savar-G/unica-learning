import { describe, expect, it, vi } from "vitest";
import { TokenVerifier } from "livekit-server-sdk";
import { ATTR, checkJoiner, voiceRoom, VOICE_AGENT_NAME, VOICE_TOKEN_TTL_SECONDS, type VoiceCallFacts } from "@/lib/maya-voice";
import { mintVoiceToken } from "@/lib/maya-voice-token";

vi.mock("server-only", () => ({}));

// The voice call token (#326): one participant, one room, one family, a short life. Decoded with LiveKit's own verifier,
// it admits its holder to its call's room only (LiveKit admits a join when the grant's room is the room joined), gives
// no admin, list, create or record power, and cannot be minted for another family's call.

const project = { url: "wss://unica-test.livekit.cloud", apiKey: "APItest", apiSecret: "a-test-secret-that-is-long-enough-for-hs256-0123456789" };
const verifier = new TokenVerifier(project.apiKey, project.apiSecret);

const A: VoiceCallFacts = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", parentId: "11111111-1111-4111-8111-111111111111", childId: "22222222-2222-4222-8222-222222222222", mode: "voice", status: "live" };
const B: VoiceCallFacts = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", parentId: "44444444-4444-4444-8444-444444444444", childId: "55555555-5555-4555-8555-555555555555", mode: "voice", status: "live" };
/** A second call of family A: the same child, another room. */
const A2: VoiceCallFacts = { ...A, id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" };

/** LiveKit's join rule for a room token: roomJoin, and the grant names exactly that room. */
const admits = (video: { roomJoin?: boolean; room?: string } | undefined, room: string) => video?.roomJoin === true && video.room === room;

async function mint(call: VoiceCallFacts, family = call) {
  const r = await mintVoiceToken({ call: { ...call, kind: "admin_test" }, notice: null, parentId: family.parentId, childId: family.childId, project, name: "Leah", now: Date.UTC(2026, 10, 1, 16) });
  if (!r.ok) throw new Error(r.error);
  return { ticket: r.ticket, claims: await verifier.verify(r.ticket.token) };
}

describe("a voice call token", () => {
  it("admits the call's child to the call's room, and to no other room", async () => {
    const { ticket, claims } = await mint(A);
    expect(ticket).toMatchObject({ url: project.url, room: voiceRoom(A.id), identity: `child-${A.childId}` });
    expect(claims.sub).toBe(`child-${A.childId}`);
    expect(admits(claims.video, voiceRoom(A.id))).toBe(true);
    expect(admits(claims.video, voiceRoom(B.id))).toBe(false);
    expect(admits(claims.video, voiceRoom(A2.id))).toBe(false);
    expect(admits(claims.video, "")).toBe(false);
  });

  it("gives no power beyond joining: no admin, create, list or record, no metadata changes, the microphone only", async () => {
    const { claims } = await mint(A);
    expect(claims.video).toMatchObject({ roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true, canPublishSources: ["microphone"] });
    for (const power of ["roomAdmin", "roomCreate", "roomList", "roomRecord", "ingressAdmin", "canUpdateOwnMetadata", "hidden", "recorder", "agent"] as const) {
      expect(claims.video?.[power] ?? false).toBe(false);
    }
    expect(claims.sip).toBeUndefined();
  });

  it("is short-lived", async () => {
    const { claims, ticket } = await mint(A);
    expect((claims.exp ?? 0) - (claims.nbf ?? claims.iat ?? 0)).toBeLessThanOrEqual(VOICE_TOKEN_TTL_SECONDS);
    expect(ticket.expiresAt).toBe(new Date(Date.UTC(2026, 10, 1, 16) + VOICE_TOKEN_TTL_SECONDS * 1000).toISOString());
  });

  it("names its family on attributes the holder cannot change, and sends Maya's worker with the call id", async () => {
    const { claims } = await mint(A);
    expect(claims.attributes).toEqual({ [ATTR.call]: A.id, [ATTR.parent]: A.parentId, [ATTR.child]: A.childId });
    const config = claims.roomConfig as unknown as { agents?: { agentName?: string; metadata?: string }[] } | undefined;
    expect(config?.agents).toHaveLength(1);
    expect(config?.agents?.[0].agentName).toBe(VOICE_AGENT_NAME);
    expect(JSON.parse(config?.agents?.[0].metadata ?? "{}")).toEqual({ callId: A.id });
  });

  it("cannot be minted for another family's call, a text call or an ended call", async () => {
    await expect(mintVoiceToken({ call: { ...B, kind: "admin_test" }, notice: null, parentId: A.parentId, childId: A.childId, project })).resolves.toEqual({ ok: false, error: "wrong_family" });
    await expect(mintVoiceToken({ call: { ...B, kind: "admin_test" }, notice: null, parentId: B.parentId, childId: A.childId, project })).resolves.toEqual({ ok: false, error: "wrong_family" });
    await expect(mintVoiceToken({ call: { ...A, kind: "admin_test", mode: "text" }, notice: null, parentId: A.parentId, childId: A.childId, project })).resolves.toEqual({ ok: false, error: "not_voice" });
    await expect(mintVoiceToken({ call: { ...A, kind: "admin_test", status: "ended" }, notice: null, parentId: A.parentId, childId: A.childId, project })).resolves.toEqual({ ok: false, error: "ended" });
  });

  it("does not get its holder heard in another family's call: the worker refuses it there", async () => {
    const { claims } = await mint(A);
    const attributes = claims.attributes ?? {};
    // Even in B's room (which the token does not admit), B's worker would not listen to A's child.
    expect(checkJoiner({ room: voiceRoom(B.id), call: B, identity: claims.sub ?? "", attributes })).toMatchObject({ ok: false });
    expect(checkJoiner({ room: voiceRoom(A2.id), call: A2, identity: claims.sub ?? "", attributes })).toEqual({ ok: false, reason: "wrong_family" });
    expect(checkJoiner({ room: voiceRoom(A.id), call: A, identity: claims.sub ?? "", attributes })).toEqual({ ok: true });
  });

  it("is refused when signed with another secret", async () => {
    const { ticket } = await mint(A);
    await expect(new TokenVerifier(project.apiKey, `${project.apiSecret}-other`).verify(ticket.token)).rejects.toThrow();
  });
});

// #529: no token for a family that has not agreed to the Maya notice. An admin test call has no parent to agree.
describe("a voice call token and the Maya notice", () => {
  const facts = { call: { ...A, kind: "family" }, parentId: A.parentId, childId: A.childId, project, name: "Leah" };
  const asks = (accepted: boolean) => vi.fn(async () => accepted);

  it("refuses a family call without an agreement", async () => {
    const notice = { accepted: asks(false) };
    expect(await mintVoiceToken({ ...facts, notice })).toEqual({ ok: false, error: "notice_required" });
    expect(notice.accepted).toHaveBeenCalledWith(A.parentId);
  });

  it("mints a token for a family call with an agreement", async () => {
    const r = await mintVoiceToken({ ...facts, notice: { accepted: asks(true) } });
    expect(r.ok).toBe(true);
  });

  it("refuses a family call when the notice cannot be checked", async () => {
    expect(await mintVoiceToken({ ...facts, notice: null })).toEqual({ ok: false, error: "notice_required" });
    await expect(mintVoiceToken({ ...facts, notice: { accepted: async () => { throw new Error("down"); } } })).rejects.toThrow("down");
  });

  it("does not ask for an admin test call, so admin demos keep working", async () => {
    const notice = { accepted: asks(false) };
    const r = await mintVoiceToken({ ...facts, call: { ...A, kind: "admin_test" }, notice });
    expect(r.ok).toBe(true);
    expect(notice.accepted).not.toHaveBeenCalled();
  });
});

describe("the early dispatch of Maya's worker", () => {
  const base = { call: { ...A, kind: "admin_test" }, notice: null, parentId: A.parentId, childId: A.childId, project, now: Date.UTC(2026, 10, 1, 16) };

  it("sends the worker to the call's room with the call id when the ticket is made", async () => {
    const sent: [string, string][] = [];
    const r = await mintVoiceToken({ ...base, dispatch: async (room, metadata) => { sent.push([room, metadata]); } });
    expect(r.ok).toBe(true);
    expect(sent).toEqual([[voiceRoom(A.id), JSON.stringify({ callId: A.id })]]);
  });

  it("still gives the ticket when the dispatch fails, and the token keeps its own dispatch", async () => {
    const r = await mintVoiceToken({ ...base, dispatch: async () => { throw new Error("down"); } });
    if (!r.ok) throw new Error(r.error);
    const claims = await verifier.verify(r.ticket.token);
    expect(claims.roomConfig?.agents?.[0]?.agentName).toBe("maya-voice");
  });

  it("sends no worker for a refused ticket", async () => {
    let sent = 0;
    const r = await mintVoiceToken({ ...base, parentId: B.parentId, dispatch: async () => { sent++; } });
    expect(r.ok).toBe(false);
    expect(sent).toBe(0);
  });
});
