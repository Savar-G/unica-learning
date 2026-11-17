import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
const fake = vi.hoisted(() => ({ load: vi.fn(), book: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock("@/lib/customer-activity-server", () => ({ loadCustomerActivity: fake.load, loadSelectedCustomerBook: fake.book, childInactivity: () => ({ state: "unknown", due: null }) }));
import { CustomerActivityPanel } from "./admin-customer-activity";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const props = { admin: { db: createClient<Database>("https://synthetic.supabase.co", "fake"), userId: id(1), email: "synthetic@example.invalid" },
  filters: { attention: null, search: null, parent: id(2), child: null, book: null, childrenAfter: null, booksBefore: null, from: "2026-11-01", to: "2026-11-17", type: null, actor: null, cursor: null }, tests: false, now: Date.parse("2026-11-16T12:00:00Z") };
beforeEach(() => { vi.clearAllMocks(); fake.book.mockResolvedValue(null); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("keeps empty history distinct from unavailable data, with labelled filters and private notes", async () => {
  fake.load.mockResolvedValue({ children: { data: [], error: false }, history: { data: [], error: false }, metrics: { data: null, error: true } });
  const html = renderToStaticMarkup(await CustomerActivityPanel(props));
  expect(html).toContain("No retained events match these filters."); expect(html).toContain("Summary unavailable. No counts are shown.");
  expect(html).toContain('name="actor"'); expect(html).toContain('name="from"'); expect(html).toContain('name="attention"');
  expect(html).toContain("Add a private contact note"); expect(html).toMatch(/maxLength="2000"/i);
  expect(fake.book).toHaveBeenCalledWith(props.admin, props.filters, false);
  fake.load.mockResolvedValue({ children: { data: null, error: true }, history: { data: null, error: true }, metrics: { data: null, error: true } });
  const partial = renderToStaticMarkup(await CustomerActivityPanel(props));
  expect(partial).toContain("History unavailable."); expect(partial).not.toContain("No retained events match");
});
it("escapes private note text and labels an unknown historical actor without a fake identity", async () => {
  fake.load.mockResolvedValue({ children: { data: [], error: false }, metrics: { data: null, error: true }, history: { error: false, data: [{ key: "activity:" + id(3), at: "2026-11-16T12:00:00Z", parent: id(2), child: null, book: null, type: "note", actor: "unknown", actorName: null, label: "Contact note", href: "/admin/parents/" + id(2), note: "<script>private</script>", familyName: "Family", childName: null, test: false }] } });
  const html = renderToStaticMarkup(await CustomerActivityPanel(props));
  expect(html).toContain("&lt;script&gt;private&lt;/script&gt;"); expect(html).not.toContain("<script>private"); expect(html).toContain("Not recorded");
});

it("loads an explicitly selected old book even when no child summary is on this page", async () => {
  fake.load.mockResolvedValue({ children: { data: [], error: false }, history: { data: [], error: false }, metrics: { data: null, error: true } });
  fake.book.mockResolvedValue({ id: id(50), child: id(4), parent: id(2), name: "Child", number: 1, progress: { progress: { days: [{ day: 7, requiredPages: [id(6)], acceptedPages: [id(6)], gaps: [] }], pages: [{ pageId: id(6), markingStatus: "ready", reviewReady: true }] }, canonicalPages: [] } });
  const filters = { ...props.filters, parent: null, book: id(50) };
  const html = renderToStaticMarkup(await CustomerActivityPanel({ ...props, filters }));
  expect(fake.book).toHaveBeenCalledWith(props.admin, filters, false);
  expect(html).toContain("1 days fully marked"); expect(html).not.toContain("Book progress unavailable");
  expect(html).not.toContain("Needs attention:");
});

it.each([0, 19, 20])("keeps exactly one selected Book option at loaded position %s", async position => {
  const books = Array.from({ length: 21 }, (_, n) => ({ id: id(100 + n), number: 21 - n, status: "shipped", delivered: null, firstScan: null, receipts: 0, scannedPages: 0, repeatPhotos: 0, contractAvailable: false }));
  const child = { id: id(4), parent: id(2), name: "Child", family: "Family", test: false, plan: null, assessment: null, lastWork: null, lastVisit: null, zone: "America/Vancouver", books,
    maya: { sessions: 0, ended: 0, withWork: 0, solved: 0, technical: 0, noOutcome: 0, seconds: null, unknownDuration: 0 } };
  fake.load.mockResolvedValue({ children: { data: [child], error: false }, history: { data: [], error: false }, metrics: { data: null, error: true } });
  const selected = books[position];
  fake.book.mockResolvedValue({ ...selected, child: child.id, parent: child.parent, name: child.name, progress: null });
  const html = renderToStaticMarkup(await CustomerActivityPanel({ ...props, filters: { ...props.filters, book: selected.id } }));
  const select = html.match(/<select name="book"[\s\S]*?<\/select>/)![0];
  const chosen = [...select.matchAll(/<option\b[^>]*\bselected=""[^>]*>/g)].map(m => m[0]);
  expect(chosen).toEqual([`<option value="${selected.id}" selected="">`]);
  expect(select.split(`value="${selected.id}"`).length - 1).toBe(1);
});
