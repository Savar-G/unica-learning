-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_signup_curriculum, 2026-10-07.
-- The reserve form asks which provincial curriculum the child follows (auto-filled from the postal code).
-- Nullable so rows from before this change stay valid.
alter table public.signups
  add column curriculum text check (curriculum in ('BC', 'AB', 'SK', 'MB', 'ON', 'other'));
