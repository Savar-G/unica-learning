import { existsSync, readdirSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import type { CliRunOptions, RunCli } from "@/lib/reference-kit/read-cli";
import { draftSummary } from "./draft";
import type { SummaryContext } from "./summary";
import { add, evidenceFor, makeExample, makeItem, makePage } from "./test-records";

interface Call {
  cmd: string;
  args: string[];
  opts: CliRunOptions;
  filesInCwd: string[];
}

let calls: Call[];
let answers: Array<string | { code: number; stderr: string }>;
let ctx: SummaryContext;

const runCli: RunCli = async (cmd, args, opts) => {
  calls.push({ cmd, args, opts, filesInCwd: readdirSync(opts.cwd) });
  const answer = answers.shift() ?? "";
  return typeof answer === "string" ? { code: 0, stdout: answer, stderr: "" } : { stdout: "", ...answer };
};

const good = { kind: "introduces", text: "The page adds a small number.", cites: ["demo:Z:11a"] };
const bad = { ...good, cites: ["demo:Z:13a"] };
const reply = (...sentences: unknown[]): string => JSON.stringify({ sentences });

beforeEach(() => {
  calls = [];
  answers = [];
  const once = makePage("11b", { single_read: ["sections[0].instruction"] });
  once.sections[0].instruction = "once read words";
  const withheld = makePage("12a");
  withheld.sections[0].instruction = "withheld words";
  const built = evidenceFor(
    [makePage("11a", { examples: [makeExample(add(45, 3))], items: [makeItem(1, add(23, 4))] }), once, withheld],
    { statuses: { "demo:Z:12a": "machine_read" } },
  );
  if (!built.ok) throw new Error(built.problems.join("\n"));
  ctx = { topic: 1, evidence: built.evidence, views: built.views };
});

const draft = (): ReturnType<typeof draftSummary> => draftSummary({ ctx, runCli });

describe("drafting the summary (M3)", () => {
  it("returns a valid answer after one call", async () => {
    answers = [`Here it is:\n\`\`\`json\n${reply(good)}\n\`\`\``];
    expect(await draft()).toEqual({ ok: true, summary: [good], model: "claude" });
    expect(calls).toHaveLength(1);
  });

  it("gives the model no tools, no photo and an empty folder that is removed after", async () => {
    answers = [reply(good)];
    await draftSummary({ ctx, runCli, model: "claude-test" });
    const [{ cmd, args, opts, filesInCwd }] = calls;
    expect(cmd).toBe("claude");
    expect(args[args.indexOf("--tools") + 1]).toBe("");
    for (const flag of ["--restricted", "--safe-mode", "--strict-mcp-config", "--no-session-persistence"]) {
      expect(args).toContain(flag);
    }
    expect(args.slice(-2)).toEqual(["--model", "claude-test"]);
    expect(filesInCwd).toEqual([]);
    expect(existsSync(opts.cwd)).toBe(false);
    expect(`${args.join(" ")} ${opts.stdin}`).not.toMatch(/\.jpe?g|\.png|\.webp|photo_sha|sha256|\/Users\/|\/private\//i);
  });

  it("gives the model the records and the facts, and nothing that may not become a fact", async () => {
    answers = [reply(good)];
    await draft();
    const prompt = calls[0].opts.stdin ?? "";
    expect(prompt).toContain("Find each total.");
    expect(prompt).toContain("arith add 2x1 horizontal");
    expect(prompt).not.toContain("once read words");
    expect(prompt).not.toContain("withheld words");
    expect(prompt).not.toContain("single_read");
  });

  it("retries once with the validation errors", async () => {
    answers = [reply(bad), reply(good)];
    expect(await draft()).toMatchObject({ ok: true, summary: [good] });
    expect(calls).toHaveLength(2);
    expect(calls[0].opts.stdin).not.toContain("is not a page of this topic");
    expect(calls[1].opts.stdin).toContain('sentences[0]: "demo:Z:13a" is not a page of this topic');
  });

  it("stops after the second bad answer and lists the problems", async () => {
    answers = [reply(good, bad), reply({ ...good, cites: [] }), reply(good)];
    const result = await draft();
    expect(result).toEqual({
      ok: false,
      problems: ["sentences[0]: needs a citation, or must be marked as a guess"],
    });
    expect(calls).toHaveLength(2);
  });

  it.each([
    ["no text", ""],
    ["no JSON", "I cannot do that."],
    ["another object", '{"kind":"page"}'],
    ["an extra field", JSON.stringify({ sentences: [good], note: "x" })],
    ["damaged text", reply({ ...good, text: "Adds \uFFFD." })],
  ])("does not accept an answer with %s", async (_name, answer) => {
    answers = [answer, answer];
    expect((await draft()).ok).toBe(false);
    expect(calls).toHaveLength(2);
  });

  it("stops when the command fails, and does not call it again", async () => {
    answers = [{ code: 1, stderr: "usage limit" }, reply(good)];
    expect(await draft()).toEqual({ ok: false, problems: ["the model command failed: usage limit"] });
    expect(calls).toHaveLength(1);
  });

  it("removes the folder also when the runner throws", async () => {
    let cwd = "";
    const result = await draftSummary({
      ctx,
      runCli: async (_cmd, _args, opts) => {
        cwd = opts.cwd;
        throw new Error("no such command");
      },
    });
    expect(result).toEqual({ ok: false, problems: ["the model command failed: no such command"] });
    expect(existsSync(cwd)).toBe(false);
  });

  it("refuses a model of another family", async () => {
    await expect(draftSummary({ ctx, runCli, model: "gpt-x" })).rejects.toThrow("belongs to the codex");
    expect(calls).toEqual([]);
  });

  it("calls no model when no page gives facts", async () => {
    const built = evidenceFor([]);
    if (!built.ok) throw new Error("expected facts");
    ctx = { topic: 1, evidence: built.evidence, views: built.views };
    expect(await draft()).toEqual({ ok: true, summary: [], model: null });
    expect(calls).toEqual([]);
  });
});
