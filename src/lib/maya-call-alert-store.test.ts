import { describe, expect, it } from "vitest";
import { alertState, alertStateAt } from "@/lib/maya-call-alert-store";

// The admin call page's view of an alert row (R393-2-1): a claim left "sending" past 10 minutes shows as unknown, also
// when the rows are mapped straight through alertState (maya-call-server.ts readCall).
describe("an alert row as the admin call page shows it", () => {
  const row = (claimedAt: string) => ({ level: "safety_concern" as const, status: "sending" as const, claimed_at: claimedAt, error: null });

  it("shows a sending claim older than 10 minutes as unknown, with the inbox instruction", () => {
    const old = new Date(Date.now() - 11 * 60_000).toISOString();
    const shown = [row(old)].map(alertState);
    expect(shown).toEqual([{ level: "safety_concern", status: "unknown", claimedAt: old, error: expect.stringContaining("check the inbox") }]);
  });

  it("keeps a fresh sending claim as sending", () => {
    const fresh = new Date().toISOString();
    expect([row(fresh)].map(alertState)[0].status).toBe("sending");
    expect(alertStateAt(row("2026-11-01T10:00:00.000Z"), Date.parse("2026-11-01T10:09:00.000Z")).status).toBe("sending");
    expect(alertStateAt(row("2026-11-01T10:00:00.000Z"), Date.parse("2026-11-01T10:11:00.000Z")).status).toBe("unknown");
  });
});
