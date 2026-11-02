// Run from the repository root against a local test database with all migrations.
// Install pg outside the repository and set NODE_PATH as in maya_expired_window.cjs.
const pg=require('pg');
const esbuild=require(process.cwd()+'/node_modules/esbuild');
const fs=require('node:fs');
const assert=require('node:assert/strict');
esbuild.buildSync({entryPoints:['src/lib/family-time.ts'],bundle:true,platform:'node',format:'cjs',outfile:'/tmp/minutes-window-time.cjs'});
esbuild.buildSync({entryPoints:['src/lib/canada-postal-zones.ts'],bundle:true,platform:'node',format:'cjs',outfile:'/tmp/minutes-window-zones.cjs'});
const t=require('/tmp/minutes-window-time.cjs'),z=require('/tmp/minutes-window-zones.cjs');
const p='ff433001-0000-4000-8000-000000000001',child='ff433001-0000-4000-8000-000000000002';
(async()=>{
 const c=new pg.Client({host:'127.0.0.1',port:Number(process.env.PGPORT || 5432),user:process.env.PGUSER || 'postgres',password:process.env.PGPASSWORD,database:process.env.PGDATABASE || 'postgres'});await c.connect();await c.query('begin');
 try {
  await c.query(fs.readFileSync('supabase/migrations/20261102155713_current_maya_minute_window.sql','utf8'));
  await c.query(`insert into auth.users(id,email) values($1,'parity@example.invalid')`,[p]);
  await c.query(`insert into public.parents(id,name,email) values($1,'Probe','parity@example.invalid')`,[p]);
  await c.query(`insert into public.children(id,parent_id,first_name,grade,province) values($1,$2,'Probe',3,'ON')`,[child,p]);
  const locations=[{},...Object.keys(z.POSTAL_ZONES).map(postal=>({postal})),...Object.keys(z.FSA_ZONES).map(f=>({postal:f+'1A1'})),...['A','B','C','E','G','H','J','K','L','M','N','P','R','S','T','V','X','Y'].map(f=>({postal:f+'9Z9Z9'})),...['BC','AB','SK','MB','ON','other'].map(province=>({province})),...['America/Toronto','America/Vancouver','Canada/Pacific','America/Edmonton','America/Yellowknife','America/Inuvik','Canada/Mountain','America/Winnipeg','Canada/Central','America/Havana','America/Santiago','Asia/Kathmandu','bad-zone'].map(timeZone=>({timeZone})),{postal:'X0A 0G0',timeZone:'bad-zone',province:'BC'}];
  let checked=0;
  for(const loc of locations) {
   await c.query('update public.parents set time_zone=$2,postal=$3 where id=$1',[p,loc.timeZone??null,loc.postal??null]);
   await c.query('update public.children set province=$2 where id=$1',[child,loc.province??'BC']);
   for(const iso of ['2026-11-09T06:33:00Z','2027-03-14T06:00:00Z','2027-11-07T04:30:00Z','2027-09-05T05:00:00Z']) {
    for(const kind of ['child','parent_demo']) {
     const at=Date.parse(iso),zone=t.familyZone(loc),day=(kind==='child'?t.weekOf:t.dayOf)(at,zone).start;
     const r=(await c.query('select period::text,period_start from public._maya_family_window($1,$2,$3)',[p,kind,iso])).rows[0];
     assert.equal(r.period,day,JSON.stringify({loc,iso,kind}));
     assert.equal(r.period_start.getTime(),t.localDateTime(day,zone),JSON.stringify({loc,iso,kind}));checked++;
    }
   }
  }
  // An inactive oldest sibling still owns the province fallback.
  await c.query(`update public.parents set postal=null,time_zone=null where id=$1`,[p]);
  await c.query(`update public.children set province='ON',created_at='2020-01-01' where id=$1`,[child]);
  await c.query(`insert into public.children(id,parent_id,first_name,grade,province,created_at) values(gen_random_uuid(),$1,'Sibling',3,'BC','2021-01-01')`,[p]);
  assert.equal((await c.query(`select period_start from public._maya_family_window($1,'child','2026-11-09T06:33Z')`,[p])).rows[0].period_start.toISOString(),'2026-11-09T05:00:00.000Z');
  console.log({checked,locations:locations.length,oldestSibling:true});
 }finally{await c.query('rollback');await c.end();}
})().catch(e=>{console.error(e);process.exitCode=1;});
