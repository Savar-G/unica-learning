// #444. Run from the repository root against an EMPTY local database with the Maya migrations.
// npm install --prefix /tmp/maya-zone-test pg
// NODE_PATH=/tmp/maya-zone-test/node_modules PGPORT=55444 PGPASSWORD=... node --expose-gc supabase/tests/maya_window_zones.cjs
// --baseline reproduces both 2,400-second failures with #441 SQL. Default applies #444.
// No remote connection is supported. Function changes are restored; parity rows are rolled back.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const pg = require('pg');
const esbuild = require('esbuild');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-zone-test-'));
esbuild.buildSync({ entryPoints: ['src/lib/family-time.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: path.join(tmp, 'time.cjs') });
esbuild.buildSync({ entryPoints: ['src/lib/canada-postal-zones.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: path.join(tmp, 'postal.cjs') });
const t = require(path.join(tmp, 'time.cjs'));
const z = require(path.join(tmp, 'postal.cjs'));
const config = { host: '127.0.0.1', port: Number(process.env.PGPORT || 5432), user: process.env.PGUSER || 'postgres', password: process.env.PGPASSWORD, database: process.env.PGDATABASE || 'postgres', statement_timeout: 15000 };
const baseline = process.argv.includes('--baseline');
const parent = 'ff444000-0000-4000-8000-000000000001';
const child = 'ff444000-0000-4000-8000-000000000002';
const id = n => 'ff444000-0000-4000-8000-' + String(n).padStart(12, '0');
const migration = 'supabase/migrations/20261102164821_maya_window_zones.sql';
const callInsert = `insert into public.maya_calls(id,parent_id,child_id,kind,question_source,workbook_id,workbook_page,workbook_question,package_id,package_hash,model,prompt_version,versions,live) values($1,$2,$3,'admin_test','workbook',gen_random_uuid(),1,1,'probe','sha256:'||repeat('0',64),'probe','probe','{}','{}')`;
// Explicit non-Canadian tzdata exceptions. PostgreSQL's 2026e data uses UTC after
// 2026-09-20 for Morocco and Western Sahara. Node's 2026a data still uses UTC+1
// outside Ramadan. Accept only that one-hour difference in these observed weeks.
// A new zone, week, period mismatch, or offset difference must fail.
const TZDATA_EXCEPTIONS = {
  'Africa/Casablanca': { reason: 'PostgreSQL 2026e Morocco UTC rule; Node 2026a retains UTC+1 outside Ramadan' },
  'Africa/El_Aaiun': { reason: 'PostgreSQL 2026e Western Sahara UTC rule; Node 2026a retains UTC+1 outside Ramadan' },
};
const TZDATA_EXCEPTION_WEEKS = [
  ['2026-09-21', '2027-02-01'],
  ['2027-03-15', '2028-01-17'],
  ['2028-03-06', '2028-12-25'],
];
// IANA zone.tab Canadian entries, including names now treated as links by ICU.
const CANADIAN_ZONES = [
  'St_Johns', 'Halifax', 'Glace_Bay', 'Moncton', 'Goose_Bay', 'Blanc-Sablon',
  'Toronto', 'Iqaluit', 'Atikokan', 'Winnipeg', 'Resolute', 'Rankin_Inlet',
  'Regina', 'Swift_Current', 'Edmonton', 'Cambridge_Bay', 'Inuvik', 'Yellowknife',
  'Vancouver', 'Creston', 'Dawson_Creek', 'Fort_Nelson', 'Whitehorse', 'Dawson',
].map(name => t.familyZone({ timeZone: 'America/' + name }));
for (const name of Object.keys(TZDATA_EXCEPTIONS)) assert.equal(CANADIAN_ZONES.includes(t.familyZone({ timeZone: name })), false);
const helpers = ['_maya_normalize_zone', '_maya_zone_at', '_maya_period_window'];
const modified = ['grant_maya_minutes', '_maya_minutes_used', 'reserve_maya_minutes_on_call', '_maya_family_window', ...helpers];
async function family(c, zone) {
  await c.query(`insert into auth.users(id,email) values($1,'zone-probe@example.invalid')`, [parent]);
  await c.query(`insert into public.parents(id,name,email,time_zone) values($1,'Probe','zone-probe@example.invalid',$2)`, [parent, zone]);
  await c.query(`insert into public.children(id,parent_id,first_name,grade,province) values($1,$2,'Probe',3,'MB')`, [child, parent]);
  await c.query(`insert into public.test_accounts(parent_id,marked_by) values($1,$1)`, [parent]);
}
async function removeFamily(c) {
  await c.query('delete from public.parents where id=$1', [parent]);
  await c.query('delete from auth.users where id=$1', [parent]);
}
async function quota(a, b) {
  await a.query(`create function public.issue444_clock() returns timestamptz language sql volatile as $$select current_setting('probe.now')::timestamptz$$`);
  const defs = (await a.query(`select pg_get_functiondef(oid) def from pg_proc where pronamespace='public'::regnamespace and proname in ('grant_maya_minutes','_maya_minutes_used','reserve_maya_minutes_on_call')`)).rows;
  for (const { def } of defs) await a.query(def.replaceAll('clock_timestamp()', 'public.issue444_clock()'));
  for (const test of [
    { zone: 'America/Rainy_River', now: '2026-11-09T06:33Z', period: '2026-11-09', start: '2026-11-09T05:00Z', spent: '2026-11-09T05:30Z' },
    { zone: 'Africa/Cairo', now: '2027-10-31T20:00Z', period: '2027-10-25', start: '2027-10-24T21:00Z', spent: '2027-10-24T21:30Z' },
  ]) {
    for (const conn of [a, b]) await conn.query(`select set_config('probe.now',$1,false),set_config('request.jwt.claim.role','service_role',false)`, [test.now]);
    await family(a, test.zone); // Keep the raw alias in the saved family row.
    await a.query(`select set_config('probe.now',$1,false)`, [test.start]);
    assert.equal((await a.query(`select * from public.grant_maya_minutes($1,$2,$3,'child',$4,1800,600,60,$5::timestamptz)`, [id(20), parent, child, test.period, test.start])).rows[0].granted, 600);
    for (let n = 10; n < 13; n++) await a.query(`insert into public.maya_minute_grants(call_id,parent_id,child_id,kind,period,granted_seconds,used_seconds,settled_at,created_at,period_start) values($1,$2,$3,'child',$4,600,600,$5,$5,$6)`, [id(n), parent, child, test.period, test.spent, test.start]);
    await a.query(`select set_config('probe.now',$1,false)`, [test.now]);
    const usage = async () => (await b.query(`select public.maya_minutes_used($1,$2,'child',$3::timestamptz) used`, [parent, child, test.start])).rows[0].used;
    const before = await usage();
    assert.equal(before, 1800);
    await b.query('begin');
    await b.query(`select pg_advisory_xact_lock(hashtextextended('maya_minutes:child:'||$1,0))`, [child]);
    const pending = a.query(callInsert, [id(20), parent, child]).then(() => null, e => e.message);
    let blocked = false;
    for (let i = 0; i < 100; i++) {
      if ((await b.query(`select 1 from pg_locks where pid=$1 and not granted and locktype='advisory'`, [a.processID])).rowCount) { blocked = true; break; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    await b.query('commit');
    const error = await pending;
    assert.equal(blocked, true, 'insertion must wait on the child lock');
    const after = await usage();
    assert.equal(after, baseline ? 2400 : 1800);
    assert.equal(error, baseline ? null : 'maya_minute_grant_expired');
    console.log(JSON.stringify({ mode: baseline ? 'baseline' : 'fixed', zone: test.zone, connections: 2, childLockWait: blocked, before, after, insertion: error ?? 'accepted' }));
    if (!baseline) {
      // The same full grant fits after 600 seconds are removed. No blanket refusal.
      await a.query('delete from public.maya_minute_grants where call_id=$1', [id(12)]);
      await a.query(callInsert, [id(20), parent, child]);
      assert.equal(await usage(), 1800);
      const grant = (await a.query('select period::text,period_start from public.maya_minute_grants where call_id=$1', [id(20)])).rows[0];
      assert.equal(grant.period, test.period);
      assert.equal(grant.period_start.toISOString(), new Date(test.start).toISOString());
    }
    await removeFamily(a);
  }
  for (const { def } of defs) await a.query(def);
  await a.query('drop function public.issue444_clock()');
}
async function parity(c) {
  await c.query('begin');
  try {
    await family(c, null);
    // Enumerate IANA primary names plus every database link accepted by the runtime.
    // Case variants also belong to validTimeZone's accepted input set.
    const names = [...new Set([...(await c.query('select name from pg_timezone_names')).rows.map(r => r.name), ...Intl.supportedValuesOf('timeZone')])].filter(t.validTimeZone).sort();
    const at = [];
    for (let day = '2026-01-05'; day < '2029-01-01'; day = t.addDays(day, 7)) {
      at.push(day + 'T12:00:00Z', t.addDays(day, 6) + 'T20:00:00Z');
    }
    let checked = 0, normalization = 0;
    const byYear = {};
    const mismatches = [];
    const excepted = {};
    let canadianComparisons = 0;
    // Cache equivalent aliases so the TypeScript oracle runs once per canonical zone.
    const expected = new Map();
    for (const name of names) {
      const zone = t.familyZone({ timeZone: name });
      const variants = [name, name.toLowerCase(), name.toUpperCase()];
      const normalized = (await c.query('select public._maya_normalize_zone(n) zone from unnest($1::text[]) n', [variants])).rows;
      for (const row of normalized) { assert.equal(row.zone, zone, name); normalization++; }
      await c.query('update public.parents set time_zone=$2 where id=$1', [parent, name]);
      const rows = (await c.query(`select x.at, w.period::text, w.period_start from unnest($2::timestamptz[]) x(at) cross join lateral public._maya_family_window($1,'child',x.at) w`, [parent, at])).rows;
      assert.equal(rows.length, at.length);
      if (!expected.has(zone)) expected.set(zone, at.map(iso => {
        const period = t.weekOf(Date.parse(iso), zone).start;
        return { period, start: t.localDateTime(period, zone) };
      }));
      rows.forEach((row, i) => {
        const e = expected.get(zone)[i];
        if (CANADIAN_ZONES.includes(zone)) canadianComparisons++;
        if (row.period !== e.period || row.period_start.getTime() !== e.start) {
          const allowed = Object.hasOwn(TZDATA_EXCEPTIONS, name)
            && !CANADIAN_ZONES.includes(zone)
            && row.period === e.period
            && TZDATA_EXCEPTION_WEEKS.some(([from, to]) => e.period >= from && e.period <= to)
            && row.period_start.getTime() === e.start + 3_600_000
            && row.period_start.toISOString() === e.period + 'T00:00:00.000Z';
          if (allowed) excepted[name] = (excepted[name] || 0) + 1;
          else mismatches.push({ name, at: at[i], expected: new Date(e.start).toISOString(), actual: row.period_start.toISOString(), period: row.period, expectedPeriod: e.period });
        }
        checked++;
        const year = at[i].slice(0, 4);
        byYear[year] = (byYear[year] || 0) + 1;
      });
      if ((names.indexOf(name) + 1) % 100 === 0) console.log(JSON.stringify({ checkedZones: names.indexOf(name) + 1, weeklyComparisons: checked }));
      if (global.gc) global.gc();
    }
    console.log(JSON.stringify({ acceptedZones: names.length, weeks: at.length / 2, samplesPerWeek: 2, weeklyComparisons: checked, byYear, normalizationComparisons: normalization, canadianComparisons, excepted, mismatches: mismatches.length, node: process.version, icu: process.versions.icu }));
    if (mismatches.length) {
      const groups = Object.groupBy(mismatches, row => row.name);
      console.log(JSON.stringify(Object.fromEntries(Object.entries(groups).map(([name, rows]) => [name, { count: rows.length, first: rows[0], last: rows.at(-1) }]))));
    }
    assert.equal(mismatches.length, 0, 'SQL and TypeScript must agree for every accepted zone');
    // Test both sides of actual reset instants at the Canadian cutoffs and Cairo week.
    let edges = 0;
    for (const [name, monday] of [['America/Rainy_River', '2026-11-09'], ['America/Vancouver', '2026-03-02'], ['America/Vancouver', '2026-03-09'], ['America/Edmonton', '2026-10-26'], ['America/Edmonton', '2026-11-02'], ['Africa/Cairo', '2027-10-25']]) {
      const zone = t.familyZone({ timeZone: name });
      const start = t.localDateTime(monday, zone);
      await c.query('update public.parents set time_zone=$2 where id=$1', [parent, name]);
      for (const ms of [start - 1, start, start + 1]) {
        const row = (await c.query(`select period::text,period_start from public._maya_family_window($1,'child',$2)`, [parent, new Date(ms)])).rows[0];
        const period = t.weekOf(ms, zone).start;
        assert.equal(row.period, period);
        assert.equal(row.period_start.getTime(), t.localDateTime(period, zone));
        edges++;
      }
    }
    // Daily resets exercise a real midnight gap and a repeated midnight in Havana.
    for (const day of ['2026-03-08', '2026-11-01', '2027-03-14', '2027-11-07', '2028-03-12', '2028-11-05']) {
      const row = (await c.query(`select period_start from public._maya_period_window('America/Havana','parent_demo',$1)`, [day + 'T12:00Z'])).rows[0];
      assert.equal(row.period_start.getTime(), t.localDateTime(day, 'America/Havana'));
      edges++;
    }
    // Preserve postal/province fallbacks, including opt-outs from Canadian overrides.
    const locations = [{}, ...Object.keys(z.POSTAL_ZONES).map(postal => ({ postal })), ...Object.keys(z.FSA_ZONES).map(fsa => ({ postal: fsa + '1A1' })), ...['BC', 'AB', 'SK', 'MB', 'ON', 'other'].map(province => ({ province })), { timeZone: 'bad-zone', postal: 'P0V 1G0' }];
    let fallbacks = 0;
    for (const loc of locations) {
      await c.query('update public.parents set time_zone=$2,postal=$3 where id=$1', [parent, loc.timeZone ?? null, loc.postal ?? null]);
      await c.query('update public.children set province=$2 where id=$1', [child, loc.province ?? 'BC']);
      for (const iso of ['2026-03-08T20:00Z', '2026-11-01T20:00Z', '2027-11-07T20:00Z']) {
        const zone = t.familyZone(loc);
        const period = t.weekOf(Date.parse(iso), zone).start;
        const row = (await c.query(`select period::text,period_start from public._maya_family_window($1,'child',$2)`, [parent, iso])).rows[0];
        assert.equal(row.period, period);
        assert.equal(row.period_start.getTime(), t.localDateTime(period, zone), JSON.stringify(loc));
        fallbacks++;
      }
    }
    console.log(JSON.stringify({ boundaryAndGapComparisons: edges, fallbackComparisons: fallbacks, mismatches: 0 }));
  } finally { await c.query('rollback'); }
}
(async () => {
  const a = new pg.Client(config), b = new pg.Client(config);
  await a.connect(); await b.connect();
  const saved = (await a.query(`select proname, pg_get_functiondef(oid) def from pg_proc where pronamespace='public'::regnamespace and proname = any($1::text[])`, [modified])).rows;
  try {
    assert.equal((await a.query('select count(*)::int n from public.parents')).rows[0].n, 0, 'requires an empty local test database');
    await a.query(fs.readFileSync('supabase/migrations/20261102155713_current_maya_minute_window.sql', 'utf8'));
    if (!baseline) await a.query(fs.readFileSync(migration, 'utf8'));
    await quota(a, b);
    if (!baseline) await parity(a);
  } finally {
    await b.query('rollback'); await a.query('rollback');
    await removeFamily(a);
    for (const { def } of saved) await a.query(def);
    await a.query('drop function if exists public.issue444_clock()');
    // Restore the exact helper inventory if they were absent before this run.
    for (const name of [...helpers].reverse()) if (!saved.some(row => row.proname === name)) {
      const sig = { _maya_period_window: 'text,text,timestamptz', _maya_zone_at: 'text,timestamptz', _maya_normalize_zone: 'text' }[name];
      await a.query(`drop function if exists public.${name}(${sig})`);
    }
    assert.equal((await a.query('select count(*)::int n from public.parents')).rows[0].n, 0);
    console.log('PASS cleanup: zero local families; original functions restored');
    await a.end(); await b.end();
    fs.rmSync(tmp, { recursive: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
