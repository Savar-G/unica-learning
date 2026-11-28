import { timingSafeEqual } from "node:crypto";
import { homedir } from "node:os";
import { COVER_PAGES } from "@/lib/workbook-v2/assemble/plan-book";
import { BOOK_CHECK_STEPS, formatFinding, type BookFinding } from "@/lib/workbook-v2/checks/book-checks";
import { openRenderer, projectAssets } from "@/lib/workbook-v2/render/typst";
import { vercelAssets } from "@/lib/workbook-v2/render/vercel";
import { RenderError, type Renderer } from "@/lib/workbook-v2/renderer";
import { fakeRenderer } from "@/lib/workbook-v2/testing/fake-renderer";
import { fullSizeCheckInput } from "@/lib/workbook-v2/testing/full-size-book";

// The timing check of the three checks of each book (UNI-259, architecture 11.3, target under 5 s): draws the full-size
// synthetic book of 120 pages (src/lib/workbook-v2/testing/full-size-book.ts) inside this function, then runs the source,
// layout and level checks on it and answers with the time of each (docs/workbook-v2-book-checks.md). Call it with
// "Authorization: Bearer <CRON_SECRET>" and an empty body, or {"renderer": "typst" | "fake"} (typst by default: the
// pinned Typst of the publish route). It writes nothing. It is off in production unless WORKBOOK_V2_TEST_PUBLISH=on, and
// each function instance runs one check at a time (a second call while one runs gets 429).

export const maxDuration = 60;

/** The time that the three checks of one book may take (architecture 11.3). */
const BUDGET_MS = 5000;
/** The most findings that the answer lists in plain words; a good book has none. */
const MOST_PROBLEMS = 20;
/** The largest body that the route reads: {"renderer": "typst"} is 20 bytes. */
const MOST_BODY_BYTES = 1024;
const TOO_LARGE = "too-large";

let busy = false;

function authorized(header: string | null, secret: string): boolean {
  const given = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

type RendererName = "typst" | "fake";

/** The body as text, read no further than `MOST_BODY_BYTES`, or `TOO_LARGE`. */
async function boundedText(request: Request): Promise<string | typeof TOO_LARGE> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MOST_BODY_BYTES) {
      await reader.cancel();
      return TOO_LARGE;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

async function readBody(request: Request): Promise<RendererName | typeof TOO_LARGE | string> {
  const text = await boundedText(request);
  if (text === TOO_LARGE) return TOO_LARGE;
  if (text.trim() === "") return "typst";
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return "The body is empty or a JSON object.";
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "The body is empty or a JSON object.";
  const { renderer = "typst", ...rest } = raw as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return `The body has unknown fields: ${Object.keys(rest).join(", ")}.`;
  return renderer === "typst" || renderer === "fake" ? renderer : 'renderer is "typst" or "fake".';
}

function rendererOf(name: RendererName): Promise<Renderer> {
  if (name === "fake") return Promise.resolve(fakeRenderer());
  return openRenderer(process.env.VERCEL ? vercelAssets(process.cwd()) : projectAssets(process.cwd(), homedir(), process.platform, process.arch));
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("Not configured", { status: 503 });
  if (!authorized(request.headers.get("authorization"), secret)) return new Response("Unauthorized", { status: 401 });
  if (process.env.VERCEL_ENV === "production" && process.env.WORKBOOK_V2_TEST_PUBLISH !== "on") return new Response("Off in production", { status: 404 });

  const renderer = await readBody(request);
  if (renderer === TOO_LARGE) return Response.json({ error: `The body is more than ${MOST_BODY_BYTES} bytes.` }, { status: 413 });
  if (renderer !== "typst" && renderer !== "fake") return Response.json({ error: renderer }, { status: 400 });

  if (busy) return new Response("A book is being checked", { status: 429, headers: { "Retry-After": "30" } });
  busy = true;
  try {
    const started = performance.now();
    const { input } = await fullSizeCheckInput(await rendererOf(renderer));
    const drawMs = Math.round(performance.now() - started);
    const findings: BookFinding[] = [];
    let elapsed = 0;
    const time = (step: keyof typeof BOOK_CHECK_STEPS): number => {
      const at = performance.now();
      findings.push(...BOOK_CHECK_STEPS[step](input));
      const ms = performance.now() - at;
      elapsed += ms;
      return Math.round(ms);
    };
    const checks = { sourceMs: time("source"), layoutMs: time("layout"), levelMs: time("level") };
    // The times are rounded to show; the budget is decided on the time before rounding.
    const totalMs = checks.sourceMs + checks.layoutMs + checks.levelMs;
    return Response.json({
      ok: findings.length === 0,
      renderer,
      totalPages: input.pages.length + COVER_PAGES,
      interiorPages: input.pages.length,
      itemCount: input.items.length,
      totalMs,
      checks,
      underBudget: elapsed < BUDGET_MS,
      drawMs,
      findings: findings.length,
      problems: findings.slice(0, MOST_PROBLEMS).map(formatFinding),
    });
  } catch (error) {
    if (error instanceof RenderError) return Response.json({ error: "The book could not be drawn.", detail: error.message }, { status: 500 });
    throw error;
  } finally {
    busy = false;
  }
}
