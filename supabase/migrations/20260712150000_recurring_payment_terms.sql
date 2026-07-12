alter table public.invoice_schedules
  add column if not exists payment_terms_days integer not null default 14
  check (payment_terms_days between 0 and 365);

alter table public.invoice_schedules
  add column if not exists invoice_notes text;

create or replace function public.set_scheduled_invoice_due_date()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_timezone text;
  v_payment_terms_days integer;
  v_invoice_notes text;
begin
  if new.schedule_id is null or new.scheduled_for is null then
    return new;
  end if;

  select timezone, payment_terms_days, invoice_notes
    into v_timezone, v_payment_terms_days, v_invoice_notes
    from public.invoice_schedules
   where id = new.schedule_id;

  if found then
    new.issue_date := (new.scheduled_for at time zone v_timezone)::date;
    new.due_date := new.issue_date + v_payment_terms_days;
    new.notes := v_invoice_notes;
  end if;

  return new;
end;
$$;

drop trigger if exists invoices_set_scheduled_due_date on public.invoices;
create trigger invoices_set_scheduled_due_date
  before insert on public.invoices
  for each row execute procedure public.set_scheduled_invoice_due_date();
