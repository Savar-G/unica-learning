-- #715 (D-266): our team's mark of an unsure answer is a row in the mark journal with actor 'admin'
-- (public.admin_set_scan_mark, migration 20261107204619_scan_team_marks). The journal's actor check allowed only
-- 'parent'. This widens it to 'parent' or 'admin'. Every existing row is 'parent', so it passes the new check, and
-- the parent change keeps writing 'parent'. The paired check scan_mark_changes_admin_actor keeps admin_id on team
-- rows only.
--
-- It replaces one check constraint, so the orchestrator applies it, not the agent (a DROP prompt hangs agents).
alter table public.scan_mark_changes drop constraint scan_mark_changes_actor_check;
alter table public.scan_mark_changes add constraint scan_mark_changes_actor_check check (actor in ('parent', 'admin'));
