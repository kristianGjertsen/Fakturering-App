alter table public.companies
  add column if not exists logo_disabled boolean not null default false;
