alter table public.invoices
  add column if not exists scheduled_for timestamptz;

alter table public.invoices
  drop constraint if exists invoices_status_check;

alter table public.invoices
  add constraint invoices_status_check
  check (status in ('draft', 'sending', 'ready', 'sent', 'reminded', 'paid', 'cancelled'));

create unique index if not exists invoices_schedule_occurrence_idx
  on public.invoices (schedule_id, scheduled_for)
  where schedule_id is not null and scheduled_for is not null;

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
    'email', company.email
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

create or replace function public.complete_scheduled_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_schedule public.invoice_schedules%rowtype;
  v_local_run timestamp;
  v_next_local timestamp;
  v_next_run timestamptz;
  v_target_month date;
  v_target_day integer;
begin
  select *
    into v_invoice
    from public.invoices
   where id = p_invoice_id
   for update;

  if not found or v_invoice.status <> 'sending' or v_invoice.schedule_id is null then
    raise exception 'Invoice % is not a claimed scheduled invoice', p_invoice_id;
  end if;

  select *
    into v_schedule
    from public.invoice_schedules
   where id = v_invoice.schedule_id
   for update;

  if not found or v_schedule.next_run_at <> v_invoice.scheduled_for then
    raise exception 'Schedule occurrence changed for invoice %', p_invoice_id;
  end if;

  v_local_run := v_invoice.scheduled_for at time zone v_schedule.timezone;

  loop
    if v_schedule.frequency = 'daily' then
      v_next_local := v_local_run + make_interval(days => v_schedule.interval_count);
    elsif v_schedule.frequency = 'weekly' then
      v_next_local := v_local_run + make_interval(days => v_schedule.interval_count * 7);
    else
      v_target_month := (date_trunc('month', v_local_run)::date + make_interval(months => v_schedule.interval_count))::date;
      v_target_day := least(
        v_schedule.day_of_month,
        extract(day from (v_target_month + interval '1 month - 1 day'))::integer
      );
      v_next_local := (v_target_month + (v_target_day - 1))::date + v_schedule.send_time;
    end if;

    v_next_run := v_next_local at time zone v_schedule.timezone;
    exit when v_next_run > now();
    v_local_run := v_next_local;
  end loop;

  update public.invoices
     set status = 'sent'
   where id = v_invoice.id;

  update public.invoice_schedules
     set last_run_at = v_invoice.scheduled_for,
         next_run_at = v_next_run
   where id = v_schedule.id;
end;
$$;

create or replace function public.release_scheduled_invoice(p_invoice_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.invoices
     set status = 'draft'
   where id = p_invoice_id
     and status = 'sending';
$$;

revoke all on function public.claim_scheduled_invoice(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.complete_scheduled_invoice(uuid) from public, anon, authenticated;
revoke all on function public.release_scheduled_invoice(uuid) from public, anon, authenticated;

grant execute on function public.claim_scheduled_invoice(uuid, timestamptz) to service_role;
grant execute on function public.complete_scheduled_invoice(uuid) to service_role;
grant execute on function public.release_scheduled_invoice(uuid) to service_role;
