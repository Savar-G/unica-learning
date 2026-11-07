# Independent review of the bounded #472 pure core

HANDOFF_DONE

SPEC: FAIL. Two confirmed P2 findings.
STANDARDS: PASS. No separate confirmed standards finding.

This report applies only to the pure core. It grants no completion or release approval.

## Pins and review boundary

- Machine: `Savars-MacBook-Pro-5.local`, verified with `hostname`.
- Model: Unify Codex `gpt-6.1-sol`, high reasoning effort.
- Assigned path: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-5cfc230e`.
- Physical path: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-5cfc230e`, verified with `pwd -P`.
- Branch: `site/workbook-progress-core-472-5cfc230e`, verified with `git branch --show-current`.
- Frozen HEAD: `3fde980decda9de24b3daee2d14ee5b3f6a63d09`.
- Base, actual merged PR #697: `89963c956d5eee2b87d18c58e9c35181b9aeef7f`.
- Initial status: clean. The three-dot diff has exactly three added files and 895 added lines: the core, its tests, and its handoff.
- No agents were started. The PC was not retried. No default checkout was used.

Read sources: the assigned checkout's actual `AGENTS.md`, `docs/agents/delegate-brief.md`, `docs/agents/issue-tracker.md`, the implementation handoff, both new TypeScript files, workbook context 4.4/4.5/4.6, `scan-observation.ts`, `scan-marking.ts`, `scan-history.ts`, `scan-history-reader.ts`, `scan-marking-reader.ts`, the parent mark-change migration, current public planner types and progression, and the relevant planner test fixtures. The saved private #472 issue supplied the full specification. A permitted `gh issue view 472 --repo Savar-G/unica-learning --json number,title,body,comments,labels` read confirmed the ticket and returned no comments. Its console output was truncated; specification review used the saved full body.

The code-review and evidence-review procedures were applied by this single reviewer. The explicit single-reviewer instruction replaced their parallel-agent procedure. The explicit bounded checks replaced the repository's full done gate.

## Falsifiers stated before execution

Failure conditions included mastery from an incomplete sample, wrong 75%/90% decisions, duplicate or foreign evidence entering the score, cutoff/version bypass, a second try improving the original score, a parent original adjudication treated as a second try, invented earlier mastery, preview calls increasing issued repeats, a third identical repeat, missing context being ignored, guessed causes, stale corrections clearing later misses, output references mutating persisted input, and lost readings after image expiry. The two direct contract checks asked whether a resolved parent original remains pending, and whether an approved selection alone produces an unsupported passed count.

## SPEC

### F1. P2: The selected step invents earlier passed mastery

Location: `src/lib/workbook-progress.ts:368`.

Input: an approved selection of step 2 of `1.1-count-to-20`, no required sample, no original records, and no issued decisions. No input supplies mastery of step 1.

Observed output:

```json
{"status":"insufficient-evidence","action":"retain-unfinished","target":{"unit":"1.1","skill":"1.1-count-to-20","step":2},"passed":{"1.1-count-to-20":1}}
```

The public `planWorkbook` control starts steps 1, 2, and 3 on Days 1, 2, and 3 with `passed: {}`. Thus a workbook can introduce step 2 before any scan proves step 1. A second plan with the core's returned `passed` starts steps 2 and 3 and omits step 1. The same second plan with the unchanged empty passed input retains step 1. This proves a harmful consequence at the public interface.

Required policy: compute progress from evidence. Missing evidence must not create mastery. `PlanInput.passed` means steps passed at 90% or more, as defined at `src/lib/workbook-plan.ts:388`. Selection approval does not establish that fact.

The handoff explicitly states the assumption that every earlier step passed. The public input only has a selection and an `approvalReference`. Neither its type nor its validation requires a verified prior passed count. The specification requires approval of the selected skill/step, not approval of invented earlier mastery. Trusted adapter obligations for ownership, sample completeness, curriculum version, cause establishment, and complete issued history do not establish earlier mastery either.

Smallest correction: accept and preserve an explicit validated prior mastery input. Update its contiguous passed count only when the required evidence supports that update. Refuse or represent a gap if a later selected step passes without proven earlier mastery. Do not derive a mastery prefix from the selected step number.

Limit: no active planner consumes this core. The probe directly composed the existing public functions to establish the output contract defect. It does not claim a current customer plan changed.

### F2. P2: A parent cannot resolve a pending original through this contract

Locations: `src/lib/workbook-progress.ts:146`, `src/lib/workbook-progress.ts:266`, and `src/lib/workbook-progress.ts:317`. The alternative normalization also fails at `src/lib/workbook-progress.ts:261`.

Input: one eligible code-checked original has an uncertain first reading `5?`, no score, result version 1, and known help `none`. The parent explicitly adjudicates that original as right at version 2 before the cutoff. This is an original-mark action. It is not a child's second try. The sample pins effective version 2.

The canonical parent change preserves the saved reading, regions, certainty, help, and photo reference. It changes the state, method, actor, result, and result version. This matches `supabase/migrations/20261106_scan_mark_changes.sql:70`. The public `observationProblem` accepts that resulting observation. The public `markingEvent` returns `publish: true`, `result: right` for the same trusted expected item.

Observed core output: `{"ok":false,"reason":"invalid-evidence"}`. The core requires a parent change to pass `resolved`, which rejects its retained uncertain reading certainty.

Two alternate encodings do not solve the contract problem:

1. Change the parent observation's certainty to `not-read`: the core accepts the record, but reports the item `pending` and the sample `insufficient-evidence` because it still requires the first pending observation to be resolved.
2. Put the final parent adjudication in `first` and remove the changes: the core refuses `invalid-evidence` because the first method `parent` differs from the trusted expected method `code`.

Positive controls: a parent correction of an already scored wrong original advances at 100%. A system-finalized original supplied as the first normalized reading also advances at 100%. Therefore the finding does not claim all pending-to-final automatic normalization fails. It identifies the unsupported pending-to-parent-original-resolution path.

Required policy: follow canonical effective original adjudications. Preserve the first reading and its provenance without making the old pending state a permanent completion condition. A parent adjudication establishes the original result even when the AI reading remains uncertain. It must not become correction credit from a second try.

Smallest correction: represent the first saved reading separately from the effective original resolution. Accept a canonical explicit parent adjudication as terminal despite retained AI reading uncertainty. Use the effective original resolution for sample completeness. Preserve the first attempt's help constraint and keep second tries outside original accuracy.

Limit: this is synthetic, public-interface evidence plus a read of the stored parent-change contract. No hosted parent action or database write ran.

## Policy checks and STANDARDS

| Area | Fresh result | What remains outside this proof |
|---|---|---|
| Thresholds | All 101 complete distributions from 0/100 to 100/100 matched policy. 75 returned retain-review, 15 repeat-new-numbers, and 11 advance. Each miss count was `100 - right`. | Recognition accuracy and trusted sample construction. |
| Incomplete evidence and exclusions | Candidate cases cover missing sample/context, missing required items, pending evidence, blank, Try first, unscored, and ineligible parent checks. | The source adapter's completeness and eligibility authorization. F1 and F2 remain defects. |
| Original corrections and fixes | Candidate cases preserve the first reading, let parent original adjudications change effective original accuracy, and keep second tries outside that score. Version-bound fixes do not clear later wrong marks. | F2 covers the missing pending-parent path. No persistence test ran. |
| Issued repeats | Candidate cases cover zero, one, and two repeats, duplicate issue records, and the change-of-approach action. | Completeness of caller-supplied issued history and actual book issuance. |
| Scope and identity | Candidate cases refuse foreign family/book/revision/page/item/day records, conflicting duplicates, unsupported versions, and future records. | Real history pagination, snapshot admission, and hosted uniqueness. |
| Causes | Candidate cases distinguish established conceptual/careless evidence from unknown causes and request focused practice at three matching occurrences. | The trusted external establishment of a cause. |
| Output ownership | Two independent object-graph checks, with a present and absent sample, found zero shared objects between inputs and output. Both inputs remained unchanged. | Persistence and downstream consumers. |
| Retained readings | Candidate expiry case keeps `56`, typed region values, photo revision, event, model, and prompt when the cutoff moves beyond image lifetime. | Hosted retention, family deletion, and paginated readers. |
| Pure module | Runtime imports are absent. Imports are type-only. The core has no store, network, clock, random, environment, image, or logging access. | Caller authentication and saved review validation. |
| Scoped lint | Two exact files; zero errors and zero source warnings. | Full repository lint. |
| Scoped TypeScript | Two root files and their import graph; zero diagnostics. | The application build. |

No separate confirmed standards violation or actionable baseline smell was found. Tests use the exported core interface. Existing planner, curriculum, package, print, generator, template, and instruction sources were not changed. No #473 review calculator was added. Saved review inputs are copied. The two findings above concern specification and public contract correctness.

## Commands and counts

All commands ran in the assigned checkout. Installed tools were absent there. The existing tool files were verified before use at `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-e10c57ae/node_modules`. `node --version` returned `v22.23.1`; Vitest reported `4.1.11`; TypeScript reported `5.9.3`. Borrowing was limited to installed tool packages. No peer source or configuration was loaded. No install or symlink was made.

Pin commands: `hostname`, `pwd -P`, `git branch --show-current`, `git rev-parse HEAD`, `git status --porcelain=v1`, `git diff --name-status 89963c956d5eee2b87d18c58e9c35181b9aeef7f...HEAD`, `git diff --stat 89963c956d5eee2b87d18c58e9c35181b9aeef7f HEAD`, and `git log --oneline 89963c956d5eee2b87d18c58e9c35181b9aeef7f..HEAD`.

The focused test command used Node stdin and `startVitest` from the installed tool path. Options were `root: process.cwd()`, filter and include exactly `src/lib/workbook-progress.test.ts`, `run: true`, `watch: false`, `maxWorkers: 1`, `cache: false`, `testTimeout: 30000`, Vite `configFile: false`, and `envDir: false`. Aliases mapped `@` to the assigned `src` and `vitest` to the installed tool's `dist/index.js`. The context closed in `finally`. Its exact filtered task tree returned one file and 80 tests, all `pass`. No other suite ran.

```sh
node --input-type=module <<'JS'
import { startVitest } from '/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-e10c57ae/node_modules/vitest/dist/node.js';
const root = process.cwd();
const ctx = await startVitest('test', ['src/lib/workbook-progress.test.ts'], {
  root, run: true, watch: false, maxWorkers: 1, cache: false,
  testTimeout: 30000, include: ['src/lib/workbook-progress.test.ts'],
}, { root, configFile: false, envDir: false, cacheDir: root + '/.review-472-cache',
  resolve: { alias: { '@': root + '/src',
    vitest: '/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-e10c57ae/node_modules/vitest/dist/index.js' } } });
try {
  const files = ctx.state.getFiles();
  const visit = t => t.type === 'test' ? [{ name: t.name, state: t.result?.state }] : (t.tasks ?? []).flatMap(visit);
  const cases = files.flatMap(visit);
  console.log('EXACT_TEST_DISTRIBUTION', JSON.stringify({ files: files.map(f => f.filepath),
    count: cases.length, states: cases.reduce((a, x) => (a[x.state] = (a[x.state] ?? 0) + 1, a), {}) }));
  if (cases.length !== 80 || cases.some(x => x.state !== 'pass')) process.exitCode = 1;
} finally { await ctx.close(); }
JS
```

The lint command used the Node ESLint API with `overrideConfigFile: true` and the installed `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript` configurations. `lintFiles` received exactly the two new TypeScript paths. The exact result array had two files, zero errors, and zero warnings. React auto-detection printed a tool notice because this checkout has no installed React package. That notice was not a source warning.

The compiler command used `ts.readConfigFile` and `ts.parseJsonConfigFileContent` on the assigned `tsconfig.json`. `ts.createProgram` received exactly the two new root files. Options retained the repository options with `noEmit: true`, `incremental: false`, `plugins: []`, `types: ['node']`, and the borrowed dependency directory's `@types` root. Module resolution tried the assigned source first and used that dependency directory only for package resolution. `ts.getPreEmitDiagnostics` returned zero diagnostics.

`git diff --check 89963c956d5eee2b87d18c58e9c35181b9aeef7f...HEAD` passed.

The following bounded public-interface reproduction runs without a file write. It uses the candidate's synthetic fixture builder, but supplies independent assertions. It never executes the candidate test expectations. It bundles only assigned source in memory. No server or browser starts.

```sh
node --input-type=module <<'JS'
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import ts from '/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-e10c57ae/node_modules/typescript/lib/typescript.js';
import { buildSync } from '/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-e10c57ae/node_modules/esbuild/lib/main.js';
const root = process.cwd();
const compile = s => ts.transpileModule(s, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText;
const core = {};
new Function('exports', compile(fs.readFileSync('src/lib/workbook-progress.ts', 'utf8')))(core);
const tests = fs.readFileSync('src/lib/workbook-progress.test.ts', 'utf8');
const fixture = new Function(compile(tests.slice(tests.indexOf('function fixture('),
  tests.indexOf('type Fixture ='))) + ';return fixture')();
const run = f => core.deriveWorkbookProgress(f.snapshot, f.curriculum, f.history);
function bundle(contents) {
  const code = buildSync({ stdin: { contents, resolveDir: root,
    sourcefile: 'review-472-memory.ts', loader: 'ts' }, bundle: true, write: false,
    platform: 'node', format: 'cjs', target: 'node22',
    tsconfigRaw: { compilerOptions: {} }, alias: { '@': root + '/src' },
    logLevel: 'silent' }).outputFiles[0].text;
  const mod = { exports: {} }, require = createRequire(import.meta.url);
  new Function('exports', 'module', 'require', code)(mod.exports, mod, id => {
    assert(id.startsWith('node:')); return require(id);
  });
  return mod.exports;
}
const canonical = bundle('export {observationProblem,markingEvent} from "./src/lib/scan-observation";');
const planner = bundle('export {planWorkbook} from "./src/lib/workbook-plan";export {BC_SKILL_MAP} from "./src/lib/assessment/skill-map";');
const histogram = {};
for (let right = 0; right <= 100; right++) {
  const r = run(fixture(right)); assert(r.ok);
  assert.equal(r.decision.action, right >= 90 ? 'advance' : right >= 75 ? 'repeat-new-numbers' : 'retain-review');
  assert.equal(r.decision.score.required, 100);
  assert.equal(r.decision.score.independentFirstRight, right);
  assert.equal(r.decision.misses.length, 100 - right);
  histogram[r.decision.action] = (histogram[r.decision.action] ?? 0) + 1;
}
console.log('DISTRIBUTION', JSON.stringify({ cases: 101, totalPerCase: 100, histogram }));
function parentChange(f, keepCertainty = false) {
  const c = structuredClone(f.originals[0].first);
  c.at = 200; c.provenance = { eventId: 'parent-resolution', model: null, prompt: null };
  Object.assign(c.observation, { state: 'parent-checked', method: 'parent', actor: 'parent', result: 'right', resultVersion: 2 });
  if (!keepCertainty) c.observation.certainty = 'not-read';
  f.originals[0].changes = [c]; f.sample[0].resultVersion = 2;
}
const scoredControl = fixture(0, 1); parentChange(scoredControl);
assert.equal(run(scoredControl).decision.action, 'advance');
const pending = fixture(0, 1);
Object.assign(pending.originals[0].first.observation, { state: 'pending', result: null,
  certainty: 'uncertain', readAnswerText: '5?', issue: 'blurry',
  regions: [{ regionId: 'answer', text: '5?', value: null, certainty: 'uncertain' }] });
parentChange(pending, true);
const final = pending.originals[0].changes[0].observation;
assert.equal(canonical.observationProblem(final), null);
assert.equal(canonical.markingEvent(pending.sample[0].expected, final).publish, true);
assert.deepEqual(run(pending), { ok: false, reason: 'invalid-evidence' });
const clarified = structuredClone(pending);
clarified.originals[0].changes[0].observation.certainty = 'not-read';
assert.equal(run(clarified).decision.items[0].status, 'pending');
assert.equal(run(clarified).decision.action, 'retain-unfinished');
const normalized = structuredClone(clarified);
normalized.originals[0].first = normalized.originals[0].changes[0];
normalized.originals[0].changes = [];
assert.deepEqual(run(normalized), { ok: false, reason: 'invalid-evidence' });
const automatic = fixture(1, 1);
automatic.originals[0].first.observation.resultVersion = 2; automatic.sample[0].resultVersion = 2;
assert.equal(run(automatic).decision.action, 'advance');
console.log('PARENT_PENDING', JSON.stringify({ control: run(scoredControl).decision.action,
  canonicalProblem: canonical.observationProblem(final),
  canonicalEvent: canonical.markingEvent(pending.sample[0].expected, final),
  progress: run(pending), clarifiedStatus: run(clarified).decision.status,
  normalized: run(normalized), automatic: run(automatic).decision.action }));
const standard = planner.BC_SKILL_MAP.standards.find(s => s.grade === 1);
const skill = standard.skills[0].id;
const input = { profile: { standards: [] }, grade: 1, level: {
  number: 4, workbooks: 3, pagesPerDay: { min: 6, max: 6 }, dailyMinutes: { min: 20, max: 30 },
  lead: 'parent-supported', reviewShare: .2, units: [{ code: standard.code, skills: [{
    id: skill, delivery: 'practice', pages: 3, steps: [{ pages: 1 }, { pages: 1 }, { pages: 1 }],
  }] }], fluency: [],
}, passed: {}, workbook: { number: 1, inLevel: 0 }, reviews: [], missedReviews: [],
  misses: [], pausedWeeks: 0, support: null, unassessedUnits: [] };
const before = planner.planWorkbook(input); assert(before.ok, before.reason);
assert(before.plan.newSteps.some(x => x.skill === skill && x.step === 2));
const f = fixture(0, 1, 2);
f.curriculum.skill = { id: skill, unit: standard.code, curriculum: 'bc' };
f.curriculum.steps.forEach(x => x.skill = skill);
f.snapshot.selection = { unit: standard.code, skill, step: 2, approvalReference: 'approved-selection-only' };
f.snapshot.reviews = []; f.snapshot.missedReviews = [];
f.snapshot.requiredSample = null; f.history.originals = [];
const r = run(f); assert(r.ok); assert.equal(r.decision.passed[skill], 1);
const nextInput = { ...input, workbook: { number: 2, inLevel: 1 } };
const after = planner.planWorkbook({ ...nextInput, passed: r.decision.passed });
const control = planner.planWorkbook(nextInput);
assert(after.ok, after.reason); assert(control.ok, control.reason);
assert(!after.plan.newSteps.some(x => x.skill === skill && x.step === 1));
assert(control.plan.newSteps.some(x => x.skill === skill && x.step === 1));
console.log('PASSED_WITHOUT_EVIDENCE', JSON.stringify({ decision: {
  status: r.decision.status, action: r.decision.action, passed: r.decision.passed,
}, before: before.plan.newSteps, after: after.plan.newSteps, control: control.plan.newSteps }));
function objects(v, set = new Set()) {
  if (v && typeof v === 'object' && !set.has(v)) {
    set.add(v); Object.values(v).forEach(x => objects(x, set));
  } return set;
}
for (const sample of ['present', 'absent']) {
  const f = fixture(1, 2); if (sample === 'absent') f.snapshot.requiredSample = null;
  const before = JSON.stringify(f), r = run(f); assert(r.ok);
  const inputs = objects(f), aliases = [...objects(r)].filter(x => inputs.has(x));
  assert.equal(aliases.length, 0); assert.equal(JSON.stringify(f), before);
  console.log('OUTPUT_ALIAS_CONTROL', JSON.stringify({ sample, sharedObjects: aliases.length, inputUnchanged: true }));
}
JS
```

An initial in-memory planner probe failed because its evaluation wrapper did not provide `module`. This was a probe harness error. The corrected wrapper supplies `module`, `exports`, and a Node-built-in-only `require`. The corrected public planner probe passed its reproduction assertions. No product file changed. The candidate's green tests are baseline evidence, not repair proof. No repaired candidate was tested.

## Cleanup and limits

Initial SHA-256 values:

| File | SHA-256 |
|---|---|
| `src/lib/workbook-progress.ts` | `62c502ac680b00d4322340c920e37257840dd929205b0d5182e85f50d8081e9c` |
| `src/lib/workbook-progress.test.ts` | `02943a3c3932b06310a1ff80311761fa2fa59272d34dde7a404f7c91cdee7e7e` |
| `.design/research/workbook-progress-core-472-handoff.md` | `848f6336a4dc855e602e9f14f6a92abcaac7261f5cbf870eefc1674394f98fc9` |
| Git index | `c1ff5000c5744692ac270225dae7950929fa6ba8d1efc9ee2da94f45f6143e77` |

The final check retained all four hashes and the frozen HEAD. `git diff --exit-code HEAD` passed. `git status --porcelain=v1 --untracked-files=all` showed only this review file. No test cache directory exists. Both executable report commands were read from this file and executed successfully. The exact filtered test count was checked again: one file, 80 tests, 80 pass. The full 101-case distribution and both public-interface findings reproduced again. Both output ownership checks passed again. The focused test context closed. The lint and compiler processes exited with code 0. All review processes stopped. In-memory probes wrote no script, bundle, or product file.

No full suite, application build, Chromium, browser, dev server, hosted/service call, migration, Auth fixture, provider/model call, email, setting change, customer write, deletion, commit, push, PR comment, or watch ran. The only remote read was the explicitly permitted GitHub issue read. Public preview integration, actual planner consumption of the new decision, pagination, UI, persistence, and whole-#472 gates remain root work. They are not findings in this review.

VERDICT: FAIL
