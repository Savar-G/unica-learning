import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordAnswer, startAttempt } from "@/lib/assessment";
import type { EmailMessage, MailTransport } from "@/lib/email-delivery";
import { memoryLedger, memoryTransport } from "@/lib/email-delivery-memory";
import { resendTransport } from "@/lib/email-resend";
import { reminderMessage, type LoadedState } from "@/lib/reminder-store";
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
  type RunResult,
} from "@/lib/reminders";
import { hashToken, newToken } from "@/lib/sign-in-link";

vi.mock("server-only", () => ({}));

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
/** A log row for a reminder about test `assessmentId` (or child c1 for the start reminders), written at `at`. */
function sent(kind: ReminderKind, assessmentId: string | null, status: LogStatus = "sent", attempts = 1, at = T0): LogEntry {
  return { id: `l${++logId}`, kind, parentId: "p1", childId: "c1", assessmentId, status, attempts, at };
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

  it("is due until the second start reminder is due, which replaces it: one that never went does not go after it", () => {
    expect(dueReminders(signedUp, T0 + 3 * DAY - 1)).toMatchObject([{ kind: "start", dueAt: T0 + DAY }]);
    expect(dueReminders(signedUp, T0 + 3 * DAY)).toMatchObject([{ kind: "start_followup", dueAt: T0 + 3 * DAY }]);
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

describe("the second start reminder", () => {
  const signedUp = state({ children: [{ id: "c1", parentId: "p1", createdAt: T0 }] });
  const afterFirst = (at = T0 + DAY) => ({ ...signedUp, log: [sent("start", null, "sent", 1, at)] });

  it("is due exactly 3 days after the signup when the child has not started a test", () => {
    expect(dueReminders(afterFirst(), T0 + 3 * DAY - 1)).toEqual([]);
    expect(dueReminders(afterFirst(), T0 + 3 * DAY)).toEqual([
      { kind: "start_followup", parentId: "p1", childId: "c1", assessmentId: null, dueAt: T0 + 3 * DAY, retry: null },
    ]);
  });

  it("waits 2 days after the first one when the first went late", () => {
    const late = afterFirst(T0 + 3 * DAY - HOUR);
    expect(dueReminders(late, T0 + 5 * DAY - HOUR - 1)).toEqual([]);
    expect(dueReminders(late, T0 + 5 * DAY - HOUR)).toMatchObject([{ kind: "start_followup", dueAt: T0 + 5 * DAY - HOUR }]);
  });

  it("does not go when the child started a test after the first reminder, finished or not", () => {
    const open = stopped("a1", T0 + 2 * DAY);
    const finished: ReminderTest = { ...open, status: "completed", completedAt: T0 + 2 * DAY };
    expect(dueReminders({ ...afterFirst(), tests: [open] }, T0 + 3 * DAY).map((r) => r.kind)).not.toContain("start_followup");
    expect(dueReminders({ ...afterFirst(), tests: [finished] }, T0 + 3 * DAY)).toEqual([]);
  });

  it("goes once per child", () => {
    const both = { ...signedUp, log: [sent("start", null, "sent", 1, T0 + DAY), sent("start_followup", null, "sent", 1, T0 + 3 * DAY)] };
    expect(dueReminders(both, T0 + 4 * DAY)).toEqual([]);
  });

  it("is dropped when it is more than 7 days late, and the first one does not go in its place", () => {
    expect(dueReminders(afterFirst(), T0 + 3 * DAY + 7 * DAY)).toHaveLength(1);
    expect(dueReminders(afterFirst(), T0 + 3 * DAY + 7 * DAY + 1)).toEqual([]);
    expect(dueReminders(signedUp, T0 + 3 * DAY + 7 * DAY + 1)).toEqual([]);
  });

  it("does not go to a parent who unsubscribed after the first one", () => {
    const unsubscribed: LogEntry = { id: "u1", kind: "unsubscribe", parentId: "p1", childId: null, assessmentId: null, status: null, attempts: 0, at: T0 + 2 * DAY };
    expect(dueReminders({ ...afterFirst(), log: [...afterFirst().log, unsubscribed] }, T0 + 3 * DAY)).toEqual([]);
  });
});

describe("over the life of a test, with the job every 15 minutes", () => {
  /** Runs the decision every 15 minutes from `from` to `to`, logs each reminder as sent, and returns what went when. */
  function runEvery15Minutes(s: ReminderState, from: number, to: number, tests: (now: number) => ReminderTest[]) {
    const log: LogEntry[] = [...s.log];
    const out: { kind: ReminderKind; childId: string; at: number }[] = [];
    for (let now = from; now <= to; now += 15 * MIN) {
      for (const r of dueReminders({ ...s, tests: tests(now), log }, now)) {
        log.push({ id: `run-${log.length}`, kind: r.kind, parentId: r.parentId, childId: r.childId, assessmentId: r.assessmentId, status: "sent", attempts: 1, at: now });
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

  it("sends nothing about a test the child finished, before or after it would have expired", () => {
    // Stops at T0, comes back and finishes at T0 + 30 minutes; the 30-day retake wait follows.
    const finished: ReminderTest = { ...stopped("a1", T0), status: "completed", completedAt: T0 + 30 * MIN };
    const tests = (now: number) => [now < T0 + 30 * MIN ? stopped("a1", T0) : finished];
    expect(runEvery15Minutes(state(), T0, T0 + 40 * DAY, tests)).toEqual([]);
  });

  it("sends two start reminders, on day 1 and day 3, for a child who never starts", () => {
    const s = state({ children: [{ id: "c1", parentId: "p1", createdAt: T0 }] });
    expect(runEvery15Minutes(s, T0, T0 + 30 * DAY, () => [])).toEqual([
      { kind: "start", childId: "c1", at: T0 + DAY },
      { kind: "start_followup", childId: "c1", at: T0 + 3 * DAY },
    ]);
  });

  it("sends one start reminder for a child who starts on day 2", () => {
    const s = state({ children: [{ id: "c1", parentId: "p1", createdAt: T0 }] });
    const tests = (now: number) => (now < T0 + 2 * DAY ? [] : [{ ...stopped("a1", T0 + 2 * DAY), status: "completed" as const, completedAt: T0 + 2 * DAY }]);
    expect(runEvery15Minutes(s, T0, T0 + 30 * DAY, tests)).toEqual([{ kind: "start", childId: "c1", at: T0 + DAY }]);
  });
});

describe("who never gets a reminder", () => {
  const due = state({
    children: [{ id: "c1", parentId: "p1", createdAt: T0 - DAY }, { id: "c2", parentId: "p2", createdAt: T0 - DAY }],
    parents: [{ id: "p1", email: "priya@family.ca" }, { id: "p2", email: "sam@family.ca" }],
    tests: [stopped("a1", T0 - 2 * HOUR)],
  });

  it("a parent who unsubscribed, for any child or reminder", () => {
    const unsubscribed: LogEntry = { id: "u1", kind: "unsubscribe", parentId: "p1", childId: null, assessmentId: null, status: null, attempts: 0, at: T0 };
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

// The job (runReminders) sends through the parent email delivery module (#152). The in-memory transport stands in for
// Resend, and the in-memory ledger for the email log: one claim per reminder (the unique index), and a released claim
// that only one run can take again (the guarded retry). The store reads its log back from the ledger, as the real one
// reads public.email_log.
describe("the reminder job", () => {
  const ORIGIN = "https://unicalearning.com";
  /** The log row a reminder names: kind K for test or child Y. */
  const rowOf = (r: DueReminder) => `${r.kind}:${r.assessmentId ?? r.childId}`;
  /** The email log keeps an unknown send as claimed, and a refused one as failed. */
  const STATUS = { claimed: "claimed", unknown: "claimed", sent: "sent", refused: "failed" } as const;

  function memoryStore(base: LoadedState) {
    const book = memoryLedger<DueReminder>({ keyOf: rowOf });
    const named = new Map<string, DueReminder>();
    const tick = () => new Promise((r) => setTimeout(r, 0));
    /** The log rows, in the order they were first claimed. */
    const rows = () =>
      [...named.values()].map((r) => {
        const e = book.entry(r)!;
        return { row: e.key, status: STATUS[e.state], attempts: e.claims, hash: e.fields.unsubscribe_hash, emailId: e.emailId, error: e.error };
      });
    const store: ReminderStore<LoadedState> = {
      async load() {
        await tick();
        const log: LogEntry[] = [...named.values()].map((r) => {
          const e = book.entry(r)!;
          // The in-memory ledger keeps no time: a row counts as written when its reminder was due.
          return { id: e.key, kind: r.kind, parentId: r.parentId, childId: r.childId, assessmentId: r.assessmentId, status: STATUS[e.state], attempts: e.claims, at: r.dueAt };
        });
        return { ...base, log: [...base.log, ...log] };
      },
      ledger: {
        ...book.ledger,
        async claim(r, fields) {
          const handle = await book.ledger.claim(r, fields);
          // Busy or not, the row exists now.
          named.set(rowOf(r), r);
          return handle;
        },
      },
    };
    return { store, rows };
  }

  /** A transport that counts the sends that reach it. */
  function counted(transport: MailTransport) {
    const counter = { sends: 0, transport: { send: (m: EmailMessage) => (counter.sends++, transport.send(m)) } };
    return counter;
  }

  const run = (store: ReminderStore<LoadedState>, now: number, transport: MailTransport, limit?: number) =>
    runReminders(store, now, { newToken, message: (r, token, s) => reminderMessage(r, token, s, ORIGIN), transport, limit });
  const counts = (over: Partial<RunResult>): RunResult => ({ due: 0, sent: 0, failed: 0, busy: 0, unknown: 0, ...over });

  /** Which reminder an email is: "<child>:<kind>", from the start link in its text. */
  const whichReminder = (m: EmailMessage) => {
    const [, child, kind] = m.text.match(/\/account\/start\/(\w+)\?reminder=(\w+)/) ?? [];
    return `${child}:${kind}`;
  };

  /** Two reminders due at T0: "continue" for Maya (c1) and "start" for Arjun (c2). */
  const family: LoadedState = {
    parents: [{ id: "p1", email: "priya@family.ca", name: "Priya Shah", postal: "V3S 1A1" }],
    children: [
      { id: "c1", parentId: "p1", createdAt: T0 - 3 * DAY, firstName: "Maya", grade: 3 },
      { id: "c2", parentId: "p1", createdAt: T0 - DAY, firstName: "Arjun", grade: 5 },
    ],
    tests: [{ ...stopped("a1", T0 - 2 * HOUR), answered: 12, total: 36 }],
    log: [],
  };
  /** Only Maya's "continue" is due at T0. */
  const maya: LoadedState = { ...family, children: [family.children[0]] };

  let error: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    error = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    error.mockRestore();
    vi.unstubAllEnvs();
  });

  it("sends each due reminder once when two runs overlap", async () => {
    const { store, rows } = memoryStore(family);
    const mail = memoryTransport();
    const [one, two] = await Promise.all([run(store, T0, mail.transport), run(store, T0, mail.transport)]);
    expect(mail.delivered.map(whichReminder).sort()).toEqual(["c1:continue", "c2:start"]);
    for (const result of [one, two]) expect(result).toMatchObject({ due: 2, failed: 0, unknown: 0 });
    expect({ sent: one.sent + two.sent, busy: one.busy + two.busy }).toEqual({ sent: 2, busy: 2 });
    expect(rows().map((r) => r.status)).toEqual(["sent", "sent"]);
  });

  it("sends nothing again on the next run; the log keeps each email id", async () => {
    const { store, rows } = memoryStore(family);
    const mail = memoryTransport();
    expect(await run(store, T0, mail.transport)).toEqual(counts({ due: 2, sent: 2 }));
    expect(await run(store, T0 + 15 * MIN, mail.transport)).toEqual(counts({}));
    expect(mail.delivered).toHaveLength(2);
    expect(rows()).toMatchObject([
      { row: "continue:a1", status: "sent", attempts: 1, emailId: "email-1", error: null },
      { row: "start:c2", status: "sent", attempts: 1, emailId: "email-2", error: null },
    ]);
  });

  it("puts the unsubscribe token in the email, in the link and the one-click headers, whose hash the log keeps", async () => {
    const { store, rows } = memoryStore(family);
    const mail = memoryTransport();
    expect(await run(store, T0, mail.transport)).toEqual(counts({ due: 2, sent: 2 }));
    const tokens = mail.delivered.map((m) => {
      const [, inHeader] = m.headers?.["List-Unsubscribe"]?.match(/^<https:\/\/unicalearning\.com\/api\/unsubscribe\?t=([\w-]+)>$/) ?? [];
      const [, inLink] = m.text.match(/https:\/\/unicalearning\.com\/unsubscribe\?t=([\w-]+)/) ?? [];
      expect(m.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
      expect(inLink).toBe(inHeader);
      return inHeader;
    });
    expect(new Set(tokens).size).toBe(2);
    expect(rows().map((r) => r.hash)).toEqual(tokens.map((t) => hashToken(t)));
    expect(rows().every((r) => /^[0-9a-f]{64}$/.test(r.hash ?? ""))).toBe(true);
  });

  // Arjun (c2) was added a day before T0: the first start reminder is due at T0, the last one 2 days later.
  describe("the two start reminders and the unsubscribe link", () => {
    const arjun = () => ({ ...family, children: [family.children[1]], tests: [], log: [] as LogEntry[] });
    const tokenIn = (m: EmailMessage) => m.text.match(/\/unsubscribe\?t=([\w-]+)/)?.[1] ?? "";

    it("sends the last one on day 3, with its own unsubscribe link, when the parent did nothing", async () => {
      const { store, rows } = memoryStore(arjun());
      const mail = memoryTransport();
      expect(await run(store, T0, mail.transport)).toEqual(counts({ due: 1, sent: 1 }));
      expect(await run(store, T0 + 2 * DAY - 15 * MIN, mail.transport)).toEqual(counts({}));
      expect(await run(store, T0 + 2 * DAY, mail.transport)).toEqual(counts({ due: 1, sent: 1 }));
      expect(mail.delivered.map(whichReminder)).toEqual(["c2:start", "c2:start_followup"]);
      expect(mail.delivered[1].subject).toBe("Last reminder: Arjun's free math test");
      // The day-3 email's link names its own log row, so unsubscribing from it works too.
      expect(rows().map((r) => [r.row, r.hash])).toEqual([
        ["start:c2", hashToken(tokenIn(mail.delivered[0]))],
        ["start_followup:c2", hashToken(tokenIn(mail.delivered[1]))],
      ]);
    });

    it("sends nothing on day 3 when the parent unsubscribed with the link in the first one", async () => {
      const s = arjun();
      const { store, rows } = memoryStore(s);
      const mail = memoryTransport();
      await run(store, T0, mail.transport);
      // What the unsubscribe page does with the link (unsubscribe in reminder-store.ts): it finds the log row by the
      // token's hash, and writes one unsubscribe row for that row's parent.
      const row = rows().find((r) => r.hash === hashToken(tokenIn(mail.delivered[0])));
      expect(row?.row).toBe("start:c2");
      s.log.push({ id: "u1", kind: "unsubscribe", parentId: "p1", childId: null, assessmentId: null, status: null, attempts: 0, at: T0 + HOUR });
      for (let now = T0 + 15 * MIN; now <= T0 + 20 * DAY; now += 15 * MIN) expect(await run(store, now, mail.transport)).toEqual(counts({}));
      expect(mail.delivered.map(whichReminder)).toEqual(["c2:start"]);
    });
  });

  it("tries a refused send again on the next runs, and gives up after 3 tries", async () => {
    const { store, rows } = memoryStore(maya);
    const mail = memoryTransport();
    mail.answerNext("refuse", "refuse", "refuse", "refuse", "refuse");
    const net = counted(mail.transport);
    const results: RunResult[] = [];
    for (let i = 0; i < 5; i++) results.push(await run(store, T0 + i * 15 * MIN, net.transport));
    expect(results).toEqual([
      counts({ due: 1, failed: 1 }),
      counts({ due: 1, failed: 1 }),
      counts({ due: 1, failed: 1 }),
      counts({}),
      counts({}),
    ]);
    expect(net.sends).toBe(3);
    expect(mail.delivered).toEqual([]);
    expect(rows()).toEqual([
      { row: "continue:a1", status: "failed", attempts: 3, hash: expect.any(String), emailId: null, error: "Resend answered 422: refused in the test" },
    ]);
  });

  it("does not send again when a send ended without an answer: the email may have gone", async () => {
    const { store, rows } = memoryStore(maya);
    const mail = memoryTransport();
    mail.answerNext("no_answer");
    const net = counted(mail.transport);
    expect(await run(store, T0, net.transport)).toEqual(counts({ due: 1, unknown: 1 }));
    expect(await run(store, T0 + 15 * MIN, net.transport)).toEqual(counts({}));
    expect(net.sends).toBe(1);
    expect(rows()).toMatchObject([{ row: "continue:a1", status: "claimed", attempts: 1, error: expect.stringMatching(/^Resend delivery is unknown/) }]);
    expect(String(error.mock.calls[0]?.[0])).toMatch(/^\[reminders\] /);
  });

  // Through the Resend adapter, with the network a stub: the adapter decides what each answer means.
  describe("with Resend answering", () => {
    function resend(status: number, body: string) {
      vi.stubEnv("RESEND_API_KEY", "re_synthetic");
      vi.stubEnv("EMAIL_FROM", "Unica Learning <hello@unicalearning.com>");
      const requests: string[] = [];
      const fetch = (async (url: RequestInfo | URL) => (requests.push(String(url)), new Response(body, { status }))) as typeof globalThis.fetch;
      return { requests, transport: resendTransport({ fetch }) };
    }

    it.each([500, 503, 408])("counts a %i answer as unknown: the row stays claimed and the next run sends nothing", async (status) => {
      const { store, rows } = memoryStore(maya);
      const net = resend(status, "upstream error");
      expect(await run(store, T0, net.transport)).toEqual(counts({ due: 1, unknown: 1 }));
      expect(rows()).toMatchObject([{ row: "continue:a1", status: "claimed", attempts: 1, emailId: null, error: `Resend answered ${status}: upstream error` }]);
      expect(await run(store, T0 + 15 * MIN, net.transport)).toEqual(counts({}));
      expect(await run(store, T0 + 30 * MIN, net.transport)).toEqual(counts({}));
      expect(net.requests).toEqual(["https://api.resend.com/emails"]);
    });

    it("counts a 4xx answer as failed: the next run tries again", async () => {
      const { store, rows } = memoryStore(maya);
      const net = resend(422, "invalid recipient");
      expect(await run(store, T0, net.transport)).toEqual(counts({ due: 1, failed: 1 }));
      expect(rows()).toMatchObject([{ status: "failed", attempts: 1, error: "Resend answered 422: invalid recipient" }]);
      expect(await run(store, T0 + 15 * MIN, net.transport)).toEqual(counts({ due: 1, failed: 1 }));
      expect(net.requests).toHaveLength(2);
    });
  });

  it("sends at most `limit` in one run; the next run sends the rest", async () => {
    const { store } = memoryStore(family);
    const mail = memoryTransport();
    expect(await run(store, T0, mail.transport, 1)).toEqual(counts({ due: 2, sent: 1 }));
    expect(await run(store, T0 + 15 * MIN, mail.transport, 1)).toEqual(counts({ due: 1, sent: 1 }));
    expect(mail.delivered.map(whichReminder)).toEqual(["c1:continue", "c2:start"]);
  });
});
