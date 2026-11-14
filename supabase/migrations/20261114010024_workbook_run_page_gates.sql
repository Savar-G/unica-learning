-- The page layout gate (#859, spec #850 slice D) stores one row per rendered page of a workbook run in
-- public.workbook_run_gates, at the call key "page:<page>" (question gates keep "<page>:<call>:<slot or panel>"), with
-- the flags text_cut_off, overlap and box_too_small. Additive: both checks only widen, so every stored row and every
-- write of the running site still passes. The table's policies, grants, fence and save function are unchanged.

alter table public.workbook_run_gates drop constraint workbook_run_gates_call_key_check;
alter table public.workbook_run_gates add constraint workbook_run_gates_call_key_check
  check (call_key ~ '^([0-9]{1,4}:[0-9]:([0-9]{1,3}\.[0-9]{1,3}|e[0-9]{1,3})|page:[0-9]{1,4})$');

alter table public.workbook_run_gates drop constraint workbook_run_gates_flags_check;
alter table public.workbook_run_gates add constraint workbook_run_gates_flags_check
  check (
    cardinality(flags) <= 4
    and flags <@ array['reading_level', 'one_right_answer', 'picture_matches', 'uses_interest',
      'text_cut_off', 'overlap', 'box_too_small']::text[]
  );
