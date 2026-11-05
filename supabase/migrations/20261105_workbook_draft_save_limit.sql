-- The first customer's run (5ead6729, 82 pages, 2.3 MB) lost both tries at its last step: the insert of the draft hit
-- the 8 s statement limit PostgREST applies to every request. The same insert takes about 0.25 s on a calm database, so
-- a slow moment must not throw away a finished book. The worker waits for this call anyway: 120 s for this one function.
-- PostgREST applies a function's statement_timeout setting to the call (db-hoisted-tx-settings).
alter function public.save_workbook_run_draft(uuid, uuid, jsonb, integer, smallint[], text, text, smallint, integer, integer, integer, integer, integer)
  set statement_timeout = '120s';
