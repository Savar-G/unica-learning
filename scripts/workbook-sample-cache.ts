import { createHash } from "node:crypto";
import { appendFile, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { AiClient, AiJsonRequest } from "@/lib/ai-client";
import { aiSolver, type Solver } from "@/lib/workbook-solve-check";

export interface CacheEntry {
  version: 1;
  hash: string;
  model: string;
  request: AiJsonRequest;
  response: unknown;
}

export function requestHash(model: string, request: AiJsonRequest): string {
  return createHash("sha256").update(JSON.stringify({ version: 1, model, request })).digest("hex");
}

/** A cache is local to one book. Only a supplied replay folder can supply old answers. */
export async function sampleAiCache(file: string, replay?: string) {
  const entries = new Map<string, CacheEntry[]>();
  const used = new Map<string, number>();
  const counts = { replayed: 0, new: 0, writeReplayed: 0, writeNew: 0, solveReplayed: 0, solveNew: 0 };
  if (replay) {
    if (resolve(replay) === resolve(file, "..")) throw new Error("Replay and output folders must differ.");
    const files = (await readdir(replay)).filter(name => name.endsWith("-ai-cache.jsonl")).sort();
    if (!files.length) throw new Error(`No AI cache files in ${replay}`);
    for (const name of files) {
      for (const line of (await readFile(resolve(replay, name), "utf8")).split("\n").filter(Boolean)) {
        const entry = JSON.parse(line) as CacheEntry;
        if (entry.version !== 1 || typeof entry.model !== "string" || !entry.request || !("response" in entry) || entry.hash !== requestHash(entry.model, entry.request)) {
          throw new Error(`Invalid AI cache entry in ${name}`);
        }
        const records = entries.get(entry.hash) ?? [];
        records.push(entry);
        entries.set(entry.hash, records);
      }
    }
  }
  let writes = Promise.resolve();
  // Truncate only after the replay source has been read and checked.
  await appendFile(file, "", { flag: "w" });
  const wrap = (client: AiClient, kind: "write" | "solve"): AiClient => ({
    model: client.model,
    async json(request, signal) {
      signal.throwIfAborted();
      const hash = requestHash(client.model, request);
      const records = entries.get(hash);
      const index = used.get(hash) ?? 0;
      const previous = records?.[Math.min(index, records.length - 1)];
      if (previous) used.set(hash, index + 1);
      counts[previous ? "replayed" : "new"]++;
      counts[`${kind}${previous ? "Replayed" : "New"}`]++;
      const response = previous ? structuredClone(previous.response) : await client.json(request, signal);
      const entry: CacheEntry = { version: 1, hash, model: client.model, request, response };
      const line = `${JSON.stringify(entry)}\n`;
      writes = writes.then(() => appendFile(file, line));
      await writes;
      return response;
    },
  });
  return {
    counts,
    client: (client: AiClient) => wrap(client, "write"),
    solver(live: Solver): Solver {
      return {
        model: live.model,
        async solve(request, signal) {
          // Use the public solver adapter to capture its exact current prompt and schema.
          // The answer key is never part of this request or a live solver's input.
          let exact: AiJsonRequest | undefined;
          await aiSolver({ model: live.model, json: async input => { exact = input; return null; } }).solve(request, signal);
          if (!exact) throw new Error("The solver did not produce an AI request.");
          return wrap({ model: live.model, json: () => live.solve(request, signal) }, "solve").json(exact, signal);
        },
      };
    },
  };
}
