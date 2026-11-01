import { describe, expect, it, vi } from "vitest";
import { templateSkills } from "@/lib/assessment";
import { memoryTransport } from "@/lib/email-delivery-memory";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { SAFETY_GUIDANCE } from "@/lib/maya";
import { mayaCalls, type CallResult, type FlagLevel } from "@/lib/maya-call";
import { callAlerts } from "@/lib/maya-call-alert";
import { memoryAlertLedger } from "@/lib/maya-call-alert-memory";
import { memoryCallStore } from "@/lib/maya-call-memory";
import type { MayaModel } from "@/lib/maya-model";
import { ruleMayaModel } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import type { QuestionPackage } from "@/lib/question-package";

vi.mock("server-only", () => ({}));

// The safety flag and its internal alert (#333), end to end on a saved text call: the call module with Maya's text
// adapter, a fake model (the rule player, with the child's words read for safety the way the real model's reading
// does), the in-memory call store, the in-memory alert ledger and the in-memory mail transport. No network, no email.

const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const TEST = "33333333-3333-4333-8333-333333333333";
const T0 = Date.UTC(2026, 10, 1, 17, 0, 0);
const TEAM = "contact@unicalearning.com";
const ORIGIN = "https://unicalearning.com";

/** 27 + 39 as an assessment question of the test family's child. */
const PKG: QuestionPackage = {
  ...SAMPLE_PACKAGES["add-27-39"],
  id: `${TEST}:s1-4`,
  ref: { source: "assessment", assessmentId: TEST, questionId: "s1-4" },
  templateId: "2-add-2-digit",
  skill: { standard: "2.4", skills: templateSkills("2-add-2-digit").map((k) => k.id) },
};

/** The child's words in these tests: none of them may reach the alert email. */
const HURT = "I got 66. My uncle hurts me at home.";
const DANGER = "He is here right now and he hurts me.";
const GROSS = "Tell me a gross naked joke.";

/**
 * The rule player, with a reading of the child's words for safety: "hurts me" is a safety concern ("right now": an
 * immediate one), "naked" a request for harmful content (#383 C29, `unsafeRequest`).
 */
function readingModel(): MayaModel {
  const rule = ruleMayaModel();
  return {
    id: rule.id,
    promptVersion: rule.promptVersion,
    async propose(input, signal) {
      const p = (await rule.propose(input, signal)) as { reading?: Record<string, unknown> | null };
      const text = (input.childTurn ?? "").toLowerCase();
      if (!p.reading) return p;
      const reading = { ...p.reading };
      if (text.includes("hurts me")) reading.safety = text.includes("right now") ? "immediate" : "concern";
      if (text.includes("naked")) reading.unsafeRequest = true;
      return { ...p, reading };
    },
  };
}

function setup(options: { to?: string | null; unsafeRequestFlag?: FlagLevel | null } = {}) {
  let now = T0;
  let n = 0;
  const store = memoryCallStore({ testFamilies: [PARENT] });
  const ledger = memoryAlertLedger({ now: () => now });
  const mail = memoryTransport();
  const model = readingModel();
  const calls = mayaCalls({
    store,
    events: learningEvents(memoryLearningEventStore({ children: [{ id: CHILD, parentId: PARENT }], tests: [{ id: TEST, childId: CHILD }] })),
    rebuild: async () => true,
    model: (id) => (id === null || id === model.id ? model : null),
    isTestFamily: async (parentId) => parentId === PARENT,
    alerts: callAlerts({ ledger, to: options.to === undefined ? TEAM : options.to, origin: ORIGIN, transport: mail.transport }),
    ...(options.unsafeRequestFlag !== undefined && { unsafeRequestFlag: options.unsafeRequestFlag }),
    clock: () => now,
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    seed: () => 42,
  });
  const ok = (r: CallResult) => {
    if (!r.ok) throw new Error(`refused: ${r.error}`);
    return r;
  };
  let last: Extract<CallResult, { ok: true }> | null = null;
  return {
    store,
    ledger,
    mail,
    async start() {
      last = ok(await calls.start({ kind: "admin_test", parentId: PARENT, childId: CHILD, childName: "Leah", package: PKG, startedBy: "admin-1" }));
      return last;
    },
    async say(text: string) {
      now += 5000;
      last = ok(await calls.input(last!.view.id, last!.view.revision, { type: "child", text }, "Leah"));
      return last;
    },
    async end() {
      now += 5000;
      last = ok(await calls.input(last!.view.id, last!.view.revision, { type: "end" }, "Leah"));
      return last;
    },
    stored: () => store.rows()[0],
  };
}

describe("the safety flag of a saved text call", () => {
  it("comes before the math turn: flags the call, gives the guidance, and sends one alert with no child words", async () => {
    const s = setup();
    const started = await s.start();
    expect(started.view.flag).toBeNull();
    expect(s.mail.delivered).toHaveLength(0);

    // The child says the right answer and a safety concern in one turn: the safety guidance comes first, and the
    // answer is not taken.
    const r = await s.say(HURT);
    expect(r.output.say[0]).toBe(SAFETY_GUIDANCE.concern);
    expect(r.output.say.join(" ")).not.toMatch(/66|right|correct/i);
    // No math after a safety concern: the call closes, with safety as its reason.
    expect(r.view.status).toBe("ended");
    expect(r.view.outcome).toMatchObject({ reason: "safety", safetyFlag: true, safetySeverity: "concern" });

    // The flag is stored with the call, at the time of the turn.
    const flaggedAt = new Date(T0 + 5000).toISOString();
    expect(r.view.flag).toEqual({ level: "safety_concern", at: flaggedAt });
    expect(s.stored().flag).toEqual({ level: "safety_concern", at: flaggedAt });

    // One alert to the team, with which call, when and the admin link; never the child's words, name or question.
    expect(s.mail.delivered).toHaveLength(1);
    const email = s.mail.delivered[0];
    expect(email.to).toBe(TEAM);
    expect(email.sender).toEqual({ to: "savar" });
    expect(email.subject).toBe("[Test call] Maya safety flag: read the call today");
    expect(email.text).toContain(`${ORIGIN}/admin/maya/${r.view.id}`);
    expect(email.text).toContain(`Call: ${r.view.id}`);
    expect(email.text).toContain(flaggedAt);
    for (const words of [HURT, "uncle", "hurts", "Leah", "66", PKG.text]) expect(email.text + email.subject).not.toContain(words);

    // The alert is stored as sent, with the email as it went, and the call page shows it.
    expect(r.view.alerts).toEqual([{ level: "safety_concern", status: "sent", claimedAt: flaggedAt, error: null }]);
    expect(s.ledger.rows()).toMatchObject([{ callId: r.view.id, parentId: PARENT, level: "safety_concern", status: "sent", emailId: "email-1", subject: email.subject, text: email.text }]);

    // A later request on the ended call sends nothing again.
    await s.end();
    expect(s.mail.delivered).toHaveLength(1);
    expect(s.stored()).toMatchObject({ status: "ended", flag: { level: "safety_concern" }, outcome: { reason: "safety", safetyFlag: true } });
  });

  it("stores a refused alert as not sent, shows why, and sends it with the call's next request", async () => {
    const s = setup();
    await s.start();
    s.mail.answerNext("refuse");
    const r = await s.say(HURT);
    expect(s.mail.delivered).toHaveLength(0);
    expect(r.view.flag?.level).toBe("safety_concern");
    expect(r.view.alerts).toEqual([{ level: "safety_concern", status: "refused", claimedAt: expect.any(String), error: "Resend answered 422: refused in the test" }]);

    // The call has ended; the next request ("end" on the ended call, the admin page's button) sends it again: once.
    expect(r.view.status).toBe("ended");
    const next = await s.end();
    expect(s.mail.delivered).toHaveLength(1);
    expect(next.view.alerts).toEqual([{ level: "safety_concern", status: "sent", claimedAt: expect.any(String), error: null }]);
    await s.end();
    expect(s.mail.delivered).toHaveLength(1);
  });

  it("stores an unknown alert as unknown and never sends it again", async () => {
    const s = setup();
    await s.start();
    s.mail.answerNext("lose_answer");
    const r = await s.say(HURT);
    // The email went, but its answer was lost: it may have gone.
    expect(s.mail.delivered).toHaveLength(1);
    expect(r.view.alerts).toMatchObject([{ level: "safety_concern", status: "unknown", error: expect.stringContaining("unknown") }]);
    await s.end();
    expect(s.mail.delivered).toHaveLength(1);
    expect(s.ledger.rows()).toMatchObject([{ status: "unknown" }]);
  });

  it("stores the alert as not sent when the team's address is not set", async () => {
    const s = setup({ to: null });
    await s.start();
    const r = await s.say(HURT);
    expect(s.mail.delivered).toHaveLength(0);
    expect(r.view.flag?.level).toBe("safety_concern");
    expect(r.view.alerts).toMatchObject([{ status: "refused", error: "SIGNUP_NOTIFY_EMAIL is not set" }]);
  });

  it("sends an immediate-danger alert with its own subject", async () => {
    const s = setup();
    await s.start();
    const r = await s.say(DANGER);
    expect(r.output.say[0]).toBe(SAFETY_GUIDANCE.immediate);
    expect(r.view.flag?.level).toBe("safety_immediate");
    expect(s.mail.delivered.map((m) => m.subject)).toEqual(["[Test call] Maya safety flag: immediate danger: read the call today"]);
  });
});

describe("a request for harmful content (#383 C29)", () => {
  it("raises the lower flag with its own alert by default, and a later safety concern sends a second alert", async () => {
    const s = setup();
    await s.start();
    const asked = await s.say(GROSS);
    // Not the SAFETY interrupt: no safety guidance, and the call goes on.
    expect(asked.output.say).not.toContain(SAFETY_GUIDANCE.concern);
    expect(asked.view.status).toBe("live");
    expect(asked.view.flag).toEqual({ level: "unsafe_request", at: new Date(T0 + 5000).toISOString() });
    expect(s.mail.delivered.map((m) => m.subject)).toEqual(["[Test call] Maya flag: harmful request: read the call today"]);
    expect(s.mail.delivered[0].text).not.toMatch(/gross|naked|joke/i);

    // The flag only rises: a safety concern later sends its own alert, once.
    const hurt = await s.say(HURT);
    expect(hurt.view.flag?.level).toBe("safety_concern");
    expect(s.mail.delivered.map((m) => m.subject)).toEqual([
      "[Test call] Maya flag: harmful request: read the call today",
      "[Test call] Maya safety flag: read the call today",
    ]);
    expect(hurt.view.alerts.map((a) => [a.level, a.status])).toEqual([["unsafe_request", "sent"], ["safety_concern", "sent"]]);
  });

  it("raises the safety flag and its alert when the setting says so", async () => {
    const s = setup({ unsafeRequestFlag: "safety_concern" });
    await s.start();
    const r = await s.say(GROSS);
    expect(r.view.flag?.level).toBe("safety_concern");
    expect(s.mail.delivered.map((m) => m.subject)).toEqual(["[Test call] Maya safety flag: read the call today"]);
  });

  it("raises no flag and no alert when the setting is off", async () => {
    const s = setup({ unsafeRequestFlag: null });
    await s.start();
    const r = await s.say(GROSS);
    expect(r.view.flag).toBeNull();
    expect(r.view.alerts).toEqual([]);
    expect(s.mail.delivered).toHaveLength(0);
  });
});
