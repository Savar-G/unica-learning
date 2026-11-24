import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { compareWorkFolder, formatPagesSentToPerson } from "@/lib/reference-kit/compare-batch";

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
  const doubleCount = report.pages.filter((p) => p.status === "double_read").length;
  const acceptedCount = report.pages.filter((p) => p.status === "agreement_accepted").length;
  const machineCount = report.pages.filter((p) => p.status === "machine_read").length;
  const personReadCount = report.pages.filter((p) => p.needs_person_read).length;

  console.log(
    `Compared ${report.pages.length} page(s): ${doubleCount} double_read, ${acceptedCount} agreement_accepted, ${machineCount} machine_read, ${personReadCount} with prose, ${report.failed_photos.length} failed photo(s).`,
  );
  console.log(`Report written to ${resolve(values.work, "final", "report.md")}`);
  console.log(formatPagesSentToPerson(report));
}

await main();
