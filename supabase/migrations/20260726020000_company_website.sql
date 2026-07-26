alter table public.companies
  add column if not exists website text,
  add column if not exists website_from_brreg boolean not null default false;
