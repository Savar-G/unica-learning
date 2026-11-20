import assert from "node:assert/strict";
import test from "node:test";
import { buildChecks, isDeleteOnlyPush, LOCAL_BUDGET_MS, runPrePushChecks } from "./pre-push-check.mjs";

const ZERO = "0".repeat(40);
const SHA = "a".repeat(40);

test("isDeleteOnlyPush skips pure remote ref deletions and runs on normal pushes", () => {
  assert.equal(isDeleteOnlyPush(""), false);
  assert.equal(isDeleteOnlyPush(`(delete) ${ZERO} refs/heads/site/old ${SHA}\n`), true);
  assert.equal(
    isDeleteOnlyPush(`(delete) ${ZERO} refs/heads/a ${SHA}\n(delete) ${ZERO} refs/heads/b ${SHA}\n`),
    true,
  );
  assert.equal(isDeleteOnlyPush(`refs/heads/site/feat ${SHA} refs/heads/site/feat ${ZERO}\n`), false);
  assert.equal(
    isDeleteOnlyPush(`(delete) ${ZERO} refs/heads/old ${SHA}\nrefs/heads/site/new ${SHA} refs/heads/site/new ${ZERO}\n`),
    false,
  );
});

test("buildChecks covers Oxlint plus both app and voice-worker complete type checks", () => {
  const checks = buildChecks("/tmp/repo");
  assert.deepEqual(checks.map((c) => c.name), ["oxlint", "app-typecheck", "voice-typecheck"]);
  assert.deepEqual(checks[0].steps.map((s) => s.args), [["src"]]);
  assert.deepEqual(checks[1].steps.map((s) => s.args), [["typegen"], ["--noEmit"]]);
  assert.deepEqual(checks[2].steps.map((s) => s.args), [["-p", "worker/maya-voice/tsconfig.json"]]);
});

test("runPrePushChecks runs pipelines in parallel, preserves step order, and tracks budget", async () => {
  const order = [];
  let clock = 0;
  const checks = [
    { name: "oxlint", steps: [{ cmd: "oxlint", args: ["src"] }] },
    {
      name: "app-typecheck",
      steps: [
        { cmd: "next", args: ["typegen"] },
        { cmd: "tsgo", args: ["--noEmit"] },
      ],
    },
    { name: "voice-typecheck", steps: [{ cmd: "tsgo", args: ["-p", "worker/maya-voice/tsconfig.json"] }] },
  ];

  const summary = await runPrePushChecks({
    rootDir: "/tmp/repo",
    checks,
    now: () => (clock += 500),
    runStep: async ({ cmd, args }) => {
      order.push(`${cmd} ${args.join(" ")}`);
      return { code: 0, output: "ok" };
    },
  });

  assert.equal(summary.ok, true);
  assert.equal(summary.overBudget, false);
  assert.ok(summary.totalMs <= LOCAL_BUDGET_MS);
  assert.ok(order.indexOf("next typegen") < order.indexOf("tsgo --noEmit"));
  assert.equal(summary.results.length, 3);
});

test("runPrePushChecks stops a failing pipeline and exits non-ok with its output", async () => {
  const ran = [];
  const checks = [
    { name: "oxlint", steps: [{ cmd: "oxlint", args: ["src"] }] },
    {
      name: "app-typecheck",
      steps: [
        { cmd: "next", args: ["typegen"] },
        { cmd: "tsgo", args: ["--noEmit"] },
      ],
    },
  ];

  const summary = await runPrePushChecks({
    rootDir: "/tmp/repo",
    checks,
    runStep: async ({ cmd, args }) => {
      ran.push(cmd);
      if (cmd === "next") return { code: 2, output: "typegen failed" };
      return { code: 0, output: `${cmd} ${args.join(" ")}` };
    },
  });

  assert.equal(summary.ok, false);
  assert.ok(!ran.includes("tsgo"), "tsgo should not run when next typegen fails");
  const failed = summary.results.find((r) => r.name === "app-typecheck");
  assert.equal(failed.ok, false);
  assert.equal(failed.code, 2);
  assert.match(failed.output, /typegen failed/);
});
