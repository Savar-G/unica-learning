import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  compareWorkFolder,
  countPageStatuses,
  formatPagesSentToPerson,
} from "@/lib/reference-kit/compare-batch";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      work: { type: "string" },
    },
  });

  if (!values.work) {
    throw new Error("Usage: npm run reference:compare -- --work <work-folder>");
  }

  const repoRoot = resolve(process.cwd());
  const report = compareWorkFolder({ workDir: values.work, repoRoot });
  const counts = countPageStatuses(report);
  const keptCount = report.kept_human_checked.filter((k) => !k.in_current_batch).length;
  const keptPart = keptCount > 0 ? ` and kept ${keptCount} page(s) with no reading in this run` : "";
  const personReadCount = report.pages.filter((p) => p.needs_person_read).length;

  console.log(
    `Compared ${report.pages.length} page(s)${keptPart}: ${counts.double_read} double_read, ${counts.agreement_accepted} agreement_accepted, ${counts.machine_read} machine_read, ${counts.human_checked} human_checked, ${personReadCount} with prose, ${report.failed_photos.length} failed photo(s).`,
  );
  console.log(`Report written to ${resolve(values.work, "final", "report.md")}`);
  console.log(formatPagesSentToPerson(report));
}

await main();
