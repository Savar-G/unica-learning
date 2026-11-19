-- Accept adaptive rules v2 while preserving the version of every in-progress test.
create or replace function public.lock_assessment_block(p_assessment uuid, p_expected integer, p_adaptive jsonb, p_answers jsonb, p_resume_until timestamptz)
returns text language plpgsql set search_path = '' as $$
declare stored jsonb; actual jsonb;
begin
  select test->'adaptive' into stored from public.assessments
    where id = p_assessment and status = 'in_progress' for update;
  if not found or stored is null then return 'closed'; end if;
  if (stored->>'locked')::integer <> p_expected then return 'changed'; end if;
  if (stored->>'complete')::boolean then return 'closed'; end if;
  select coalesce(jsonb_agg(jsonb_build_array(question_id, response, time_ms) order by position), '[]'::jsonb)
    into actual from public.answers where assessment_id = p_assessment;
  if actual is distinct from p_answers then return 'changed'; end if;
  if coalesce(p_adaptive->>'version', '') not in ('1', '2')
    or p_adaptive->'version' is distinct from stored->'version'
    or (p_adaptive->>'locked')::integer <> p_expected + 1
    or p_adaptive->'pool' is distinct from stored->'pool' then
    raise exception 'Invalid assessment block transition';
  end if;
  update public.assessments set test = jsonb_set(test, '{adaptive}', p_adaptive),
    last_answer_at = greatest(last_answer_at, p_resume_until - interval '24 hours'),
    resume_until = greatest(resume_until, p_resume_until)
    where id = p_assessment;
  return 'stored';
end $$;
