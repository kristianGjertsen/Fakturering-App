alter table public.companies
  add column if not exists address text,
  add column if not exists postal_address text,
  add column if not exists country text default 'Norway';

alter table public.companies
  drop column if exists city;

alter table public.invoices
  drop column if exists recipient_city;

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
  v_pdf_template text;
  v_recipient_name text;
  v_recipient_org_number text;
  v_recipient_email text;
  v_recipient_country text;
begin
  if new.schedule_id is null or new.scheduled_for is null then
    new.title := coalesce(nullif(btrim(new.title), ''), new.invoice_number);
    return new;
  end if;

  select
    schedule.timezone,
    schedule.payment_terms_days,
    schedule.invoice_title,
    schedule.invoice_notes,
    schedule.pdf_template,
    company.name,
    company.org_number,
    company.email,
    company.country
    into
      v_timezone,
      v_payment_terms_days,
      v_invoice_title,
      v_invoice_notes,
      v_pdf_template,
      v_recipient_name,
      v_recipient_org_number,
      v_recipient_email,
      v_recipient_country
    from public.invoice_schedules schedule
    join public.companies company on company.id = schedule.company_id
   where schedule.id = new.schedule_id;

  if found then
    new.title := coalesce(nullif(btrim(v_invoice_title), ''), new.invoice_number);
    new.issue_date := (new.scheduled_for at time zone v_timezone)::date;
    new.due_date := new.issue_date + v_payment_terms_days;
    new.notes := v_invoice_notes;
    new.pdf_template := v_pdf_template;
    new.recipient_name := v_recipient_name;
    new.recipient_org_number := v_recipient_org_number;
    new.recipient_email := v_recipient_email;
    new.recipient_country := v_recipient_country;
  end if;

  return new;
end;
$$;

create or replace function public.claim_scheduled_invoice(
  p_schedule_id uuid,
  p_scheduled_for timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule public.invoice_schedules%rowtype;
  v_invoice public.invoices%rowtype;
  v_invoice_id uuid;
  v_subtotal numeric(12, 2);
  v_vat_total numeric(12, 2);
  v_total numeric(12, 2);
  v_company jsonb;
  v_items jsonb;
begin
  select *
    into v_schedule
    from public.invoice_schedules
   where id = p_schedule_id
   for update;

  if not found
     or not v_schedule.is_active
     or not v_schedule.auto_send
     or v_schedule.next_run_at is null
     or v_schedule.next_run_at <> p_scheduled_for
     or v_schedule.next_run_at > now() then
    return null;
  end if;

  select *
    into v_invoice
    from public.invoices
   where schedule_id = p_schedule_id
     and scheduled_for = p_scheduled_for
   for update;

  if found then
    if v_invoice.status <> 'draft' then
      return null;
    end if;

    update public.invoices
       set status = 'sending'
     where id = v_invoice.id
     returning * into v_invoice;
  else
    if not exists (
      select 1
        from public.invoice_schedule_lines
       where schedule_id = p_schedule_id
    ) then
      raise exception 'Schedule % has no invoice lines', p_schedule_id;
    end if;

    select
      round(sum(quantity * unit_price), 2),
      round(sum(quantity * unit_price * vat_rate / 100), 2),
      round(sum(quantity * unit_price * (1 + vat_rate / 100)), 2)
      into v_subtotal, v_vat_total, v_total
      from public.invoice_schedule_lines
     where schedule_id = p_schedule_id;

    v_invoice_id := gen_random_uuid();

    insert into public.invoices (
      id,
      owner_user_id,
      company_id,
      schedule_id,
      scheduled_for,
      invoice_number,
      issue_date,
      due_date,
      status,
      notes,
      subtotal,
      vat_total,
      total
    ) values (
      v_invoice_id,
      v_schedule.owner_user_id,
      v_schedule.company_id,
      v_schedule.id,
      p_scheduled_for,
      'F-' || to_char(p_scheduled_for at time zone v_schedule.timezone, 'YYYYMMDD') || '-' || upper(substr(v_invoice_id::text, 1, 8)),
      (p_scheduled_for at time zone v_schedule.timezone)::date,
      (p_scheduled_for at time zone v_schedule.timezone)::date + 14,
      'draft',
      v_schedule.title,
      coalesce(v_subtotal, 0),
      coalesce(v_vat_total, 0),
      coalesce(v_total, 0)
    )
    returning * into v_invoice;

    insert into public.invoice_items (
      invoice_id,
      product_id,
      description,
      quantity,
      unit,
      unit_price,
      vat_rate,
      line_subtotal,
      line_vat,
      line_total,
      sort_order
    )
    select
      v_invoice.id,
      line.product_id,
      line.description,
      line.quantity,
      line.unit,
      line.unit_price,
      line.vat_rate,
      round(line.quantity * line.unit_price, 2),
      round(line.quantity * line.unit_price * line.vat_rate / 100, 2),
      round(line.quantity * line.unit_price * (1 + line.vat_rate / 100), 2),
      line.sort_order
    from public.invoice_schedule_lines line
    where line.schedule_id = p_schedule_id;

    update public.invoices
       set status = 'sending'
     where id = v_invoice.id
     returning * into v_invoice;
  end if;

  select jsonb_build_object(
    'id', company.id,
    'name', company.name,
    'org_number', company.org_number,
    'email', company.email,
    'address', company.address,
    'postal_address', company.postal_address,
    'country', company.country
  )
    into v_company
    from public.companies company
   where company.id = v_invoice.company_id;

  select coalesce(
    jsonb_agg(to_jsonb(item) order by item.sort_order),
    '[]'::jsonb
  )
    into v_items
    from public.invoice_items item
   where item.invoice_id = v_invoice.id;

  return to_jsonb(v_invoice)
    || jsonb_build_object('company', v_company, 'invoice_items', v_items);
end;
$$;
