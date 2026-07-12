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

revoke all on function public.repair_completed_invoice_schedule(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.repair_completed_invoice_schedule(uuid, timestamptz)
  to service_role;
