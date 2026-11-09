// The Supabase access token for the scripts that read the live schema (db:types, db:checks). In this order:
// SUPABASE_ACCESS_TOKEN, then the macOS Keychain item "supabase-pagewise". Undefined when neither has one; db:types
// then falls back to the CLI's own login. To store the token once:
//   security add-generic-password -a "$USER" -s supabase-pagewise -w
import { execFileSync } from "node:child_process";

export const PROJECT = "cdjobwsyzndtltzfpyqa";
export const KEYCHAIN_ITEM = "supabase-pagewise";

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

export const supabaseToken = () => process.env.SUPABASE_ACCESS_TOKEN || keychainToken();
