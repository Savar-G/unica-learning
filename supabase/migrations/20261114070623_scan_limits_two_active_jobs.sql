-- #915 (scan speed): two page checks per family at a time instead of one, so a second photo taken right after the first
-- is checked alongside it instead of waiting for it. Scan marking jobs share the same per-family slots
-- (scan_active_jobs), so a family can also have two pages marked at once; spend stays under the existing monthly cap,
-- holds and the #868 retry rules. Additive: one value in the singleton row; the check constraint (> 0) is unchanged.
update public.scan_limits set active_jobs = 2 where singleton and active_jobs = 1;
