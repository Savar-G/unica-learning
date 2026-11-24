import { createClient } from "@supabase/supabase-js";
import { resolve } from "node:path";
import { killActiveReaders } from "@/lib/reference-kit/read-cli";
import { runMethodCommand } from "@/lib/reference-method/cli";
import { createSupabaseTopicMethodStore } from "@/lib/reference-method/store";

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    killActiveReaders();
    process.exit(130);
  });
}

const now = (): Date => new Date();

process.exitCode = await runMethodCommand(process.argv.slice(2), {
  repoRoot: resolve(process.cwd()),
  out: (line) => console.log(line),
  err: (line) => console.error(line),
  now,
  makeStore: () => {
    const url = process.env.SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_SECRET_KEY?.trim();
    if (!url || !key) return null;
    return createSupabaseTopicMethodStore(
      createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }),
      now,
    );
  },
});
