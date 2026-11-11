import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createHash } from "node:crypto";
import { copyRow } from "@/lib/email-copies";
import { memoryLedger, memoryTransport } from "@/lib/email-delivery-memory";
import { pacedTransport } from "@/lib/email-delivery";
import { resendTransport } from "@/lib/email-resend";
import { firstPagesActionUrl, firstPagesFilename, runFirstPagesEmails, type DueFirstPagesEmail, type FirstPagesEmailStore } from "@/lib/first-pages-email";
import { START_PLAN_TODAY } from "@/lib/first-pages-words";

// The first pages' sample email (docs/first-pages.md) through its public interface: an in-memory store whose checks
// read a state the test changes, the in-memory ledger (one claim per test) and the in-memory transport.

const ORIGIN = "https://unicalearning.com";
const PDF = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55, 10, 1, 2, 3]);
const due = (over: Partial<DueFirstPagesEmail> = {}): DueFirstPagesEmail => ({
  firstPagesId: "fp-1", assessmentId: "test-1", reportId: "report-1", parentId: "parent-1", childId: "child-1",
  parentName: "Ana Lopez", parentEmail: "ana@example.com", childName: "Leah", pdfPath: "parent-1/wb-1/first-k.pdf", retry: null, ...over,
});

function setup(o: { sets?: DueFirstPagesEmail[] } = {}) {
  const state = { cardSaved: false, unsubscribed: false, ready: true, failRead: false };
  const mem = memoryLedger<DueFirstPagesEmail>({ keyOf: (d) => d.assessmentId });
  const mail = memoryTransport();
  let tokens = 0;
  const store: FirstPagesEmailStore = {
    due: async () => (o.sets ?? [due()]).filter((d) => mem.entry(d)?.state !== "sent" && mem.entry(d)?.state !== "claimed" && mem.entry(d)?.state !== "unknown"),
    async blocked() {
      if (state.failRead) throw new Error("database down");
      if (!state.ready) return "the first pages are not ready to send";
      if (state.unsubscribed) return "the parent unsubscribed";
      if (state.cardSaved) return "the family saved a card";
      return null;
    },
    pdf: async (path) => { if (path !== due().pdfPath) throw new Error("no file"); return PDF; },
    admit: async () => !state.failRead && state.ready && !state.unsubscribed && !state.cardSaved,
    ledger: mem.ledger,
  };
  const run = (enabled = true) => runFirstPagesEmails(store, { enabled, origin: ORIGIN, transport: mail.transport, newToken: () => ({ token: `tok${++tokens}`, hash: "a".repeat(64) }) });
  return { state, mem, mail, run, store };
}

describe("the first pages' sample email", () => {
  it("sends one email with the four-page PDF and 'Start your plan today', once per test", async () => {
    const s = setup();
    expect(await s.run()).toMatchObject({ due: 1, sent: 1 });
    const [m] = s.mail.delivered;
    expect(m).toMatchObject({ to: "ana@example.com", sender: { to: "parent", from: "founders" }, subject: "The first pages of Leah's Workbook 1" });
    expect(m.attachments).toEqual([{ filename: "leah-workbook-1-first-pages.pdf", contentType: "application/pdf", content: PDF }]);
    // The action opens the report's plan choice and card step.
    const action = firstPagesActionUrl(ORIGIN, "report-1");
    expect(action).toBe(`${ORIGIN}/account/report/report-1?step=plan#rpt-next`);
    expect(m.text).toContain(`${START_PLAN_TODAY}: ${action}`);
    expect(m.html).toContain(`href="${action.replace("&", "&amp;")}"`);
    expect(m.html).toContain(START_PLAN_TODAY);
    // The free month starts with the delivery, in the approved words; CASL: unsubscribe link and one-click headers.
    expect(m.text).toContain("Your family gets one free month. It starts when your first workbook arrives.");
    expect(m.text).toContain(`${ORIGIN}/unsubscribe?t=tok1`);
    expect(m.headers).toEqual({ "List-Unsubscribe": `<${ORIGIN}/api/unsubscribe?t=tok1>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
    // No AI words and no grade: only the parent's first name, the child's name and code's sentences.
    expect(m.text.startsWith("Hi Ana,")).toBe(true);
    expect(m.text).not.toMatch(/grade|level/i);

    expect(await s.run()).toMatchObject({ due: 0, sent: 0 });
    expect(s.mail.delivered).toHaveLength(1);
  });

  it("sends nothing while the switch is off", async () => {
    const s = setup();
    expect(await s.run(false)).toEqual({ off: true });
    expect(s.mail.delivered).toEqual([]);
    expect(s.mem.entry(due())).toBeUndefined();
  });

  it("stops when the family saved a card, the parent unsubscribed, the set is no longer ready, or a check cannot be read", async () => {
    for (const change of ["cardSaved", "unsubscribed", "ready", "failRead"] as const) {
      const s = setup();
      if (change === "ready") s.state.ready = false;
      else s.state[change] = true;
      const counts = await s.run();
      expect(counts).toMatchObject({ due: 1, sent: 0 });
      expect(s.mail.delivered).toEqual([]);
      // Nothing was claimed: when the reason goes away, the email can still go.
      expect(s.mem.entry(due())).toBeUndefined();
    }
    const s = setup();
    s.state.cardSaved = true;
    await s.run();
    s.state.cardSaved = false;
    expect(await s.run()).toMatchObject({ sent: 1 });
  });

  it("tries a refused email again on the next run, and never sends an email whose outcome is unknown twice", async () => {
    const s = setup();
    s.mail.answerNext("refuse");
    expect(await s.run()).toMatchObject({ refused: 1 });
    expect(await s.run()).toMatchObject({ sent: 1 });
    const t = setup();
    t.mail.answerNext("no_answer");
    expect(await t.run()).toMatchObject({ unknown: 1 });
    expect(await t.run()).toMatchObject({ due: 0 });
    expect(t.mail.delivered.length).toBeLessThanOrEqual(1);
  });

  it("names the PDF with the child's name in plain letters", () => {
    expect(firstPagesFilename("Zoë Ann")).toBe("zoe-ann-workbook-1-first-pages.pdf");
    expect(firstPagesFilename("李")).toBe("workbook-1-first-pages.pdf");
  });
});

describe("the last check", () => {
  it("stops a claimed email that waited behind another email when the parent unsubscribed during the wait", async () => {
    const s = setup();
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let order = 0;
    // A slow earlier email holds the shared paced transport.
    const paced = pacedTransport({ send: async (m, opts) => { if (order++ === 0) await held; return s.mail.transport.send(m, opts); } }, 0);
    const earlier = paced.send({ sender: { to: "parent" }, to: "x@example.com", subject: "earlier", text: "t" });
    const run = runFirstPagesEmails(s.store, { enabled: true, origin: ORIGIN, transport: paced, newToken: () => ({ token: "t", hash: "a".repeat(64) }) });
    await new Promise((r) => setTimeout(r, 20));
    // Claimed and queued; now the parent unsubscribes.
    expect(s.mem.entry(due())?.state).toBe("claimed");
    s.state.unsubscribed = true;
    release();
    await earlier;
    expect(await run).toMatchObject({ sent: 0, refused: 1 });
    expect(s.mail.delivered.map((m) => m.subject)).toEqual(["earlier"]);
    // The claim is released: the next run checks again (and is blocked).
    expect(s.mem.entry(due())?.state).toBe("refused");
  });
});

describe("attachments", () => {
  it("go to Resend as base64 with their name and type", async () => {
    const env = { ...process.env };
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "Unica Learning <contact@unicalearning.com>";
    let body: Record<string, unknown> = {};
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: "e1" }), { status: 200 });
    }) as unknown as typeof globalThis.fetch;
    try {
      const out = await resendTransport({ fetch }).send({ sender: { to: "parent" }, to: "ana@example.com", subject: "s", text: "t",
        attachments: [{ filename: "leah-workbook-1-first-pages.pdf", contentType: "application/pdf", content: PDF }] });
      expect(out).toEqual({ status: "sent", emailId: "e1" });
      expect(body.attachments).toEqual([{ filename: "leah-workbook-1-first-pages.pdf", content: Buffer.from(PDF).toString("base64"), content_type: "application/pdf" }]);
      // An email without files sends no attachments key.
      await resendTransport({ fetch }).send({ sender: { to: "parent" }, to: "ana@example.com", subject: "s", text: "t" });
      expect("attachments" in body).toBe(false);
    } finally {
      process.env = env;
    }
  });

  it("are kept in the email's copy as a description, never as bytes", () => {
    const row = copyRow({ emailLogId: "log-1" }, "parent-1", {
      from: "x", outcome: "sent", emailId: "e1",
      message: { sender: { to: "parent" }, to: "ana@example.com", subject: "s", text: "t", attachments: [{ filename: "a.pdf", contentType: "application/pdf", content: PDF }] },
    });
    expect(row.attachments).toEqual([{ filename: "a.pdf", contentType: "application/pdf", bytes: PDF.length, sha256: createHash("sha256").update(PDF).digest("hex") }]);
    expect(JSON.stringify(row)).not.toContain(Buffer.from(PDF).toString("base64"));
  });
});
