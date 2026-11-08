// Loads the sample workbook (#299, src/lib/workbook-sample.ts) for a child of a test family, rendered by the workbook
// renderer (#309) with the fixed test template and Chromium: it stores the PDF and the page images in the private
// bucket "workbook-pages", then writes the whole workbook with its measured question boxes through the workbook store.
// It refuses a family that is not marked as a test family (public.test_accounts). If an upload fails or the store
// refuses, it removes the files it stored; if the write's answer is lost, the files stay (the workbook may be stored).
//
// --rerender <workbook id> renders a stored workbook of a test family again with replaceRendering
// (src/lib/workbook-render.ts): it stores the new files under new names, swaps the workbook to them in one database
// transaction (save_workbook_rendering: the workbook row, its page tokens, content, status and learning events stay),
// then removes the old files. If an upload fails or the store refuses, the new files go and the old rendering stays.
// If the swap's answer is lost and a read does not show it happened, every file stays (the swap may still commit).
//
// Every render's files get a new random key in their names, so a retry never meets the files of a failed attempt.
//
// Usage: node scripts/load-workbook-sample.mjs --child <child id> [--number <n>]
//        node scripts/load-workbook-sample.mjs --rerender <workbook id>
// It builds this file into .workbook-sample/load.mjs and runs it. The secret key comes from SUPABASE_SECRET_KEY, else
// from the Supabase Management API with the token in SUPABASE_ACCESS_TOKEN or the macOS Keychain item
// "supabase-pagewise". No key or token is printed. Chromium: see src/lib/print-engine-chromium.ts.
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { chromiumPrintEngine } from "@/lib/print-engine-chromium";
import { renderWorkbook, replaceRendering, saveRenderedWorkbook, type WorkbookDraft } from "@/lib/workbook-render";
import { sampleDraft } from "@/lib/workbook-sample";
import { workbookFiles, workbookStore } from "@/lib/workbook-store";
import { fixedTemplate } from "@/lib/workbook-template-fixed";
import { fixedTemplateFonts } from "@/lib/workbook-template-fonts";

const PROJECT = "cdjobwsyzndtltzfpyqa";
const URL = `https://${PROJECT}.supabase.co`;

async function secretKey(): Promise<string> {
  if (process.env.SUPABASE_SECRET_KEY) return process.env.SUPABASE_SECRET_KEY;
  const token = process.env.SUPABASE_ACCESS_TOKEN
    || execFileSync("security", ["find-generic-password", "-s", "supabase-pagewise", "-w"], { encoding: "utf8" }).trim();
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`api keys: HTTP ${res.status}`);
  const keys = await res.json() as { name: string; type: string; api_key: string | null }[];
  const key = keys.find((k) => k.type === "legacy" && k.name === "service_role")?.api_key ?? keys.find((k) => k.type === "secret")?.api_key;
  if (!key) throw new Error("no secret key");
  return key;
}

const { values } = parseArgs({ options: { child: { type: "string" }, number: { type: "string" }, rerender: { type: "string" } } });
if (!values.child === !values.rerender) throw new Error("usage: --child <child id> [--number <n>] | --rerender <workbook id>");

const db = createClient<Database>(URL, await secretKey(), { auth: { persistSession: false, autoRefreshToken: false } });
const store = workbookStore(db);

async function testFamily(parentId: string) {
  const { data: test } = await db.from("test_accounts").select("parent_id").eq("parent_id", parentId).maybeSingle();
  if (!test) throw new Error("the family is not a test family");
}

/** A stored workbook's content as a draft, or an error when a question's content cannot be read. */
async function storedDraft(id: string) {
  const book = await store.workbook(id);
  if (!book) throw new Error("workbook not found");
  const draft: WorkbookDraft = {
    id: book.id, childId: book.childId, number: book.number, levels: book.levels, profileBuild: book.profileBuild,
    pages: book.pages.map((p) => ({
      number: p.number, dayLabel: p.dayLabel, type: p.type, qrToken: p.qrToken,
      questions: p.questions.map((q) => {
        if (q.content.status !== "found") throw new Error(`page ${p.number}, question ${q.number}: content unavailable`);
        return { number: q.number, package: q.content.package };
      }),
    })),
  };
  return { book, draft };
}

let draft: WorkbookDraft;
let parentId: string;
let old: Awaited<ReturnType<typeof storedDraft>>["book"] | null = null;
if (values.rerender) {
  const stored = await storedDraft(values.rerender);
  ({ draft } = stored);
  old = stored.book;
  parentId = old.parentId;
} else {
  const { data: child, error } = await db.from("children").select("id, parent_id").eq("id", values.child!).maybeSingle();
  if (error || !child) throw new Error(`child not found${error ? `: ${error.message}` : ""}`);
  parentId = child.parent_id;
  draft = sampleDraft({
    workbookId: randomUUID(), childId: child.id, number: values.number ? Number(values.number) : 1,
    qrTokens: [1, 2, 3].map(() => randomBytes(16).toString("base64url")),
  });
}
await testFamily(parentId);

const started = performance.now();
const rendered = await renderWorkbook({
  draft, parentId, template: fixedTemplate(await fixedTemplateFonts()), engine: chromiumPrintEngine(), fileKey: randomBytes(6).toString("base64url"),
});
const renderMs = Math.round(performance.now() - started);
if (rendered.status !== "rendered") throw new Error(`render failed: ${JSON.stringify(rendered.problems)}`);

const result = old
  ? await replaceRendering(rendered, { files: workbookFiles(db), store, previous: old })
  : await saveRenderedWorkbook(rendered, { files: workbookFiles(db), store });
if (result.status !== "written") throw new Error(`refused: ${result.reason}`);

const bytes = (type: string) => rendered.files.filter((f) => f.contentType === type).reduce((n, f) => n + f.bytes.length, 0);
console.log(JSON.stringify({
  workbook: draft.id, child: draft.childId, pages: rendered.workbook.pages.length, renderMs,
  pdfBytes: bytes("application/pdf"), imageBytes: bytes("image/png"),
}));
