-- D-145 follow-up (2026-10-24): the site calls the 5-argument complete_test since PR #273, which is live, so the
-- 6-argument one with p_extra_finished (migration add_guarded_finish) goes. It changes no data.
drop function public.complete_test(uuid, timestamptz, jsonb, text, boolean, jsonb);
