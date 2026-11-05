import { describe, expect, it, vi } from "vitest";
import { memoryTransport } from "@/lib/email-delivery-memory";
import type { CallNote } from "@/lib/maya-call-note";
import { memoryWeeklyStore } from "@/lib/maya-weekly-email-memory";
import { dueWeeklyEmails, runWeeklyEmails, type WeeklyChild, type WeeklyParent } from "@/lib/maya-weekly-email";
import { MAX_SEND_ATTEMPTS } from "@/lib/reminders";
import { newToken } from "@/lib/sign-in-link";

vi.mock("server-only", () => ({}));

// The weekly Maya email (#332) through its public run and store interfaces.
const ORIGIN = "https://unicalearning.com";
const priya: WeeklyParent = { id: "p1", name: "Priya Shah", email: "priya@family.ca", postal: "V3S 1A1" };
const leah: WeeklyChild = { id: "c1", parentId: "p1", firstName: "Leah" };
const sam: WeeklyChild = { id: "c2", parentId: "p1", firstName: "Sam" };

/** 2026-11-02 at hh:mm in Vancouver (permanent PDT, UTC-7). */
const pdt = (day: number, hh: number, mm = 0) => Date.UTC(2026, 10, day, hh + 7, mm);

let n = 0;
function note(over: Partial<CallNote> & { endedAt: number }): CallNote {
  const { endedAt, ...rest } = over;
  return {
    callId: `call-${++n}`,
    parentId: "p1",
    childId: "c1",
    noteVersion: 1,
    callEndedAt: new Date(endedAt).toISOString(),
    createdAt: new Date(endedAt + 1000).toISOString(),
    facts: { question: { source: "workbook", page: 23, number: 4, text: null }, finished: "with_help", reason: "solved", help: "hint", stuckOn: "adding the tens and carrying", paper: "child_confirmed", minutes: 6, safety: false },
    sentences: ["{child} called Maya about page 23, question 4.", "{child} got stuck on adding the tens and carrying.", "{child} finished it after a small hint."],
    warm: null,
    writer: "code",
    model: null,
    promptVersion: null,
    transcript: [
      { speaker: "maya", text: "Hi {child}, I'm Maya, an AI teaching assistant.", second: 0 },
      { speaker: "child", text: "I don't get the tens <b>", second: 5 },
      { speaker: "note", text: "Writing on paper.", second: 60 },
    ],
    ...rest,
  };
}

function setup(notes: CallNote[], parents: WeeklyParent[] = [priya], children: WeeklyChild[] = [leah, sam]) {
  const store = memoryWeeklyStore({ parents, children, notes });
  const mail = memoryTransport();
  const run = (now: number) => runWeeklyEmails(store, now, { origin: ORIGIN, newToken, transport: mail.transport });
  return { store, mail, run };
}

const tokenOf = (text: string) => /\/unsubscribe\?t=([A-Za-z0-9_-]+)/.exec(text)![1];

describe("D-283: the email carries no words from a call", () => {
  it("sends a count per child and a sign-in link to each child's notes, never the transcript or the note's sentences", async () => {
    const { store, mail, run } = setup([
      note({ endedAt: pdt(2, 15, 30), warm: "w1" }),
      note({ endedAt: pdt(3, 10) }),
      note({ childId: "c2", endedAt: pdt(8, 18, 5), transcript: [{ speaker: "child", text: "my secret is 42", second: 3 }] }),
    ]);
    await run(pdt(9, 7));
    const m = mail.delivered[0];
    expect(m.text).toContain("Sam and Leah had 3 calls with Maya, our AI teaching assistant, from Monday, November 2 to Sunday, November 8.");
    expect(m.text).toContain(`Sam had 1 call. Read Sam's notes from Maya: ${ORIGIN}/sign-in?next=%2Faccount%2Fnotes%2Fc2`);
    expect(m.text).toContain(`Leah had 2 calls. Read Leah's notes from Maya: ${ORIGIN}/sign-in?next=%2Faccount%2Fnotes%2Fc1`);
    expect(m.text).toContain("To keep your family's calls private, this email does not include what was said. Sign in to read each note.");
    expect(m.html).toContain(`href="${ORIGIN}/sign-in?next=%2Faccount%2Fnotes%2Fc1"`);
    expect(m.html).toContain(`href="${ORIGIN}/sign-in?next=%2Faccount%2Fnotes%2Fc2"`);
    // The copy kept of the email (email_copies) is the same message: nothing from the calls in it either.
    expect(store.copies[0].copy.message.text).toBe(m.text);
    for (const body of [m.text, m.html, store.copies[0].copy.message.html]) {
      for (const words of ["I don't get the tens", "I don&#39;t get the tens", "my secret is 42", "Writing on paper", "I'm Maya", "What was said", "page 23", "got stuck", "adding the tens"]) expect(body).not.toContain(words);
    }
  });

  it("tells the parent to read a note when Maya stopped a call for safety, without its words", async () => {
    const { mail, run } = setup([note({
      endedAt: pdt(2, 15),
      facts: { ...note({ endedAt: 0 }).facts, safety: true, finished: "not_finished", reason: "safety" },
      sentences: ["{child} called Maya about page 23, question 4.", "Something {child} said made Maya stop the math.", "She told {child} to talk to a grown-up they trust.", "Please read the call below."],
    })]);
    await run(pdt(9, 7));
    const { text, html } = mail.delivered[0];
    expect(text).toContain("Maya stopped the math in 1 of Leah's calls because of something Leah said. Please read the note.");
    expect(html).toContain("Maya stopped the math in 1 of Leah&#39;s calls because of something Leah said. Please read the note.");
    expect(text).not.toContain("Please read the call below.");
  });
});

describe("chat recap coverage", () => {
  it("counts a chat only under the existing family, note, coverage and time rules", () => {
    const n = note({ endedAt: pdt(8, 16) });
    const call = { callId: n.callId, parentId: n.parentId, childId: n.childId, endedAt: n.callEndedAt, notePending: false, kind: "chat" };
    const state = { parents: [priya], children: [leah], notes: [n], calls: [call], log: [] };
    expect(dueWeeklyEmails(state, pdt(9, 8))).toHaveLength(1);
    expect(dueWeeklyEmails({ ...state, parents: [{ ...priya, test: true }] }, pdt(9, 8))).toHaveLength(0);
    expect(dueWeeklyEmails({ ...state, notes: [], calls: [{ ...call, notePending: true }] }, pdt(9, 8))).toHaveLength(0);
  });
});

describe("one email per parent per week", () => {
  it("sends one email for two calls across two children and days, on the next Monday", async () => {
    const { store, mail, run } = setup([note({ endedAt: pdt(2, 15, 30) }), note({ childId: "c2", endedAt: pdt(8, 18, 5), facts: { ...note({ endedAt: 0 }).facts, minutes: 1 } })]);
    expect(await run(pdt(9, 7))).toEqual({ due: 1, sent: 1, failed: 0, busy: 0, unknown: 0 });
    expect(mail.delivered).toHaveLength(1);
    const m = mail.delivered[0];
    expect(m.to).toBe("priya@family.ca");
    expect(m.sender).toEqual({ to: "parent" });
    expect(m.replyTo).toBe("contact@unicalearning.com");
    expect(m.subject).toBe("Maya this week: Sam and Leah");
    expect(m.text).toContain("Hi Priya,");
    expect(m.text).toContain("Sam and Leah had 2 calls with Maya, our AI teaching assistant, from Monday, November 2 to Sunday, November 8.");
    expect(m.text).toContain("Sam had 1 call. Read Sam's notes from Maya:");
    expect(m.text).toContain("Leah had 1 call. Read Leah's notes from Maya:");
    expect(m.text).not.toContain("{child}");
    expect(m.text).not.toContain("I don't get the tens");
    expect(m.html).not.toContain("<b>");
    // One claim row for (parent, week start), sent, and a copy kept.
    expect(store.rows()).toMatchObject([{ kind: "maya_weekly", parentId: "p1", weekStart: "2026-11-02", status: "sent", attempts: 1 }]);
    expect(store.copies).toHaveLength(1);
    expect(store.copies[0].copy.outcome).toBe("sent");
    // A later run sends nothing more for that week.
    expect(await run(pdt(9, 9))).toMatchObject({ due: 0, sent: 0 });
    expect(mail.delivered).toHaveLength(1);
  });

  it("with one child, says how many in the intro and links once to the child's notes", async () => {
    const { mail, run } = setup([note({ endedAt: pdt(2, 9) }), note({ endedAt: pdt(2, 16) })]);
    await run(pdt(9, 8));
    const m = mail.delivered[0];
    expect(m.subject).toBe("Maya this week: Leah");
    expect(m.text).toContain("Leah had 2 calls with Maya");
    expect(m.text).toContain(`\n\nRead Leah's notes from Maya: ${ORIGIN}/sign-in?next=%2Faccount%2Fnotes%2Fc1`);
    expect(m.text).not.toContain("Leah had 2 calls.");
    expect(m.text.match(/notes%2Fc1/g)).toHaveLength(1);
  });

  it("waits until Monday at 7 a.m. in the family's time zone", async () => {
    const { mail, run } = setup([note({ endedAt: pdt(2, 15) })]);
    expect(await run(pdt(2, 23, 59))).toMatchObject({ due: 0 });
    expect(await run(pdt(9, 6, 59))).toMatchObject({ due: 0 });
    expect(await run(pdt(9, 7))).toMatchObject({ due: 1, sent: 1 });
    expect(mail.delivered).toHaveLength(1);
  });

  it("uses local Monday midnight to split weeks, including a late Sunday call", async () => {
    const toronto: WeeklyParent = { ...priya, postal: "M5V 2T6" };
    const sunday = note({ endedAt: Date.parse("2026-11-09T04:59:59Z") });
    const monday = note({ endedAt: Date.parse("2026-11-09T05:00:00Z") });
    const { store, mail, run } = setup([sunday, monday], [toronto]);
    expect(await run(Date.parse("2026-11-09T12:00:00Z"))).toMatchObject({ due: 1, sent: 1 });
    expect(mail.delivered[0].text).toContain("Leah had 1 call with Maya");
    expect(store.rows()[0].callIds).toEqual([sunday.callId]);
    expect(await run(Date.parse("2026-11-16T12:00:00Z"))).toMatchObject({ due: 1, sent: 1 });
    expect(mail.delivered[1].text).toContain("Leah had 1 call with Maya");
    expect(store.rows()[1].callIds).toEqual([monday.callId]);
  });

  it.each([
    ["Pacific", "V3S 1A1", "2026-11-09T14:00:00Z"],
    ["Eastern", "M5V 2T6", "2026-11-09T12:00:00Z"],
    ["Alberta", "T2P 1J9", "2026-11-09T13:00:00Z"],
    ["Newfoundland", "A1A 1A1", "2026-11-09T10:30:00Z"],
    ["unknown postal", null, "2026-11-09T14:00:00Z"],
  ])("waits for Monday 7 a.m. in %s", async (_, postal, release) => {
    const { run } = setup([note({ endedAt: pdt(4, 15) })], [{ ...priya, postal }]);
    const at = Date.parse(release);
    expect(await run(at - 1)).toMatchObject({ due: 0, sent: 0 });
    expect(await run(at)).toMatchObject({ due: 1, sent: 1 });
  });

  it.each([
    ["permanent BC November", "2026-10-26T07:00:00Z", "2026-11-02T06:59:59Z", "2026-11-02T07:00:00Z", "2026-11-02T14:00:00Z"],
    ["spring", "2026-03-02T08:00:00Z", "2026-03-09T06:59:59Z", "2026-03-09T07:00:00Z", "2026-03-09T14:00:00Z"],
  ])("includes the whole week across the %s daylight saving change", async (_, start, end, next, release) => {
    const first = note({ endedAt: Date.parse(start) });
    const last = note({ endedAt: Date.parse(end) });
    const { store, run, mail } = setup([note({ endedAt: Date.parse(release) - 14 * 86_400_000 - 1 }), first, last, note({ endedAt: Date.parse(next) })]);
    expect(await run(Date.parse(release) - 1)).toMatchObject({ sent: 0 });
    expect(await run(Date.parse(release))).toMatchObject({ sent: 1 });
    expect(mail.delivered[0].text).toContain("Leah had 2 calls with Maya");
    expect(store.rows()[0].callIds).toEqual([last.callId, first.callId]);
  });

  it("sends late recaps inside the lookback window, then expires uncovered calls", async () => {
    const calls = [note({ endedAt: pdt(2, 15) })];
    expect(await setup(calls).run(pdt(15, 23, 59))).toMatchObject({ sent: 1 });
    expect(await setup(calls).run(pdt(16, 15, 1))).toMatchObject({ due: 0, sent: 0 });
    const { run, mail } = setup(calls);
    mail.answerNext("refuse");
    expect(await run(pdt(9, 7))).toMatchObject({ failed: 1 });
    expect(await run(pdt(16, 15, 1))).toMatchObject({ due: 0 });
  });

  it("counts every call of the family, per child, newest child first", async () => {
    const calls = Array.from({ length: 13 }, (_, i) => note({ endedAt: pdt(2, i), childId: i % 2 ? "c2" : "c1" }));
    const { run, mail } = setup(calls);
    expect(await run(pdt(9, 7))).toMatchObject({ sent: 1 });
    const m = mail.delivered[0];
    expect(m.subject).toBe("Maya this week: Leah and Sam");
    expect(m.text).toContain("Leah and Sam had 13 calls with Maya");
    expect(m.text).toContain("Leah had 7 calls.");
    expect(m.text).toContain("Sam had 6 calls.");
    expect(m.text.indexOf("Leah had 7 calls.")).toBeLessThan(m.text.indexOf("Sam had 6 calls."));
  });

});

describe("R421W-1: delayed notes", () => {
  const completed = (n: CallNote, notePending = false, kind = "family") => ({ callId: n.callId, parentId: n.parentId, childId: n.childId, endedAt: n.callEndedAt, notePending, kind });

  it("does not claim ten notes for eleven calls, then sends once after the final note arrives", async () => {
    const notes = Array.from({ length: 10 }, (_, i) => note({ endedAt: pdt(2, i) }));
    const late = note({ endedAt: pdt(8, 18), sentences: ["The delayed note."] });
    const calls = [...notes.map((n) => completed(n)), completed(late, true)];
    const store = memoryWeeklyStore({ parents: [priya], children: [leah, sam], notes, calls });
    const mail = memoryTransport();
    const run = (now: number) => runWeeklyEmails(store, now, { origin: ORIGIN, newToken, transport: mail.transport });
    expect(await run(pdt(9, 7))).toMatchObject({ due: 0, sent: 0 });
    expect(store.rows()).toEqual([]);
    notes.push(late);
    calls[10].notePending = false;
    expect(await run(pdt(9, 8))).toMatchObject({ due: 1, sent: 1 });
    expect(mail.delivered[0].text).toContain("had 11 calls with Maya");
    expect(mail.delivered[0].text).not.toContain("no note yet");
    expect(store.rows()[0].callIds).toContain(late.callId);
    expect(await run(pdt(9, 9))).toMatchObject({ due: 0 });
  });

  it.each([0, 1, 11])("on the last local day, counts two calls without notes alongside %s saved notes", async (savedCount) => {
    const notes = Array.from({ length: savedCount }, (_, i) => note({ endedAt: pdt(2, i) }));
    const missing = [note({ endedAt: pdt(8, 12), childId: "c2" }), note({ endedAt: pdt(8, 13), childId: "c2" })];
    const calls = [...notes.map((n) => completed(n)), ...missing.map((n) => completed(n, true))];
    const store = memoryWeeklyStore({ parents: [priya], children: [leah, sam], notes, calls });
    const mail = memoryTransport();
    const run = (now: number) => runWeeklyEmails(store, now, { origin: ORIGIN, newToken, transport: mail.transport });
    expect(await run(pdt(14, 23, 59))).toMatchObject({ due: 0 });
    expect(store.rows()).toEqual([]);
    expect(await run(pdt(15, 0))).toMatchObject({ sent: 1 });
    const m = mail.delivered[0];
    expect(m.subject).toContain("Sam");
    expect(m.text).toContain(`had ${savedCount + 2} calls with Maya`);
    expect(m.text).toContain("2 calls this week have no note yet.");
    expect(m.html).toContain("2 calls this week have no note yet.");
    expect(await run(pdt(16, 15, 1))).toMatchObject({ due: 0 });
  });

  it("does not send an incomplete recap after expiry", async () => {
    const missing = note({ endedAt: pdt(2, 8) });
    const store = memoryWeeklyStore({ parents: [priya], children: [leah], notes: [], calls: [completed(missing, true)] });
    expect(await runWeeklyEmails(store, pdt(16, 0), { origin: ORIGIN, newToken })).toMatchObject({ due: 0 });
    expect(store.rows()).toEqual([]);
  });
});

describe("R421W-5: test calls and test families", () => {
  const ended = (n: CallNote, kind: string) => ({ callId: n.callId, parentId: n.parentId, childId: n.childId, endedAt: n.callEndedAt, notePending: false, kind });

  it("never sends a recap for an admin test call, even on the last local day", async () => {
    const test = note({ endedAt: pdt(2, 9) });
    const store = memoryWeeklyStore({ parents: [priya], children: [leah], notes: [], calls: [ended(test, "admin_test")] });
    for (const at of [pdt(9, 8), pdt(15, 0)]) expect(await runWeeklyEmails(store, at, { origin: ORIGIN, newToken })).toMatchObject({ due: 0, sent: 0 });
    expect(store.rows()).toEqual([]);
  });

  it("leaves an admin test call out of a family week's count", async () => {
    const family = note({ endedAt: pdt(2, 9) });
    const test = note({ endedAt: pdt(3, 9) });
    const store = memoryWeeklyStore({ parents: [priya], children: [leah], notes: [family], calls: [ended(family, "family"), ended(test, "admin_test")] });
    const mail = memoryTransport();
    expect(await runWeeklyEmails(store, pdt(9, 8), { origin: ORIGIN, newToken, transport: mail.transport })).toMatchObject({ sent: 1 });
    expect(mail.delivered[0].text).toContain("had 1 call with Maya");
    expect(mail.delivered[0].text).not.toContain("no note yet");
  });

  it("never emails a test family", async () => {
    const family = note({ endedAt: pdt(2, 9) });
    const store = memoryWeeklyStore({ parents: [{ ...priya, test: true }], children: [leah], notes: [family], calls: [ended(family, "family")] });
    expect(await runWeeklyEmails(store, pdt(9, 8), { origin: ORIGIN, newToken })).toMatchObject({ due: 0, sent: 0 });
  });
});

describe("no-call weeks", () => {
  it("send nothing", async () => {
    const { store, mail, run } = setup([note({ endedAt: pdt(2, 15) })]);
    await run(pdt(9, 7));
    // The next two weeks have no calls.
    expect(await run(pdt(16, 8))).toMatchObject({ due: 0, sent: 0 });
    expect(await run(pdt(23, 8))).toMatchObject({ due: 0, sent: 0 });
    expect(mail.delivered).toHaveLength(1);
    expect(store.rows()).toHaveLength(1);
  });

  it("send nothing to a family without calls", async () => {
    const other: WeeklyParent = { id: "p2", name: "Ana", email: "ana@family.ca", postal: null };
    const { mail, run } = setup([], [priya, other]);
    expect(await run(pdt(9, 8))).toMatchObject({ due: 0 });
    expect(mail.delivered).toHaveLength(0);
  });

  it("send nothing to an address that cannot get email", async () => {
    const { run } = setup([note({ endedAt: pdt(2, 15) })], [{ ...priya, email: "leah@example.com" }]);
    expect(await run(pdt(9, 8))).toMatchObject({ due: 0 });
  });
});

describe("unsubscribe", () => {
  it("has a link and one-click headers, and the link stops the email", async () => {
    const { store, mail, run } = setup([note({ endedAt: pdt(2, 15) }), note({ endedAt: pdt(9, 15) })]);
    await run(pdt(9, 7));
    const m = mail.delivered[0];
    const token = tokenOf(m.text);
    expect(m.text).toContain(`Turn off these Maya emails: ${ORIGIN}/unsubscribe?t=${token}`);
    expect(m.html).toContain(`${ORIGIN}/unsubscribe?t=${token}`);
    expect(m.headers).toEqual({ "List-Unsubscribe": `<${ORIGIN}/api/unsubscribe?t=${token}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
    // CASL footer: business name, mailing address, website, why.
    expect(m.text).toContain("16557 87A Ave");
    expect(m.text).toContain("unicalearning.com");
    expect(m.text).toContain("You get one Maya email each week when your family has calls with Maya.");

    expect(store.unsubscribe(token)).toBe("unsubscribed");
    expect(store.unsubscribe(token)).toBe("unsubscribed");
    expect(await run(pdt(16, 7))).toMatchObject({ due: 0, sent: 0 });
    expect(mail.delivered).toHaveLength(1);
  });

  it("does nothing for a token we did not send", async () => {
    const { store } = setup([]);
    expect(store.unsubscribe(newToken().token)).toBe("unknown");
  });
});

describe("delivery outcomes follow the delivery module", () => {
  it("refused: a later run tries again, up to the attempt limit", async () => {
    const { store, mail, run } = setup([note({ endedAt: pdt(2, 15) })]);
    mail.answerNext(...Array(MAX_SEND_ATTEMPTS).fill("refuse"));
    for (let i = 1; i <= MAX_SEND_ATTEMPTS; i++) {
      expect(await run(pdt(9, 7 + i))).toMatchObject({ due: 1, failed: 1 });
      expect(store.rows()[0]).toMatchObject({ status: "failed", attempts: i });
    }
    expect(await run(pdt(9, 20))).toMatchObject({ due: 0 });
    expect(mail.delivered).toHaveLength(0);
    expect(store.copies.map((c) => c.copy.outcome)).toEqual(["refused"]);
  });

  it("refused once, then sent on the next run", async () => {
    const { store, mail, run } = setup([note({ endedAt: pdt(2, 15) })]);
    mail.answerNext("refuse");
    expect(await run(pdt(9, 7))).toMatchObject({ failed: 1 });
    expect(await run(pdt(9, 7, 15))).toMatchObject({ sent: 1 });
    expect(store.rows()).toMatchObject([{ status: "sent", attempts: 2 }]);
    expect(mail.delivered).toHaveLength(1);
  });

  it("unknown: the claim stays and nothing sends it again", async () => {
    const { store, mail, run } = setup([note({ endedAt: pdt(2, 15) })]);
    mail.answerNext("lose_answer");
    expect(await run(pdt(9, 7))).toMatchObject({ unknown: 1 });
    expect(store.rows()[0]).toMatchObject({ status: "claimed", attempts: 1 });
    expect(await run(pdt(9, 8))).toMatchObject({ due: 0 });
    expect(await run(pdt(10, 8))).toMatchObject({ due: 0 });
    expect(mail.delivered).toHaveLength(1);
  });

  it("two runs at once send one email", async () => {
    const { mail, run } = setup([note({ endedAt: pdt(2, 15) })]);
    const [a, b] = await Promise.all([run(pdt(9, 7)), run(pdt(9, 7))]);
    expect(a.sent + b.sent).toBe(1);
    expect(a.busy + b.busy).toBe(1);
    expect(mail.delivered).toHaveLength(1);
  });

  it("an email it cannot build (the child is not loaded) counts as failed and sends nothing", async () => {
    const { mail, run } = setup([note({ endedAt: pdt(2, 15) })], [priya], []);
    expect(await run(pdt(9, 7))).toMatchObject({ due: 1, failed: 1, sent: 0 });
    expect(mail.delivered).toHaveLength(0);
  });
});

describe("the decision", () => {
  it("lists every call of the week newest first", () => {
    const later = note({ endedAt: pdt(2, 18) });
    const earlier = note({ endedAt: pdt(2, 9) });
    const due = dueWeeklyEmails({ parents: [priya], children: [leah], calls: [later, earlier].map((n) => ({ callId: n.callId, parentId: n.parentId, childId: n.childId, endedAt: n.callEndedAt, notePending: false, kind: "family" })), notes: [later, earlier], log: [] }, pdt(9, 8));
    expect(due).toEqual([{ parentId: "p1", weekStart: "2026-11-02", zone: "America/Vancouver", callIds: [later.callId, earlier.callId], retry: null }]);
  });

});


describe("shared family time for the weekly recap", () => {
  it.each([
    ["BC browser", "America/Vancouver", "V3S 1A1", "BC", "2026-11-09T14:00:00Z", "2026-11-09T07:00:00Z", "2026-11-16T07:00:00Z"],
    ["Alberta postal", null, "T2P 1J9", "BC", "2026-11-09T13:00:00Z", "2026-11-09T06:00:00Z", "2026-11-16T06:00:00Z"],
    ["browser wins", "America/Toronto", "V3S 1A1", "BC", "2026-11-09T12:00:00Z", "2026-11-09T05:00:00Z", "2026-11-16T05:00:00Z"],
    ["invalid browser", "Not/AZone", "T2P 1J9", "BC", "2026-11-09T13:00:00Z", "2026-11-09T06:00:00Z", "2026-11-16T06:00:00Z"],
    ["province fallback", null, null, "AB", "2026-11-09T13:00:00Z", "2026-11-09T06:00:00Z", "2026-11-16T06:00:00Z"],
  ])("uses the same release, covered week, expiry and labels for %s", async (_, timeZone, postal, province, release, monday, expiry) => {
    const beforeMonday = Date.parse(monday) - 1000;
    const family = [{ ...priya, timeZone, postal }];
    const kids = [{ ...leah, province }];
    const notes = [note({ endedAt: beforeMonday }), note({ endedAt: beforeMonday + 1000 })];
    const { store, run, mail } = setup(notes, family, kids);
    expect(await run(Date.parse(release) - 1)).toMatchObject({ sent: 0 });
    expect(await run(Date.parse(release))).toMatchObject({ sent: 1 });
    expect(mail.delivered[0].text).toContain("from Monday, November 2 to Sunday, November 8.");
    expect(store.rows()[0].callIds).toEqual([notes[0].callId]);
    const previousWeekOnly = notes.slice(0, 1);
    expect(await setup(previousWeekOnly, family, kids).run(Date.parse(expiry) - 1)).toMatchObject({ sent: 1 });
    expect(await setup(previousWeekOnly, family, kids).run(Date.parse(expiry))).toMatchObject({ sent: 0 });
  });
});

it("R425M-1: covers every uncovered week in one period and claims all call IDs", async () => {
  const older = note({ endedAt: pdt(2, 15) });
  const newer = note({ endedAt: pdt(9, 15) });
  const { store, mail, run } = setup([older, newer]);
  expect(await run(pdt(16, 7))).toMatchObject({ sent: 1 });
  const text = mail.delivered[0].text;
  expect(text).toContain("Leah had 2 calls with Maya, our AI teaching assistant, from Monday, November 2 to Sunday, November 15.");
  expect(store.rows()[0].callIds).toEqual([newer.callId, older.callId]);
});
