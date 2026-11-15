-- PR #1001 re-check: agreed_cents is the price of the child's newest started plan start, even when that price is null.
-- The earlier version skipped a newest start with no price and used an older start's price; now a null newest price
-- reads as unknown. Same arguments, same admin-only check and grants as migration admin_child_unit_cost_fixes.
create or replace function public.admin_child_unit_cost_families()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then raise exception 'admin only' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'parent_id', p.id, 'name', p.name, 'email', p.email, 'time_zone', p.time_zone, 'postal', p.postal,
      'is_test', p.id in (select t.parent_id from public.test_accounts t union select a.user_id from public.admin_users a),
      'children', (
        select jsonb_agg(jsonb_build_object(
          'id', c.id, 'first_name', c.first_name, 'created_at', c.created_at, 'province', c.province,
          'plan_kind', s.kind, 'monthly_cents', s.monthly_cents, 'ends_at', s.ends_at, 'ending_free', s.ending_free,
          'agreed_cents', (
            select ps.monthly_cents from public.card_setups cs join public.plan_starts ps on ps.card_setup_id = cs.id
            where cs.child_id = c.id and ps.state = 'started'
            order by ps.generation desc, ps.started_at desc limit 1
          )
        ) order by c.created_at, c.id)
        from public.children c left join public.child_plan_states s on s.child_id = c.id
        where c.parent_id = p.id
      )
    ) order by p.created_at, p.id)
    from public.parents p
    where exists (select 1 from public.children c where c.parent_id = p.id)
  ), '[]'::jsonb);
end $$;
revoke all on function public.admin_child_unit_cost_families() from public, anon;
grant execute on function public.admin_child_unit_cost_families() to authenticated, service_role;
