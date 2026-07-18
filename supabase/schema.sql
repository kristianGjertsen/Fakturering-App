create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text unique,
  full_name text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.profiles.full_name);

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
  city text,
  country text default 'Norway',
  
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

create table if not exists public.invoice_schedule_items (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.invoice_schedules (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  quantity numeric(12, 2) not null default 1 check (quantity > 0),
  unit_price_override numeric(12, 2) check (unit_price_override >= 0),
  created_at timestamptz not null default now(),
  unique (schedule_id, product_id)
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles (id) on delete cascade,
  company_id uuid references public.companies (id) on delete restrict,
  recipient_name text not null,
  recipient_org_number text,
  recipient_email text,
  recipient_city text,
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
  v_recipient_city text;
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
    company.city,
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
    new.pdf_template := v_pdf_template;
    new.recipient_name := v_recipient_name;
    new.recipient_org_number := v_recipient_org_number;
    new.recipient_email := v_recipient_email;
    new.recipient_city := v_recipient_city;
    new.recipient_country := v_recipient_country;
  end if;

  return new;
end;
$$;

drop trigger if exists invoices_set_scheduled_due_date on public.invoices;
create trigger invoices_set_scheduled_due_date
  before insert on public.invoices
  for each row execute procedure public.set_scheduled_invoice_due_date();

alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.products enable row level security;
alter table public.invoice_schedules enable row level security;
alter table public.invoice_schedule_items enable row level security;
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

drop policy if exists "invoice_schedule_items_owner_access" on public.invoice_schedule_items;
create policy "invoice_schedule_items_owner_access"
  on public.invoice_schedule_items
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
      join public.products p on p.id = product_id
      join public.companies c on c.id = p.company_id
      where s.id = schedule_id
        and s.owner_user_id = auth.uid()
        and c.id = s.company_id
        and c.owner_user_id = auth.uid()
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
create index if not exists invoice_schedule_items_schedule_id_idx on public.invoice_schedule_items (schedule_id);
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
