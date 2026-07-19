create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text unique,
  full_name text,
  company_name text,
  address text,
  postal_address text,
  country text not null default 'NO',
  org_number text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.profile_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  account_name text not null,
  account_number text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, company_name, address, postal_address, country, org_number)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'company_name',
    new.raw_user_meta_data ->> 'address',
    new.raw_user_meta_data ->> 'postal_address',
    coalesce(nullif(new.raw_user_meta_data ->> 'country', ''), 'NO'),
    new.raw_user_meta_data ->> 'org_number'
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.profiles.full_name),
        company_name = coalesce(excluded.company_name, public.profiles.company_name),
        address = coalesce(excluded.address, public.profiles.address),
        postal_address = coalesce(excluded.postal_address, public.profiles.postal_address),
        country = coalesce(excluded.country, public.profiles.country),
        org_number = coalesce(excluded.org_number, public.profiles.org_number);

  insert into public.profile_bank_accounts (profile_id, account_name, account_number)
  select
    new.id,
    nullif(btrim(account ->> 'account_name'), ''),
    nullif(btrim(account ->> 'account_number'), '')
  from jsonb_array_elements(
    case
      when jsonb_typeof(new.raw_user_meta_data -> 'bank_accounts') = 'array'
        then new.raw_user_meta_data -> 'bank_accounts'
      else '[]'::jsonb
    end
  ) account
  where nullif(btrim(account ->> 'account_name'), '') is not null
    and nullif(btrim(account ->> 'account_number'), '') is not null;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  org_number text,
  email text,
  address text,
  postal_address text,
  country text not null default 'NO',
  
  private_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  description text,
  unit text not null default 'stk',
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  vat_rate numeric(5, 2) not null default 25 check (vat_rate >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoice_schedules (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null,
  invoice_title text,
  schedule_type text not null default 'recurring' check (schedule_type in ('once', 'recurring')),
  frequency text check (frequency in ('daily', 'weekly', 'monthly')),
  interval_count integer not null default 1 check (interval_count > 0),
  day_of_week integer check (day_of_week between 1 and 7),
  day_of_month integer check (day_of_month between 1 and 31),
  send_time time not null default '03:00' check (send_time = time '03:00'),
  timezone text not null default 'Europe/Oslo',
  start_date date not null default current_date,
  next_run_at timestamptz,
  last_run_at timestamptz,
  completed_at timestamptz,
  is_active boolean not null default true,
  auto_send boolean not null default false,
  payment_terms_days integer not null default 14 check (payment_terms_days between 0 and 365),
  invoice_notes text,
  pdf_template text not null default 'classic' check (pdf_template in ('classic', 'modern', 'minimal')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoice_schedules_frequency_rules check (
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
  )
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles (id) on delete cascade,
  company_id uuid references public.companies (id) on delete restrict,
  recipient_name text not null,
  recipient_org_number text,
  recipient_email text,
  recipient_country text,
  schedule_id uuid references public.invoice_schedules (id) on delete set null,
  scheduled_for timestamptz,
  invoice_number text not null,
  title text not null,
  issue_date date not null default current_date,
  due_date date,
  status text not null default 'draft' check (status in ('draft', 'sending', 'ready', 'sent', 'reminded', 'paid', 'cancelled')),
  paid boolean not null default false,
  pdf_template text not null default 'classic' check (pdf_template in ('classic', 'modern', 'minimal')),
  notes text,
  subtotal numeric(12, 2) not null default 0 check (subtotal >= 0),
  vat_total numeric(12, 2) not null default 0 check (vat_total >= 0),
  total numeric(12, 2) not null default 0 check (total >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, invoice_number)
);

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  description text not null,
  quantity numeric(12, 2) not null default 1 check (quantity > 0),
  unit text not null default 'stk',
  unit_price numeric(12, 2) not null default 0 check (unit_price >= 0),
  vat_rate numeric(5, 2) not null default 25 check (vat_rate >= 0),
  line_subtotal numeric(12, 2) not null default 0 check (line_subtotal >= 0),
  line_vat numeric(12, 2) not null default 0 check (line_vat >= 0),
  line_total numeric(12, 2) not null default 0 check (line_total >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.invoice_schedule_lines (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.invoice_schedules (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  description text not null,
  quantity numeric(12, 2) not null default 1 check (quantity > 0),
  unit text not null default 'stk',
  unit_price numeric(12, 2) not null default 0 check (unit_price >= 0),
  vat_rate numeric(5, 2) not null default 25 check (vat_rate >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.invoice_cron_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  cutoff_at timestamptz not null,
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'completed', 'partial', 'interrupted', 'failed')),
  trigger_source text not null default 'unknown',
  due_count integer not null default 0,
  processed_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  skipped_count integer not null default 0,
  deferred_count integer not null default 0,
  interrupted_count integer not null default 0,
  error_message text
);

create table if not exists public.invoice_cron_run_items (
  id bigint generated by default as identity primary key,
  run_id uuid not null references public.invoice_cron_runs (id) on delete cascade,
  owner_user_id uuid not null references public.profiles (id) on delete cascade,
  schedule_id uuid references public.invoice_schedules (id) on delete set null,
  schedule_title text not null,
  scheduled_for timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed', 'skipped', 'deferred', 'interrupted')),
  reason text,
  invoice_id uuid references public.invoices (id) on delete set null,
  resend_email_id text,
  started_at timestamptz,
  finished_at timestamptz,
  unique (run_id, schedule_id)
);

create table if not exists public.invoice_cron_run_reports (
  run_id uuid not null references public.invoice_cron_runs (id) on delete cascade,
  owner_user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed')),
  sent_at timestamptz,
  error_message text,
  primary key (run_id, owner_user_id)
);

create or replace function public.finalize_invoice_cron_run(
  p_run_id uuid,
  p_status text,
  p_error_message text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('completed', 'partial', 'interrupted', 'failed') then
    raise exception 'Invalid final cron status: %', p_status;
  end if;

  update public.invoice_cron_runs run
     set finished_at = now(),
         status = p_status,
         processed_count = counts.processed_count,
         sent_count = counts.sent_count,
         failed_count = counts.failed_count,
         skipped_count = counts.skipped_count,
         deferred_count = counts.deferred_count,
         interrupted_count = counts.interrupted_count,
         error_message = p_error_message
    from (
      select
        count(*) filter (where status in ('sent', 'failed', 'skipped'))::integer as processed_count,
        count(*) filter (where status = 'sent')::integer as sent_count,
        count(*) filter (where status = 'failed')::integer as failed_count,
        count(*) filter (where status = 'skipped')::integer as skipped_count,
        count(*) filter (where status = 'deferred')::integer as deferred_count,
        count(*) filter (where status = 'interrupted')::integer as interrupted_count
      from public.invoice_cron_run_items
      where run_id = p_run_id
    ) counts
   where run.id = p_run_id;
end;
$$;

revoke all on function public.finalize_invoice_cron_run(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.finalize_invoice_cron_run(uuid, text, text)
  to service_role;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists companies_set_updated_at on public.companies;
create trigger companies_set_updated_at
  before update on public.companies
  for each row execute procedure public.set_updated_at();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

drop trigger if exists profile_bank_accounts_set_updated_at on public.profile_bank_accounts;
create trigger profile_bank_accounts_set_updated_at
  before update on public.profile_bank_accounts
  for each row execute procedure public.set_updated_at();

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute procedure public.set_updated_at();

drop trigger if exists invoice_schedules_set_updated_at on public.invoice_schedules;
create trigger invoice_schedules_set_updated_at
  before update on public.invoice_schedules
  for each row execute procedure public.set_updated_at();

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute procedure public.set_updated_at();

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

drop trigger if exists invoices_set_scheduled_due_date on public.invoices;
create trigger invoices_set_scheduled_due_date
  before insert on public.invoices
  for each row execute procedure public.set_scheduled_invoice_due_date();

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
      (p_scheduled_for at time zone v_schedule.timezone)::date + v_schedule.payment_terms_days,
      'draft',
      v_schedule.invoice_notes,
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

revoke all on function public.claim_scheduled_invoice(uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.complete_scheduled_invoice(uuid)
  from public, anon, authenticated;
revoke all on function public.release_scheduled_invoice(uuid)
  from public, anon, authenticated;

grant execute on function public.claim_scheduled_invoice(uuid, timestamptz)
  to service_role;
grant execute on function public.complete_scheduled_invoice(uuid)
  to service_role;
grant execute on function public.release_scheduled_invoice(uuid)
  to service_role;

alter table public.profiles enable row level security;
alter table public.profile_bank_accounts enable row level security;
alter table public.companies enable row level security;
alter table public.products enable row level security;
alter table public.invoice_schedules enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.invoice_schedule_lines enable row level security;
alter table public.invoice_cron_runs enable row level security;
alter table public.invoice_cron_run_items enable row level security;
alter table public.invoice_cron_run_reports enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles
  for insert
  with check (auth.uid() = id);

drop policy if exists "profile_bank_accounts_owner_access" on public.profile_bank_accounts;
create policy "profile_bank_accounts_owner_access"
  on public.profile_bank_accounts
  for all
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

create or replace function public.save_profile_details(
  p_full_name text,
  p_company_name text,
  p_address text,
  p_postal_address text,
  p_country text,
  p_org_number text,
  p_bank_accounts jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.profiles
     set full_name = nullif(btrim(p_full_name), ''),
         company_name = nullif(btrim(p_company_name), ''),
         address = nullif(btrim(p_address), ''),
         postal_address = nullif(btrim(p_postal_address), ''),
         country = coalesce(nullif(btrim(p_country), ''), 'NO'),
         org_number = nullif(btrim(p_org_number), '')
   where id = auth.uid();

  delete from public.profile_bank_accounts
   where profile_id = auth.uid();

  insert into public.profile_bank_accounts (profile_id, account_name, account_number)
  select
    auth.uid(),
    nullif(btrim(account ->> 'account_name'), ''),
    nullif(btrim(account ->> 'account_number'), '')
  from jsonb_array_elements(
    case
      when jsonb_typeof(p_bank_accounts) = 'array' then p_bank_accounts
      else '[]'::jsonb
    end
  ) account
  where nullif(btrim(account ->> 'account_name'), '') is not null
    and nullif(btrim(account ->> 'account_number'), '') is not null;
end;
$$;

grant execute on function public.save_profile_details(text, text, text, text, text, text, jsonb)
  to authenticated;

drop policy if exists "companies_owner_access" on public.companies;
create policy "companies_owner_access"
  on public.companies
  for all
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

drop policy if exists "products_owner_access" on public.products;
create policy "products_owner_access"
  on public.products
  for all
  using (
    exists (
      select 1
      from public.companies c
      where c.id = company_id
        and c.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.companies c
      where c.id = company_id
        and c.owner_user_id = auth.uid()
    )
  );

drop policy if exists "invoice_schedules_owner_access" on public.invoice_schedules;
create policy "invoice_schedules_owner_access"
  on public.invoice_schedules
  for all
  using (auth.uid() = owner_user_id)
  with check (
    auth.uid() = owner_user_id and (
      company_id is null or
      exists (
        select 1
        from public.companies c
        where c.id = company_id
          and c.owner_user_id = auth.uid()
      )
    )
  );

drop policy if exists "invoices_owner_access" on public.invoices;
create policy "invoices_owner_access"
  on public.invoices
  for all
  using (auth.uid() = owner_user_id)
  with check (
    auth.uid() = owner_user_id and
    exists (
      select 1
      from public.companies c
      where c.id = company_id
        and c.owner_user_id = auth.uid()
    )
  );

drop policy if exists "invoice_items_owner_access" on public.invoice_items;
create policy "invoice_items_owner_access"
  on public.invoice_items
  for all
  using (
    exists (
      select 1
      from public.invoices i
      where i.id = invoice_id
        and i.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.invoices i
      left join public.products p on p.id = product_id
      left join public.companies pc on pc.id = p.company_id
      where i.id = invoice_id
        and i.owner_user_id = auth.uid()
        and (
          product_id is null or
          (pc.id = i.company_id and pc.owner_user_id = auth.uid())
        )
    )
  );

drop policy if exists "invoice_schedule_lines_owner_access" on public.invoice_schedule_lines;
create policy "invoice_schedule_lines_owner_access"
  on public.invoice_schedule_lines
  for all
  using (
    exists (
      select 1
      from public.invoice_schedules s
      where s.id = schedule_id
        and s.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.invoice_schedules s
      left join public.products p on p.id = product_id
      left join public.companies pc on pc.id = p.company_id
      where s.id = schedule_id
        and s.owner_user_id = auth.uid()
        and (
          product_id is null or
          (pc.id = s.company_id and pc.owner_user_id = auth.uid())
        )
    )
  );

drop policy if exists "invoice_cron_run_items_select_own" on public.invoice_cron_run_items;
create policy "invoice_cron_run_items_select_own"
  on public.invoice_cron_run_items
  for select
  using (auth.uid() = owner_user_id);

drop policy if exists "invoice_cron_run_reports_select_own" on public.invoice_cron_run_reports;
create policy "invoice_cron_run_reports_select_own"
  on public.invoice_cron_run_reports
  for select
  using (auth.uid() = owner_user_id);

create index if not exists companies_owner_user_id_idx on public.companies (owner_user_id);
create index if not exists products_company_id_idx on public.products (company_id);
create index if not exists invoice_schedules_owner_user_id_idx on public.invoice_schedules (owner_user_id);
create index if not exists invoice_schedules_company_id_idx on public.invoice_schedules (company_id);
create index if not exists invoice_schedules_next_run_at_idx on public.invoice_schedules (next_run_at);
create index if not exists invoices_owner_user_id_idx on public.invoices (owner_user_id);
create index if not exists invoices_company_id_idx on public.invoices (company_id);
create index if not exists invoices_created_at_idx on public.invoices (created_at desc);
create unique index if not exists invoices_schedule_occurrence_idx
  on public.invoices (schedule_id, scheduled_for)
  where schedule_id is not null and scheduled_for is not null;
create index if not exists invoice_items_invoice_id_idx on public.invoice_items (invoice_id);
create index if not exists invoice_schedule_lines_schedule_id_idx on public.invoice_schedule_lines (schedule_id);
create index if not exists invoice_cron_runs_status_started_at_idx on public.invoice_cron_runs (status, started_at);
create index if not exists invoice_cron_run_items_run_id_idx on public.invoice_cron_run_items (run_id);
create index if not exists invoice_cron_run_items_owner_user_id_idx on public.invoice_cron_run_items (owner_user_id);
create index if not exists invoice_cron_run_items_status_idx on public.invoice_cron_run_items (status);
create index if not exists invoice_cron_run_reports_status_idx on public.invoice_cron_run_reports (status);
