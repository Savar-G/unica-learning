import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { buildBoardPlan, pickLargestDownloads, type BoardPlan } from "@/lib/reference-kit/board";
import { prepareSafeOutputDir, writeSafeOutputFile } from "@/lib/reference-record/output-guard";

const USAGE = [
  "Usage:",
  "  npm run reference:board -- --plan --listing <file> --level <level> --out <work-folder>",
  "  npm run reference:board -- --pick --out <work-folder>",
].join("\n");

const PLAN_FILE = "board-plan.json";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      plan: { type: "boolean", default: false },
      pick: { type: "boolean", default: false },
      listing: { type: "string" },
      level: { type: "string" },
      out: { type: "string" },
    },
  });
  if (!values.out || values.plan === values.pick) throw new Error(USAGE);

  const repoRoot = resolve(process.cwd());
  const outDir = prepareSafeOutputDir(values.out, repoRoot);
  const downloadsDir = prepareSafeOutputDir(join(outDir, "downloads"), repoRoot);
  const photosDir = prepareSafeOutputDir(join(outDir, "photos-in"), repoRoot);
  const planPath = join(outDir, PLAN_FILE);

  if (values.plan) {
    if (!values.listing || !values.level) throw new Error(USAGE);
    const plan = buildBoardPlan(readFileSync(values.listing, "utf8"), values.level);
    writeSafeOutputFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, repoRoot);
    console.log(`Section: ${plan.section.name} (node ${plan.section.nodeId})`);
    console.log(`Level: ${plan.level}. Source key: ${plan.source ?? "not found; pass --source to reference:extract"}.`);
    console.log(`Photos to download: ${plan.photos.length}`);
    console.log(`Plan: ${planPath}`);
    console.log(`Save each downloaded image as ${downloadsDir}/<stem>__<n>`);
    return;
  }

  const plan = JSON.parse(readFileSync(planPath, "utf8")) as BoardPlan;
  const result = await pickLargestDownloads(
    downloadsDir,
    photosDir,
    plan.photos.map((p) => p.stem),
    repoRoot,
  );
  const nameOf = new Map(plan.photos.map((p) => [p.stem, p.name]));
  console.log(`Photos kept: ${result.picked.length} of ${plan.photos.length} in ${photosDir}`);
  for (const p of result.tooSmall) {
    console.log(`  too small: ${nameOf.get(p.stem) ?? p.stem} (${p.width} x ${p.height})`);
  }
  for (const stem of result.missing) {
    console.log(`  no image downloaded: ${nameOf.get(stem) ?? stem}`);
  }
}

await main();
