import assert from "node:assert/strict";
import test from "node:test";
import { classifyScope, MAX_AFFECTED_FILES } from "./pr-scope.mjs";

test("push to main and workflow_dispatch always run full suite", () => {
  for (const eventName of ["push", "workflow_dispatch"]) {
    const scope = classifyScope({ eventName, changedFiles: ["docs/ci/README.md"] });
    assert.equal(scope.mode, "full");
    assert.equal(scope.runLintAndTypes, true);
    assert.equal(scope.runMayaBehaviour, true);
    assert.equal(scope.runFamilyZones, true);
    assert.equal(scope.runVoiceWorker, true);
  }
});

test("docs-only and design-only PRs skip when no dynamic-read file is touched", () => {
  const scope = classifyScope({
    eventName: "pull_request",
    changedFiles: [
      "docs/ci/README.md",
      ".design/mockups/dashboard.html",
      "DESIGN.md",
      ".agents/skills/tdd/SKILL.md",
      ".claude/skills/tdd",
      "skills-lock.json",
    ],
  });
  assert.equal(scope.mode, "skip");
  assert.equal(scope.runPrUnit, false);
  assert.equal(scope.runLintAndTypes, false);
  assert.equal(scope.runMayaBehaviour, false);
  assert.equal(scope.runFamilyZones, false);
  assert.equal(scope.runVoiceWorker, false);
});

test("dynamically-read docs trigger their exact consumer tests instead of skipping", () => {
  const facts = classifyScope({ eventName: "pull_request", changedFiles: ["docs/facts.md"] });
  assert.equal(facts.mode, "affected");
  assert.equal(facts.runPrUnit, true);
  assert.equal(facts.runChangedUnit, false);
  assert.deepEqual(facts.extraTests, ["src/lib/facts.test.ts"]);
  assert.equal(facts.runLintAndTypes, false);

  const gate = classifyScope({ eventName: "pull_request", changedFiles: ["docs/maya-gate.md"] });
  assert.equal(gate.mode, "affected");
  assert.equal(gate.runMayaBehaviour, true);
  assert.equal(gate.runPrUnit, false);

  const agents = classifyScope({ eventName: "pull_request", changedFiles: ["AGENTS.md"] });
  assert.equal(agents.mode, "affected");
  assert.deepEqual(agents.extraTests, ["src/lib/maya-practice/practice.test.ts"]);

  const research = classifyScope({ eventName: "pull_request", changedFiles: [".design/research/foo.csv"] });
  assert.equal(research.mode, "affected");
  assert.deepEqual(research.extraTests, ["src/lib/assessment/bank-coverage.test.ts", "src/lib/assessment/skill-map.test.ts"]);
});

test("scoped feature PR runs affected unit + lint-and-types without unrelated suites", () => {
  const scope = classifyScope({
    eventName: "pull_request",
    changedFiles: ["src/components/referral-card.tsx", "src/components/referral-card.test.ts"],
  });
  assert.equal(scope.mode, "affected");
  assert.equal(scope.runPrUnit, true);
  assert.equal(scope.runChangedUnit, true);
  assert.equal(scope.runLintAndTypes, true);
  assert.equal(scope.runMayaBehaviour, false);
  assert.equal(scope.runFamilyZones, false);
  assert.equal(scope.runVoiceWorker, false);
  assert.equal(scope.needsFullHistory, false);
});

test("worker-only PR runs voice-worker without unit or lint-and-types", () => {
  const scope = classifyScope({
    eventName: "pull_request",
    changedFiles: ["worker/maya-voice/src/call.ts", "worker/maya-voice/src/call.test.ts"],
  });
  assert.equal(scope.mode, "affected");
  assert.equal(scope.runPrUnit, false);
  assert.equal(scope.runLintAndTypes, false);
  assert.equal(scope.runVoiceWorker, true);
  assert.equal(scope.runMayaBehaviour, false);
});

test("scoped Maya and family-time PRs enable their targeted suites", () => {
  const maya = classifyScope({ eventName: "pull_request", changedFiles: ["src/lib/maya/claim.ts"] });
  assert.equal(maya.mode, "affected");
  assert.equal(maya.runMayaBehaviour, true);
  assert.equal(maya.runVoiceWorker, true);
  assert.equal(maya.runFamilyZones, false);

  const tz = classifyScope({ eventName: "pull_request", changedFiles: ["src/lib/family-time.ts"] });
  assert.equal(tz.mode, "affected");
  assert.equal(tz.runFamilyZones, true);
  assert.equal(tz.runMayaBehaviour, false);

  const plan = classifyScope({ eventName: "pull_request", changedFiles: ["src/lib/workbook-plan.ts"] });
  assert.equal(plan.mode, "affected");
  assert.equal(plan.needsFullHistory, true);
});

test("high-blast-radius, unknown, empty, and large PRs fall back to full suite", () => {
  for (const file of [
    "package.json",
    "package-lock.json",
    "vitest.config.mts",
    "tsconfig.json",
    "eslint.config.mjs",
    ".oxlintrc.json",
    ".github/workflows/ci.yml",
    ".githooks/pre-push",
    "data/curriculum/step-progressions-k9.json",
    "scripts/ci-audit.mjs",
    "supabase/migrations/20261120_test.sql",
    "public/robots.txt",
    "src/lib/database.ts",
    "src/lib/maya/session.ts",
    "src/lib/print-engine-chromium.ts",
    "unknown-root-config.toml",
  ]) {
    const scope = classifyScope({ eventName: "pull_request", changedFiles: [file] });
    assert.equal(scope.mode, "full", `expected ${file} to trigger full mode`);
  }

  assert.equal(classifyScope({ eventName: "pull_request", changedFiles: [] }).mode, "full");

  const many = Array.from({ length: MAX_AFFECTED_FILES + 1 }, (_, i) => `src/components/c${i}.tsx`);
  assert.equal(classifyScope({ eventName: "pull_request", changedFiles: many }).mode, "full");
});
