import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import { adVisitRow } from "@/lib/ad-visits";
import type { Database } from "@/lib/database";
import { buildTeamDigest, digestPeriod, readFrom, teamDigestEmail } from "@/lib/team-digest";
import { teamDigestStore } from "@/lib/team-digest-store";

vi.mock("server-only", () => ({}));

const at = "2026-11-12T19:00:00.000Z";
const parent = "11111111-aaaa-4aaa-8aaa-000000000001";
const child = "22222222-bbbb-4bbb-8bbb-000000000002";
const period = digestPeriod("2026-11-13");
type Row = Record<string, unknown>;

function reader(tables: Record<string, Row[]>) {
  const requests: URL[] = [];
  const db = createClient<Database>("https://fixture.invalid", "synthetic-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input) => {
      const url = new URL(String(input));
      requests.push(url);
      const table = url.pathname.split("/").pop()!;
      if (table === "scan_team_waiting_count") return Response.json(0);
      let rows = [...(tables[table] ?? [])];
      for (const [key, filter] of url.searchParams) {
        if (filter.startsWith("eq.")) rows = rows.filter((r) => String(r[key]) === filter.slice(3));
        if (filter.startsWith("in.(")) {
          const values = filter.slice(4, -1).split(",");
          rows = rows.filter((r) => values.includes(String(r[key])));
        }
        if (filter.startsWith("gte.")) rows = rows.filter((r) => String(r[key]) >= filter.slice(4));
        if (filter.startsWith("lt.")) rows = rows.filter((r) => String(r[key]) < filter.slice(3));
      }
      const order = url.searchParams.get("order")?.split(",")[0];
      if (order) {
        const [key, direction] = order.split(".");
        rows.sort((a, b) => {
          const x = a[key] as number | string, y = b[key] as number | string;
          return (x < y ? -1 : x > y ? 1 : 0) * (direction === "desc" ? -1 : 1);
        });
      }
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? 1000);
      rows = rows.slice(offset, offset + limit);
      const selected = url.searchParams.get("select")?.split(",");
      return Response.json(selected ? rows.map((r) => Object.fromEntries(selected.map((key) => [key, r[key]]))) : rows);
    } },
  });
  return { requests, read: () => teamDigestStore(db).read(readFrom(period), period.to) };
}

it("does not email public names or messages that use campaign tag characters", async () => {
  const privateValues = ["emma-watson", "my-child-emma-needs-help"];
  const fixture = reader({ ad_visits: privateValues.map((campaign, i) => ({
    id: i + 1,
    ...adVisitRow({ visitId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, utm_source: "meta", utm_campaign: campaign }),
    visited_at: at,
  })) });
  const email = teamDigestEmail(buildTeamDigest(await fixture.read(), period), "https://unicalearning.com");
  for (const value of privateValues) {
    expect.soft(email.text).not.toContain(value);
    expect.soft(email.html).not.toContain(value);
  }
});

it("does not select unrelated public text for the email", async () => {
  const fixture = reader({});
  await fixture.read();
  const selected = fixture.requests.map((u) => u.searchParams.get("select") ?? "").join(",");
  expect(selected).not.toMatch(/utm_source|utm_content|utm_medium|referrer|source_section|error|text_body|first_name|to_address/);
});

it("does not report superseded Book 1 rows when drafts hold many approvals", async () => {
  const drafts = Array.from({ length: 200 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
  const approvals: Row[] = [];
  for (let revision = 1; revision <= 51; revision++) {
    for (const draft of drafts) approvals.push({ id: approvals.length + 1, workbook_id: draft, action: "workbook-approved", detail: { revision } });
  }
  const fixture = reader({
    workbook_book1_baseline_pending: drafts.map((draft) => ({ draft_id: draft, revision: 50, child_id: child, parent_id: parent, reason: "planning-capture-missing", created_at: at })),
    workbook_audit: approvals,
  });
  const rows = await fixture.read();
  // Each draft's latest approval is revision 51. SQL therefore returns no pending revision 50.
  expect(rows.capped).not.toContain("Book 1 approvals");
  expect(rows.book1Pending).toHaveLength(0);
});
