import { readdir, readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  assertOutsideRepo,
  assertSafeOutputFile,
  prepareSafeOutputDir,
  renderRecordToMarkdown,
  validateReferenceRecord,
  writeSafeOutputFile,
} from "@/lib/reference-record";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      records: { type: "string" },
      out: { type: "string" },
    },
  });

  if (!values.records || !values.out) {
    throw new Error(
      "Usage: npm run reference:view -- --records <records-folder> --out <view-folder>",
    );
  }

  const repoRoot = resolve(process.cwd());
  assertOutsideRepo(values.out, repoRoot);

  const recordsDir = resolve(values.records);
  const entries = (await readdir(recordsDir))
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (entries.length === 0) {
    throw new Error(`No .json record files found in ${recordsDir}`);
  }

  const rendered: Array<{ outName: string; markdown: string }> = [];
  for (const name of entries) {
    const raw = JSON.parse(await readFile(join(recordsDir, name), "utf8")) as unknown;
    const check = validateReferenceRecord(raw);
    if (!check.ok) {
      const msg = check.errors.map((e) => `  ${e.path}: ${e.message}`).join("\n");
      throw new Error(`Invalid reference record ${name}:\n${msg}`);
    }
    const outName = `${basename(name, ".json")}.md`;
    rendered.push({ outName, markdown: renderRecordToMarkdown(check.record) });
  }

  const realOutDir = prepareSafeOutputDir(values.out, repoRoot);
  for (const item of rendered) {
    assertSafeOutputFile(join(realOutDir, item.outName), repoRoot);
  }
  for (const item of rendered) {
    writeSafeOutputFile(join(realOutDir, item.outName), `${item.markdown}\n`, repoRoot);
  }

  console.log(`Rendered ${rendered.length} Markdown view file(s) into ${realOutDir}.`);
}

await main();
