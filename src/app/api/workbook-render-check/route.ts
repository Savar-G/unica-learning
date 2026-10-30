import { timingSafeEqual } from "node:crypto";
import { chromiumPrintEngine } from "@/lib/print-engine-chromium";
import { renderWorkbook } from "@/lib/workbook-render";
import { sampleDraft } from "@/lib/workbook-sample";
import { fixedTemplate } from "@/lib/workbook-template-fixed";
import { fixedTemplateFonts } from "@/lib/workbook-template-fonts";

// The print engine check (#309): renders the sample workbook (src/lib/workbook-sample.ts) with the fixed test template
// in this function's Chromium and answers with the time and the file sizes. It stores nothing and reads no family's
// data: the sample's ids and tokens are fixed placeholders. It shows that rendering works within the function's limits
// (docs/workbook-rendering.md). Call it with "Authorization: Bearer <CRON_SECRET>".

export const maxDuration = 60;

const PLACEHOLDER = "00000000-0000-4000-8000-000000000000";

function authorized(header: string | null, secret: string): boolean {
  const given = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("Not configured", { status: 503 });
  if (!authorized(request.headers.get("authorization"), secret)) return new Response("Unauthorized", { status: 401 });

  const started = performance.now();
  const draft = sampleDraft({ workbookId: PLACEHOLDER, childId: PLACEHOLDER, qrTokens: ["render-check-page-1", "render-check-page-2", "render-check-page-3"] });
  const result = await renderWorkbook({ draft, parentId: PLACEHOLDER, template: fixedTemplate(await fixedTemplateFonts()), engine: chromiumPrintEngine() });
  const renderMs = Math.round(performance.now() - started);
  if (result.status !== "rendered") return Response.json({ ok: false, renderMs, problems: result.problems }, { status: 500 });
  const bytes = (type: string) => result.files.filter((f) => f.contentType === type).reduce((n, f) => n + f.bytes.length, 0);
  return Response.json({
    ok: true, renderMs, pages: result.workbook.pages.length, pdfBytes: bytes("application/pdf"), imageBytes: bytes("image/png"),
    boxes: result.workbook.pages.map((p) => p.questions.map((q) => q.box)),
  });
}
