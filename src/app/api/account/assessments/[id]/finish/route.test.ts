import { beforeEach, expect, it, vi } from "vitest";

// The finish route's report job (#771 review): a first finish emails every family and keeps the failure alert; a
// repeated finish emails only when the retries' rule allows it (reportEmailAllowed), asked right before the email.
vi.mock("server-only", () => ({}));

type JobOptions = { email?: boolean; failureAlert?: boolean; mayEmail?: () => Promise<boolean> };

const h = vi.hoisted(() => ({
  after: [] as (() => unknown)[],
  finished: "now" as "now" | "already",
  allowed: true,
  checks: [] as string[],
  jobs: [] as { id: string; origin: string; options: JobOptions | undefined }[],
  emails: [] as string[],
}));

vi.mock("next/server", () => ({ after: (run: () => unknown) => void h.after.push(run) }));
vi.mock("@/lib/account-server", () => ({ linkOrigin: () => "https://unicalearning.com" }));
vi.mock("@/lib/supabase-auth", () => ({
  sessionClient: async () => ({}),
  parentId: async () => "parent-1",
  adminClient: () => ({}),
}));
vi.mock("@/lib/test-attempt-server", () => ({ attemptStore: () => ({}) }));
vi.mock("@/lib/test-attempt", () => ({
  finishTest: async (_store: unknown, _parent: string, id: string) => ({ ok: true, id, finished: h.finished }),
}));
// The job as its options promise (src/lib/report-job.ts): with mayEmail, the parent email goes only when it answers true.
vi.mock("@/lib/report-job", () => ({
  runReportJob: async (id: string, origin: string, options?: JobOptions) => {
    h.jobs.push({ id, origin, options });
    if (options?.email === false) return;
    if (options?.mayEmail && !(await options.mayEmail())) return;
    h.emails.push(id);
  },
}));
vi.mock("@/lib/report-retry-server", () => ({
  reportEmailAllowed: async (id: string) => {
    h.checks.push(id);
    return h.allowed;
  },
}));

import { POST } from "./route";

const ID = "6f1c1f0a-3b9e-4f53-9a3c-2f1d1e6b7a01";

const finish = () =>
  POST(
    new Request(`https://unicalearning.com/api/account/assessments/${ID}/finish`, { method: "POST", body: JSON.stringify({}) }),
    { params: Promise.resolve({ id: ID }) } as Parameters<typeof POST>[1],
  );

/** Runs what the route left for after its answer. */
const runAfter = async () => {
  for (const run of h.after.splice(0)) await run();
};

beforeEach(() => {
  h.after = [];
  h.finished = "now";
  h.allowed = true;
  h.checks = [];
  h.jobs = [];
  h.emails = [];
});

it("a first finish emails with no check and keeps the failure alert, as before", async () => {
  h.allowed = false;
  const res = await finish();
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  expect(h.jobs).toHaveLength(0);
  await runAfter();
  expect(h.jobs).toHaveLength(1);
  const options = h.jobs[0].options ?? {};
  expect(options.mayEmail).toBeUndefined();
  expect(options.email).toBeUndefined();
  expect(options.failureAlert).toBeUndefined();
  expect(h.emails).toEqual([ID]);
  expect(h.checks).toEqual([]);
});

it("a repeated finish sends no parent email when the rule says no", async () => {
  h.finished = "already";
  h.allowed = false;
  expect((await finish()).status).toBe(200);
  await runAfter();
  expect(h.jobs).toHaveLength(1);
  expect(h.checks).toEqual([ID]);
  expect(h.emails).toEqual([]);
  // Only the email check changes: the report is still built and the failure alert stays.
  expect(h.jobs[0].options?.email).toBeUndefined();
  expect(h.jobs[0].options?.failureAlert).toBeUndefined();
});

it("a repeated finish still emails when the rule allows it", async () => {
  h.finished = "already";
  h.allowed = true;
  expect((await finish()).status).toBe(200);
  await runAfter();
  expect(h.checks).toEqual([ID]);
  expect(h.emails).toEqual([ID]);
});
