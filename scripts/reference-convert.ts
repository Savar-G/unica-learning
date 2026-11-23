import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  assertOutsideRepo,
  assertSafeOutputFile,
  formatConversionReport,
  parseLegacyMarkdown,
  prepareSafeOutputDir,
  validateReferenceRecord,
  writeSafeOutputFile,
} from "@/lib/reference-record";

function fileSlugFromRef(sourceRef: string): string {
  return sourceRef.replace(/:/g, "-");
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      file: { type: "string" },
      out: { type: "string" },
      source: { type: "string" },
      level: { type: "string" },
    },
  });

  if (!values.file || !values.out) {
    throw new Error(
      "Usage: npm run reference:convert -- --file <legacy.md> --out <private-folder> [--source <name>] [--level <level>]",
    );
  }

  const repoRoot = resolve(process.cwd());
  assertOutsideRepo(values.out, repoRoot);

  const markdown = await readFile(values.file, "utf8");
  const result = parseLegacyMarkdown(markdown, {
    source: values.source,
    level: values.level,
  });

  const validationFailures: string[] = [];
  if (result.contents) {
    const check = validateReferenceRecord(result.contents);
    if (!check.ok) {
      for (const e of check.errors) {
        validationFailures.push(`${result.contents.source_ref} ${e.path}: ${e.message}`);
      }
    }
  }
  for (const page of result.pages) {
    const check = validateReferenceRecord(page.record);
    if (!check.ok) {
      for (const e of check.errors) {
        validationFailures.push(`${page.record.source_ref} ${e.path}: ${e.message}`);
      }
    }
  }

  if (validationFailures.length > 0) {
    throw new Error(
      `Validation failed (${validationFailures.length} error(s)):\n${validationFailures.join("\n")}`,
    );
  }

  const plannedNames = new Set<string>();
  const plannedFiles: Array<{ name: string; content: string }> = [];
  if (result.contents) {
    const name = `${fileSlugFromRef(result.contents.source_ref)}.json`;
    plannedNames.add(name);
    plannedFiles.push({ name, content: `${JSON.stringify(result.contents, null, 2)}\n` });
  }
  for (const page of result.pages) {
    const name = `${fileSlugFromRef(page.record.source_ref)}.json`;
    if (plannedNames.has(name)) {
      throw new Error(`Duplicate output file name "${name}" for ${page.record.source_ref}`);
    }
    plannedNames.add(name);
    plannedFiles.push({ name, content: `${JSON.stringify(page.record, null, 2)}\n` });
  }
  plannedFiles.push({ name: "report.md", content: `${formatConversionReport(result)}\n` });

  const realOutDir = prepareSafeOutputDir(values.out, repoRoot);
  for (const file of plannedFiles) {
    assertSafeOutputFile(join(realOutDir, file.name), repoRoot);
  }
  for (const file of plannedFiles) {
    writeSafeOutputFile(join(realOutDir, file.name), file.content, repoRoot);
  }

  const totalItems = result.pages.reduce((s, p) => s + p.counts.items, 0);
  const totalComputed = result.pages.reduce((s, p) => s + p.counts.computedItems, 0);
  const totalUnchecked = result.pages.reduce((s, p) => s + p.counts.uncheckedItems, 0);
  const totalDiffs = result.pages.reduce((s, p) => s + p.counts.answerDiffs, 0);
  console.log(
    `Converted ${result.pages.length} page(s) and ${result.contents ? 1 : 0} contents record into ${realOutDir} (${totalItems} items, ${totalComputed} computed, ${totalUnchecked} unchecked, ${totalDiffs} answer diffs).`,
  );
}

await main();
