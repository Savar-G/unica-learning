-- Reserve form asks for the child's grade (1-7, BC ages 6-12) instead of age.
-- Apply to project "pagewise" (cdjobwsyzndtltzfpyqa) BEFORE deploying the code that sends grade.
-- Backwards compatible: the old code (sends age) keeps working after this runs.
alter table public.signups add column grade smallint check (grade between 1 and 7);
alter table public.signups alter column age drop not null;
alter table public.signups add constraint signups_age_or_grade check (age is not null or grade is not null);
