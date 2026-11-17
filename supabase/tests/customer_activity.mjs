// Disposable local PostgreSQL only. The fixture models required columns, not hosted RLS or full scan policy.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomInt } from 'node:crypto';
import pg from 'pg';
const dir = mkdtempSync(join(tmpdir(), 'unica-activity-'));
const port = randomInt(20000, 50000);
let running = false;
const db = new pg.Client({ host: '127.0.0.1', port, database: 'postgres', user: process.env.USER });
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
try {
  execFileSync('initdb', ['-D', dir, '-A', 'trust', '--no-locale'], { stdio: 'ignore' });
  execFileSync('pg_ctl', ['-D', dir, '-l', join(dir,'server.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${dir}`, '-w', 'start'], { stdio: 'ignore' }); running = true;
  await db.connect();
  await db.query(`
    create role anon; create role authenticated; create role service_role;
    create table parents(id uuid primary key,name text,created_at timestamptz default now(),postal text,time_zone text,deletion_requested_at timestamptz);
    create table children(id uuid primary key,parent_id uuid references parents on delete cascade,first_name text,province text,created_at timestamptz default now());
    create table admin_users(user_id uuid primary key,name text);
    create table test_accounts(parent_id uuid primary key);
    create table child_deletions(child_id uuid primary key);
    create table workbooks(id uuid primary key,parent_id uuid,child_id uuid,number int,status text,printed_revision text,print_manifest jsonb);
    create table assessments(id uuid primary key,parent_id uuid,child_id uuid,started_at timestamptz,completed_at timestamptz,last_answer_at timestamptz,status text,resume_until timestamptz);
    create table workbook_scan_receipts(id uuid primary key,parent_id uuid,child_id uuid,workbook_id uuid,page_id uuid,printed_revision text,status text,accepted_at timestamptz);
    create table workbook_scan_progress_events(id uuid primary key,receipt_id uuid,parent_id uuid,child_id uuid);
    create table scan_photos(id uuid primary key,parent_id uuid,child_id uuid,workbook_id uuid,created_at timestamptz,state text,page_id uuid,printed_revision text);
    create table scan_marking_items(id uuid primary key,parent_id uuid,child_id uuid,workbook_id uuid,observation jsonb,model text,printed_revision text);
    create table scan_mark_changes(id bigint primary key,parent_id uuid,child_id uuid,item_id uuid,changed_at timestamptz,actor text,admin_id uuid);
    create table maya_calls(id uuid primary key,parent_id uuid,child_id uuid,workbook_id uuid,created_at timestamptz,started_at timestamptz,ended_at timestamptz,status text,kind text,child_turns int,connected_seconds int,outcome_reason text);
    create table answers(id uuid primary key,assessment_id uuid,created_at timestamptz,answered_at timestamptz);
    create table fact_answers(id uuid primary key,assessment_id uuid,created_at timestamptz);
    create table feedback(id uuid primary key,parent_id uuid,child_id uuid,created_at timestamptz);
    create table workbook_delivery_receipts(workbook_id uuid primary key,parent_id uuid,child_id uuid,audit_id bigint,actor_id uuid,recorded_at timestamptz,delivered_at timestamptz,number int);
    create table workbook_delivery_corrections(id uuid primary key,workbook_id uuid,parent_id uuid,child_id uuid,audit_id bigint,actor_id uuid,recorded_at timestamptz,delivered_at timestamptz,number int);
    create table workbook_audit(id bigint primary key,parent_id uuid,child_id uuid,workbook_id uuid,actor_id uuid,at timestamptz,action text);
    create table plan_control_operations(id uuid primary key,parent_id uuid,child_id uuid,created_at timestamptz,state text);
    create table card_setups(id uuid primary key,child_id uuid,parent_id uuid,card_saved_at timestamptz,created_at timestamptz default now());
    create table reports(id uuid primary key,parent_id uuid,child_id uuid,created_at timestamptz,emailed_at timestamptz);
    create table workbook_emails(id uuid primary key,parent_id uuid,child_id uuid,created_at timestamptz,status text);
    create table plan_starts(start_key text primary key,parent_id uuid,card_setup_id uuid,started_at timestamptz,state text,generation int);
    create table email_log(id uuid primary key,parent_id uuid,child_id uuid,created_at timestamptz,status text);
    create table email_sends(id uuid primary key,parent_id uuid,child_id uuid,created_at timestamptz,outcome text);
    create table child_plan_states(child_id uuid primary key,parent_id uuid,kind text);
    create function is_admin() returns boolean language sql as $$ select current_setting('test.admin',true)='yes' $$;
    create function fence_family_write() returns trigger language plpgsql as $$ begin return new; end $$;
    create function fence_child_delete_write() returns trigger language plpgsql as $$ begin return new; end $$;
  `);
  await db.query(readFileSync(new URL('../migrations/20261117040357_customer_activity.sql',import.meta.url),'utf8'));
  await db.query(`insert into parents(id,name,time_zone) values ($1,'Real','America/Vancouver'),($2,'Test','America/Vancouver'),($3,'Team','America/Vancouver');
  `,[id(1),id(2),id(3)]);
  await db.query(`insert into children(id,parent_id,first_name,province) values($1,$2,'Child','BC'),($3,$4,'Test child','BC');`,[id(11),id(1),id(12),id(2)]);
  await db.query("insert into admin_users values($1,'Team actor')",[id(3)]);
  await db.query('insert into test_accounts values($1)',[id(2)]);
  const write = (client, parent, child, request, event='page_visit', actor=parent, note=null) => client.query('select record_customer_activity($1,$2,null,$3,$4,$5,$6,$7) result',[parent,child,request,event,event==='contact_note'?null:'home',actor,note]);
  await db.query('set role service_role');
  assert.equal((await write(db,id(1),id(12),id(100))).rows[0].result,'refused');
  assert.equal((await write(db,id(1),id(11),id(101),'contact_note',id(1),'Fake admin')).rows[0].result,'refused');
  const peer = new pg.Client({host:'127.0.0.1',port,database:'postgres',user:process.env.USER}); await peer.connect();
  try {
    await peer.query('set role service_role');
    const replies = await Promise.all([write(db,id(1),id(11),id(102)),write(peer,id(1),id(11),id(102))]);
    assert.deepEqual(replies.map(r=>r.rows[0].result).sort(),['duplicate','saved']);
  } finally { await peer.end(); }
  assert.equal((await write(db,id(1),id(11),id(103))).rows[0].result,'duplicate');
  assert.equal((await write(db,id(1),id(11),id(104),'contact_note',id(3),'Private note')).rows[0].result,'saved');
  await assert.rejects(db.query('select * from customer_activity'),/permission denied/);
  await db.query('reset role');
  assert.equal((await db.query('select count(*)::int n from customer_activity')).rows[0].n,2);
  await assert.rejects(db.query("update customer_activity set note='Changed' where event='contact_note'"),/append only/);
  // Same timestamp, more than one page. A separate family must not consume the matching family's limit.
  await db.query(`insert into customer_activity(parent_id,child_id,request_id,event,actor_id,note,created_at)
    select $1,$2,('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'contact_note',$3,'Paged note',now() from generate_series(1000,1079) n`,[id(2),id(12),id(3)]);
  await db.query("set test.admin='yes'");
  const query = async (after=null) => (await db.query('select admin_customer_history(p_parent=>$1,p_tests=>true,p_after_at=>$2,p_after_key=>$3) rows',[id(2),after?.at??null,after?.key??null])).rows[0].rows;
  const first = await query(); assert.equal(first.length,51);
  const second = await query(first[49]);
  assert.equal(new Set([...first.slice(0,50),...second].map(r=>r.key)).size,82);
  assert.equal((await db.query('select admin_customer_history(p_parent=>$1) rows',[id(2)])).rows[0].rows.length,0);
  assert.equal((await db.query('select admin_customer_children(p_parent=>$1,p_tests=>true) rows',[id(1)])).rows[0].rows[0].maya.seconds,null);
  // A visit and a note cannot make a family active. Test and team work cannot enter any metric.
  await db.query('insert into assessments(id,parent_id,child_id,started_at,last_answer_at) values($1,$2,$3,now(),now())',[id(200),id(2),id(12)]);
  const metrics = (await db.query("select admin_customer_metrics(now()-interval '1 day',now()+interval '1 day') m")).rows[0].m;
  assert.equal(metrics.families,1); assert.equal(metrics.activeFamilies,0); assert.equal(metrics.medianFirstScanHours,null);
  // A later answer must not erase the first saved answer from an earlier period.
  await db.query(`insert into assessments(id,parent_id,child_id,started_at,last_answer_at) values($1,$2,$3,now()-interval '1 day',now())`,[id(201),id(1),id(11)]);
  await db.query(`insert into answers values($1,$2,now()-interval '20 hours',now())`,[id(202),id(201)]);
  const past = (await db.query("select admin_customer_metrics(now()-interval '1 day',now()-interval '12 hours') m")).rows[0].m;
  assert.equal(past.activeFamilies,1);
  // Attention is applied before the child page bound, including a child after 25 nonmatching rows.
  await db.query(`insert into children(id,parent_id,first_name,province)
    select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,$1,'Other child','BC' from generate_series(800,830) n`,[id(1)]);
  await db.query("insert into workbooks values($1,$2,$3,1,'shipped','frozen','{}')",[id(700),id(1),id(830)]);
  await db.query(`insert into scan_marking_items(id,parent_id,child_id,workbook_id,observation,model,printed_revision)
    values($1,$2,$3,$4,'{"result":null,"state":"pending","certainty":"unsure"}','stored-model','frozen')`,[id(701),id(1),id(830),id(700)]);
  const awaiting = (await db.query("select admin_customer_children(p_parent=>$1,p_attention=>'team') rows",[id(1)])).rows[0].rows;
  assert.equal(awaiting.length,1); assert.equal(awaiting[0].id,id(830));
  await db.query("set test.admin='no'; set role authenticated");
  await assert.rejects(db.query('select admin_customer_history()'),/insufficient_privilege|permission denied/);
  await assert.rejects(write(db,id(1),id(11),id(300)),/permission denied/);
  await db.query('reset role');
  await db.query('insert into card_setups(id,parent_id,child_id) values($1,$2,$3)',[id(400),id(1),id(11)]);
  await db.query("insert into plan_starts(start_key,parent_id,card_setup_id,state,generation) values('recorded-plan',$1,$2,'started',1)",[id(1),id(400)]);
  await db.query('set role service_role');
  assert.equal((await db.query('select record_customer_plan_actor($1,1,$2) result',[id(400),id(1)])).rows[0].result,'refused');
  assert.equal((await db.query('select record_customer_plan_actor($1,2,$2) result',[id(400),id(3)])).rows[0].result,'refused');
  await db.query('select record_customer_plan_actor($1,1,$2)',[id(400),id(3)]);
  await db.query('select record_customer_plan_actor($1,1,$2)',[id(400),id(3)]);
  await db.query('reset role');
  assert.equal((await db.query("select count(*)::int n from customer_activity where event='plan_confirmation'")).rows[0].n,1);
  await db.query('begin');
  await db.query(`insert into customer_activity(parent_id,request_id,event,actor_id,note)
    select $1,('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'contact_note',$2,'Rate fixture' from generate_series(2000,2120) n`,[id(1),id(3)]);
  await db.query('set local role service_role');
  assert.equal((await write(db,id(1),id(11),id(500),'contact_note',id(3),'Bounded')).rows[0].result,'rate_limited');
  await db.query('rollback');
  // Retention deletes optional activity but preserves contact notes. Child cascade removes both.
  await db.query("alter table customer_activity disable trigger customer_activity_no_update; update customer_activity set created_at=now()-interval '91 days'; alter table customer_activity enable trigger customer_activity_no_update");
  assert.equal((await db.query('select purge_customer_activity() n')).rows[0].n,1);
  assert.equal((await db.query("select count(*)::int n from customer_activity where event='contact_note'")).rows[0].n,81);
  await db.query('delete from children where id=$1',[id(11)]);
  assert.equal((await db.query('select count(*)::int n from customer_activity where parent_id=$1',[id(1)])).rows[0].n,0);
  await db.query('delete from parents where id=$1',[id(2)]);
  assert.equal((await db.query('select count(*)::int n from customer_activity where parent_id=$1',[id(2)])).rows[0].n,0);
  console.log('PASS: migration, ownership, actor, concurrent retry, burst dedup, private grants, append-only, timestamp ties, filter-before-limit, test/team metrics, unknown duration, non-admin refusal, retention and child cascade (synthetic local PostgreSQL).');
} finally {
  await db.end().catch(()=>{});
  if (running) execFileSync('pg_ctl',['-D',dir,'-m','immediate','-w','stop'],{stdio:'ignore'});
  rmSync(dir,{recursive:true,force:true});
}
