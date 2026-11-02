// Rebuild the public factual-data downloads. Run --check to detect publication drift.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const dataset = JSON.parse(readFileSync(`${root}src/content/data/bc-centre-fees-2026-11-01.json`, "utf8"));
const stem = `${root}public/resources/data/bc-centre-fees-2026-11-01`;
const fields = ["centre", "market", "tuitionLow", "tuitionHigh", "tuitionAsPublished", "enrollment", "materials", "source", "checked"];
const cell = (value) => value == null ? "" : `"${String(value).replaceAll('"', '""')}"`;
const files = [
  [`${stem}.json`, `${JSON.stringify(dataset, null, 2)}\n`],
  [`${stem}.csv`, `${fields.join(",")}\n${dataset.centres.map((row) => fields.map((field) => cell(row[field])).join(",")).join("\n")}\n`],
];
mkdirSync(`${root}public/resources/data`, { recursive: true });
for (const [path, content] of files) {
  if (process.argv.includes("--check")) {
    if (readFileSync(path, "utf8") !== content) throw new Error(`Public data differs from source: ${path}`);
  } else writeFileSync(path, content);
}
console.log(`${process.argv.includes("--check") ? "Checked" : "Wrote"} ${files.length} downloads from ${dataset.centres.length} source rows.`);
