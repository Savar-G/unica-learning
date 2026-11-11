import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { fakeAiClient } from "@/lib/ai-client-fake";
import { fakeWorkbookItems } from "@/lib/workbook-ai-fake";
import { fakePrintEngine } from "@/lib/print-engine-fake";
import { runFirstPagesJob, type FirstPagesJobDeps } from "@/lib/first-pages";
import { memoryFirstPagesStore } from "@/lib/first-pages-memory";
import { memoryDraftStore } from "@/lib/workbook-draft-memory";
import { memoryRunStore } from "@/lib/workbook-job-memory";
import { runWorkbookJob, startWorkbookRun, type ChildInputs, type WorkbookJobDeps } from "@/lib/workbook-job";
import type { FitCheck } from "@/lib/workbook-generator";
import { memoryWorkbookFiles } from "@/lib/workbook-store-memory";
import { workbookTemplate } from "@/lib/workbook-template";
import { keySolver } from "@/lib/workbook-solve-check";
import { firstCustomerProfile } from "@/lib/workbook-sample-profiles";

// Regressions from the independent review of the first pages (docs/first-pages.md, review of 1c16268b): a lost finish
// answer, a set that finishes after Workbook 1 started, the email checks after the PDF read, the due list past sent
// sets, a sibling's card saved in Stripe, and the admin's choices after the keeping run failed.

const CHILD = "00000000-0000-4000-8000-0000000000c1";
const PARENT = "00000000-0000-4000-8000-0000000000f1";
const OTHER_CHILD = "00000000-0000-4000-8000-0000000000c2";
const OTHER_PARENT = "00000000-0000-4000-8000-0000000000f2";
const TEST = "00000000-0000-4000-8000-0000000000a1";
const ADMIN = { id: "00000000-0000-4000-8000-0000000000ad", email: "admin@example.com" };
const fits: FitCheck = { fits: async () => ({ ok: true }) };

const child = (over: Partial<ChildInputs> = {}): ChildInputs => ({
  parentId: PARENT, name: "Leah", grade: 4, province: "BC", profile: { revision: 1, profile: firstCustomerProfile() }, workbooks: [], ...over,
});

function setup(o: { inputs?: ChildInputs; itemPolicy?: "approved-v1" | "legacy"; fail?: () => boolean } = {}) {
  let clock = new Date("2026-11-10T17:00:00.000Z");
  let ids = 0;
  const newId = () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`;
  let tokens = 0;
  const qrToken = () => `token-${String(++tokens).padStart(12, "0")}`;
  const first = memoryFirstPagesStore({ now: () => clock, newId,
    runActive: async (childId) => (await allRuns()).some((r) => r.childId === childId && (r.status === "queued" || r.status === "running" || r.status === "done")) });
  const files = memoryWorkbookFiles();
  const ai = fakeAiClient({ answer: (r) => { if (o.fail?.()) throw new Error("the AI provider answered 500"); return fakeWorkbookItems(r); } });
  const inputs: Record<string, ChildInputs> = { [CHILD]: o.inputs ?? child(), [OTHER_CHILD]: child({ parentId: OTHER_PARENT, name: "Kai" }) };
  const source: WorkbookJobDeps["source"] = {
    inputs: async (id) => (inputs[id] ? structuredClone(inputs[id]) : null),
    prepareProfile: async (id) => ({ ok: true, profile: inputs[id]?.profile ?? null }),
  };
  const deps: FirstPagesJobDeps = {
    store: first.store, runner: "mac", source, files, ai, solver: keySolver(), template: workbookTemplate(), fit: () => fits, engine: fakePrintEngine(),
    newId, qrToken, fileKey: () => `k${ids}`, now: () => clock.getTime(), build: "commit-a", itemPolicy: o.itemPolicy ?? "approved-v1",
  };
  const drafts = memoryDraftStore({ [CHILD]: PARENT, [OTHER_CHILD]: OTHER_PARENT });
  const runs = memoryRunStore({ children: { [CHILD]: PARENT, [OTHER_CHILD]: OTHER_PARENT }, now: () => clock, newId, drafts, firstPages: first.forRuns });
  const runDeps = (over: Partial<WorkbookJobDeps> = {}): WorkbookJobDeps => ({
    itemPolicy: o.itemPolicy ?? "approved-v1", runs, drafts, files, ai: fakeAiClient({ answer: fakeWorkbookItems }), solver: keySolver(), template: workbookTemplate(),
    fit: () => fits, engine: fakePrintEngine(), newId, qrToken, fileKey: () => `r${ids}`, now: () => clock.getTime(), concurrency: 4, budgetMs: 1e9,
    build: "commit-b",
    source: { ...source, firstPages: async (id) => first.ready(id, await allRuns()) },
    ...over,
  });
  const runIds: string[] = [];
  const allRuns = async () => (await Promise.all(runIds.map((id) => runs.run(id)))).filter((r) => r !== null);
  const startRun = async (childId = CHILD) => {
    const s = await startWorkbookRun(runs, childId, ADMIN);
    if (s.status !== "started") throw new Error(s.status);
    runIds.push(s.runId);
    return s.runId;
  };
  return { first, files, deps, ai, inputs, runs, drafts, runDeps, startRun, allRuns, tick: (s: number) => { clock = new Date(clock.getTime() + s * 1000); }, now: () => clock };
}



import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { firstPagesEmailStore } from "@/lib/first-pages-email-store";
import { memoryLedger, memoryTransport } from "@/lib/email-delivery-memory";
import { runFirstPagesEmails, type DueFirstPagesEmail, type FirstPagesEmailStore } from "@/lib/first-pages-email";

const emailDue: DueFirstPagesEmail = {
  firstPagesId: "fp", assessmentId: "test", reportId: "report", parentId: "parent", childId: "child",
  parentName: "Ana", parentEmail: "ana@example.com", childName: "Leah", pdfPath: "parent/wb/first.pdf", retry: null,
};

describe("review regressions", () => {
  for (const condition of ["saved card", "unsubscribe"] as const) {
    it(`stops the email when ${condition} appears during the PDF read`, async () => {
      let admitted = true;
      const mail = memoryTransport();
      const ledger = memoryLedger<DueFirstPagesEmail>({ keyOf: d => d.assessmentId });
      const store: FirstPagesEmailStore = {
        due: async () => [emailDue],
        blocked: async () => admitted ? null : condition,
        pdf: async () => { admitted = false; return new Uint8Array([37, 80, 68, 70]); },
        ledger: ledger.ledger,
      };
      await runFirstPagesEmails(store, {
        enabled: true, origin: "https://unicalearning.com", transport: mail.transport,
        newToken: () => ({ token: "t", hash: "a".repeat(64) }),
      });
      expect(mail.delivered, `email was sent after ${condition}`).toHaveLength(0);
    });
  }

  it("finds an unsent set after the oldest sets already received their email", async () => {
    const sets = Array.from({ length: 4 }, (_, i) => ({
      id: `fp-${i}`, assessment_id: `test-${i}`, parent_id: "parent", child_id: "child", status: "ready", kept_by: null,
      decision: null, ready_at: String(i), result: { files: { pdf: { path: `parent/wb-${i}/first.pdf` } } },
    }));
    const admin = {
      from(table: string) {
        const filters: [string, unknown][] = [];
        let count = Infinity;
        let start = 0;
        const query = {
          select() { return query; },
          eq(key: string, value: unknown) { filters.push([key, value]); return query; },
          is(key: string, value: unknown) { filters.push([key, value]); return query; },
          order() { return query; },
          gte() { return query; },
          range(from: number, to: number) { start = from; count = to - from + 1; return query; },
          limit(value: number) { count = value; return query; },
          async maybeSingle() {
            if (table === "email_log") {
              const assessment = filters.find(([k]) => k === "assessment_id")?.[1];
              return { data: assessment === "test-3" ? null : { id: `log-${assessment}`, status: "sent", attempts: 1 }, error: null };
            }
            const data = table === "parents" ? { name: "Ana", email: "ana@example.com", deletion_requested_at: null }
              : table === "children" ? { first_name: "Leah" } : table === "child_deletions" ? null
              : table === "assessments" ? { completed_at: new Date().toISOString() }
              : table === "workbook_first_pages" ? { status: "ready", decision: null, kept_by: null, parent_id: "parent" } : { id: "report" };
            return { data, error: null };
          },
          not() { return query; },
          then(resolve: (value: unknown) => unknown) {
            if (table !== "workbook_first_pages") return Promise.resolve({ data: [], error: null, count: 0 }).then(resolve);
            const data = sets.filter(s => filters.every(([k,v]) => (s as unknown as Record<string, unknown>)[k] === v)).slice(start, start + count);
            return Promise.resolve({ data, error: null }).then(resolve);
          },
        };
        return query;
      },
    } as unknown as SupabaseClient<Database>;
    const store = firstPagesEmailStore(admin, null);
    expect((await store.due(1)).map(d => d.firstPagesId)).toEqual(["fp-3"]);
  });

  it("finds an eligible set behind older sets whose family saved a card", async () => {
    const sets = Array.from({ length: 4 }, (_, i) => ({
      id: `fp-${i}`, assessment_id: `test-${i}`, parent_id: `parent-${i}`, child_id: "child", status: "ready", kept_by: null,
      decision: null, ready_at: String(i), result: { files: { pdf: { path: `parent/wb-${i}/first.pdf` } } },
    }));
    const admin = {
      from(table: string) {
        const filters: [string, unknown][] = [];
        let count = Infinity;
        let start = 0;
        const query = {
          select() { return query; },
          eq(key: string, value: unknown) { filters.push([key, value]); return query; },
          is(key: string, value: unknown) { filters.push([key, value]); return query; },
          order() { return query; },
          gte() { return query; },
          range(from: number, to: number) { start = from; count = to - from + 1; return query; },
          limit(value: number) { count = value; return query; },
          async maybeSingle() {
            if (table === "email_log") {
              const assessment = filters.find(([k]) => k === "assessment_id")?.[1];
              return { data: null, error: null };
            }
            const data = table === "parents" ? { name: "Ana", email: "ana@example.com", deletion_requested_at: null }
              : table === "children" ? { first_name: "Leah" } : table === "child_deletions" ? null
              : table === "assessments" ? { completed_at: new Date().toISOString() }
              : table === "workbook_first_pages" ? { status: "ready", decision: null, kept_by: null, parent_id: `parent-${String(filters.find(([k]) => k === "id")?.[1]).slice(3)}` } : { id: "report" };
            return { data, error: null };
          },
          not() { return query; },
          then(resolve: (value: unknown) => unknown) {
            if (table === "card_setups") {
              const parent = filters.find(([k]) => k === "parent_id")?.[1];
              return Promise.resolve({ data: parent === "parent-3" ? [] : [{ child_id: "child" }], error: null }).then(resolve);
            }
            if (table !== "workbook_first_pages") return Promise.resolve({ data: [], error: null, count: 0 }).then(resolve);
            const data = sets.filter(s => filters.every(([k,v]) => (s as unknown as Record<string, unknown>)[k] === v)).slice(start, start + count);
            return Promise.resolve({ data, error: null }).then(resolve);
          },
        };
        return query;
      },
    } as unknown as SupabaseClient<Database>;
    const store = firstPagesEmailStore(admin, null);
    expect((await store.due(1)).map(d => d.firstPagesId)).toEqual(["fp-3"]);
  });

  it("never shows a set that finishes after Workbook 1 started: it ends unavailable and keeps no files", async () => {
    const s = setup();
    const set = s.first.queue({ assessmentId: TEST, parentId: PARENT, childId: CHILD });
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let reached!: () => void;
    const printing = new Promise<void>(resolve => { reached = resolve; });
    const engine = s.deps.engine;
    s.deps.engine = { print: async job => { reached(); await held; return engine.print(job); } };
    const sample = runFirstPagesJob(set.id, s.deps);
    await printing;
    expect((await s.first.store.get(set.id))?.status).toBe("running");
    const runId = await s.startRun();
    try {
      expect(await runWorkbookJob(runId, s.runDeps())).toBe("done");
    } finally {
      release();
    }
    expect(await sample).toBe("stale");
    const ended = (await s.first.store.get(set.id))!;
    expect(ended).toMatchObject({ status: "unavailable", result: null, error: "Workbook 1 started before the first pages were ready." });
    expect([...s.files.files.keys()].some((p) => p.startsWith(`${PARENT}/${set.workbookId}/`))).toBe(false);
    expect(await s.first.ready(CHILD, await s.allRuns())).toBeNull();
  }, 240_000);
});


it("blocks the sample when a sibling saved a card in Stripe before the database record", async () => {
  const tables: Record<string, Record<string, unknown>[]> = {
    workbook_first_pages: [{ id: "fp", status: "ready", decision: null, kept_by: null, parent_id: "parent" }],
    assessments: [{ id: "test", completed_at: new Date().toISOString() }],
    parents: [{ id: "parent", deletion_requested_at: null }],
    child_deletions: [], email_log: [],
    card_setups: [{ id: "sibling-ref", parent_id: "parent", child_id: "sibling", plan: "one", price: 79.99,
      stripe_customer_id: "cus-sibling", card_saved_at: null }],
  };
  const admin = {
    from(table: string) {
      const matches: ((row: Record<string, unknown>) => boolean)[] = [];
      let count = Infinity;
      const result = () => ({ data: (tables[table] ?? []).filter(row => matches.every(f => f(row))).slice(0, count), error: null, count: 0 });
      const query = {
        select() { return query; },
        eq(key: string, value: unknown) { matches.push(row => row[key] === value); return query; },
        not(key: string, _op: string, value: unknown) { matches.push(row => row[key] !== value); return query; },
        limit(value: number) { count = value; return query; },
        async maybeSingle() { const r = result(); return { ...r, data: r.data[0] ?? null }; },
        then(resolve: (value: unknown) => unknown) { return Promise.resolve(result()).then(resolve); },
      };
      return query;
    },
  } as unknown as SupabaseClient<Database>;
  const stripeList = vi.fn(async () => ({ has_more: false, data: [{
    id: "cs-sibling", mode: "setup", status: "complete", created: 1, customer: "cus-sibling",
    client_reference_id: "sibling-ref", metadata: { ref: "sibling-ref", plan: "one", price: "79.99" },
    setup_intent: { status: "succeeded", customer: "cus-sibling" },
  }] }));
  const stripe = { checkout: { sessions: { list: stripeList } } } as unknown as Parameters<typeof firstPagesEmailStore>[1];
  const reason = await firstPagesEmailStore(admin, stripe).blocked(emailDue);
  expect(reason, `family is eligible although sibling saved a card; Stripe reads: ${stripeList.mock.calls.length}`).not.toBeNull();
});


import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminFirstPages } from "@/components/admin-first-pages";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));

it("keeps files when finish commits but its response is lost", async () => {
  const s = setup();
  const set = s.first.queue({ assessmentId: TEST, parentId: PARENT, childId: CHILD });
  const finish = s.first.store.finish;
  s.deps.store = { ...s.first.store, finish: async (...args) => {
    expect(await finish(...args)).toBe(true);
    throw new Error("finish response lost after commit");
  } };
  await runFirstPagesJob(set.id, s.deps);
  const ready = (await s.first.store.get(set.id))!;
  expect(ready.status).toBe("ready");
  expect(await runFirstPagesJob(set.id, s.deps)).toBe("not-claimed");
  const paths = [ready.result!.files.pdf.path, ...ready.result!.files.images.map(i => i.path)];
  expect(paths.filter(path => s.files.files.has(path)), "ready set lost its files").toHaveLength(5);
}, 240_000);

it("removes the files of a finish whose answer was lost before it was stored, and the old finish can no longer publish", async () => {
  const s = setup();
  const set = s.first.queue({ assessmentId: TEST, parentId: PARENT, childId: CHILD });
  let late: (() => Promise<boolean>) | null = null;
  const finish = s.first.store.finish;
  s.deps.store = { ...s.first.store, finish: async (...args) => {
    // Still on its way when the connection drops.
    late = () => finish(...args);
    throw new Error("finish connection lost before commit");
  } };
  expect(await runFirstPagesJob(set.id, s.deps)).toBe("retry");
  expect(await s.first.store.get(set.id)).toMatchObject({ status: "queued", result: null });
  expect([...s.files.files.keys()].some((p) => p.startsWith(`${PARENT}/${set.workbookId}/`))).toBe(false);
  expect(await late!()).toBe(false);
  expect((await s.first.store.get(set.id))?.status).toBe("queued");
}, 240_000);

it("offers an admin choice after the run that kept the sample has failed", async () => {
  const s = setup();
  const set = s.first.queue({ assessmentId: TEST, parentId: PARENT, childId: CHILD });
  expect(await runFirstPagesJob(set.id, s.deps)).toBe("ready");
  const runId = await s.startRun();
  expect(await runWorkbookJob(runId, s.runDeps({ engine: { print: async () => { throw new Error("printer unavailable"); } } }))).toBe("failed");
  const ready = (await s.first.store.get(set.id))!;
  expect((await s.runs.run(runId))?.status).toBe("failed");
  expect(ready.keptBy).toBe(runId);
  const html = renderToStaticMarkup(createElement(AdminFirstPages, { child: "Leah", newestTest: TEST, sets: [{
    id: set.id, assessmentId: TEST, status: ready.status, attempts: ready.attempts, error: ready.error, createdAt: ready.createdAt,
    readyAt: ready.readyAt, keptBy: ready.keptBy, keptActive: false, decision: ready.decision, counts: null, images: [], pdfUrl: null,
  }] }));
  expect(html, "failed holder hides the recovery controls").toContain("Make it without the first pages");
}, 240_000);
