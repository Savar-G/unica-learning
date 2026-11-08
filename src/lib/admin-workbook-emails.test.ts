import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import { getWorkbookEmailPanel } from "@/lib/admin-workbook-emails";
vi.mock("server-only", () => ({}));

it("loads the saved book's own family, child, card and email number using only admin reads", async () => {
  const requests: URL[] = [];
  const db = createClient<Database>("https://fixture.invalid", "synthetic", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input)); requests.push(url);
      expect(init?.method).toBe(url.pathname.includes("/rpc/") ? "POST" : "GET");
      const name = url.pathname.split("/").at(-1);
      if (name === "admin_card_setups") return Response.json([{ id: "correct-card" }]);
      if (name === "admin_parents") return Response.json([{ name: "Priya", email: "parent@example.invalid" }]);
      if (name === "admin_children") return Response.json([{ first_name: "Asha" }]);
      if (name === "workbook_emails") return Response.json([]);
      throw Error(`Unexpected request: ${name}`);
    } },
  });
  const panel = await getWorkbookEmailPanel({ db, email: "admin@example.invalid", userId: "admin" }, { parentId: "family-b", childId: "child-b", number: 4 });
  expect(panel?.cardId).toBe("correct-card");
  const query = (name: string) => requests.find((u) => u.pathname.endsWith(`/${name}`))!.searchParams;
  expect(query("admin_card_setups").get("parent_id")).toBe("eq.family-b");
  expect(query("admin_card_setups").get("child_id")).toBe("eq.child-b");
  expect(query("admin_card_setups").get("card_saved_at")).toBe("not.is.null");
  expect(query("admin_children").get("parent_id")).toBe("eq.family-b");
  expect(query("admin_children").get("id")).toBe("eq.child-b");
  expect(query("workbook_emails").get("card_setup_id")).toBe("eq.correct-card");
  expect(query("workbook_emails").get("workbook_number")).toBe("eq.4");
});
