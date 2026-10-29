-- The assessment takes Kindergarten to Grade 9 (D-156). A school grade is stored as 0 (Kindergarten) to 9; it was 1 to 7.
-- Additive for the live code: every stored row (1-7) still passes, and code from before this change never writes 0, 8
-- or 9. Apply before the code that offers Kindergarten, Grade 8 and Grade 9 ships: until then the new grades fail the
-- old checks and the parent sees "We could not save your details".
-- Each check was declared on its column, so Postgres named it <table>_grade_check. create_family (add_family_admission)
-- inserts p_child_grade as it is and needs no change. save_family_test_copy compares the copy's grade with the test's.
-- public.signups (the old booking form, no longer offered) keeps 1 to 7.
alter table public.children drop constraint children_grade_check;
alter table public.children add constraint children_grade_check check (grade between 0 and 9);

alter table public.assessments drop constraint assessments_grade_check;
alter table public.assessments add constraint assessments_grade_check check (grade between 0 and 9);

alter table public.anonymous_tests drop constraint anonymous_tests_grade_check;
alter table public.anonymous_tests add constraint anonymous_tests_grade_check check (grade between 0 and 9);
