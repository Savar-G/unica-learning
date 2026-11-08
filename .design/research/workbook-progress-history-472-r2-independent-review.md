# Independent recheck of the bounded #472 retained-history reader

HANDOFF_DONE

SPEC: FAIL. One confirmed P2 remains in the F2 repair.
STANDARDS: PASS for the bounded source diff. No separate standards finding.
F1: RESOLVED. F2: PARTIAL, context-version validation regressed. F3: RESOLVED.

This result applies only to this reader and public preview composition. Whole #472 remains incomplete. This report gives no feature, customer, recognition, print, hosted, or release approval.

## Pins and scope

- Machine: `Savars-MacBook-Pro-5.local`, verified with `hostname`.
- Runtime: `gpt-6.1-sol`, high reasoning effort, in the assigned Codex session. The task specifies Unify Codex. No account or credential file was read.
- Assigned checkout: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-470cdf68`.
- Physical checkout: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-470cdf68`, verified with `pwd -P`.
- Branch: `site/workbook-progress-history-472`, verified with `git branch --show-current`.
- Frozen HEAD: `6b465b419f9fb2dd716e5987938292f99b28d64a`.
- Rejected prior: `cc892638a41a97b702c2cc49047c7eae9088b9b0`.
- Feature base: `383685fb2877efd8ad1d862f5aefa95f8c83884b`.
- Initial status: clean. The task reports the PC freshly unreachable. No PC retry or agent was started.

I read the actual AGENTS.md and delegate brief, the written F1/F2/F3 report, the updated history handoff, both implementation modules, the fixture and both test files, the approved core and preview contracts, their review/handoff records, workbook context sections 3/4.5/4.6, and the full saved issue at `/Users/savargupta/unica-workbook-samples/overnight-20261107/issue-472.json`.

The explicit review limits replace the full gate, hosted checks, and delegation rules for this task. The supplied fixed/prior/scoped runners and saved final logs were inspected before use. The approved core, preview, planner, database wrapper, and generated database types are unchanged from the feature base, as checked with Git. No source was replaced on disk.

## Falsifiers

Before checks, the rejection conditions were: unavailable correction proof returns a definite plan or leaks answer text on refusal; complete-empty/fixed proof is blocked; a second try changes original accuracy; held Day 8/right changes the selected Day 7 decision; real mastery gaps or malformed held proof pass; unequal manifests or reordered arrays pass; or cutoff, pagination, scope, first-reading, version, help, or fence behavior regresses.

The later context-version probe tests the explicit F2 requirement to keep strict context/version validation. It does not add UI, storage, #471, or hosted requirements.

## SPEC

### F1: RESOLVED

At `src/lib/workbook-progress-history.ts:403`, public composition refuses `corrections-unavailable` after a successful facts read and before the planner call. The raw reader can still return facts with an explicit unavailable correction label. That label is not proof of an empty correction set.

Fresh current/prior probes cover unavailable, validated-empty, and validated-fixed evidence. Current unavailable proof returns only `ok`, `availability`, and `reason`, without answer text or a plan. Prior source returns the erroneous plan. Both validated current paths succeed. A successful version-bound second try removes page 9 from the actual Fix it avoidance input and reduces misses from two to one. Original accuracy stays 8/10. Eight time/version probes preserve old-version versus effective-version correction rules at the first reading, next parent change, and cutoff.

The positive fixture now has an explicit complete-empty correction attestation through the exact cutoff. Real callers must validate actual completeness. This review does not establish a #471 reader or correction ledger.

### F2: P2 remains, unsupported held teaching-context versions are accepted

Location: `src/lib/workbook-progress-history.ts:379` through line 382.

Concrete failure: start with `historyFixture(10, 8)`, selected step 2, prior prefix zero in snapshot and planning, and validated-empty correction proof. Current-book item 10 is held on Day 8. Keep its valid wrong reading, canonical source rows, observation, event, ownership, and journal unchanged. Change only the frozen catalog question's `teaching.version` from 1 to 2.

Actual current result: the raw reader and public composition succeed. The returned plan is `repeat-new-numbers`, with a complete selected sample. The retained result includes that unsupported-context item as validated held evidence. Version 0 also succeeds. The prior reader refuses both versions with `invalid-record`. Both readers accept version 1. Both readers refuse versions 0 and 2 when the same defect is placed on a selected item.

Cause: the catalog saves `contextVersion` at line 156. The old held sample passed it to the core. The core rejects a non-null context version other than 1 at `src/lib/workbook-progress.ts:237`. The new `requiredSample: null` call omits that field. Its observation teaching reference contains curriculum and step fields, but no teaching-context version. Thus the no-sample path cannot reject this unsupported version. The earlier source checks do not check it.

Impact: this repair weakens the explicit refusal boundary for frozen contexts. The reader interprets an unsupported context with current eligibility rules, returns complete retained evidence, and drops the unsupported context version from the normalized held observation. This is a public-contract regression. The probe does not establish a changed selected score or a hosted bad row.

Smallest fix: explicitly check the held catalog item's non-null context version before accepting the no-sample result. Keep `requiredSample: null` so held right answers do not create a mastery decision. Add public controls for held context versions 0/1/2, outside-days and outside-sample, with prior zero and both right/wrong results.

Evidence: 12 current/prior cases isolate selected versus held context versions 0/1/2. A further 24 current/in-memory-repair cases cover both held reasons and both results. A diagnostic gate `(x.contextVersion !== null && x.contextVersion !== 1)` rejects all eight unsupported-version repair cases and keeps all four version-1 repair cases successful. All 12 current cases succeed, including eight unsupported contexts. This control changes the module only in memory. It is not a source fix or approval.

The original F2 false refusal is repaired: all eight current held reason/prior/result cases keep the intended selected repeat action. The exact old public probes reproduce two prior-zero/right refusals on the rejected source. A real selected passing sample with prior zero still refuses. Another 46 malformed held cases reject bad readings, typed values, observation/result versions, context curriculum/unit, journals, publication links, causes, and second tries. Those checks do not cover the missing context-version field.

### F3: RESOLVED

At `src/lib/workbook-progress-history-store.ts:11`, the adapter uses Node `isDeepStrictEqual`. Fresh probes use the installed real Supabase client with fake HTTP and a response cap of three. Recursive object-key reversal returns the full unchanged current preview. The prior adapter rejects that equal manifest. Reversed day arrays, reversed page arrays, and a changed nested value are refused. Direct public store-fence controls also return null for those unequal manifests, so an earlier manifest validator cannot conceal an adapter comparison failure. All HTTP is synthetic and limited to GET/HEAD.

## STANDARDS

No separate confirmed standards defect was found. The modules are server-only. The adapter uses the generated query types without overrides or schema/type changes. Public tests use public entry points. The read-only seam has explicit caller-authorization, frozen-package, prior-mastery, issued-history, and correction-proof obligations. Credentials and reference strings are not authorization or completeness proof.

No Next.js code, writer, scheduler, migration, configuration, or instruction file changed. The F2 runtime context-version failure is counted once under SPEC.

## Commands and checks

All commands ran in the assigned frozen checkout. Tools came only from the permitted installed directory `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-e10c57ae/node_modules`. No peer source/configuration, install, or symlink was used. Verified versions: Node 22.23.1, Vitest 4.1.11, TypeScript 5.9.3, ESLint 9.39.5, Supabase client 2.117.2, esbuild 0.28.2.

The supplied test helpers use explicit source aliases and filters, maxWorkers 1, no cache/watch, configFile false, and envDir false. They close Vitest in finally. To preserve the supplied evidence files, I executed their inspected source through Node standard input and changed only each JSON output destination to `/tmp/472-r2-review-<kind>.json`. The four exact filters were:

`src/lib/workbook-progress-history.test.ts src/lib/workbook-progress-history-store.test.ts src/lib/workbook-progress.test.ts src/lib/workbook-progress-plan.test.ts`

The following wrapper reproduces the focused runs. Each child receives the exact four filters above. Only its JSON destination changes. Output goes to a temporary file.

```sh
node --input-type=module <<'JS'
import fs from "node:fs";
import {spawnSync} from "node:child_process";
const dir="/Users/savargupta/unica-workbook-samples/overnight-20261107/";
const files=["src/lib/workbook-progress-history.test.ts","src/lib/workbook-progress-history-store.test.ts","src/lib/workbook-progress.test.ts","src/lib/workbook-progress-plan.test.ts"];
for(const kind of ["fixed","prior"]){
 const code=fs.readFileSync(dir+"run-472-history-r2-"+kind+".mjs","utf8").replaceAll(dir+"472-history-r2-"+kind+".json","/tmp/472-r2-review-"+kind+".json");
 const fd=fs.openSync("/tmp/472-r2-review-"+kind+".log","w");
 const result=spawnSync(process.execPath,["--input-type=module","-"],{input:"process.argv=[process.execPath,\"review\",..."+JSON.stringify(files)+"];\n"+code,encoding:"utf8",stdio:["pipe",fd,fd]});
 fs.closeSync(fd);
 console.log(kind,result.status);
}
JS
```

The prior helper loads exactly both implementation modules from the rejected pin in memory. Current tests, fixture, approved core, and preview stay the same. The machine-filtered file lists and ordered test names match between current and prior runs.

| Check | Exact result | Exit |
| --- | --- | --- |
| Fresh current selection | 4 files, 252 pass, 0 fail | 0 |
| Fresh prior implementation control | Same 4 files and 252 cases, 248 pass, 4 fail | 1 |
| Scoped ESLint | 5 roots, 0 errors, 0 warnings | 0 |
| Scoped TypeScript | 5 roots and imports, 0 diagnostics | 0 |
| Independent recorded probe cases | 130 cases; all asserted observations reproduced, including the F2 defect | 0 |
| Pinned diff whitespace | Feature base through frozen HEAD | 0 |

The four prior failures are exactly: unavailable correction admission; outside-days/prior-zero/right; outside-sample/prior-zero/right; reordered equal manifest. The saved root final logs and task arrays agree with the fresh runs. The intermediate 251 count is not used. Counts are not added across runs.

The first fresh prior wrapper used a bounded stdout buffer. Vitest printed a large assertion difference, which stopped that wrapper before it saved its JSON. I repeated the same selection with stdout/stderr directed to a file descriptor. That completed with the four expected failures. The failed wrapper is not counted as another test selection.

The scoped command was:

```sh
node /tmp/run-progress-history-472-scoped.mjs src/lib/workbook-progress-history.ts src/lib/workbook-progress-history-store.ts src/lib/workbook-progress-history.fixture.ts src/lib/workbook-progress-history.test.ts src/lib/workbook-progress-history-store.test.ts
git diff --check 383685fb2877efd8ad1d862f5aefa95f8c83884b...6b465b419f9fb2dd716e5987938292f99b28d64a
```

The React package auto-detection notice is a tool notice in this checkout without installed React. It is not a source lint warning. Scoped checks do not establish the full application gate.

The fresh probe command was `node /tmp/472-r2-review-probes.mjs`. The exact script is below so it remains reviewable after temporary-file removal. I extracted that code from this report and ran it through Node standard input. It reproduced the same 130-case distribution. It uses in-memory bundles, public interfaces, local synthetic fixtures, and fake HTTP only.

| Recorded probe group | Count | Full outcome distribution |
| --- | --- | --- |
| Corrections, current/prior | 6 | 5 success, 1 corrections-unavailable |
| Held reason/prior/result, current/prior | 16 | 14 success, 2 invalid-record |
| Malformed held rows with valid controls | 46 | 42 invalid-record, 2 unproved-past-state, 2 missing-source-reference |
| Malformed correction contract | 3 | 2 invalid-contract, 1 source-error |
| Correction time/version boundaries | 8 | 5 success, 3 invalid-record |
| First/final step and real gap | 5 | 4 success, 1 invalid-record |
| Real-client manifest controls | 10 | 3 success, 5 scope-unavailable, 2 invalid-contract |
| Context-version current/prior | 12 | 6 success, 6 invalid-record |
| Context-version current/repair | 24 | 16 success, 8 invalid-record |
| Total | 130 | 53 success, 77 refusal |

These are recorded probe cases, not 130 passing acceptance tests. Some successful outcomes establish the defect. Pairing setup reads and adapter baseline/fence calls are not added to the count.

## Proof by subsystem

- Correction admission: proves the unavailable refusal and actual fixed/empty behavior. Passes through caller completeness attestation. No real correction store was read.
- Held evidence: proves the original mastery-gap false refusal is removed and most tested shape checks remain. The context-version failure above prevents acceptance. Other-step progress remains outside this reader.
- Versions and cutoff: proves tested first/effective-version correction boundaries, first/final step behavior, selected mastery-gap refusal, and the committed microsecond/post-cutoff controls. No saved snapshot or full automatic journal exists here.
- Pagination and source scope: the focused tests prove full retained pages, old reading 56, exact counts, dropped-page refusals, explicit Days 8-10 holding/later inclusion, and source/fence changes. They pass through fake store/HTTP semantics and prove no hosted settings or RLS.
- Help and first reading: focused tests preserve original readings, explicit help, unknown paper-answer ordering, and separation of later Maya success from a fix. No model or handwriting recognition ran.
- Planner and Fix it: public probes reach the actual preview and planner. They check actions, original accuracy, and Fix it inputs. They do not generate, render, print, persist, or issue a book.
- Concurrency and privacy: selected tests run two reads concurrently and reject the changed path. Tested refusals return bounded fields without private answer text. The fence is optimistic. It supplies no transaction, write lock, or live caller authorization.
- Types and lint: proves the five scoped roots and imports pass. It does not prove a build or full suite.

Live caller authorization, trusted sample/package loading, issuance/prior proof storage, a full automatic ledger, #471 correction reading, UI, snapshot persistence, hosted RLS/retention/deletion, and whole-feature checks remain outside this bounded recheck. Their declared absence is not another finding.

## Preservation and cleanup

Before checks, I hashed all 4,082 tracked regular files and the Git index. Index SHA256: `a49944a9363e891be4803cbb5109e54a241d5d599c051228ece70e33d959c467`. Final verification found all original tracked bytes and index bytes unchanged. Branch and HEAD still match the pins. The only checkout write is this new report.

Implementation SHA256 values:

- History: `88e9f378a69b5dd9fac606b615a235417a6f75f31f5146d3b72e8df763be0e40`.
- Store: `9d09840476daf8c20a7131bc7c4fc43f45a54d7ae3f1b73460dc67c8c31eaed5`.
- Scoped helper: `db839fc22958b9c20d40d66e81178f2b8abf844040fcc926ef78e835285de8eb`.
- Independent probe script: `318ed170b68cb247fb0eaeaec3a8051537957a45688552ed0b0601bff688606b`.

All owned check processes exited. Temporary probes, result arrays, preservation data, and logs were removed after the final recount. Supplied root evidence and helpers were not changed. No default checkout, fetch, integration, provider/model/service/hosted call, browser, server, full suite/build, generator, migration, Auth fixture, environment/credential read, customer action, email, charge, deletion, flag, commit, push, PR comment, watch, or closure ran.

## Exact independent probe

Run the following code with `node --input-type=module` on standard input from the assigned checkout. It creates only its temporary JSON result. The code records expected prior failures and the candidate context-version defect. A zero script exit means that these observations reproduced.

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createClient} from '/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-e10c57ae/node_modules/@supabase/supabase-js/dist/index.mjs';
import {build} from '/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-e10c57ae/node_modules/esbuild/lib/main.js';
const root=process.cwd(),req=createRequire(import.meta.url),rows=[];
const old='cc892638a41a97b702c2cc49047c7eae9088b9b0';
async function load(prior){
 const sources=new Map(prior===true?['workbook-progress-history.ts','workbook-progress-history-store.ts'].map(n=>[n,execFileSync('git',['show',old+':src/lib/'+n],{encoding:'utf8'})]):prior==='repair'?[['workbook-progress-history.ts',fs.readFileSync(root+'/src/lib/workbook-progress-history.ts','utf8').replace('if (!check.ok) fail("invalid-record");','if ((x.contextVersion !== null && x.contextVersion !== 1) || !check.ok) fail("invalid-record");')]]:[]);
 const bundle=await build({stdin:{contents:'export * from "./src/lib/workbook-progress-history";export * from "./src/lib/workbook-progress-history-store";export * from "./src/lib/workbook-progress-history.fixture";export {expectedItems} from "./src/lib/scan-observation";',loader:'ts',resolveDir:root},bundle:true,write:false,platform:'node',format:'cjs',target:'node22',tsconfigRaw:{compilerOptions:{}},alias:{'@':root+'/src'},logLevel:'silent',plugins:[{name:'read-only-review',setup(b){b.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'empty'}));b.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:'',loader:'js'}));if(prior)b.onLoad({filter:/workbook-progress-history(?:-store)?\.ts$/},a=>{const contents=sources.get(a.path.split('/').at(-1));if(contents!==undefined)return {contents,loader:'ts',resolveDir:root+'/src/lib'};});}}]});
 const mod={exports:{}};new Function('module','exports','require',bundle.outputFiles[0].text)(mod,mod.exports,id=>{assert(id.startsWith('node:'));return req(id);});return mod.exports;
}
const current=await load(false),prior=await load(true);
const json=v=>JSON.parse(JSON.stringify(v));
function record(group,name,r,extra={}){rows.push({group,name,outcome:r.ok?'success':r.reason,...extra});}
function ok(r){assert(r.ok,JSON.stringify(r));return r;}
function refuse(r){assert.equal(r.ok,false);assert.deepEqual(Object.keys(r).sort(),['availability','ok','reason']);assert.equal(r.availability,'unavailable');assert(!JSON.stringify(r).includes('56'));return r;}
function result(m,f){return m.previewNextWorkbookPlanFromHistory(f.store,f.input,f.planning);}
function mark(f,n,right){const r=f.marks[n],s=right?'13':'56';Object.assign(r.observation,{result:right?'right':'wrong',readAnswerText:s,regions:[{regionId:'answer',text:s,value:s,certainty:'certain'}]});r.original_event.result=r.observation.result;f.events.find(e=>e.id===r.event_id).result=r.observation.result;}
function held(m,reason,prefix=0){const f=m.historyFixture(10,8),n=reason==='outside-days'?10:8;f.input.snapshot.priorMastery.passedSteps=prefix;f.planning.passed[f.input.curriculum.skill.id]=prefix;if(reason==='outside-sample')f.input.sample=f.input.sample.filter(x=>x.itemId!==f.marks[n].item_id);return {f,n};}
function correction(f,n,tries){f.input.proof.corrections.rows=[{identity:f.marks[n].observation.identity,tries}];}
const firstAt=Date.parse('2026-01-01T12:00:00Z'),changeAt=Date.parse('2026-02-01T12:00:00Z');
const goodTry={id:'independent-probe-fix',at:changeAt,basedOnResultVersion:2,result:'right',help:'none'};
for(const [pin,m] of [['current',current],['prior',prior]]){
 for(const state of ['unavailable','empty','fixed']){
  const f=m.historyFixture(10,8);if(state==='unavailable')f.input.proof.corrections='unavailable';if(state==='fixed')correction(f,8,[goodTry]);
  const raw=ok(await m.readWorkbookProgressHistory(f.store,f.input));assert.equal(raw.proof.corrections,state==='unavailable'?'unavailable':'caller-validated');const r=await result(m,f);
  if(pin==='current'&&state==='unavailable'){refuse(r);assert.equal(r.reason,'corrections-unavailable');}
  else {ok(r);assert.equal(r.preview.decision.score.independentFirstRight,8);assert.equal(r.preview.decision.misses.length,state==='fixed'?1:2);const item=r.preview.decision.items.find(x=>x.identity.itemId==='item-8');assert.equal(item.unresolved,state!=='fixed');const fix=r.preview.plan.days.flatMap(d=>d.pages.flatMap(p=>p.parts)).flatMap(p=>p.fixIt??[]).find(x=>x.skill===f.input.curriculum.skill.id);assert.equal(fix.avoid.questions.some(q=>q.page===9),state!=='fixed');}
  record('corrections',pin+'/'+state,r);
 }
 for(const reason of ['outside-days','outside-sample'])for(const prefix of [0,1])for(const right of [false,true]){
  const {f,n}=held(m,reason,prefix);mark(f,n,right);const r=await result(m,f);if(pin==='prior'&&prefix===0&&right){refuse(r);assert.equal(r.reason,'invalid-record');}else{ok(r);assert.equal(r.preview.decision.action,'repeat-new-numbers');assert.equal(r.preview.decision.passed[f.input.curriculum.skill.id],prefix);assert(!r.preview.decision.items.some(x=>x.identity.itemId===f.marks[n].item_id));assert(r.retained.held.some(x=>x.reason===reason&&x.original.first.observation.identity.itemId===f.marks[n].item_id));}record('held-matrix',`${pin}/${reason}/${prefix}/${right}`,r);
 }
}
const bad=new Map([
 ['reading-length',(f,n)=>f.marks[n].observation.readAnswerText='x'.repeat(201)],
 ['typed-value-length',(f,n)=>f.marks[n].observation.regions[0].value='x'.repeat(201)],
 ['observation-version',(f,n)=>f.marks[n].observation.version=2],
 ['result-version',(f,n)=>f.marks[n].observation.resultVersion=3],
 ['automatic-gap',(f,n)=>{f.marks[n].observation.resultVersion=3;f.marks[n].result_version=3;}],
 ['region-result',(f,n)=>f.marks[n].observation.regions[0].result='unsupported'],
 ['region-not-read',(f,n)=>f.marks[n].observation.regions[0].certainty='not-read'],
 ['help',(f,n)=>f.marks[n].observation.help='unsupported'],
 ['publication',(f,n)=>f.events.find(e=>e.id===f.marks[n].event_id).result='right'],
 ['context-curriculum',(f,n)=>{const page=f.input.books.flatMap(b=>b.pages).find(p=>p.pageId===f.marks[n].page_id);page.questions[0].teaching.curriculum.version='wrong';const e=current.expectedItems(page)[0];f.marks[n].expected=json(e);f.marks[n].observation.teaching=json(e.teaching);}],
 ['context-unit',(f,n)=>{const page=f.input.books.flatMap(b=>b.pages).find(p=>p.pageId===f.marks[n].page_id);page.questions[0].teaching.itemStep.unit='wrong';const e=current.expectedItems(page)[0];f.marks[n].expected=json(e);f.marks[n].observation.teaching=json(e.teaching);}],
 ['journal-version',(f,n)=>{f.parentChange(n,'wrong');f.changes[0].from_version=1;}],
 ['cause-kind',(f,n)=>{f.input.proof.causes={reference:'synthetic',rows:[{identity:f.marks[n].observation.identity,cause:{kind:'unsupported'}}]};}],
 ['cause-version',(f,n)=>{f.input.proof.causes={reference:'synthetic',rows:[{identity:f.marks[n].observation.identity,cause:{kind:'careless',resultVersion:99,evidenceId:'cause'}}]};}],
 ['cause-id',(f,n)=>{f.input.proof.causes={reference:'synthetic',rows:[{identity:f.marks[n].observation.identity,cause:{kind:'careless',resultVersion:2,evidenceId:''}}]};}],
 ['cause-mistake',(f,n)=>{f.input.proof.causes={reference:'synthetic',rows:[{identity:f.marks[n].observation.identity,cause:{kind:'conceptual',resultVersion:2,evidenceId:'cause',mistake:{stepPosition:'wrong',index:999}}}]};}],
 ...Object.entries({id:'',at:firstAt-1,basedOnResultVersion:99,result:'unsupported',help:'unsupported'}).map(([k,v])=>['try-'+k,(f,n)=>correction(f,n,[{...goodTry,[k]:v}])]),
 ['try-after-cutoff',(f,n)=>correction(f,n,[{...goodTry,at:f.input.snapshot.cutoff+1}])],
 ['try-duplicate',(f,n)=>correction(f,n,[goodTry,goodTry])],
]);
for(const reason of ['outside-days','outside-sample'])for(const [name,mutate]of bad){const {f,n}=held(current,reason);ok(await result(current,f));mutate(f,n);const r=refuse(await result(current,f));record('held-shape',reason+'/'+name,r);}
for(const [name,mutate]of [['cutoff',f=>f.input.proof.corrections.completeThrough--],['reference',f=>f.input.proof.corrections.reference=''],['rows',f=>f.input.proof.corrections.rows=null]]){const f=current.historyFixture(10,8);mutate(f);record('correction-contract',name,refuse(await result(current,f)));}
for(const [name,time,version,success,misses] of [['first-before',firstAt-1,2,false,0],['first-at',firstAt,2,true,1],['first-after',firstAt+1,2,true,1],['old-before-change',changeAt-1,2,true,2],['old-at-change',changeAt,2,false,0],['new-at-change',changeAt,3,true,1],['new-at-cutoff',null,3,true,1],['new-after-cutoff',-1,3,false,0]]){
 const f=current.historyFixture(10,8);if(version===3||name.startsWith('old-'))f.parentChange(8,'wrong');const at=time===null?f.input.snapshot.cutoff:time===-1?f.input.snapshot.cutoff+1:time;correction(f,8,[{...goodTry,at,basedOnResultVersion:version}]);const r=await result(current,f);if(success){ok(r);assert.equal(r.preview.decision.score.independentFirstRight,8);assert.equal(r.preview.decision.misses.length,misses);}else refuse(r);record('version-boundary',name,r);
}
function retarget(f,step){f.input.snapshot.selection.step=step;f.input.snapshot.priorMastery.passedSteps=step-1;f.planning.passed[f.input.curriculum.skill.id]=step-1;for(const b of f.input.books)for(const p of b.pages){p.questions[0].teaching.itemStep.step=step;p.questions[0].teaching.plannedStep.step=step;const e=current.expectedItems(p)[0],r=f.marks.find(x=>x.page_id===p.pageId);r.expected=json(e);r.observation.teaching=json(e.teaching);}}
for(const position of ['first','last'])for(const right of [8,9]){const f=current.historyFixture(10,right),step=position==='first'?1:f.input.curriculum.steps.length;retarget(f,step);const r=ok(await result(current,f));assert.equal(r.preview.decision.action,right===8?'repeat-new-numbers':position==='first'?'advance':'skill-complete');record('step-boundary',position+'/'+right,r,{action:r.preview.decision.action});}
{const f=current.historyFixture(10,10);f.input.snapshot.priorMastery.passedSteps=0;f.planning.passed[f.input.curriculum.skill.id]=0;record('step-boundary','actual-selected-gap',refuse(await result(current,f)));}
function adapter(m){const f=m.historyFixture(10,8),calls=[];const db=createClient('https://review.example.invalid','synthetic-only',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(input,init)=>{const u=new URL(String(input)),table=u.pathname.split('/').at(-1),method=init?.method??'GET';assert(['GET','HEAD'].includes(method));assert(Object.hasOwn(f.tables,table));calls.push({table,method});let rs=f.tables[table].map(r=>table==='scan_mark_changes'?{...r,scan_marking_items:f.marks.find(m=>m.id===r.item_id)}:{...r});const get=(r,k)=>k.split('.').reduce((v,n)=>v?.[n],r);for(const[k,v]of u.searchParams){if(v.startsWith('eq.'))rs=rs.filter(r=>String(get(r,k))===v.slice(3));if(v.startsWith('gt.'))rs=rs.filter(r=>get(r,k)>v.slice(3));if(v.startsWith('in.('))rs=rs.filter(r=>v.slice(4,-1).split(',').includes(String(get(r,k))));}const count=rs.length;if(u.searchParams.has('order'))rs.sort((a,b)=>a.id<b.id?-1:1);if(u.searchParams.has('limit'))rs=rs.slice(0,Math.min(3,Number(u.searchParams.get('limit'))));return new Response(method==='HEAD'?null:JSON.stringify(rs),{headers:{'Content-Type':'application/json','Content-Range':`*/${count}`}});}}});return {...f,calls,store:m.workbookProgressHistoryStore(db)};}
const reverse=v=>Array.isArray(v)?v.map(reverse):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).reverse().map(([k,x])=>[k,reverse(x)])):v;
for(const [pin,m]of [['current',current],['prior',prior]])for(const mode of ['same','keys','days','pages','value']){const f=adapter(m);const baseline=ok(await result(m,f));if(mode==='keys')f.input.books=f.input.books.map(b=>({...b,manifest:reverse(b.manifest)}));else if(mode!=='same'){const b=f.input.books[0];b.manifest=structuredClone(b.manifest);if(mode==='days')b.manifest.days.reverse();if(mode==='pages')b.manifest.days[0].pages.reverse();if(mode==='value')b.manifest.curriculum.version='different';}const r=await result(m,f);if(mode==='same'||mode==='keys'&&pin==='current'){assert.deepEqual(ok(r),baseline);assert(await f.store.fence(f.input));}else{refuse(r);assert.equal(await f.store.fence(f.input),null);}record('manifest',pin+'/'+mode,r,{requests:f.calls.length});}
for(const [pin,m] of [['current',current],['prior',prior]])for(const where of ['selected','held'])for(const version of [0,1,2]){
 const {f,n}=held(m,'outside-days');const index=where==='held'?n:0;
 const p=f.input.books.flatMap(b=>b.pages).find(p=>p.pageId===f.marks[index].page_id);p.questions[0].teaching.version=version;
 const r=await result(m,f);const expectSuccess=version===1||(pin==='current'&&where==='held');assert.equal(r.ok,expectSuccess,JSON.stringify({pin,where,version,r}));if(!r.ok)refuse(r);
 record('context-version',`${pin}/${where}/${version}`,r,{contextVersion:version});
}
const repaired=await load('repair');
for(const [pin,m]of [['current',current],['repair',repaired]])for(const reason of ['outside-days','outside-sample'])for(const version of [0,1,2])for(const right of [false,true]){
 const {f,n}=held(m,reason);mark(f,n,right);f.input.books.flatMap(b=>b.pages).find(p=>p.pageId===f.marks[n].page_id).questions[0].teaching.version=version;
 const r=await result(m,f);assert.equal(r.ok,pin==='current'||version===1);if(r.ok)assert.equal(r.preview.decision.action,'repeat-new-numbers');else refuse(r);
 record('context-repair-control',`${pin}/${reason}/${version}/${right}`,r);
}
const distribution=rows.reduce((a,r)=>{const k=r.group+'/'+r.outcome;a[k]=(a[k]??0)+1;return a;},{});fs.writeFileSync('/tmp/472-r2-review-probes.json',JSON.stringify({count:rows.length,distribution,rows},null,2));console.log(JSON.stringify({count:rows.length,distribution}));

```

VERDICT: FAIL
