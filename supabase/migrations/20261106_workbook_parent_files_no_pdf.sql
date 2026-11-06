-- Workbook print files remain with the team. The parent desk still needs its shipped page PNGs.
-- Restrictive: a later permissive policy cannot grant parents PDF access by itself.
create policy "Workbook print files stay with the team" on storage.objects
  as restrictive for select to authenticated
  using (
    bucket_id <> 'workbook-pages'
    or (select public.is_admin())
    or (lower(storage.extension(name)) = 'png' and metadata->>'mimetype' = 'image/png')
  );
