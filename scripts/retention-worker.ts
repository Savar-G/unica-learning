import { runNodeRetention } from "../src/lib/family-retention-node";

const shutdown = new AbortController();
const stop = () => shutdown.abort();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
try {
  const result = await runNodeRetention(process.argv.slice(2), process.env, shutdown.signal);
  if ("help" in result) console.log("Usage: retention-worker [--mode dry|delete]\nDefault: dry. Delete requires activation and authenticated production credentials.");
  else { console.log(JSON.stringify(result)); if (!result.ok) process.exitCode = 1; }
} catch {
  // Provider/SDK errors can contain credentials, URLs and customer data. Never print them.
  console.error(JSON.stringify({ ok: false, error: "worker_unavailable" }));
  process.exitCode = 1;
} finally {
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
}
