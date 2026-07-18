alter table public.invoice_schedules
  add column if not exists invoice_title text;

alter table public.invoices
  add column if not exists title text;

update public.invoices
set title = invoice_number
where title is null or btrim(title) = '';

alter table public.invoices
  alter column title set not null;

create or replace function public.set_scheduled_invoice_due_date()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_timezone text;
  v_payment_terms_days integer;
  v_invoice_title text;
  v_invoice_notes text;
  v_send_copy boolean;
  v_pdf_template text;
  v_recipient_name text;
  v_recipient_org_number text;
  v_recipient_email text;
  v_recipient_city text;
  v_recipient_country text;
begin
  if new.schedule_id is null or new.scheduled_for is null then
    new.title := coalesce(nullif(btrim(new.title), ''), new.invoice_number);
    new.invoice_origin := coalesce(new.invoice_origin, 'standard');
    return new;
  end if;

  select
    schedule.timezone,
    schedule.payment_terms_days,
    schedule.invoice_title,
    schedule.invoice_notes,
    schedule.send_copy,
    schedule.pdf_template,
    company.name,
    company.org_number,
    company.email,
    company.city,
    company.country
  into
    v_timezone,
    v_payment_terms_days,
    v_invoice_title,
    v_invoice_notes,
    v_send_copy,
    v_pdf_template,
    v_recipient_name,
    v_recipient_org_number,
    v_recipient_email,
    v_recipient_city,
    v_recipient_country
  from public.invoice_schedules schedule
  join public.companies company on company.id = schedule.company_id
  where schedule.id = new.schedule_id;

  if found then
    new.title := coalesce(nullif(btrim(v_invoice_title), ''), new.invoice_number);
    new.issue_date := (new.scheduled_for at time zone v_timezone)::date;
    new.due_date := new.issue_date + v_payment_terms_days;
    new.notes := v_invoice_notes;
    new.invoice_origin := 'recurring_generated';
    new.send_copy := v_send_copy;
    new.pdf_template := v_pdf_template;
    new.recipient_name := v_recipient_name;
    new.recipient_org_number := v_recipient_org_number;
    new.recipient_email := v_recipient_email;
    new.recipient_city := v_recipient_city;
    new.recipient_country := v_recipient_country;
  else
    new.title := coalesce(nullif(btrim(new.title), ''), new.invoice_number);
  end if;

  return new;
end;
$$;
