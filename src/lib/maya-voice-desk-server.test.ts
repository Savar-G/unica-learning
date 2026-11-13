import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { TokenVerifier } from "livekit-server-sdk";
import type { Database } from "@/lib/database";
import { familyZone, localDateTime } from "@/lib/family-time";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { memoryWordingHistoryStore } from "@/lib/maya";
import { mayaCalls } from "@/lib/maya-call";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import { ruleMayaModel } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { voiceRoom } from "@/lib/maya-voice";
import type { QuestionPackage } from "@/lib/question-package";
import type { ChatContext } from "@/lib/maya-chat-server";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ statuses: [] as string[], customers: [] as string[], db: null as unknown }));
vi.mock("@/lib/stripe", () => ({ stripe: () => ({ subscriptions: { list: ({ customer }: { customer: string }) => (async function* () {
  state.customers.push(customer);
  for (const status of state.statuses) yield { status, customer };
})() } }) }));
vi.mock("@/lib/supabase-auth", async (original) => ({ ...(await original<typeof import("@/lib/supabase-auth")>()), adminClient: () => state.db }));
const { deskVoice, readVoiceUsedSeconds, runVoice, voiceGate } = await import("@/lib/maya-voice-desk-server");

const LIVEKIT = { LIVEKIT_URL: "wss://unica-test.livekit.cloud", LIVEKIT_API_KEY: "APItest", LIVEKIT_API_SECRET: "a-test-secret-that-is-long-enough-for-hs256-0123456789" };
const PROJECT = { url: LIVEKIT.LIVEKIT_URL, apiKey: LIVEKIT.LIVEKIT_API_KEY, apiSecret: LIVEKIT.LIVEKIT_API_SECRET };

type Row = Record<string, unknown>;
/** PostgREST in memory: eq, gte and lt filters, one object for maybeSingle, and a failure for a table named in `broken`. */
const planRow = (child_id: string, kind: string) => ({ parent_id: "parent", child_id, kind, next_charge_at: kind === "free_month" ? "2099-01-01T00:00:00Z" : null, ends_at: null, monthly_cents: 7999, ending_free: false });
function fakeDb({ test = false, listed = false, broken = "", plans = [] as Row[], calls = [] as Row[] } = {}) {
  const requests: URL[] = [];
  const tables: Record<string, Row[]> = { child_plan_states: plans, test_accounts: test ? [{ parent_id: "parent" }] : [], maya_chat_families: listed ? [{ parent_id: "parent", rehearsal: false }] : [], maya_calls: calls };
  const db = createClient<Database>("https://test.invalid", "test", { global: { fetch: async (input, init) => {
    const url = new URL(String(input));
    requests.push(url);
    const table = url.pathname.split("/").pop()!;
    if (table === broken) return Response.json({ message: "read failed" }, { status: 500 });
    if (table === "family_retention_cards") return Response.json([{ customer: "cus_family", saved: true }]);
    if (!(table in tables)) throw Error(url.pathname);
    let rows = tables[table];
    for (const [key, raw] of url.searchParams) {
      if (raw.startsWith("eq.")) rows = rows.filter((r) => String(r[key]) === raw.slice(3));
      if (raw.startsWith("gte.")) rows = rows.filter((r) => String(r[key]) >= raw.slice(4));
      if (raw.startsWith("lt.")) rows = rows.filter((r) => String(r[key]) < raw.slice(3));
      if (key === "or" && raw === "(status.eq.live,connected_seconds.gt.0)") rows = rows.filter((r) => r.status === "live" || Number(r.connected_seconds) > 0);
    }
    const total = rows.length;
    const limit = url.searchParams.get("limit");
    if (limit) rows = rows.slice(0, Number(limit));
    const counted = new Headers(init?.headers).get("prefer")?.includes("count=exact");
    if (table === "maya_calls") return Response.json(rows, counted ? { headers: { "content-range": `0-${Math.max(0, rows.length - 1)}/${total}` } } : undefined);
    if (table === "child_plan_states") return Response.json(rows);
    return Response.json(rows[0] ?? null);
  } } });
  return Object.assign(db, { requests });
}
afterEach(() => { vi.unstubAllEnvs(); state.statuses = []; state.customers = []; state.db = null; });

describe("the voice gate", () => {
  const open = { ...LIVEKIT, MAYA_VOICE_ENABLED: "on" };
  const plans = [planRow("child", "paying")];

  it("is closed when LiveKit is not set up, for every family, before anything is read", async () => {
    const db = fakeDb({ test: true });
    expect(await voiceGate(db, "parent", 5, "child", { MAYA_VOICE_ENABLED: "on" })).toBe("closed");
    expect(await voiceGate(db, "parent", 5, "child", { ...LIVEKIT, LIVEKIT_API_SECRET: "" })).toBe("closed");
    expect(db.requests).toEqual([]);
  });

  it("refuses Grade 2 for a test family and for a family with an open plan, as chat does", async () => {
    expect(await voiceGate(fakeDb({ test: true }), "parent", 2, "child", LIVEKIT)).toBe("too_young");
    expect(await voiceGate(fakeDb({ plans }), "parent", 2, "child", open)).toBe("too_young");
    expect(await voiceGate(fakeDb({ test: true }), "parent", null, "child", LIVEKIT)).toBe("too_young");
    expect(await voiceGate(fakeDb({ test: true }), "parent", 3, "child", LIVEKIT)).toBe("open");
  });

  it("is open to a test family with the voice switch off, and with chat switched off", async () => {
    expect(await voiceGate(fakeDb({ test: true }), "parent", 4, "child", LIVEKIT)).toBe("open");
    vi.stubEnv("MAYA_CHAT_ENABLED", "off");
    expect(await voiceGate(fakeDb({ test: true }), "parent", 4, "child", { ...LIVEKIT, MAYA_VOICE_ENABLED: "off" })).toBe("open");
  });

  it.each([undefined, "", "off", "ON", "true", "1", " on"])("keeps another family closed with the switch at %j, before the plan is read", async (value) => {
    const db = fakeDb({ plans });
    expect(await voiceGate(db, "parent", 4, "child", { ...LIVEKIT, MAYA_VOICE_ENABLED: value })).toBe("closed");
    expect(db.requests.map((r) => r.pathname.split("/").pop())).toEqual(["test_accounts"]);
    expect(state.customers).toEqual([]);
  });

  it("opens another family only with the exact switch and chat open to the child (its plan gate)", async () => {
    expect(await voiceGate(fakeDb({ plans }), "parent", 4, "child", open)).toBe("open");
    // A plan child of another id, a stopped plan and no plan at all stay closed.
    expect(await voiceGate(fakeDb({ plans }), "parent", 4, "sibling", open)).toBe("closed");
    expect(await voiceGate(fakeDb({ plans: [planRow("child", "ended")] }), "parent", 4, "child", open)).toBe("closed");
    expect(await voiceGate(fakeDb(), "parent", 4, "child", open)).toBe("closed");
  });

  it("is stopped for another family by MAYA_CHAT_ENABLED=off, even with the voice switch on", async () => {
    vi.stubEnv("MAYA_CHAT_ENABLED", "off");
    expect(await voiceGate(fakeDb({ plans }), "parent", 4, "child", open)).toBe("closed");
    expect(await voiceGate(fakeDb({ plans, listed: true }), "parent", 4, "child", open)).toBe("closed");
  });

  it("opens a listed family with a running plan when both switches are on, and fails closed when a read fails", async () => {
    vi.stubEnv("MAYA_CHAT_ENABLED", "on"); state.statuses = ["active"];
    expect(await voiceGate(fakeDb({ listed: true }), "parent", 4, "child", open)).toBe("open");
    await expect(voiceGate(fakeDb({ broken: "test_accounts" }), "parent", 4, "child", open)).rejects.toThrow();
    state.statuses = ["canceled"];
    expect(await voiceGate(fakeDb({ listed: true }), "parent", 4, "child", open)).toBe("closed");
  });
});

describe("the voice week read", () => {
  const zone = familyZone({ timeZone: "America/Vancouver", postal: null, province: "BC" });
  const now = Date.UTC(2026, 10, 11, 20);
  const monday = new Date(localDateTime("2026-11-09", zone)).toISOString();
  const call = (created_at: string, over: Row = {}) => ({ parent_id: "parent", child_id: "child", kind: "family", created_at, status: "ended", connected_seconds: 100, end_at_ms: null, ...over });

  it("reads this child's family calls of this family week, and sums them", async () => {
    const db = fakeDb({ calls: [
      call(new Date(Date.parse(monday) + 1000).toISOString(), { connected_seconds: 300 }),
      call(new Date(now).toISOString(), { status: "live", connected_seconds: null, end_at_ms: 150_000 }),
      call(new Date(Date.parse(monday) - 1000).toISOString(), { connected_seconds: 999 }),
      call(new Date(now).toISOString(), { child_id: "sibling", connected_seconds: 999 }),
      call(new Date(now).toISOString(), { kind: "chat", connected_seconds: 999 }),
      call(new Date(now).toISOString(), { parent_id: "other", connected_seconds: 999 }),
    ] });
    expect(await readVoiceUsedSeconds(db, "parent", "child", zone, now)).toBe(450);
    const asked = db.requests.find((r) => r.pathname.endsWith("maya_calls"))!;
    expect(asked.searchParams.get("kind")).toBe("eq.family");
    expect(asked.searchParams.get("select")).toContain("live->text->session->limits->endAtMs");
  });

  it("leaves out cancelled attempts, so 1000 of them cannot hide the week's real time (#904 fourth review)", async () => {
    const at = new Date(now).toISOString();
    const zeros = Array.from({ length: 1000 }, () => call(at, { connected_seconds: 0 }));
    const db = fakeDb({ calls: [...zeros, call(at, { connected_seconds: 1680 })] });
    expect(await readVoiceUsedSeconds(db, "parent", "child", zone, now)).toBe(1680);
  });

  it("throws when the week has more counting calls than one read holds", async () => {
    const at = new Date(now).toISOString();
    const db = fakeDb({ calls: Array.from({ length: 2001 }, () => call(at, { connected_seconds: 1 })) });
    await expect(readVoiceUsedSeconds(db, "parent", "child", zone, now)).rejects.toThrow(/more calls than one read holds/);
  });

  it("throws when the calls cannot be read, so a caller never treats an unread week as unused", async () => {
    await expect(readVoiceUsedSeconds(fakeDb({ broken: "maya_calls" }), "parent", "child", zone, now)).rejects.toThrow();
  });

  it("gives the desk the usage, or null when voice is closed or cannot be read (never throws)", async () => {
    vi.stubEnv("LIVEKIT_URL", LIVEKIT.LIVEKIT_URL); vi.stubEnv("LIVEKIT_API_KEY", LIVEKIT.LIVEKIT_API_KEY); vi.stubEnv("LIVEKIT_API_SECRET", LIVEKIT.LIVEKIT_API_SECRET);
    const child = { id: "child", grade: 4 };
    state.db = fakeDb({ test: true, calls: [call(new Date(now).toISOString(), { connected_seconds: 420 })] });
    expect(await deskVoice({} as never, "parent", child, zone, now)).toMatchObject({ usage: { usedSeconds: 420, leftSeconds: 1380, limitSeconds: 600 } });
    expect(await deskVoice({} as never, "parent", { id: "child", grade: 2 }, zone, now)).toBeNull();
    state.db = fakeDb({ test: true, broken: "maya_calls" });
    expect(await deskVoice({} as never, "parent", child, zone, now)).toBeNull();
    state.db = fakeDb({ broken: "test_accounts" });
    expect(await deskVoice({} as never, "parent", child, zone, now)).toBeNull();
    state.db = fakeDb();
    expect(await deskVoice({} as never, "parent", child, zone, now)).toBeNull();
    state.db = null;
    expect(await deskVoice({} as never, "parent", child, zone, now)).toBeNull();
  });
});

// ---------- one desk voice request, on the call module's in-memory seams ----------

const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const BOOK = "44444444-4444-4444-8444-444444444444";
const REF = { source: "workbook" as const, workbookId: BOOK, page: 1, question: 1 };
const PKG: QuestionPackage = { ...SAMPLE_PACKAGES["add-27-39"], ref: REF };
const zone = familyZone({ timeZone: "America/Vancouver", postal: null, province: "BC" });
const verifier = new TokenVerifier(PROJECT.apiKey, PROJECT.apiSecret);
const ctx = (over: Partial<ChatContext> = {}): ChatContext => ({ db: {} as never, parent: PARENT, child: CHILD, name: "Leah", grade: 4, zone, ...over });

function setup(over: { used?: number; accepted?: boolean; project?: typeof PROJECT | null; canCall?: boolean; book?: Record<string, unknown> | null; found?: boolean; testFamilies?: string[]; note?: () => Promise<"done" | "pending"> } = {}) {
  let n = 0;
  const now = Date.parse("2026-11-11T20:00:00Z");
  const store = memoryCallStore({ testFamilies: over.testFamilies ?? [] });
  const eventStore = memoryLearningEventStore({ children: [{ id: CHILD, parentId: PARENT }] });
  const alerts = { send: vi.fn(async () => {}), list: async () => [] };
  const base = {
    store, history: memoryWordingHistoryStore(), events: learningEvents(eventStore), rebuild: async () => true,
    connections: memoryConnectionLog(store, () => now),
    model: () => ruleMayaModel(), isTestFamily: async () => false, alerts,
    clock: () => now, newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, seed: () => 42,
    ...(over.note ? { note: over.note } : {}),
  };
  const calls = mayaCalls({ ...base, canCallVoice: async (p, c) => over.canCall !== false && p === PARENT && c === CHILD });
  const used = { seconds: over.used ?? 0 };
  const accepted = { value: over.accepted !== false };
  const deps = {
    calls, store,
    books: {
      workbook: async () => (over.book === undefined ? { childId: CHILD, parentId: PARENT, status: "shipped" } : over.book) as never,
      question: async () => (over.found === false ? { status: "not-found" as const } : { status: "found" as const, package: PKG }),
    },
    notice: { accepted: async () => accepted.value },
    project: over.project === undefined ? PROJECT : over.project,
    usedSeconds: async () => used.seconds,
    now: () => now,
  };
  /** The child's learning events of the whole call day: a cancelled call must write none. */
  const events = () => eventStore.range(CHILD, { from: "2026-11-01T00:00:00Z", to: "2026-12-01T00:00:00Z" });
  return { deps, store, calls, used, accepted, alerts, events, run: (action: Parameters<typeof runVoice>[1], c = ctx()) => runVoice(c, action, deps) };
}
const ID = "55555555-5555-4555-8555-555555555555";
const start = (id = ID, question = REF) => ({ type: "start" as const, id, question });

describe("a desk voice request", () => {
  it("starts a call for this child, with a ticket for that room and that child only", async () => {
    const s = setup();
    const r = await s.run(start());
    expect(r.error).toBeUndefined();
    expect(r.call).toMatchObject({ id: ID, mode: "voice", status: "live", started: false, ended: false, transcript: [], batches: [] });
    const row = s.store.rows()[0];
    expect(row).toMatchObject({ id: ID, kind: "family", mode: "voice", parentId: PARENT, childId: CHILD, startedBy: PARENT, status: "live" });
    expect(row.live!.text.session.limits).toBeUndefined();
    expect(row.live!.text.session.freeTalk).toBe(false);
    expect(r.ticket).toMatchObject({ url: PROJECT.url, room: voiceRoom(ID), identity: `child-${CHILD}` });
    const claims = await verifier.verify(r.ticket!.token);
    expect(claims.video).toMatchObject({ room: voiceRoom(ID), roomJoin: true });
    expect(claims.attributes).toMatchObject({ "maya.call": ID, "maya.parent": PARENT, "maya.child": CHILD });
    expect(r.usage).toMatchObject({ usedSeconds: 0, leftSeconds: 1800, limitSeconds: 600 });
    // Nothing of the model, the saved session or the family is in what the child's screen gets.
    expect(Object.keys(r.call!).sort()).toEqual(["batches", "ended", "hint", "id", "mode", "revision", "safetyMessage", "started", "status", "transcript"]);
  });

  it("needs the parent's agreement to the Maya notice, and makes no call without it", async () => {
    const s = setup({ accepted: false });
    expect(await s.run(start())).toMatchObject({ call: null, error: "notice_required" });
    expect(s.store.rows()).toHaveLength(0);
  });

  it("needs a shipped workbook of this child, and a question that is found", async () => {
    for (const book of [null, { childId: "someone-else", parentId: PARENT, status: "shipped" }, { childId: CHILD, parentId: "another-family", status: "shipped" }, { childId: CHILD, parentId: PARENT, status: "draft" }]) {
      const s = setup({ book });
      expect(await s.run(start())).toMatchObject({ call: null, error: "not_found" });
      expect(s.store.rows()).toHaveLength(0);
    }
    const s = setup({ found: false });
    expect(await s.run(start())).toMatchObject({ call: null, error: "invalid_question" });
    expect(s.store.rows()).toHaveLength(0);
  });

  it("is refused when the server's authorization says no, and stores nothing", async () => {
    const s = setup({ canCall: false });
    expect(await s.run(start())).toMatchObject({ call: null, error: "unavailable" });
    expect(s.store.rows()).toHaveLength(0);
  });

  it("refuses a new call when less than a minute of the week is left, and shortens a call to the time left", async () => {
    const used = setup({ used: 1741 });
    expect(await used.run(start())).toMatchObject({ call: null, error: "voice_week_used", usage: { leftSeconds: 59 } });
    expect(used.store.rows()).toHaveLength(0);
    const edge = setup({ used: 1740 });
    expect((await edge.run(start())).error).toBeUndefined();
    expect(edge.store.rows()[0].live!.text.session.limits).toEqual({ closingAtMs: 0, endAtMs: 60_000 });
    const part = setup({ used: 1500 });
    const r = await part.run(start());
    expect(r.usage).toMatchObject({ leftSeconds: 300, limitSeconds: 300 });
    expect(part.store.rows()[0].live!.text.session.limits).toEqual({ closingAtMs: 240_000, endAtMs: 300_000 });
    const plenty = setup({ used: 1200 });
    await plenty.run(start());
    expect(plenty.store.rows()[0].live!.text.session.limits).toBeUndefined();
  });

  it("runs one call at a time: two starts at once with different ids cannot both spend the week's last minute (review P1)", async () => {
    const s = setup({ used: 1740 });
    const [a, b] = await Promise.all([s.run(start()), s.run(start("66666666-6666-4666-8666-666666666666"))]);
    const tickets = [a, b].filter((r) => r.ticket);
    expect(tickets).toHaveLength(1);
    expect([a, b].find((r) => !r.ticket)).toMatchObject({ call: null, error: "busy" });
    expect(s.store.rows().filter((r) => r.status === "live")).toHaveLength(1);
  });

  it("ends a call that read the week before another call ended, when the week is now over (review R904-1)", async () => {
    // B read 1680 s used (120 s left), waited, and inserted after a 10 s call ended: the week is now 1690 + 120 = 1810 s.
    const late = setup({ used: 1680 });
    const reads = [1680, 1810];
    late.deps.usedSeconds = async () => reads.shift() ?? 1810;
    const r = await late.run(start());
    expect(r).toMatchObject({ error: "busy", call: { status: "ended" } });
    expect(r.ticket).toBeUndefined();
    expect(late.store.rows().filter((row) => row.status === "live")).toHaveLength(0);
    // The same start with no call in between: 1680 + 120 = 1800 s, exactly the week, so it starts.
    const ontime = setup({ used: 1680 });
    const reads2 = [1680, 1800];
    ontime.deps.usedSeconds = async () => reads2.shift() ?? 1800;
    expect((await ontime.run(start())).ticket).toBeTruthy();
  });

  it("checks the week before every ticket: a token or a repeated start over the week gets none (R904-1, third review)", async () => {
    const note = vi.fn(async () => "done" as const);
    const s = setup({ used: 1680, note });
    expect((await s.run(start())).ticket).toBeTruthy();
    // Another call ended while this start waited: the week is now over with this call counted at its limit.
    s.used.seconds = 1810;
    expect(await s.run({ type: "token", id: ID })).toMatchObject({ error: "busy", call: { status: "ended" } });
    expect(await s.run(start())).toMatchObject({ call: { status: "ended" } });
    expect((await s.run(start())).ticket).toBeUndefined();
    // A call Maya never joined writes no parent note (third review, P2).
    expect(note).not.toHaveBeenCalled();
    expect(s.store.rows()[0]).toMatchObject({ status: "ended", learningEventId: null, notePending: null });
  });

  it("keeps a joined call running when its reconnect cannot be checked, and gives no ticket", async () => {
    const s = setup();
    await s.run(start());
    const row = s.store.rows()[0];
    expect(await s.store.update(row.id, row.revision, { startedAt: new Date(Date.parse("2026-11-11T20:00:00Z")).toISOString() })).toBeTruthy();
    s.deps.usedSeconds = async () => { throw Error("down"); };
    const r = await s.run({ type: "token", id: ID });
    expect(r).toMatchObject({ error: "unavailable" });
    expect(r.ticket).toBeUndefined();
    expect(s.store.rows()[0].status).toBe("live");
  });

  it("ends a new call when the week cannot be read after its insert", async () => {
    const s = setup({ used: 100 });
    const reads: Array<number | Error> = [100, Error("down")];
    s.deps.usedSeconds = async () => { const v = reads.shift() ?? 100; if (v instanceof Error) throw v; return v; };
    const r = await s.run(start());
    expect(r).toMatchObject({ error: "unavailable", call: { status: "ended" } });
    expect(r.ticket).toBeUndefined();
  });

  it("starts the same call again as that call, with a fresh ticket, and refuses another question for it", async () => {
    const s = setup();
    const first = await s.run(start());
    const again = await s.run(start());
    expect(s.store.rows()).toHaveLength(1);
    expect(again.call).toEqual(first.call);
    expect(again.ticket?.token).toBeTruthy();
    expect(await s.run(start(ID, { ...REF, page: 2 }))).toMatchObject({ call: null, error: "conflict" });
    // A second tab that starts at once: the insert of the same id fails once, and that call is the answer.
    const racing = setup();
    const real = racing.deps.calls.startVoice;
    racing.deps.calls = { ...racing.deps.calls, startVoice: async (input) => { await real(input); throw Error("duplicate key"); } };
    const r = await racing.run(start());
    expect(r.error).toBeUndefined();
    expect(r.ticket?.room).toBe(voiceRoom(ID));
    expect(racing.store.rows()).toHaveLength(1);
  });

  it("ends a call it cannot give a ticket for, so no live call is left behind", async () => {
    const s = setup({ project: null });
    expect(await s.run(start())).toMatchObject({ error: "unavailable", call: { status: "ended" } });
    expect(s.store.rows()[0]).toMatchObject({ status: "ended", learningEventId: null });
  });

  describe("calls that are not this child's", () => {
    async function foreign(over: Record<string, unknown>) {
      const s = setup();
      await s.run(start());
      const row = s.store.rows()[0];
      s.store.rows().length = 0;
      const other = setup({ testFamilies: [PARENT, "99999999-9999-4999-8999-999999999999"] });
      await other.store.insert({ ...structuredClone(row), ...over } as never);
      return other;
    }
    it.each([
      ["another family's call", { parentId: "99999999-9999-4999-8999-999999999999" }],
      ["a sibling's call", { childId: "88888888-8888-4888-8888-888888888888" }],
      ["a chat call", { kind: "chat", mode: "text" }],
      ["a test call", { kind: "admin_test" }],
    ])("answers not_found for %s on every action, with no call and no ticket", async (_name, over) => {
      const s = await foreign(over);
      for (const type of ["start", "token", "read", "cancel"] as const) {
        const r = await s.run(type === "start" ? start() : { type, id: ID });
        expect(r).toMatchObject({ call: null, error: "not_found" });
        expect(r.ticket).toBeUndefined();
      }
      expect(s.store.rows()[0].status).toBe("live");
    });

    it("answers not_found for no call at all, as it does for another family's", async () => {
      const s = setup();
      for (const type of ["token", "read", "cancel"] as const) expect(await s.run({ type, id: ID })).toMatchObject({ call: null, error: "not_found" });
    });
  });

  it("gives a fresh ticket for the child's own live call, and none for an ended one", async () => {
    const s = setup();
    await s.run(start());
    const t = await s.run({ type: "token", id: ID });
    expect(t.error).toBeUndefined();
    expect(t.ticket?.room).toBe(voiceRoom(ID));
    expect((await verifier.verify(t.ticket!.token)).sub).toBe(`child-${CHILD}`);
    s.accepted.value = false;
    expect(await s.run({ type: "token", id: ID })).toMatchObject({ error: "notice_required" });
    s.accepted.value = true;
    await s.run({ type: "cancel", id: ID });
    expect(await s.run({ type: "token", id: ID })).toMatchObject({ error: "ended", call: { status: "ended" } });
  });

  it("reads the call's child-safe view without a ticket", async () => {
    const s = setup();
    await s.run(start());
    const r = await s.run({ type: "read", id: ID });
    expect(r.call).toMatchObject({ id: ID, status: "live", started: false });
    expect(r.ticket).toBeUndefined();
  });

  it("cancels a call Maya has not joined, once, with no learning event", async () => {
    const s = setup();
    await s.run(start());
    const r = await s.run({ type: "cancel", id: ID });
    expect(r.error).toBeUndefined();
    expect(r.call).toMatchObject({ status: "ended", ended: true });
    expect(s.store.rows()[0]).toMatchObject({ status: "ended", learningEventId: null });
    expect(await s.run({ type: "cancel", id: ID })).toMatchObject({ call: { status: "ended" } });
  });

  it("does not cancel a call Maya has joined", async () => {
    const s = setup();
    await s.run(start());
    const row = s.store.rows()[0];
    await s.store.update(ID, row.revision, { startedAt: "2026-11-11T20:00:05.000Z" });
    const r = await s.run({ type: "cancel", id: ID });
    expect(r).toMatchObject({ error: "already_started", call: { status: "live", started: true } });
    expect(s.store.rows()[0].status).toBe("live");
  });

  describe("a call made for the microphone check and cancelled before the tap (docs/maya-voice.md)", () => {
    const NEXT = "66666666-6666-4666-8666-666666666666";
    const PROVIDERS = { speechToText: "fake-stt", voice: "fake-voice" };
    /** What a cancelled call must not leave: minutes, an event, a note, an alert, a start. */
    async function nothingCounted(s: ReturnType<typeof setup>, note: ReturnType<typeof vi.fn>, id = ID) {
      const row = s.store.rows().find((r) => r.id === id)!;
      // The session's finish stamps a start time on the ended row, so `startedAt` is not the mark; the connected time is.
      expect(row).toMatchObject({ status: "ended", connectedSeconds: 0, learningEventId: null, notePending: null, live: null, profileRebuiltAt: null });
      expect(await s.events()).toEqual([]);
      expect(note).not.toHaveBeenCalled();
      expect(s.alerts.send).not.toHaveBeenCalled();
    }

    it("counts nothing, and frees the child's one live call at once: a new start right after gets a new call and ticket", async () => {
      const note = vi.fn(async () => "done" as const);
      const s = setup({ note });
      expect((await s.run(start())).ticket).toBeTruthy();
      // While the first call is live, a second one is refused: the one-live-call rule the cancel must free.
      expect(await s.run(start(NEXT))).toMatchObject({ call: null, error: "busy" });
      const cancelled = await s.run({ type: "cancel", id: ID });
      expect(cancelled).toMatchObject({ call: { status: "ended", ended: true } });
      expect(cancelled.error).toBeUndefined();
      // The week is whole again: the cancelled call has no connected time.
      expect(cancelled.usage).toMatchObject({ usedSeconds: 0, leftSeconds: 1800 });
      await nothingCounted(s, note);

      const again = await s.run(start(NEXT));
      expect(again.error).toBeUndefined();
      expect(again.call).toMatchObject({ id: NEXT, status: "live", started: false });
      expect(again.ticket?.room).toBe(voiceRoom(NEXT));
      expect(s.store.rows().filter((r) => r.status === "live").map((r) => r.id)).toEqual([NEXT]);
    });

    it("ends with no trace when Maya's worker opened the call before the child's microphone, and a new start works", async () => {
      const note = vi.fn(async () => "done" as const);
      const s = setup({ note });
      await s.run(start());
      const before = s.store.rows()[0].revision;
      // The worker opens the call as soon as the room is made (main.ts): the providers are set and the revision rises,
      // but the call has not started.
      const opened = await s.calls.openVoice(ID, PROVIDERS, null);
      expect(opened.ok).toBe(true);
      expect(s.store.rows()[0]).toMatchObject({ speechToText: "fake-stt", voice: "fake-voice", startedAt: null });
      expect(s.store.rows()[0].revision).toBeGreaterThan(before);

      const cancelled = await s.run({ type: "cancel", id: ID });
      expect(cancelled.error).toBeUndefined();
      expect(cancelled.call).toMatchObject({ status: "ended", ended: true });
      await nothingCounted(s, note);
      expect((await s.run(start(NEXT))).ticket?.room).toBe(voiceRoom(NEXT));
    });

    it("retries the cancel when the worker opens the call between the desk's read and its end", async () => {
      const note = vi.fn(async () => "done" as const);
      const s = setup({ note });
      await s.run(start());
      const real = s.deps.calls.input;
      let first = true;
      s.deps.calls = { ...s.deps.calls, input: async (id, revision, input, name) => {
        if (first) {
          first = false;
          expect((await s.calls.openVoice(id, PROVIDERS, null)).ok).toBe(true);
        }
        return real(id, revision, input, name);
      } };
      const cancelled = await s.run({ type: "cancel", id: ID });
      expect(cancelled.error).toBeUndefined();
      expect(cancelled.call).toMatchObject({ status: "ended" });
      await nothingCounted(s, note);
      expect((await s.run(start(NEXT))).ticket).toBeTruthy();
    });
  });

  it("reads the call again when Maya joins between the read and the end, and then refuses the cancel", async () => {
    const s = setup();
    await s.run(start());
    const real = s.deps.calls.input;
    let first = true;
    s.deps.calls = { ...s.deps.calls, input: async (id, revision, input, name) => {
      if (first) { first = false; await s.store.update(id, revision, { startedAt: "2026-11-11T20:00:05.000Z" }); }
      return real(id, revision, input, name);
    } };
    expect(await s.run({ type: "cancel", id: ID })).toMatchObject({ error: "already_started", call: { status: "live" } });
  });
});
