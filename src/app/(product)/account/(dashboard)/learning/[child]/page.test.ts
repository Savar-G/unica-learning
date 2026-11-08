import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import LearningPage from "./page";

// The learning card page (#126) that the Account tab links to (#555). A family without the dashboard must get the page
// it had: `learning-page.golden.html` was written from the page before #555 changed anything.
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ usePathname: () => "/account/learning/sample-child",
  useRouter: () => ({}),
  notFound: () => { throw new Error("NOT FOUND"); },
  redirect: (path: string) => { throw new Error(`REDIRECT ${path}`); },
}));
const state = vi.hoisted(() => ({ dashboard: false, child: null as Record<string, unknown> | null }));
vi.mock("@/lib/parent-dashboard-server", () => ({ parentDashboard: async () => (state.dashboard ? { children: [], remembered: null, pinSet: true, timeZoneSaved: true } : null) }));
vi.mock("@/lib/supabase-auth", () => ({
  parentId: async () => "p1",
  sessionClient: async () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.child }) }) }) }) }),
}));

const ID = "7f1c2a4e-1b2c-4d3e-8f90-123456789abc";
const EMPTY = { id: ID, first_name: "Asha", learning_styles: [], interests: [], learning_note: null, math_feeling: null, learning_goal: null, weekly_time: null };
const FILLED = { ...EMPTY, learning_styles: ["pictures"], interests: ["space"], learning_note: "Long division", math_feeling: "avoids", learning_goal: "catch_up", weekly_time: "1_to_2h" };
const render = async () => renderToStaticMarkup(createElement("div", null, await LearningPage({ params: Promise.resolve({ child: ID }) } as Parameters<typeof LearningPage>[0])));

beforeEach(() => { state.dashboard = false; state.child = EMPTY; });

it("gives a family without the dashboard the same page, empty and filled", async () => {
  const empty = await render();
  state.child = FILLED;
  await expect(`${empty}\n${await render()}\n`).toMatchFileSnapshot("./learning-page.golden.html");
});

it("sends a dashboard family back to the Account tab, where the learning card is", async () => {
  state.dashboard = true;
  const out = await render();
  expect(out).toContain('href="/account/settings">← Your account');
});

it("finds nothing for another family's child, whom row-level security does not return", async () => {
  state.child = null;
  await expect(render()).rejects.toThrow("NOT FOUND");
});
