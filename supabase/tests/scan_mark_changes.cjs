// Synthetic S5 public PATCH -> actual service action/store -> production SQL, on a disposable socket only.
// Auth, PostgREST transport and profile/event store transport are local seams. No network or credentials.
const { Pool } = require('pg');
const { readFileSync } = require('node:fs');
const { randomUUID, createHash } = require('node:crypto');
const { build } = require('esbuild');
const { Module } = require('node:module');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const assert = require('node:assert/strict');
const socket=process.env.SCAN_MARKING_SOCKET;
if(!socket?.startsWith('/tmp/pd457-pg-s5-'))throw Error('Dedicated S5 local Unix socket required');
const database=process.env.SCAN_MARKING_DATABASE??'postgres';
if(database!=='postgres'&&!database.startsWith('pd457_'))throw Error('Disposable database required');
const config={host:socket,database,user:process.env.USER};
const pool=new Pool(config),root=path.resolve(__dirname,'../..');
const call=async(action,f,token=null,data={},client=pool)=>(await client.query('select scan_marking_command($1,$2,$3,$4,$5) v',[action,f?.p??null,f?.photo??null,token,data])).rows[0].v;
const rows=f=>call('effective',{p:f.p},null,{child:f.c});
let identity, failPublication=false, failProfile=false, failSkillsRead=false, failSkillsWrite=false;
const eventFromRow=r=>({id:r.id,key:r.idempotency_key,parentId:r.parent_id,childId:r.child_id,source:r.source,question:{source:'workbook',workbookId:r.workbook_id,page:r.workbook_page,question:r.workbook_question},skill:{standard:r.skill_standard,skills:r.skills},result:r.result,stuckStep:r.stuck_step,mistake:r.mistake,hints:r.hints,timeMs:r.time_ms,occurredAt:r.occurred_at.toISOString(),evidence:{kind:r.evidence_kind,id:r.evidence_id}});
const db={
 async rpc(name,args){if(name==='recover_scan_marking')return {data:(await pool.query('select recover_scan_marking($1) v',[args.p_limit])).rows[0].v,error:null};assert.equal(name,'scan_marking_command');try{return {data:await call(args.p_action,{p:args.p_parent,photo:args.p_photo},args.p_token,args.p_data),error:null};}catch(e){return {data:null,error:{message:e.message,code:e.code}};}},
 from(table){assert.equal(table,'scan_photos');const where={};const q={select(){return q;},eq(k,v){where[k]=v;return q;},in(k,v){where[k]=v;return q;},async then(resolve,reject){return pool.query('select * from scan_photos where id=any($1) and parent_id=$2',[where.id,where.parent_id]).then(r=>resolve({data:r.rows,error:null}),reject);},async maybeSingle(){const r=await pool.query('select * from scan_photos where id=$1 and parent_id=$2',[where.id,where.parent_id]);return {data:r.rows[0]??null,error:null};},single(){return q.maybeSingle();}};return q;}
};
const eventStore={
 async insert(e){if(failPublication)throw Error('synthetic_publication_failure');
  const r=await pool.query(`insert into learning_events(idempotency_key,parent_id,child_id,source,question_source,workbook_id,workbook_page,workbook_question,skill_standard,skills,result,stuck_step,mistake,hints,time_ms,occurred_at,evidence_kind,evidence_id)
   values($1,$2,$3,'marking','workbook',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'scan',$15) on conflict(idempotency_key) do nothing returning *`,[e.key,e.parentId,e.childId,e.question.workbookId,e.question.page,e.question.question,e.skill.standard,e.skill.skills,e.result,e.stuckStep,e.mistake,e.hints,e.timeMs,e.occurredAt,e.evidence.id]);
  const row=r.rows[0]??(await pool.query('select * from learning_events where idempotency_key=$1',[e.key])).rows[0];return {created:!!r.rowCount,event:eventFromRow(row)};
 },
 async range(child){return (await pool.query('select * from learning_events where child_id=$1 order by occurred_at,id',[child])).rows.map(eventFromRow);}
};
// Public profile rebuild stays real. Only its documented persistence seam uses the synthetic SQL fixture.
function profileStore(){return {
 async current(child){const r=(await pool.query('select * from child_profiles where child_id=$1',[child])).rows[0];return r?{revision:r.revision,buildToken:r.build_token,builtAt:r.built_at.toISOString(),schemaVersion:r.schema_version,profile:r.profile}:null;},
 async inputs(child){const r=(await pool.query('select parent_id from children where id=$1',[child])).rows[0];return r?{parentId:r.parent_id,grade:2,learning:null,assessment:null}:null;},
 async marks(child){const p=(await pool.query('select parent_id from children where id=$1',[child])).rows[0].parent_id;
  for(let n=0;n<3;n++){const revision=await call('revision',{p},null,{child});const items=await global.__pd458.store(db).effective(p,child);if(revision===await call('revision',{p},null,{child}))return {revision,items};}throw Error('unstable');},
 async skillInputs(child){if(failSkillsRead)throw Error('synthetic_skill_read_failure');return {tests:[],workbookStandards:['2.4'],history:(await pool.query('select standard,state from skill_state_history where child_id=$1 order by id',[child])).rows};},
 async save(p,expected){if(failProfile)throw Error('synthetic_profile_failure');if(failSkillsWrite&&p.skillChanges?.rows.length)throw Error('synthetic_skill_write_failure');const r=(await pool.query('select save_marked_child_profile($1,$2,$3,null,$4,2::smallint,$5,$6,$7) v',[p.childId,p.parentId,p.markingRevision,expected?.buildToken??null,p.profile,JSON.stringify({pending:p.skillStatesPending??false,rows:(p.skillChanges?.rows??[]).map(c=>({standard:c.standard,state:c.state,reason:c.reason,evidence:c.evidence,evidence_at:c.evidenceAt}))}),p.skillChanges?.tests??[]])).rows[0].v;
 return r?{revision:r.revision,buildToken:r.build_token}:'changed';}
};}
async function loadRoutes(){
 const compiled=await build({entryPoints:[path.join(root,'src/app/api/account/scans/[id]/marking/route.ts')],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'synthetic-seams',setup(b){
  if(process.argv.includes('--old-code'))b.onLoad({filter:/\.(ts|tsx)$/},args=>{const rel=path.relative(root,args.path);if(rel==='src/app/api/account/scans/[id]/marking/route.ts')return {contents:execFileSync('git',['show','f3133376535b3c96f4c81f62f1f8d1cc80322a23:'+rel],{cwd:root,encoding:'utf8'}),loader:'ts'};});
  b.onLoad({filter:/scan-photo-server\.ts$/},()=>({contents:`export const scanSession=async()=>global.__pd458.session();export const scanJson=(v,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});`,loader:'ts'}));
  b.onLoad({filter:/scan-pages-access\.ts$/},()=>({contents:`export const markedFamily=async(parent)=>global.__pd458.allowed(parent);`,loader:'ts'}));
  b.onLoad({filter:/child-profile-store\.ts$/},()=>({contents:`export const childProfileStore=()=>global.__pd458.profiles();`,loader:'ts'}));
  b.onLoad({filter:/learning-events-store\.ts$/},()=>({contents:`export const learningEventStore=()=>global.__pd458.events;`,loader:'ts'}));
  b.onLoad({filter:/scan-marking-ai\.ts$/},()=>({contents:`export const markingAiClient=()=>()=>{throw Error('NO_AI_ALLOWED')};`,loader:'ts'}));
  b.onLoad({filter:/scan-marking-server\.ts$/},args=>({contents:readFileSync(args.path,'utf8')+`\nglobal.__pd458.recover=recoverScanMarking;`,loader:'ts'}));
  b.onLoad({filter:/scan-marking-store\.ts$/},async args=>({contents:readFileSync(args.path,'utf8')+`\nglobal.__pd458.store=scanMarkingStore;global.__pd458.history=scanMarkChanges;global.__pd458.command=markingCommand;`,loader:'ts'}));
  b.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'synthetic'}));b.onLoad({filter:/.*/,namespace:'synthetic'},()=>({contents:'',loader:'js'}));
 }}]});
 const m=new Module(path.join(root,'supabase/tests/.pd458-bundle.cjs'),module);m.filename=path.join(root,'supabase/tests/.pd458-bundle.cjs');m.paths=module.paths;m._compile(compiled.outputFiles[0].text,m.filename);return m.exports;
}
async function fixture(result='wrong',method='code',eligible=true,item=null,written='56'){
 const p=randomUUID(),c=randomUUID(),w=randomUUID(),page=randomUUID(),photo=randomUUID(),token=randomUUID();
 await pool.query('insert into auth.users values($1)',[p]);await pool.query('insert into parents values($1,null)',[p]);await pool.query('insert into children values($1,$2)',[c,p]);
 await pool.query("insert into workbooks(id,parent_id,child_id,status,printed_revision) values($1,$2,$3,'shipped','immutable')",[w,p,c]);
 await pool.query("insert into workbook_pages(id,workbook_id,parent_id,page_number,print_contract,image_width,image_height) values($1,$2,$3,3,'{}',1000,1400)",[page,w,p]);
 await pool.query(`insert into workbook_questions(parent_id,workbook_id,page_id,question_number,package) values($1,$2,$3,1,$4)`,[p,w,page,{id:'item1',skill:{standard:'2.4',skills:[]},...(item?{item}: {})}]);
 await pool.query("insert into scan_photos(id,parent_id,child_id,page_id,workbook_id,printed_revision,state,reserved_bytes,width,height,sent_at) values($1,$2,$3,$4,$5,'immutable','saved',0,1000,1400,now())",[photo,p,c,page,w]);
 await pool.query(`insert into scan_calibrations(photo_id,parent_id,printed_revision,state,lease_token,lease_until,result) values($1,$2,'immutable','ready',$3,now(),'{"parts":["straight"],"sheetCheck":1}')`,[photo,p,randomUUID()]);
 const expected={identity:{workbookId:w,printedRevision:'immutable',pageId:page,itemId:'item1'},number:1,method,scoredRegions:['a'],mastery:{eligible,reason:eligible?null:method==='unscored'?'not-scorable':'try-first'},teaching:{curriculum:{key:'bc',version:'v1'},part:'practice',slot:'1',practiceType:eligible?'now-you':'try-first',itemStep:{unit:'U1',skill:'add',step:1}}};
 const observation={version:1,identity:expected.identity,evidence:{photoRevision:photo},readAnswerText:null,regions:[],certainty:'not-read',state:method==='unscored'?'unscored':method==='parent'?'parent-pending':'pending',method,result:null,teaching:expected.teaching,mastery:expected.mastery,help:'none',actor:'system',resultVersion:1};
 const f={p,c,w,page,photo,token,expected,observation};
 assert.equal(typeof await call('claim',f,token,{hash:'fixed',items:[{expected,observation}]}),'object');
 if(result!==null&&method==='code'){
  const text=result==='blank'?'':written,o={...observation,state:'scored',result,readAnswerText:text,certainty:'certain',regions:[{regionId:'a',text,value:result==='blank'?null:written,certainty:'certain'}]};
  assert.equal(await call('extract',f,token,{observations:[o],model:'synthetic-reader',prompt:'synthetic-v1'}),true);
  const e={key:`marking:${createHash('sha256').update(`${w}:immutable:${page}:item1`).digest('hex')}`,parentId:p,childId:c,source:'marking',question:{source:'workbook',workbookId:w,page:3,question:1},skill:{standard:'2.4',skills:[]},result,stuckStep:result==='wrong'?'tens':null,mistake:result==='wrong'?'O3':null,hints:0,timeMs:null,occurredAt:new Date().toISOString(),evidence:{kind:'scan',id:photo}};
  assert.equal(await call('apply',f,token,{events:[e],at:e.occurredAt}),true);
 }
 identity=f;return f;
}
async function terminate(f,kind){if(kind==='deleted')await pool.query("select change_scan_photo($1,$2,'delete')",[f.p,f.photo]);if(kind==='expired')await pool.query("update scan_photos set expires_at=clock_timestamp()-interval '1 second' where id=$1",[f.photo]);}
const state=async f=>(await rows(f))[0];
const choice=async(f,result,version)=>({itemId:'item1',version:version??(await state(f)).result_version,result});
let api,passed=0,failures=0;
async function patch(f,data){identity=f;return api.PATCH(new Request(`https://synthetic.invalid/api/account/scans/${f.photo}/marking`,{method:'PATCH',headers:{origin:'https://synthetic.invalid'},body:JSON.stringify(data)}),{params:Promise.resolve({id:f.photo})});}
async function test(name,fn){try{await fn();passed++;console.log('PASS',name);}catch(e){failures++;console.error('FAIL',name,e.stack);}}
(async()=>{
 global.__pd458={session:()=>({admin:db,parent:identity.p,active:async()=>true}),allowed:p=>p===identity.p,profiles:profileStore,events:eventStore};
 process.env.SCAN_MARKING_ENABLED='test-only';api=await loadRoutes();
 if(process.argv.includes('--old-code')){assert.equal(typeof api.PATCH,'function','Old public route has no explicit current-version parent correction action');throw Error('Old candidate unexpectedly passed');}
 if(!process.argv.includes('--old-candidate')&&!process.argv.includes('--installed')){
  const before=(await pool.query("select prosrc from pg_proc where oid='public.scan_marking_command(text,uuid,uuid,uuid,jsonb)'::regprocedure")).rows[0].prosrc;
  const send=(await pool.query("select prosrc from pg_proc where proname='send_scan_photos'")).rows;
  await pool.query(readFileSync(path.join(root,'supabase/migrations/20261106_scan_mark_changes.sql'),'utf8'));
  assert.equal((await pool.query("select prosrc from pg_proc where oid='public.scan_marking_automatic_command(text,uuid,uuid,uuid,jsonb)'::regprocedure")).rows[0].prosrc,before);
  assert.deepEqual((await pool.query("select prosrc from pg_proc where proname='send_scan_photos'")).rows,send);
  console.log('CONTROL automatic command body and Send body remain identical');
 }
 if(process.argv.includes('--old-candidate')){const f=await fixture('wrong');const r=await patch(f,await choice(f,'blank'));assert.equal(r.status,200,'Old candidate must fail the new public correction contract');}
 for(const life of ['active','deleted','expired'])for(const [from,to] of [['right','blank'],['wrong','blank'],['blank','right'],['blank','wrong'],['right','wrong'],['wrong','right']])await test(`${life} public PATCH ${from} -> ${to} preserves original reading and one attempt`,async()=>{
  const f=await fixture(from),before=await state(f);await terminate(f,life);const r=await patch(f,await choice(f,to));assert.equal(r.status,200);const view=await r.json();assert.equal(view.status,'saved');assert.equal(view.recoveryPending,false);assert.equal(view.result.items[0].result,to);assert.equal(view.result.items[0].actor,'parent');assert.equal(view.result.completion.status,'complete');assert.equal(view.result.photoAvailable,life==='active');
  const after=await state(f);assert.equal(after.observation.readAnswerText,before.observation.readAnswerText);assert.deepEqual(after.observation.regions,before.observation.regions);assert.deepEqual(after.original_event,before.original_event);assert.equal(after.result_version,before.result_version+1);
  const h=await call('changes',f);assert.equal(h.length,1);assert.equal(h[0].actor,'parent');assert(h[0].changed_at);assert.deepEqual(h[0].previous.observation,before.observation);assert.equal(h[0].previous.model,'synthetic-reader');assert.equal(h[0].current.result,to);
  const events=(await pool.query('select * from learning_events where child_id=$1',[f.c])).rows;assert.equal(events.length,1);assert.equal(events[0].result,from);
  const profile=(await pool.query('select profile from child_profiles where child_id=$1',[f.c])).rows[0].profile;assert.equal(profile.events.counted,1);const standard=profile.standards.find(s=>s.code==='2.4');assert.equal(standard.events[to],1);assert.deepEqual(standard.events.mistakes,[]);assert.equal(standard.events.stuckSteps.length,0);
 });
 await test('parent can revise a prior choice; stale retry returns current state with no extra history',async()=>{
  const f=await fixture();const a=await choice(f,'right');assert.equal((await patch(f,a)).status,200);const frozen=(await pool.query('select profile from child_profiles where child_id=$1',[f.c])).rows[0].profile;
  assert.equal((await patch(f,await choice(f,'blank'))).status,200);const conflict=await patch(f,a);assert.equal(conflict.status,409);assert.equal((await conflict.json()).result.items[0].result,'blank');assert.equal((await call('changes',f)).length,2);assert.equal(frozen.standards.find(s=>s.code==='2.4').events.right,1);
 });
 await test('two devices concurrently change the same version: exactly one save, one conflict, one original',async()=>{
  const f=await fixture();const a=await choice(f,'right'),b={...a,result:'blank'};const responses=await Promise.all([patch(f,a),patch(f,b)]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert.equal((await call('changes',f)).length,1);assert.equal((await rows(f)).length,1);assert.equal((await pool.query('select count(*)::int n from learning_events where child_id=$1',[f.c])).rows[0].n,1);
 });
 await test('parent check during marking and late extraction/application cannot erase the judgment',async()=>{
  const f=await fixture(null);assert.equal((await patch(f,await choice(f,'wrong'))).status,200);
  const late={...f.observation,state:'scored',result:'right',readAnswerText:'42',certainty:'certain',regions:[{regionId:'a',text:'42',value:'42',certainty:'certain'}]};assert.equal(await call('extract',f,f.token,{observations:[late],model:'late',prompt:'late'}),true);assert.equal(await call('apply',f,f.token,{events:[],at:new Date().toISOString()}),true);assert.equal((await state(f)).observation.result,'wrong');assert.equal((await call('changes',f)).length,1);
 });
 await test('retake with a changed answer cannot replace a finalized parent judgment',async()=>{
  const f=await fixture('wrong');assert.equal((await patch(f,await choice(f,'blank'))).status,200);await call('finish',f,f.token);await terminate(f,'deleted');const before=await state(f),retake={...f,photo:randomUUID(),token:randomUUID()};
  await pool.query("insert into scan_photos(id,parent_id,child_id,page_id,workbook_id,printed_revision,state,reserved_bytes,width,height,sent_at) values($1,$2,$3,$4,$5,'immutable','saved',0,1000,1400,now())",[retake.photo,f.p,f.c,f.page,f.w]);
  await pool.query(`insert into scan_calibrations(photo_id,parent_id,printed_revision,state,lease_token,lease_until,result) values($1,$2,'immutable','ready',$3,now(),'{"parts":["straight"],"sheetCheck":1}')`,[retake.photo,f.p,randomUUID()]);
  await call('claim',retake,retake.token,{hash:'fixed',items:[{expected:f.expected,observation:f.observation}]});
  await call('extract',retake,retake.token,{observations:[{...f.observation,state:'scored',result:'right'}],model:'late',prompt:'late'});assert.equal(await call('apply',retake,retake.token,{events:[],at:new Date().toISOString()}),true);assert.deepEqual(await state(f),before);
  identity=retake;const view=await api.GET(new Request('https://synthetic.invalid'),{params:Promise.resolve({id:retake.photo})});assert.equal(view.status,200);const projected=await view.json();assert.equal(projected.photoAvailable,true);assert.equal(projected.items[0].evidencePhoto,f.photo);assert.equal(projected.items[0].photoAvailable,false);
 });
 for(const method of ['unscored','parent','code'])await test(`${method} observation preserves eligibility and has no default judgment`,async()=>{
  const f=await fixture(null,method,false);assert.equal((await state(f)).observation.result,null);const r=await patch(f,await choice(f,'right'));assert.equal(r.status,method==='unscored'?404:200);assert.equal((await pool.query('select count(*)::int n from learning_events where child_id=$1',[f.c])).rows[0].n,0);
 });
 for(const failure of ['publication','profile'])await test(`${failure} failure saves durable intent, recovers after expiry and does not count twice`,async()=>{
  const f=await fixture('wrong');failPublication=failure==='publication';failProfile=failure==='profile';
  const r=await patch(f,await choice(f,'blank'));assert.equal(r.status,200);assert.equal((await r.json()).recoveryPending,true);failPublication=false;failProfile=false;await terminate(f,'expired');
  await pool.query('update scan_marking_cursor set after_id=null');let seen=false;for(let n=0;n<200;n++){const batch=(await pool.query('select recover_scan_marking(10) v')).rows[0].v;if(batch.some(r=>r.photo===f.photo)){seen=true;break;}if(!batch.length)break;}assert(seen);
  await pool.query('update scan_marking_cursor set after_id=null');let recovered=false;for(let n=0;n<300;n++){await global.__pd458.recover(db,{SCAN_MARKING_ENABLED:'test-only'});const revision=(await pool.query('select revision=profile_revision ok from scan_marking_revisions where child_id=$1',[f.c])).rows[0];if(revision.ok){recovered=true;break;}}assert(recovered);assert.equal((await state(f)).observation.result,'blank');assert.equal((await call('changes',f)).length,1);assert.equal((await pool.query('select count(*)::int n from learning_events where child_id=$1',[f.c])).rows[0].n,1);assert.equal((await pool.query('select revision=profile_revision ok from scan_marking_revisions where child_id=$1',[f.c])).rows[0].ok,true);
 });
 for(const failure of ['read','write'])await test(`skill-history ${failure} failure commits facts and a durable retry together`,async()=>{
  const f=await fixture('wrong');failSkillsRead=failure==='read';failSkillsWrite=failure==='write';
  const response=await patch(f,await choice(f,'right'));assert.equal(response.status,200);assert.equal((await response.json()).recoveryPending,true);failSkillsRead=false;failSkillsWrite=false;
  assert((await pool.query('select profile_revision<revision dirty from scan_marking_revisions where child_id=$1',[f.c])).rows[0].dirty);assert.equal((await pool.query('select profile from child_profiles where child_id=$1',[f.c])).rows[0].profile.events.counted,1);
  await terminate(f,'expired');await pool.query('update scan_marking_cursor set after_id=null');let recovered=false;for(let n=0;n<300;n++){await global.__pd458.recover(db,{SCAN_MARKING_ENABLED:'test-only'});if((await pool.query('select profile_revision=revision ok from scan_marking_revisions where child_id=$1',[f.c])).rows[0].ok){recovered=true;break;}}assert(recovered);assert.equal((await call('changes',f)).length,1);
 });
 await test('a failed canonical result save rolls back its history and revision; retry commits once',async()=>{
  const f=await fixture('wrong'),before=await state(f),revision=await call('revision',f,null,{child:f.c});
  await pool.query(`create function public.fixture_fail_change() returns trigger language plpgsql as $$ begin if new.id::text=tg_argv[0] and new.observation->>'actor'='parent' then raise exception 'synthetic_result_save_failure'; end if; return new; end $$`);
  await pool.query(`create trigger fixture_fail_change before update on public.scan_marking_items for each row execute function public.fixture_fail_change('${before.id}')`);
  try{assert.equal((await patch(f,await choice(f,'blank'))).status,503);assert.deepEqual(await state(f),before);assert.equal((await call('changes',f)).length,0);assert.equal(await call('revision',f,null,{child:f.c}),revision);}finally{await pool.query('drop trigger fixture_fail_change on public.scan_marking_items');await pool.query('drop function public.fixture_fail_change()');}
  assert.equal((await patch(f,await choice(f,'blank'))).status,200);assert.equal((await call('changes',f)).length,1);
 });
 await test('a stale profile or AI findings save cannot replace facts from a parent correction',async()=>{
  const f=await fixture('wrong');assert.equal((await patch(f,await choice(f,'right'))).status,200);const oldRevision=await call('revision',f,null,{child:f.c});
  const frozen=(await pool.query('select profile from child_profiles where child_id=$1',[f.c])).rows[0].profile;assert.equal((await patch(f,await choice(f,'blank'))).status,200);
  const current=(await pool.query('select * from child_profiles where child_id=$1',[f.c])).rows[0];
  const rejected=(await pool.query(`select save_marked_child_profile($1,$2,$3,null,$4,2::smallint,'{"staleAI":true}','[]','{}') v`,[f.c,f.p,oldRevision,current.build_token])).rows[0].v;assert.equal(rejected,null);
  assert.deepEqual((await pool.query('select profile from child_profiles where child_id=$1',[f.c])).rows[0].profile,current.profile);assert.equal(frozen.standards.find(s=>s.code==='2.4').events.right,1);
 });
 await test('paginated history retains more than 100 parent decisions after photo expiry',async()=>{
  const f=await fixture('wrong');await terminate(f,'expired');for(let i=0;i<105;i++)assert.equal((await call('change',f,null,{itemId:'item1',version:i+2,result:i%2?'wrong':'blank'})).status,'saved');
  const command=global.__pd458.command(db),first=await global.__pd458.history(command,f.p,f.photo);assert.equal(first.length,100);const next=await global.__pd458.history(command,f.p,f.photo,first.at(-1).id);assert.equal(next.length,5);assert.equal((await global.__pd458.history(command,f.p,f.photo,next.at(-1).id)).length,0);assert.equal(new Set([...first,...next].map(h=>h.id)).size,105);
 });
 await test('another family and mismatched item/version cannot change a result',async()=>{
  const f=await fixture(),g=await fixture();assert.equal(await call('change',{...f,p:g.p},null,{itemId:'item1',version:2,result:'right'}),'refused');for(const data of [{itemId:'other',version:2,result:'right'},{itemId:'item1',version:null,result:'right'},{itemId:'item1',version:2,result:'guess'}])assert.equal(await call('change',f,null,data),'refused');assert.equal((await call('changes',f)).length,0);
 });
 for(const fence of ['family','child'])await test(`${fence} deletion fence refuses parent change and late automatic application`,async()=>{
  const f=await fixture();if(fence==='family')await pool.query('update parents set deletion_requested_at=now() where id=$1',[f.p]);else await pool.query('insert into child_deletions(child_id,parent_id) values($1,$2)',[f.c,f.p]);
  const before=(await pool.query('select observation from scan_marking_items where page_id=$1',[f.page])).rows[0].observation;
  const r=await patch(f,{itemId:'item1',version:2,result:'blank'});assert([404,503].includes(r.status));assert.deepEqual((await pool.query('select observation from scan_marking_items where page_id=$1',[f.page])).rows[0].observation,before);assert.equal((await pool.query('select count(*)::int n from scan_mark_changes where parent_id=$1',[f.p])).rows[0].n,0);
 });
 await test('append-only history, service-only grants, RLS and family/child cascades',async()=>{
  const f=await fixture();assert.equal((await patch(f,await choice(f,'blank'))).status,200);
  await assert.rejects(()=>pool.query('update scan_mark_changes set actor=actor where parent_id=$1',[f.p]),/mark_change_immutable/);
  for(const role of ['anon','authenticated','service_role']){const c=await pool.connect();try{await c.query('set role '+role);if(role!=='service_role'){await assert.rejects(()=>call('change',f,null,{itemId:'item1',version:3,result:'right'},c),e=>e.code==='42501');await assert.rejects(()=>c.query('select * from scan_mark_changes'),e=>e.code==='42501');}await assert.rejects(()=>c.query("select scan_marking_automatic_command('change',$1,$2,null,'{}')",[f.p,f.photo]),e=>e.code==='42501');await assert.rejects(()=>c.query('delete from scan_mark_changes where parent_id=$1',[f.p]),e=>e.code==='42501');await assert.rejects(()=>c.query('update scan_mark_changes set actor=actor where parent_id=$1',[f.p]),e=>e.code==='42501');}finally{await c.query('reset role');c.release();}}
  const h=await pool.query("select relrowsecurity from pg_class where oid='public.scan_mark_changes'::regclass");assert.equal(h.rows[0].relrowsecurity,true);
  await pool.query('delete from children where id=$1',[f.c]);assert.equal((await pool.query('select count(*)::int n from scan_mark_changes where parent_id=$1',[f.p])).rows[0].n,0);
  const g=await fixture();assert.equal((await patch(g,await choice(g,'right'))).status,200);await pool.query('delete from auth.users where id=$1',[g.p]);assert.equal((await pool.query('select count(*)::int n from scan_mark_changes where parent_id=$1',[g.p])).rows[0].n,0);
 });
 if(process.argv.includes('--scalar-readings'))for(const written of ['1/9','1 1/4','6.1'])await test(`post-expiry parent right/blank/wrong retains the original ${written}`,async()=>{
  const f=await fixture('wrong','code',true,null,written);await terminate(f,'expired');
  for(const result of ['right','blank','wrong']){
   assert.equal((await patch(f,await choice(f,result))).status,200);
   const current=await state(f);assert.equal(current.observation.result,result);assert.equal(current.observation.readAnswerText,written);
   assert.equal(current.observation.regions[0].value,written);
  }
  assert.equal((await call('changes',f)).length,3);
  assert.equal((await pool.query('select count(*)::int n from learning_events where child_id=$1',[f.c])).rows[0].n,1);
 });
 if(process.argv.includes('--method-policy')||process.argv.includes('--method-policy-old'))await test('R2-01 upgrades old two-ways, fences old writers, and rebuilds without changing evidence',async()=>{
  const item={format:'two-ways',scorable:true,parentChecked:false};
  const f=await fixture(null,'code',true,item);
  assert.equal((await patch(f,await choice(f,'right'))).status,200);
  const before=await state(f),history=await call('changes',f),question=(await pool.query('select package,teaching from workbook_questions where page_id=$1',[f.page])).rows[0];
  const revision=await call('revision',f,null,{child:f.c});
  assert.equal(before.expected.mastery.eligible,true);
  assert.equal((await pool.query('select count(*)::int n from learning_events where child_id=$1',[f.c])).rows[0].n,1);
  if(!process.argv.includes('--method-policy-old'))await pool.query(readFileSync(path.join(root,'supabase/migrations/20261106192851_scan_two_ways_review_policy.sql'),'utf8'));
  const corrected=await state(f);
  assert.deepEqual(corrected.expected.mastery,{eligible:false,reason:'parent-checked'});
  assert.equal(corrected.expected.method,'parent');assert.equal(corrected.expected.review,'two-ways');
  assert.deepEqual(corrected.observation,before.observation);assert.deepEqual(corrected.original_event,before.original_event);assert.equal(corrected.event_id,before.event_id);
  assert.deepEqual(await call('changes',f),history);
  assert.deepEqual((await pool.query('select package,teaching from workbook_questions where page_id=$1',[f.page])).rows[0],question);
  assert.equal(await call('revision',f,null,{child:f.c}),revision+1);
  const pending=(await pool.query('select revision,profile_revision from scan_marking_revisions where child_id=$1',[f.c])).rows[0];assert(BigInt(pending.profile_revision)<BigInt(pending.revision));
  const marks=await global.__pd458.store(db).effective(f.p,f.c);assert.equal(marks[0].expected.mastery.eligible,false);
  await terminate(f,'expired');assert.equal((await patch(f,await choice(f,'wrong'))).status,200);
  const profile=(await pool.query('select profile from child_profiles where child_id=$1',[f.c])).rows[0].profile;
  assert.equal(profile.events.counted,0);assert.deepEqual(profile.standards,[]);
  assert.equal((await pool.query('select count(*)::int n from learning_events where child_id=$1',[f.c])).rows[0].n,1);
  assert.equal((await call('changes',f)).length,history.length+1);
  const oldWriter=await fixture(null,'code',true,item);assert.equal((await state(oldWriter)).expected.mastery.eligible,false);
  assert.equal((await patch(oldWriter,await choice(oldWriter,'right'))).status,200);
  assert.equal((await state(oldWriter)).original_event,null);
  const control=await fixture(null);assert.equal((await state(control)).expected.mastery.eligible,true);
  for(const role of ['anon','authenticated','service_role'])assert.equal((await pool.query("select has_function_privilege($1,'public.scan_two_ways_review_policy()','EXECUTE') ok",[role])).rows[0].ok,false);
 });
 console.log(JSON.stringify({passed,failures,proof:'synthetic public PATCH, production action/store/projection/rebuild and SQL; local transport/auth seams only'}));
 await pool.end();process.exitCode=failures?1:0;
})().catch(async e=>{console.error(e);await pool.end();process.exitCode=1;});
