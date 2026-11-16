// Local SQL concurrency probe. Family and active-photo checks are synthetic seams.
// The real Send and receipt functions execute. No hosted data or provider calls.
const {Client}=require('pg');
const {execFileSync}=require('node:child_process');
const os=require('node:os'); const path=require('node:path');
const temp=require('node:fs').mkdtempSync(path.join(os.tmpdir(),'unica-send-receipt-'));
const data=path.join(temp,'data');
execFileSync('initdb',['-D',data,'-A','trust','--no-locale'],{stdio:'ignore'});
execFileSync('pg_ctl',['-D',data,'-l',path.join(temp,'postgres.log'),'-o',`-h '' -k ${temp} -p 51492`,'-w','start'],{stdio:'ignore'});
const fs=require('node:fs'); const assert=require('node:assert/strict');
const conf={host:temp,port:51492,database:'postgres',user:process.env.USER};
const p='11111111-1111-4111-8111-111111111111',c='22222222-2222-4222-8222-222222222222',a='33333333-3333-4333-8333-333333333333';
(async()=>{const db=new Client(conf), other=new Client(conf);await db.connect();await other.connect();
try {
await db.query(`create role anon; create role authenticated; create role service_role bypassrls;
create table scan_photos(id uuid primary key,parent_id uuid,child_id uuid,sent_at timestamptz,state text,created_at timestamptz,expires_at timestamptz,printed_revision int);
create table scan_calibrations(photo_id uuid,parent_id uuid,state text,printed_revision int,result jsonb);
create function assert_family_writable(uuid) returns void language sql as 'select';
create function scan_photo_is_active(text,timestamptz,timestamptz) returns boolean language sql as 'select true';`);
await db.query(fs.readFileSync('supabase/migrations/20261105_scan_sent_check.sql','utf8'));
await db.query(fs.readFileSync('supabase/migrations/20261116190600_scan_send_receipt.sql','utf8'));
await db.query(`insert into scan_photos values($1,$2,$3,null,'saved',now(),null,1)`,[a,p,c]);
await db.query(`insert into scan_calibrations values($1,$2,'ready',1,'{"sheetCheck":1}')`,[a,p]);
const call=client=>client.query('select * from send_scan_photos_receipt($1,$2,$3)',[p,c,[a]]).then(r=>r.rows[0]);
await db.query('begin'); const first=await call(db); assert.deepEqual(first,{sent:[a],newly_sent:[a]});
let finished=false; const second=call(other).then(x=>{finished=true;return x;});
await db.query('select pg_sleep(0.05)'); assert.equal(finished,false); await db.query('commit');
assert.deepEqual(await second,{sent:[a],newly_sent:[]}); assert.deepEqual(await call(db),{sent:[a],newly_sent:[]});
const old=await db.query('select send_scan_photos($1,$2,$3) as ids',[p,c,[a]]);assert.deepEqual(old.rows[0].ids,[a]);
const grants=await db.query(`select has_function_privilege('anon','send_scan_photos_receipt(uuid,uuid,uuid[])','execute') anon,has_function_privilege('authenticated','send_scan_photos_receipt(uuid,uuid,uuid[])','execute') authenticated,has_function_privilege('service_role','send_scan_photos_receipt(uuid,uuid,uuid[])','execute') service`);assert.deepEqual(grants.rows[0],{anon:false,authenticated:false,service:true});
console.log('PASS first send, overlapping retry waits for commit, repeated retry, old RPC recovery, service-only grant');
}finally{await db.end();await other.end();execFileSync('pg_ctl',['-D',data,'-m','immediate','-w','stop'],{stdio:'ignore'});fs.rmSync(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1});
