import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { extractFolder } from "@/lib/reference-kit/extract";
import type { ReaderFamily } from "@/lib/reference-kit/read";

const USAGE =
  "Usage: npm run reference:extract -- --photos <folder> --out <work-folder> --source <key> [--reader-a codex] [--reader-b claude] [--model-a <id>] [--model-b <id>] [--allow-small] [--force] [--limit <n>]";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      photos: { type: "string" },
      out: { type: "string" },
      source: { type: "string" },
      "reader-a": { type: "string" },
      "reader-b": { type: "string" },
      "model-a": { type: "string" },
      "model-b": { type: "string" },
      "allow-small": { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      limit: { type: "string" },
    },
  });

  if (!values.photos || !values.out || !values.source) {
    throw new Error(USAGE);
  }

  let limit: number | undefined;
  if (values.limit !== undefined) {
    if (!/^\d+$/.test(values.limit)) {
      throw new Error(`Invalid --limit "${values.limit}": expected a positive integer`);
    }
    limit = Number(values.limit);
  }

  const readerA = (values["reader-a"] ?? "codex") as ReaderFamily;
  const readerB = (values["reader-b"] ?? "claude") as ReaderFamily;

  const repoRoot = resolve(process.cwd());
  const result = await extractFolder({
    photosDir: values.photos,
    outDir: values.out,
    source: values.source,
    readerA,
    readerB,
    modelA: values["model-a"],
    modelB: values["model-b"],
    allowSmall: values["allow-small"],
    force: values.force,
    limit,
    repoRoot,
    onProgress: (line) => console.log(line),
  });

  const { counts } = result;
  console.log(
    `Done: ${counts.double_read} double_read, ${counts.machine_read} machine_read, ${counts.failed} failed, ${counts.too_small} too_small.`,
  );
  console.log(`Report: ${result.reportPath}`);

  if (result.exitCode !== 0) {
    console.error("No photo could be prepared from the photos folder.");
    process.exitCode = 1;
  }
}

await main();
