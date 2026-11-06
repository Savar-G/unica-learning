-- Stored question packages include the complete key. Shipping alone must not release them to a parent.
-- Keep the existing permissive Admin policy and service-role bypass, page metadata and PNG file policies.
create policy "Workbook answers require confirmed delivery" on public.workbook_questions
  as restrictive for select to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1
      from public.workbooks w
      join public.workbook_delivery_receipts r
        on r.workbook_id = w.id and r.parent_id = w.parent_id
        and r.child_id = w.child_id and r.number = w.number
      left join lateral (
        -- Choose the latest audit before checking identity or time. An invalid latest row cannot use an older date.
        select c.workbook_id, c.parent_id, c.child_id, c.number, c.delivered_at
        from public.workbook_delivery_corrections c
        where c.workbook_id = w.id
        order by c.audit_id desc
        limit 1
      ) latest on true
      where w.id = workbook_questions.workbook_id
        and w.parent_id = workbook_questions.parent_id
        and w.parent_id = (select auth.uid())
        and w.status = 'shipped'
        and (latest.workbook_id is null or (
          latest.parent_id = w.parent_id and latest.child_id = w.child_id and latest.number = w.number
        ))
        and coalesce(latest.delivered_at, r.delivered_at) <= statement_timestamp()
    )
  );
