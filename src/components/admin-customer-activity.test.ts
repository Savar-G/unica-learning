import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
const fake = vi.hoisted(() => ({ load: vi.fn(), book: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock("@/lib/customer-activity-server", () => ({ loadCustomerActivity: fake.load, loadCustomerBook: fake.book }));
import { CustomerActivityPanel } from "./admin-customer-activity";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const props = { admin: { db: createClient<Database>("https://synthetic.supabase.co", "fake"), userId: id(1), email: "synthetic@example.invalid" },
  filters: { attention: null, search: null, parent: id(2), child: null, book: null, childrenAfter: null, from: "2026-11-01", to: "2026-11-17", type: null, actor: null, cursor: null }, tests: false, now: Date.parse("2026-11-16T12:00:00Z") };
beforeEach(() => { vi.clearAllMocks(); fake.book.mockResolvedValue(null); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("keeps empty history distinct from unavailable data, with labelled filters and private notes", async () => {
  fake.load.mockResolvedValue({ children: { data: [], error: false }, history: { data: [], error: false }, metrics: { data: null, error: true } });
  const html = renderToStaticMarkup(await CustomerActivityPanel(props));
  expect(html).toContain("No retained events match these filters."); expect(html).toContain("Summary unavailable. No counts are shown.");
  expect(html).toContain('name="actor"'); expect(html).toContain('name="from"'); expect(html).toContain('name="attention"');
  expect(html).toContain("Add a private contact note"); expect(html).toMatch(/maxLength="2000"/i);
  expect(fake.book).not.toHaveBeenCalled();
  fake.load.mockResolvedValue({ children: { data: null, error: true }, history: { data: null, error: true }, metrics: { data: null, error: true } });
  const partial = renderToStaticMarkup(await CustomerActivityPanel(props));
  expect(partial).toContain("History unavailable."); expect(partial).not.toContain("No retained events match");
});
it("escapes private note text and labels an unknown historical actor without a fake identity", async () => {
  fake.load.mockResolvedValue({ children: { data: [], error: false }, metrics: { data: null, error: true }, history: { error: false, data: [{ key: "activity:" + id(3), at: "2026-11-16T12:00:00Z", parent: id(2), child: null, book: null, type: "note", actor: "unknown", actorName: null, label: "Contact note", href: "/admin/parents/" + id(2), note: "<script>private</script>", familyName: "Family", childName: null, test: false }] } });
  const html = renderToStaticMarkup(await CustomerActivityPanel(props));
  expect(html).toContain("&lt;script&gt;private&lt;/script&gt;"); expect(html).not.toContain("<script>private"); expect(html).toContain("Not recorded");
});
