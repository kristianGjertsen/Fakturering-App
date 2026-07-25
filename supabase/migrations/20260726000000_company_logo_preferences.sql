alter table public.companies
  add column if not exists logo_disabled boolean not null default false,
  add column if not exists logo_url text,
  add column if not exists logo_source text;
