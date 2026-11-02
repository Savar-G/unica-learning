import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import Account from "./page";
import StartScreen from "./start/[child]/page";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({}) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/maya-minutes-server", () => ({ parentMinutes: async () => new Map() }));
vi.mock("@/lib/parent-pin-server", () => ({ pinIsSet: async () => false }));
vi.mock("@/lib/workbook-store", () => ({ workbookStore: () => ({ childWorkbooks: async () => [] }) }));

const family = vi.hoisted(() => ({ postal: "V3S 1A1" as string | null, timeZone: null as string | null }));
const opensAt = Date.parse("2026-11-18T04:29:00Z");
vi.mock("@/lib/test-attempt-server", () => ({
  parentStartStates: async () => new Map([["c1", { kind: "wait", completedAt: Date.parse("2026-10-19T04:29:00Z"), opensAt: Date.parse("2026-11-18T04:29:00Z") }]]),
}));
vi.mock("@/lib/supabase-auth", () => ({
  parentId: async () => "p1",
  sessionClient: async () => ({
    from: (table: string) => ({
      select: (columns: string) => {
        // Return only selected fields, so a missing postal projection fails this test.
        const rows: Record<string, Record<string, unknown>[]> = {
          parents: [{ name: "Alex Family", email: "alex@example.com", postal: family.postal, time_zone: family.timeZone }],
          children: [{ id: "c1", first_name: "Asha", grade: 3, province: "BC" }],
          reports: [],
        };
        const data = (rows[table] ?? []).map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => columns.split(/,\s*/).includes(key))));
        return { order: async () => ({ data }), eq: () => ({ maybeSingle: async () => ({ data: data[0] ?? null }) }), maybeSingle: async () => ({ data: data[0] ?? null }) };
      },
    }),
  }),
}));

beforeEach(() => { family.postal = "V3S 1A1"; family.timeZone = null; });

it.each([
  ["V3S 1A1", "9:29 p.m. on Tuesday, November 17"],
  ["M5V 2T6", "11:29 p.m. on Tuesday, November 17"],
  [null, "9:29 p.m. on Tuesday, November 17"],
  ["unknown", "9:29 p.m. on Tuesday, November 17"],
])("reads the parent's postal code on the account and start server pages: %s", async (postal, expected) => {
  family.postal = postal;
  const pages = [
    await Account({ params: Promise.resolve({}), searchParams: Promise.resolve({}) }),
    await StartScreen({ params: Promise.resolve({ child: "c1" }), searchParams: Promise.resolve({}) }),
  ];
  for (const page of pages) {
    const html = renderToStaticMarkup(createElement("div", null, page));
    expect(html).toContain(expected);
    expect(html).toContain(new Date(opensAt).toISOString());
    expect(html).not.toMatch(/\b(?:UTC|PST|PDT|EST|EDT|GMT)\b/);
  }
});


it.each([
  ["America/Toronto", "V3S 1A1", "11:29 p.m."],
  ["America/Vancouver", "M5V 2T6", "9:29 p.m."],
  ["Not/AZone", "T2P 1J9", "10:29 p.m."],
])("reads and applies browser zone %s before postal %s", async (timeZone, postal, clock) => {
  family.timeZone = timeZone;
  family.postal = postal;
  for (const page of [
    await Account({ params: Promise.resolve({}), searchParams: Promise.resolve({}) }),
    await StartScreen({ params: Promise.resolve({ child: "c1" }), searchParams: Promise.resolve({}) }),
  ]) {
    const html = renderToStaticMarkup(createElement("div", null, page));
    expect(html).toContain(`${clock} on Tuesday, November 17`);
    expect(html).not.toMatch(/\b(?:UTC|PST|PDT|EST|EDT|GMT)\b/);
  }
});
