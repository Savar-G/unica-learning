import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { classifyScope } from "./pr-scope.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const WORKFLOW_PATH = path.join(ROOT, ".github/workflows/ci.yml");
const SUMMARY_SCRIPT = path.join(ROOT, ".github/scripts/engine-summary.mjs");

function readWorkflow() {
  return readFileSync(WORKFLOW_PATH, "utf8");
}

function getJobBlock(workflow, name) {
  const jobs = workflow.split(/\n(?=  [a-z-]+:\n)/);
  return jobs.find((j) => j.startsWith(`  ${name}:\n`)) ?? null;
}

function walkTests(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkTests(full, out);
    else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      out.push(path.relative(ROOT, full).split(path.sep).join("/"));
    }
  }
  return out.sort();
}

function extractExcludes(line) {
  return [...line.matchAll(/--exclude=(?:'([^']+)'|"([^"]+)"|(\S+))/g)].map((m) => m[1] ?? m[2] ?? m[3]);
}

/** The test files the scan matrix job names, one for each runner of its matrix. */
function scaleTargets(scaleJob) {
  const listed = scaleJob.match(/\n {6}matrix:\n {8}file: \[([^\]]*)\]\n/);
  assert.ok(listed, "scan-binding-scale must list its files in matrix.file");
  const line = scaleJob.split("\n").find((l) => l.includes("npm test --"));
  return listed[1].split(",").map((f) => line.match(/npm test -- (\S+?\$\{\{ matrix\.file \}\}\S*)/)[1].replace("${{ matrix.file }}", f.trim()));
}

function matchesAny(file, patterns) {
  return patterns.some((pattern) => path.posix.matchesGlob(file, pattern));
}

function extractIndentedRunBlock(jobBlock, stepName) {
  const marker = `- name: ${stepName}\n`;
  const start = jobBlock.indexOf(marker);
  assert.ok(start !== -1, `missing step "${stepName}"`);
  const after = jobBlock.slice(start);
  const runMatch = after.match(/\n(\s+)run: \|\n([\s\S]*)/);
  assert.ok(runMatch, `missing multiline run block in "${stepName}"`);
  const indent = `${runMatch[1]}  `;
  const lines = [];
  for (const line of runMatch[2].split("\n")) {
    if (line.startsWith(indent)) {
      lines.push(line.slice(indent.length));
    } else if (line.trim() === "") {
      lines.push("");
    } else {
      break;
    }
  }
  return lines.join("\n").trim();
}

test("every engine test file is owned by exactly one job in full mode and in affected mode", () => {
  const workflow = readWorkflow();
  const unitJob = getJobBlock(workflow, "unit");
  const prUnitJob = getJobBlock(workflow, "pr-unit");
  const engineJob = getJobBlock(workflow, "engine");
  const mayaJob = getJobBlock(workflow, "maya-behaviour");
  const scaleJob = getJobBlock(workflow, "scan-binding-scale");
  assert.ok(unitJob && prUnitJob && engineJob && mayaJob && scaleJob, "all test jobs must exist in ci.yml");

  const unitTestLine = unitJob.split("\n").find((l) => l.includes("npm test --"));
  const prUnitTestLine = prUnitJob.split("\n").find((l) => l.includes("npm test --"));
  const engineTestLine = engineJob.split("\n").find((l) => l.includes("npm test --"));
  const mayaTestLine = mayaJob.split("\n").find((l) => l.includes("npm test --"));
  assert.ok(unitTestLine && prUnitTestLine && engineTestLine && mayaTestLine);
  const scaleFiles = scaleTargets(scaleJob);

  const unitExcludes = extractExcludes(unitTestLine);
  const prUnitExcludes = extractExcludes(prUnitTestLine);
  // Vitest takes this argument as a part of a path, so it must end at the folder.
  const engineTarget = engineTestLine.trim().split(" ").at(-1);
  assert.equal(engineTarget, "src/lib/workbook-v2/");
  const inEngineJob = (file) => file.includes(engineTarget);

  const allTests = [...walkTests(path.join(ROOT, "src")), "src/lib/workbook-v2-tools.test.ts", "src/lib/workbook-v2.test.ts"];
  const engineTests = walkTests(path.join(ROOT, "src/lib/workbook-v2"));
  assert.ok(engineTests.length >= 10, `expected engine test files, got ${engineTests.length}`);

  // Full mode: engine runs all engine tests; unit excludes engine, maya-behaviour, and scan-binding-scale.
  for (const file of allTests) {
    const owners = [];
    if (!matchesAny(file, unitExcludes)) owners.push("unit");
    if (inEngineJob(file)) owners.push("engine");
    if (mayaTestLine.includes(file)) owners.push("maya-behaviour");
    // Vitest takes each argument as a part of a path, so a name that is part of another would run that file twice.
    for (const target of scaleFiles) if (file.includes(target)) owners.push("scan-binding-scale");
    assert.equal(owners.length, 1, `full mode: ${file} must have exactly 1 owner, got ${JSON.stringify(owners)}`);
    if (file.startsWith("src/lib/workbook-v2/")) {
      assert.deepEqual(owners, ["engine"]);
    }
  }

  // Affected mode when an engine file changes (engine-only and engine + app).
  for (const changedFiles of [
    ["src/lib/workbook-v2/build/build-book.ts"],
    ["src/lib/workbook-v2/build/build-book.ts", "src/components/referral-card.tsx"],
  ]) {
    const scope = classifyScope({ eventName: "pull_request", changedFiles });
    assert.equal(scope.mode, "affected");
    assert.equal(scope.runEngine, true);
    for (const file of engineTests) {
      const owners = [];
      if (scope.runEngine && inEngineJob(file)) owners.push("engine");
      if (scope.runPrUnit && !matchesAny(file, prUnitExcludes)) owners.push("pr-unit");
      assert.deepEqual(owners, ["engine"], `affected mode (${changedFiles.join(", ")}): ${file} must run only in engine`);
    }
  }
});

test("every file of the scan matrix runs on its own runner in full mode and only in pr-unit in affected mode", () => {
  const workflow = readWorkflow();
  const scaleJob = getJobBlock(workflow, "scan-binding-scale");
  const onDisk = walkTests(path.join(ROOT, "src/lib")).filter((f) => f.includes("/scan-binding-scale"));
  assert.equal(onDisk.length, 3);
  assert.deepEqual(scaleTargets(scaleJob).sort(), onDisk);
  assert.match(scaleJob, /\n {4}if: needs\.scope\.outputs\.mode == 'full'\n/);
  assert.match(scaleJob, /\n {6}fail-fast: false\n/);
  // The job is skipped only as a whole (the gate reads that), and its one test command has one file.
  assert.equal((scaleJob.match(/^\s*(?:- )?if:/gm) ?? []).length, 1);
  assert.deepEqual(
    scaleJob.split("\n").map((l) => l.trim().replace(/^- /, "")).filter((l) => /^run:/.test(l)),
    ["run: npm ci --no-audit --no-fund", "run: npm test -- src/lib/${{ matrix.file }}.test.ts --maxWorkers=1"],
  );
  for (const weaker of ["continue-on-error", "--retry", "--passWithNoTests", "--testTimeout", "--bail", "exclude:", "|| true"]) {
    assert.equal(scaleJob.includes(weaker), false, `scan-binding-scale must not use ${weaker}`);
  }

  // Affected mode: the scan matrix job does not run, and nothing keeps its files out of pr-unit.
  const prUnitLine = getJobBlock(workflow, "pr-unit").split("\n").find((l) => l.includes("--changed="));
  const scope = classifyScope({ eventName: "pull_request", changedFiles: ["src/lib/scan-calibration.ts"] });
  assert.equal(scope.mode, "affected");
  assert.equal(scope.runChangedUnit, true);
  for (const file of onDisk) assert.equal(matchesAny(file, extractExcludes(prUnitLine)), false, file);
});

test("the required test job shell fails when engine is required and does not succeed, or runs when not required", () => {
  const workflow = readWorkflow();
  const testJob = getJobBlock(workflow, "test");
  assert.ok(testJob, "test job must exist");
  assert.match(testJob, /needs: \[[^\]]*\bengine\b[^\]]*\]/, "test job must depend on engine");
  assert.match(testJob, /RUN_ENGINE:\s*\$\{\{\s*needs\.scope\.outputs\.run_engine\s*\}\}/);
  for (const [name, job] of [["ENGINE", "engine"], ["SCAN_BINDING", "scan-binding-scale"], ["UNIT", "unit"], ["PR_UNIT", "pr-unit"], ["MAYA", "maya-behaviour"], ["ZONES", "family-zones"], ["LINT", "lint-and-types"], ["VOICE", "voice-worker"]]) {
    assert.equal(testJob.split(`\n          ${name}_RESULT: \${{ needs.${job}.result }}\n`).length, 2, `${name}_RESULT is the result of ${job}`);
  }

  const script = extractIndentedRunBlock(testJob, "Required CI jobs passed");
  const baseEnv = {
    PATH: process.env.PATH,
    SCOPE_RESULT: "success",
    MODE: "affected",
    REASON: "scoped-pr",
    RUN_PR_UNIT: "true",
    RUN_ENGINE: "true",
    RUN_LINT: "true",
    RUN_MAYA: "false",
    RUN_ZONES: "false",
    RUN_VOICE: "false",
    UNIT_RESULT: "skipped",
    SCAN_BINDING_RESULT: "skipped",
    PR_UNIT_RESULT: "success",
    ENGINE_RESULT: "success",
    MAYA_RESULT: "skipped",
    ZONES_RESULT: "skipped",
    LINT_RESULT: "success",
    VOICE_RESULT: "skipped",
  };

  const runGate = (overrides) => spawnSync("bash", ["-e", "-c", script], {
    env: { ...baseEnv, ...overrides },
    encoding: "utf8",
  });

  // Required engine job: only success passes; failure, cancelled, skipped all fail.
  assert.equal(runGate({ RUN_ENGINE: "true", ENGINE_RESULT: "success" }).status, 0);
  for (const bad of ["failure", "cancelled", "skipped"]) {
    const res = runGate({ RUN_ENGINE: "true", ENGINE_RESULT: bad });
    assert.notEqual(res.status, 0, `expected failure when engine is required and result=${bad}`);
  }

  // Non-required engine job: only skipped passes; success, failure, cancelled all fail.
  assert.equal(runGate({ RUN_ENGINE: "false", ENGINE_RESULT: "skipped" }).status, 0);
  for (const bad of ["success", "failure", "cancelled"]) {
    const res = runGate({ RUN_ENGINE: "false", ENGINE_RESULT: bad });
    assert.notEqual(res.status, 0, `expected failure when engine is not required and result=${bad}`);
  }

  // Full mode requires engine to succeed too.
  assert.equal(runGate({
    MODE: "full",
    RUN_PR_UNIT: "false",
    RUN_ENGINE: "true",
    RUN_MAYA: "true",
    RUN_ZONES: "true",
    RUN_VOICE: "true",
    UNIT_RESULT: "success",
    SCAN_BINDING_RESULT: "success",
    PR_UNIT_RESULT: "skipped",
    ENGINE_RESULT: "success",
    MAYA_RESULT: "success",
    ZONES_RESULT: "success",
    LINT_RESULT: "success",
    VOICE_RESULT: "success",
  }).status, 0);
  assert.notEqual(runGate({
    MODE: "full",
    RUN_PR_UNIT: "false",
    RUN_ENGINE: "true",
    RUN_MAYA: "true",
    RUN_ZONES: "true",
    RUN_VOICE: "true",
    UNIT_RESULT: "success",
    SCAN_BINDING_RESULT: "success",
    PR_UNIT_RESULT: "skipped",
    ENGINE_RESULT: "skipped",
    MAYA_RESULT: "success",
    ZONES_RESULT: "success",
    LINT_RESULT: "success",
    VOICE_RESULT: "success",
  }).status, 0);

  // The flags cannot turn a full run off or a skip run on.
  const jobs = ["ENGINE", "MAYA", "ZONES", "LINT", "VOICE"];
  const all = (result, flagValue) => Object.fromEntries(jobs.flatMap((j) => [[`RUN_${j}`, flagValue], [`${j}_RESULT`, result]]));
  const full = { MODE: "full", RUN_PR_UNIT: "false", PR_UNIT_RESULT: "skipped", UNIT_RESULT: "success", SCAN_BINDING_RESULT: "success", ...all("success", "true") };
  const skip = { MODE: "skip", RUN_PR_UNIT: "false", PR_UNIT_RESULT: "skipped", ...all("skipped", "false") };
  assert.equal(runGate(full).status, 0);
  assert.equal(runGate(skip).status, 0);
  for (const job of jobs) {
    for (const flagValue of ["true", "false"]) {
      assert.notEqual(runGate({ ...full, [`RUN_${job}`]: flagValue, [`${job}_RESULT`]: "skipped" }).status, 0, `full ${job} ${flagValue}`);
      assert.notEqual(runGate({ ...skip, [`RUN_${job}`]: flagValue, [`${job}_RESULT`]: "success" }).status, 0, `skip ${job} ${flagValue}`);
    }
  }

  // The scan matrix: required in full mode (one failed or cancelled part makes the job's result not success), never run otherwise.
  for (const bad of ["failure", "cancelled", "skipped"]) assert.notEqual(runGate({ ...full, SCAN_BINDING_RESULT: bad }).status, 0, `full scan matrix ${bad}`);
  assert.notEqual(runGate({ SCAN_BINDING_RESULT: "success" }).status, 0);
  assert.notEqual(runGate({ ...skip, SCAN_BINDING_RESULT: "success" }).status, 0);

  // Guard against silent empty/typo flags or unknown mode.
  assert.notEqual(runGate({ RUN_ENGINE: "", ENGINE_RESULT: "skipped" }).status, 0);
  assert.notEqual(runGate({ MODE: "bogus" }).status, 0);
  for (const flagValue of ["", "tru", "TRUE"]) {
    for (const result of ["skipped", "success"]) {
      for (const job of ["PR_UNIT", ...jobs]) {
        assert.notEqual(runGate({ [`RUN_${job}`]: flagValue, [`${job}_RESULT`]: result }).status, 0, `${job} "${flagValue}" ${result}`);
      }
    }
  }
});

test("engine summary reports seconds and 15 s budget, and never fails on slow or missing time", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "unica-engine-summary-"));
  try {
    const runSummary = (name, env) => {
      const summaryFile = path.join(dir, `${name}.md`);
      const res = spawnSync(process.execPath, [SUMMARY_SCRIPT], {
        env: { PATH: process.env.PATH, GITHUB_STEP_SUMMARY: summaryFile, ...env },
        encoding: "utf8",
      });
      assert.equal(res.status, 0, `${name} must exit 0, stderr: ${res.stderr}`);
      return readFileSync(summaryFile, "utf8");
    };

    const fast = runSummary("fast", { DURATION_MS: "5240", TEST_OUTCOME: "success" });
    assert.match(fast, /5\.24 s/);
    assert.match(fast, /15 s/);
    assert.match(fast, /within budget/i);

    const slow = runSummary("slow", { DURATION_MS: "22400", TEST_OUTCOME: "success" });
    assert.match(slow, /22\.40 s/);
    assert.match(slow, /15 s/);
    assert.match(slow, /over budget/i);

    const failed = runSummary("failed", { DURATION_MS: "3100", TEST_OUTCOME: "failure" });
    assert.match(failed, /3\.10 s/);
    assert.match(failed, /15 s/);
    assert.match(failed, /failure/i);

    for (const [label, duration] of [["empty", ""], ["nan", "NaN"], ["negative", "-10"]]) {
      const missing = runSummary(label, { DURATION_MS: duration, TEST_OUTCOME: "skipped" });
      assert.match(missing, /15 s/);
      assert.match(missing, /not recorded/i);
    }

    // Verify the workflow test step records duration_ms even on failure and summary step runs always().
    const workflow = readWorkflow();
    const engineJob = getJobBlock(workflow, "engine");
    assert.ok(engineJob, "engine job must exist");
    assert.match(engineJob, /- name: Report engine test time\n\s+if: \$\{\{ always\(\) \}\}/);

    const testStepScript = extractIndentedRunBlock(engineJob, "Engine tests");
      const outPass = path.join(dir, "out-pass.txt");
    const outFail = path.join(dir, "out-fail.txt");
    writeFileSync(outPass, "");
    writeFileSync(outFail, "");

    const runWithFakeNpm = (exitCode, outFile) => {
      const binDir = path.join(dir, `bin-${exitCode}`);
      spawnSync("mkdir", ["-p", binDir]);
      const npmStub = path.join(binDir, "npm");
      writeFileSync(npmStub, `#!/usr/bin/env bash\nexit ${exitCode}\n`);
      chmodSync(npmStub, 0o755);
      return spawnSync("bash", ["-e", "-c", testStepScript], {
        env: { PATH: `${binDir}:${process.env.PATH}`, GITHUB_OUTPUT: outFile },
        encoding: "utf8",
      });
    };

    const passRes = runWithFakeNpm(0, outPass);
    assert.equal(passRes.status, 0);
    assert.match(readFileSync(outPass, "utf8"), /^duration_ms=\d+$/m);

    const failRes = runWithFakeNpm(1, outFail);
    assert.equal(failRes.status, 1);
    assert.match(readFileSync(outFail, "utf8"), /^duration_ms=\d+$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("every CI job that runs engine tests requires the pinned Typst install, and unit/pr-unit do not", () => {
  const workflow = readWorkflow();
  const engineJob = getJobBlock(workflow, "engine");
  const unitJob = getJobBlock(workflow, "unit");
  const prUnitJob = getJobBlock(workflow, "pr-unit");
  assert.ok(engineJob && unitJob && prUnitJob);

  const installIndex = engineJob.indexOf("run: npm run typst:install");
  assert.ok(installIndex > engineJob.indexOf("npm ci"), "engine must install Typst after npm ci");
  assert.ok(installIndex < engineJob.indexOf("npm test -- src/lib/workbook-v2/"), "engine must install Typst before tests");
  const installStep = engineJob.slice(engineJob.indexOf("- name: Install the pinned Typst"), engineJob.indexOf("- name:", installIndex));
  assert.equal(installStep.includes("continue-on-error"), false, "Typst install in engine must be required (no continue-on-error)");

  assert.equal(unitJob.includes("typst:install"), false, "unit must not install Typst");
  assert.equal(prUnitJob.includes("typst:install"), false, "pr-unit must not install Typst");
});

test("pr-unit excludes engine tests and passes with no tests", () => {
  const workflow = readWorkflow();
  const prUnitJob = getJobBlock(workflow, "pr-unit");
  assert.ok(prUnitJob);
  const line = prUnitJob.split("\n").find((l) => l.includes("--changed="));
  assert.ok(line, "pr-unit must run vitest --changed");
  assert.ok(extractExcludes(line).includes("src/lib/workbook-v2/**"), "pr-unit must exclude src/lib/workbook-v2/**");
  assert.ok(line.includes("--passWithNoTests"), "pr-unit must include --passWithNoTests");
});

test("engine job uses a dedicated tsconfig, runs fast without Chromium or DB, and checks guardrails", () => {
  const tsconfig = JSON.parse(readFileSync(path.join(ROOT, "tsconfig.engine.json"), "utf8"));
  assert.equal(tsconfig.extends, "./tsconfig.json");
  assert.ok(tsconfig.include.includes("src/lib/workbook-v2/**/*.ts"));

  const workflow = readWorkflow();
  const engineJob = getJobBlock(workflow, "engine");
  assert.ok(engineJob);
  assert.match(engineJob, /runs-on: ubuntu-24\.04/);
  assert.equal(engineJob.includes("matrix:"), false, "engine runs on one machine");
  assert.equal(engineJob.includes("services:"), false, "engine needs no database");
  assert.equal(engineJob.includes("chromium"), false, "engine must not unpack Chromium");
  assert.match(engineJob, /fetch-depth: 1/);
  assert.match(engineJob, /cache: npm/);
  assert.match(engineJob, /run: npm run check:guard/);
  assert.match(engineJob, /run: npm run engine:typecheck/);

  // CI tooling self-tests must run this test file.
  const lintJob = getJobBlock(workflow, "lint-and-types");
  assert.ok(lintJob.includes(".github/scripts/engine-ci.test.mjs"), "lint-and-types must run engine-ci.test.mjs");
});

test("docs describe the engine CI job", () => {
  const engineDoc = readFileSync(path.join(ROOT, "docs/workbook-v2-engine.md"), "utf8");
  const testsSection = engineDoc.slice(engineDoc.indexOf("## Tests"));
  assert.match(testsSection, /\bengine\b/);

  const ciDoc = readFileSync(path.join(ROOT, "docs/ci/README.md"), "utf8");
  assert.match(ciDoc, /`engine`/);
  assert.match(ciDoc, /15 s/);
});
