import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { listChildren } from "@/lib/parent-view";
import { parentViewReader } from "@/lib/parent-view-server";

// The parent view's Supabase reader, through its interface, against a fake PostgREST. It checks what the memory reader
// cannot: the tables and columns asked for, the parent's filter on secret-key reads, and that a failed read throws.
vi.mock("server-only", () => ({}));

const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const TEST = "33333333-3333-4333-8333-333333333333";
const NOW = Date.parse("2026-11-04T18:00:00Z");

function grantedColumns(file: string, table: string): Set<string> {
  const grant = readFileSync(`supabase/migrations/${file}`, "utf8").match(new RegExp(`grant select \\(([^)]+)\\)\\s+on table public\\.${table} to authenticated`, "i"));
  if (!grant) throw new Error(`Missing SELECT grant for ${table}`);
  return new Set(grant[1].split(",").map((c) => c.trim()));
}
const GRANTED: Record<string, Set<string>> = {
  reports: grantedColumns("20261011_add_reports.sql", "reports"),
  assessments: grantedColumns("20261010_add_assessments.sql", "assessments"),
  card_setups: grantedColumns("20261011_add_report_card_waitlist.sql", "card_setups"),
};

const ROWS: Record<string, unknown> = {
  children: [{ id: CHILD, first_name: "Leah", grade: 3 }],
  reports: [{ id: "report-1", child_id: CHILD, assessment_id: TEST, assessment: { province: "BC" } }],
  card_setups: [{ child_id: CHILD }],
  workbook_delivery_receipts: [],
  workbooks: [{ child_id: CHILD, number: 1 }],
  assessments: [{ id: TEST, child_id: CHILD, seed: 1, status: "completed", started_at: "2026-11-01T00:00:00Z", last_answer_at: "2026-11-01T00:30:00Z", resume_until: "2026-11-02T00:30:00Z", completed_at: "2026-11-01T00:40:00Z", unreliable: null }],
  test_accounts: null,
  admin_users: null,
};

function client(requests: URL[], failing?: string) {
  return createClient<never>("https://fixture.invalid", "synthetic-key", { auth: { persistSession: false }, global: { fetch: async (input) => {
    const url = new URL(String(input));
    requests.push(url);
    const table = url.pathname.replace("/rest/v1/", "");
    if (table === failing) return Response.json({ message: "boom" }, { status: 500 });
    return Response.json(ROWS[table] ?? []);
  } } }) as never;
}
function reader(failing?: string, env: Record<string, string> = {}) {
  const session: URL[] = [];
  const admin: URL[] = [];
  return { session, admin, reader: parentViewReader(client(session, failing), PARENT, client(admin, failing), env) };
}
const tables = (requests: URL[]) => [...new Set(requests.map((u) => u.pathname.replace("/rest/v1/", "")))].sort();

describe("the Supabase reader", () => {
  it("gives the stage from the stored rows, with no plan row as unknown", async () => {
    const r = reader();
    const [child] = await listChildren(r.reader, NOW);
    expect(child).toEqual({ id: CHILD, firstName: "Leah", schoolGrade: 3, stage: "first_book_coming", opensOn: "overview", tabs: ["overview", "workbooks", "assessment", "account"], readOnly: false, currentWorkbook: { number: 1 }, reportIds: ["report-1"] });
  });
  it("reads only the tables it needs, and no raw profile, event or call table", async () => {
    const r = reader();
    await listChildren(r.reader, NOW);
    expect(tables(r.session)).toEqual(["card_setups", "children", "reports", "workbook_delivery_receipts", "workbooks"]);
    expect(tables(r.admin)).toEqual(["admin_users", "assessments", "test_accounts"]);
  });
  it("keeps the parent's session within the database's column grants", async () => {
    const r = reader();
    await listChildren(r.reader, NOW);
    const select = (table: string) => r.session.find((u) => u.pathname.endsWith(`/${table}`))!.searchParams.get("select")!;
    expect(select("reports")).toBe("id,child_id,assessment_id,assessment:assessments!inner(province)");
    for (const column of ["id", "child_id", "assessment_id"]) expect(GRANTED.reports.has(column)).toBe(true);
    expect(GRANTED.assessments.has("province")).toBe(true);
    expect(select("card_setups")).toBe("child_id");
    for (const column of ["child_id", "card_saved_at"]) expect(GRANTED.card_setups.has(column)).toBe(true);
  });
  it("filters every secret-key read on the signed-in parent", async () => {
    const r = reader();
    await listChildren(r.reader, NOW);
    expect(r.admin.find((u) => u.pathname.endsWith("/assessments"))!.searchParams.get("parent_id")).toBe(`eq.${PARENT}`);
    expect(r.admin.find((u) => u.pathname.endsWith("/test_accounts"))!.searchParams.get("parent_id")).toBe(`eq.${PARENT}`);
  });
  it("asks only for shipped workbooks and saved cards", async () => {
    const r = reader();
    await listChildren(r.reader, NOW);
    expect(r.session.find((u) => u.pathname.endsWith("/workbooks"))!.searchParams.get("status")).toBe("eq.shipped");
    expect(r.session.find((u) => u.pathname.endsWith("/card_setups"))!.searchParams.get("card_saved_at")).toBe("not.is.null");
  });
  it.each(["children", "reports", "card_setups", "workbook_delivery_receipts", "workbooks", "assessments"])("throws when %s fails", async (table) => {
    await expect(listChildren(reader(table).reader, NOW)).rejects.toThrow();
  });
  it("throws without the secret key, so a family never reads as having no tests", async () => {
    await expect(listChildren(parentViewReader(client([]), PARENT, null, {}), NOW)).rejects.toThrow("no secret key");
  });
  it("turns Progress on only with its server switch", async () => {
    expect((await listChildren(reader(undefined, { PROGRESS_TAB_ENABLED: "on" }).reader, NOW))[0].tabs).toContain("progress");
    expect((await listChildren(reader(undefined, { PROGRESS_TAB_ENABLED: "off" }).reader, NOW))[0].tabs).not.toContain("progress");
  });
});
