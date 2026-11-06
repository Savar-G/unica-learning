import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { FEEDBACK_SIGN_IN } from "@/lib/feedback";
import { SAMPLE_STAGE_FACTS } from "@/lib/admin-parent-dashboard";
const auth = vi.hoisted(() => ({ parent: null as string | null, cookie: undefined as string | undefined }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw Error(`redirect:${path}`); } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => auth.cookie ? { value: auth.cookie } : undefined }) }));
vi.mock("@/lib/supabase-auth", () => ({ parentId: async () => auth.parent, sessionClient: async () => ({ from: () => { throw Error("Feedback must not read stage, children or workbooks"); } }) }));
vi.mock("@/components/feedback-form", () => ({ FeedbackForm: () => null }));
vi.mock("@/components/support-page", () => ({ SupportPage: () => null }));
import FeedbackPage from "./page";
const parent = randomUUID();
beforeEach(() => { auth.parent = parent;auth.cookie = undefined; });
const page = (query = {}) => FeedbackPage({ searchParams: Promise.resolve(query) } as Parameters<typeof FeedbackPage>[0]);
it("sends a signed-out visitor back to the plain feedback URL after sign-in", async () => {
  auth.parent = null;await expect(page()).rejects.toThrow(`redirect:${FEEDBACK_SIGN_IN}`);
});
it.each([...Object.keys(SAMPLE_STAGE_FACTS), "no_children", "no_workbook", "release_off"])("opens without stage or workbook reads: %s", async () => {
  const element = await page();expect(element.props.title).toBe("Feedback");
});
it("refuses an open Desk, including direct page rendering", async () => {
  auth.cookie = `${parent}.${randomUUID()}`;await expect(page()).rejects.toThrow("redirect:/tutor");
});
it("preselects only a known product and removes identifying source context", async () => {
  const element = await page({product:"marking", from:"/account/report/private?token=secret"});
  const form = element.props.children[1];expect(form.props.initialProduct).toBe("marking");expect(form.props.source).toBe("/account/report");
});
