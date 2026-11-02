// Build the offline print check. Uses the workbook's print engine, not a browser automation session.
// node scripts/check-workbook-skill-title-fit.mjs [--probe-overflow]
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const root = fileURLToPath(new URL("..", import.meta.url));
await build({ absWorkingDir: root, entryPoints: ["scripts/check-workbook-skill-title-fit.ts"],
  outfile: ".workbook-sample/skill-title-fit.mjs", bundle: true, platform: "node", target: "node22", format: "esm", packages: "external" });
execFileSync(process.execPath, [join(root, ".workbook-sample/skill-title-fit.mjs"), ...process.argv.slice(2)], { cwd: root, stdio: "inherit" });
