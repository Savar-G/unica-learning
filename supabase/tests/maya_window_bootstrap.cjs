// Bootstrap only the schema needed by the public Maya grant/insert probes.
const fs = require('node:fs');
module.exports = async function bootstrap(c) {
  await c.query(fs.readFileSync('supabase/tests/maya_window_fixture.sql', 'utf8'));
  const apply = async name => c.query(fs.readFileSync('supabase/migrations/' + name + '.sql', 'utf8'));
  await apply('20261010_add_parents_children');
  await apply('20261020_parents_postal_optional');
  await c.query(`alter table public.children add unique(id,parent_id);
    create table public.assessments (id uuid primary key,child_id uuid,unique(id,child_id));
    create table public.learning_events (id uuid primary key);`);
  await apply('20261012_add_test_accounts');
  await apply('20261031_add_maya_calls');
  await apply('20261101_add_maya_minutes');
  await apply('20261101_fix_maya_minute_reservations');
  await apply('20261101_maya_minute_time_windows');
  await apply('20261102155713_current_maya_minute_window');
  await apply('20261102164821_maya_window_zones');
  await apply('20261102172026_supported_family_zones');
  console.log('PASS bootstrap: actual Maya ledger and call migrations; platform stubs only');
};
