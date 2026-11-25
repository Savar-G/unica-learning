import { parseArgs } from "node:util";
import type { RunCli } from "@/lib/reference-kit/read-cli";
import { makeMethodKey } from "./identity";
import { importTopicMethods, type TopicMethodStore } from "./import";
import { messageOf, stopped, type CommandResult } from "./files";
import { approveTopicMethod, draftTopicMethod, listGaps, showTopicMethod } from "./workflow";

export const USAGE = `Usage: npm run reference:method -- <draft|show|approve|gaps|import> [options]

draft    Make the method record of one topic: the facts by code, and a summary that a model writes from
         the records only.
  --records <folder>      final page records with status.json and the contents record
  --methods <folder>      private folder of the method records
  --source <key> --level <level> --topic <number>
  --model <id>            model of the claude command
  --include-machine-read  also take facts from machine_read records (each such fact is marked)
  --keep-summary          compute the facts again and keep the summary (no model runs)
  --replace               write over a summary that a person changed or approved

show     Print the whole record in plain words, and its digest.
  --records <folder> --methods <folder> --source <key> --level <level> --topic <number>

approve  Add the approval of one person. A record needs two different people.
  --records <folder> --methods <folder> --source <key> --level <level> --topic <number>
  --by <name>             the name of the approver, one for each run
  --digest <sha256>       the digest that show printed for the text that this person read

gaps     List the steps with no method for each topic of a level.
  --records <folder> --source <key> --level <level> [--include-machine-read]

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

const text = { type: "string" } as const;
const flag = { type: "boolean" } as const;
const ON_ONE_TOPIC = ["records", "methods", "source", "level", "topic"];
// The options of each command. The first list is required.
const COMMANDS: Record<string, { required: string[]; more: string[] }> = {
  draft: { required: ON_ONE_TOPIC, more: ["model", "include-machine-read", "keep-summary", "replace"] },
  show: { required: ON_ONE_TOPIC, more: [] },
  approve: { required: [...ON_ONE_TOPIC, "by", "digest"], more: [] },
  gaps: { required: ["records", "source", "level"], more: ["include-machine-read"] },
  import: { required: ["records", "methods"], more: ["dry-run", "replace"] },
};
const OPTIONS = {
  records: text, methods: text, source: text, level: text, topic: text, model: text, digest: text,
  // A list, so that a second name is refused and not dropped.
  by: { type: "string", multiple: true },
  "include-machine-read": flag, "keep-summary": flag, replace: flag, "dry-run": flag,
} as const;

async function runCommand(args: string[], deps: MethodCommandDeps): Promise<CommandResult> {
  const [command, ...rest] = args;
  const { repoRoot, now, runCli } = deps;
  if (command === undefined || !Object.hasOwn(COMMANDS, command)) {
    return stopped(`${command ? `there is no command "${command}"` : "no command"}. Use --help`);
  }
  const { required, more } = COMMANDS[command];
  const { values } = parseArgs({ args: rest, options: OPTIONS, strict: true, allowPositionals: false });
  const other = Object.keys(values).filter((name) => !required.includes(name) && !more.includes(name));
  if (other.length > 0) return stopped(`${command} has no option ${other.map((n) => `--${n}`).join(", ")}. Use --help`);
  const missing = required.filter((name) => [values[name as keyof typeof values]].flat().every((v) => !v));
  if (missing.length > 0) return stopped(`missing ${missing.map((n) => `--${n}`).join(", ")}. Use --help`);
  const { records: recordsDir = "", methods: methodsDir = "", digest = "", by = [], replace, model } = values;
  const includeMachineRead = values["include-machine-read"] ?? false;
  if (command === "import") {
    const store = deps.makeStore();
    if (!store) return stopped("missing SUPABASE_URL or SUPABASE_SECRET_KEY. Set both before the import");
    return importTopicMethods({ recordsDir, methodsDir, repoRoot, dryRun: values["dry-run"], replace, store, announce: deps.out });
  }
  // Any topic number gives the same source and level.
  const made = makeMethodKey(values.source, values.level, command === "gaps" ? 1 : values.topic);
  if (!made.ok) return stopped(made.error);
  const { key } = made;
  const topic = { key, recordsDir, methodsDir, repoRoot, now };
  switch (command) {
    case "draft":
      return draftTopicMethod({ ...topic, includeMachineRead, keepSummary: values["keep-summary"], replace, model, runCli });
    case "show":
      return showTopicMethod(topic);
    case "approve":
      return by.length === 1 ? approveTopicMethod({ ...topic, by: by[0], digest }) : stopped("give one --by for each run");
    default:
      return listGaps({ source: key.source, level: key.level, recordsDir, repoRoot, includeMachineRead });
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
    deps.err(`problem: ${messageOf(err)}`);
    return 1;
  }
}
