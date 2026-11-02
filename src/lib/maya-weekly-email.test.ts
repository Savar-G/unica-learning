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

/** 2026-11-02 at hh:mm in Vancouver (PST, UTC-8, after the clocks changed on November 1). */
const pst = (day: number, hh: number, mm = 0) => Date.UTC(2026, 10, day, hh + 8, mm);

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

describe("one email per parent per week", () => {
  it("sends one email for two calls across two children and days, on the next Monday", async () => {
    const { store, mail, run } = setup([note({ endedAt: pst(2, 15, 30) }), note({ childId: "c2", endedAt: pst(8, 18, 5), facts: { ...note({ endedAt: 0 }).facts, minutes: 1 } })]);
    expect(await run(pst(9, 7))).toEqual({ due: 1, sent: 1, failed: 0, busy: 0, unknown: 0 });
    expect(mail.delivered).toHaveLength(1);
    const m = mail.delivered[0];
    expect(m.to).toBe("priya@family.ca");
    expect(m.sender).toEqual({ to: "parent" });
    expect(m.replyTo).toBe("contact@unicalearning.com");
    expect(m.subject).toBe("Maya this week: Sam and Leah");
    expect(m.text).toContain("Hi Priya,");
    expect(m.text).toContain("Sam and Leah had 2 calls with Maya, our AI teaching assistant, from Monday, November 2 to Sunday, November 8.");
    expect(m.text).toContain("Leah called Maya about page 23, question 4. Leah got stuck on adding the tens and carrying.");
    expect(m.text).toContain("Sam called Maya about page 23, question 4.");
    expect(m.text).toContain("Monday, November 2 · 3:30 p.m. · 6 minutes");
    expect(m.text).toContain("Sunday, November 8 · 6:05 p.m. · 1 minute");
    expect(m.text).toContain("Maya: Hi Leah, I'm Maya, an AI teaching assistant.");
    expect(m.text).toContain("Leah: I don't get the tens <b>");
    expect(m.text).not.toContain("{child}");
    // HTML: the child's words are escaped.
    expect(m.html).toContain("I don&#39;t get the tens &lt;b&gt;");
    expect(m.html).not.toContain("<b>");
    // One claim row for (parent, week start), sent, and a copy kept.
    expect(store.rows()).toMatchObject([{ kind: "maya_weekly", parentId: "p1", weekStart: "2026-11-02", status: "sent", attempts: 1 }]);
    expect(store.copies).toHaveLength(1);
    expect(store.copies[0].copy.outcome).toBe("sent");
    // A later run sends nothing more for that week.
    expect(await run(pst(9, 9))).toMatchObject({ due: 0, sent: 0 });
    expect(mail.delivered).toHaveLength(1);
  });

  it("labels each call by its day and time, newest first, and says how many in the intro", async () => {
    const { mail, run } = setup([note({ endedAt: pst(2, 9) }), note({ endedAt: pst(2, 16) })]);
    await run(pst(9, 8));
    const m = mail.delivered[0];
    expect(m.subject).toBe("Maya this week: Leah");
    expect(m.text).toContain("Leah had 2 calls with Maya");
    const later = m.text.indexOf("Monday, November 2 · 4:00 p.m. · 6 minutes");
    const earlier = m.text.indexOf("Monday, November 2 · 9:00 a.m. · 6 minutes");
    expect(later).toBeGreaterThan(-1);
    expect(earlier).toBeGreaterThan(later);
    expect(m.text).not.toMatch(/Call \d/);
  });

  it("waits until Monday at 7 a.m. in the family's time zone", async () => {
    const { mail, run } = setup([note({ endedAt: pst(2, 15) })]);
    expect(await run(pst(2, 23, 59))).toMatchObject({ due: 0 });
    expect(await run(pst(9, 6, 59))).toMatchObject({ due: 0 });
    expect(await run(pst(9, 7))).toMatchObject({ due: 1, sent: 1 });
    expect(mail.delivered).toHaveLength(1);
  });

  it("uses local Monday midnight to split weeks, including a late Sunday call", async () => {
    const toronto: WeeklyParent = { ...priya, postal: "M5V 2T6" };
    const { mail, run } = setup([
      note({ endedAt: Date.parse("2026-11-09T04:59:59Z"), sentences: ["Sunday call."] }),
      note({ endedAt: Date.parse("2026-11-09T05:00:00Z"), sentences: ["Monday call."] }),
    ], [toronto]);
    expect(await run(Date.parse("2026-11-09T12:00:00Z"))).toMatchObject({ due: 1, sent: 1 });
    expect(mail.delivered[0].text).toContain("Sunday call.");
    expect(mail.delivered[0].text).not.toContain("Monday call.");
    expect(await run(Date.parse("2026-11-16T12:00:00Z"))).toMatchObject({ due: 1, sent: 1 });
    expect(mail.delivered[1].text).toContain("Monday call.");
    expect(mail.delivered[1].text).not.toContain("Sunday call.");
  });

  it.each([
    ["Pacific", "V3S 1A1", "2026-11-09T15:00:00Z"],
    ["Eastern", "M5V 2T6", "2026-11-09T12:00:00Z"],
    ["Alberta", "T2P 1J9", "2026-11-09T14:00:00Z"],
    ["Newfoundland", "A1A 1A1", "2026-11-09T10:30:00Z"],
    ["unknown postal", null, "2026-11-09T15:00:00Z"],
  ])("waits for Monday 7 a.m. in %s", async (_, postal, release) => {
    const { run } = setup([note({ endedAt: pst(4, 15) })], [{ ...priya, postal }]);
    const at = Date.parse(release);
    expect(await run(at - 1)).toMatchObject({ due: 0, sent: 0 });
    expect(await run(at)).toMatchObject({ due: 1, sent: 1 });
  });

  it.each([
    ["fall", "2026-10-26T07:00:00Z", "2026-11-02T07:59:59Z", "2026-11-02T08:00:00Z", "2026-11-02T15:00:00Z"],
    ["spring", "2026-03-02T08:00:00Z", "2026-03-09T06:59:59Z", "2026-03-09T07:00:00Z", "2026-03-09T14:00:00Z"],
  ])("includes the whole week across the %s daylight saving change", async (_, start, end, next, release) => {
    const { run, mail } = setup([
      note({ endedAt: Date.parse(start) - 1, sentences: ["Before week."] }),
      note({ endedAt: Date.parse(start), sentences: ["First call."] }),
      note({ endedAt: Date.parse(end), sentences: ["Last call."] }),
      note({ endedAt: Date.parse(next), sentences: ["Next week."] }),
    ]);
    expect(await run(Date.parse(release) - 1)).toMatchObject({ sent: 0 });
    expect(await run(Date.parse(release))).toMatchObject({ sent: 1 });
    const text = mail.delivered[0].text;
    expect(text).toContain("First call.");
    expect(text).toContain("Last call.");
    expect(text).not.toContain("Before week.");
    expect(text).not.toContain("Next week.");
    expect(text.indexOf("Last call.")).toBeLessThan(text.indexOf("First call."));
  });

  it("sends late recaps within seven days, but never sends an older week", async () => {
    const calls = [note({ endedAt: pst(2, 15) })];
    expect(await setup(calls).run(pst(15, 23, 59))).toMatchObject({ sent: 1 });
    expect(await setup(calls).run(pst(16, 0))).toMatchObject({ due: 0, sent: 0 });
    const { run, mail } = setup(calls);
    mail.answerNext("refuse");
    expect(await run(pst(9, 7))).toMatchObject({ failed: 1 });
    expect(await run(pst(16, 0))).toMatchObject({ due: 0 });
  });

  it("shows the newest ten calls across the family and counts every other call", async () => {
    const calls = Array.from({ length: 13 }, (_, i) => note({
      endedAt: pst(2, i), childId: i % 2 ? "c2" : "c1",
      sentences: [`Unique call ${i}.`], transcript: [{ speaker: "child", text: `Words ${i}.`, second: 0 }],
    }));
    const { run, mail } = setup(calls);
    expect(await run(pst(9, 7))).toMatchObject({ sent: 1 });
    const m = mail.delivered[0];
    expect(m.subject).toBe("Maya this week: Leah and Sam");
    expect(m.text).toContain("had 13 calls with Maya");
    expect(m.text).toContain("There were 3 more calls this week. This email shows the newest 10.");
    expect(m.html).toContain("There were 3 more calls this week.");
    for (let i = 0; i < 13; i++) {
      if (i < 3) { expect(m.text).not.toContain(`Unique call ${i}.`); expect(m.html).not.toContain(`Words ${i}.`); }
      else { expect(m.text).toContain(`Unique call ${i}.`); expect(m.html).toContain(`Words ${i}.`); }
    }
    expect(m.text.indexOf("Unique call 12.")).toBeLessThan(m.text.indexOf("Unique call 10."));
    expect(m.text.indexOf("Unique call 11.")).toBeLessThan(m.text.indexOf("Unique call 9."));
  });

  it("keeps a child's name when their only call is outside the newest ten", async () => {
    const calls = [note({ endedAt: pst(2, 1), childId: "c2" }), ...Array.from({ length: 10 }, (_, i) => note({ endedAt: pst(3, i) }))];
    const { run, mail } = setup(calls);
    await run(pst(9, 7));
    expect(mail.delivered[0].subject).toBe("Maya this week: Leah and Sam");
    expect(mail.delivered[0].text).toContain("There was 1 more call this week.");
  });

});

describe("no-call weeks", () => {
  it("send nothing", async () => {
    const { store, mail, run } = setup([note({ endedAt: pst(2, 15) })]);
    await run(pst(9, 7));
    // The next two weeks have no calls.
    expect(await run(pst(16, 8))).toMatchObject({ due: 0, sent: 0 });
    expect(await run(pst(23, 8))).toMatchObject({ due: 0, sent: 0 });
    expect(mail.delivered).toHaveLength(1);
    expect(store.rows()).toHaveLength(1);
  });

  it("send nothing to a family without calls", async () => {
    const other: WeeklyParent = { id: "p2", name: "Ana", email: "ana@family.ca", postal: null };
    const { mail, run } = setup([], [priya, other]);
    expect(await run(pst(9, 8))).toMatchObject({ due: 0 });
    expect(mail.delivered).toHaveLength(0);
  });

  it("send nothing to an address that cannot get email", async () => {
    const { run } = setup([note({ endedAt: pst(2, 15) })], [{ ...priya, email: "leah@example.com" }]);
    expect(await run(pst(9, 8))).toMatchObject({ due: 0 });
  });
});

describe("unsubscribe", () => {
  it("has a link and one-click headers, and the link stops the email", async () => {
    const { store, mail, run } = setup([note({ endedAt: pst(2, 15) }), note({ endedAt: pst(9, 15) })]);
    await run(pst(9, 7));
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
    expect(await run(pst(16, 7))).toMatchObject({ due: 0, sent: 0 });
    expect(mail.delivered).toHaveLength(1);
  });

  it("does nothing for a token we did not send", async () => {
    const { store } = setup([]);
    expect(store.unsubscribe(newToken().token)).toBe("unknown");
  });
});

describe("delivery outcomes follow the delivery module", () => {
  it("refused: a later run tries again, up to the attempt limit", async () => {
    const { store, mail, run } = setup([note({ endedAt: pst(2, 15) })]);
    mail.answerNext(...Array(MAX_SEND_ATTEMPTS).fill("refuse"));
    for (let i = 1; i <= MAX_SEND_ATTEMPTS; i++) {
      expect(await run(pst(9, 7 + i))).toMatchObject({ due: 1, failed: 1 });
      expect(store.rows()[0]).toMatchObject({ status: "failed", attempts: i });
    }
    expect(await run(pst(9, 20))).toMatchObject({ due: 0 });
    expect(mail.delivered).toHaveLength(0);
    expect(store.copies.map((c) => c.copy.outcome)).toEqual(["refused"]);
  });

  it("refused once, then sent on the next run", async () => {
    const { store, mail, run } = setup([note({ endedAt: pst(2, 15) })]);
    mail.answerNext("refuse");
    expect(await run(pst(9, 7))).toMatchObject({ failed: 1 });
    expect(await run(pst(9, 7, 15))).toMatchObject({ sent: 1 });
    expect(store.rows()).toMatchObject([{ status: "sent", attempts: 2 }]);
    expect(mail.delivered).toHaveLength(1);
  });

  it("unknown: the claim stays and nothing sends it again", async () => {
    const { store, mail, run } = setup([note({ endedAt: pst(2, 15) })]);
    mail.answerNext("lose_answer");
    expect(await run(pst(9, 7))).toMatchObject({ unknown: 1 });
    expect(store.rows()[0]).toMatchObject({ status: "claimed", attempts: 1 });
    expect(await run(pst(9, 8))).toMatchObject({ due: 0 });
    expect(await run(pst(10, 8))).toMatchObject({ due: 0 });
    expect(mail.delivered).toHaveLength(1);
  });

  it("two runs at once send one email", async () => {
    const { mail, run } = setup([note({ endedAt: pst(2, 15) })]);
    const [a, b] = await Promise.all([run(pst(9, 7)), run(pst(9, 7))]);
    expect(a.sent + b.sent).toBe(1);
    expect(a.busy + b.busy).toBe(1);
    expect(mail.delivered).toHaveLength(1);
  });

  it("an email it cannot build (the child is not loaded) counts as failed and sends nothing", async () => {
    const { mail, run } = setup([note({ endedAt: pst(2, 15) })], [priya], []);
    expect(await run(pst(9, 7))).toMatchObject({ due: 1, failed: 1, sent: 0 });
    expect(mail.delivered).toHaveLength(0);
  });
});

describe("the decision", () => {
  it("lists every call of the week newest first", () => {
    const later = note({ endedAt: pst(2, 18) });
    const earlier = note({ endedAt: pst(2, 9) });
    const due = dueWeeklyEmails({ parents: [priya], children: [leah], notes: [later, earlier], log: [] }, pst(9, 8));
    expect(due).toEqual([{ parentId: "p1", weekStart: "2026-11-02", zone: "America/Vancouver", callIds: [later.callId, earlier.callId], retry: null }]);
  });

  it("a safety note keeps its own sentences", async () => {
    const { mail, run } = setup([note({
      endedAt: pst(2, 15),
      facts: { ...note({ endedAt: 0 }).facts, safety: true, finished: "not_finished", reason: "safety" },
      sentences: ["{child} called Maya about page 23, question 4.", "Something {child} said made Maya stop the math.", "She told {child} to talk to a grown-up they trust.", "Please read the call below."],
    })]);
    await run(pst(9, 7));
    expect(mail.delivered[0].text).toContain("Something Leah said made Maya stop the math. She told Leah to talk to a grown-up they trust. Please read the call below.");
  });
});
