alter table public.invoice_schedules
  alter column send_time set default '03:00';

-- Preserve each schedule's local calendar date, but move its planned run to
-- the single daily processing time. Historical execution timestamps are left intact.
update public.invoice_schedules
set
  send_time = time '03:00',
  next_run_at = case
    when next_run_at is null then null
    else (
      ((next_run_at at time zone timezone)::date + time '03:00')
      at time zone timezone
    )
  end;

alter table public.invoice_schedules
  add constraint invoice_schedules_fixed_send_time
  check (send_time = time '03:00');
