import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import Page from "./page";

const f = vi.hoisted(() => ({ requireAdmin: vi.fn(), serviceSelect: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin-store", () => ({ requireAdmin: f.requireAdmin }));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => ({ from: () => ({ select: f.serviceSelect }) }) }));
vi.mock("@/lib/scan-marking-server", () => ({
  readScanMarking: async () => ({ marks: [], items: [], photoAvailable: false, detail: null }),
}));
vi.mock("@/lib/scan-marking-store", () => ({ markingCommand: vi.fn(), scanMarkChanges: async () => [] }));
vi.mock("@/components/admin-frame", () => ({
  AdminFrame: ({ children }: { children: ReactNode }) => createElement("main", null, children),
}));

const id = "00000000-0000-4000-8000-000000000001";
const page = () => Page({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) });

function query(result: { data: unknown; error: unknown }) {
  const cursor = {
    eq: () => cursor,
    maybeSingle: async () => result,
  };
  return cursor;
}

beforeEach(() => {
  vi.resetAllMocks();
  f.requireAdmin.mockResolvedValue({
    email: "admin@example.invalid",
    db: { from: () => ({ select: () => query({ data: { parent_id: "synthetic-family", state: "rejected" }, error: null }) }) },
  });
  f.serviceSelect.mockImplementation((columns: string) => query({
    data: columns === "reject_reason" ? { reject_reason: "qr" } : { photo_check: null },
    error: null,
  }));
});

it("shows the stored refusal in plain words on the existing scan detail", async () => {
  const html = renderToStaticMarkup(await page());
  expect(html).toContain("The page code could not be read.");
});

it("keeps the detail available when the reason column has not been applied", async () => {
  f.serviceSelect.mockImplementation((columns: string) => query(columns === "reject_reason"
    ? { data: null, error: { code: "42703" } }
    : { data: { photo_check: null }, error: null }));
  const html = renderToStaticMarkup(await page());
  expect(html).toContain("No reason was recorded.");
});
