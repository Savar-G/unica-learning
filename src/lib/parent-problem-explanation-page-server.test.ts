import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import { sampleWorkbook } from "@/lib/workbook-sample";
import { readPageExplanations } from "@/lib/parent-problem-explanation-page-server";
vi.mock("server-only", () => ({}));
const parent = "11111111-1111-4111-8111-111111111111", child = "22222222-2222-4222-8222-222222222222", workbook = "33333333-3333-4333-8333-333333333333";
const pkg = sampleWorkbook({ parentId: parent, childId: child, workbookId: workbook, qrTokens: ["sample-token-00000001", "sample-token-00000002", "sample-token-00000003"] }).pages[1].questions[0].package;
const item = { number: 1, itemId: pkg.id, version: 2, state: "scored" as const, result: "wrong" as const, readAnswerText: "415", canChange: true,
  actor: "system" as const, at: "saved", evidencePhoto: "photo", photoAvailable: true, label: "Wrong" };
const view = { completion: { status: "complete" as const, total: 2, finished: 2, items: [] }, counts: { scored: 2, unscored: 0, teamChecks: 0, pending: 0 },
  solutionsAvailable: true, items: [item, { ...item, number: 2, itemId: "unsupported" }] };
it.each(["ready", "stale", "disabled", "read_failed", "no_key"])("%s reads price once per page and computes each item without AI or admission", async state => {
  const requests: string[] = [];
  const db = createClient<Database>("https://synthetic.supabase.co", "synthetic", { global: { fetch: async url => {
    const address = new URL(String(url)); requests.push(address.pathname);
    if (address.pathname.includes("parent_explanation_prices")) {
      if (state === "read_failed") return Response.json({ message: "failed" }, { status: 500 });
      return Response.json({ enabled: state !== "disabled", verified_at: new Date(Date.now() - (state === "stale" ? 86400000 : 1000)).toISOString(),
        protocol: "parent-problem-v1", max_input_bytes: 16384, max_tokens: 768, maximum_micros: 2500000 });
    }
    if (address.pathname.endsWith("workbook_pages")) return Response.json({ page_number: 2, print_contract: {} });
    if (address.pathname.endsWith("workbooks")) return Response.json({ status: "shipped", printed_revision: "print" });
    return Response.json([{ question_number: 1, package: pkg, schema_version: 2, teaching: null, regions: null }]);
  } } });
  const result = await readPageExplanations(db, parent, { child_id: child, workbook_id: workbook, page_id: "page", printed_revision: "print" }, view,
    state === "no_key" ? {} : { PARENT_EXPLANATION_API_KEY: "synthetic-key" });
  expect(requests.filter(path => path.includes("parent_explanation_prices"))).toHaveLength(1);
  expect(requests).toHaveLength(4); expect(requests.some(path => path.includes("/rpc/"))).toBe(false);
  expect(result[0]).toMatchObject({ explainable: state === "ready", correctAnswer: "425", questionText: pkg.text });
  expect(result[1].explainable).toBe(false);
});
