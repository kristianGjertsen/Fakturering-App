alter table public.invoices
  add column if not exists paid boolean not null default false;

