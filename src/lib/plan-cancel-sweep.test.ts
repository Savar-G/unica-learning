import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import { sweepOpenCancels } from "@/lib/plan-cancel-recovery-server";
import { memoryTransport } from "@/lib/email-delivery-memory";
import type { Database } from "@/lib/database";

vi.mock("server-only", () => ({}));
const NOW = Date.UTC(2026, 10, 9, 12);
function world(onClaim?: () => void) {
  const claimed = new Set<string>();
  const rows = ["lost-admission-answer", "crashed-after-admission"].map(id => ({ id, parent_id: "parent", created_at: new Date(NOW - 11 * 60_000).toISOString(), parent_words: "private parent message" }));
  const calls: string[] = [];
  const db = createClient<Database>("https://db.invalid", "synthetic", { global: { fetch: async (input, init) => {
    const url = new URL(String(input));
    const name = url.pathname.split("/").at(-1)!;
    calls.push(name);
    const args = JSON.parse(String(init?.body ?? "{}"));
    if (name === "due_plan_cancel_alerts") {
      expect(args.p_before).toBe("2026-11-09T11:50:00.000Z");
      return Response.json(rows.filter(r => !claimed.has(r.id)));
    }
    if (name === "claim_plan_cancel_alert") { const ok = !claimed.has(args.p_id); claimed.add(args.p_id); onClaim?.(); return Response.json(ok); }
    if (name === "note_plan_cancel_alert") { if (args.p_state === "released") claimed.delete(args.p_id); return Response.json(null); }
    throw Error(`unexpected database operation ${name}`);
  } } });
  return { db, calls, claimed, mail: memoryTransport() };
}
for (const id of ["lost-admission-answer", "crashed-after-admission"]) it(`alerts once after ${id}, including simultaneous reminder runs`, async () => {
  const w = world();
  await Promise.all([1, 2].map(() => sweepOpenCancels(w.db, { origin: "https://unicalearning.com", to: "team@example.test", transport: w.mail.transport, startedAt: NOW, now: () => NOW })));
  await sweepOpenCancels(w.db, { origin: "https://unicalearning.com", to: "team@example.test", transport: w.mail.transport, startedAt: NOW, now: () => NOW });
  expect(w.mail.delivered.filter(m => m.text.includes(`Operation: ${id}`))).toHaveLength(1);
  expect(w.mail.delivered).toHaveLength(2);
  expect(w.mail.delivered.every(m => !m.text.includes("private parent message"))).toBe(true);
  expect(w.mail.delivered[0].text).toContain("https://unicalearning.com/admin/parents/parent");
  expect(w.calls).not.toContain("finish_plan_control");
});
it("does not claim or send after the sweep's start deadline", async () => {
  const w = world();
  await sweepOpenCancels(w.db, { origin: "https://unicalearning.com", to: "team@example.test", transport: w.mail.transport, startedAt: NOW, now: () => NOW + 30_000 });
  expect(w.claimed.size).toBe(0); expect(w.mail.delivered).toHaveLength(0);
});
it("keeps an unknown send claimed", async () => {
  const w = world();
  const send = vi.fn(async () => ({ status: "unknown" as const, error: "lost answer" }));
  const options = { origin: "https://unicalearning.com", to: "team@example.test", transport: { send }, startedAt: NOW, now: () => NOW };
  await sweepOpenCancels(w.db, options); await sweepOpenCancels(w.db, options);
  expect(send).toHaveBeenCalledTimes(2);
});

it("releases a claim if its database wait crosses the email deadline", async () => {
  let now = NOW;
  const w = world(() => { now = NOW + 30_000; });
  await sweepOpenCancels(w.db, { origin: "https://unicalearning.com", to: "team@example.test", transport: w.mail.transport, startedAt: NOW, now: () => now });
  expect(w.mail.delivered).toHaveLength(0); expect(w.claimed.size).toBe(0);
});
it("retries a refused send without duplicating a successful send", async () => {
  const w = world();
  const options = { origin: "https://unicalearning.com", to: "team@example.test", startedAt: NOW, now: () => NOW };
  await sweepOpenCancels(w.db, { ...options, transport: { send: async () => ({ status: "refused", error: "not sent" }) } });
  expect(w.claimed.size).toBe(0);
  await sweepOpenCancels(w.db, { ...options, transport: w.mail.transport });
  await sweepOpenCancels(w.db, { ...options, transport: w.mail.transport });
  expect(w.mail.delivered).toHaveLength(2);
});
