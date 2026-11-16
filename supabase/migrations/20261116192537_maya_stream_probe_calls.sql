-- Synthetic transport proof only. No production row, FK, trigger, index or policy is copied.
-- LIKE INCLUDING DEFAULTS retains column types and NOT NULL. It does not copy CHECK or FK constraints.
create table public.maya_stream_probe_calls (
  like public.maya_calls including defaults,
  primary key (id),
  constraint maya_stream_probe_identity check (
    id in (
      '00000000-0000-4000-8000-000000001101'::uuid,
      '00000000-0000-4000-8000-000000001102'::uuid,
      '00000000-0000-4000-8000-000000001103'::uuid,
      '00000000-0000-4000-8000-000000001104'::uuid,
      '00000000-0000-4000-8000-000000001105'::uuid,
      '00000000-0000-4000-8000-000000001106'::uuid,
      '00000000-0000-4000-8000-000000001107'::uuid,
      '00000000-0000-4000-8000-000000001108'::uuid
    )
    and parent_id is not distinct from '11111111-1111-4111-8111-111111111111'::uuid
    and child_id is not distinct from '22222222-2222-4222-8222-222222222222'::uuid
    and started_by is not distinct from '11111111-1111-4111-8111-111111111111'::uuid
    and model is not distinct from 'fake'
    and kind is not distinct from 'chat' and mode is not distinct from 'text'
    and counts_minutes is false
    and question_source is not distinct from 'workbook'
    and workbook_id is not distinct from '44444444-4444-4444-8444-444444444444'::uuid
    and workbook_page is not distinct from 1 and workbook_question is not distinct from 1
    and assessment_id is null and assessment_question_id is null
  )
);

alter table public.maya_stream_probe_calls enable row level security;
revoke all on table public.maya_stream_probe_calls from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.maya_stream_probe_calls to service_role;

comment on table public.maya_stream_probe_calls is
  'Fixed synthetic Maya stream probe rows. Service only. No production call, family or sweep reader uses this table.';
