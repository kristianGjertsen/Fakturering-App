alter table public.invoice_schedules
  add column if not exists pdf_template text not null default 'classic'
  check (pdf_template in ('classic', 'modern', 'minimal'));

alter table public.invoices
  add column if not exists pdf_template text not null default 'classic'
  check (pdf_template in ('classic', 'modern', 'minimal'));

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
begin
  if new.schedule_id is null or new.scheduled_for is null then
    new.invoice_origin := coalesce(new.invoice_origin, 'standard');
    return new;
  end if;

  select timezone, payment_terms_days, invoice_notes, send_copy, pdf_template
    into v_timezone, v_payment_terms_days, v_invoice_notes, v_send_copy, v_pdf_template
    from public.invoice_schedules
   where id = new.schedule_id;

  if found then
    new.issue_date := (new.scheduled_for at time zone v_timezone)::date;
    new.due_date := new.issue_date + v_payment_terms_days;
    new.notes := v_invoice_notes;
    new.invoice_origin := 'recurring_generated';
    new.send_copy := v_send_copy;
    new.pdf_template := v_pdf_template;
  end if;

  return new;
end;
$$;
