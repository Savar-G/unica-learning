// npm run typst:install - puts the pinned Typst on this computer (docs/workbook-v2-engine.md).
import { homedir } from "node:os";
import { installTypst } from "@/lib/workbook-v2/render/install";
import { PINS } from "@/lib/workbook-v2/render/pins";
import { typstTarget } from "@/lib/workbook-v2/render/typst";

async function download(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}.`);
  return new Uint8Array(await response.arrayBuffer());
}

const target = typstTarget(process.platform, process.arch);
console.log(`Typst ${PINS.version} is at ${await installTypst({ home: homedir(), target, pins: PINS, download })}`);
