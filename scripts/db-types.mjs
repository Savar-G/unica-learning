// Database types (#268): writes src/lib/database.types.ts from the live schema of the Supabase project, schema public.
// Run it after each migration and commit the file with the migration's PR. The corrections the generated types need
// (arguments a function takes as null) are in src/lib/database.ts, so this file is only ever replaced whole.
//
// Usage: npm run db:types
// The Supabase CLI needs an access token of an account that can see the project. The script uses, in this order:
// SUPABASE_ACCESS_TOKEN, the macOS Keychain item "supabase-pagewise", the CLI's own login. The token goes only to this
// CLI call, so the CLI login (often another account) stays as it is. To store the token once:
//   security add-generic-password -a "$USER" -s supabase-pagewise -w
// When the CLI fails it prints its error on stdout, so the output is checked before it replaces the file.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const PROJECT = "cdjobwsyzndtltzfpyqa";
const KEYCHAIN_ITEM = "supabase-pagewise";
const OUT = new URL("../src/lib/database.types.ts", import.meta.url);

function keychainToken() {
  if (process.platform !== "darwin") return undefined;
  try {
    const token = execFileSync("security", ["find-generic-password", "-s", KEYCHAIN_ITEM, "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return token.trim() || undefined;
  } catch {
    return undefined;
  }
}

const token = process.env.SUPABASE_ACCESS_TOKEN || keychainToken();
let types;
try {
  types = execFileSync("supabase", ["gen", "types", "typescript", "--project-id", PROJECT, "--schema", "public"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    env: token ? { ...process.env, SUPABASE_ACCESS_TOKEN: token } : process.env,
  });
} catch (e) {
  console.error(`db:types: the Supabase CLI failed. ${e.stdout?.trim() || e.message}`);
  if (!token) console.error(`db:types: no access token found. Store one in the Keychain item "${KEYCHAIN_ITEM}" (see scripts/db-types.mjs).`);
  process.exit(1);
}
if (!types.startsWith("export type Json")) {
  console.error(`db:types: the CLI answer is not the types; src/lib/database.types.ts is unchanged.\n${types.slice(0, 500)}`);
  process.exit(1);
}
writeFileSync(OUT, `${types.trimEnd()}\n`);
console.log("db:types: wrote src/lib/database.types.ts");
