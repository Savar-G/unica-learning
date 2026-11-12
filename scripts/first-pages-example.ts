// The complete test example of the first pages (docs/first-pages.md), for a check before the switches go on: queues the
// first pages of one finished test of a TEST family (refused for any other family), makes them here with the live deps
// (WORKBOOK_AI_FAKE=on: the fake AI, free; --subscription: the Mac's subscription, as the worker), and writes to --out:
// the four page images, the PDF, the sample email as text, HTML and a .eml file with the PDF attached (never sent), and
// summary.json with what making them took. Nothing is emailed and nothing is approved, shipped or started.
//   SUPABASE_SECRET_KEY=... WORKBOOK_AI_FAKE=on node scripts/first-pages-example.mjs --test <assessment id> --out <folder>
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { firstPagesEmail, firstPagesActionUrl, firstPagesFilename } from "@/lib/first-pages-email";
import { runFirstPagesWith } from "@/lib/first-pages-deps";
import { firstPagesOfTest, queueFirstPages } from "@/lib/first-pages-store";
import { SUPABASE_URL } from "@/lib/supabase-public";
import { WORKBOOK_FILES_BUCKET } from "@/lib/workbook-content";

const { values } = parseArgs({ options: { test: { type: "string" }, out: { type: "string" }, subscription: { type: "boolean", default: false }, origin: { type: "string", default: "https://unicalearning.com" } } });
if (!values.test || !values.out) throw new Error("Give --test <assessment id> and --out <folder>.");
const key = process.env.SUPABASE_SECRET_KEY;
if (!key) throw new Error("SUPABASE_SECRET_KEY is not set.");
if (!process.env.WORKBOOK_AI_FAKE && !values.subscription) throw new Error("Set WORKBOOK_AI_FAKE=on, or pass --subscription: this script never uses the paid API.");
if (values.subscription) { delete process.env.OPENROUTER_API_KEY; delete process.env.ANTHROPIC_API_KEY; }
const admin = createClient<Database>(SUPABASE_URL, key, { auth: { persistSession: false } });

const test = await admin.from("assessments").select("parent_id, child_id").eq("id", values.test).maybeSingle();
if (!test.data) throw new Error("No such test.");
const isTest = await admin.from("test_accounts").select("parent_id").eq("parent_id", test.data.parent_id).maybeSingle();
if (!isTest.data) throw new Error("Only a test family's test may be used for the example.");

const queued = await queueFirstPages(admin, values.test, { runner: values.subscription ? "mac" : "server", by: "admin" });
console.log("queue:", JSON.stringify(queued));
if (queued.status === "refused") process.exit(1);
const started = Date.now();
// A set queued again (a retry, or a new Workbook 1 id after a capacity failure) is taken again, within its attempts.
let outcome: Awaited<ReturnType<typeof runFirstPagesWith>>;
do {
  outcome = await runFirstPagesWith(admin, queued.id, { subscription: !!values.subscription, timeLimitMs: 10 * 60_000, build: `example-${process.env.GIT_SHA ?? "local"}` });
  console.log("job call:", outcome);
} while (outcome === "retry");
const row = await firstPagesOfTest(admin, values.test);
console.log("outcome:", outcome, "status:", row?.status, row?.error ?? "");
if (!row?.result) process.exit(1);
const r = row.result;
mkdirSync(values.out, { recursive: true });
const get = async (path: string) => {
  const { data, error } = await admin.storage.from(WORKBOOK_FILES_BUCKET).download(path);
  if (error || !data) throw new Error(`download ${path}: ${error?.message}`);
  return new Uint8Array(await data.arrayBuffer());
};
for (const img of r.files.images) writeFileSync(join(values.out, `page-${img.number}.png`), await get(img.path));
const pdf = await get(r.files.pdf.path);
const child = await admin.from("children").select("first_name").eq("id", row.childId).maybeSingle();
const report = await admin.from("reports").select("id").eq("assessment_id", values.test).maybeSingle();
const name = child.data?.first_name ?? "your child";
const filename = firstPagesFilename(name);
writeFileSync(join(values.out, filename), pdf);
const email = firstPagesEmail({ parentName: "Test Parent", childName: name, url: firstPagesActionUrl(values.origin, report.data?.id ?? ""), unsubscribeUrl: `${values.origin}/unsubscribe?t=example` });
writeFileSync(join(values.out, "email.txt"), `Subject: ${email.subject}\n\n${email.text}\n`);
writeFileSync(join(values.out, "email.html"), email.html);
const boundary = "first-pages-example";
const b64 = (s: string | Uint8Array) => Buffer.from(s).toString("base64").replace(/.{76}/g, "$&\r\n");
writeFileSync(join(values.out, "email.eml"), [
  `From: Savar & Cedric <contact@unicalearning.com>`, `To: test-parent@example.com`, `Subject: ${email.subject}`, "MIME-Version: 1.0",
  `Content-Type: multipart/mixed; boundary="${boundary}"`, "", `--${boundary}`, `Content-Type: multipart/alternative; boundary="${boundary}-alt"`, "",
  `--${boundary}-alt`, "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: base64", "", b64(email.text), "",
  `--${boundary}-alt`, "Content-Type: text/html; charset=utf-8", "Content-Transfer-Encoding: base64", "", b64(email.html), "", `--${boundary}-alt--`, "",
  `--${boundary}`, `Content-Type: application/pdf; name="${filename}"`, `Content-Disposition: attachment; filename="${filename}"`, "Content-Transfer-Encoding: base64", "", b64(pdf), "",
  `--${boundary}--`, "",
].join("\r\n"));
const summary = {
  firstPagesId: row.id, workbookId: row.workbookId, status: row.status, attempts: row.attempts, seconds: Math.round((Date.now() - started) / 1000),
  level: row.frame?.plan.level ?? null, schoolGrade: row.frame?.grade ?? null,
  pages: [{ number: 1, type: "cover" }, ...r.pages.map((p) => ({ number: p.number, type: p.type, day: p.day, pageOfDay: p.pageOfDay, questions: p.questions.length,
    checked: p.questions.filter((q) => q.check.status === "checked").length, fit: p.fit.status }))],
  counts: r.counts, pdf: { file: filename, bytes: r.files.pdf.bytes, sha256: r.files.pdf.sha256 },
};
writeFileSync(join(values.out, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
