import { timingSafeEqual } from "node:crypto";
import { chromiumPrintEngine } from "@/lib/print-engine-chromium";
import { renderWorkbook } from "@/lib/workbook-render";
import { sampleDraft } from "@/lib/workbook-sample";
import { fixedTemplate } from "@/lib/workbook-template-fixed";
import { fixedTemplateFonts } from "@/lib/workbook-template-fonts";

// The print engine check (#309): renders the sample workbook (src/lib/workbook-sample.ts) with the fixed test template
// in this function's Chromium and answers with the time and the file sizes. It stores nothing and reads no family's
// data: the sample's ids and tokens are fixed placeholders. It shows that rendering works within the function's limits
// (docs/workbook-rendering.md). Call it with "Authorization: Bearer <CRON_SECRET>". ?pages=<3 to 60> renders a longer
// book: the cover, then the sample's two practice pages in turn. It is off in production unless RENDER_CHECK=on, and
// each function instance runs one check at a time (a second call while one runs gets 429).

export const maxDuration = 60;

const PLACEHOLDER = "00000000-0000-4000-8000-000000000000";

/** Whether this instance is rendering a check now. */
let busy = false;

function authorized(header: string | null, secret: string): boolean {
  const given = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("Not configured", { status: 503 });
  if (!authorized(request.headers.get("authorization"), secret)) return new Response("Unauthorized", { status: 401 });
  if (process.env.VERCEL_ENV === "production" && process.env.RENDER_CHECK !== "on") return new Response("Off in production", { status: 404 });

  const asked = Number(new URL(request.url).searchParams.get("pages") ?? 3);
  if (!Number.isInteger(asked) || asked < 3 || asked > 60) return new Response("pages is 3 to 60", { status: 400 });

  if (busy) return new Response("A check is running", { status: 429, headers: { "Retry-After": "30" } });
  busy = true;
  try {
    return await check(asked);
  } finally {
    busy = false;
  }
}

async function check(asked: number): Promise<Response> {
  const started = performance.now();
  const sample = sampleDraft({ workbookId: PLACEHOLDER, childId: PLACEHOLDER, qrTokens: [1, 2, 3].map((n) => `render-check-page-${n}`) });
  const pages = Array.from({ length: asked }, (_, i) => {
    const page = sample.pages[i === 0 ? 0 : 2 - (i % 2)];
    return { ...page, number: i + 1, qrToken: `render-check-page-${i + 1}`, questions: page.questions.map((q) => ({ ...q, package: { ...q.package, ref: { ...q.package.ref, page: i + 1 } } })) };
  });
  const draft = { ...sample, pages };
  const result = await renderWorkbook({ draft, parentId: PLACEHOLDER, template: fixedTemplate(await fixedTemplateFonts()), engine: chromiumPrintEngine() });
  const renderMs = Math.round(performance.now() - started);
  if (result.status !== "rendered") return Response.json({ ok: false, renderMs, problems: result.problems }, { status: 500 });
  const bytes = (type: string) => result.files.filter((f) => f.contentType === type).reduce((n, f) => n + f.bytes.length, 0);
  return Response.json({
    ok: true, renderMs, pages: result.workbook.pages.length, pdfBytes: bytes("application/pdf"), imageBytes: bytes("image/png"),
    boxes: result.workbook.pages.map((p) => p.questions.map((q) => q.box)),
  });
}
