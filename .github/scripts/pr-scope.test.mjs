import assert from "node:assert/strict";
import test from "node:test";
import { classifyScope, DYNAMIC_READ_RULES, MAX_AFFECTED_FILES } from "./pr-scope.mjs";

test("push to main and workflow_dispatch always run full suite including engine", () => {
  for (const eventName of ["push", "workflow_dispatch"]) {
    const scope = classifyScope({ eventName, changedFiles: ["docs/ci/README.md"] });
    assert.equal(scope.mode, "full");
    assert.equal(scope.runEngine, true);
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
      "docs/workbook-v2.md",
      "docs/workbook-v2-engine.md",
      ".design/mockups/dashboard.html",
      "DESIGN.md",
      ".agents/skills/tdd/SKILL.md",
      ".claude/skills/tdd",
      "skills-lock.json",
    ],
  });
  assert.equal(scope.mode, "skip");
  assert.equal(scope.runEngine, false);
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
  assert.equal(agents.runLintAndTypes, true);

  const featureMap = classifyScope({ eventName: "pull_request", changedFiles: ["docs/feature-map.md"] });
  assert.equal(featureMap.mode, "affected");
  assert.equal(featureMap.runLintAndTypes, true);
  assert.equal(featureMap.runPrUnit, false);

  const research = classifyScope({ eventName: "pull_request", changedFiles: [".design/research/foo.csv"] });
  assert.equal(research.mode, "affected");
  assert.deepEqual(research.extraTests, ["src/lib/assessment/bank-coverage.test.ts", "src/lib/assessment/skill-map.test.ts"]);
});

test("scoped feature PR runs affected unit + lint-and-types without engine or unrelated suites", () => {
  const scope = classifyScope({
    eventName: "pull_request",
    changedFiles: ["src/components/referral-card.tsx", "src/components/referral-card.test.ts"],
  });
  assert.equal(scope.mode, "affected");
  assert.equal(scope.runEngine, false);
  assert.equal(scope.runPrUnit, true);
  assert.equal(scope.runChangedUnit, true);
  assert.equal(scope.runLintAndTypes, true);
  assert.equal(scope.runMayaBehaviour, false);
  assert.equal(scope.runFamilyZones, false);
  assert.equal(scope.runVoiceWorker, false);
  assert.equal(scope.needsFullHistory, false);
});

test("worker-only PR runs voice-worker without engine, unit, or lint-and-types", () => {
  const scope = classifyScope({
    eventName: "pull_request",
    changedFiles: ["worker/maya-voice/src/call.ts", "worker/maya-voice/src/call.test.ts"],
  });
  assert.equal(scope.mode, "affected");
  assert.equal(scope.runEngine, false);
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

test("high-blast-radius, unknown, empty, and large PRs fall back to full suite including engine", () => {
  for (const file of [
    "package.json",
    "package-lock.json",
    "vitest.config.mts",
    "tsconfig.json",
    "tsconfig.engine.json",
    "eslint.config.mjs",
    ".oxlintrc.json",
    ".github/workflows/ci.yml",
    ".githooks/pre-push",
    "data/curriculum/step-progressions-k9.json",
    "scripts/ci-audit.mjs",
    "scripts/workbook-v2.ts",
    "supabase/migrations/20261120_test.sql",
    "public/robots.txt",
    "src/lib/database.ts",
    "src/lib/maya/session.ts",
    "src/lib/print-engine-chromium.ts",
    "src/lib/assessment/adaptive.ts",
    "src/lib/assessment/grades.ts",
    "unknown-root-config.toml",
  ]) {
    const scope = classifyScope({ eventName: "pull_request", changedFiles: [file] });
    assert.equal(scope.mode, "full", `expected ${file} to trigger full mode`);
    assert.equal(scope.runEngine, true, `expected ${file} to run engine in full mode`);
  }

  const empty = classifyScope({ eventName: "pull_request", changedFiles: [] });
  assert.equal(empty.mode, "full");
  assert.equal(empty.runEngine, true);

  const many = Array.from({ length: MAX_AFFECTED_FILES + 1 }, (_, i) => `src/components/c${i}.tsx`);
  const large = classifyScope({ eventName: "pull_request", changedFiles: many });
  assert.equal(large.mode, "full");
  assert.equal(large.runEngine, true);
});

test("bulk skill-only updates over MAX_AFFECTED_FILES still skip CI", () => {
  const manySkills = Array.from({ length: MAX_AFFECTED_FILES + 20 }, (_, i) => `.agents/skills/s${i}/SKILL.md`);
  const scope = classifyScope({
    eventName: "pull_request",
    changedFiles: [...manySkills, "skills-lock.json"],
  });
  assert.equal(scope.mode, "skip");
  assert.equal(scope.runEngine, false);
  assert.equal(scope.runPrUnit, false);
  assert.equal(scope.runLintAndTypes, false);
});

test("an engine-only PR runs the engine job and no full suite, Maya, zones or voice job", () => {
  for (const changedFiles of [
    ["src/lib/workbook-v2/build/build-book.ts"],
    ["src/lib/workbook-v2/build/build-book.ts", "docs/workbook-v2-engine.md"],
    ["src/lib/workbook-v2/render/page.typ"],
    ["src/lib/workbook-v2/render/fonts/Geist-Regular.ttf"],
    ["src/lib/workbook-v2/fixtures/snapshot.json", "docs/workbook-v2.md"],
  ]) {
    const scope = classifyScope({ eventName: "pull_request", changedFiles });
    assert.equal(scope.mode, "affected", JSON.stringify(changedFiles));
    assert.equal(scope.runEngine, true, JSON.stringify(changedFiles));
    assert.equal(scope.runChangedUnit, true, JSON.stringify(changedFiles));
    assert.deepEqual(scope.extraTests, [], JSON.stringify(changedFiles));
    assert.equal(scope.runMayaBehaviour, false, JSON.stringify(changedFiles));
    assert.equal(scope.runFamilyZones, false, JSON.stringify(changedFiles));
    assert.equal(scope.runVoiceWorker, false, JSON.stringify(changedFiles));
    assert.equal(scope.needsFullHistory, false, JSON.stringify(changedFiles));
  }

  // Engine docs alone stay skip.
  const docsOnly = classifyScope({
    eventName: "pull_request",
    changedFiles: ["docs/workbook-v2-engine.md", "docs/workbook-v2.md"],
  });
  assert.equal(docsOnly.mode, "skip");
  assert.equal(docsOnly.runEngine, false);
  assert.equal(docsOnly.runPrUnit, false);
  assert.equal(docsOnly.runLintAndTypes, false);

  // Lint-and-types still runs when an engine TS file changes.
  const tsChange = classifyScope({
    eventName: "pull_request",
    changedFiles: ["src/lib/workbook-v2/build/build-book.ts"],
  });
  assert.equal(tsChange.runLintAndTypes, true);
});

test("an app PR with engine files runs both affected unit tests and engine job", () => {
  const mixed = classifyScope({
    eventName: "pull_request",
    changedFiles: ["src/components/referral-card.tsx", "src/lib/workbook-v2/build/build-book.ts"],
  });
  assert.equal(mixed.mode, "affected");
  assert.equal(mixed.runEngine, true);
  assert.equal(mixed.runPrUnit, true);
  assert.equal(mixed.runChangedUnit, true);
  assert.equal(mixed.runLintAndTypes, true);
  assert.equal(mixed.runMayaBehaviour, false);
  assert.equal(mixed.runFamilyZones, false);
  assert.equal(mixed.runVoiceWorker, false);

  // App file plus engine doc only does not need the engine job.
  const appPlusEngineDoc = classifyScope({
    eventName: "pull_request",
    changedFiles: ["src/components/referral-card.tsx", "docs/workbook-v2-engine.md"],
  });
  assert.equal(appPlusEngineDoc.mode, "affected");
  assert.equal(appPlusEngineDoc.runEngine, false);
  assert.equal(appPlusEngineDoc.runPrUnit, true);
});

test("workbook-v2 has no DYNAMIC_READ_RULES entry now that engine owns its tests", () => {
  const hits = DYNAMIC_READ_RULES.filter((rule) =>
    rule.match("src/lib/workbook-v2/render/page.typ") || rule.match("src/lib/workbook-v2/build/build-book.ts"));
  assert.deepEqual(hits, []);
});
