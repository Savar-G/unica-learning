import { describe, expect, it } from "vitest";
import { recordAnswer, startAttempt } from "@/lib/assessment";
import {
  dueReminders,
  runReminders,
  type DueReminder,
  type LogEntry,
  type LogStatus,
  type ReminderKind,
  type ReminderState,
  type ReminderStore,
  type ReminderTest,
  type SendOutcome,
} from "@/lib/reminders";

// Who gets which reminder (#73, D-085), decided from the stored state and `now` only.
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 9, 12, 18, 0);

/** A test the child stopped: started 20 minutes before its last answer at `lastAnswer`. */
function stopped(id: string, lastAnswer: number, childId = "c1"): ReminderTest {
  return { ...recordAnswer(startAttempt(id, lastAnswer - 20 * MIN), lastAnswer), childId, answeredAll: false };
}

let logId = 0;
/** A log row for a reminder about test `assessmentId` (or child c1 for "start"). */
function sent(kind: ReminderKind, assessmentId: string | null, status: LogStatus = "sent", attempts = 1): LogEntry {
  return { id: `l${++logId}`, kind, parentId: "p1", childId: "c1", assessmentId, status, attempts };
}

function state(over: Partial<ReminderState> = {}): ReminderState {
  return {
    parents: [{ id: "p1", email: "priya@family.ca" }],
    children: [{ id: "c1", parentId: "p1", createdAt: T0 - 2 * HOUR }],
    tests: [],
    log: [],
    ...over,
  };
}

describe("the continue reminder", () => {
  it("is due exactly 1 hour after the last answer on an unfinished test, not a moment before", () => {
    const s = state({ tests: [stopped("a1", T0)] });
    expect(dueReminders(s, T0 + HOUR - 1)).toEqual([]);
    expect(dueReminders(s, T0 + HOUR)).toEqual([
      { kind: "continue", parentId: "p1", childId: "c1", assessmentId: "a1", dueAt: T0 + HOUR, retry: null },
    ]);
  });

  it("counts from the start when the child stopped before the first answer", () => {
    const opened: ReminderTest = { ...startAttempt("a1", T0), childId: "c1", answeredAll: false };
    expect(dueReminders(state({ tests: [opened] }), T0 + HOUR)).toMatchObject([{ kind: "continue", dueAt: T0 + HOUR }]);
  });

  it("goes once per test", () => {
    const s = state({ tests: [stopped("a1", T0)], log: [sent("continue", "a1")] });
    expect(dueReminders(s, T0 + 2 * HOUR)).toEqual([]);
  });

  it("does not go for a finished test, or for one with every answer in that waits to be scored", () => {
    const finished: ReminderTest = { ...stopped("a1", T0), status: "completed", completedAt: T0 };
    const waiting: ReminderTest = { ...stopped("a1", T0), answeredAll: true };
    expect(dueReminders(state({ tests: [finished] }), T0 + 2 * HOUR)).toEqual([]);
    expect(dueReminders(state({ tests: [waiting] }), T0 + 2 * HOUR)).toEqual([]);
  });
});

describe("the come back reminder", () => {
  const afterContinue = (tests: ReminderTest[]) => state({ tests, log: [sent("continue", "a1")] });

  it("is due when the 24-hour window ends: not at the deadline itself, the moment after it", () => {
    const s = afterContinue([stopped("a1", T0)]);
    expect(dueReminders(s, T0 + DAY)).toEqual([]);
    expect(dueReminders(s, T0 + DAY + 1)).toEqual([
      { kind: "come_back", parentId: "p1", childId: "c1", assessmentId: "a1", dueAt: T0 + DAY, retry: null },
    ]);
  });

  it("is due for a test the server already marked expired", () => {
    const marked: ReminderTest = { ...stopped("a1", T0), status: "expired" };
    expect(dueReminders(afterContinue([marked]), T0 + DAY + HOUR)).toMatchObject([{ kind: "come_back", assessmentId: "a1" }]);
  });

  it("never goes for a test with every answer in: it does not expire, it waits to be scored", () => {
    const waiting: ReminderTest = { ...stopped("a1", T0), answeredAll: true };
    expect(dueReminders(afterContinue([waiting]), T0 + 3 * DAY)).toEqual([]);
  });

  it("does not go once the family has started again", () => {
    const again = stopped("a2", T0 + DAY + 2 * HOUR);
    expect(dueReminders(afterContinue([stopped("a1", T0), again]), T0 + DAY + 2 * HOUR + 30 * MIN)).toEqual([]);
  });

  it("goes once per test", () => {
    const s = state({ tests: [stopped("a1", T0)], log: [sent("continue", "a1"), sent("come_back", "a1")] });
    expect(dueReminders(s, T0 + DAY + HOUR)).toEqual([]);
  });

  it("is dropped when it is more than 7 days late", () => {
    const s = afterContinue([stopped("a1", T0)]);
    expect(dueReminders(s, T0 + DAY + 7 * DAY)).toHaveLength(1);
    expect(dueReminders(s, T0 + DAY + 7 * DAY + 1)).toEqual([]);
  });
});

describe("the start reminder", () => {
  const signedUp = state({ children: [{ id: "c1", parentId: "p1", createdAt: T0 }] });

  it("is due exactly 24 hours after the signup when the child has not started a test", () => {
    expect(dueReminders(signedUp, T0 + DAY - 1)).toEqual([]);
    expect(dueReminders(signedUp, T0 + DAY)).toEqual([
      { kind: "start", parentId: "p1", childId: "c1", assessmentId: null, dueAt: T0 + DAY, retry: null },
    ]);
  });

  it("does not go when the child started a test, finished or not", () => {
    const open = stopped("a1", T0 + DAY - 30 * MIN);
    const finished: ReminderTest = { ...stopped("a1", T0 + 2 * HOUR), status: "completed", completedAt: T0 + 2 * HOUR };
    expect(dueReminders({ ...signedUp, tests: [open] }, T0 + DAY)).toEqual([]);
    expect(dueReminders({ ...signedUp, tests: [finished] }, T0 + DAY)).toEqual([]);
  });

  it("goes once per child", () => {
    expect(dueReminders({ ...signedUp, log: [sent("start", null)] }, T0 + 2 * DAY)).toEqual([]);
  });

  it("is dropped when it is more than 7 days late", () => {
    expect(dueReminders(signedUp, T0 + DAY + 7 * DAY)).toHaveLength(1);
    expect(dueReminders(signedUp, T0 + DAY + 7 * DAY + 1)).toEqual([]);
  });

  it("goes for each child who has not started, named in their own reminder", () => {
    const s = state({
      children: [{ id: "c1", parentId: "p1", createdAt: T0 }, { id: "c2", parentId: "p1", createdAt: T0 + HOUR }],
      tests: [{ ...stopped("a1", T0 + 2 * HOUR, "c1"), status: "completed", completedAt: T0 + 2 * HOUR }],
    });
    expect(dueReminders(s, T0 + DAY + HOUR)).toEqual([
      { kind: "start", parentId: "p1", childId: "c2", assessmentId: null, dueAt: T0 + DAY + HOUR, retry: null },
    ]);
  });
});

describe("over the life of a test, with the job every 15 minutes", () => {
  /** Runs the decision every 15 minutes from `from` to `to`, logs each reminder as sent, and returns what went when. */
  function runEvery15Minutes(s: ReminderState, from: number, to: number, tests: (now: number) => ReminderTest[]) {
    const log: LogEntry[] = [...s.log];
    const out: { kind: ReminderKind; childId: string; at: number }[] = [];
    for (let now = from; now <= to; now += 15 * MIN) {
      for (const r of dueReminders({ ...s, tests: tests(now), log }, now)) {
        log.push({ id: `run-${log.length}`, kind: r.kind, parentId: r.parentId, childId: r.childId, assessmentId: r.assessmentId, status: "sent", attempts: 1 });
        out.push({ kind: r.kind, childId: r.childId, at: now });
      }
    }
    return out;
  }

  it("sends at most 2 reminders for a test, each once, even when the child comes back and stops again", () => {
    // Stops at T0, comes back at T0 + 3h and stops again 30 minutes later, then never returns.
    const firstStop = stopped("a1", T0);
    const secondStop = recordAnswer(firstStop, T0 + 3.5 * HOUR);
    const tests = (now: number) => [now < T0 + 3.5 * HOUR ? firstStop : { ...secondStop, childId: "c1", answeredAll: false }];
    expect(runEvery15Minutes(state(), T0, T0 + 10 * DAY, tests)).toEqual([
      { kind: "continue", childId: "c1", at: T0 + HOUR },
      // The window ends 24 hours after the last answer; the first run after it sends "come back".
      { kind: "come_back", childId: "c1", at: T0 + 3.5 * HOUR + DAY + 15 * MIN },
    ]);
  });

  it("sends one start reminder for a child who never starts", () => {
    const s = state({ children: [{ id: "c1", parentId: "p1", createdAt: T0 }] });
    expect(runEvery15Minutes(s, T0, T0 + 10 * DAY, () => [])).toEqual([{ kind: "start", childId: "c1", at: T0 + DAY }]);
  });
});

describe("who never gets a reminder", () => {
  const due = state({
    children: [{ id: "c1", parentId: "p1", createdAt: T0 - DAY }, { id: "c2", parentId: "p2", createdAt: T0 - DAY }],
    parents: [{ id: "p1", email: "priya@family.ca" }, { id: "p2", email: "sam@family.ca" }],
    tests: [stopped("a1", T0 - 2 * HOUR)],
  });

  it("a parent who unsubscribed, for any child or reminder", () => {
    const unsubscribed: LogEntry = { id: "u1", kind: "unsubscribe", parentId: "p1", childId: null, assessmentId: null, status: null, attempts: 0 };
    expect(dueReminders(due, T0).map((r) => r.parentId)).toEqual(["p1", "p2"]);
    expect(dueReminders({ ...due, log: [unsubscribed] }, T0).map((r) => r.childId)).toEqual(["c2"]);
  });

  it("an address that cannot get email (reserved test domains)", () => {
    for (const email of ["qa73-a@example.com", "a@sub.example.org", "a@example.net", "a@x.test", "a@x.invalid", "a@x.example", "a@localhost"]) {
      const s = { ...due, parents: [{ id: "p1", email }, { id: "p2", email: "sam@family.ca" }] };
      expect(dueReminders(s, T0).map((r) => r.parentId), email).toEqual(["p2"]);
    }
    for (const email of ["a@myexample.com", "a@example.ca", "delivered+qa73@resend.dev", "a@testing.org"]) {
      const s = { ...due, parents: [{ id: "p1", email }, { id: "p2", email: "sam@family.ca" }] };
      expect(dueReminders(s, T0).map((r) => r.parentId), email).toEqual(["p1", "p2"]);
    }
  });
});

describe("a reminder that did not go", () => {
  const s = (entry: LogEntry) => state({ tests: [stopped("a1", T0)], log: [entry] });

  it("is due again after a failed send, as a retry of its log row", () => {
    const failed = sent("continue", "a1", "failed", 1);
    expect(dueReminders(s(failed), T0 + 2 * HOUR)).toEqual([
      { kind: "continue", parentId: "p1", childId: "c1", assessmentId: "a1", dueAt: T0 + HOUR, retry: { logId: failed.id, attempts: 1 } },
    ]);
  });

  it("is given up after 3 failed sends", () => {
    expect(dueReminders(s(sent("continue", "a1", "failed", 3)), T0 + 2 * HOUR)).toEqual([]);
  });

  it("is not due while another run holds it, or when a run stopped before it knew whether the email went", () => {
    expect(dueReminders(s(sent("continue", "a1", "claimed")), T0 + 2 * HOUR)).toEqual([]);
  });
});

// The job (runReminders) against an in-memory store that keeps the database's guard: one log row per reminder (a
// unique index), so a claim that another run made first fails, and a retry takes a failed row only once.
describe("the reminder job", () => {
  type Row = LogEntry & { hash: string | null; emailId: string | null };

  function memoryStore(base: ReminderState) {
    const rows: Row[] = [];
    const tick = () => new Promise((r) => setTimeout(r, 0));
    const store: ReminderStore<ReminderState> = {
      async load() {
        await tick();
        return { ...base, log: rows.map((r) => ({ ...r })) };
      },
      async claim(r, hash) {
        await tick();
        if (r.retry) {
          const row = rows.find((x) => x.id === r.retry!.logId && x.status === "failed" && x.attempts === r.retry!.attempts);
          if (!row) return null;
          Object.assign(row, { status: "claimed", attempts: row.attempts + 1, hash });
          return row.id;
        }
        if (rows.some((x) => x.kind === r.kind && (r.assessmentId ? x.assessmentId === r.assessmentId : x.childId === r.childId))) return null;
        const row: Row = { id: `l${rows.length + 1}`, kind: r.kind, parentId: r.parentId, childId: r.childId, assessmentId: r.assessmentId, status: "claimed", attempts: 1, hash, emailId: null };
        rows.push(row);
        return row.id;
      },
      async sent(id, emailId) {
        Object.assign(rows.find((x) => x.id === id)!, { status: "sent", emailId });
      },
      async failed(id) {
        rows.find((x) => x.id === id)!.status = "failed";
      },
    };
    return { store, rows };
  }

  let n = 0;
  const newToken = () => ({ token: `t${++n}`, hash: `hash-of-t${n}` });
  /** Two reminders due at T0: "continue" for c1 and "start" for c2. */
  const base = state({
    children: [{ id: "c1", parentId: "p1", createdAt: T0 - 3 * DAY }, { id: "c2", parentId: "p1", createdAt: T0 - DAY }],
    tests: [stopped("a1", T0 - 2 * HOUR)],
  });

  it("sends each due reminder once when two runs overlap", async () => {
    const { store, rows } = memoryStore(base);
    const emails: string[] = [];
    const send = async (r: DueReminder) => {
      emails.push(`${r.kind}:${r.childId}`);
      return { sent: true as const, id: `re_${emails.length}` };
    };
    const [one, two] = await Promise.all([runReminders(store, T0, { send, newToken }), runReminders(store, T0, { send, newToken })]);
    expect(emails.sort()).toEqual(["continue:c1", "start:c2"]);
    expect(one.sent + two.sent).toBe(2);
    expect(one.busy + two.busy).toBe(2);
    expect(rows.map((r) => r.status)).toEqual(["sent", "sent"]);
  });

  it("sends nothing again on the next run", async () => {
    const { store } = memoryStore(base);
    const send = async () => ({ sent: true as const, id: "re_1" });
    expect(await runReminders(store, T0, { send, newToken })).toMatchObject({ due: 2, sent: 2 });
    expect(await runReminders(store, T0 + 15 * MIN, { send, newToken })).toMatchObject({ due: 0, sent: 0 });
  });

  it("puts the unsubscribe token in the email whose hash the log keeps", async () => {
    const { store, rows } = memoryStore(base);
    const tokens: string[] = [];
    await runReminders(store, T0, { newToken, send: async (_r, token) => (tokens.push(token), { sent: true as const, id: "re" }) });
    expect(rows.map((r) => r.hash)).toEqual(tokens.map((t) => `hash-of-${t}`));
  });

  it("tries a refused send again on the next runs, and gives up after 3 tries", async () => {
    const { store, rows } = memoryStore({ ...base, children: [base.children[0]] });
    let tries = 0;
    const send = async () => (tries++, { sent: false as const, error: "Resend answered 500" });
    for (let i = 0; i < 5; i++) await runReminders(store, T0 + i * 15 * MIN, { send, newToken });
    expect(tries).toBe(3);
    expect(rows).toMatchObject([{ kind: "continue", status: "failed", attempts: 3 }]);
  });

  it("does not send again when a send ended without an answer: the email may have gone", async () => {
    const { store, rows } = memoryStore({ ...base, children: [base.children[0]] });
    let tries = 0;
    const send = async (): Promise<SendOutcome> => {
      tries++;
      throw new Error("timeout");
    };
    expect(await runReminders(store, T0, { send, newToken })).toMatchObject({ unknown: 1 });
    await runReminders(store, T0 + 15 * MIN, { send, newToken });
    expect(tries).toBe(1);
    expect(rows).toMatchObject([{ status: "claimed" }]);
  });

  it("sends at most `limit` in one run; the next run sends the rest", async () => {
    const { store } = memoryStore(base);
    const send = async () => ({ sent: true as const, id: "re" });
    expect(await runReminders(store, T0, { send, newToken, limit: 1 })).toMatchObject({ due: 2, sent: 1 });
    expect(await runReminders(store, T0 + 15 * MIN, { send, newToken, limit: 1 })).toMatchObject({ due: 1, sent: 1 });
  });
});
