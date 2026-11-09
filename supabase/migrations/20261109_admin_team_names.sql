-- Admin review tab: show each comment's author by name. Admins read the team's display names only
-- (no email); everyone else gets no rows. Additive: a new read function, no table or policy change.
create function public.admin_team_names()
returns table (user_id uuid, name text)
language sql stable security definer set search_path = ''
as $$ select a.user_id, a.name from public.admin_users a where (select public.is_admin()) $$;
revoke all on function public.admin_team_names() from public, anon;
grant execute on function public.admin_team_names() to authenticated;
