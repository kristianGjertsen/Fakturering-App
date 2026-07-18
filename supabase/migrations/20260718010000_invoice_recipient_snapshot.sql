alter table public.invoices
  alter column company_id drop not null,
  add column if not exists recipient_name text,
  add column if not exists recipient_org_number text,
  add column if not exists recipient_email text,
  add column if not exists recipient_country text;

update public.invoices invoice
set
  recipient_name = coalesce(invoice.recipient_name, company.name),
  recipient_org_number = coalesce(invoice.recipient_org_number, company.org_number),
  recipient_email = coalesce(invoice.recipient_email, company.email),
  recipient_country = coalesce(invoice.recipient_country, company.country)
from public.companies company
where company.id = invoice.company_id
  and invoice.recipient_name is null;

update public.invoices
set recipient_name = 'Ukjent mottaker'
where recipient_name is null;

alter table public.invoices
  alter column recipient_name set not null;

drop policy if exists "invoices_owner_access" on public.invoices;
create policy "invoices_owner_access"
  on public.invoices
  for all
  using (auth.uid() = owner_user_id)
  with check (
    auth.uid() = owner_user_id
    and (
      company_id is null
      or exists (
        select 1
        from public.companies company
        where company.id = company_id
          and company.owner_user_id = auth.uid()
      )
    )
  );

create or replace function public.set_scheduled_invoice_due_date()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_timezone text;
  v_payment_terms_days integer;
  v_invoice_notes text;
  v_send_copy boolean;
  v_pdf_template text;
  v_recipient_name text;
  v_recipient_org_number text;
  v_recipient_email text;
  v_recipient_country text;
begin
  if new.schedule_id is null or new.scheduled_for is null then
    new.invoice_origin := coalesce(new.invoice_origin, 'standard');
    return new;
  end if;

  select
    schedule.timezone,
    schedule.payment_terms_days,
    schedule.invoice_notes,
    schedule.send_copy,
    schedule.pdf_template,
    company.name,
    company.org_number,
    company.email,
    company.country
  into
    v_timezone,
    v_payment_terms_days,
    v_invoice_notes,
    v_send_copy,
    v_pdf_template,
    v_recipient_name,
    v_recipient_org_number,
    v_recipient_email,
    v_recipient_country
  from public.invoice_schedules schedule
  join public.companies company on company.id = schedule.company_id
  where schedule.id = new.schedule_id;

  if found then
    new.issue_date := (new.scheduled_for at time zone v_timezone)::date;
    new.due_date := new.issue_date + v_payment_terms_days;
    new.notes := v_invoice_notes;
    new.invoice_origin := 'recurring_generated';
    new.send_copy := v_send_copy;
    new.pdf_template := v_pdf_template;
    new.recipient_name := v_recipient_name;
    new.recipient_org_number := v_recipient_org_number;
    new.recipient_email := v_recipient_email;
    new.recipient_country := v_recipient_country;
  end if;

  return new;
end;
$$;
