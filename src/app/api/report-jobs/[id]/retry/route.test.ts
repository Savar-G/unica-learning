import { afterEach, beforeEach, expect, it, vi } from "vitest";

// The retry route of a report job (#771): only the run's secret starts a job, the job runs after the answer with no
// failure alert of its own, and the caller's email flag only narrows the email: the job still asks the database right
// before it sends (reportEmailAllowed).
vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  after: [] as (() => unknown)[],
  jobs: [] as { id: string; origin: string; options: { email?: boolean; failureAlert?: boolean; mayEmail?: () => Promise<boolean> } }[],
  allowed: [] as string[],
}));

vi.mock("next/server", () => ({ after: (run: () => unknown) => void h.after.push(run) }));
vi.mock("@/lib/account-server", () => ({ linkOrigin: () => "https://unicalearning.com" }));
vi.mock("@/lib/report-job", () => ({
  runReportJob: async (id: string, origin: string, options: (typeof h.jobs)[number]["options"]) => void h.jobs.push({ id, origin, options }),
}));
vi.mock("@/lib/report-retry-server", () => ({
  reportEmailAllowed: async (id: string) => {
    h.allowed.push(id);
    return false;
  },
}));

import * as route from "./route";

const ID = "6f1c1f0a-3b9e-4f53-9a3c-2f1d1e6b7a01";
const SECRET = "cron-secret-synthetic";

const post = (o: { auth?: string | null; id?: string; body?: string } = {}) => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const auth = o.auth === undefined ? `Bearer ${SECRET}` : o.auth;
  if (auth !== null) headers.authorization = auth;
  const id = o.id ?? ID;
  return route.POST(
    new Request(`https://unicalearning.com/api/report-jobs/${id}/retry`, { method: "POST", headers, ...(o.body !== undefined && { body: o.body }) }),
    { params: Promise.resolve({ id }) } as Parameters<typeof route.POST>[1],
  );
};

/** Runs what the route left for after its answer. */
const runAfter = async () => {
  for (const run of h.after.splice(0)) await run();
};

beforeEach(() => {
  h.after = [];
  h.jobs = [];
  h.allowed = [];
  vi.stubEnv("CRON_SECRET", SECRET);
});
afterEach(() => vi.unstubAllEnvs());

it("answers 503 and starts nothing without CRON_SECRET", async () => {
  vi.stubEnv("CRON_SECRET", "");
  expect((await post()).status).toBe(503);
  expect(h.after).toHaveLength(0);
});

it.each([
  ["no header", null],
  ["a wrong header", "Bearer nope"],
  ["a wrong header of the same length", `Bearer ${"x".repeat(SECRET.length)}`],
  ["the secret without Bearer", SECRET],
])("answers 401 and starts nothing for %s", async (_, auth) => {
  expect((await post({ auth, body: JSON.stringify({ email: true }) })).status).toBe(401);
  expect(h.after).toHaveLength(0);
});

it("has no GET, so Next answers 405 to it; only POST starts a job", () => {
  expect(Object.keys(route)).not.toContain("GET");
  expect(typeof route.POST).toBe("function");
});

it("answers 404 for an id that is not a uuid", async () => {
  expect((await post({ id: "not-a-test" })).status).toBe(404);
  expect(h.after).toHaveLength(0);
});

it("answers 202 and runs the job after the answer, with no failure alert and the database's email check", async () => {
  const res = await post({ body: JSON.stringify({ email: true }) });
  expect(res.status).toBe(202);
  expect(h.jobs).toHaveLength(0);
  await runAfter();
  expect(h.jobs).toHaveLength(1);
  const [job] = h.jobs;
  expect(job).toMatchObject({ id: ID, origin: "https://unicalearning.com", options: { email: true, failureAlert: false } });
  // The flag does not decide: the job asks the database for this test right before the email.
  expect(await job.options.mayEmail!()).toBe(false);
  expect(h.allowed).toEqual([ID]);
});

it.each([
  ["no body", undefined],
  ["not JSON", "email=true"],
  ["the string true", JSON.stringify({ email: "true" })],
  ["the number 1", JSON.stringify({ email: 1 })],
  ["false", JSON.stringify({ email: false })],
  ["null", "null"],
])("builds with no email for %s: only a literal true asks for the email", async (_, body) => {
  expect((await post({ body })).status).toBe(202);
  await runAfter();
  expect(h.jobs[0].options).toMatchObject({ email: false, failureAlert: false });
});

it("takes an upper-case id as the same test", async () => {
  await post({ id: ID.toUpperCase(), body: JSON.stringify({ email: true }) });
  await runAfter();
  expect(h.jobs[0].id).toBe(ID);
  await h.jobs[0].options.mayEmail!();
  expect(h.allowed).toEqual([ID]);
});
