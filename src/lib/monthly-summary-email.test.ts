import { mkdir, writeFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { memoryTransport } from "@/lib/email-delivery-memory";
import { memoryMonthlyStore } from "@/lib/monthly-summary-email-memory";
import { AFTER_CLAIM_MS, CLAIM_LIMIT_MS, ONE_SEND_MS, dueMonthlyEmails, monthlyEmail, runMonthlyEmails, type MonthlyChild, type MonthlyParent, type MonthlyStore } from "@/lib/monthly-summary-email";
import { readMonthlySummary, readOverview } from "@/lib/parent-view";
import { memoryParentViewReaders } from "@/lib/parent-view-memory";
import { MAX_SEND_ATTEMPTS } from "@/lib/reminders";
import { newToken } from "@/lib/sign-in-link";

vi.mock("server-only", () => ({}));

// The monthly summary email (#563) through its public run and store interfaces.
const ORIGIN = "https://unicalearning.com";
const priya: MonthlyParent = { id: "p1", name: "Priya Shah", email: "priya@family.ca", postal: "V3S 1A1", dashboardOpen: true };
const leah: MonthlyChild = { id: "c1", parentId: "p1", firstName: "Leah", created_at: "2026-01-01T00:00:00Z" };
const sam: MonthlyChild = { id: "c2", parentId: "p1", firstName: "Sam", created_at: "2026-02-01T00:00:00Z" };

/** 2026 at hh:mm in Vancouver (permanent PDT, UTC-7). */
const pdt = (month: number, day: number, hh = 8, mm = 0) => Date.UTC(2026, month - 1, day, hh + 7, mm);
const NOV_1 = pdt(11, 1);

const delivered = (childId: string, deliveredAt: string, workbookId = `wb-${childId}`) => ({ childId, workbookId, deliveredAt });
const leahBook = delivered("c1", "2026-10-10T18:00:00Z");
const samBook = delivered("c2", "2026-10-12T18:00:00Z");

function setup(over: Partial<Parameters<typeof memoryMonthlyStore>[0]> = {}) {
  const store = memoryMonthlyStore({ parents: [priya], children: [leah, sam], deliveries: [leahBook], corrections: [], ...over });
  const mail = memoryTransport();
  const run = (now = NOV_1, limit?: number) => runMonthlyEmails(store, now, { origin: ORIGIN, newToken, transport: mail.transport, limit });
  return { store, mail, run };
}

function threeFamilies() {
  const parents = ["a", "b", "c"].map((id) => ({ ...priya, id, email: `${id}@family.ca` }));
  const children = parents.map((p) => ({ ...leah, id: `c-${p.id}`, parentId: p.id }));
  return { parents, children, deliveries: children.map((c) => delivered(c.id, "2026-10-10T18:00:00Z")) };
}

const tokenOf = (text: string) => /\/unsubscribe\?t=([A-Za-z0-9_-]+)/.exec(text)![1];

describe("who gets the email", () => {
  it("sends only to a family the dashboard opens to: a normal family gets nothing while the switch is off", async () => {
    const { mail, run } = setup({ parents: [{ ...priya, dashboardOpen: false }] });
    expect(await run()).toMatchObject({ due: 0, sent: 0 });
    expect(mail.delivered).toHaveLength(0);
  });

  it("sends nothing before a confirmed delivery, and nothing in the month of the first delivery", async () => {
    expect(await setup({ deliveries: [] }).run()).toMatchObject({ due: 0 });
    expect(await setup({ deliveries: [delivered("c1", "2026-11-01T14:30:00Z")] }).run()).toMatchObject({ due: 0 });
  });

  it("names each child whose summary is offered, oldest first, and leaves out the others", async () => {
    const one = setup();
    await one.run();
    expect(one.mail.delivered).toHaveLength(1);
    expect(one.mail.delivered[0].text).toContain("Leah");
    expect(one.mail.delivered[0].text).not.toContain("Sam");

    const both = setup({ children: [sam, leah], deliveries: [samBook, leahBook] });
    await both.run();
    expect(both.mail.delivered).toHaveLength(1);
    expect(both.mail.delivered[0].subject).toBe("October summary: Leah and Sam");
    expect(both.mail.delivered[0].text.indexOf("Leah")).toBeLessThan(both.mail.delivered[0].text.indexOf("Sam"));
  });

  it("uses the month rule in family time: Vancouver on October 31 is not yet the new month, while Toronto on November 1 is", async () => {
    const instant = Date.UTC(2026, 10, 1, 12, 0); // 5 a.m. on November 1 in Vancouver, 8 a.m. in Toronto.
    expect(dueMonthlyEmails(await setup().store.load(instant), instant)).toHaveLength(0);
    const toronto = setup({ parents: [{ ...priya, postal: "M5V 2T6" }] });
    expect(dueMonthlyEmails(await toronto.store.load(instant), instant)).toMatchObject([{ parentId: "p1", month: "2026-10", childIds: ["c1"] }]);
  });

  it("the saved time zone wins over the postal code", async () => {
    const instant = Date.UTC(2026, 10, 1, 12, 0);
    const saved = setup({ parents: [{ ...priya, postal: "M5V 2T6", timeZone: "America/Vancouver" }] });
    expect(dueMonthlyEmails(await saved.store.load(instant), instant)).toHaveLength(0);
  });

  it("goes from the first of the month at 7 a.m. until the end of the 7th, then waits for the next month", async () => {
    const { store } = setup();
    const due = async (at: number) => dueMonthlyEmails(await store.load(at), at).length;
    expect(await due(pdt(11, 1, 6, 59))).toBe(0);
    expect(await due(pdt(11, 1, 7))).toBe(1);
    expect(await due(pdt(11, 7, 23, 59))).toBe(1);
    expect(await due(pdt(11, 8, 0))).toBe(0);
  });

  it("leaves out an address that can never get email", async () => {
    expect(await setup({ parents: [{ ...priya, email: "priya@example.com" }] }).run()).toMatchObject({ due: 0 });
  });

  it("a delivery correction moves the first month", async () => {
    // The first record says September; the correction says November, so October is not offered.
    const moved = setup({ deliveries: [delivered("c1", "2026-09-20T18:00:00Z")], corrections: [{ workbookId: "wb-c1", deliveredAt: "2026-11-01T14:30:00Z", auditId: 2 }] });
    expect(await moved.run()).toMatchObject({ due: 0 });
  });
});

describe("the month rule is the Overview's", () => {
  const instants = [
    pdt(9, 30, 12), pdt(10, 1, 8), pdt(10, 31, 23, 30), pdt(11, 1, 8), pdt(11, 3, 8), pdt(12, 1, 8), Date.UTC(2027, 0, 1, 16),
  ];
  const deliveries = ["2026-09-30T19:00:00Z", "2026-10-01T03:00:00Z", "2026-10-10T18:00:00Z", "2026-11-01T14:30:00Z"];

  it.each(deliveries)("names a child only for the month the Overview offers and the PDF route makes (delivered %s)", async (deliveredAt) => {
    const own = { parentId: "p1", childId: "c1" };
    const reader = memoryParentViewReaders({
      children: [{ id: "c1", parentId: "p1", firstName: "Leah", grade: 3, createdAt: "2026-01-01T00:00:00Z" }],
      cards: [{ ...own, cardSavedAt: "2026-09-01T00:00:00Z" }],
      deliveries: [{ ...own, workbookId: "wb-c1", deliveredAt }],
      workbooks: [{ ...own, id: "wb-c1", number: 1, status: "shipped", shippedAt: "2026-09-20T18:00:00Z" }],
      family: { timeZone: null, postal: "V3S 1A1" },
    }).parent("p1");
    const { store } = setup({ deliveries: [delivered("c1", deliveredAt)] });
    for (const at of instants) {
      const emailed = dueMonthlyEmails(await store.load(at), at)[0];
      if (!emailed) continue;
      const overview = await readOverview(reader, "c1", at);
      expect(overview?.summaryMonth).toBe(emailed.month);
      expect(await readMonthlySummary(reader, "c1", emailed.month, at)).not.toBeNull();
    }
    // And the other way round: on a day inside the window, a month the Overview offers is emailed.
    const at = pdt(12, 1, 8);
    expect((await readOverview(reader, "c1", at))?.summaryMonth).toBe(dueMonthlyEmails(await store.load(at), at)[0]?.month);
  });

  it("names a child with an ended plan too, because the Overview still offers it", async () => {
    const own = { parentId: "p1", childId: "c1" };
    const reader = memoryParentViewReaders({
      children: [{ id: "c1", parentId: "p1", firstName: "Leah", grade: 3, createdAt: "2026-01-01T00:00:00Z" }],
      deliveries: [{ ...own, workbookId: "wb-c1", deliveredAt: "2026-10-10T18:00:00Z" }],
      plans: [{ ...own, kind: "ended" }],
    }).parent("p1");
    expect((await readOverview(reader, "c1", NOV_1))?.summaryMonth).toBe("2026-10");
    expect(dueMonthlyEmails(await setup().store.load(NOV_1), NOV_1)).toMatchObject([{ month: "2026-10" }]);
  });
});

describe("sent once", () => {
  it("one email per family per month, and the next month gets its own", async () => {
    const { store, mail, run } = setup();
    expect(await run()).toMatchObject({ due: 1, sent: 1 });
    expect(await run(NOV_1 + 15 * 60_000)).toMatchObject({ due: 0, sent: 0 });
    expect(mail.delivered).toHaveLength(1);
    expect(await run(pdt(12, 1))).toMatchObject({ sent: 1 });
    expect(mail.delivered[1].subject).toBe("November summary: Leah");
    expect(store.rows().filter((r) => r.kind === "monthly_summary").map((r) => [r.month, r.status])).toEqual([["2026-10", "sent"], ["2026-11", "sent"]]);
  });

  it("two runs together send one email", async () => {
    const { mail, run } = setup();
    const [a, b] = await Promise.all([run(), run()]);
    expect(a.sent + b.sent).toBe(1);
    expect(a.busy + b.busy).toBe(1);
    expect(mail.delivered).toHaveLength(1);
  });

  it("a changed zone cannot send the same month twice", async () => {
    const east = { ...priya, postal: "M5V 2T6" };
    const { store, mail, run } = setup({ parents: [east] });
    expect(await run(Date.UTC(2026, 10, 1, 12))).toMatchObject({ sent: 1 });
    east.postal = "V3S 1A1";
    expect(await run(pdt(11, 1, 8))).toMatchObject({ due: 0 });
    expect(store.rows().filter((r) => r.kind === "monthly_summary")).toHaveLength(1);
    expect(mail.delivered).toHaveLength(1);
  });

  it("an unknown outcome stays claimed: nothing sends it again", async () => {
    const { store, mail, run } = setup();
    mail.answerNext("no_answer");
    expect(await run()).toMatchObject({ unknown: 1, sent: 0 });
    expect(store.rows()[0]).toMatchObject({ status: "claimed", attempts: 1 });
    expect(await run(NOV_1 + 15 * 60_000)).toMatchObject({ due: 0 });
    expect(mail.delivered).toHaveLength(0);
  });

  it("a lost answer stays claimed although the email went", async () => {
    const { mail, run } = setup();
    mail.answerNext("lose_answer");
    expect(await run()).toMatchObject({ unknown: 1 });
    expect(await run(NOV_1 + 15 * 60_000)).toMatchObject({ due: 0 });
    expect(mail.delivered).toHaveLength(1);
  });

  it("a refused email tries again, up to the limit, with a new link", async () => {
    const { store, mail, run } = setup();
    for (let i = 0; i < MAX_SEND_ATTEMPTS; i++) mail.answerNext("refuse");
    for (let i = 0; i < MAX_SEND_ATTEMPTS; i++) expect(await run(NOV_1 + i * 60_000)).toMatchObject({ failed: 1 });
    expect(store.rows()[0]).toMatchObject({ status: "failed", attempts: MAX_SEND_ATTEMPTS });
    expect(await run(NOV_1 + 60 * 60_000)).toMatchObject({ due: 0 });
    expect(mail.delivered).toHaveLength(0);
  });

  it("a claim that throws stops one family only, and nothing goes for it", async () => {
    const { store, mail, run } = setup({
      parents: [priya, { ...priya, id: "p2", email: "omar@family.ca", name: "Omar" }],
      children: [leah, { ...sam, id: "c2", parentId: "p2" }],
      deliveries: [leahBook, samBook],
    });
    store.failClaimFor("p1");
    expect(await run()).toMatchObject({ due: 2, failed: 1, sent: 1 });
    expect(mail.delivered.map((m) => m.to)).toEqual(["omar@family.ca"]);
  });

  it("keeps what was sent, with the link's token hidden by the copy", async () => {
    const { store, mail, run } = setup();
    await run();
    expect(store.copies).toHaveLength(1);
    expect(store.copies[0]).toMatchObject({ parentId: "p1", copy: { outcome: "sent", emailId: "email-1" } });
    expect(store.copies[0].copy.message.subject).toBe(mail.delivered[0].subject);
  });

  it("a run's limit leaves the rest for the next run, with nothing claimed", async () => {
    const { store, mail, run } = setup(threeFamilies());
    expect(await run(NOV_1, 1)).toMatchObject({ due: 3, sent: 1 });
    expect(store.rows()).toHaveLength(1);
    expect(await run(NOV_1)).toMatchObject({ due: 2, sent: 2 });
    expect(mail.delivered).toHaveLength(3);
  });
});

describe("the run's time", () => {
  const END = NOV_1 + 50_000;

  /** A run on a passed-in clock that ends at END. `left` is the time left when the monthly step starts. */
  function timed(left: number, over: Partial<Parameters<typeof memoryMonthlyStore>[0]> = {}) {
    const { store, mail } = setup(over);
    const clock = { t: END - left };
    const run = (from: MonthlyStore = store) => runMonthlyEmails(from, NOV_1, { origin: ORIGIN, newToken, transport: mail.transport, time: { now: () => clock.t, endAt: END } });
    return { store, mail, clock, run };
  }
  /** A store whose claim takes `ms` on the clock. */
  const slowClaim = (store: MonthlyStore, clock: { t: number }, ms: number): MonthlyStore => ({
    ...store,
    ledger: { ...store.ledger, claim: async (d, fields) => { clock.t += ms; return store.ledger.claim(d, fields); } },
  });

  it("with too little time for one send, it reads nothing and claims nothing, and the next run sends", async () => {
    const { store, mail, clock, run } = timed(ONE_SEND_MS - 1);
    const load = vi.fn(store.load);
    expect(await run({ ...store, load })).toMatchObject({ outOfTime: true, due: 0, sent: 0 });
    expect(load).not.toHaveBeenCalled();
    expect(store.rows()).toEqual([]);
    clock.t = END - 50_000;
    expect(await run()).toMatchObject({ outOfTime: false, due: 1, sent: 1 });
    expect(mail.delivered).toHaveLength(1);
  });

  it("aborts a slow load when only one send's time is left: the step stops cleanly, and the next run sends", async () => {
    const { store, mail, clock, run } = timed(ONE_SEND_MS + 20);
    let signal: AbortSignal | undefined;
    const slow: MonthlyStore = {
      ...store,
      load: (_now, given) => new Promise((_resolve, reject) => {
        signal = given;
        given?.addEventListener("abort", () => reject(given.reason));
      }),
    };
    expect(await run(slow)).toMatchObject({ outOfTime: true, due: 0, sent: 0, failed: 0 });
    expect(signal?.reason?.name).toBe("AbortError");
    expect(store.rows()).toEqual([]);
    clock.t = END - 50_000;
    expect(await run()).toMatchObject({ due: 1, sent: 1 });
    expect(mail.delivered).toHaveLength(1);
  });

  it("stops waiting for a load that ignores the abort", async () => {
    const { store, run } = timed(ONE_SEND_MS + 20);
    expect(await run({ ...store, load: () => new Promise(() => {}) })).toMatchObject({ outOfTime: true, sent: 0 });
  });

  it("a load that fails in time still throws: it is a failed run, not a late one", async () => {
    const { store, run } = timed(50_000);
    await expect(run({ ...store, load: () => Promise.reject(new Error("read failed")) })).rejects.toThrow("read failed");
  });

  it("claims nothing when the load ended too late for a send", async () => {
    const { store, mail, clock, run } = timed(50_000);
    const late: MonthlyStore = { ...store, load: async (now) => { clock.t = END - ONE_SEND_MS + 1; return store.load(now); } };
    expect(await run(late)).toMatchObject({ outOfTime: true, due: 1, sent: 0 });
    expect(store.rows()).toEqual([]);
    expect(mail.delivered).toHaveLength(0);
  });

  it("the slowest email that starts still ends inside the time, and the next one does not start", async () => {
    const { store, mail, clock, run } = timed(ONE_SEND_MS + 1, threeFamilies());
    const send = mail.transport.send;
    mail.transport.send = async (m) => { clock.t += AFTER_CLAIM_MS; return send(m); };
    expect(await run(slowClaim(store, clock, CLAIM_LIMIT_MS))).toMatchObject({ due: 3, sent: 1, outOfTime: true });
    expect(store.rows()).toHaveLength(1);
    expect(clock.t).toBeLessThanOrEqual(END);
  });

  it("a claim that ended too late goes back with nothing sent, and the next run sends with its first attempt", async () => {
    const { store, mail, clock, run } = timed(ONE_SEND_MS + 1);
    expect(await run(slowClaim(store, clock, 10_000))).toMatchObject({ due: 1, released: 1, stuck: 0, sent: 0, outOfTime: true });
    expect(mail.delivered).toHaveLength(0);
    expect(store.rows()).toEqual([]);
    expect(store.copies).toEqual([]);
    clock.t = END - 50_000;
    expect(await run()).toMatchObject({ due: 1, sent: 1 });
    expect(store.rows()).toMatchObject([{ status: "sent", attempts: 1 }]);
    expect(mail.delivered).toHaveLength(1);
  });

  it("a retry on its last attempt goes back at its old count, so the email is not lost", async () => {
    const { store, mail, clock, run } = timed(50_000);
    for (let i = 1; i < MAX_SEND_ATTEMPTS; i++) {
      mail.answerNext("refuse");
      await run();
    }
    expect(store.rows()).toMatchObject([{ status: "failed", attempts: MAX_SEND_ATTEMPTS - 1 }]);
    clock.t = END - ONE_SEND_MS - 1;
    expect(await run(slowClaim(store, clock, 10_000))).toMatchObject({ released: 1, sent: 0 });
    expect(store.rows()).toMatchObject([{ status: "failed", attempts: MAX_SEND_ATTEMPTS - 1 }]);
    clock.t = END - 50_000;
    expect(await run()).toMatchObject({ sent: 1 });
    expect(store.rows()).toMatchObject([{ status: "sent", attempts: MAX_SEND_ATTEMPTS }]);
  });

  it.each([
    ["answers no", async () => false],
    ["throws", async () => { throw new Error("database gone"); }],
  ])("a release that %s sends nothing, is counted, and the row stays claimed", async (_label, release) => {
    const { store, mail, clock, run } = timed(ONE_SEND_MS + 1);
    const slow = slowClaim(store, clock, 10_000);
    expect(await run({ ...slow, ledger: { ...slow.ledger, release } })).toMatchObject({ released: 0, stuck: 1, sent: 0 });
    expect(mail.delivered).toHaveLength(0);
    expect(store.rows()).toMatchObject([{ status: "claimed", attempts: 1 }]);
  });
});

describe("its own unsubscribe", () => {
  it("stops only this email, and another email's unsubscribe does not stop it", async () => {
    const { store, mail, run } = setup();
    await run();
    expect(store.unsubscribe(tokenOf(mail.delivered[0].text))).toBe("unsubscribed");
    expect(store.rows().map((r) => r.kind)).toEqual(["monthly_summary", "monthly_summary_unsubscribe"]);
    expect(await run(pdt(12, 1))).toMatchObject({ due: 0 });

    const other = setup();
    other.store.logOther("unsubscribe");
    other.store.logOther("maya_unsubscribe");
    expect(await other.run()).toMatchObject({ sent: 1 });
  });

  it("a token we did not send does nothing", () => {
    expect(setup().store.unsubscribe("no-such-token")).toBe("unknown");
  });
});

describe("the email", () => {
  it("has a link to each child's Overview, the CASL footer, the one-click headers and no attachment", async () => {
    const { mail, run } = setup({ deliveries: [leahBook, samBook] });
    await run();
    const m = mail.delivered[0];
    const token = tokenOf(m.text);
    expect(m.to).toBe("priya@family.ca");
    expect(m.sender).toEqual({ to: "parent" });
    expect(m.replyTo).toBe("contact@unicalearning.com");
    expect(m.headers).toEqual({ "List-Unsubscribe": `<${ORIGIN}/api/unsubscribe?t=${token}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
    expect(m).not.toHaveProperty("attachments");
    for (const child of ["c1", "c2"]) {
      expect(m.text).toContain(`${ORIGIN}/account?child=${child}`);
      expect(m.html).toContain(`href="${ORIGIN}/account?child=${child}"`);
    }
    expect(m.html).not.toContain("monthly-summary?month");
    for (const body of [m.text, m.html!]) {
      expect(body).toContain("16557 87A Ave");
      expect(body).toContain("unicalearning.com");
      expect(body).toContain(`${ORIGIN}/unsubscribe?t=${token}`);
      expect(body).toContain("Turn off monthly summary emails");
    }
  });

  it("uses plain words: the child's name, no pronoun, no score, no comparison", () => {
    for (const children of [[{ name: "Leah", url: `${ORIGIN}/account?child=c1` }], [{ name: "Leah", url: "u1" }, { name: "Sam", url: "u2" }]]) {
      const { subject, text, html } = monthlyEmail({ parentName: "Priya Shah", month: "2026-10", children, unsubscribeUrl: "u" });
      const words = `${subject}\n${text}\n${html.replace(/<[^>]+>/g, " ")}`;
      expect(words).not.toMatch(/\b(she|her|hers|he|him|his)\b/i);
      expect(words).not.toMatch(/%|percent|score|wrong|other children|average|ahead of|behind/i);
      expect(subject).not.toMatch(/workbook/i);
      expect(text).toContain("Hi Priya,");
      expect(text).toContain("October 2026");
      expect(words).not.toContain("\u2014");
    }
  });

  it("escapes a name in the HTML", () => {
    const { html } = monthlyEmail({ parentName: "<Priya>", month: "2026-10", children: [{ name: "Le<b>ah", url: `${ORIGIN}/account?child=c1&x="1"` }], unsubscribeUrl: "u" });
    expect(html).not.toContain("<b>ah");
    expect(html).toContain("Le&lt;b&gt;ah");
    expect(html).not.toContain("<Priya>");
    expect(html).toContain("&amp;x=&quot;1&quot;");
  });

  it("a child with no stored name reads as your child, and a parent with no name gets a plain greeting", () => {
    const { store, run, mail } = setup({ parents: [{ ...priya, name: " " }], children: [{ ...leah, firstName: " " }] });
    return run().then(() => {
      expect(store.rows()).toHaveLength(1);
      expect(mail.delivered[0].subject).toBe("October summary: Your child");
      expect(mail.delivered[0].text).toContain("Hi there,");
      expect(mail.delivered[0].text).toContain("Your child's summary");
    });
  });

  // Writes the email for the design round's images: RENDER_OUT=<folder> npx vitest run src/lib/monthly-summary-email.test.ts
  it.runIf(process.env.RENDER_OUT)("renders to files", async () => {
    await mkdir(process.env.RENDER_OUT!, { recursive: true });
    const unsubscribeUrl = `${ORIGIN}/unsubscribe?t=sample`;
    const one = monthlyEmail({ parentName: "Priya Shah", month: "2026-10", children: [{ name: "Leah", url: `${ORIGIN}/account?child=c1` }], unsubscribeUrl });
    const two = monthlyEmail({ parentName: "Priya Shah", month: "2026-10", children: [{ name: "Leah", url: `${ORIGIN}/account?child=c1` }, { name: "Sam", url: `${ORIGIN}/account?child=c2` }], unsubscribeUrl });
    await writeFile(`${process.env.RENDER_OUT}/one-child.html`, one.html);
    await writeFile(`${process.env.RENDER_OUT}/one-child.txt`, `${one.subject}\n\n${one.text}`);
    await writeFile(`${process.env.RENDER_OUT}/two-children.html`, two.html);
    await writeFile(`${process.env.RENDER_OUT}/two-children.txt`, `${two.subject}\n\n${two.text}`);
  });
});
