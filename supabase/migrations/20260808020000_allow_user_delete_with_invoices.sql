alter table public.invoices
  drop constraint if exists invoices_company_id_fkey;

alter table public.invoices
  add constraint invoices_company_id_fkey
  foreign key (company_id)
  references public.companies (id)
  on delete set null;
