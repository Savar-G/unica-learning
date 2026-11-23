import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { checkAndMarkPage } from "@/lib/reference-kit/check";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      work: { type: "string" },
      page: { type: "string" },
      "photo-compared": { type: "boolean" },
    },
  });

  if (!values.work || !values.page) {
    throw new Error(
      "Usage: npm run reference:check -- --work <work-folder> --page <source_ref> --photo-compared\n" +
        "--photo-compared states that a person compared the final record with the photo of the page.",
    );
  }

  const repoRoot = resolve(process.cwd());
  const result = checkAndMarkPage({
    workDir: values.work,
    page: values.page,
    repoRoot,
    photoCompared: values["photo-compared"] === true,
  });

  console.log(`Marked ${result.sourceRef} as human_checked.`);
  console.log(`Updated record: ${result.recordPath}`);
  console.log(`Updated view: ${result.viewPath}`);
  for (const note of result.notes) {
    console.log(`  note: ${note}`);
  }
}

await main();
