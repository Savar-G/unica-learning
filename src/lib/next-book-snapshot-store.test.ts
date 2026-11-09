import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database";
import { nextBookSnapshotStore } from "./next-book-snapshot-store";

// #476 review: the Supabase store sends the admission's test-family rule to admit_next_book_run (migration
// 20261109192936_next_book_admit_test_only.sql), and reads its refusal back.

const ID = "00000000-0000-4000-8500-000000000001";

function fakeDb(data: unknown) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const db = { rpc: async (name: string, args: Record<string, unknown>) => { calls.push({ name, args }); return { data, error: null }; } };
  return { calls, db: db as unknown as SupabaseClient<Database> };
}

describe("the next-book store's admission", () => {
  // Falsifier: p_test_only is not sent as given (false when absent), or the refusal is not read back.
  it("sends p_test_only and reads test-families-only back as a refusal", async () => {
    const refused = fakeDb({ status: "refused", reason: "test-families-only" });
    expect(await nextBookSnapshotStore(refused.db).admit(ID, null, { maxAttempts: 2, staleSeconds: 360, testOnly: true }))
      .toEqual({ status: "refused", reason: "test-families-only" });
    expect(refused.calls).toEqual([{ name: "admit_next_book_run", args: { p_snapshot: ID, p_by: null, p_email: null, p_max_attempts: 2,
      p_stale_seconds: 360, p_test_only: true } }]);
    const old = fakeDb({ status: "started", run: ID, existing: false });
    expect(await nextBookSnapshotStore(old.db).admit(ID, null, { maxAttempts: 2, staleSeconds: 360 })).toEqual({ status: "started", runId: ID, existing: false });
    expect(old.calls[0].args.p_test_only).toBe(false);
  });
});
