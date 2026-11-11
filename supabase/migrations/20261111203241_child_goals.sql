-- Parent goals, first version (D-323, 2026-11-11): one row per child in a new table. Applied, then replaced the same day
-- by migration child_goals_on_children, which drops this table before any code used it (Savar chose one set of answers
-- on public.children). Kept here because the database history holds it.
create table public.child_goals (
  child_id uuid primary key,
  parent_id uuid not null references public.parents (id) on delete cascade,
  main_goal text not null check (main_goal in ('catch_up', 'confident', 'next_grade', 'get_ahead', 'not_sure')),
  feeling text not null check (feeling in ('enjoys', 'okay', 'finds_hard', 'upset')),
  help_now text not null check (help_now in ('school_only', 'parent', 'tutor', 'app')),
  answered_at timestamptz not null default now(),
  constraint child_goals_child_fkey foreign key (child_id, parent_id) references public.children (id, parent_id) on delete cascade
);
create index child_goals_parent_idx on public.child_goals (parent_id);

alter table public.child_goals enable row level security;
revoke all on table public.child_goals from anon, authenticated, service_role;
grant select, insert, update on table public.child_goals to service_role;
grant select on table public.child_goals to authenticated;
create policy "Parents read their children's goals" on public.child_goals
  for select to authenticated using (parent_id = (select auth.uid()));
create policy "Admins read child goals" on public.child_goals
  for select to authenticated using ((select public.is_admin()));

create trigger fence_family_write before insert or update on public.child_goals
  for each row execute function public.fence_family_write();
create trigger fence_child_delete_write before insert or update on public.child_goals
  for each row execute function public.fence_child_delete_write();
