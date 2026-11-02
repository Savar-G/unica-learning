import { describe, expect, it, vi } from "vitest";
import { memoryTransport } from "@/lib/email-delivery-memory";
import type { CallNote } from "@/lib/maya-call-note";
import { memoryDailyStore } from "@/lib/maya-daily-email-memory";
import { dueDailyEmails, LOOKBACK_DAYS, runDailyEmails, type DailyChild, type DailyParent } from "@/lib/maya-daily-email";
import { MAX_SEND_ATTEMPTS } from "@/lib/reminders";
import { newToken } from "@/lib/sign-in-link";

vi.mock("server-only", () => ({}));

// The daily Maya email (#332): one email per parent per day with calls, through the delivery module, the next morning.
const ORIGIN = "https://unicalearning.com";
const priya: DailyParent = { id: "p1", name: "Priya Shah", email: "priya@family.ca", postal: "V3S 1A1" };
const leah: DailyChild = { id: "c1", parentId: "p1", firstName: "Leah" };
const sam: DailyChild = { id: "c2", parentId: "p1", firstName: "Sam" };

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

function setup(notes: CallNote[], parents: DailyParent[] = [priya], children: DailyChild[] = [leah, sam]) {
  const store = memoryDailyStore({ parents, children, notes });
  const mail = memoryTransport();
  const run = (now: number) => runDailyEmails(store, now, { origin: ORIGIN, newToken, transport: mail.transport });
  return { store, mail, run };
}

const tokenOf = (text: string) => /\/unsubscribe\?t=([A-Za-z0-9_-]+)/.exec(text)![1];

describe("one email per parent per day", () => {
  it("sends one email for two calls on one day, across two children, the next morning", async () => {
    const { store, mail, run } = setup([note({ endedAt: pst(2, 15, 30) }), note({ childId: "c2", endedAt: pst(2, 18, 5), facts: { ...note({ endedAt: 0 }).facts, minutes: 1 } })]);
    expect(await run(pst(3, 7))).toEqual({ due: 1, sent: 1, failed: 0, busy: 0, unknown: 0 });
    expect(mail.delivered).toHaveLength(1);
    const m = mail.delivered[0];
    expect(m.to).toBe("priya@family.ca");
    expect(m.sender).toEqual({ to: "parent" });
    expect(m.replyTo).toBe("contact@unicalearning.com");
    expect(m.subject).toBe("Leah and Sam talked with Maya on Monday");
    expect(m.text).toContain("Hi Priya,");
    expect(m.text).toContain("Leah and Sam had calls with Maya, our AI teaching assistant, on Monday, November 2.");
    expect(m.text).toContain("Leah called Maya about page 23, question 4. Leah got stuck on adding the tens and carrying.");
    expect(m.text).toContain("Sam called Maya about page 23, question 4.");
    expect(m.text).toContain("Ended at 3:30 p.m., 6 minutes");
    expect(m.text).toContain("Ended at 6:05 p.m., 1 minute");
    expect(m.text).toContain("Maya: Hi Leah, I'm Maya, an AI teaching assistant.");
    expect(m.text).toContain("Leah: I don't get the tens <b>");
    expect(m.text).not.toContain("{child}");
    // HTML: the child's words are escaped.
    expect(m.html).toContain("I don&#39;t get the tens &lt;b&gt;");
    expect(m.html).not.toContain("<b>");
    // One claim row for (parent, day), sent, and a copy kept.
    expect(store.rows()).toMatchObject([{ kind: "maya_daily", parentId: "p1", day: "2026-11-02", status: "sent", attempts: 1 }]);
    expect(store.copies).toHaveLength(1);
    expect(store.copies[0].copy.outcome).toBe("sent");
    // A later run sends nothing more for that day.
    expect(await run(pst(3, 9))).toMatchObject({ due: 0, sent: 0 });
    expect(mail.delivered).toHaveLength(1);
  });

  it("numbers the calls of one child and says how many in the intro", async () => {
    const { mail, run } = setup([note({ endedAt: pst(2, 9) }), note({ endedAt: pst(2, 16) })]);
    await run(pst(3, 8));
    const m = mail.delivered[0];
    expect(m.subject).toBe("Leah talked with Maya on Monday");
    expect(m.text).toContain("Leah had 2 calls with Maya");
    expect(m.text).toContain("Call 1, ended at 9:00 a.m.");
    expect(m.text).toContain("Call 2, ended at 4:00 p.m.");
  });

  it("waits until the day is over and it is 7 a.m. in the family's time zone", async () => {
    const { mail, run } = setup([note({ endedAt: pst(2, 15) })]);
    expect(await run(pst(2, 23, 59))).toMatchObject({ due: 0 });
    expect(await run(pst(3, 6, 59))).toMatchObject({ due: 0 });
    expect(await run(pst(3, 7))).toMatchObject({ due: 1, sent: 1 });
    expect(mail.delivered).toHaveLength(1);
  });

  it("puts each call in the family's own day: a call just after midnight is the next day's email", async () => {
    const toronto: DailyParent = { ...priya, postal: "M5V 2T6" };
    // 23:50 and 00:10 in Toronto (EST, UTC-5).
    const late = Date.UTC(2026, 10, 3, 4, 50);
    const early = Date.UTC(2026, 10, 3, 5, 10);
    const { mail, run } = setup([note({ endedAt: late }), note({ endedAt: early })], [toronto]);
    expect(await run(Date.UTC(2026, 10, 3, 12))).toMatchObject({ due: 1, sent: 1 });
    expect(mail.delivered[0].subject).toBe("Leah talked with Maya on Monday");
    expect(await run(Date.UTC(2026, 10, 4, 12))).toMatchObject({ due: 1, sent: 1 });
    expect(mail.delivered[1].subject).toBe("Leah talked with Maya on Tuesday");
  });
});

describe("no-call days", () => {
  it("send nothing", async () => {
    const { store, mail, run } = setup([note({ endedAt: pst(2, 15) })]);
    await run(pst(3, 7));
    // November 3 and 4 have no calls.
    expect(await run(pst(4, 8))).toMatchObject({ due: 0, sent: 0 });
    expect(await run(pst(5, 8))).toMatchObject({ due: 0, sent: 0 });
    expect(mail.delivered).toHaveLength(1);
    expect(store.rows()).toHaveLength(1);
  });

  it("send nothing to a family without calls", async () => {
    const other: DailyParent = { id: "p2", name: "Ana", email: "ana@family.ca", postal: null };
    const { mail, run } = setup([], [priya, other]);
    expect(await run(pst(3, 8))).toMatchObject({ due: 0 });
    expect(mail.delivered).toHaveLength(0);
  });

  it(`never send a day older than ${LOOKBACK_DAYS} days`, async () => {
    const { run } = setup([note({ endedAt: pst(2, 15) })]);
    expect(await run(pst(2 + LOOKBACK_DAYS + 1, 8))).toMatchObject({ due: 0 });
  });

  it("send nothing to an address that cannot get email", async () => {
    const { run } = setup([note({ endedAt: pst(2, 15) })], [{ ...priya, email: "leah@example.com" }]);
    expect(await run(pst(3, 8))).toMatchObject({ due: 0 });
  });
});

describe("unsubscribe", () => {
  it("has a link and one-click headers, and the link stops the email", async () => {
    const { store, mail, run } = setup([note({ endedAt: pst(2, 15) }), note({ endedAt: pst(3, 15) })]);
    await run(pst(3, 7));
    const m = mail.delivered[0];
    const token = tokenOf(m.text);
    expect(m.text).toContain(`Turn off these Maya emails: ${ORIGIN}/unsubscribe?t=${token}`);
    expect(m.html).toContain(`${ORIGIN}/unsubscribe?t=${token}`);
    expect(m.headers).toEqual({ "List-Unsubscribe": `<${ORIGIN}/api/unsubscribe?t=${token}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
    // CASL footer: business name, mailing address, website, why.
    expect(m.text).toContain("16557 87A Ave");
    expect(m.text).toContain("unicalearning.com");
    expect(m.text).toContain("You get this email on days when your child has a call with Maya.");

    expect(store.unsubscribe(token)).toBe("unsubscribed");
    expect(store.unsubscribe(token)).toBe("unsubscribed");
    expect(await run(pst(4, 8))).toMatchObject({ due: 0, sent: 0 });
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
      expect(await run(pst(3, 7 + i))).toMatchObject({ due: 1, failed: 1 });
      expect(store.rows()[0]).toMatchObject({ status: "failed", attempts: i });
    }
    expect(await run(pst(3, 20))).toMatchObject({ due: 0 });
    expect(mail.delivered).toHaveLength(0);
    expect(store.copies.map((c) => c.copy.outcome)).toEqual(["refused"]);
  });

  it("refused once, then sent on the next run", async () => {
    const { store, mail, run } = setup([note({ endedAt: pst(2, 15) })]);
    mail.answerNext("refuse");
    expect(await run(pst(3, 7))).toMatchObject({ failed: 1 });
    expect(await run(pst(3, 7, 15))).toMatchObject({ sent: 1 });
    expect(store.rows()).toMatchObject([{ status: "sent", attempts: 2 }]);
    expect(mail.delivered).toHaveLength(1);
  });

  it("unknown: the claim stays and nothing sends it again", async () => {
    const { store, mail, run } = setup([note({ endedAt: pst(2, 15) })]);
    mail.answerNext("lose_answer");
    expect(await run(pst(3, 7))).toMatchObject({ unknown: 1 });
    expect(store.rows()[0]).toMatchObject({ status: "claimed", attempts: 1 });
    expect(await run(pst(3, 8))).toMatchObject({ due: 0 });
    expect(await run(pst(4, 8))).toMatchObject({ due: 0 });
    expect(mail.delivered).toHaveLength(1);
  });

  it("two runs at once send one email", async () => {
    const { mail, run } = setup([note({ endedAt: pst(2, 15) })]);
    const [a, b] = await Promise.all([run(pst(3, 7)), run(pst(3, 7))]);
    expect(a.sent + b.sent).toBe(1);
    expect(a.busy + b.busy).toBe(1);
    expect(mail.delivered).toHaveLength(1);
  });

  it("an email it cannot build (the child is not loaded) counts as failed and sends nothing", async () => {
    const { mail, run } = setup([note({ endedAt: pst(2, 15) })], [priya], []);
    expect(await run(pst(3, 7))).toMatchObject({ due: 1, failed: 1, sent: 0 });
    expect(mail.delivered).toHaveLength(0);
  });
});

describe("the decision", () => {
  it("lists the calls of the day in the order they ended", () => {
    const later = note({ endedAt: pst(2, 18) });
    const earlier = note({ endedAt: pst(2, 9) });
    const due = dueDailyEmails({ parents: [priya], children: [leah], notes: [later, earlier], log: [] }, pst(3, 8));
    expect(due).toEqual([{ parentId: "p1", day: "2026-11-02", zone: "America/Vancouver", callIds: [earlier.callId, later.callId], retry: null }]);
  });

  it("a safety note keeps its own sentences", async () => {
    const { mail, run } = setup([note({
      endedAt: pst(2, 15),
      facts: { ...note({ endedAt: 0 }).facts, safety: true, finished: "not_finished", reason: "safety" },
      sentences: ["{child} called Maya about page 23, question 4.", "Something {child} said made Maya stop the math.", "She told {child} to talk to a grown-up they trust.", "Please read the call below."],
    })]);
    await run(pst(3, 7));
    expect(mail.delivered[0].text).toContain("Something Leah said made Maya stop the math. She told Leah to talk to a grown-up they trust. Please read the call below.");
  });
});
