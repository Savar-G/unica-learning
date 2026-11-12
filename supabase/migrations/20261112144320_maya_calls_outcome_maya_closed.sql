-- Maya's own close of an unsolved question (D-199 close after two wrong final answers, the "this one is hard" close)
-- gets its own outcome reason, so it is no longer recorded as child_stopped. Additive: every old value stays valid.
alter table public.maya_calls drop constraint maya_calls_outcome_reason_check;
alter table public.maya_calls add constraint maya_calls_outcome_reason_check
  check (outcome_reason = any (array['solved'::text, 'child_stopped'::text, 'time_limit'::text, 'no_response'::text, 'technical_issue'::text, 'content_issue'::text, 'safety'::text, 'maya_closed'::text]));
