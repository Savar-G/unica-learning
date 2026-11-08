-- Supabase JWTs can remain cryptographically valid after sign-out. Image access requires a live Auth session too.
create function public.scan_session_active(p_user uuid,p_session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from auth.sessions where id=p_session and user_id=p_user and (not_after is null or not_after>now()));
$$;
revoke all on function public.scan_session_active(uuid,uuid) from public,anon,authenticated;
grant execute on function public.scan_session_active(uuid,uuid) to service_role;
