insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'company-logos',
  'company-logos',
  true,
  2097152,
  array['image/png']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "company_logos_storage_select" on storage.objects;
create policy "company_logos_storage_select"
  on storage.objects
  for select
  using (
    bucket_id = 'company-logos'
    and exists (
      select 1
      from public.companies
      where companies.id::text = (storage.foldername(name))[1]
        and companies.owner_user_id = auth.uid()
    )
  );

drop policy if exists "company_logos_storage_insert" on storage.objects;
create policy "company_logos_storage_insert"
  on storage.objects
  for insert
  with check (
    bucket_id = 'company-logos'
    and exists (
      select 1
      from public.companies
      where companies.id::text = (storage.foldername(name))[1]
        and companies.owner_user_id = auth.uid()
    )
  );

drop policy if exists "company_logos_storage_update" on storage.objects;
create policy "company_logos_storage_update"
  on storage.objects
  for update
  using (
    bucket_id = 'company-logos'
    and exists (
      select 1
      from public.companies
      where companies.id::text = (storage.foldername(name))[1]
        and companies.owner_user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'company-logos'
    and exists (
      select 1
      from public.companies
      where companies.id::text = (storage.foldername(name))[1]
        and companies.owner_user_id = auth.uid()
    )
  );

drop policy if exists "company_logos_storage_delete" on storage.objects;
create policy "company_logos_storage_delete"
  on storage.objects
  for delete
  using (
    bucket_id = 'company-logos'
    and exists (
      select 1
      from public.companies
      where companies.id::text = (storage.foldername(name))[1]
        and companies.owner_user_id = auth.uid()
    )
  );
