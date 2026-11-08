// Synthetic S1 evidence. Only this script's freshly created, marked test families are mutated.
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import sharp from 'sharp';
import QRCode from 'qrcode';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(x=>/^[A-Z_]+=/.test(x)).map(x=>{const at=x.indexOf('='); return [x.slice(0,at),x.slice(at+1).replace(/^"|"$/g,'')];}));
const url='https://cdjobwsyzndtltzfpyqa.supabase.co';
const pub='sb_publishable_QkL33gGZ-E1gOVdnLJsUEg_RgrRyqUs';
const admin=createClient(url,env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const base='http://localhost:3454';
const fixtureFile='/tmp/scan454-fixture.json';
const evidence='.design/experiments/r454';
mkdirSync(evidence,{recursive:true});
function ok(r){if(r.error) throw new Error(r.error.message);return r.data;}
async function prepare(){
 const fixture={families:[],token:'scan454'+randomUUID().replaceAll('-','')};
 for(const role of ['owner','other','admin']){
  const email=`scan454-${role}-${randomUUID()}@example.test`, password=randomUUID()+'aA!7';
  const user=ok(await admin.auth.admin.createUser({email,password,email_confirm:true})).user;
  const child=randomUUID(), book=randomUUID(), page=randomUUID();
  ok(await admin.from('parents').insert({id:user.id,email,name:'Scan QA',source:{qa:'454'},time_zone:'America/Vancouver'}));
  ok(await admin.from('test_accounts').insert({parent_id:user.id,marked_by:user.id}));
  ok(await admin.from('children').insert({id:child,parent_id:user.id,first_name:'Alex',grade:3,province:'BC'}));
  ok(await admin.from('workbooks').insert({id:book,parent_id:user.id,child_id:child,number:1,levels:[4],status:'draft',approved_at:new Date().toISOString(),printed_at:new Date().toISOString(),shipped_at:new Date().toISOString()}));
  ok(await admin.from('workbook_pages').insert({id:page,parent_id:user.id,workbook_id:book,page_number:3,day_label:'Day 1',page_type:'practice',qr_token:role==='owner'?fixture.token:'scan454'+randomUUID().replaceAll('-','')}));
  ok(await admin.from('workbooks').update({status:'shipped'}).eq('id',book));
  if(role==='admin') ok(await admin.from('admin_users').insert({user_id:user.id,email,name:'Scan QA Admin'}));
  fixture.families.push({role,id:user.id,child,book,page,email,password});
 }
 writeFileSync(fixtureFile,JSON.stringify(fixture),{mode:0o600});
 const qr=await QRCode.toBuffer(`https://unicalearning.com/tutor/p/${fixture.token}`,{width:350,margin:4});
 const svg=Buffer.from('<svg width="1200" height="1600"><rect width="100%" height="100%" fill="white"/><g font-family="sans-serif" fill="#20251f"><text x="90" y="100" font-size="44">Unica Learning</text><text x="90" y="170" font-size="30">Alex · Workbook 1 · Day 1 · Page 3</text><text x="90" y="290" font-size="32">1.  7 + 5 = 12</text><text x="90" y="420" font-size="32">2.  8 + 6 = 14</text><text x="90" y="600" font-size="24">Synthetic QA page. No child data.</text></g></svg>');
 await sharp(svg).composite([{input:qr,left:760,top:1160}]).withMetadata().jpeg({quality:95}).toFile('/tmp/scan454-page.jpg');
 console.log('Prepared three dedicated test families and one synthetic photo.');
}
async function session(f){
 const cookies=new Map();
 const db=createServerClient(url,pub,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:list=>list.forEach(c=>cookies.set(c.name,c.value))}});
 ok(await db.auth.signInWithPassword({email:f.email,password:f.password}));
 return {db,cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')};
}
async function check(){
 const f=JSON.parse(readFileSync(fixtureFile));
 const [owner,other,adm]=await Promise.all(f.families.map(session));
 const a=f.families[0]; const body=readFileSync('/tmp/scan454-page.jpg');
 const request=async(path,options={},who=owner)=>{
  const r=await fetch(base+path,{...options,headers:{Cookie:who?.cookie??'',Origin:base,...options.headers}});
  return {status:r.status,headers:r.headers,body:await r.text()};
 };
 const id=randomUUID();
 assert.equal((await request('/api/account/scans',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,child:a.child,bytes:body.length})})).status,200);
 const uploaded=await request(`/api/account/scans/${id}`,{method:'PUT',body});
 assert.equal(uploaded.status,200,uploaded.body); assert.equal(JSON.parse(uploaded.body).photo.page,3);
 assert.equal((await request(`/api/account/scans/${id}`,{method:'POST'})).status,200);
 f.photo=id; writeFileSync(fixtureFile,JSON.stringify(f),{mode:0o600});
 const path=`${a.id}/${id}/photo.jpg`;
 const result={fixture:'synthetic QR workbook page',photo:id,checks:[]};
 async function storageDenied(label,db){
  const bucket=db.storage.from('scan-photos');
  const download=await bucket.download(path); assert(download.error && !download.data,`${label}: download`);
  const one=await bucket.createSignedUrl(path,60); assert(!one.data?.signedUrl,`${label}: single signed URL`);
  const many=await bucket.createSignedUrls([path],60); assert(!many.data?.some(x=>x.signedUrl),`${label}: batch signed URL`);
  result.checks.push(`${label}: download and single/batch signed URL denied`);
 }
 for(const [label,db] of [['owner',owner.db],['admin',adm.db],['anonymous',createClient(url,pub)]]) await storageDenied(label,db);
 for(const who of [owner,adm]){
  const r=await fetch(base+`/api/account/scans/${id}/image`,{headers:{Cookie:who.cookie}});
  assert.equal(r.status,200); assert.match(r.headers.get('cache-control'),/private, no-store/); assert((await r.arrayBuffer()).byteLength>1000);
 }
 for(const who of [other,null]) assert.notEqual((await request(`/api/account/scans/${id}/image`,{},who)).status,200);
 const ownRows=ok(await owner.db.from('scan_photos').select('id,parent_id').eq('id',id)); assert.equal(ownRows.length,1);
 const foreignRows=ok(await other.db.from('scan_photos').select('id,parent_id').eq('id',id)); assert.equal(foreignRows.length,0);
 assert((await owner.db.rpc('change_scan_photo',{p_parent:a.id,p_id:id,p_action:'delete'})).error);
 result.checks.push('owner table read succeeds; other family reads no row; browser mutation RPC denied; owner/admin image route succeeds; other/anonymous image route denied');
 ok(await admin.rpc('change_scan_photo',{p_parent:a.id,p_id:id,p_action:'delete'}));
 assert(ok(await admin.storage.from('scan-photos').download(path)));
 for(const [label,db] of [['deleted-owner',owner.db],['deleted-admin',adm.db]]) await storageDenied(label,db);
 for(const who of [owner,adm]) assert.equal((await request(`/api/account/scans/${id}/image`,{},who)).status,404);
 result.checks.push('terminal deletion with physical file present: owner/admin image routes denied');
 const late=await admin.storage.from('scan-photos').upload(path.replace('photo.jpg','late.jpg'),body,{contentType:'image/jpeg'}); assert(late.error);
 result.checks.push('late secret-key derivative path refused');
 ok(await admin.storage.from('scan-photos').remove([path])); assert.equal(ok(await admin.rpc('reconcile_scan_cleanup',{p_id:id})),true);
 // Simultaneous requests: family-wide admission and one processing slot, with no object creation.
 const ids=Array.from({length:6},()=>randomUUID());
 const admissions=await Promise.all(ids.map(p_id=>admin.rpc('admit_scan_photo',{p_parent:a.id,p_child:a.child,p_id,p_bytes:1000}).then(ok)));
 assert.equal(admissions.filter(x=>x==='reserved').length,2); assert.equal(admissions.filter(x=>x==='busy').length,4);
 const accepted=ids.filter((_,i)=>admissions[i]==='reserved');
 const starts=await Promise.all(accepted.map(p_id=>admin.rpc('start_scan_photo',{p_parent:a.id,p_id}).then(ok)));
 assert.equal(starts.filter(x=>x==='started').length,1); assert.equal(starts.filter(x=>x==='busy').length,1);
 for(const p_id of accepted){ok(await admin.rpc('change_scan_photo',{p_parent:a.id,p_id,p_action:'reject'}));ok(await admin.rpc('reconcile_scan_cleanup',{p_id}));}
 result.checks.push('six concurrent admissions: two reserved, four busy; two starts: one active, one busy; no objects');
 result.limits=ok(await admin.from('scan_limits').select('*').single());
 writeFileSync(`${evidence}/hosted-security.json`,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({checks:result.checks,limits:result.limits},null,2));
}
async function boundaries(){
 const f=JSON.parse(readFileSync(fixtureFile)); const a=f.families[1];
 const checks=[];
 const admit=async()=>{const id=randomUUID();return {id,state:ok(await admin.rpc('admit_scan_photo',{p_parent:a.id,p_child:a.child,p_id:id,p_bytes:1000}))};};
 const release=async id=>{ok(await admin.rpc('change_scan_photo',{p_parent:a.id,p_id:id,p_action:'reject'}));ok(await admin.rpc('reconcile_scan_cleanup',{p_id:id}));};
 // Fill only this QA family's admission history. Global limits are never changed.
 // D-271: 40 per ten minutes, so 39 before the six simultaneous requests.
 for(let n=0;n<39;n++){const r=await admit();assert.equal(r.state,'reserved');await release(r.id);}
 const last=await Promise.all(Array.from({length:6},admit));
 assert.equal(last.filter(x=>x.state==='reserved').length,1);assert.equal(last.filter(x=>x.state==='frequency').length,5);
 for(const r of last.filter(x=>x.state==='reserved'))await release(r.id);
 checks.push('ten-minute frequency boundary: six simultaneous requests, one accepted and five refused');
 // Move this QA history outside ten minutes but inside one day; add older rejected admissions for the day boundary.
 ok(await admin.from('scan_photos').update({created_at:new Date(Date.now()-3600000).toISOString()}).eq('parent_id',a.id));
 // 40 in the ten minutes moved out, plus 19: photo 60 of the day is the last one admitted.
 const rows=Array.from({length:19},()=>({id:randomUUID(),parent_id:a.id,child_id:a.child,state:'rejected',reserved_bytes:0,created_at:new Date(Date.now()-3600000).toISOString(),terminal_at:new Date().toISOString()}));
 ok(await admin.from('scan_photos').insert(rows));
 const day=await Promise.all(Array.from({length:6},admit));
 assert.equal(day.filter(x=>x.state==='reserved').length,1);assert.equal(day.filter(x=>x.state==='frequency').length,5);
 for(const r of day.filter(x=>x.state==='reserved'))await release(r.id);
 checks.push('daily frequency boundary: six simultaneous requests, one accepted and five refused');
 ok(await admin.from('scan_photos').update({created_at:new Date(Date.now()-2*86400000).toISOString()}).eq('parent_id',a.id));
 const hold=await admit();assert.equal(hold.state,'reserved');
 ok(await admin.from('scan_photos').update({reserved_bytes:2147483648-20971520}).eq('id',hold.id));
 const quota=await Promise.all(Array.from({length:6},admit));
 assert.equal(quota.filter(x=>x.state==='reserved').length,1);assert.equal(quota.filter(x=>x.state==='busy'||x.state==='quota').length,5);
 for(const r of quota.filter(x=>x.state==='reserved'))await release(r.id);
 ok(await admin.from('scan_photos').update({reserved_bytes:2147483648}).eq('id',hold.id));
 const full=await Promise.all(Array.from({length:6},admit));assert(full.every(x=>x.state==='quota'));
 await release(hold.id);
 checks.push('stored-byte accounting: exact final reservation admitted once; full quota refuses all six requests; no objects');
 const input=await Promise.all(Array.from({length:6},()=>admin.rpc('admit_scan_photo',{p_parent:a.id,p_child:a.child,p_id:randomUUID(),p_bytes:20971521}).then(ok)));assert(input.every(x=>x==='size'));
 checks.push('six simultaneous oversized admissions refused');
 const objects=ok(await admin.storage.from('scan-photos').list(a.id));assert.equal(objects.length,0);
 writeFileSync(evidence+'/hosted-boundaries.json',JSON.stringify({checks,proofLimit:'The quota test uses outstanding reservations, not 2 GiB of physical QA files. Default concurrent uploads (2) binds before queued jobs (8).'},null,2)+'\n');
 console.log(JSON.stringify(checks));
}
async function deletion(){
 const f=JSON.parse(readFileSync(fixtureFile)); const a=f.families[0], adm=await session(f.families[2]);
 const rows=ok(await admin.from('scan_photos').select('id').eq('parent_id',a.id).eq('state','saved'));assert(rows.length>0,'Need saved photo for deletion proof');
 const key=JSON.parse(readFileSync('/tmp/scan-worker-key.json')).api_key;
 const worker=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const requested=ok(await adm.db.rpc('request_family_deletion',{p:a.id,confirmation:a.email}));assert.equal(requested,'requested');
 const late=await admin.rpc('admit_scan_photo',{p_parent:a.id,p_child:a.child,p_id:randomUUID(),p_bytes:1000});assert(late.error,'Family write fence');
 const {runFamilyDeletion}=await import('/tmp/scan454-deletion.cjs');
 const result=await runFamilyDeletion(worker,a.id,worker,Date.now()+45000); assert.equal(result.state,'deleted');assert(result.images>=1);
 assert.equal(ok(await worker.storage.from('scan-photos').list(a.id)).length,0);
 assert.equal(ok(await worker.from('scan_photos').select('id').eq('parent_id',a.id)).length,0);
 assert((await worker.auth.admin.getUserById(a.id)).error);
 writeFileSync(evidence+'/hosted-family-deletion.json',JSON.stringify({credential:'Dedicated retention_worker key, retrieved through authenticated Supabase CLI',result,checks:['Family freeze refuses admission','Worker removes actual scan photo before Auth','Scan rows cascade','Auth user absent','Family scan folder empty']},null,2)+'\n');
 console.log(JSON.stringify(result));
}
async function refusals(){
 const f=JSON.parse(readFileSync(fixtureFile)),a=f.families[0], owner=await session(a);
 const checks=[];
 const send=async(bytes,child=a.child)=>{
  const id=randomUUID(),path='/api/account/scans/'+id;
  const call=async(p,method,body,headers={})=>fetch(base+p,{method,body,headers:{Cookie:owner.cookie,Origin:base,...headers}});
  const admit=await call('/api/account/scans','POST',JSON.stringify({id,child,bytes:bytes.length}),{'Content-Type':'application/json'});assert.equal(admit.status,200);
  const response=await call(path,'PUT',bytes);return {id,response,data:await response.json()};
 };
 const unknown=await QRCode.toBuffer('https://unicalearning.com/tutor/p/unknown454Token0000000000',{width:600});
 const r=await send(unknown);assert.equal(r.response.status,422);assert.equal(r.data.error,'page');
 assert.equal(ok(await admin.storage.from('scan-photos').list(a.id+'/'+r.id)).length,0);checks.push('Unknown QR token refused before object creation');
 const otherPage=ok(await admin.from('workbook_pages').select('qr_token').eq('id',f.families[1].page).single());
 const wrong=await send(await QRCode.toBuffer('https://unicalearning.com/tutor/p/'+otherPage.qr_token,{width:600}));assert.equal(wrong.response.status,422);assert.equal(wrong.data.error,'page');checks.push('Other family QR refused before object creation');
 const duplicate=await send(readFileSync('/tmp/scan454-page.jpg'));assert.equal(duplicate.data.error,'duplicate');assert.equal(ok(await admin.storage.from('scan-photos').list(a.id+'/'+duplicate.id)).length,0);checks.push('Duplicate page photo refused with no object');
 const book=randomUUID(),pg=randomUUID(),token='draft454'+randomUUID().replaceAll('-','');
 ok(await admin.from('workbooks').insert({id:book,parent_id:a.id,child_id:a.child,number:2,levels:[4],status:'draft'}));
 ok(await admin.from('workbook_pages').insert({id:pg,parent_id:a.id,workbook_id:book,page_number:1,day_label:'Day 1',page_type:'practice',qr_token:token}));
 const draft=await send(await QRCode.toBuffer('https://unicalearning.com/tutor/p/'+token,{width:600}));assert.equal(draft.data.error,'page');checks.push('Unpublished workbook page refused');
 const wrongChild=await fetch(base+'/api/account/scans',{method:'POST',headers:{Cookie:owner.cookie,Origin:base,'Content-Type':'application/json'},body:JSON.stringify({id:randomUUID(),child:f.families[1].child,bytes:100})});assert.equal(wrongChild.status,429);checks.push('Forged selected child from another family refused at admission');
 const saved=ok(await admin.from('scan_photos').select('id').eq('parent_id',a.id).eq('state','saved'))[0];assert(saved);
 const retry=await fetch(base+'/api/account/scans/'+saved.id,{method:'PUT',body:readFileSync('/tmp/scan454-page.jpg'),headers:{Cookie:owner.cookie,Origin:base}});assert.equal(retry.status,200);assert.equal((await retry.json()).photo.id,saved.id);checks.push('Retry after saved response uses same photo; no duplicate attachment');
 writeFileSync(evidence+'/hosted-refusals.json',JSON.stringify({checks},null,2)+'\n');console.log(JSON.stringify(checks));
}
async function expiry(){
 const f=JSON.parse(readFileSync(fixtureFile)),a=f.families[0],owner=await session(a),adm=await session(f.families[2]);
 const row=ok(await admin.from('scan_photos').select('id').eq('parent_id',a.id).eq('state','saved'))[0];assert(row);
 const path=a.id+'/'+row.id+'/photo.jpg';
 ok(await admin.from('scan_photos').update({expires_at:new Date(Date.now()-1000).toISOString()}).eq('id',row.id));
 for(const who of [owner,adm]){
  assert.equal((await fetch(base+'/api/account/scans/'+row.id+'/image',{headers:{Cookie:who.cookie}})).status,404);
  assert((await who.db.storage.from('scan-photos').download(path)).error);
  assert(!(await who.db.storage.from('scan-photos').createSignedUrl(path,60)).data?.signedUrl);
  assert(!(await who.db.storage.from('scan-photos').createSignedUrls([path],60)).data?.some(x=>x.signedUrl));
 }
 assert(ok(await admin.storage.from('scan-photos').download(path)));
 // All scan rows are this run's synthetic families. Do not run a global maintenance call if another family has rows.
 const all=ok(await admin.from('scan_photos').select('parent_id'));assert(all.every(r=>f.families.some(x=>x.id===r.parent_id)));
 ok(await admin.rpc('expire_scan_photos'));
 assert.equal(ok(await admin.from('scan_photos').select('state').eq('id',row.id).single()).state,'expired');
 const late=await admin.storage.from('scan-photos').upload(path,readFileSync('/tmp/scan454-page.jpg'),{contentType:'image/jpeg',upsert:false});assert(late.error);
 ok(await admin.storage.from('scan-photos').remove([path]));ok(await admin.rpc('reconcile_scan_cleanup',{p_id:row.id}));
 writeFileSync(evidence+'/hosted-expiry.json',JSON.stringify({checks:['Clock expiry denies owner/admin image route while object still exists','Owner/admin direct download and single/batch signed URLs denied at expiry','Scheduled expiry function records terminal state','Late Storage write refused','Physical cleanup reconciles byte accounting'],proofLimit:'No marks or crops exist in S1; their history/expiry contracts require later slices.'},null,2)+'\n');console.log('Five clock-expiry checks passed.');
}
async function seed(){
 const f=JSON.parse(readFileSync(fixtureFile)),a=f.families[0],owner=await session(a),id=randomUUID(),bytes=readFileSync('/tmp/scan454-page.jpg');
 const call=(path,method,body,headers={})=>fetch(base+path,{method,body,headers:{Cookie:owner.cookie,Origin:base,...headers}});
 assert.equal((await call('/api/account/scans','POST',JSON.stringify({id,child:a.child,bytes:bytes.length}),{'Content-Type':'application/json'})).status,200);
 const put=await call('/api/account/scans/'+id,'PUT',bytes);assert.equal(put.status,200,await put.text());
 assert.equal((await call('/api/account/scans/'+id,'POST')).status,200);console.log('Seeded one saved synthetic page.');
}
async function logout(){
 const f=JSON.parse(readFileSync(fixtureFile)),a=f.families[1],own=await session(a);
 const row=ok(await admin.from('scan_photos').select('id').eq('parent_id',a.id).eq('state','saved'))[0];assert(row,'Need saved QA photo');
 const path='/api/account/scans/'+row.id+'/image';
 const before=await fetch(base+path,{headers:{Cookie:own.cookie}});assert.equal(before.status,200);assert((await before.arrayBuffer()).byteLength>1000);
 ok(await own.db.auth.signOut({scope:'local'}));
 const replay=await fetch(base+path,{headers:{Cookie:own.cookie}});assert.equal(replay.status,401);
 assert(ok(await admin.storage.from('scan-photos').download(a.id+'/'+row.id+'/photo.jpg')));
 writeFileSync(evidence+'/hosted-signout.json',JSON.stringify({before:200,replayedCookieAfterSignOut:401,objectStillExists:true,check:'Old JWT cookie cannot view images after Auth session revocation; browser sign-out is not the only protection.'},null,2)+'\n');console.log('Revoked-session cookie denied with the physical object still present.');
}
async function cleanup(){
 const f=JSON.parse(readFileSync(fixtureFile)),adm=await session(f.families[2]);
 const worker=createClient(url,JSON.parse(readFileSync('/tmp/scan-worker-key.json')).api_key,{auth:{persistSession:false,autoRefreshToken:false}});
 const families=ok(await admin.from('parents').select('id,email,source').contains('source',{qa:'454'}));
 const {runFamilyDeletion}=await import('/tmp/scan454-deletion.cjs');let count=0;
 for(const a of families){
  assert(a.email.startsWith('scan454-')&&a.email.endsWith('@example.test'));
  assert(ok(await admin.from('test_accounts').select('parent_id').eq('parent_id',a.id).single()));
  if(a.id===f.families[2].id)continue;
  assert.equal(ok(await adm.db.rpc('request_family_deletion',{p:a.id,confirmation:a.email})),'requested');
  const result=await runFamilyDeletion(worker,a.id,worker,Date.now()+45000);assert.equal(result.state,'deleted');count++;
 }
 // The disposable QA admin has no image objects. Remove its temporary admin grant before deleting Auth.
 const qaAdmin=f.families[2];assert.equal(ok(await admin.storage.from('scan-photos').list(qaAdmin.id)).length,0);
 ok(await admin.from('admin_users').delete().eq('user_id',qaAdmin.id));ok(await admin.auth.admin.deleteUser(qaAdmin.id));
 assert.equal(ok(await admin.from('parents').select('id').contains('source',{qa:'454'})).length,0);
 writeFileSync(evidence+'/qa-cleanup.json',JSON.stringify({deletedWithDedicatedWorker:count,temporaryAdminRemoved:true,remainingQaFamilies:0},null,2)+'\n');console.log('All synthetic QA families and the temporary admin grant removed.');
}
if(process.argv[2]==='cleanup') await cleanup(); else if(process.argv[2]==='logout') await logout(); else if(process.argv[2]==='seed') await seed(); else if(process.argv[2]==='expiry') await expiry(); else if(process.argv[2]==='refusals') await refusals(); else if(process.argv[2]==='deletion') await deletion(); else if(process.argv[2]==='prepare') await prepare(); else if(process.argv[2]==='boundaries') await boundaries(); else await check();
