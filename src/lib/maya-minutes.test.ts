import { describe, expect, it } from "vitest";
import { createSession, step, TIME_LIMITS, type Session } from "@/lib/maya";
import { connectedSeconds } from "@/lib/maya-voice";
import { checkQuestionPackage, workedSteps, type QuestionPackage } from "@/lib/question-package";
import {
  createMinutesLedger,
  dayOf,
  familyTimeZone,
  usageMinutes,
  validTimeZone,
  weekOf,
  CALL_SECONDS,
  GRANT_CALL_WAIT_MS,
  WEEK_SECONDS,
} from "@/lib/maya-minutes";
import { memoryMinutesStore } from "@/lib/maya-minutes-memory";

const MIN = 60_000;
const P = "11111111-1111-4111-8111-111111111111";
const C = "22222222-2222-4222-8222-222222222222";
const C2 = "33333333-3333-4333-8333-333333333333";
const call = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function setup(start: string) {
  let now = Date.parse(start);
  const clock = () => now;
  const store = memoryMinutesStore({ clock });
  const ledger = createMinutesLedger({ store, clock });
  return { store, ledger, at: (iso: string) => { now = Date.parse(iso); }, advance: (ms: number) => { now += ms; } };
}

/** A child's call that is granted, made and ends with these connected seconds. */
async function talk(t: ReturnType<typeof setup>, id: string, connected: number, timeZone = "America/Vancouver", childId = C) {
  const g = await t.ledger.grantChild({ callId: id, parentId: P, childId, timeZone });
  if (g.ok) {
    t.store.callMade(id);
    t.store.callEnded(id, Math.min(connected, g.seconds));
  }
  return g;
}

describe("weeks start on Monday in the family's time zone", () => {
  it("gives the local Monday and the next Monday's midnight", () => {
    // Sunday 2026-11-08 23:30 in Vancouver is Monday 07:30 UTC.
    const at = Date.parse("2026-11-09T07:30:00Z");
    expect(weekOf(at, "America/Vancouver")).toEqual({ start: "2026-11-02", resetsAt: Date.parse("2026-11-09T08:00:00Z") });
    expect(weekOf(at, "America/Toronto")).toEqual({ start: "2026-11-09", resetsAt: Date.parse("2026-11-16T05:00:00Z") });
    // A Monday at 00:00 local is the new week; a second before is the old one.
    expect(weekOf(Date.parse("2026-11-09T08:00:00Z"), "America/Vancouver").start).toBe("2026-11-09");
    expect(weekOf(Date.parse("2026-11-09T07:59:59Z"), "America/Vancouver").start).toBe("2026-11-02");
    // Half-hour zone.
    expect(weekOf(Date.parse("2026-11-09T03:29:59Z"), "America/St_Johns").start).toBe("2026-11-02");
    expect(weekOf(Date.parse("2026-11-09T03:30:00Z"), "America/St_Johns").start).toBe("2026-11-09");
  });

  it("keeps the reset at local midnight across a clock change", () => {
    // Clocks went back on Sunday 2026-11-01 in Vancouver: the week of 2026-10-26 ends at 2026-11-02 00:00 PST.
    expect(weekOf(Date.parse("2026-10-31T12:00:00Z"), "America/Vancouver")).toEqual({ start: "2026-10-26", resetsAt: Date.parse("2026-11-02T08:00:00Z") });
    // Clocks go forward on 2027-03-14: the week of 2027-03-08 ends at 2027-03-15 00:00 PDT.
    expect(weekOf(Date.parse("2027-03-10T12:00:00Z"), "America/Vancouver").resetsAt).toBe(Date.parse("2027-03-15T07:00:00Z"));
    expect(dayOf(Date.parse("2026-11-01T12:00:00Z"), "America/Vancouver")).toEqual({ start: "2026-11-01", resetsAt: Date.parse("2026-11-02T08:00:00Z") });
  });

  it("gives back 30 minutes at the Monday reset, at each family's own midnight", async () => {
    const t = setup("2026-11-08T20:00:00Z"); // Sunday noon in Vancouver, Sunday 15:00 in Toronto
    for (let i = 0; i < 3; i++) await talk(t, call(i), CALL_SECONDS, "America/Vancouver", C);
    for (let i = 3; i < 6; i++) await talk(t, call(i), CALL_SECONDS, "America/Toronto", C2);
    expect((await t.ledger.usage({ parentId: P, childId: C, timeZone: "America/Vancouver" })).leftSeconds).toBe(0);
    expect((await t.ledger.grantChild({ callId: call(9), parentId: P, childId: C, timeZone: "America/Vancouver" }))).toEqual({
      ok: false, reason: "none_left", leftSeconds: 0, resetsAt: Date.parse("2026-11-09T08:00:00Z"),
    });

    // Monday 00:30 in Toronto (05:30 UTC) is still Sunday in Vancouver.
    t.at("2026-11-09T05:30:00Z");
    expect(await t.ledger.usage({ parentId: P, childId: C2, timeZone: "America/Toronto" })).toEqual({
      usedSeconds: 0, leftSeconds: WEEK_SECONDS, weekSeconds: WEEK_SECONDS, resetsAt: Date.parse("2026-11-16T05:00:00Z"),
    });
    expect((await t.ledger.usage({ parentId: P, childId: C, timeZone: "America/Vancouver" })).leftSeconds).toBe(0);

    t.at("2026-11-09T08:00:00Z"); // Monday 00:00 in Vancouver
    expect((await t.ledger.usage({ parentId: P, childId: C, timeZone: "America/Vancouver" })).leftSeconds).toBe(WEEK_SECONDS);
  });
});

describe("a call lasts at most 10 minutes, less when less remains", () => {
  it("grants 10 minutes, then the weekly remainder", async () => {
    const t = setup("2026-11-04T18:00:00Z");
    expect(await talk(t, call(1), 600)).toEqual({ ok: true, seconds: 600, limitMs: 600_000, leftSeconds: 1200 });
    expect(await talk(t, call(2), 600)).toMatchObject({ ok: true, seconds: 600 });
    // 26 minutes used: a short call is counted at its connected seconds.
    expect(await talk(t, call(3), 360)).toMatchObject({ ok: true, seconds: 600, leftSeconds: 0 });
    expect(await t.ledger.usage({ parentId: P, childId: C, timeZone: "America/Vancouver" })).toMatchObject({ usedSeconds: 1560, leftSeconds: 240 });
    expect(await talk(t, call(4), 600)).toEqual({ ok: true, seconds: 240, limitMs: 240_000, leftSeconds: 0 });
  });

  it("ends the call at the weekly remainder: closing a minute before, audio at the limit", () => {
    const pkg: QuestionPackage = {
      id: "wbq-minutes",
      ref: { source: "workbook", workbookId: "11111111-1111-4111-8111-111111111111", page: 3, question: 1 },
      templateId: null,
      text: "27 + 39 = ?",
      answer: { value: { type: "number", value: 66 }, accepted: [], unit: null },
      operation: { kind: "add", operands: [27, 39] },
      steps: workedSteps({ kind: "add", operands: [27, 39] }),
      skill: { standard: "2.4", skills: ["2.4-add-within-100"] },
      level: 9,
      difficulty: 2,
      wrongAnswers: [{ value: { type: "number", value: 56 }, cause: "O3", description: "Forgets carry", step: "tens" }],
      easierExample: { text: "18 + 5 = ?", operation: { kind: "add", operands: [18, 5] }, answer: { type: "number", value: 23 }, steps: workedSteps({ kind: "add", operands: [18, 5] }) },
    };
    expect(checkQuestionPackage(pkg)).toMatchObject({ ok: true });
    const run = (limitMs?: number) => {
      let s: Session = createSession({ callId: "minutes", package: pkg, limitMs });
      s = step(s, { type: "start", at: 0 }).session;
      return { tick: (at: number) => (s = step(s, { type: "tick", at }).session) };
    };
    const short = run(4 * MIN);
    expect(short.tick(3 * MIN - 1).state).not.toBe("TIME_CLOSE");
    expect(short.tick(3 * MIN).state).toBe("TIME_CLOSE");
    expect(short.tick(4 * MIN).outcome).toMatchObject({ reason: "time_limit", seconds: 240 });

    // A full grant keeps the 10-minute limits.
    const full = run(CALL_SECONDS * 1000);
    expect(full.tick(TIME_LIMITS.endAtMs - 1).outcome).toBeNull();
    expect(full.tick(TIME_LIMITS.endAtMs).outcome).toMatchObject({ reason: "time_limit", seconds: 600 });
  });

  it("starts no call with under a minute left", async () => {
    const t = setup("2026-11-04T18:00:00Z");
    await talk(t, call(1), 600);
    await talk(t, call(2), 600);
    await talk(t, call(3), 541);
    expect(await t.ledger.grantChild({ callId: call(4), parentId: P, childId: C, timeZone: "America/Vancouver" })).toEqual({
      ok: false, reason: "none_left", leftSeconds: 59, resetsAt: Date.parse("2026-11-09T08:00:00Z"),
    });
    expect(t.store.grants()).toHaveLength(3);
  });
});

describe("concurrent starts, retries and reconnects are counted once", () => {
  it("never grants the same minutes to two starts at once", async () => {
    const t = setup("2026-11-04T18:00:00Z");
    await talk(t, call(1), 600);
    await talk(t, call(2), 600); // 10 minutes left
    const grants = await Promise.all([3, 4, 5, 6].map((n) => t.ledger.grantChild({ callId: call(n), parentId: P, childId: C, timeZone: "America/Vancouver" })));
    expect(grants.filter((g) => g.ok)).toHaveLength(1);
    expect(grants.reduce((sum, g) => sum + (g.ok ? g.seconds : 0), 0)).toBe(600);
  });

  it("gives a retried start the same grant, and counts it once", async () => {
    const t = setup("2026-11-04T18:00:00Z");
    const a = await t.ledger.grantChild({ callId: call(1), parentId: P, childId: C, timeZone: "America/Vancouver" });
    const b = await t.ledger.grantChild({ callId: call(1), parentId: P, childId: C, timeZone: "America/Vancouver" });
    expect(b).toEqual(a);
    expect((await t.ledger.usage({ parentId: P, childId: C, timeZone: "America/Vancouver" })).usedSeconds).toBe(600);
    await expect(t.ledger.grantChild({ callId: call(1), parentId: P, childId: C2, timeZone: "America/Vancouver" })).rejects.toThrow(/mismatch/);
  });

  it("counts a call with a dropped connection once, from the time both were connected", async () => {
    const t = setup("2026-11-04T18:00:00Z");
    const g = await t.ledger.grantChild({ callId: call(1), parentId: P, childId: C, timeZone: "America/Vancouver" });
    expect(g).toMatchObject({ ok: true, seconds: 600 });
    t.store.callMade(call(1));
    // While the call is open, its whole grant counts.
    expect((await t.ledger.usage({ parentId: P, childId: C, timeZone: "America/Vancouver" })).usedSeconds).toBe(600);
    // The child joins, drops for 20 s and comes back; the worker renews its lease every 5 s.
    const events = [
      { kind: "agent_joined" as const, at: 0 },
      { kind: "child_joined" as const, at: 1000 },
      ...Array.from({ length: 40 }, (_, i) => ({ kind: "agent_joined" as const, at: (i + 1) * 5000 })),
      { kind: "child_left" as const, at: 61_000 },
      { kind: "child_joined" as const, at: 81_000 },
      { kind: "child_left" as const, at: 181_000 },
      { kind: "agent_left" as const, at: 182_000 },
    ];
    const seconds = connectedSeconds(events, 182_000);
    expect(seconds).toBe(160);
    t.store.callEnded(call(1), seconds);
    t.store.callEnded(call(1), seconds); // a retried end
    expect((await t.ledger.usage({ parentId: P, childId: C, timeZone: "America/Vancouver" })).usedSeconds).toBe(160);
  });

  it("frees a grant whose call was never made", async () => {
    const t = setup("2026-11-04T18:00:00Z");
    await t.ledger.grantChild({ callId: call(1), parentId: P, childId: C, timeZone: "America/Vancouver" });
    expect((await t.ledger.usage({ parentId: P, childId: C, timeZone: "America/Vancouver" })).usedSeconds).toBe(600);
    t.advance(GRANT_CALL_WAIT_MS);
    expect((await t.ledger.usage({ parentId: P, childId: C, timeZone: "America/Vancouver" })).usedSeconds).toBe(0);
  });

  it("refuses an expired grant after another call reserves the remaining minutes", async () => {
    const t = setup("2026-11-04T18:00:00Z");
    await talk(t, call(1), 600);
    await talk(t, call(2), 600);
    const input = { callId: call(3), parentId: P, childId: C, timeZone: "America/Vancouver" };
    expect(await t.ledger.grantChild(input)).toMatchObject({ ok: true, seconds: 600 });
    t.advance(GRANT_CALL_WAIT_MS);
    expect(await t.ledger.grantChild({ ...input, callId: call(4) })).toMatchObject({ ok: true, seconds: 600 });
    expect(await t.ledger.grantChild(input)).toMatchObject({ ok: false, leftSeconds: 0 });
    expect(() => t.store.callMade(call(3))).toThrow(/expired/);
    t.store.callMade(call(4));
    expect(await t.store.used({ parentId: P, childId: C, kind: "child", period: "2026-11-02" })).toBe(1800);
  });

  it("checks delayed call creation even when the caller does not retry the grant", async () => {
    const t = setup("2026-11-04T18:00:00Z");
    await talk(t, call(1), 600);
    await talk(t, call(2), 600);
    const input = { callId: call(3), parentId: P, childId: C, timeZone: "America/Vancouver" };
    await t.ledger.grantChild(input);
    t.advance(GRANT_CALL_WAIT_MS);
    await t.ledger.grantChild({ ...input, callId: call(4) });
    expect(() => t.store.callMade(call(3))).toThrow(/expired/);
    t.store.callMade(call(4));
    expect(await t.store.used({ parentId: P, childId: C, kind: "child", period: "2026-11-02" })).toBe(1800);
  });

  it("refuses a delayed call when its original limit exceeds the smaller remainder", async () => {
    const t = setup("2026-11-04T18:00:00Z");
    await talk(t, call(1), 600);
    await talk(t, call(2), 600);
    const input = { callId: call(3), parentId: P, childId: C, timeZone: "America/Vancouver" };
    await t.ledger.grantChild(input);
    t.advance(GRANT_CALL_WAIT_MS);
    await talk(t, call(4), 360);
    expect(await t.ledger.grantChild(input)).toMatchObject({ ok: false, leftSeconds: 240 });
    expect(() => t.store.callMade(call(3))).toThrow(/expired/);
    expect(await t.ledger.grantChild({ ...input, callId: call(5) })).toMatchObject({ ok: true, seconds: 240, limitMs: 240_000 });
  });

  it("reserves a delayed call again when all its seconds are still available", async () => {
    const t = setup("2026-11-04T18:00:00Z");
    await t.ledger.grantChild({ callId: call(1), parentId: P, childId: C, timeZone: "America/Vancouver" });
    t.advance(GRANT_CALL_WAIT_MS);
    t.store.callMade(call(1));
    t.advance(GRANT_CALL_WAIT_MS * 10);
    expect(await t.store.used({ parentId: P, childId: C, kind: "child", period: "2026-11-02" })).toBe(600);
  });

  it("counts on the server's clock", async () => {
    const t = setup("2026-11-09T07:59:00Z"); // Sunday 23:59 in Vancouver
    await talk(t, call(1), 600);
    await talk(t, call(2), 600);
    await talk(t, call(3), 600);
    t.advance(MIN); // the server's Monday, whatever the child's device says
    expect(await talk(t, call(4), 600)).toMatchObject({ ok: true, seconds: 600, leftSeconds: 1200 });
  });
});

describe("a parent's Try Maya calls", () => {
  it("use their own daily cap, never the child's minutes", async () => {
    const t = setup("2026-11-04T18:00:00Z");
    expect(await t.ledger.grantDemo({ callId: call(1), parentId: P, timeZone: "America/Vancouver" })).toMatchObject({ ok: true, seconds: 120, limitMs: 120_000 });
    t.store.callEnded(call(1), 60);
    expect(await t.ledger.grantDemo({ callId: call(2), parentId: P, timeZone: "America/Vancouver" })).toMatchObject({ ok: true, seconds: 60, leftSeconds: 0 });
    t.store.callEnded(call(2), 60);
    expect(await t.ledger.grantDemo({ callId: call(3), parentId: P, timeZone: "America/Vancouver" })).toEqual({
      ok: false, reason: "none_left", leftSeconds: 0, resetsAt: Date.parse("2026-11-05T08:00:00Z"),
    });
    expect(await t.ledger.usage({ parentId: P, childId: C, timeZone: "America/Vancouver" })).toMatchObject({ usedSeconds: 0, leftSeconds: WEEK_SECONDS });
    t.at("2026-11-05T08:00:00Z"); // the next local day
    expect(await t.ledger.grantDemo({ callId: call(4), parentId: P, timeZone: "America/Vancouver" })).toMatchObject({ ok: true, seconds: 120 });
  });

  it("allows only 120 seconds across concurrent demo starts", async () => {
    const t = setup("2026-11-04T18:00:00Z");
    const grants = await Promise.all([1, 2, 3].map((n) => t.ledger.grantDemo({ callId: call(n), parentId: P, timeZone: "America/Vancouver" })));
    expect(grants.filter((g) => g.ok)).toHaveLength(1);
    expect(grants.reduce((sum, g) => sum + (g.ok ? g.seconds : 0), 0)).toBe(120);
    expect(await t.ledger.grantDemo({ callId: call(4), parentId: C2, timeZone: "America/Vancouver" })).toMatchObject({ ok: true, seconds: 120 });
  });
});

describe("the family's time zone", () => {
  it("is the stored one, else the province's, else Vancouver", () => {
    expect(familyTimeZone("America/Halifax", "BC")).toBe("America/Halifax");
    expect(familyTimeZone(null, "ON")).toBe("America/Toronto");
    expect(familyTimeZone("Not/AZone", "AB")).toBe("America/Edmonton");
    expect(familyTimeZone(null, "other")).toBe("America/Vancouver");
    expect(validTimeZone("America/St_Johns")).toBe(true);
    expect(validTimeZone("'; drop table")).toBe(false);
  });

  it("shows whole minutes that never promise more than is left", () => {
    expect(usageMinutes({ usedSeconds: 61, leftSeconds: 1739 })).toEqual({ used: 2, left: 28 });
    expect(usageMinutes({ usedSeconds: 0, leftSeconds: 1800 })).toEqual({ used: 0, left: 30 });
  });
});
