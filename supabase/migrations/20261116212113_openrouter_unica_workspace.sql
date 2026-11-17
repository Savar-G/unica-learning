-- This product stores OpenRouter cost evidence only for the Unica workspace.
-- Validate existing rows too: a foreign receipt must stop this migration rather than enter the report.
alter table public.openrouter_provider_receipts
  add constraint openrouter_provider_receipts_unica_workspace
  check (workspace_id = '2468d17e-b7eb-467f-b1ef-feec9e328d58');
