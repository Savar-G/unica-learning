import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import ParentDashboardExplorer from "./page";
import { deskGate } from "@/lib/desk";

const auth = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/admin-store", () => ({ requireAdmin: auth.requireAdmin }));
vi.mock("@/components/admin", () => ({ AdminFrame: ({ children }: { children: ReactNode }) => createElement("main", null, children) }));
vi.mock("@/components/admin-parent-dashboard", () => ({ AdminParentDashboard: ({ selection }: { selection: { view: string } }) => createElement("div", null, `Synthetic ${selection.view}`) }));
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });

it.each(["signed out", "another parent", "child desk"])("requires independent page authorization for %s, including forged demo and sample IDs", async () => {
  auth.requireAdmin.mockRejectedValue(new Error("NOT_FOUND"));
  await expect(ParentDashboardExplorer({ searchParams: Promise.resolve({ demo: "1", child: "real-child", view: "account" }) } as never)).rejects.toThrow("NOT_FOUND");
  expect(auth.requireAdmin).toHaveBeenCalledTimes(1);
});

it("denies a production demo request before it renders anything", async () => {
  vi.stubEnv("NODE_ENV", "production");
  auth.requireAdmin.mockRejectedValue(new Error("NOT_FOUND"));
  await expect(ParentDashboardExplorer({ searchParams: Promise.resolve({ demo: "1" }) } as never)).rejects.toThrow("NOT_FOUND");
  expect(auth.requireAdmin).toHaveBeenCalledTimes(1);
});

it("admits an admin and reads no family, billing or profile rows", async () => {
  auth.requireAdmin.mockResolvedValue({ email: "admin@example.invalid", db: new Proxy({}, { get() { throw new Error("No family read is needed"); } }) });
  const page = await ParentDashboardExplorer({ searchParams: Promise.resolve({ view: "account" }) } as never);
  expect(renderToStaticMarkup(page)).toContain("Synthetic account");
  expect(auth.requireAdmin).toHaveBeenCalledTimes(1);
});

it("keeps the child desk lock on the entry path", () => {
  expect(deskGate("/admin/parent-dashboard", "11111111-1111-4111-8111-111111111111.22222222-2222-4222-8222-222222222222", "11111111-1111-4111-8111-111111111111", true)).toBe("to-desk");
});
