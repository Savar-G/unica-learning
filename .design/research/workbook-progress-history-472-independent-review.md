# Independent SPEC and STANDARDS review of the bounded #472 history reader

HANDOFF_DONE

SPEC: FAIL. Three P2 findings remain.
STANDARDS: PASS. No separate confirmed standards finding.

This report grants no feature, release, customer, or recognition approval. The prior core and preview approvals remain separate.

## Verified source

- Computer: `Savars-MacBook-Pro-5.local`, verified with `hostname`.
- Runtime: Unify Codex `gpt-6.1-sol`, high reasoning effort, as specified by the task. No account or credential file was read.
- Assigned path: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-470cdf68`.
- Physical path: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-470cdf68`, verified with `pwd -P`.
- Branch: `site/workbook-progress-history-472`, verified with `git branch --show-current`.
- Frozen HEAD: `cc892638a41a97b702c2cc49047c7eae9088b9b0`.
- Approved base: `383685fb2877efd8ad1d862f5aefa95f8c83884b`.
- Merged #697 foundation: `89963c956d5eee2b87d18c58e9c35181b9aeef7f`.
- Initial status: clean. The pinned diff has six new files and 1,179 additions. The two implementation files have 522 lines.

The task reports the PC unreachable and the shared source frozen. This review used no agent, other checkout, default checkout, fetch, branch switch, writer, or generator reservation. The review used only the assigned source and the explicitly permitted installed tools.

Read sources: actual `AGENTS.md`; `docs/agents/delegate-brief.md`; saved full issue `/Users/savargupta/unica-workbook-samples/overnight-20261107/issue-472.json`; all six new files; the approved core, preview, and public planner contracts; their handoffs and independent reports; workbook context sections 3, 4.4, 4.5, and 4.6; actual `scan-observation`, `scan-marking-reader`, `scan-history-reader`, and `learning-events` APIs; generated table and relationship types; `database.ts`; and the marking, parent-change, and learning-event migrations. The saved issue SHA-256 is `cce3b65949608d10f3794537ab3160a3021dea83e6fbffe2a30ce1cfd2df1c2e`.

The code-review skill supplied the two review axes. The task's explicit single-reviewer and bounded-check limits controlled execution. Supabase review remained local and read-only. No live service, hosted query, Auth fixture, Storage, image, provider, model, environment, credential, browser, server, full suite, build, migration, customer action, email, charge, flag, deletion, commit, push, PR comment, watch, or issue closure ran.

## Falsifiers

Before checks, the review identified these failure conditions: lost response pages or old answer text; post-cutoff judgment use; extra attempts from photo identity; loss of the first reading or parent change; foreign records admitted; failed or truncated sources treated as complete; unknown correction state asserted as unresolved; a successful unused planner decision; later Maya success treated as a correction; mismatched observed revision/count checks; held records changing the selected policy; and private evidence returned on refusal.

The independent controls also required equal manifest objects with different property order to produce the same result. In-memory repairs had to remove the reproduced failures without changing tracked source.

## SPEC

### F1. P2: Unavailable correction proof becomes confirmed unresolved work in the successful plan

Location: `src/lib/workbook-progress-history.ts:334`, with public composition at line 402.

Concrete input: the public synthetic `historyFixture(10, 8)`, selected step 2, proven prior prefix 1, ten resolved original items, and cutoff `2026-11-07T12:00:00.000Z`. Pages 9 and 10 have wrong originals. The caller explicitly supplies `proof.corrections: "unavailable"` and `proof.causes: "unavailable"`.

Actual result: the public composition returns `ok:true`, `availability:"complete"`, and decision `status:"complete"`. Page 9 has `secondTries:[]` and `unresolved:true`. Both pages enter `decision.misses` and the actual planner's Fix it avoidance list. The result is identical to separately validated complete correction proof with zero rows. Supplying a valid version-2 successful correction for page 9 removes that miss and its Fix it entry. Original accuracy remains 8/10 in all three cases.

Harm: when correction proof cannot be read, the returned plan can assign Fix it for work the child already fixed. The nested `retained.proof.corrections:"unavailable"` label does not qualify the boolean `unresolved`, the computed miss list, or the actual successful plan. A caller that consumes the returned plan receives a definitive correction-dependent result.

Required behavior: preserve unavailable correction state through any output that depends on it. The saved issue says that fixing an item removes its unresolved miss. Workbook context sections 3 and 4.6 exclude fixed work from the next Fix it. The review brief also requires unknown correction proof to remain unknown.

Smallest repair: keep the read-only retained-history result, but refuse the definitive plan while correction completeness is unavailable. A separate explicitly provisional result would need to qualify unresolved state and the plan itself. Implementing a #471 reader is not required for this repair.

Evidence: three candidate public-interface cases distinguish unavailable, validated-empty, and validated-fixed correction proof. Three in-memory control cases add a preview refusal for unavailable corrections. They retain both validated success paths and return no private evidence on refusal.

Limit: this proves a returned contract and actual planner defect with synthetic evidence. It does not prove a hosted correction exists. Unknown causes remain explicit `kind:"unknown"` and safely select the existing review action when needed. There is no separate cause finding.

### F2. P2: A valid held right answer can block the Day 7 read through the mastery-gap policy

Location: `src/lib/workbook-progress-history.ts:379` through line 382.

Concrete input: `historyFixture(10, 8)` with selected step 2 and proven prior prefix 0 in both snapshot and planning. The selected Day 7 sample has 8/10 independent right answers. Current-book Day 8 is outside the allowed days and outside that sample. Give its valid retained original a right result, matching reading `13`, and matching published event and intent.

Actual result: `readWorkbookProgressHistory` and its preview return `invalid-record`. With the same held item wrong, the preview succeeds with `repeat-new-numbers`. With prior prefix 1, either held judgment succeeds. A second control reproduces the same failure for an allowed-day item held outside the required sample.

Cause: the reader converts each held item into a complete one-item sample. A right item becomes a 100% passing sample. The approved core correctly returns `mastery-gap` for passing step 2 with prior prefix 0. The reader then treats this valid policy refusal as invalid retained data. The actual selected sample does not pass and does not request new mastery.

Harm: an early Day 8 answer changes whether a permitted Days 1-7 preview is available. An excluded right answer can block a preview that the same excluded wrong answer permits. The record's identity, scope, observation, event, and journal are valid.

Required behavior: validate every held record's shape and proof without applying its isolated mastery decision to the selected read. The issue requires current-book Days 8-10 to remain held for later books.

Smallest repair: validate held selected-step evidence through the core's no-sample path (`requiredSample:null`), after the existing trusted package and source checks. This still checks readings, changes, causes, and second tries. It does not create a complete one-item mastery sample. Keep the selected sample's real mastery-gap refusal unchanged.

Evidence: eight candidate cases cover held reason outside-days/outside-sample, prior prefix 0/1, and right/wrong result. Exactly the two prior-zero/right cases refuse. An in-memory change only to the held sample validation makes all eight cases return the same permitted repeat plan. The probes supply validated-empty correction proof to isolate this finding from F1.

Limit: this is a false refusal. It does not establish invented mastery or a post-cutoff score. The prior core's mastery-gap rule remains correct.

### F3. P2: The typed adapter rejects equal manifests when object property order differs

Location: `src/lib/workbook-progress-history-store.ts:10`, used at line 85.

Concrete input: retain the same shipped books, ownership, revision, page catalog, manifest values, and source rows. Replace each caller manifest with `Object.fromEntries(Object.entries(manifest).reverse())`. Node `assert.deepEqual` confirms that each caller manifest equals its stored manifest. Only object property order differs.

Actual result through the real Supabase client and fake HTTP: the original order returns the expected repeat plan after 42 read-only requests. The reordered equal object returns `scope-unavailable` after six requests. The reader's own canonical comparisons accept the same values, but the adapter compares `JSON.stringify` output.

Harm: a valid trusted manifest can cause the reader to report missing scope solely because its properties were constructed or decoded in another order. The public manifest contract does not require property insertion order.

Required behavior: compare manifest structure and values. Preserve array order where it carries meaning.

Smallest repair: use an order-independent object comparison, as the reader already does. Add a public adapter control with reordered equal object keys.

Evidence: two candidate actual-client cases and two in-memory comparator controls. Both controls succeed with the same 42-request read path. No hosted service was contacted.

## STANDARDS

No separate confirmed standards defect was found. Tests use public functions. Both implementation modules are server-only. Queries use generated table, column, and relationship types without query overrides. Persisted observations and journals receive runtime validation. The source adapter reads no RPC, Auth, Storage, image, profile, job, or cost data. It receives an existing typed client and states the live caller-authorization obligation.

The implementation adds no review scheduler or writer. The explicit package/sample, prior-mastery, and issued-history proof boundaries remain caller obligations. A proof reference string and service credentials do not authorize the caller.

## Checks and exact counts

All commands ran from the assigned checkout. Installed tools were absent there. The approved borrowed directory was `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-e10c57ae/node_modules`. No peer source or project configuration was used. No install or symlink was made.

Verified versions: Node `v22.23.1`, Vitest `4.1.11`, TypeScript `5.9.3`, ESLint `9.39.5`, Supabase client `2.117.2`, esbuild `0.28.2`.

The helpers were read before execution. The focused helper fixes this source root, explicit aliases/includes, `maxWorkers:1`, `configFile:false`, `envDir:false`, `watch:false`, and `cache:false`. It closes Vitest in `finally`. The compiler checks five explicit roots and their imports with emit, incremental state, and plugins disabled.

```sh
node /tmp/run-progress-history-472-focused.mjs src/lib/workbook-progress-history.test.ts src/lib/workbook-progress-history-store.test.ts src/lib/workbook-progress.test.ts src/lib/workbook-progress-plan.test.ts > /tmp/472-history-independent-focused.log 2>&1
node /tmp/run-progress-history-472-scoped.mjs src/lib/workbook-progress-history.ts src/lib/workbook-progress-history-store.ts src/lib/workbook-progress-history.fixture.ts src/lib/workbook-progress-history.test.ts src/lib/workbook-progress-history-store.test.ts > /tmp/472-history-independent-scoped.log 2>&1
git diff --check 383685fb2877efd8ad1d862f5aefa95f8c83884b...cc892638a41a97b702c2cc49047c7eae9088b9b0
```

| Check | Result | Exit |
| --- | --- | --- |
| Focused tests | Four files, 240 passed, zero failed | 0 |
| Scoped ESLint | Five roots, zero errors, zero warnings | 0 |
| Scoped TypeScript | Five roots and imports, zero diagnostics | 0 |
| Independent candidate/control probes | 26 executed cases; all expected observations reproduced | 0 |
| Diff whitespace | Pinned base through pinned HEAD | 0 |

The 240 cases are one current selection of the four listed files. They are not added to the earlier 245-test preview selection. Counts come from the same machine-filtered task array at `/tmp/progress-history-472-tests.json`. Saved root logs agree with the fresh focused/scoped results. The React auto-detection notice is separate from source lint warnings.

The 26 independent cases comprise 16 held-policy cases, six correction cases, and four manifest-order cases. Each half uses either the frozen candidate or an in-memory control. The controls change held validation, correction-plan admission, and manifest comparison only. They are diagnostic evidence, not a reviewed source repair. No source file or bundle is written.

Helper SHA-256 values:

- Focused helper: `432ba9e8378636ec0f7ce9e656a0485d580b2adc0622f374c073d29a9bbb5d0c`.
- Scoped helper: `db839fc22958b9c20d40d66e81178f2b8abf844040fcc926ef78e835285de8eb`.

## Executable independent reproduction

Run this command from the verified assigned checkout. It uses only the permitted installed tools and synthetic source fixture. All HTTP responses are local fake responses. The code below is the final 26-case probe; the initial exploratory 13 cases are not added to its count.

```sh
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {createClient} from '/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-e10c57ae/node_modules/@supabase/supabase-js/dist/index.mjs';
import {build} from '/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-e10c57ae/node_modules/esbuild/lib/main.js';
const root=process.cwd(), req=createRequire(import.meta.url), rows=[];
async function load(control=false){
 const code=(await build({stdin:{contents:'export * from "./src/lib/workbook-progress-history.fixture";export * from "./src/lib/workbook-progress-history";export * from "./src/lib/workbook-progress-history-store";export * from "./src/lib/scan-observation";',resolveDir:root,loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',target:'node22',tsconfigRaw:{compilerOptions:{}},alias:{'@':root+'/src'},logLevel:'silent',plugins:[{name:'review-memory-only',setup(b){
 b.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'empty'}));b.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:'',loader:'js'}));
 if(control)b.onLoad({filter:/[/\\]workbook-progress-history(?:-store)?\.ts$/},async args=>{
 let s=fs.readFileSync(args.path,'utf8');const replace=(a,z)=>{assert.equal(s.split(a).length,2);s=s.replace(a,z);};
 if(args.path.endsWith('workbook-progress-history-store.ts')) replace('JSON.stringify(a) === JSON.stringify(b)','isDeepStrictEqual(a, b)');
 else {replace('requiredSample: [{ ...x,\n      resultVersion: (o.changes.at(-1) ?? o.first).observation.resultVersion }]','requiredSample: null');replace('if (!retained.ok) return retained;','if (!retained.ok) return retained;\n  if (retained.proof.corrections === "unavailable") return { ok: false, availability: "unavailable", reason: "preview-refused" };');}
 return {contents:'import { isDeepStrictEqual } from "node:util";\n'+s,loader:'ts',resolveDir:root+'/src/lib'};
 });}}]})).outputFiles[0].text;
 const mod={exports:{}};new Function('module','exports','require',code)(mod,mod.exports,id=>{assert(id.startsWith('node:'));return req(id);});return mod.exports;
}
function proof(f){f.input.proof.corrections={reference:'complete-synthetic-proof',completeThrough:f.input.snapshot.cutoff,rows:[]};}
function markRight(f,n,m){const r=f.marks[n];Object.assign(r.observation,{result:'right',readAnswerText:'13',regions:[{regionId:'answer',text:'13',value:'13',certainty:'certain'}]});r.original_event.result='right';f.events[n].result='right';assert.equal(m.observationProblem(r.observation),null);}
function adapter(m){const f=m.historyFixture(10,8),calls=[];
 const db=createClient('https://review.example.invalid','synthetic-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(input,init)=>{
 const u=new URL(String(input)),t=u.pathname.split('/').at(-1);calls.push({table:t,method:init.method});assert(['GET','HEAD'].includes(init.method));assert(t in f.tables);
 let rs=f.tables[t].map(x=>t==='scan_mark_changes'?{...x,scan_marking_items:f.marks.find(r=>r.id===x.item_id)}:x);
 for(const [k,v] of u.searchParams){const val=r=>k.split('.').reduce((x,y)=>x?.[y],r);if(v.startsWith('eq.'))rs=rs.filter(r=>String(val(r))===v.slice(3));if(v.startsWith('gt.'))rs=rs.filter(r=>val(r)>v.slice(3));if(v.startsWith('in.('))rs=rs.filter(r=>v.slice(4,-1).split(',').includes(String(val(r))));}
 const count=rs.length;if(u.searchParams.has('order'))rs.sort((a,b)=>a.id<b.id?-1:1);if(u.searchParams.has('limit'))rs=rs.slice(0,Number(u.searchParams.get('limit')));
 return new Response(init.method==='HEAD'?null:JSON.stringify(rs),{headers:{'Content-Type':'application/json','Content-Range':`*/${count}`}});
 }}});return {...f,calls,store:m.workbookProgressHistoryStore(db)};
}
for(const control of [false,true]){
 const m=await load(control);
 for(const reason of ['outside-days','outside-sample'])for(const prefix of [0,1])for(const result of ['wrong','right']){
 const f=m.historyFixture(10,8);proof(f);f.input.snapshot.priorMastery.passedSteps=prefix;f.planning.passed[f.input.curriculum.skill.id]=prefix;
 const n=reason==='outside-days'?10:8;if(reason==='outside-sample')f.input.sample=f.input.sample.filter(x=>x.itemId!=='item-8');if(result==='right')markRight(f,n,m);
 const r=await m.previewNextWorkbookPlanFromHistory(f.store,f.input,f.planning),reject=!control&&prefix===0&&result==='right';assert.equal(r.ok,!reject);if(!r.ok)assert.equal(r.reason,'invalid-record');else assert.equal(r.preview.decision.action,'repeat-new-numbers');
 rows.push({group:'held',control,reason,prefix,result,actual:r.ok?r.preview.decision.action:r.reason});
 }
 for(const kind of ['unavailable','known-empty','known-fixed']){
 const f=m.historyFixture(10,8);if(kind!=='unavailable')proof(f);if(kind==='known-fixed')f.input.proof.corrections.rows=[{identity:f.input.sample[8],tries:[{id:'retained-fix',at:Date.parse('2026-02-01T12:00:00Z'),basedOnResultVersion:2,result:'right',help:'none'}]}];
 const r=await m.previewNextWorkbookPlanFromHistory(f.store,f.input,f.planning);assert.equal(r.ok,!(control&&kind==='unavailable'));
 if(!r.ok){assert.deepEqual(Object.keys(r).sort(),['availability','ok','reason']);rows.push({group:'corrections',control,kind,actual:r.reason});continue;}
 const i=r.preview.decision.items.find(x=>x.identity.itemId==='item-8'),parts=r.preview.plan.days.flatMap(d=>d.pages.flatMap(p=>p.parts)),fix=parts.flatMap(p=>p.fixIt??[]).find(x=>x.skill===f.input.curriculum.skill.id);
 assert.equal(r.preview.decision.status,'complete');assert.equal(r.preview.decision.score.independentFirstRight,8);assert.equal(i.unresolved,kind!=='known-fixed');assert.equal(r.preview.decision.misses.length,kind==='known-fixed'?1:2);assert.equal(fix.avoid.questions.some(x=>x.page===9),kind!=='known-fixed');
 rows.push({group:'corrections',control,kind,actual:r.preview.decision.action,unresolved:i.unresolved,misses:r.preview.decision.misses.length,fixAvoidPages:fix.avoid.questions.map(q=>q.page),proof:r.retained.proof.corrections});
 }
 for(const order of ['same','reversed']){
 const f=adapter(m);proof(f);if(order==='reversed')for(const b of f.input.books)b.manifest=Object.fromEntries(Object.entries(b.manifest).reverse());for(const b of f.input.books)assert.deepEqual(b.manifest,f.tables.workbooks.find(x=>x.id===b.workbookId).print_manifest);
 const r=await m.previewNextWorkbookPlanFromHistory(f.store,f.input,f.planning);assert.equal(r.ok,control||order==='same');if(!r.ok)assert.equal(r.reason,'scope-unavailable');
 rows.push({group:'manifest',control,order,actual:r.ok?r.preview.decision.action:r.reason,requests:f.calls.length});
 }
}
const report={count:rows.length,groups:rows.reduce((a,r)=>(a[r.group]=(a[r.group]??0)+1,a),{}),rows};assert.equal(rows.length,26);console.log(JSON.stringify(report,null,2));fs.writeFileSync('/tmp/472-history-independent-controls.json',JSON.stringify(report,null,2));
JS
```

## Proof by subsystem and limits

- Pagination: focused tests prove complete exclusive-cursor reads, decreasing exact counts, lower server caps, empty-tail checks, and refusal after dropped item/journal/event pages. They do not prove hosted PostgREST settings.
- Retained evidence: tests preserve old `56`, typed regions, parent changes, canonical identity, and first provenance. Source checks refuse unproved automatic history and unresolved published references. They do not create the missing automatic version ledger.
- Cutoff: tests prove the tested parent-judgment and microsecond boundaries. Day 7 holds Days 8-10; explicit later scope includes them. F2 limits safe held validation. No trigger or saved snapshot was created.
- Planner: focused tests reach the actual preview and planner, including target steps and Fix it avoidance. F1 limits correction-dependent success. No replacement page was generated or rendered.
- Help and causes: tests preserve explicit math help, use unknown ordering for calls before recognition, and keep later Maya success separate from a second try. Causes remain unknown unless caller-validated. Recognition time does not establish paper-answer time.
- Ownership and concurrency: tests refuse the tested ownership, freeze, deletion, revision, page, and count changes, including concurrent read paths. These are optimistic observed checks. They do not supply a database transaction, snapshot, or lock.
- Refusal privacy: source refusals return bounded reasons without retained text or plans in the tested cases. Caller authorization remains outside this reader.
- Types and lint: scoped checks pass for five roots and imports. They do not prove the full application gate.

Live UI/API authorization, frozen package/sample loading, issuance and prior-mastery persistence, a complete automatic version ledger, merged correction reading, snapshot/queue persistence, hosted RLS/retention/deletion, and whole-#472 checks remain declared root work. Their absence alone is not a finding in this bounded review.

## Source preservation and cleanup

The initial preservation set contains 4,081 tracked regular files. Their SHA-256 values and the Git index bytes were recorded before checks. Index SHA-256: `10beca812909c688ac398ed1369e213a76fb26b65e4d932b5e316818c4bee4f8`.

The final preservation check confirmed all 4,081 tracked regular files unchanged and the same index SHA-256. Branch and HEAD still match the frozen values. Git status shows only this new report. The final machine recount returned four files, 240 passes, and the same 26-case probe distribution.

The report's executable code was also extracted and run through Node standard input. It reproduced all 26 observations. An initial data-module transport failed before assertions because `createRequire` received a data URL. The corrected transport used `execFileSync` with Node standard input. It wrote no script or bundle.

All owned check processes exited. Both focused/scoped sessions completed. Temporary review JSON, preservation files, and review logs were removed after the final recount. The supplied root logs and filtered task array remain. The only checkout write is this report.

VERDICT: FAIL
