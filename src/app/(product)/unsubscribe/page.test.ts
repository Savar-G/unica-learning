import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// The unsubscribe page for the monthly summary email's own link (#563).
const lookup = vi.hoisted(() => ({ value: { state: "subscribed", scope: "monthly" } as { state: string; scope: string | null } }));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("@/lib/reminder-store", () => ({ unsubscribeState: async () => lookup.value }));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => ({}) }));
vi.mock("@/components/account", () => ({ TrackOnce: () => null }));
vi.mock("@/components/support-page", () => ({ SupportPage: ({ label, children }: { label: string; children: unknown }) => createElement("main", { "data-label": label }, children as never) }));

import UnsubscribePage from "./page";

const render = async () => renderToStaticMarkup(await UnsubscribePage({ params: Promise.resolve({}), searchParams: Promise.resolve({ t: "tok" }) }));

beforeEach(() => { lookup.value = { state: "subscribed", scope: "monthly" }; });

it("names this email, and tells the parent the other emails do not change", async () => {
  const out = await render();
  expect(out).toContain('data-label="Monthly summary emails"');
  expect(out).toContain("Turn off monthly summary emails");
  expect(out).toContain("Other emails from us do not change.");
  expect(out).not.toMatch(/\b(she|her|he|him|his)\b/i);
  expect(out).not.toContain("reminders");
  expect(out).not.toContain("Maya");
});

it("says it is off when the link is opened again", async () => {
  lookup.value = { state: "unsubscribed", scope: "monthly" };
  const out = await render();
  expect(out).toContain("Monthly summary emails are off.");
  expect(out).not.toContain("Reminders are off");
});

it("the other links keep their own words", async () => {
  lookup.value = { state: "unsubscribed", scope: "maya" };
  expect(await render()).toContain("Maya emails are off.");
  lookup.value = { state: "unsubscribed", scope: "reminders" };
  expect(await render()).toContain("Reminders are off.");
});
