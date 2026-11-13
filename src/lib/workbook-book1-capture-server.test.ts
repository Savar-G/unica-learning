import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database";
import { book1HasActivity, book1SiteDeps } from "./workbook-book1-capture-server";

// #870 The site's capture deps carry this deploy's commit (the source a run frame's versions.build uses).
const db = {} as SupabaseClient<Database>;
afterEach(() => { vi.unstubAllEnvs(); });

it("reads the deploy's commit from VERCEL_GIT_COMMIT_SHA", () => {
  // Wrong if: the site compares a frame's build with anything but the deploy's commit, or invents one when none is set.
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "a".repeat(40));
  expect(book1SiteDeps(db).build).toBe("a".repeat(40));
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
  expect(book1SiteDeps(db).build).toBeNull();
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", undefined);
  expect(book1SiteDeps(db).build).toBeNull();
});

it("tells whether any mark, learning event or scan receipt of the book exists, and throws when a read fails", async () => {
  const fake = (counts: Record<string, number | null>) => ({ from: (t: string) => ({ select: () => ({ eq: async () => ({ count: counts[t], error: null }) }) }) }) as unknown as SupabaseClient<Database>;
  const none = { scan_marking_items: 0, learning_events: 0, workbook_scan_receipts: 0 };
  expect(await book1HasActivity(fake(none), "d")).toBe(false);
  expect(await book1HasActivity(fake({ ...none, learning_events: 2 }), "d")).toBe(true);
  expect(await book1HasActivity(fake({ ...none, workbook_scan_receipts: 1 }), "d")).toBe(true);
  await expect(book1HasActivity(fake({ ...none, learning_events: null }), "d")).rejects.toThrow("book1-activity-read");
});
