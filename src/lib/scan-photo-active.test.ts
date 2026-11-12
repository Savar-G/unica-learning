import { expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";

vi.mock("server-only", () => ({}));
import { scanCropStore } from "./scan-crops-store";
import { scanView } from "./scan-photo-server";
import { readScanStack } from "./scan-stack-server";

it("excludes a 23.6-hour pending photo from all three reads", async () => {
  const now = Date.parse("2026-11-08T12:00:00Z");
  vi.useFakeTimers(); vi.setSystemTime(now);
  try {
    const photo = { id: "photo", parent_id: "parent", child_id: "child", state: "pending", page_id: "page" as string | null, workbook_id: "book" as string | null,
      created_at: new Date(now - 23.6 * 3_600_000).toISOString(), expires_at: new Date(now + 3_600_000).toISOString(), printed_revision: "r" };
    const db = { from(table: string) {
      const b = { select: () => b, eq: () => b, in: () => b, order: () => b, limit: () => b,
        maybeSingle: async () => ({ data: table === "scan_photos" ? photo : null, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: table === "scan_photos" ? [photo] : [], error: null }).then(resolve) };
      return b;
    } } as unknown as SupabaseClient<Database>;
    photo.page_id = null; photo.workbook_id = null;
    expect((await scanCropStore(db).frame({ parent: "parent", photo: "photo" }))?.photo.active).toBe(false);
    expect((await scanView(db, "parent", "photo"))?.state).toBe("expired");
    photo.page_id = "page"; photo.workbook_id = "book";
    expect(await readScanStack(db, "parent", "child", true, now)).toEqual({ photos: [], pages: [] });
  } finally { vi.useRealTimers(); }
});
