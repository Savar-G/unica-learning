-- Applied to cdjobwsyzndtltzfpyqa through Supabase MCP, registry 20261102160823.
-- #434: Both the reader and claim_maya_weekly use overlap on active call coverage.
-- Past audit rows remain intact. Failed rows do not reserve coverage.
create index email_log_maya_weekly_coverage_idx on public.email_log using gin (call_ids)
  where kind = 'maya_weekly' and status in ('claimed', 'sent');
