-- Synthetic probe. Run only against a local disposable database; the runner creates all prerequisite stubs.
-- Hosted verification belongs to ROOT. This fixture never creates a production spending row.
begin;
set local role service_role;
select public.ingest_openrouter_provider_receipts('[
 {"workspace_id":"local","generation_id":"gen-paid","occurred_at":"2026-11-16T12:00:00Z","model":"test/model","api_key_id":"1","cost_usd":0.037,"input_cost_usd":0.01,"output_cost_usd":0.02,"input_tokens":40,"output_tokens":20},
 {"workspace_id":"local","generation_id":"gen-zero","occurred_at":"2026-11-16T11:00:00Z","model":"test/free","cost_usd":0},
 {"workspace_id":"local","generation_id":"gen-unknown","occurred_at":"2026-11-16T10:00:00Z","model":"test/unknown"}
]');
-- Reordered identical retries must store each generation once.
select public.ingest_openrouter_provider_receipts('[
 {"workspace_id":"local","generation_id":"gen-zero","occurred_at":"2026-11-16T11:00:00Z","model":"test/free","cost_usd":0},
 {"workspace_id":"local","generation_id":"gen-paid","occurred_at":"2026-11-16T12:00:00Z","model":"test/model","api_key_id":"1","cost_usd":0.037,"input_cost_usd":0.01,"output_cost_usd":0.02,"input_tokens":40,"output_tokens":20}
]');
do $$ begin
  if (select count(*) from public.openrouter_provider_receipts) <> 3 then raise exception 'duplicate counted'; end if;
  begin
    perform public.ingest_openrouter_provider_receipts('[
      {"workspace_id":"local","generation_id":"gen-aaa-new","occurred_at":"2026-11-16","model":"test/model","cost_usd":9},
      {"workspace_id":"local","generation_id":"gen-paid","occurred_at":"2026-11-16T12:00:00Z","model":"test/model","cost_usd":0}
    ]');
    raise exception 'conflict accepted';
  exception when raise_exception then if sqlerrm = 'conflict accepted' then raise; end if; end;
  if exists(select 1 from public.openrouter_provider_receipts where generation_id = 'gen-aaa-new') then raise exception 'partial write'; end if;
  begin
    perform public.ingest_openrouter_provider_receipts('[{"workspace_id":"local","generation_id":"gen-private","occurred_at":"2026-11-16","model":"test/model","prompt":"PRIVATE"}]');
    raise exception 'private field accepted';
  exception when raise_exception then if sqlerrm = 'private field accepted' then raise; end if; end;
  begin
    insert into public.openrouter_provider_receipts(workspace_id,generation_id,occurred_at,model) values('local','gen-direct','2026-11-16','test/model');
    raise exception 'direct insert accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Parent and anonymous callers cannot ingest. Parents see no rows; admins can read.
set local role authenticated;
select set_config('test.admin', 'false', true);
do $$ begin
  if (select count(*) from public.openrouter_provider_receipts) <> 0 then raise exception 'parent read'; end if;
  begin perform public.ingest_openrouter_provider_receipts('[]'); raise exception 'parent write'; exception when insufficient_privilege then null; end;
  begin perform public.admin_openrouter_provider_receipts('2026-11-01','2026-12-01'); raise exception 'parent admin rpc'; exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
  begin perform count(*) from public.openrouter_provider_receipts; raise exception 'anon read'; exception when insufficient_privilege then null; end;
  begin perform public.ingest_openrouter_provider_receipts('[]'); raise exception 'anon write'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('test.admin', 'true', true);
set local role authenticated;
do $$ declare v jsonb; begin
  v := public.admin_openrouter_provider_receipts('2026-11-16','2026-11-17');
  if (v#>>'{totals,known_cost_usd}')::numeric <> .037 or (v#>>'{totals,receipts}')::int <> 3
    or (v#>>'{totals,unknown_cost_receipts}')::int <> 1 or (v#>>'{totals,unmatched_receipts}')::int <> 3
    then raise exception 'totals or unknown wrong: %',v; end if;
end $$;
reset role;
-- Delayed app attribution must match without changing the provider row. A wrong provider must not match.
insert into public.ai_usage_events(provider,generation_id,feature,parent_id,child_id) values
 ('openrouter','gen-paid','maya','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002'),
 ('anthropic','gen-zero','other',null,null);
insert into public.test_accounts(parent_id) values('00000000-0000-0000-0000-000000000001');
set local role authenticated;
do $$ declare v jsonb; begin
  v := public.admin_openrouter_provider_receipts('2026-11-16','2026-11-17');
  if (v#>>'{totals,matched_receipts}')::int <> 1 or (v#>>'{totals,receipts}')::int <> 3
    or (v#>>'{children,0,test_family}')::boolean is not true
    or (v#>>'{children,0,known_cost_usd}')::numeric <> .037 then raise exception 'delayed/test attribution wrong: %',v; end if;
  v := public.admin_openrouter_provider_receipts('2026-11-16T12:00:00Z','2026-11-16T12:00:01Z');
  if (v#>>'{totals,receipts}')::int <> 1 then raise exception 'period bounds wrong'; end if;
end $$;
reset role;
-- Another workspace can use the same generation id, but cannot borrow its app attribution.
set local role service_role;
select public.ingest_openrouter_provider_receipts('[{"workspace_id":"second","generation_id":"gen-paid","occurred_at":"2026-11-16T12:00:00Z","model":"test/model","cost_usd":0.01}]');
set local role authenticated;
do $$ declare v jsonb; begin
  v := public.admin_openrouter_provider_receipts('2026-11-16','2026-11-17');
  if (v#>>'{totals,matched_receipts}')::int <> 0 or (v#>>'{totals,receipts}')::int <> 4 then raise exception 'ambiguous workspace matched'; end if;
end $$;
reset role;
-- Even the owner cannot update or delete provider evidence.
do $$ begin
  begin update public.openrouter_provider_receipts set cost_usd=0; raise exception 'update accepted'; exception when sqlstate '55000' then null; end;
  begin delete from public.openrouter_provider_receipts; raise exception 'delete accepted'; exception when sqlstate '55000' then null; end;
end $$;
rollback;
