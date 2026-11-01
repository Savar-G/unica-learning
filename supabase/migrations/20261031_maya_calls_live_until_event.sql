-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration maya_calls_live_until_event, 2026-10-31.
-- Maya's calls (#323): an ended call keeps its saved session in `live` until its learning event is written, so a later
-- request can write the event from the call's final state when the first try failed (src/lib/maya-call.ts). A live
-- call still always has `live`. The table is new and has no rows that the old rule allowed and this one does not.
-- Additive in effect: the rule only allows more.
alter table public.maya_calls drop constraint maya_calls_check3;
alter table public.maya_calls add constraint maya_calls_live_state check (status = 'ended' or live is not null);
alter table public.maya_calls add constraint maya_calls_live_until_event check (live is null or status = 'live' or learning_event_id is null);
