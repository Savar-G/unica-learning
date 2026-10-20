// Database types (#268): writes src/lib/database.types.ts from the live schema of the Supabase project, schema public.
// Run it after each migration and commit the file with the migration's PR. The corrections the generated types need
// (arguments a function takes as null) are in src/lib/database.ts, so this file is only ever replaced whole.
//
// Usage: npm run db:types
// The Supabase CLI needs an access token of an account that can see the project: SUPABASE_ACCESS_TOKEN, or
// `supabase login`. Without one, write the output of the Supabase MCP tool generate_typescript_types to the file.
// When the CLI fails it prints its error on stdout, so the output is checked before it replaces the file.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const PROJECT = "cdjobwsyzndtltzfpyqa";
const OUT = new URL("../src/lib/database.types.ts", import.meta.url);

let types;
try {
  types = execFileSync("supabase", ["gen", "types", "typescript", "--project-id", PROJECT, "--schema", "public"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
} catch (e) {
  console.error(`db:types: the Supabase CLI failed. ${e.stdout?.trim() || e.message}`);
  process.exit(1);
}
if (!types.startsWith("export type Json")) {
  console.error(`db:types: the CLI answer is not the types; src/lib/database.types.ts is unchanged.\n${types.slice(0, 500)}`);
  process.exit(1);
}
writeFileSync(OUT, `${types.trimEnd()}\n`);
console.log("db:types: wrote src/lib/database.types.ts");
