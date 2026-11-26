-- Keep existing grades valid while allowing upper-grade assessment records.
alter table public.children
  drop constraint children_grade_check,
  add constraint children_grade_check check (grade between 0 and 12);

alter table public.assessments
  drop constraint assessments_grade_check,
  add constraint assessments_grade_check check (grade between 0 and 12);

alter table public.anonymous_tests
  drop constraint anonymous_tests_grade_check,
  add constraint anonymous_tests_grade_check check (grade between 0 and 12);
