#!/bin/zsh
# rename_child and start_workbook_run take the same row lock on the child (migration child_rename), checked with two
# connections: two requests to the Supabase Management API at once. Connection A runs one function and holds its
# transaction open; connection B runs the other with a 2 second lock timeout and must fail with lock_not_available
# (55P03). Both transactions roll back. Uses only an idle child of a marked test family.
# Run: zsh supabase/tests/child_rename_locks.sh   (Keychain token supabase-pagewise, or SUPABASE_ACCESS_TOKEN)
set -u
TOKEN=${SUPABASE_ACCESS_TOKEN:-$(security find-generic-password -s supabase-pagewise -w)}
API=https://api.supabase.com/v1/projects/cdjobwsyzndtltzfpyqa/database/query
query() { jq -n --arg q "$1" '{query: $q}' | curl -s -X POST "$API" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data @-; }

row=$(query "select c.id || ' ' || c.parent_id as r from public.children c join public.test_accounts t on t.parent_id = c.parent_id
  where not exists (select 1 from public.workbook_runs r where r.child_id = c.id and r.status in ('queued', 'running'))
  order by c.created_at limit 1" | jq -r '.[0].r')
child=${row% *}; parent=${row#* }
[[ $child =~ ^[0-9a-f-]{36}$ ]] || { echo "FAIL: no idle test child ($row)"; exit 1; }

start="select public.start_workbook_run('$child', null, null, 3, 360)"
rename="select public.rename_child('$parent', '$child', 'Probe Lock', 360)"
failed=0
held=$(mktemp)
check() { # $1 holder, $2 waiter, $3 label
  query "begin; $1; select pg_sleep(5); rollback;" > "$held" &
  local a=$!
  sleep 1.5
  local b; b=$(query "begin; set local lock_timeout = '2s'; $2; rollback;")
  wait $a
  if [[ $b == *"lock timeout"* ]]; then echo "ok: $3"; else echo "FAIL: $3: $b"; failed=1; fi
  [[ $(cat "$held") == "["* ]] || { echo "FAIL: $3 holder: $(cat "$held")"; failed=1; }
}
# Control: with no holder, the waiter's query answers at once (so a timeout below comes from the held lock).
for q in "$rename" "$start"; do
  c=$(query "begin; set local lock_timeout = '2s'; $q; rollback;")
  [[ $c == "["* ]] && echo "ok: control" || { echo "FAIL: control: $c"; failed=1; }
done
check "$start" "$rename" "a rename waits for a run being started"
check "$rename" "$start" "a run start waits for a rename"

after=$(query "select (select count(*) from public.workbook_runs where child_id = '$child' and status in ('queued', 'running')) || ' ' || (select first_name <> 'Probe Lock' and cardinality(former_names) = 0 from public.children where id = '$child') as r" | jq -r '.[0].r')
[[ $after == "0 true" ]] && echo "ok: nothing kept" || { echo "FAIL: rows kept: $after"; failed=1; }
exit $failed
