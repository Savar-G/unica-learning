import { beforeEach, expect, it, vi } from "vitest";
import { memoryTransport } from "@/lib/email-delivery-memory";
import { SCAN_LINKS_PER_HOUR, scanLinkEmail, sendScanLink } from "@/lib/scan-link";
import { memoryScanLinkStore } from "@/lib/scan-link-memory";

vi.mock("server-only", () => ({}));

const HOUR = 60 * 60_000;
let clock = Date.parse("2026-11-05T18:00:00Z");
let mail = memoryTransport();
let memory = memoryScanLinkStore({ now: () => clock });
const input = { parent: "p1", child: "c1", origin: "https://unicalearning.com" };
const send = (over: Partial<typeof input> = {}, configProblem: () => string | null = () => null) =>
  sendScanLink(memory.store, { ...input, ...over }, { transport: mail.transport, configProblem });

beforeEach(() => {
  clock = Date.parse("2026-11-05T18:00:00Z");
  mail = memoryTransport();
  memory = memoryScanLinkStore({ now: () => clock });
  memory.addFamily({ parent: "p1", parentName: "Dana Lee", email: "dana@example.com", children: [{ id: "c1", firstName: "Iris" }] });
  memory.addFamily({ parent: "p2", parentName: "Sam Roy", email: "sam@example.com", children: [{ id: "c2", firstName: "Leo" }] });
});

it("emails the page's address to the parent's own email, naming the child", async () => {
  expect(await send()).toBe("sent");
  expect(mail.delivered).toHaveLength(1);
  const [email] = mail.delivered;
  expect(email.to).toBe("dana@example.com");
  expect(email.sender).toEqual({ to: "parent" });
  expect(email.subject).toContain("Iris");
  expect(email.text).toContain("Hi Dana,");
  expect(email.text).toContain("Iris's finished workbook pages");
  // Only the page's address: no token, child or family id.
  const links = [...email.text.matchAll(/https?:\/\/\S+/g)].map((m) => m[0]);
  expect(links).toEqual(["https://unicalearning.com/account/scan"]);
  expect(email.html).toContain('href="https://unicalearning.com/account/scan"');
  expect(memory.rows).toMatchObject([{ parent: "p1", child: "c1", status: "sent", emailId: "email-1" }]);
});

it("never calls the child she or her", () => {
  const email = scanLinkEmail({ parentName: "Dana", childName: "Iris", url: "https://unicalearning.com/account/scan" });
  expect(`${email.subject} ${email.text}`).not.toMatch(/\b(she|her|he|his|him)\b/i);
});

it("escapes the names in the email's HTML", () => {
  const email = scanLinkEmail({ parentName: "Dana", childName: "<b>Iris</b>", url: "https://unicalearning.com/account/scan" });
  expect(email.html).not.toContain("<b>Iris</b>");
  expect(email.html).toContain("&lt;b&gt;Iris&lt;/b&gt;");
});

it("sends nothing for a child of another family", async () => {
  expect(await send({ child: "c2" })).toBe("not_found");
  expect(mail.delivered).toHaveLength(0);
  expect(memory.rows).toHaveLength(0);
});

it(`sends at most ${SCAN_LINKS_PER_HOUR} links an hour to one parent`, async () => {
  for (let i = 0; i < SCAN_LINKS_PER_HOUR; i++) expect(await send()).toBe("sent");
  expect(await send()).toBe("too_many");
  expect(mail.delivered).toHaveLength(SCAN_LINKS_PER_HOUR);
  // Another family is not held back.
  expect(await send({ parent: "p2", child: "c2" })).toBe("sent");
  clock += HOUR + 1;
  expect(await send()).toBe("sent");
});

it("counts two requests sent together as two", async () => {
  const results = await Promise.all(Array.from({ length: SCAN_LINKS_PER_HOUR + 2 }, () => send()));
  expect(results.filter((r) => r === "sent")).toHaveLength(SCAN_LINKS_PER_HOUR);
  expect(results.filter((r) => r === "too_many")).toHaveLength(2);
});

it("claims nothing when email cannot go", async () => {
  expect(await send({}, () => "RESEND_API_KEY is not set")).toBe("failed");
  expect(memory.rows).toHaveLength(0);
  expect(mail.delivered).toHaveLength(0);
});

it("says failed when the provider refused, and unsure when the email may have gone", async () => {
  mail.answerNext("refuse", "lose_answer");
  expect(await send()).toBe("failed");
  expect(await send()).toBe("unsure");
  expect(memory.rows.map((r) => r.status)).toEqual(["failed", "claimed"]);
});
