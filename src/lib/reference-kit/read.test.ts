import {
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildCliInvocation,
  DEFAULT_READ_TIMEOUT_MS,
  extractJsonFromModelOutput,
  readPhoto,
  type RunCli,
} from "./read";
import { REFERENCE_READ_PROMPT } from "./read-prompt";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function sampleReaderPayload(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    kind: "page",
    level: "M",
    sheet: "3a",
    topic: { title: "Adding Two-Digit Numbers", number: 1 },
    sections: [
      {
        instruction: "Add the numbers.",
        scaffolds: [],
        items: [
          {
            n: 1,
            printed: "12 + 5 =",
            form: "horizontal",
            expr: { kind: "arith", op: "add", operands: [12, 5] },
            responses: [
              {
                position: "after_equals",
                cue: null,
                answer: "18", // deliberately wrong to test computed override + note
                answer_source: "reader",
              },
            ],
          },
          {
            n: 2,
            printed: "1/2 + 1/4 =",
            form: "horizontal",
            expr: { kind: "notation", latex: "\\frac{1}{2} + \\frac{1}{4}" },
            responses: [
              {
                position: "after_equals",
                cue: null,
                answer: "3/4",
                answer_source: "reader",
              },
            ],
          },
        ],
      },
    ],
    examples: [],
    score_bands: [
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
      [4, "open"],
    ],
    ...overrides,
  };
}

describe("extractJsonFromModelOutput", () => {
  it("extracts raw JSON, fenced JSON, prose-wrapped JSON, and chooses last page/contents object", () => {
    const obj = { kind: "page", level: "M", sheet: "3a" };
    const contentsObj = { kind: "contents", level: "M", sheet: "contents" };
    const raw = JSON.stringify(obj);

    expect(extractJsonFromModelOutput(raw)).toEqual({ ok: true, value: obj });
    expect(extractJsonFromModelOutput(`Here is the record:\n\`\`\`json\n${raw}\n\`\`\`\nDone.`)).toEqual({
      ok: true,
      value: obj,
    });
    expect(extractJsonFromModelOutput(`Metadata {"ignored": 1}. Final: ${raw}`)).toEqual({
      ok: true,
      value: obj,
    });
    expect(
      extractJsonFromModelOutput(`${JSON.stringify(contentsObj)}\n{"kind":"notice","done":true}`),
    ).toEqual({ ok: true, value: contentsObj });
    expect(extractJsonFromModelOutput("not json at all").ok).toBe(false);
  });
});

describe("readPhoto and buildCliInvocation", () => {
  it("uses a 5-minute default timeout, stages only page.jpg in a fresh temp folder, and passes restricted flags without mask wording", async () => {
    expect(DEFAULT_READ_TIMEOUT_MS).toBe(300_000);

    const claudeCalls: Array<{ cmd: string; args: string[]; cwdFiles: string[]; timeoutMs: number }> = [];
    const fakeClaude: RunCli = async (cmd, args, opts) => {
      claudeCalls.push({
        cmd,
        args,
        cwdFiles: readdirSync(opts.cwd),
        timeoutMs: opts.timeoutMs,
      });
      return { code: 0, stdout: JSON.stringify(sampleReaderPayload()), stderr: "" };
    };

    const res = await readPhoto({
      photoBytes: new Uint8Array([0xff, 0xd8, 0x01, 0x02]),
      source: "sample",
      reader: "claude",
      model: "claude-sonnet-test",
      runCli: fakeClaude,
    });

    expect(res.status).toBe("ok");
    if (res.status === "ok") {
      expect(res.record.source_ref).toBe("sample:M:3a");
      expect(res.notes.length).toBeGreaterThan(0);
      if (res.record.kind === "page") {
        expect(res.record.sections[0].items[0].responses[0].answer).toBe("17");
        expect(res.record.sections[0].items[0].responses[0].answer_source).toBe("computed");
        expect(res.record.sections[0].items[1].responses[0].answer).toBe("3/4");
        expect(res.record.sections[0].items[1].responses[0].answer_source).toBe("reader");
      }
    }

    expect(claudeCalls).toHaveLength(1);
    expect(claudeCalls[0].cmd).toBe("claude");
    expect(claudeCalls[0].timeoutMs).toBe(300_000);
    expect(claudeCalls[0].cwdFiles).toEqual(["page.jpg"]);
    expect(claudeCalls[0].args).toContain("--restricted");
    expect(claudeCalls[0].args).toContain("--safe-mode");
    expect(claudeCalls[0].args).toContain("--strict-mcp-config");
    expect(claudeCalls[0].args).toContain("--no-session-persistence");
    expect(claudeCalls[0].args).not.toContain("--add-dir");
    expect(claudeCalls[0].args).not.toContain("--setting-sources");
    expect(claudeCalls[0].args.join(" ")).not.toMatch(/masked/i);
  });

  it("builds isolated codex args with page.jpg and passes prompt on stdin", async () => {
    const codexCalls: Array<{ cmd: string; args: string[]; cwdFiles: string[]; stdin?: string }> = [];
    const fakeCodex: RunCli = async (cmd, args, opts) => {
      codexCalls.push({ cmd, args, cwdFiles: readdirSync(opts.cwd), stdin: opts.stdin });
      return {
        code: 0,
        stdout: `\`\`\`json\n${JSON.stringify(sampleReaderPayload({ sheet: "4a" }))}\n\`\`\``,
        stderr: "",
      };
    };

    const res = await readPhoto({
      photoBytes: new Uint8Array([0xff, 0xd8, 0x05, 0x06]),
      source: "sample",
      reader: "codex",
      model: "gpt-test",
      runCli: fakeCodex,
    });

    expect(res.status).toBe("ok");
    expect(codexCalls[0].cmd).toBe("codex");
    expect(codexCalls[0].cwdFiles).toEqual(["page.jpg"]);
    expect(codexCalls[0].args).toContain("exec");
    expect(codexCalls[0].args).toContain("-i");
    expect(codexCalls[0].args).toContain("--ignore-user-config");
    expect(codexCalls[0].args).toContain("--ignore-rules");
    expect(codexCalls[0].args.some((a) => a.endsWith("page.jpg"))).toBe(true);
    expect(codexCalls[0].stdin).toContain(REFERENCE_READ_PROMPT);
  });

  it("retries once with validation errors and refuses not_stated from a reader while allowing prose sentences containing those letters", async () => {
    let calls = 0;
    let secondPrompt = "";
    const fakeCli: RunCli = async (_cmd, args, opts) => {
      calls += 1;
      if (calls === 1) {
        const bad = sampleReaderPayload({
          topic: { title: "Adding Two-Digit Numbers", number: "not_stated" },
        });
        (bad.sections as Array<Record<string, unknown>>)[0].scaffolds = "not_stated";
        return { code: 0, stdout: JSON.stringify(bad), stderr: "" };
      }
      secondPrompt = opts.stdin ?? args[args.length - 1] ?? "";
      const good = sampleReaderPayload();
      (good.sections as Array<Record<string, unknown>>)[0].instruction =
        "The hint is not_stated on the margin.";
      return { code: 0, stdout: JSON.stringify(good), stderr: "" };
    };

    const res = await readPhoto({
      photoBytes: new Uint8Array([0xff, 0xd8, 0x07, 0x08]),
      source: "sample",
      reader: "codex",
      runCli: fakeCli,
    });

    expect(calls).toBe(2);
    expect(secondPrompt).toContain("readers must not write not_stated at topic.number");
    expect(secondPrompt).toContain("readers must not write not_stated at sections[0].scaffolds");
    expect(res.status).toBe("ok");
  });

  it("refuses model ids of the other family, invalid --source, and symlinked photoPath", async () => {
    expect(() =>
      buildCliInvocation({
        family: "claude",
        model: "gpt-5",
        photoDir: "/tmp/example",
        prompt: "hi",
      }),
    ).toThrow(/model/i);

    expect(() =>
      buildCliInvocation({
        family: "codex",
        model: "claude-sonnet-4-6",
        photoDir: "/tmp/example",
        prompt: "hi",
      }),
    ).toThrow(/model/i);

    await expect(
      readPhoto({
        photoBytes: new Uint8Array([1, 2, 3]),
        source: "bad-source",
        reader: "codex",
      }),
    ).rejects.toThrow(/--source/);

    const dir = mkdtempSync(join(tmpdir(), "ref-read-sym-"));
    tempDirs.push(dir);
    const real = join(dir, "real.jpg");
    const link = join(dir, "link.jpg");
    writeFileSync(real, Buffer.from([1, 2, 3]));
    symlinkSync(real, link);

    const res = await readPhoto({
      photoPath: link,
      source: "sample",
      reader: "codex",
    });
    expect(res.status).toBe("cli_error");
    if (res.status === "cli_error") {
      expect(res.reason).toMatch(/symlink/i);
    }
  });
});
