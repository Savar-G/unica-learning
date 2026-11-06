import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import { planStartEmailClaim, sendPlanStartEmail } from "@/lib/workbook-email-server";

vi.mock("server-only", () => ({}));

function fixture() {
  const starts = new Map<number, Record<string, unknown>>();
  const legacy = { status: "sent", claimed_at: null };
  const db = createClient<Database>("https://fixture.invalid", "sb_secret_synthetic", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/plan_starts")) {
        const row = starts.get(Number(url.searchParams.get("generation")?.replace("eq.", "")));
        return Response.json(row ? [row] : []);
      }
      if (url.pathname.endsWith("/workbook_emails")) return Response.json([legacy]);
      if (url.pathname.endsWith("/card_setups")) return Response.json([{ parent_id: "p", child_id: "c" }]);
      if (url.pathname.endsWith("/parents")) return Response.json([{ name: "Priya", email: "parent@example.invalid", postal: "V6B 1A1", time_zone: null }]);
      if (url.pathname.endsWith("/children")) return Response.json([{ first_name: "Leah", province: "BC" }]);
      if (url.pathname.endsWith("/claim_plan_start_email")) return Response.json(true);
      if (url.pathname.endsWith("/release_plan_start_email")) return Response.json(false);
      throw Error(`Unexpected request: ${url.pathname}`);
    } },
  });
  return { db, starts, legacy };
}

it("reads the old ledger at generation zero and respects it for generation one without suppressing generation two", async () => {
  const f = fixture();
  for (const generation of [1, 2]) f.starts.set(generation, { email_state: "pending", email_send_status: null, email_claimed_at: null });
  expect(await planStartEmailClaim(f.db, "card", 0)).toBe("sent");
  expect(await planStartEmailClaim(f.db, "card", 1)).toBe("sent");
  expect(await planStartEmailClaim(f.db, "card", 2)).toBe("pending");
});

it("keeps a generation's previously recorded final email state when its new send columns are empty", async () => {
  const f = fixture();
  f.starts.set(2, { email_state: "unknown", email_send_status: null, email_claimed_at: null });
  expect(await planStartEmailClaim(f.db, "card", 2)).toBe("unknown");
});

it("does not report an unsent claim as released when the database answers false", async () => {
  const f = fixture();
  const send = vi.fn();
  expect(await sendPlanStartEmail(f.db, { cardId: "card", generation: 2, price: 79.99, firstChargeAt: "2026-12-02T00:00:00Z", origin: "https://unica.test" }, { send }, () => false))
    .toEqual({ status: "not_sent", released: false });
  expect(send).not.toHaveBeenCalled();
});
