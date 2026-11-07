# Independent F1/F2 recheck for the #472 pure core

HANDOFF_DONE

SPEC: PASS for the F1/F2 repair in this bounded pure core.
STANDARDS: PASS for the reviewed repair. No separate confirmed finding.
VERDICT: PASS

F1 and F2 are resolved at the frozen candidate. This report gives no feature, customer, recognition, or release acceptance.

## Exact source and limits

- Machine: `Savars-MacBook-Pro-5.local`, verified with `hostname`.
- Runtime model: `gpt-6.1-sol`, high reasoning effort. The task identifies the account as Unify Codex. No account or credential file was read.
- Assigned path: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-5cfc230e`.
- Physical path: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-5cfc230e`, verified with `pwd`.
- Branch: `site/workbook-progress-core-472-5cfc230e`, verified with `git branch --show-current`.
- Frozen candidate: `14cd5144cf2f6834193d1b71133a8fe8eaa10980`.
- Prior rejected source: `3fde980decda9de24b3daee2d14ee5b3f6a63d09`.
- Feature base, actual merged PR #697: `89963c956d5eee2b87d18c58e9c35181b9aeef7f`.
- Initial status: clean. No source or index write was made.
- No agents were started. The task reports the PC unreachable. This reviewer did not repeat that check.
- Email #684 retains its reserved main position. This review requested no heavy queue or generator position.

The repair diff changes only the two new TypeScript files, the handoff, and the prior failure report. The prior report remains a failure report. Its historical verdict applies to its prior pin.

Read sources: the actual assigned `AGENTS.md`, `docs/agents/delegate-brief.md`, both new TypeScript files, the written independent findings, the current handoff including its final repair appendix, workbook context sections 4.5 and 4.6, `scan-observation.ts`, and `supabase/migrations/20261106_scan_mark_changes.sql`. The specification came from the saved full issue at `/Users/savargupta/unica-workbook-samples/overnight-20261107/issue-472.json`. The root runners and the final prior/fixed/scoped logs were inspected before use.

The explicit single-reviewer and bounded-check instructions control this review. No full suite or application build was run.

## Falsifiers

Before checks, the review identified these failure conditions: invented or reduced prior mastery; malformed prior mastery accepted; new mastery across a gap; a canonical parent right/wrong/blank judgment left pending or refused; removal of first reading, provenance, or help constraints; a second try changing original accuracy; and threshold, repeat, or scope regression.

The independent probes used complete and incomplete samples, all selected steps 1 through 3, all valid prior counts 0 through 3, missing samples, malformed prior inputs, code-pending and parent-pending originals, all three parent results, all three help states, and passing-original and later-try controls.

## SPEC

### F1: RESOLVED

The input now requires `priorMastery.passedSteps` and `priorMastery.evidenceReference` at `src/lib/workbook-progress.ts:33`. Validation at lines 202 through 204 accepts only a safe integer from zero through the pinned skill step count and a nonempty reference. Missing input returns the bounded `invalid-contract` refusal.

The output at lines 374 through 375 preserves this explicit count on incomplete and non-mastered samples. A complete sample at or above 90 percent extends the count only when the selected step is contiguous with the proven prefix. Line 345 returns `mastery-gap` when an unproved earlier step separates them. A higher supplied prefix remains higher.

Independent evidence:

- 264 cases covered 3 selected steps, 4 valid prior counts, 11 right-answer counts out of 10, and complete/incomplete samples. All assertions passed. Six complete mastery cases returned `mastery-gap`. All 132 incomplete cases retained the supplied count and selected step without a repeat increment.
- 24 null/empty-sample cases retained the supplied count and deferred history.
- 20 malformed prior inputs returned `invalid-contract`.
- The direct negative control returned `passed: {"synthetic-skill":1}` on the prior source for selected step 2 with no sample and explicit prior zero. The fixed source returned zero for the same input.

The evidence reference is a trusted adapter input. Its string does not authenticate persisted proof. The handoff now requires the adapter to validate the prefix against persisted evidence at the cutoff. This is an explicit trust boundary, not an inferred mastery claim.

### F2: RESOLVED

At `src/lib/workbook-progress.ts:149`, `parent-checked` is terminal even when the saved AI reading remains uncertain. At line 321, completeness uses the effective original. It no longer requires the immutable first pending reading to become resolved.

The actual canonical parent change at `supabase/migrations/20261106_scan_mark_changes.sql:70` retains reading, regions, certainty, photo reference, help, and trusted eligibility. It changes judgment, actor, method, state, and result version. The independent probes made that same change. Both public `observationProblem` and `markingEvent` accepted each resulting observation.

Independent evidence:

- 36 cases covered code-pending and parent-pending originals, right/wrong/blank judgments, none/math-help/unknown original help, and complete/incomplete samples. All parent judgments resolved the item. The 18 complete samples completed. The 18 samples with another required item missing remained incomplete.
- Each case preserved the entire first reading and its provenance. The effective observation retained the uncertain reading and its new parent result version. The input remained unchanged.
- Two extra controls changed the later parent record's help to `none`. Original `math-help` and `unknown` still prevented independent success.
- Nine second-try cases preserved original accuracy. Six already-passing original controls retained 100 percent despite later wrong/blank tries.
- Three version controls proved that a successful try on version 2 did not clear a later wrong version 3. Three pending-original controls stayed incomplete despite a successful second try.
- The direct negative control returned `invalid-evidence` on the prior source for a canonical uncertain parent-right judgment. The fixed source completed it with 100 percent independent original accuracy when first help was `none`.

A parent judgment corrects the original adjudication. A child's later successful try removes a miss without increasing original accuracy. The repaired core keeps these operations separate.

## STANDARDS

No separate supported standards defect was found in this repair.

All core imports remain type-only. The module has no store, network, environment, clock, random value, image, or logging access. Tests call the exported public core. The canonical controls call the exported observation functions. The independent probe reused only the synthetic fixture builder from the test file; it did not execute candidate test assertions. Its assertions were written separately.

The repair does not change the planner, generator, curriculum, question packages, printed pages, migrations, configuration, or instructions. It adds no review-schedule calculator. It retains the versioned action/target contract needed by the future adapter. Returning `passed` alone still cannot implement regression or a changed approach.

| Subsystem | What the checks prove | What they pass through or do not prove |
|---|---|---|
| Prior mastery | Explicit bounds, no inferred prefix, preservation, and gap refusal over the tested combinations. | Authentication and completeness of persisted prior proof. |
| Parent original judgment | Canonical uncertain parent judgments resolve; first reading and provenance remain; first help limits success. | Hosted parent authorization and database writes. |
| Later tries and misses | A fix can clear the current miss without changing original accuracy; a stale fix cannot clear a newer wrong mark. | Actual correction persistence and device concurrency. |
| Thresholds | Every complete distribution from 0/100 through 100/100 matched the expected action and miss count. | Recognition accuracy and the source sample's completeness. |
| Repeats and causes | Focused tests cover repeat counts 0/1/2, known/unknown causes, conceptual regression, and the changed-approach request. Independent duplicate controls preserve 100 originals. | Completeness of issued history, truth of established causes, and actual issuance. |
| Scope and exclusions | Focused tests refuse foreign identity/day/version/cutoff records and exclude Try first/unscored/ineligible parent checks. | The later reader's pagination, ownership checks, and snapshot selection. |
| Retained readings | Focused tests retain saved wrong text and provenance after the supplied cutoff moves past image age. | Hosted image expiry, retention, and family deletion. |
| Lint and compiler | Two root TypeScript files pass scoped lint and scoped type checking. | Full lint, application build, runtime integration, and browser behavior. |

## Fresh checks and negative controls

All commands ran from the assigned checkout. Installed tools were absent there. The specified borrowed tool files were verified before use. Borrowing was limited to installed packages under `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-e10c57ae/node_modules`. No peer source or peer project configuration was used. No install or symlink was made.

Node reported `v22.23.1`. Vitest reported `4.1.11`.

The inspected focused runner fixes the source root and exact test include. It uses `maxWorkers:1`, `run:true`, `watch:false`, `cache:false`, `configFile:false`, `envDir:false`, and assigned-source aliases. Its prior-source plugin loads only the exact prior core through `git show` in memory. It does not replace a tracked file. It closes the Vitest context in `finally`.

The inspected scoped runner checks exactly the two new TypeScript files. It uses installed Next ESLint rule packages without peer project configuration. Its compiler reads the assigned TypeScript options, disables emit/incremental/plugins, and resolves assigned source before borrowed type/tool packages.

```sh
node /Users/savargupta/unica-workbook-samples/overnight-20261107/run-472-focused.mjs /tmp/472-r2-independent-fixed.json
node /Users/savargupta/unica-workbook-samples/overnight-20261107/run-472-focused.mjs /tmp/472-r2-independent-prior.json 3fde980decda9de24b3daee2d14ee5b3f6a63d09
node /Users/savargupta/unica-workbook-samples/overnight-20261107/run-472-scoped.mjs
git diff --check 89963c956d5eee2b87d18c58e9c35181b9aeef7f...HEAD
```

| Check | Exact selection and result | Exit |
|---|---|---|
| Fixed focused tests | 1 file, 94 passed, zero failed | 0 |
| Same final tests on prior core | 1 file, 80 passed, 14 failed | 1 |
| Scoped ESLint | 2 files, zero errors, zero warnings | 0 |
| Scoped TypeScript | 2 root files and their imports, zero diagnostics | 0 |
| Independent in-memory probes | 471 cases, all assertions passed; two separate prior-source negative controls reproduced F1/F2 | 0 |
| Diff whitespace | Feature base through frozen HEAD | 0 |

The 14 prior failures comprise 9 explicit-prior cases and 5 canonical-parent cases. The original 80 cases still passed on the prior source. This is repair evidence from the final 94-test selection. The earlier 91-test, 11-failure result is historical only.

The React package auto-detection notice is a tool notice from the checkout without installed React. It is not a source lint warning.

Root's saved final logs agree with these fresh results: `472-r2-final-prior-tests.*`, `472-r2-fixed-tests.*`, and `472-r2-scoped.*` under the private overnight directory. The fresh JSON task arrays were filtered again before this report. Each had exactly 94 tests in one file. Their recomputed counts matched their stored count fields.

Independent probe counts came from the executed case array:

| Group | Cases |
|---|---:|
| Complete/incomplete prefix matrix | 264 |
| Null/empty sample | 24 |
| Malformed prior contract | 20 |
| Complete 0/100 through 100/100 thresholds | 101 |
| Canonical parent resolution | 36 |
| First help cannot be erased | 2 |
| Second-try original-score controls | 9 |
| Already-passing original controls | 6 |
| Version-bound fix controls | 3 |
| Pending original with successful try | 3 |
| Repeat/duplicate controls | 3 |
| Total | 471 |

The 101 threshold cases returned 75 retain-review, 15 repeat-new-numbers, and 11 advance decisions. This is a full distribution over the synthetic inputs, not a recognition benchmark.

The exact independent probe command follows. It writes no script, bundle, or product file.

```sh
node --input-type=module <<'JS'
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import ts from '/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-e10c57ae/node_modules/typescript/lib/typescript.js';
import {buildSync} from '/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-e10c57ae/node_modules/esbuild/lib/main.js';
const root=process.cwd();
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const load=s=>{const exports={};new Function('exports',compile(s))(exports);return exports.deriveWorkbookProgress;};
const runCore=load(fs.readFileSync('src/lib/workbook-progress.ts','utf8'));
const prior=load(execFileSync('git',['show','3fde980decda9de24b3daee2d14ee5b3f6a63d09:src/lib/workbook-progress.ts'],{encoding:'utf8'}));
const source=fs.readFileSync('src/lib/workbook-progress.test.ts','utf8');
const fixture=new Function(compile(source.slice(source.indexOf('function fixture('),source.indexOf('type Fixture =')))+';return fixture')();
const code=buildSync({stdin:{contents:'export {observationProblem,markingEvent} from "./src/lib/scan-observation";',resolveDir:root,loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',target:'node22',tsconfigRaw:{compilerOptions:{}},alias:{'@':root+'/src'},logLevel:'silent'}).outputFiles[0].text;
const mod={exports:{}},req=createRequire(import.meta.url);
new Function('exports','module','require',code)(mod.exports,mod,id=>{assert(id.startsWith('node:'));return req(id);});
const canonical=mod.exports;
const rows=[];
const raw=f=>runCore(f.snapshot,f.curriculum,f.history);
const d=f=>{const r=raw(f);assert.equal(r.ok,true,JSON.stringify(r));return r.decision;};
function record(group,value){rows.push({group,value});}
for(let step=1;step<=3;step++)for(let prefix=0;prefix<=3;prefix++)for(let right=0;right<=10;right++)for(const complete of [true,false]){
 const f=fixture(right,10,step);f.snapshot.priorMastery.passedSteps=prefix;
 if(!complete){f.history.originals=f.originals.slice(0,9);f.sample[9].resultVersion=null;}
 const r=raw(f);
 if(complete&&right>=9&&step>prefix+1){assert.deepEqual(r,{ok:false,reason:'mastery-gap'});record('prefix-matrix','mastery-gap');continue;}
 assert(r.ok);const x=r.decision;
 assert.equal(x.passed['synthetic-skill'],complete&&right>=9?Math.max(prefix,step):prefix);
 assert.equal(x.status,complete?'complete':'insufficient-evidence');
 assert.equal(x.action,!complete?'retain-unfinished':right>=9?(step===3?'skill-complete':'advance'):right>=8?'repeat-new-numbers':'retain-review');
 assert.equal(x.target.step,complete&&right>=9?Math.min(3,step+1):step);
 if(!complete){assert.equal(x.repeatIncrement,0);assert.equal(x.score.percent,null);}
 record('prefix-matrix',x.action);
}
for(let step=1;step<=3;step++)for(let prefix=0;prefix<=3;prefix++)for(const sample of [null,[]]){
 const f=fixture(1,2,step);f.snapshot.priorMastery.passedSteps=prefix;f.snapshot.requiredSample=sample;
 const x=d(f);assert.equal(x.action,'retain-unfinished');assert.equal(x.passed['synthetic-skill'],prefix);
 assert.deepEqual(x.deferredOriginals,f.originals);assert.deepEqual(x.consumed,[]);
 record('absent-sample','retained');
}
for(const value of [-1,4,1.25,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'1',null,undefined,true,{},[]]){
 const f=fixture();f.snapshot.priorMastery.passedSteps=value;assert.deepEqual(raw(f),{ok:false,reason:'invalid-contract'});record('malformed-prior','refused');
}
for(const value of ['', ' ',null,undefined,4,{}]){
 const f=fixture();f.snapshot.priorMastery.evidenceReference=value;assert.deepEqual(raw(f),{ok:false,reason:'invalid-contract'});record('malformed-prior','refused');
}
for(const value of [null,undefined]){
 const f=fixture();f.snapshot.priorMastery=value;assert.deepEqual(raw(f),{ok:false,reason:'invalid-contract'});record('malformed-prior','refused');
}
const threshold={};
for(let right=0;right<=100;right++){
 const x=d(fixture(right));const expected=right>=90?'advance':right>=75?'repeat-new-numbers':'retain-review';
 assert.equal(x.action,expected);assert.equal(x.score.percent,right);assert.equal(x.misses.length,100-right);
 threshold[expected]=(threshold[expected]??0)+1;record('thresholds',expected);
}
function parentPending(method,result,help,total=1){
 const f=fixture(0,total),r=f.originals[0],o=r.first.observation;
 f.sample[0].expected.method=method;
 Object.assign(o,{state:method==='parent'?'parent-pending':'pending',method,result:null,certainty:'uncertain',readAnswerText:'5?',help,issue:'blurry',regions:[{regionId:'answer',text:'5?',value:null,certainty:'uncertain',issue:'blurry'}]});
 const change=structuredClone(r.first);change.at=200;change.provenance={eventId:'parent-resolution',model:null,prompt:null};
 Object.assign(change.observation,{state:'parent-checked',method:'parent',actor:'parent',result,resultVersion:2});
 r.changes=[change];f.sample[0].resultVersion=2;return f;
}
for(const method of ['code','parent'])for(const result of ['right','wrong','blank'])for(const help of ['none','math-help','unknown'])for(const complete of [true,false]){
 const f=parentPending(method,result,help,complete?1:2),before=structuredClone(f);
 if(!complete){f.history.originals=[f.originals[0]];f.sample[1].resultVersion=null;}
 const o=f.originals[0].changes[0].observation;
 assert.equal(canonical.observationProblem(o),null);assert.equal(canonical.markingEvent(f.sample[0].expected,o).publish,true);
 assert.equal(canonical.markingEvent(f.sample[0].expected,o).result,result);
 const x=d(f),i=x.items.find(x=>x.identity.itemId==='item-0'),independent=result==='right'&&help==='none';
 assert.equal(i.status,'resolved');assert.deepEqual(i.first,before.originals[0].first);assert.deepEqual(i.effective,before.originals[0].changes[0]);
 assert.equal(x.status,complete?'complete':'insufficient-evidence');assert.equal(x.score.independentFirstRight,independent?1:0);
 assert.equal(x.score.percent,complete?(independent?100:0):null);assert.equal(x.misses.length,independent?0:1);
 assert.equal(i.unresolved,!independent);
 assert.deepEqual(f.originals[0],before.originals[0]);
 record('parent-resolution',complete?'complete':'incomplete');
}
for(const help of ['math-help','unknown']){
 const f=parentPending('code','right',help);f.originals[0].changes[0].observation.help='none';
 const x=d(f);assert.equal(x.score.percent,0);assert.equal(x.misses[0].result,'right_with_help');
 record('first-help-guard','preserved');
}
for(const help of ['none','math-help','unknown'])for(const result of ['right','wrong','blank']){
 const f=fixture(0,1);f.originals[0].secondTries=[{id:'try',at:300,basedOnResultVersion:1,result,help}];
 const x=d(f);assert.equal(x.score.percent,0);assert.equal(x.misses.length,result==='right'?0:1);
 record('second-try','original-score-unchanged');
}
for(const help of ['none','math-help','unknown'])for(const result of ['wrong','blank']){
 const f=fixture(1,1);f.originals[0].secondTries=[{id:'try',at:300,basedOnResultVersion:1,result,help}];
 assert.equal(d(f).score.percent,100);assert.equal(d(f).misses.length,0);record('passing-original','preserved');
}
for(const help of ['none','math-help','unknown']){
 const f=parentPending('code','wrong',help);
 f.originals[0].secondTries=[{id:'try',at:300,basedOnResultVersion:2,result:'right',help}];
 assert.equal(d(f).misses.length,0);assert.equal(d(f).score.percent,0);
 const change=structuredClone(f.originals[0].changes[0]);change.at=400;change.provenance.eventId='parent-later';
 change.observation.resultVersion=3;f.originals[0].changes.push(change);f.sample[0].resultVersion=3;
 assert.equal(d(f).misses.length,1);assert.equal(d(f).score.percent,0);record('version-bound-fix','stale-fix-retained-as-evidence');
 const pending=parentPending('code','wrong',help);pending.originals[0].changes=[];pending.sample[0].resultVersion=1;
 pending.originals[0].secondTries=[{id:'try',at:300,basedOnResultVersion:1,result:'right',help}];
 assert.equal(d(pending).status,'insufficient-evidence');record('pending-with-fix','still-pending');
}
for(let count=0;count<=2;count++){
 const f=fixture(80);
 f.history.issuedDecisions=Array.from({length:count},(_,n)=>({version:1,id:'issued-'+n,workbookId:'issued-book-'+n,parentId:'parent',childId:'child',issuedAt:n+1,curriculum:f.snapshot.curriculum,selection:{unit:'S.1',skill:'synthetic-skill',step:2},action:'repeat'}));
 f.history.originals=f.originals.flatMap(x=>[x,structuredClone(x)]);
 const x=d(f);assert.equal(x.score.required,100);assert.equal(x.misses.length,20);assert.equal(x.priorRepeats,count);
 assert.equal(x.action,count===2?'change-approach':'repeat-new-numbers');assert.equal(x.parentFollowUp,count===2);
 record('repeat-duplicate',x.action);
}
const gap=fixture(1,1);gap.snapshot.priorMastery.passedSteps=0;
assert.deepEqual(raw(gap),{ok:false,reason:'mastery-gap'});
const absent=fixture(0,0);absent.snapshot.priorMastery.passedSteps=0;
const oldF1=prior(absent.snapshot,absent.curriculum,absent.history);
assert.equal(oldF1.decision.passed['synthetic-skill'],1);assert.equal(d(absent).passed['synthetic-skill'],0);
const pending=parentPending('code','right','none'),oldF2=prior(pending.snapshot,pending.curriculum,pending.history);
assert.deepEqual(oldF2,{ok:false,reason:'invalid-evidence'});assert.equal(d(pending).score.percent,100);
const groups={};for(const row of rows){groups[row.group]??={count:0,values:{}};groups[row.group].count++;groups[row.group].values[row.value]=(groups[row.group].values[row.value]??0)+1;}
console.log('INDEPENDENT_PROBES',JSON.stringify({count:rows.length,groups,threshold,negativeControls:{F1:{prior:oldF1.decision.passed,fixed:d(absent).passed},F2:{prior:oldF2,fixed:d(pending).action}}}));
JS
```

## Source uncertainty and proof limits

The candidate pin and tested source are verified. The saved issue, handoff, and canonical migration are local source evidence. No live GitHub or hosted state was queried in this recheck. The handoff's original 80-test paragraph describes the earlier implementation; its final repair appendix and the fresh filtered results establish 94 tests for this candidate.

The adapter remains responsible for ownership, approval, authenticated prior proof, full required sample, frozen curriculum/context, complete issued history, scoped versions, and established causes. A false trusted input can produce a false decision. This review does not treat a reference string as proof of its contents.

Declared absent planner/preview/UI/pagination/storage integration remains root work. No unsafe F1/F2 output contract remains in the tested cases. The later adapter must handle `mastery-gap` as a refusal. It must consume the versioned action and target as well as `passed`. It must retain deferred originals and unfinished items. This report does not approve the later integration.

No full suite, build, Chromium, browser, server, hosted/service/provider/model call, migration, Auth fixture, email, charge, customer write, deletion, commit, push, PR comment, or watch ran. No credential or environment file was read. No queue position was taken.

## Source preservation and cleanup

The source files matched their frozen Git blobs after the checks:

| File | SHA-256 |
|---|---|
| `src/lib/workbook-progress.ts` | `7757279f2613ace1592b96e6520f221c50575305e80a2f812bc7fd7f6ca234bf` |
| `src/lib/workbook-progress.test.ts` | `eb89ba5976c9576a5909d52572ed0be3f8628a5d80cabc257d77b8e0058c8dae` |
| `.design/research/workbook-progress-core-472-handoff.md` | `75641c7e6eae15c82058fcc81d5366e4ac7b5c7911211a50a35199d5916538b3` |
| Git index | `d48fa7aa1ae90518f5e2bf0434176ad0fa7cdc0a95d8a6df888a165a2e127e3d` |

Inspected runner SHA-256 values:

- Focused: `7ec0fcf0197983840ddc6a5131d0f36946a7c17494b70505810253b08f3f4803`.
- Scoped: `46fb48b5f393d18bdeccb18c1387b874c25d3e786d30b5b06efac251b8ccbe03`.

All owned check processes exited. The independent probe ran from stdin and left no temporary probe file. Fresh temporary count files were removed after their final count check. Final Git checks confirm unchanged tracked source/index and HEAD. The only added checkout file is this report.

VERDICT: PASS

