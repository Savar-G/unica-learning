import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { createSession, step, fallbacks } from "./maya";
import { operationResult, sameValue } from "./question-package";
import { readNumbers } from "./number-words";
import type { GeneratedWorkbook } from "./workbook-generator";

const run = promisify(execFile);

it("generates and teaches all five missing factors from their printed products", async () => {
  const out = await mkdtemp(join(tmpdir(), "unica-maya-printed-"));
  try {
    // The public fake CLI calls generateWorkbook with the real strict fit. A fit stub selects different questions.
    await run(process.execPath, ["scripts/workbook-samples.mjs", "--fake", "--no-store", "--check-only",
      "--levels", "U16", "--days", "1,5,10", "--concurrency", "3", "--out", out], {
      env: { ...process.env, WORKBOOK_SAMPLE_ID: "17fc5da1-2442-488a-a450-611a471e73e6" }, maxBuffer: 2_000_000,
    });
    const draft: GeneratedWorkbook = JSON.parse(await readFile(join(out, "U16-draft.json"), "utf8"));
    const expected = [[21, 1, 20, 6000], [22, 1, 20, 2000], [24, 1, 50, 2000], [24, 4, 20, 8000], [27, 9, 50, 5000]];
    const missing = draft.pages.flatMap(page => page.questions.flatMap(q => q.package?.templateId === "5.9-multiply-tens#3.3:missing"
      ? [[page.number, q.number, q.package] as const] : []));
    expect(missing).toHaveLength(5);
    for (const [page, number, factor, product] of expected) {
      const pkg = missing.find(([p, q]) => p === page && q === number)![2];
      expect(pkg.text).toBe(`${factor} × ? = ${product}`);
      expect(pkg.operation).toEqual({ kind: "divide", operands: [product, factor] });
      expect(pkg.answer?.value).toEqual({ type: "number", value: product / factor });
      const session = createSession({ callId: `${page}:${number}`, confirmWorkbook: true, package: pkg });
      expect(session.contentProblem).toBeNull();
      expect(session.package?.operation).toEqual(pkg.operation);
      const started = step(session, { type: "start", at: 0 }).session;
      const opening = step(started, { type: "proposal", at: 0, proposal: fallbacks(started, [])[0] });
      expect(opening.refusal).toBeNull();
    }
    for (const q of draft.pages.flatMap(page => page.questions)) if (q.package?.operationSource === "maya") {
      const pkg = q.package, op = pkg.operation!;
      const printed = new Set(readNumbers(pkg.text).map(n => n.value));
      const operands = op.kind === "evaluate" ? readNumbers(op.operands[0]).map(n => n.value)
        : op.operands.flatMap(value => typeof value === "number" ? [value]
          : typeof value === "object" && value.type === "fraction" ? [value.numerator, value.denominator] : []);
      for (const operand of operands) expect(printed.has(operand), `${pkg.text}: hidden ${operand}`).toBe(true);
      expect(sameValue(operationResult(op), pkg.answer!.value), pkg.text).toBe(true);
    }
  } finally { await rm(out, { recursive: true, force: true }); }
}, 300_000);
