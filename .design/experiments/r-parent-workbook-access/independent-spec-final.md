# Final independent answer-layout recheck

VERDICT: APPROVE f0e2129cb8624c59b9502e39dfdc03954c90a41a

S1 is fixed in this bounded recheck. No new Spec or narrow Standards defect was reproduced. This verdict gives no merge or release approval. The controller must finish its exact-candidate full gate separately.

## Source and authority

Computer: Savars-MacBook-Pro-5.local. Source: /Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-bda8c699. Physical source: /Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-bda8c699. Verified branch: site/parent-workbook-access. Exact candidate: f0e2129cb8624c59b9502e39dfdc03954c90a41a. Rejected repair: 25b1d4a761cae092ba57c6818504e901594d8536. Original candidate: bf1a18ceccc5290630e6a87aafc04bd2a14cca1d. Integrated main: de9404ee545517387a241d79f19f1d70ab1e3201.

Initial and final machine, branch, HEAD and clean source checks passed. The controlling billing checkout was not the source. I used rg to find HANDOFF_PARENT_WORKBOOK_LAYOUT_RECHECK at line 1 of answer-layout-final-recheck-brief.md. I read that brief, the three required prior review reports, answer-order-repair.md, source instructions, the relevant product rules and the source evidence directory's root-verification.md. I used the Unica evidence-review procedure within the brief's limits. I started no workers.

Before checks, I stated these failure conditions: wrong source or dirty source; valid answers under the wrong printed parts; lost null positions or accepted alternatives; unsafe layout guesses; changed print implementation; or a focused test failure.

Accepted product authority remains: no parent full workbook PDF; whole stored answer key after confirmed delivery; no marking prerequisite; ordinary family, child and book checks. Later chat-only dashboard work is separate.

## Spec S1

The separate probe uses checkQuestionPackage, JSON round-trip, storedQuestion, workbookTemplate().page, regionNames and workbookAnswerPages. Actual template answer markers define expected order. New fixtures use different sequence, ordering and long-text values from the new candidate tests. The matrix covers U1 and U16 with both consistentLayout values. All fixture packages pass the real stored reader as found. Parent-led not-checked packages are supported stored items with fixed answers.

All three remaining counterexamples now pass in an exact repeat of the previous rejection probe:

| Counterexample | Actual template and final key |
| --- | --- |
| Sequence in stored word-problems context | 31, 27 |
| Ordering in stored word-problems context | 9, 2, 4 |
| Long text stored before an inline number | 10, ten red counters |

All 12 previous probe controls pass. They also preserve the original legacy Mixed set, sequence and ordering controls, the generic-layout override, accepted forms, version 1, short text and the null part before a known answer. These controls require no new print revision or measurements.

The larger independent matrix confirms that exactly 8 text characters remain inline and 9 move after the inline number. Separate boundary controls cover 1, 7 and 10 characters. Likelihood choices move after inline numbers. Word problems keep direct stored order. Warm-up omits full-width answers that it does not print. Math in the world with multiple boxes keeps direct box order. Solve it two ways keeps only printed boxes. Null answers retain their part positions. Version 1 and reordered Mixed set retain the accepted 850/2 alternative.

Challenge passes with both inline-before-full and full-before-inline groups. Multi-region groups and touching group boundaries pass. Missing positions, partial positions, null boxes, wrong ids, wrong kinds, overlap and interleaving return unavailable with zero answers. These same controls pass for unknown legacy layouts. The dedicated position matrix has 36 cases: eight successful orders and 28 safe refusals. The larger slot matrix includes more positive Challenge cases.

The positions are synthetic stored inputs whose order follows real template HTML. No stored book was measured or rendered. This proves group selection from saved positions, not real pixel geometry.

The unavailable state limits the whole-key requirement for ambiguous legacy questions. A readable package alone does not identify which historical layout printed. Under the brief's explicit rule, refusal is acceptable when position evidence cannot establish order. The key keeps the question with its existing unavailable message. It does not invent part numbers. This is not proof that every customer legacy key is complete. Ordinary legacy single-row and explicit sequence, ordering and Mixed set controls remain readable without a print revision. No new finding is reported for the stated ambiguity limit.

## Narrow Standards

No separate Standards defect was reproduced. The repair remains a pure local projection through existing package and stored-data interfaces. It adds no decoder, model, database, clock, marking, generation or signing dependency. It changes no stored answer and creates no print contract. Tests use public interfaces.

The repair diff from 25b1d4a7 contains exactly three files: parent-workbook-answers.ts, its test file and answer-order-repair.md. Delivery checks, family checks, PDF denial, policies, model settings and release switches are unchanged by this repair. The outer reader still checks ownership and delivery before content and checks delivery again after content. The projection checks workbook/page/question identity. No heuristic concern is reported as a defect.

Git blob comparisons found zero changes against integrated main in all 17 generator, template, renderer and print-contract files, including tests. A separate set of nine implementation files also matched, including both print engines. These sets overlap. Their counts must not be added. This is source equality evidence, not runtime printing evidence.

## Independent checks and distinct counts

1. Focused Vitest: two files passed, 42 tests passed, zero failures, exit 0. This includes the candidate's 19 template/key layout cases.

```sh
./node_modules/.bin/vitest run --maxWorkers=1 --no-cache src/lib/parent-workbook-answers.test.ts src/lib/parent-workbook-answers-server.test.ts
```

2. Expanded independent probe: 215 distinct fixture configurations passed, zero failed, exit 0. The same completed set contains 53 checked and 162 not-checked packages. It contains 187 positive key results and 28 expected unavailable results. The final completed repeat confirmed these counts immediately before the report.

| Slot | Count |
| --- | ---: |
| on-your-own | 36 |
| word-problems | 28 |
| warm-up | 28 |
| math-in-the-world | 28 |
| solve-it-two-ways | 29 |
| challenge | 64 |
| mixed-set | 2 |
| Total | 215 |

3. Prior-projection control: the same 215 configurations ran with only parent-workbook-answers.ts loaded from git show at 25b1d4a7 in memory. The old projection matched 114 and failed 101. It reproduced both word-problems failures and the long-text failure. It produced no safe refusals. The control asserted that failures exist and exited 0. These are repeated controls, not another 215 distinct cases.

4. Exact previous-rejection replay: 12 passed, zero failed, exit 0. This independently closes all three remaining reported counterexamples. Its purpose overlaps with the expanded matrix. Do not add these counts as independent coverage.

5. Source equality: 17 print-related files including tests matched main. Nine implementation files including print engines also matched. Zero mismatches.

Four initial probe attempts stopped at setup preconditions. I corrected an assertion that treated parent-led not-checked status as failure. I removed a repeated accepted answer, blank text and an invalid two-box tick-and-number fixture. The real checker rejected those invalid packages. They are not product findings or completed passing runs. One report-replay wrapper also failed on string quoting before product code ran. I corrected and successfully ran the exact wrapper recorded below.

## Proof limits and cleanup

Package and stored-reader proof covers synthetic accepted packages, teaching context and saved positions. It is not a customer-book audit.

Template proof covers actual HTML marker order. It does not cover Chromium, physical print, font geometry or real saved pixel positions.

Answer reader and session-source proof comes from local public-interface tests. It does not repeat hosted Auth, delivery SQL, RLS, Storage signing or browser access.

The root's earlier hosted role, PostgREST, Storage and real browser results in .design/experiments/r-parent-workbook-access/root-verification.md remain supplied evidence. I did not repeat them. Historical pending-gate statements in that record are not current verification. The brief supplies 38 focused passes on the final source and a full-suite/lint/build pass on the older rejected repair. Neither older result proves the final-candidate full gate. I did not independently establish the controller's final full-suite, lint or build result.

No full suite, lint, build, Chromium, browser, hosted service, provider, paid call, install, email, Stripe action, commit, push or PR comment ran in this review. No repository, source, test, generated type, package, environment or Git file changed. All owned test and probe processes exited. No background process was started. The temporary probe is removed after this report records it. Persistent review writes are this report and the required external brief marker change.

## Matrix replay

Run from the exact frozen checkout. This compiles only in memory. It writes no source or generated file. Exit 0 requires all 215 final-candidate controls to pass.

```sh
node <<'NODE'
const esbuild=require('esbuild'),Module=require('module');
const code="import assert from 'node:assert/strict';\nimport { sampleWorkbook } from '@/lib/workbook-sample';\nimport { sampleBook } from '@/lib/workbook-sample-book';\nimport { checkQuestionPackage, valueText } from '@/lib/question-package';\nimport { storedQuestion } from '@/lib/workbook-content';\nimport { workbookAnswerPages } from '@/lib/parent-workbook-answers';\nimport { workbookTemplate } from '@/lib/workbook-template';\nimport { regionNames } from '@/lib/workbook-render';\nconst B='33333333-3333-4333-8333-333333333333', C='22222222-2222-4222-8222-222222222222', P='11111111-1111-4111-8111-111111111111';\nconst base=sampleWorkbook({workbookId:B,childId:C,parentId:P,qrTokens:['sample-token-00000001','sample-token-00000002','sample-token-00000003']}).pages[1].questions[0].package;\nconst num=(value)=>({type:'number',value});\nconst box=(id,value)=>({id,kind:'box',label:null,answer:value===null?null:typeof value==='number'?num(value):{type:'text',value}});\nconst hand=(regions)=>({format:'hands-on',scorable:false,parentChecked:true,regions,checks:[],error:null});\nconst seq={format:'boxes',scorable:true,parentChecked:false,regions:[box('end',46),box('start',42)],checks:[{kind:'sequence',terms:[num(38),num(40),{region:'start'},num(44),{region:'end'}],step:num(2)}],error:null};\nconst order={format:'boxes',scorable:true,parentChecked:false,regions:[box('middle',5),box('last',11),box('first',3)],checks:[{kind:'order',numbers:[num(11),num(3),num(5)],direction:'up',regions:['first','middle','last']}],error:null};\nconst mixed={format:'tick-and-number',scorable:true,parentChecked:false,regions:[box('answer',425),{id:'sign',kind:'choice',label:null,mark:'tick',choices:['+','\u2212','\u00d7','\u00f7'],answer:'+'}],checks:[{kind:'operation',region:'answer'},{kind:'operation-sign',region:'sign'}],error:null};\nconst likelihood={format:'tick-and-number',scorable:false,parentChecked:true,regions:[{id:'chance',kind:'choice',label:null,mark:'tick',choices:['never','sometimes','always'],answer:'sometimes'},box('amount',12)],checks:[],error:null};\nconst shapes=[['sequence',seq],['ordering',order],['long-text',hand([box('words','six blue counters'),box('n',12)])],['likelihood',likelihood],['null-first',hand([box('empty',null),box('n',12)])],['text-8',hand([box('words','12345678'),box('n',12)])],['text-9',hand([box('words','123456789'),box('n',12)])]];\nconst rows=[];\nfunction run(name,item,slot,options={}) {\n const draft=sampleBook({level:options.level??'U16',workbookId:B,childId:C,child:'Test'}).draft;\n const day=draft.pages.find(p=>p.content?.kind==='day'); assert(day);\n const pkg={...base,ref:{source:'workbook',workbookId:B,page:day.number,question:1}};\n if(options.v1) delete pkg.item; else pkg.item=item;\n if(!options.v1 && !item.checks.some(c=>c.kind==='operation')) Object.assign(pkg,{operation:null,answer:null,steps:[],wrongAnswers:[],easierExample:null});\n if(options.accepted) pkg.answer={...pkg.answer,accepted:[{type:'fraction',numerator:850,denominator:2}]};\n const check=checkQuestionPackage(pkg,options.v1?1:2); assert(['checked','not-checked'].includes(check.status),JSON.stringify({name,check}));\n const q={number:1,package:pkg};\n const html=workbookTemplate().page({...day,questions:[q],content:{...day.content,consistentLayout:options.consistent??true,blocks:[{slot,items:[1]}]}},{qr:'',qrUrl:''},draft); assert.equal(typeof html,'string');\n const printed=regionNames(q).filter(x=>['box','choice'].includes(x.region.kind)).map(x=>({...x,at:html.indexOf('data-measure=\"'+x.name+'\"')})).filter(x=>x.at>=0).sort((a,b)=>a.at-b.at);\n const expected=printed.flatMap((x,i)=>x.region.answer===null?[]:[{part:i+1,value:typeof x.region.answer==='string'?x.region.answer:valueText(x.region.answer)}]);\n let positions=printed.map((x,i)=>({id:x.region.id,kind:x.region.kind,box:{x:10,y:10+i*30,width:40,height:20}}));\n if(options.position==='missing') positions=undefined;\n if(options.position==='partial') positions=positions.slice(0,1);\n if(options.position==='null-box') positions[0].box=null;\n if(options.position==='wrong-id') positions[0].id='another';\n if(options.position==='wrong-kind') positions[0].kind='lines';\n if(options.position==='overlap') positions.forEach(x=>x.box.y=10);\n if(options.position==='touching') positions.forEach((x,i)=>x.box.y=10+i*20);\n if(options.position==='interleaved') {positions[0].box.y=10;positions[1].box.y=70;positions[2].box.y=40;}\n const teaching=options.legacy?undefined:{version:1,curriculum:{key:'bc',version:'review'},practiceType:slot,part:'practice',slot:'practice.1',extra:false,track:null,plannedStep:null,itemStep:null,reviewSteps:[],eligibility:{format:item.format,scorable:item.scorable,parentChecked:item.parentChecked,mastery:false,reason:'no-item-step'}};\n const raw={number:1,box:{x:0,y:0,width:200,height:200},schemaVersion:options.v1?1:2,package:JSON.parse(JSON.stringify(pkg)),teaching,regions:options.saved?positions:undefined};\n const stored=storedQuestion(JSON.parse(JSON.stringify(raw)),pkg.ref,{width:200,height:200}); assert.equal(stored.content.status,'found',name);\n if(teaching) assert.equal(stored.teaching?.practiceType,slot,name);\n const actual=workbookAnswerPages({id:B,pages:[{number:day.number,dayLabel:'Day 1',questions:[stored]}]})[0].questions[0];\n const wanted=options.refuse?actual.kind==='unavailable' && actual.answers.length===0:JSON.stringify(actual.answers.map(({part,value})=>({part,value})))===JSON.stringify(expected) && actual.kind!=='unavailable';\n if(options.accepted) assert.deepEqual(actual.answers.find(x=>x.value==='425')?.alternatives,['850/2']);\n if(name.includes('null') && !options.refuse) assert.equal(actual.hasOpenWork,true);\n rows.push({name,slot,level:options.level??'U16',consistent:options.consistent??true,check:check.status,refused:actual.kind==='unavailable',passed:wanted,...(!wanted?{expected,actual}:{})});\n}\nfor(const level of ['U1','U16']) for(const consistent of [false,true]) for(const slot of ['on-your-own','word-problems','warm-up','math-in-the-world','solve-it-two-ways','challenge']) for(const [shape,item] of shapes) run(`${shape}/${level}/${consistent}/${slot}`,item,slot,{level,consistent,saved:slot==='challenge'});\nfor(const [shape,item,slot] of [['mixed',mixed,'mixed-set'],['sequence',seq,'on-your-own'],['ordering',order,'on-your-own']]) run(`legacy-${shape}`,item,slot,{legacy:true});\nrun('legacy-v1',mixed,'on-your-own',{legacy:true,v1:true,accepted:true});\nrun('mixed-accepted',mixed,'mixed-set',{accepted:true});\nfor(const consistent of [false,true]) for(const legacy of [false,true]) {\n const item=hand([box('long1','long answer here'),box('n1',12),box('n2',13),box('long2','second long answer')]);\n for(const position of ['valid','missing','partial','null-box','wrong-id','wrong-kind','overlap','touching','interleaved']) run(`groups/${consistent}/${legacy}/${position}`,item,'challenge',{consistent,legacy,saved:true,position,refuse:!['valid','touching'].includes(position)});\n}\nfor(const n of [1,7,8,9,10]) run(`boundary-${n}`,hand([box('words','a'.repeat(n)||' '),box('n',12)]),'on-your-own');\nrun('two-ways-omits-choice',likelihood,'solve-it-two-ways');\nconst distribution=(field)=>Object.fromEntries([...new Set(rows.map(r=>r[field]))].map(k=>[k,rows.filter(r=>r[field]===k).length]));\nconsole.log(JSON.stringify({count:rows.length,pass:rows.filter(r=>r.passed).length,fail:rows.filter(r=>!r.passed).length,bySlot:distribution('slot'),byCheck:distribution('check'),refused:rows.filter(r=>r.refused).length,failures:rows.filter(r=>!r.passed)},null,2));\nassert(rows.every(r=>r.passed),'Independent template/key mismatch');\n";
esbuild.build({stdin:{contents:code,resolveDir:process.cwd(),sourcefile:'independent-layout-review.ts',loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',packages:'external',logLevel:'silent'}).then(r=>{const m=new Module(process.cwd()+'/independent-layout-review.cjs',module);m.filename=process.cwd()+'/independent-layout-review.cjs';m.paths=module.paths;m._compile(r.outputFiles[0].text,m.filename);}).catch(e=>{console.error(e);process.exitCode=1;});
NODE
```

VERDICT: APPROVE f0e2129cb8624c59b9502e39dfdc03954c90a41a
