import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-auth", () => ({ parentId: async () => "parent", sessionClient: async () => ({}) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT ${path}`); } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
import Start from "./page";

it("preserves a valid referral link for an existing signed-in family", async () => {
  await expect(Start({ params: Promise.resolve({}), searchParams: Promise.resolve({ referral: "u-source1" }) })).rejects.toThrow("REDIRECT /account/referrals?referral=U-SOURCE1");
});

it("keeps the ordinary account redirect when the referral parameter is invalid", async () => {
  await expect(Start({ params: Promise.resolve({}), searchParams: Promise.resolve({ referral: "https://other.test" }) })).rejects.toThrow("REDIRECT /account");
});
