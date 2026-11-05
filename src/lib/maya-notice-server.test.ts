import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/stripe", () => ({ stripe: () => null }));
const state = vi.hoisted(() => ({ agreed: false, client: null as unknown }));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => state.client }));
import { mayaNoticeDue } from "@/lib/maya-notice-server";

// #529 with #530: a marked test family has chat open, and chat serves Grade 3 and up. A family with only younger children
// cannot chat, so the notice does not ask it yet. An agreed family is never asked.

const PARENT = "11111111-1111-4111-8111-111111111111";
const db = (test = true) => createClient<Database>("https://test.invalid", "test", { global: { fetch: async (input) => {
  const table = new URL(String(input)).pathname.split("/").pop();
  if (table === "test_accounts") return Response.json(test ? [{ parent_id: PARENT }] : []);
  if (table === "maya_chat_families") return Response.json([]);
  if (table === "maya_notice_acceptances") return Response.json(state.agreed ? [{ parent_id: PARENT, notice_version: "v", accepted_by: PARENT, accepted_at: "2026-11-05T12:00:00Z" }] : []);
  throw new Error(`Unexpected read of ${table}`);
} } });

describe("whether a family sees the Maya notice", () => {
  beforeEach(() => { state.agreed = false; state.client = db(); });

  it("asks a family whose child can chat and that has not agreed", async () => {
    expect(await mayaNoticeDue(PARENT, 3)).toBe(true);
  });

  it("does not ask a family with only younger children, or an unknown grade", async () => {
    expect(await mayaNoticeDue(PARENT, 2)).toBe(false);
    expect(await mayaNoticeDue(PARENT, null)).toBe(false);
  });

  it("does not ask a family that agreed, or a family with chat closed", async () => {
    state.agreed = true;
    expect(await mayaNoticeDue(PARENT, 5)).toBe(false);
    state.agreed = false;
    state.client = db(false);
    expect(await mayaNoticeDue(PARENT, 5)).toBe(false);
  });

  it("asks no one without the secret key", async () => {
    state.client = null;
    expect(await mayaNoticeDue(PARENT, 5)).toBe(false);
  });
});
