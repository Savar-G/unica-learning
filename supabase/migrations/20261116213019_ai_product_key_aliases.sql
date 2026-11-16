-- Expand safe labels only. Historical labels remain valid. Root applies this before the new clients ship.
alter table public.ai_usage_events drop constraint ai_usage_events_key_alias_check;
alter table public.ai_usage_events add constraint ai_usage_events_key_alias_check
  check (key_alias in ('main', 'marking', 'explanations', 'decisions', 'local', 'anthropic', 'unknown', 'maya', 'workbook', 'assessments', 'profiles'));
