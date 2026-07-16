alter table public.invoice_schedules
  add column if not exists schedule_type text not null default 'recurring',
  add column if not exists completed_at timestamptz;

alter table public.invoice_schedules
  drop constraint if exists invoice_schedules_schedule_type_check,
  drop constraint if exists invoice_schedules_frequency_rules;

alter table public.invoice_schedules
  alter column frequency drop not null;

alter table public.invoice_schedules
  add constraint invoice_schedules_schedule_type_check
    check (schedule_type in ('once', 'recurring')),
  add constraint invoice_schedules_frequency_rules check (
    (
      schedule_type = 'once'
      and frequency is null
      and day_of_week is null
      and day_of_month is null
    )
    or
    (
      schedule_type = 'recurring'
      and (
        (frequency = 'daily' and day_of_week is null and day_of_month is null) or
        (frequency = 'weekly' and day_of_week is not null and day_of_month is null) or
        (frequency = 'monthly' and day_of_month is not null and day_of_week is null)
      )
    )
  );

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

  update public.invoices
     set status = 'sent'
   where id = v_invoice.id;

  if v_schedule.schedule_type = 'once' then
    update public.invoice_schedules
       set last_run_at = v_invoice.scheduled_for,
           next_run_at = null,
           is_active = false,
           completed_at = now()
     where id = v_schedule.id;
    return;
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

  update public.invoice_schedules
     set last_run_at = v_invoice.scheduled_for,
         next_run_at = v_next_run
   where id = v_schedule.id;
end;
$$;

create or replace function public.repair_completed_invoice_schedule(
  p_schedule_id uuid,
  p_scheduled_for timestamptz
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule public.invoice_schedules%rowtype;
  v_local_run timestamp;
  v_next_local timestamp;
  v_next_run timestamptz;
  v_target_month date;
  v_target_day integer;
begin
  select *
    into v_schedule
    from public.invoice_schedules
   where id = p_schedule_id
   for update;

  if not found or v_schedule.next_run_at <> p_scheduled_for then
    return null;
  end if;

  if not exists (
    select 1
      from public.invoices
     where schedule_id = p_schedule_id
       and scheduled_for = p_scheduled_for
       and status in ('sent', 'reminded', 'paid')
  ) then
    return null;
  end if;

  if v_schedule.schedule_type = 'once' then
    update public.invoice_schedules
       set last_run_at = p_scheduled_for,
           next_run_at = null,
           is_active = false,
           completed_at = now()
     where id = p_schedule_id;
    return null;
  end if;

  v_local_run := p_scheduled_for at time zone v_schedule.timezone;

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

  update public.invoice_schedules
     set last_run_at = p_scheduled_for,
         next_run_at = v_next_run
   where id = p_schedule_id;

  return v_next_run;
end;
$$;

revoke all on function public.complete_scheduled_invoice(uuid)
  from public, anon, authenticated;
grant execute on function public.complete_scheduled_invoice(uuid)
  to service_role;

revoke all on function public.repair_completed_invoice_schedule(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.repair_completed_invoice_schedule(uuid, timestamptz)
  to service_role;
