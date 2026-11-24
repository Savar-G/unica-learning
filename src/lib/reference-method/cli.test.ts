import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMethodCommand, type MethodCommandDeps } from "./cli";
import type { TopicMethodRow, TopicMethodStore } from "./import";
import { add, makeContents, makeExample, makeItem, makePage } from "./test-records";

let root: string;
let out: string[];
let err: string[];
let rows: TopicMethodRow[];
let deps: MethodCommandDeps;

const store: TopicMethodStore = {
  findExisting: async () => new Map(),
  insertRow: async (row) => {
    rows.push(row);
    return true;
  },
  updateRow: async () => true,
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "unica-method-cli-"));
  for (const dir of ["repo", "final"]) mkdirSync(join(root, dir));
  const records = [makePage("11a", { examples: [makeExample(add(45, 3))], items: [makeItem(1, add(23, 4))] }), makeContents()];
  records.forEach((r, i) => writeFileSync(join(root, "final", `${i}.json`), JSON.stringify(r)));
  writeFileSync(
    join(root, "final", "status.json"),
    JSON.stringify(Object.fromEntries(records.map((r) => [r.source_ref, "double_read"]))),
  );
  out = [];
  err = [];
  rows = [];
  deps = {
    repoRoot: join(root, "repo"),
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    now: () => new Date("2026-01-02T03:04:05.000Z"),
    makeStore: () => store,
    runCli: async () => ({
      code: 0,
      stdout: JSON.stringify({ sentences: [{ kind: "introduces", text: "It adds.", cites: ["demo:Z:11a"] }] }),
      stderr: "",
    }),
  };
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

const run = (...args: string[]): Promise<number> => runMethodCommand(args, deps);
const records = (): string[] => ["--records", join(root, "final")];
const methods = (): string[] => ["--methods", join(root, "methods")];
const topic = (): string[] => ["--source", "demo", "--level", "z", "--topic", "1"];

describe("npm run reference:method", () => {
  it("drafts, approves with two names, lists the gaps and imports", async () => {
    expect(await run("draft", ...records(), ...methods(), ...topic())).toBe(0);
    expect(readdirSync(join(root, "methods"))).toEqual(["demo-Z-topic-1.json"]);
    expect(await run("approve", ...records(), ...methods(), ...topic(), "--by", "Ann", "--by", "Bo")).toBe(0);
    expect(await run("gaps", ...records(), "--source", "demo", "--level", "Z")).toBe(0);
    expect(out.join("\n")).toContain("no gaps in the pages with facts");
    expect(await run("import", ...records(), ...methods())).toBe(0);
    expect(rows.map((r) => [r.level, r.topic, r.status])).toEqual([["Z", 1, "approved"]]);
    expect(err).toEqual([]);
  });

  it("prints the help and changes nothing", async () => {
    for (const args of [["--help"], ["draft", "--help"]]) {
      expect(await run(...args)).toBe(0);
    }
    for (const word of ["draft", "approve", "gaps", "import", "--keep-summary", "--replace", "--dry-run", "--include-machine-read"]) {
      expect(out[0]).toContain(word);
    }
    expect(readdirSync(root).sort()).toEqual(["final", "repo"]);
  });

  it.each<[string, () => string[], string]>([
    ["no subcommand", () => [], "Usage"],
    ["an unknown subcommand", () => ["publish"], "Usage"],
    ["an unknown flag", () => ["gaps", ...records(), "--source", "demo", "--level", "Z", "--force"], "--force"],
    ["a flag of another subcommand", () => ["approve", ...records(), ...methods(), ...topic(), "--by", "Ann", "--replace"], "--replace"],
    ["a missing folder", () => ["draft", ...records(), ...topic()], "--methods"],
    ["a bad topic", () => ["draft", ...records(), ...methods(), "--source", "demo", "--level", "Z", "--topic", "one"], "topic must be"],
    ["a bad level", () => ["gaps", ...records(), "--source", "demo", "--level", "Z/1"], "level must be"],
    ["no approver", () => ["approve", ...records(), ...methods(), ...topic()], "--by"],
    ["a model of another family", () => ["draft", ...records(), ...methods(), ...topic(), "--model", "gpt-x"], "belongs to the codex"],
    ["a methods folder that does not exist", () => ["import", ...records(), ...methods()], "could not be read"],
  ])("exits with 1 and says why for %s", async (_name, args, text) => {
    expect(await run(...args())).toBe(1);
    expect(err.join("\n")).toContain(text);
    expect(rows).toEqual([]);
  });

  it("asks for the database settings before it reads the folders", async () => {
    deps.makeStore = () => null;
    expect(await run("import", ...records(), ...methods())).toBe(1);
    expect(err.join()).toContain("SUPABASE_URL");
  });

  it("passes the flags on", async () => {
    await run("draft", ...records(), ...methods(), ...topic());
    expect(await run("import", ...records(), ...methods(), "--dry-run", "--replace")).toBe(0);
    expect(rows).toEqual([]);
    writeFileSync(
      join(root, "final", "status.json"),
      JSON.stringify({ "demo:Z:11a": "machine_read", "demo:Z:contents": "double_read" }),
    );
    expect(await run("draft", ...records(), ...methods(), ...topic(), "--keep-summary")).toBe(1);
    expect(await run("draft", ...records(), ...methods(), ...topic(), "--keep-summary", "--include-machine-read")).toBe(0);
    out.length = 0;
    await run("gaps", ...records(), "--source", "demo", "--level", "Z");
    expect(out.join()).toContain("no facts (machine_read): demo:Z:11a");
    out.length = 0;
    await run("gaps", ...records(), "--source", "demo", "--level", "Z", "--include-machine-read");
    expect(out.join()).not.toContain("no facts");
  });
});
