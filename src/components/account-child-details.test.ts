import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { childDetails } from "./account-child-details";

// One section per child on the Account tab (#555). The rows come back only for the parent's own children.
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({}) }));

const EMPTY = { learning_styles: [], interests: [], learning_note: null, math_feeling: null, learning_goal: null, weekly_time: null };
const ASHA = { id: "c1", first_name: "Asha", grade: 3, ...EMPTY };
const OMAR = { id: "c2", first_name: "Omar", grade: 0, ...EMPTY, interests: ["space"], math_feeling: "avoids", learning_note: "Long division" };

function dbWith(result: { data: unknown[] | null; error: { message: string } | null }) {
  const asked: string[] = [];
  const query = {
    select: (columns: string) => { asked.push(columns); return query; },
    order: () => query,
    then: (resolve: (r: typeof result) => unknown) => resolve(result),
  };
  return { asked, db: { from: () => query } as unknown as Parameters<typeof childDetails>[0] };
}
const render = async (rows: unknown[]) => renderToStaticMarkup(await childDetails(dbWith({ data: rows, error: null }).db));

it("has one section per child, each with the first name and the learning card", async () => {
  const out = await render([ASHA, OMAR]);
  expect(out.match(/<section/g)).toHaveLength(2);
  expect(out).toContain('value="Asha"');
  expect(out).toContain('value="Omar"');
  expect(out).toContain('href="/account/learning/c1"');
  expect(out).toContain('href="/account/learning/c2"');
});

it("shows the saved answers, or says there are none, and links to the one learning card page", async () => {
  const out = await render([ASHA, OMAR]);
  expect(out).toContain("Long division");
  expect(out).toContain("<b>Interested in:</b>");
  expect(out).toContain("No answers yet.");
  expect(out).toContain("Tell us how Asha learns");
  expect(out).toContain("Change how Omar learns");
});

it("shows the school grade with no way to change it here, only the support email", async () => {
  const out = await render([ASHA, OMAR]);
  expect(out).toContain("School grade: Grade 3");
  expect(out).toContain("School grade: Kindergarten");
  expect(out).toContain('href="mailto:contact@unicalearning.com"');
  expect(out).not.toMatch(/name="grade"|<select|role="radiogroup"/);
});

it("names the child, and never says she or her, in the section and in the form's messages", async () => {
  const out = await render([ASHA]);
  const form = readFileSync("src/components/account-child-name.tsx", "utf8");
  for (const text of [out, form]) expect(text).not.toMatch(/\b(she|her|hers|he|him|his)\b/i);
  expect(out).toContain("To change Asha&#x27;s grade");
});

it("says so when the children cannot be read, and shows no empty form", async () => {
  const out = renderToStaticMarkup(await childDetails(dbWith({ data: null, error: { message: "down" } }).db));
  expect(out).toContain('role="alert"');
  expect(out).not.toContain("<form");
});

it("shows nothing for a family with no children", async () => {
  expect(await render([])).toBe("");
});
