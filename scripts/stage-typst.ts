// npm run typst:stage - puts the pinned Typst program for linux x64 where the bundle of a Vercel function takes it from
// (docs/workbook-v2-engine.md). Not part of a build yet.
import { homedir } from "node:os";
import { join } from "node:path";
import { PINS } from "@/lib/workbook-v2/render/pins";
import { stageBundledTypst } from "@/lib/workbook-v2/render/vercel";

async function download(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}.`);
  return new Uint8Array(await response.arrayBuffer());
}

// Vercel keeps .next/cache between builds.
const home = process.env.VERCEL ? join(process.cwd(), ".next", "cache") : homedir();
const { path, bytes, reused } = await stageBundledTypst({ root: process.cwd(), home, pins: PINS, download });
console.log(`[typst:stage] ${reused ? "reused" : "staged"} Typst ${PINS.version} (${(bytes / 1024 / 1024).toFixed(1)} MB) at ${path}`);
