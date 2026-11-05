import { afterEach, describe, expect, it, vi } from "vitest";
import { codeProof, DELETE_CODE_POLICY, deleteCodeEmail, requestDeleteCode, type DeleteCodeSeams } from "@/lib/family-delete-code";
import { DELETE_POLICY, DELETE_WORD, requestFamilyDelete } from "@/lib/family-delete";
import { memoryDeleteCodes, memoryDeleteStore, memoryFamily, memoryPlans, type MemoryFamily } from "@/lib/family-delete-memory";
import type { EmailMessage, SendResult } from "@/lib/email-delivery";

const PARENT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const EMAIL = "parent@example.invalid";
const ACCOUNT = { email: EMAIL, confirmed: true };
const MINUTE = 60_000;

function harness(over: Partial<MemoryFamily> = {}, seams: Partial<DeleteCodeSeams> = {}) {
  // family.time is the database's clock. Asking for a code and checking it use no other clock.
  const family = memoryFamily({ time: 1_000_000, ...over });
  const store = memoryDeleteStore(family);
  const mail: EmailMessage[] = [];
  let nextResult: SendResult = { status: "sent", emailId: "email_1" };
  let codes = 0;
  let readDelay = 0;
  const stored = memoryDeleteCodes(family);
  const shared: DeleteCodeSeams = {
    // The read answers, then the answer takes readDelay to arrive.
    codes: { ...stored, read: async (parent) => { const answer = await stored.read(parent); family.time += readDelay; return answer; } },
    store, configProblem: () => null,
    newCode: () => String(100_000 + ++codes),
    send: async (message) => { mail.push(message); return nextResult; },
    ...seams,
  };
  return {
    family, mail,
    advance: (ms: number) => { family.time += ms; },
    at: (time: number) => { family.time = time; },
    delayRead: (ms: number) => { readDelay = ms; },
    failSendWith: (result: SendResult) => { nextResult = result; },
    ask: (account: { email: string | null | undefined; confirmed: boolean } = ACCOUNT) => requestDeleteCode(PARENT, account, shared),
    prove: (code: string, parent = PARENT, email = EMAIL) => codeProof(shared.codes, parent, email)(code),
    codeIn: (message: EmailMessage) => /\b(\d{6})\b/.exec(message.text)![1],
    confirm: (code: string) => requestFamilyDelete(PARENT, { code, confirm: DELETE_WORD }, codeProof(shared.codes, PARENT, EMAIL), { store, plans: memoryPlans(family), now: () => family.time }),
    get now() { return family.time; },
  };
}

describe("asking for a code", () => {
  it("emails a 6-digit code to the account's address and stores only a salted hash", async () => {
    const h = harness();
    expect(await h.ask()).toEqual({ ok: true, sentTo: EMAIL, unsure: false });
    expect(h.mail).toHaveLength(1);
    expect(h.mail[0].to).toBe(EMAIL);
    expect(h.mail[0].sender).toEqual({ to: "parent" });
    const code = h.codeIn(h.mail[0]);
    expect(JSON.stringify(h.family.code)).not.toContain(code);
    expect(h.family.code?.hash.startsWith("scrypt$")).toBe(true);
  });
  it("makes a random 6-digit code by default, and a new salt each time", async () => {
    const h = harness({}, { newCode: undefined });
    await h.ask();
    const first = h.family.code!.hash;
    expect(h.codeIn(h.mail[0])).toMatch(/^\d{6}$/);
    await h.ask();
    expect(h.family.code!.hash.split("$")[4]).not.toBe(first.split("$")[4]);
  });
  it("sends nothing to an account with no confirmed email, and counts no send", async () => {
    const h = harness();
    expect(await h.ask({ email: EMAIL, confirmed: false })).toEqual({ ok: false, error: "no_confirmed_email" });
    expect(await h.ask({ email: null, confirmed: true })).toEqual({ ok: false, error: "no_confirmed_email" });
    expect(h.mail).toHaveLength(0);
    expect(h.family.codeSends).toEqual([]);
  });
  it.each([
    [{ admin: true }, "protected"],
    [{ holds: 1 }, "busy"],
    [{ openPlanStart: () => true }, "plan_start"],
    [{ gone: true }, "not_found"],
  ] as const)("%j answers %s and sends nothing", async (over, error) => {
    const h = harness(over);
    expect(await h.ask()).toEqual({ ok: false, error });
    expect(h.mail).toHaveLength(0);
  });
  it("counts no send when email cannot go", async () => {
    const h = harness({}, { configProblem: () => "no key" });
    expect(await h.ask()).toEqual({ ok: false, error: "unavailable" });
    expect(h.family.codeSends).toEqual([]);
    expect(h.family.code).toBeNull();
  });
  it("sends 3 an hour, then answers with the time the next one can go", async () => {
    const h = harness();
    const first = h.now;
    for (let i = 0; i < 3; i++) { expect((await h.ask()).ok).toBe(true); h.advance(MINUTE); }
    expect(await h.ask()).toEqual({ ok: false, error: "too_many", retryAt: first + DELETE_CODE_POLICY.windowMs });
    expect(h.mail).toHaveLength(3);
    h.advance(DELETE_CODE_POLICY.windowMs);
    expect((await h.ask()).ok).toBe(true);
  });
  it("sends 6 in a day, however they are spread", async () => {
    const h = harness();
    const first = h.now;
    for (let i = 0; i < 6; i++) { expect((await h.ask()).ok).toBe(true); h.advance(61 * MINUTE); }
    expect(await h.ask()).toEqual({ ok: false, error: "too_many", retryAt: first + DELETE_CODE_POLICY.dayMs });
    expect(h.mail).toHaveLength(6);
  });
  it("answers with the later time when both limits are full, as the next send needs both to have room", async () => {
    // Three sends, a gap, three more: the hour has room again 60 minutes after the fourth, but the day has none until the first leaves it.
    const day = harness();
    const start = day.now;
    for (const minutes of [0, 1, 2, 61, 62, 63]) { day.at(start + minutes * MINUTE); expect((await day.ask()).ok).toBe(true); }
    day.at(start + 64 * MINUTE);
    expect(await day.ask()).toEqual({ ok: false, error: "too_many", retryAt: start + DELETE_CODE_POLICY.dayMs });
    day.at(start + DELETE_CODE_POLICY.dayMs - 1);
    expect((await day.ask()).ok).toBe(false);
    day.at(start + DELETE_CODE_POLICY.dayMs);
    expect((await day.ask()).ok).toBe(true);

    // The other order: the day has room first, and the hour is the later time.
    const hour = harness();
    const first = hour.now;
    for (const minutes of [0, 60, 120, 1390, 1400, 1410]) { hour.at(first + minutes * MINUTE); expect((await hour.ask()).ok).toBe(true); }
    hour.at(first + 1420 * MINUTE);
    expect(await hour.ask()).toEqual({ ok: false, error: "too_many", retryAt: first + 1450 * MINUTE });
    hour.at(first + 1450 * MINUTE);
    expect((await hour.ask()).ok).toBe(true);
  });
  it("counts asks sent together", async () => {
    const h = harness();
    const answers = await Promise.all(Array.from({ length: 5 }, () => h.ask()));
    expect(answers.filter((a) => a.ok)).toHaveLength(3);
    expect(h.mail).toHaveLength(3);
  });
  it("refuses while the wrong tries have locked the parent, and asking clears no try", async () => {
    const h = harness();
    await h.ask();
    for (let i = 0; i < 4; i++) await h.confirm("000000");
    await h.ask();
    expect(h.family.attempts.failed).toBe(4);
    await h.confirm("000000");
    expect(await h.ask()).toEqual({ ok: false, error: "locked", retryAt: h.family.attempts.lockedUntil });
  });
  it("takes back the code when the provider refuses the email, so no code is live that no one has", async () => {
    const h = harness();
    h.failSendWith({ status: "refused", error: "Refused" });
    expect(await h.ask()).toEqual({ ok: false, error: "email_failed" });
    expect(h.family.code).toBeNull();
  });
  it("keeps the code when the email may have gone, and says it is not sure", async () => {
    const h = harness();
    h.failSendWith({ status: "unknown", error: "Timed out" });
    expect(await h.ask()).toEqual({ ok: true, sentTo: EMAIL, unsure: true });
    expect(await h.prove(h.codeIn(h.mail[0]))).toBe("ok");
  });
});

describe("the email", () => {
  const { subject, text, html } = deleteCodeEmail("123456");
  it("says what it is for and keeps the code out of the subject", () => {
    expect(subject).toMatch(/delete/i);
    expect(subject).not.toContain("123456");
    expect(text).toContain("123456");
    expect(html).toContain("123456");
    expect(text).toMatch(/10 minutes/);
    expect(text).toMatch(/cannot undo/);
  });
  it("says what to do when the parent did not ask, in both versions", () => {
    for (const body of [text, html]) {
      expect(body).toMatch(/did not ask/);
      expect(body).toMatch(/change your password/i);
      expect(body).toContain("contact@unicalearning.com");
    }
  });
});

describe("checking a code", () => {
  async function sent() {
    const h = harness();
    await h.ask();
    return { h, code: h.codeIn(h.mail[0]) };
  }
  it("takes the right code once", async () => {
    const { h, code } = await sent();
    expect(await h.prove(code)).toBe("ok");
    expect(await h.prove(code)).toBe("ended");
    expect(h.family.code).toBeNull();
  });
  it("gives one winner when the same right code is sent twice together", async () => {
    const { h, code } = await sent();
    const answers = await Promise.all([h.prove(code), h.prove(code)]);
    expect(answers.filter((a) => a === "ok")).toHaveLength(1);
    expect(answers.filter((a) => a === "ended")).toHaveLength(1);
  });
  it("answers wrong for a wrong code and keeps the live one", async () => {
    const { h, code } = await sent();
    expect(await h.prove(code === "000000" ? "000001" : "000000")).toBe("wrong");
    expect(await h.prove(code)).toBe("ok");
  });
  it("ends the code 10 minutes after it was sent", async () => {
    const { h, code } = await sent();
    h.advance(DELETE_CODE_POLICY.ttlMs - 1);
    const live = await h.prove("000000");
    expect(live).toBe("wrong");
    h.advance(1);
    expect(await h.prove("000000")).toBe("ended");
    expect(await h.prove(code)).toBe("ended");
  });
  it("answers ended when the check starts before the code ends and the read runs past the end, and does not spend it", async () => {
    const { h, code } = await sent();
    h.advance(DELETE_CODE_POLICY.ttlMs - 1_000);
    h.delayRead(6_000);
    expect(await h.prove(code)).toBe("ended");
    expect(h.family.code).not.toBeNull();
  });
  it("takes the code after a slow read that still ends before the code does", async () => {
    const { h, code } = await sent();
    h.advance(DELETE_CODE_POLICY.ttlMs - 7_000);
    h.delayRead(6_000);
    expect(await h.prove(code)).toBe("ok");
  });
  it("answers ended when no code was ever sent", async () => {
    expect(await harness().prove("123456")).toBe("ended");
  });
  it("replaces the old code with a new one", async () => {
    const { h, code } = await sent();
    await h.ask();
    expect(await h.prove(code)).toBe("wrong");
    expect(await h.prove(h.codeIn(h.mail[1]))).toBe("ok");
  });
  it("works only for this parent: another parent's check with the same code and row fails", async () => {
    const { h, code } = await sent();
    expect(await h.prove(code, OTHER)).toBe("wrong");
    expect(await h.prove(code)).toBe("ok");
  });
  it("works only for the address it went to: a changed account email fails", async () => {
    const { h, code } = await sent();
    expect(await h.prove(code, PARENT, "new-address@example.invalid")).toBe("wrong");
    expect(await h.prove(code)).toBe("ok");
  });
  it("ignores the case of the address, as Auth does", async () => {
    const { h, code } = await sent();
    expect(await h.prove(code, PARENT, EMAIL.toUpperCase())).toBe("ok");
  });
  it("ends every code before the lock ends, so a lock always needs a new code", () => {
    expect(DELETE_CODE_POLICY.ttlMs).toBeLessThan(DELETE_POLICY.lockMs);
  });
});

describe("an app clock that is wrong", () => {
  // The harness's database clock stays at family.time. Only the app's Date moves.
  const appClockAt = (time: number) => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(time); };
  afterEach(() => { vi.useRealTimers(); });

  it("cannot extend a code: 5 minutes ahead, the code still ends 10 minutes after the database's time", async () => {
    const h = harness();
    const sentAt = h.now;
    appClockAt(sentAt + 5 * MINUTE);
    await h.ask();
    expect(h.family.code?.expiresAt).toBe(sentAt + DELETE_CODE_POLICY.ttlMs);
    expect(h.family.codeSends).toEqual([sentAt]);
    const code = h.codeIn(h.mail[0]);
    h.at(sentAt + DELETE_CODE_POLICY.ttlMs);
    expect(await h.prove(code)).toBe("ended");
  });
  it("cannot shorten a code: 5 minutes behind, the code still ends 10 minutes after the database's time", async () => {
    const h = harness();
    const sentAt = h.now;
    appClockAt(sentAt - 5 * MINUTE);
    await h.ask();
    expect(h.family.code?.expiresAt).toBe(sentAt + DELETE_CODE_POLICY.ttlMs);
    h.at(sentAt + DELETE_CODE_POLICY.ttlMs - 1);
    expect(await h.prove(h.codeIn(h.mail[0]))).toBe("ok");
  });
  it("cannot free a send limit: a day ahead, the fourth send in the hour is still refused", async () => {
    const h = harness();
    const first = h.now;
    for (let i = 0; i < 3; i++) { expect((await h.ask()).ok).toBe(true); h.advance(MINUTE); }
    appClockAt(first + DELETE_CODE_POLICY.dayMs);
    expect(await h.ask()).toEqual({ ok: false, error: "too_many", retryAt: first + DELETE_CODE_POLICY.windowMs });
    expect(h.mail).toHaveLength(3);
  });
  it("cannot end a lock early: a day ahead, no code goes during the lock", async () => {
    const lockedUntil = 1_000_000 + 10 * MINUTE;
    const h = harness({ attempts: { failed: 5, lockedUntil } });
    appClockAt(lockedUntil + DELETE_CODE_POLICY.dayMs);
    expect(await h.ask()).toEqual({ ok: false, error: "locked", retryAt: lockedUntil });
    expect(h.mail).toHaveLength(0);
  });
});

describe("the whole flow, on the seams", () => {
  it("asks, confirms, stops the plan and queues the family", async () => {
    const h = harness({ plans: { cus_1: ["sub_1"] } });
    await h.ask();
    expect(await h.confirm(h.codeIn(h.mail[0]))).toEqual({ ok: true, plansStopped: 1 });
    expect(h.family.fenced).toBe(true);
    expect(h.family.log).toEqual(["claim", "stop sub_1", "hold", "queued"]);
    expect(h.family.attempts).toEqual({ failed: 0, lockedUntil: null });
  });
  it("does nothing for a stolen session that has no code: 5 guesses lock it, and every plan still runs", async () => {
    const h = harness({ plans: { cus_1: ["sub_1"] } });
    await h.ask();
    const code = h.codeIn(h.mail[0]);
    const guess = code === "000000" ? "000001" : "000000";
    for (let i = 0; i < 4; i++) expect((await h.confirm(guess) as { error: string }).error).toBe("wrong_code");
    expect((await h.confirm(guess) as { error: string }).error).toBe("locked");
    expect((await h.confirm(code) as { error: string }).error).toBe("locked");
    expect(h.family.plans.cus_1).toEqual(["sub_1"]);
    expect(h.family.fenced).toBe(false);
  });
  it("needs a new code to try again after a stop fails, since the first one was spent", async () => {
    const h = harness({ plans: { cus_1: ["sub_1"] }, fail: { stop: ["sub_1"] } });
    await h.ask();
    const code = h.codeIn(h.mail[0]);
    expect(await h.confirm(code)).toEqual({ ok: false, error: "not_finished", plansStopped: 0 });
    h.family.fail = {};
    expect(await h.confirm(code)).toEqual({ ok: false, error: "code_ended" });
    await h.ask();
    expect(await h.confirm(h.codeIn(h.mail[1]))).toEqual({ ok: true, plansStopped: 1 });
  });
  it("still works for a family the retention job froze, which has no request of its own", async () => {
    const h = harness({ fenced: true });
    await h.ask();
    expect(await h.confirm(h.codeIn(h.mail[0]))).toEqual({ ok: true, plansStopped: 0 });
  });
});
