// npm run typst:stage - stages the pinned linux x64 Typst binary for Vercel function tracing (docs/workbook-v2-engine.md).
import { homedir } from "node:os";
import { join } from "node:path";
import { PINS } from "@/lib/workbook-v2/render/pins";
import { planTypstStage, runTypstStage, stageBundledTypst, WORKBOOK_V2_ROUTES } from "@/lib/workbook-v2/render/vercel";

async function download(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}.`);
  return new Uint8Array(await response.arrayBuffer());
}

const args = new Set(process.argv.slice(2));
const ifNeeded = args.has("--if-needed");
const force = !ifNeeded || args.has("--force") || process.env.TYPST_STAGE === "1";
const plan = planTypstStage({ routes: WORKBOOK_V2_ROUTES, vercelEnv: process.env.VERCEL_ENV, force });
const home = process.env.VERCEL ? join(process.cwd(), ".next", "cache") : homedir();

const outcome = await runTypstStage({
  plan,
  stage: () => stageBundledTypst({ root: process.cwd(), home, pins: PINS, download }),
});

if (outcome.status === "skipped") {
  console.log(`[typst:stage] skipped: ${outcome.reason}`);
} else if (outcome.status === "warned") {
  console.warn(`[typst:stage] warning (non-fatal): ${outcome.message}`);
} else {
  const { path, bytes, reused } = outcome.result;
  console.log(`[typst:stage] ${reused ? "reused" : "staged"} Typst ${PINS.version} (${(bytes / 1024 / 1024).toFixed(1)} MB) at ${path}`);
}
