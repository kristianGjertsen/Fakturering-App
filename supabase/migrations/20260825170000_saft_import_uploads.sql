-- SAF-T import uploads.
--
-- Stores uploaded source SAF-T files so profile setup and later import flows can
-- keep the original XML/ZIP file alongside validation/import status.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'saft-imports',
  'saft-imports',
  false,
  52428800,
  array['application/xml', 'text/xml', 'application/zip', 'application/x-zip-compressed']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.saft_import_files (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null,
  original_name text not null check (length(btrim(original_name)) > 0),
  mime_type text not null check (
    mime_type in ('application/xml', 'text/xml', 'application/zip', 'application/x-zip-compressed')
  ),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 52428800),
  status text not null default 'uploaded' check (status in ('uploaded', 'validating', 'validated', 'imported', 'failed')),
  detected_saft_version text,
  validation_errors jsonb not null default '[]'::jsonb,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, storage_path)
);

create index if not exists saft_import_files_owner_created_idx
  on public.saft_import_files (owner_user_id, created_at desc);

alter table public.saft_import_files enable row level security;

create policy "saft_import_files_owner_access" on public.saft_import_files
  for all using (auth.uid() = owner_user_id) with check (
    auth.uid() = owner_user_id
    and storage_path like auth.uid()::text || '/%'
  );

drop policy if exists "saft_imports_storage_select" on storage.objects;
create policy "saft_imports_storage_select" on storage.objects for select
using (bucket_id = 'saft-imports' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "saft_imports_storage_insert" on storage.objects;
create policy "saft_imports_storage_insert" on storage.objects for insert
with check (bucket_id = 'saft-imports' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "saft_imports_storage_delete" on storage.objects;
create policy "saft_imports_storage_delete" on storage.objects for delete
using (bucket_id = 'saft-imports' and (storage.foldername(name))[1] = auth.uid()::text);

drop trigger if exists saft_import_files_set_updated_at on public.saft_import_files;
create trigger saft_import_files_set_updated_at
  before update on public.saft_import_files
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.saft_import_files to authenticated;
