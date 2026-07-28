drop policy if exists "company_logos_storage_select" on storage.objects;
create policy "company_logos_storage_select"
  on storage.objects
  for select
  using (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "company_logos_storage_insert" on storage.objects;
create policy "company_logos_storage_insert"
  on storage.objects
  for insert
  with check (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "company_logos_storage_update" on storage.objects;
create policy "company_logos_storage_update"
  on storage.objects
  for update
  using (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "company_logos_storage_delete" on storage.objects;
create policy "company_logos_storage_delete"
  on storage.objects
  for delete
  using (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
