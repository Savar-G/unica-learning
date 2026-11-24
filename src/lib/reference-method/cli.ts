import { parseArgs, type ParseArgsConfig } from "node:util";
import type { RunCli } from "@/lib/reference-kit/read-cli";
import { makeMethodKey } from "./identity";
import { importTopicMethods, type TopicMethodStore } from "./import";
import type { MethodKey } from "./types";
import { approveTopicMethod, draftTopicMethod, listGaps, stopped, type CommandResult } from "./workflow";

export const USAGE = `Usage: npm run reference:method -- <draft|approve|gaps|import> [options]

draft    Make the method record of one topic: the facts by code, and a summary that a model writes from
         the records only.
  --records <folder>      final page records with status.json and the contents record
  --methods <folder>      private folder of the method records
  --source <key> --level <level> --topic <number>
  --model <id>            model of the claude command
  --include-machine-read  also take facts from machine_read records (each such fact is marked)
  --keep-summary          compute the facts again and keep the summary (no model runs)
  --replace               write over a summary that a person changed or approved

approve  Add the approval of one or more people. A record needs two different names.
  --records <folder> --methods <folder> --source <key> --level <level> --topic <number>
  --by <name>             the name of the approver; give it again for a second person

gaps     List the steps with no method for each topic of a level.
  --records <folder> --source <key> --level <level> [--include-machine-read]
  --methods <folder>      also give the status of each method record

import   Write the method records to the database. Run it with --dry-run first.
  --records <folder> --methods <folder>
  --dry-run               check everything and write nothing
  --replace               update a stored row that is different
  Needs SUPABASE_URL and SUPABASE_SECRET_KEY.`;

export interface MethodCommandDeps {
  repoRoot: string;
  out: (line: string) => void;
  err: (line: string) => void;
  now: () => Date;
  // Null: the database settings are missing.
  makeStore: () => TopicMethodStore | null;
  runCli?: RunCli;
}

type Options = NonNullable<ParseArgsConfig["options"]>;
const text = { type: "string" } as const;
const flag = { type: "boolean", default: false } as const;
const help = { help: flag } as const;
const folders = { records: text, methods: text } as const;
const topicId = { source: text, level: text, topic: text } as const;

function required(values: Record<string, unknown>, ...names: string[]): void {
  const missing = names.filter((name) => typeof values[name] !== "string" || values[name] === "");
  if (missing.length > 0) throw new Error(`Missing ${missing.map((n) => `--${n}`).join(", ")}. Use --help.`);
}

function keyOf(values: { source?: string; level?: string; topic?: string }): MethodKey {
  const made = makeMethodKey(values.source, values.level, values.topic);
  if (!made.ok) throw new Error(made.error);
  return made.key;
}

function parse<T extends Options>(args: string[], options: T) {
  return parseArgs({ args, options, strict: true, allowPositionals: false }).values;
}

async function runCommand(args: string[], deps: MethodCommandDeps): Promise<CommandResult> {
  const [command, ...rest] = args;
  const { repoRoot, now } = deps;
  switch (command) {
    case "draft": {
      const v = parse(rest, {
        ...help, ...folders, ...topicId, model: text,
        "include-machine-read": flag, "keep-summary": flag, replace: flag,
      });
      required(v, "records", "methods", "source", "level", "topic");
      return draftTopicMethod({
        key: keyOf(v), recordsDir: v.records ?? "", methodsDir: v.methods ?? "", repoRoot,
        includeMachineRead: v["include-machine-read"], keepSummary: v["keep-summary"], replace: v.replace,
        model: v.model, runCli: deps.runCli,
      });
    }
    case "approve": {
      const v = parse(rest, { ...help, ...folders, ...topicId, by: { type: "string", multiple: true } });
      required(v, "records", "methods", "source", "level", "topic");
      return approveTopicMethod({
        key: keyOf(v), recordsDir: v.records ?? "", methodsDir: v.methods ?? "", repoRoot, by: v.by ?? [], now,
      });
    }
    case "gaps": {
      const v = parse(rest, { ...help, ...folders, source: text, level: text, "include-machine-read": flag });
      required(v, "records", "source", "level");
      // Any topic number gives the same source and level.
      const { source, level } = keyOf({ source: v.source, level: v.level, topic: "1" });
      return listGaps({
        source, level, recordsDir: v.records ?? "", methodsDir: v.methods, repoRoot, includeMachineRead: v["include-machine-read"],
      });
    }
    case "import": {
      const v = parse(rest, { ...help, ...folders, "dry-run": flag, replace: flag });
      required(v, "records", "methods");
      const store = deps.makeStore();
      if (!store) return stopped("Missing SUPABASE_URL or SUPABASE_SECRET_KEY. Set both before the import.");
      return importTopicMethods({
        recordsDir: v.records ?? "", methodsDir: v.methods ?? "", repoRoot, dryRun: v["dry-run"], replace: v.replace, store,
      });
    }
    default:
      throw new Error(USAGE);
  }
}

// Runs one subcommand and returns the exit code.
export async function runMethodCommand(args: string[], deps: MethodCommandDeps): Promise<number> {
  if (args.includes("--help")) {
    deps.out(USAGE);
    return 0;
  }
  try {
    const result = await runCommand(args, deps);
    for (const line of result.lines) deps.out(line);
    for (const problem of result.problems) deps.err(`problem: ${problem}`);
    return result.ok ? 0 : 1;
  } catch (err) {
    deps.err(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
