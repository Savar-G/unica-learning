// Disposable PostgreSQL only. Uses public admission functions and two independent sessions.
const { Client } = require('pg');
const { readFileSync } = require('node:fs');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
if (process.env.PD559_SOCKET !== '/tmp/pd559-postgres' || process.env.PD559_DATABASE !== 'pd559_family_pricing') throw Error('Isolated family pricing database required');
const connect = async () => { const c = new Client({ host: process.env.PD559_SOCKET, port: 55559, database: process.env.PD559_DATABASE, user: process.env.USER }); await c.connect(); await c.query("set statement_timeout='5s'"); return c; };
(async () => {
  const db = await connect();
  if (!process.argv.includes('--baseline') && !process.argv.includes('--installed')) for (const name of ['20261109032547_family_plan_pricing.sql','20261109040516_family_plan_legacy_shape.sql','20261109041204_family_plan_history_admission.sql','20261109042134_family_plan_legacy_window.sql','20261109054254_family_plan_legacy_initial_stop.sql','20261109054614_family_plan_legacy_settlement.sql','20261109054621_family_plan_preserve_deleted_history.sql','20261109055004_family_plan_offer.sql']) await db.query(readFileSync('supabase/migrations/'+name, 'utf8'));
  const admission = process.argv.includes('--baseline') ? 'admit_plan_start_terms' : 'admit_family_plan_start';
  const rpc = async (name, args, c = db) => (await c.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) value`, args)).rows[0].value;
  const admit = (card, generation = 1, purpose = 'initial', price = 7999, c = db) => rpc(admission, [card, generation, randomUUID(), 'pm', purpose, price, ''], c);
  async function family() {
    const parent = randomUUID(), children = [randomUUID(), randomUUID(), randomUUID()], cards = children.map(() => randomUUID());
    await db.query('insert into parents(id) values($1)', [parent]);
    for (let n = 0; n < children.length; n++) { await db.query('insert into children(id,parent_id) values($1,$2)', [children[n], parent]); await db.query('insert into card_setups(id,parent_id,child_id) values($1,$2,$3)', [cards[n], parent, children[n]]); }
    return { parent, children, cards };
  }
  const finish = (card, s, state = 'started') => rpc('finish_plan_start', [card, s.generation, state, state === 'started' ? 'sub_' + card : null, s.trial_end, false]);
  let passed = 0;
  async function test(name, fn) { await fn(); passed++; console.log('PASS', name); }
  await test('three starts: one full price, two sibling prices, one window', async () => {
    const f = await family(), starts = [];
    for (const card of f.cards) { const s = await admit(card); starts.push(s); await finish(card, s); }
    assert.deepEqual(starts.map(s => s.monthly_cents), [7999, 5999, 5999]);
    assert.equal(new Set(starts.map(s => s.trial_end)).size, 1); assert(starts[0].trial_end);
    assert.equal(Date.parse(starts[0].trial_end) - Date.parse(starts[0].at), 30 * 86400000);
  });
  await test('late sibling gets remaining window, after-window sibling pays immediately', async () => {
    const f = await family(), first = await admit(f.cards[0]); await finish(f.cards[0], first);
    await db.query("update family_plan_windows set started_at=started_at-interval '240 hours',ends_at=ends_at-interval '240 hours' where parent_id=$1", [f.parent]);
    await db.query("update plan_starts set started_at=started_at-interval '240 hours',first_charge_at=first_charge_at-interval '240 hours',trial_end=trial_end-interval '240 hours' where parent_id=$1", [f.parent]);
    const inside = await admit(f.cards[1]); assert.equal(Date.parse(inside.trial_end), Date.parse(first.trial_end) - 10 * 86400000); await finish(f.cards[1], inside);
    await db.query("update family_plan_windows set started_at=started_at-interval '744 hours',ends_at=ends_at-interval '744 hours' where parent_id=$1", [f.parent]);
    await db.query("update plan_starts set started_at=started_at-interval '744 hours',first_charge_at=first_charge_at-interval '744 hours',trial_end=trial_end-interval '744 hours' where parent_id=$1", [f.parent]);
    const late = await admit(f.cards[2]); assert.equal(late.monthly_cents, 5999); assert.equal(late.trial_end, null);
  });
  await test('child deletion and cancellation preserve first owner, sibling price and used window', async () => {
    const f = await family(), first = await admit(f.cards[0]); await finish(f.cards[0], first);
    const sibling = await admit(f.cards[1]); await finish(f.cards[1], sibling);
    // A cancelled provider subscription does not remove its admission. Deleting the child must not remove it either.
    await db.query('delete from children where id=$1', [f.children[0]]);
    const third = await admit(f.cards[2]); assert.equal(third.monthly_cents, 5999); assert.equal(third.trial_end, first.trial_end);
    const restart = await admit(f.cards[1], 2, 'restart'); assert.equal(restart.monthly_cents, 5999); assert.equal(restart.trial_end, null);
  });
  await test('first child Restart has its price and no second window, even inside original window', async () => {
    const f = await family(), s = await admit(f.cards[0]); await finish(f.cards[0], s);
    const restart = await admit(f.cards[0], 2, 'restart'); assert.equal(restart.monthly_cents, 7999); assert.equal(restart.trial_end, null);
  });
  await test('two concurrent sibling starts use one parent lock and retain one window', async () => {
    const f = await family(), first = await admit(f.cards[0]); await finish(f.cards[0], first); const other = await connect();
    try { const starts = await Promise.all([admit(f.cards[1]), admit(f.cards[2], 1, 'initial', 7999, other)]); assert.deepEqual(starts.map(s => s.monthly_cents), [5999, 5999]); assert(starts.every(s => s.trial_end === first.trial_end)); } finally { await other.end(); }
  });
  await test('uncertain first create holds the reservation, confirmed refusal alone releases it', async () => {
    const f = await family(), other = await connect();
    try {
      await db.query('begin'); const s = await admit(f.cards[0]); const second = assert.rejects(() => admit(f.cards[1], 1, 'initial', 7999, other), /family_start_pending/); await db.query('commit'); await second;
      const retry = await admit(f.cards[0]); assert.equal(retry.key, s.key);
      // Team closure alone cannot release a potentially successful family reservation.
      await db.query("update plan_starts set state='team_ended',finished_at=now() where card_setup_id=$1", [f.cards[0]]);
      await assert.rejects(() => admit(f.cards[1]), /family_start_pending/);
      await db.query("update plan_starts set state='open',finished_at=null where card_setup_id=$1", [f.cards[0]]);
      await finish(f.cards[0], s, 'refused');
      const next = await admit(f.cards[1]); assert.equal(next.monthly_cents, 7999); assert(next.trial_end);
    } finally { await other.end(); }
  });
  await test('older offer remains below the sibling price and cannot rise on Restart', async () => {
    const f = await family(), a = await admit(f.cards[0]); await finish(f.cards[0], a);
    const b = await admit(f.cards[1], 1, 'initial', 4900); assert.equal(b.monthly_cents, 4900); await finish(f.cards[1], b);
    const restart = await admit(f.cards[1], 2, 'restart', 7999); assert.equal(restart.monthly_cents, 4900);
  });
  await test('private tables and service-only admission, old callers fail closed', async () => {
    for (const role of ['anon', 'authenticated']) assert.equal((await db.query("select has_function_privilege($1,'admit_family_plan_start(uuid,integer,text,text,text,integer,text)','EXECUTE') ok", [role])).rows[0].ok, false);
    const f = await family(), first = await rpc('admit_plan_start_terms', [f.cards[0], 1, randomUUID(), 'pm', 'initial', 7999, '']); await finish(f.cards[0], first); await assert.rejects(() => rpc('admit_plan_start_terms', [f.cards[1], 1, randomUUID(), 'pm', 'initial', 7999, '']), /family_plan_upgrade_required/);
  });
  console.log('FAMILY_PLAN_PRICING_SQL_OK', passed); await db.end();
})().catch(e => { console.error(e); process.exit(1); });
