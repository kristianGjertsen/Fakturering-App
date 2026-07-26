alter table public.companies
  add column if not exists contact_person text,
  add column if not exists phone text,
  add column if not exists payment_terms_days integer not null default 14
    check (payment_terms_days between 0 and 365),
  add column if not exists invoice_notes text;
