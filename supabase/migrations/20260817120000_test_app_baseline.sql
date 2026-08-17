-- Source migration: supabase/migrations/20260719000000_baseline.sql

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
  created_at timestamptz not null default now(),
  unique (invoice_id, sort_order)
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
  created_at timestamptz not null default now(),
  unique (schedule_id, sort_order)
);

create table if not exists public.invoice_attachments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  invoice_item_id uuid not null references public.invoice_items (id) on delete cascade,
  storage_path text not null,
  original_name text not null,
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at timestamptz not null default now(),
  unique (invoice_id, storage_path)
);

create table if not exists public.invoice_schedule_attachments (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.invoice_schedules (id) on delete cascade,
  schedule_line_id uuid not null references public.invoice_schedule_lines (id) on delete cascade,
  storage_path text not null,
  original_name text not null,
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at timestamptz not null default now(),
  unique (schedule_id, storage_path)
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'invoice-attachments',
  'invoice-attachments',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

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
    new.title := coalesce(nullif(btrim(new.title), ''), new.invoice_number, 'Faktura');
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
    new.title := coalesce(nullif(btrim(v_invoice_title), ''), new.invoice_number, 'Faktura');
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
  v_attachments jsonb;
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
      null,
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

    insert into public.invoice_attachments (
      invoice_id,
      invoice_item_id,
      storage_path,
      original_name,
      mime_type,
      size_bytes
    )
    select
      v_invoice.id,
      item.id,
      attachment.storage_path,
      attachment.original_name,
      attachment.mime_type,
      attachment.size_bytes
    from public.invoice_schedule_attachments attachment
    join public.invoice_schedule_lines line
      on line.id = attachment.schedule_line_id
    join public.invoice_items item
      on item.invoice_id = v_invoice.id
     and item.sort_order = line.sort_order
    where attachment.schedule_id = p_schedule_id;

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

  select coalesce(
    jsonb_agg(to_jsonb(attachment) order by attachment.created_at),
    '[]'::jsonb
  )
    into v_attachments
    from public.invoice_attachments attachment
   where attachment.invoice_id = v_invoice.id;

  return to_jsonb(v_invoice)
    || jsonb_build_object(
      'company', v_company,
      'invoice_items', v_items,
      'invoice_attachments', v_attachments
    );
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
alter table public.invoice_attachments enable row level security;
alter table public.invoice_schedule_attachments enable row level security;
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

drop policy if exists "invoice_attachments_owner_access" on public.invoice_attachments;
create policy "invoice_attachments_owner_access"
  on public.invoice_attachments
  for all
  using (
    exists (
      select 1
      from public.invoices invoice
      join public.invoice_items item
        on item.id = invoice_attachments.invoice_item_id
       and item.invoice_id = invoice.id
      where invoice.id = invoice_attachments.invoice_id
        and invoice.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.invoices invoice
      join public.invoice_items item
        on item.id = invoice_attachments.invoice_item_id
       and item.invoice_id = invoice.id
      where invoice.id = invoice_attachments.invoice_id
        and invoice.owner_user_id = auth.uid()
    )
  );

drop policy if exists "invoice_schedule_attachments_owner_access" on public.invoice_schedule_attachments;
create policy "invoice_schedule_attachments_owner_access"
  on public.invoice_schedule_attachments
  for all
  using (
    exists (
      select 1
      from public.invoice_schedules schedule
      join public.invoice_schedule_lines line
        on line.id = invoice_schedule_attachments.schedule_line_id
       and line.schedule_id = schedule.id
      where schedule.id = invoice_schedule_attachments.schedule_id
        and schedule.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.invoice_schedules schedule
      join public.invoice_schedule_lines line
        on line.id = invoice_schedule_attachments.schedule_line_id
       and line.schedule_id = schedule.id
      where schedule.id = invoice_schedule_attachments.schedule_id
        and schedule.owner_user_id = auth.uid()
    )
  );

drop policy if exists "invoice_attachments_storage_select" on storage.objects;
create policy "invoice_attachments_storage_select"
  on storage.objects
  for select
  using (
    bucket_id = 'invoice-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "invoice_attachments_storage_insert" on storage.objects;
create policy "invoice_attachments_storage_insert"
  on storage.objects
  for insert
  with check (
    bucket_id = 'invoice-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "invoice_attachments_storage_update" on storage.objects;
create policy "invoice_attachments_storage_update"
  on storage.objects
  for update
  using (
    bucket_id = 'invoice-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'invoice-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "invoice_attachments_storage_delete" on storage.objects;
create policy "invoice_attachments_storage_delete"
  on storage.objects
  for delete
  using (
    bucket_id = 'invoice-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
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
create index if not exists invoice_attachments_invoice_id_idx on public.invoice_attachments (invoice_id);
create index if not exists invoice_attachments_invoice_item_id_idx on public.invoice_attachments (invoice_item_id);
create index if not exists invoice_schedule_attachments_schedule_id_idx on public.invoice_schedule_attachments (schedule_id);
create index if not exists invoice_schedule_attachments_schedule_line_id_idx on public.invoice_schedule_attachments (schedule_line_id);
create index if not exists invoice_cron_runs_status_started_at_idx on public.invoice_cron_runs (status, started_at);
create index if not exists invoice_cron_run_items_run_id_idx on public.invoice_cron_run_items (run_id);
create index if not exists invoice_cron_run_items_owner_user_id_idx on public.invoice_cron_run_items (owner_user_id);
create index if not exists invoice_cron_run_items_status_idx on public.invoice_cron_run_items (status);
create index if not exists invoice_cron_run_reports_status_idx on public.invoice_cron_run_reports (status);


-- ============================================================================

-- Source migration: supabase/migrations/20260721000000_invoice_number_lifecycle.sql

-- Invoice numbers belong to the seller profile and are only consumed when an
-- invoice is finalized. The profile row is the lock for concurrent numbering.
alter table public.profiles
  add column if not exists has_sent_invoices_before boolean not null default false,
  add column if not exists last_invoice_number bigint not null default 9999
    check (last_invoice_number >= 0);

alter table public.invoices alter column invoice_number drop not null;
alter table public.invoices
  add column if not exists finalized_at timestamptz,
  add column if not exists pdf_storage_path text,
  add column if not exists pdf_locked_at timestamptz;

-- Old draft numbers were placeholders and must not consume the legal sequence.
update public.invoices
   set invoice_number = null
 where status = 'draft'
   and finalized_at is null;

create unique index if not exists invoices_owner_invoice_number_unique
  on public.invoices (owner_user_id, invoice_number)
  where invoice_number is not null;

create or replace function public.assign_invoice_number_on_finalize()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number bigint;
begin
  if new.status <> 'draft'
     and new.finalized_at is null then
    update public.profiles
       set last_invoice_number = last_invoice_number + 1
     where id = new.owner_user_id
     returning last_invoice_number into v_number;

    if v_number is null then
      raise exception 'Seller profile is missing for invoice %', new.id;
    end if;

    new.invoice_number := v_number::text;
    new.finalized_at := now();
  elsif new.finalized_at is null then
    new.invoice_number := null;
  end if;

  return new;
end;
$$;

drop trigger if exists invoices_assign_number_on_finalize on public.invoices;
create trigger invoices_assign_number_on_finalize
  before insert or update of status on public.invoices
  for each row execute procedure public.assign_invoice_number_on_finalize();

create or replace function public.finalize_invoice(p_invoice_id uuid)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_number text;
begin
  update public.invoices
     set status = 'ready'
   where id = p_invoice_id
     and owner_user_id = auth.uid()
     and status = 'draft'
  returning invoice_number into v_number;

  if v_number is null then
    select invoice_number into v_number
      from public.invoices
     where id = p_invoice_id
       and owner_user_id = auth.uid()
       and finalized_at is not null;
  end if;

  if v_number is null then
    raise exception 'Invoice % is not an available draft', p_invoice_id;
  end if;

  return v_number;
end;
$$;

revoke all on function public.finalize_invoice(uuid) from public, anon;
grant execute on function public.finalize_invoice(uuid) to authenticated;

create or replace function public.lock_invoice_pdf(p_invoice_id uuid, p_storage_path text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.invoices
     set pdf_storage_path = p_storage_path,
         pdf_locked_at = now()
   where id = p_invoice_id
     and owner_user_id = auth.uid()
     and finalized_at is not null
     and pdf_storage_path is null;

  if not found then
    raise exception 'Invoice PDF is already locked or invoice is unavailable';
  end if;
end;
$$;

revoke all on function public.lock_invoice_pdf(uuid, text) from public, anon;
grant execute on function public.lock_invoice_pdf(uuid, text) to authenticated;

create or replace function public.prevent_finalized_invoice_content_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.finalized_at is not null and (
    new.owner_user_id is distinct from old.owner_user_id or
    new.company_id is distinct from old.company_id or
    new.recipient_name is distinct from old.recipient_name or
    new.recipient_org_number is distinct from old.recipient_org_number or
    new.recipient_email is distinct from old.recipient_email or
    new.recipient_country is distinct from old.recipient_country or
    new.invoice_number is distinct from old.invoice_number or
    new.title is distinct from old.title or
    new.issue_date is distinct from old.issue_date or
    new.due_date is distinct from old.due_date or
    new.pdf_template is distinct from old.pdf_template or
    new.notes is distinct from old.notes or
    new.subtotal is distinct from old.subtotal or
    new.vat_total is distinct from old.vat_total or
    new.total is distinct from old.total or
    new.finalized_at is distinct from old.finalized_at
  ) then
    raise exception 'A finalized invoice cannot be edited';
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_prevent_finalized_content_changes on public.invoices;
create trigger invoices_prevent_finalized_content_changes
  before update on public.invoices
  for each row execute procedure public.prevent_finalized_invoice_content_changes();

create or replace function public.prevent_finalized_invoice_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.finalized_at is not null then
    raise exception 'A finalized invoice cannot be deleted';
  end if;
  return old;
end;
$$;

drop trigger if exists invoices_prevent_finalized_delete on public.invoices;
create trigger invoices_prevent_finalized_delete
  before delete on public.invoices
  for each row execute procedure public.prevent_finalized_invoice_delete();

create or replace function public.prevent_finalized_invoice_child_changes()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_invoice_id uuid;
begin
  if tg_op = 'DELETE' then
    v_invoice_id := old.invoice_id;
  else
    v_invoice_id := new.invoice_id;
  end if;

  if exists (select 1 from public.invoices where id = v_invoice_id and finalized_at is not null) then
    raise exception 'Lines and attachments on a finalized invoice cannot be changed';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists invoice_items_prevent_finalized_changes on public.invoice_items;
create trigger invoice_items_prevent_finalized_changes
  before insert or update or delete on public.invoice_items
  for each row execute procedure public.prevent_finalized_invoice_child_changes();

drop trigger if exists invoice_attachments_prevent_finalized_changes on public.invoice_attachments;
create trigger invoice_attachments_prevent_finalized_changes
  before insert or update or delete on public.invoice_attachments
  for each row execute procedure public.prevent_finalized_invoice_child_changes();

insert into storage.buckets (id, name, public, allowed_mime_types)
values ('invoice-pdfs', 'invoice-pdfs', false, array['application/pdf'])
on conflict (id) do update
set public = false, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "invoice_pdfs_storage_select" on storage.objects;
create policy "invoice_pdfs_storage_select" on storage.objects for select
using (bucket_id = 'invoice-pdfs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "invoice_pdfs_storage_insert" on storage.objects;
create policy "invoice_pdfs_storage_insert" on storage.objects for insert
with check (bucket_id = 'invoice-pdfs' and (storage.foldername(name))[1] = auth.uid()::text);

-- Signup metadata initializes the seller's sequence. A new seller starts at
-- 10000; an existing seller starts at the number after the one they provide.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_previous boolean := coalesce((new.raw_user_meta_data ->> 'has_sent_invoices_before')::boolean, false);
  v_last_number bigint := coalesce(nullif(new.raw_user_meta_data ->> 'last_invoice_number', '')::bigint, 9999);
begin
  if not v_has_previous then v_last_number := 9999; end if;

  insert into public.profiles (
    id, email, full_name, company_name, address, postal_address, country,
    org_number, has_sent_invoices_before, last_invoice_number
  ) values (
    new.id, new.email, new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'company_name', new.raw_user_meta_data ->> 'address',
    new.raw_user_meta_data ->> 'postal_address',
    coalesce(nullif(new.raw_user_meta_data ->> 'country', ''), 'NO'),
    new.raw_user_meta_data ->> 'org_number', v_has_previous, v_last_number
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, profiles.full_name),
    company_name = coalesce(excluded.company_name, profiles.company_name),
    address = coalesce(excluded.address, profiles.address),
    postal_address = coalesce(excluded.postal_address, profiles.postal_address),
    country = coalesce(excluded.country, profiles.country),
    org_number = coalesce(excluded.org_number, profiles.org_number);

  insert into public.profile_bank_accounts (profile_id, account_name, account_number)
  select new.id, nullif(btrim(account ->> 'account_name'), ''), nullif(btrim(account ->> 'account_number'), '')
    from jsonb_array_elements(
      case when jsonb_typeof(new.raw_user_meta_data -> 'bank_accounts') = 'array'
        then new.raw_user_meta_data -> 'bank_accounts' else '[]'::jsonb end
    ) account
   where nullif(btrim(account ->> 'account_name'), '') is not null
     and nullif(btrim(account ->> 'account_number'), '') is not null;
  return new;
end;
$$;


-- ============================================================================

-- Source migration: supabase/migrations/20260726000000_company_logo_preferences.sql

alter table public.companies
  add column if not exists logo_disabled boolean not null default false,
  add column if not exists logo_url text,
  add column if not exists logo_source text;


-- ============================================================================

-- Source migration: supabase/migrations/20260726010000_company_contact_and_invoice_defaults.sql

alter table public.companies
  add column if not exists contact_person text,
  add column if not exists phone text,
  add column if not exists payment_terms_days integer not null default 14
    check (payment_terms_days between 0 and 365),
  add column if not exists invoice_notes text;


-- ============================================================================

-- Source migration: supabase/migrations/20260726020000_company_website.sql

alter table public.companies
  add column if not exists website text,
  add column if not exists website_from_brreg boolean not null default false;


-- ============================================================================

-- Source migration: supabase/migrations/20260728000000_company_logo_storage.sql

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'company-logos',
  'company-logos',
  true,
  2097152,
  array['image/png']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "company_logos_storage_select" on storage.objects;
create policy "company_logos_storage_select"
  on storage.objects
  for select
  using (
    bucket_id = 'company-logos'
    and exists (
      select 1
      from public.companies
      where companies.id::text = (storage.foldername(name))[1]
        and companies.owner_user_id = auth.uid()
    )
  );

drop policy if exists "company_logos_storage_insert" on storage.objects;
create policy "company_logos_storage_insert"
  on storage.objects
  for insert
  with check (
    bucket_id = 'company-logos'
    and exists (
      select 1
      from public.companies
      where companies.id::text = (storage.foldername(name))[1]
        and companies.owner_user_id = auth.uid()
    )
  );

drop policy if exists "company_logos_storage_update" on storage.objects;
create policy "company_logos_storage_update"
  on storage.objects
  for update
  using (
    bucket_id = 'company-logos'
    and exists (
      select 1
      from public.companies
      where companies.id::text = (storage.foldername(name))[1]
        and companies.owner_user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'company-logos'
    and exists (
      select 1
      from public.companies
      where companies.id::text = (storage.foldername(name))[1]
        and companies.owner_user_id = auth.uid()
    )
  );

drop policy if exists "company_logos_storage_delete" on storage.objects;
create policy "company_logos_storage_delete"
  on storage.objects
  for delete
  using (
    bucket_id = 'company-logos'
    and exists (
      select 1
      from public.companies
      where companies.id::text = (storage.foldername(name))[1]
        and companies.owner_user_id = auth.uid()
    )
  );


-- ============================================================================

-- Source migration: supabase/migrations/20260728010000_company_logo_storage_policy_fix.sql

drop policy if exists "company_logos_storage_select" on storage.objects;
create policy "company_logos_storage_select"
  on storage.objects
  for select
  using (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "company_logos_storage_insert" on storage.objects;
create policy "company_logos_storage_insert"
  on storage.objects
  for insert
  with check (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "company_logos_storage_update" on storage.objects;
create policy "company_logos_storage_update"
  on storage.objects
  for update
  using (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "company_logos_storage_delete" on storage.objects;
create policy "company_logos_storage_delete"
  on storage.objects
  for delete
  using (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- ============================================================================

-- Source migration: supabase/migrations/20260808000000_invoice_number_format.sql

alter table public.profiles
  add column if not exists invoice_number_prefix text not null default '',
  add column if not exists invoice_number_padding_width integer not null default 0
    check (invoice_number_padding_width >= 0 and invoice_number_padding_width <= 20);

create or replace function public.format_invoice_number(
  p_prefix text,
  p_number bigint,
  p_padding_width integer
)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(p_prefix, '') || lpad(p_number::text, greatest(coalesce(p_padding_width, 0), length(p_number::text)), '0');
$$;

create or replace function public.assign_invoice_number_on_finalize()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number bigint;
  v_prefix text;
  v_padding_width integer;
begin
  if new.status <> 'draft'
     and new.finalized_at is null then
    update public.profiles
       set last_invoice_number = last_invoice_number + 1
     where id = new.owner_user_id
     returning last_invoice_number, invoice_number_prefix, invoice_number_padding_width
       into v_number, v_prefix, v_padding_width;

    if v_number is null then
      raise exception 'Seller profile is missing for invoice %', new.id;
    end if;

    new.invoice_number := public.format_invoice_number(v_prefix, v_number, v_padding_width);
    new.finalized_at := now();
  elsif new.finalized_at is null then
    new.invoice_number := null;
  end if;

  return new;
end;
$$;

create or replace function public.save_profile_details(
  p_full_name text,
  p_company_name text,
  p_address text,
  p_postal_address text,
  p_country text,
  p_org_number text,
  p_bank_accounts jsonb,
  p_invoice_number_prefix text,
  p_last_invoice_number bigint,
  p_invoice_number_padding_width integer
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_last_invoice_number < 0 then
    raise exception 'Last invoice number cannot be negative';
  end if;

  if p_invoice_number_padding_width < 0 or p_invoice_number_padding_width > 20 then
    raise exception 'Invoice number padding width must be between 0 and 20';
  end if;

  update public.profiles
     set full_name = nullif(btrim(p_full_name), ''),
         company_name = nullif(btrim(p_company_name), ''),
         address = nullif(btrim(p_address), ''),
         postal_address = nullif(btrim(p_postal_address), ''),
         country = coalesce(nullif(btrim(p_country), ''), 'NO'),
         org_number = nullif(btrim(p_org_number), ''),
         invoice_number_prefix = coalesce(p_invoice_number_prefix, ''),
         last_invoice_number = p_last_invoice_number,
         invoice_number_padding_width = p_invoice_number_padding_width
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

grant execute on function public.save_profile_details(text, text, text, text, text, text, jsonb, text, bigint, integer)
  to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_previous boolean := coalesce((new.raw_user_meta_data ->> 'has_sent_invoices_before')::boolean, false);
  v_last_number bigint := coalesce(nullif(new.raw_user_meta_data ->> 'last_invoice_number', '')::bigint, 9999);
  v_invoice_number_prefix text := coalesce(new.raw_user_meta_data ->> 'invoice_number_prefix', '');
  v_invoice_number_padding_width integer := coalesce(nullif(new.raw_user_meta_data ->> 'invoice_number_padding_width', '')::integer, 0);
begin
  if not v_has_previous then
    v_last_number := 9999;
    v_invoice_number_prefix := '';
    v_invoice_number_padding_width := 0;
  end if;

  insert into public.profiles (
    id, email, full_name, company_name, address, postal_address, country,
    org_number, has_sent_invoices_before, last_invoice_number,
    invoice_number_prefix, invoice_number_padding_width
  ) values (
    new.id, new.email, new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'company_name', new.raw_user_meta_data ->> 'address',
    new.raw_user_meta_data ->> 'postal_address',
    coalesce(nullif(new.raw_user_meta_data ->> 'country', ''), 'NO'),
    new.raw_user_meta_data ->> 'org_number', v_has_previous, v_last_number,
    v_invoice_number_prefix, v_invoice_number_padding_width
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, profiles.full_name),
    company_name = coalesce(excluded.company_name, profiles.company_name),
    address = coalesce(excluded.address, profiles.address),
    postal_address = coalesce(excluded.postal_address, profiles.postal_address),
    country = coalesce(excluded.country, profiles.country),
    org_number = coalesce(excluded.org_number, profiles.org_number),
    invoice_number_prefix = excluded.invoice_number_prefix,
    invoice_number_padding_width = excluded.invoice_number_padding_width;

  insert into public.profile_bank_accounts (profile_id, account_name, account_number)
  select new.id, nullif(btrim(account ->> 'account_name'), ''), nullif(btrim(account ->> 'account_number'), '')
    from jsonb_array_elements(
      case when jsonb_typeof(new.raw_user_meta_data -> 'bank_accounts') = 'array'
        then new.raw_user_meta_data -> 'bank_accounts' else '[]'::jsonb end
    ) account
   where nullif(btrim(account ->> 'account_name'), '') is not null
     and nullif(btrim(account ->> 'account_number'), '') is not null;
  return new;
end;
$$;


-- ============================================================================

-- Source migration: supabase/migrations/20260808010000_lock_invoice_number_settings.sql

drop function if exists public.save_profile_details(
  text, text, text, text, text, text, jsonb, text, bigint, integer
);

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

create or replace function public.prevent_profile_invoice_number_settings_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('app.allow_invoice_number_update', true) = 'on' then
    return new;
  end if;

  if new.invoice_number_prefix is distinct from old.invoice_number_prefix
     or new.invoice_number_padding_width is distinct from old.invoice_number_padding_width
     or new.last_invoice_number is distinct from old.last_invoice_number then
    raise exception 'Invoice number settings cannot be changed after profile creation';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_prevent_invoice_number_settings_update on public.profiles;
create trigger profiles_prevent_invoice_number_settings_update
  before update on public.profiles
  for each row
  execute function public.prevent_profile_invoice_number_settings_update();

create or replace function public.assign_invoice_number_on_finalize()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number bigint;
  v_prefix text;
  v_padding_width integer;
begin
  if new.status <> 'draft'
     and new.finalized_at is null then
    perform set_config('app.allow_invoice_number_update', 'on', true);

    update public.profiles
       set last_invoice_number = last_invoice_number + 1
     where id = new.owner_user_id
     returning last_invoice_number, invoice_number_prefix, invoice_number_padding_width
       into v_number, v_prefix, v_padding_width;

    perform set_config('app.allow_invoice_number_update', 'off', true);

    if v_number is null then
      raise exception 'Seller profile is missing for invoice %', new.id;
    end if;

    new.invoice_number := public.format_invoice_number(v_prefix, v_number, v_padding_width);
    new.finalized_at := now();
  elsif new.finalized_at is null then
    new.invoice_number := null;
  end if;

  return new;
end;
$$;


-- ============================================================================

-- Source migration: supabase/migrations/20260808020000_allow_user_delete_with_invoices.sql

alter table public.invoices
  drop constraint if exists invoices_company_id_fkey;

alter table public.invoices
  add constraint invoices_company_id_fkey
  foreign key (company_id)
  references public.companies (id)
  on delete set null;


-- ============================================================================

-- Source migration: supabase/migrations/20260808030000_allow_admin_user_delete_finalized_invoices.sql

create or replace function public.prevent_finalized_invoice_content_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin') then
    return new;
  end if;

  if old.finalized_at is not null and (
    new.owner_user_id is distinct from old.owner_user_id or
    new.company_id is distinct from old.company_id or
    new.recipient_name is distinct from old.recipient_name or
    new.recipient_org_number is distinct from old.recipient_org_number or
    new.recipient_email is distinct from old.recipient_email or
    new.recipient_country is distinct from old.recipient_country or
    new.invoice_number is distinct from old.invoice_number or
    new.title is distinct from old.title or
    new.issue_date is distinct from old.issue_date or
    new.due_date is distinct from old.due_date or
    new.pdf_template is distinct from old.pdf_template or
    new.notes is distinct from old.notes or
    new.subtotal is distinct from old.subtotal or
    new.vat_total is distinct from old.vat_total or
    new.total is distinct from old.total or
    new.finalized_at is distinct from old.finalized_at
  ) then
    raise exception 'A finalized invoice cannot be edited';
  end if;

  return new;
end;
$$;

create or replace function public.prevent_finalized_invoice_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin') then
    return old;
  end if;

  if old.finalized_at is not null then
    raise exception 'A finalized invoice cannot be deleted';
  end if;

  return old;
end;
$$;

create or replace function public.prevent_finalized_invoice_child_changes()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_invoice_id uuid;
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    v_invoice_id := old.invoice_id;
  else
    v_invoice_id := new.invoice_id;
  end if;

  if exists (select 1 from public.invoices where id = v_invoice_id and finalized_at is not null) then
    raise exception 'Lines and attachments on a finalized invoice cannot be changed';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;


-- ============================================================================

-- Source migration: supabase/migrations/20260809000000_delete_company_rpc.sql

create or replace function public.prevent_finalized_invoice_content_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin') then
    return new;
  end if;

  if current_setting('app.allow_company_unlink_from_finalized_invoice', true) = 'on'
     and old.finalized_at is not null
     and new.company_id is null
     and old.company_id is not null
     and new.owner_user_id is not distinct from old.owner_user_id
     and new.recipient_name is not distinct from old.recipient_name
     and new.recipient_org_number is not distinct from old.recipient_org_number
     and new.recipient_email is not distinct from old.recipient_email
     and new.recipient_country is not distinct from old.recipient_country
     and new.invoice_number is not distinct from old.invoice_number
     and new.title is not distinct from old.title
     and new.issue_date is not distinct from old.issue_date
     and new.due_date is not distinct from old.due_date
     and new.pdf_template is not distinct from old.pdf_template
     and new.notes is not distinct from old.notes
     and new.subtotal is not distinct from old.subtotal
     and new.vat_total is not distinct from old.vat_total
     and new.total is not distinct from old.total
     and new.finalized_at is not distinct from old.finalized_at then
    return new;
  end if;

  if old.finalized_at is not null and (
    new.owner_user_id is distinct from old.owner_user_id or
    new.company_id is distinct from old.company_id or
    new.recipient_name is distinct from old.recipient_name or
    new.recipient_org_number is distinct from old.recipient_org_number or
    new.recipient_email is distinct from old.recipient_email or
    new.recipient_country is distinct from old.recipient_country or
    new.invoice_number is distinct from old.invoice_number or
    new.title is distinct from old.title or
    new.issue_date is distinct from old.issue_date or
    new.due_date is distinct from old.due_date or
    new.pdf_template is distinct from old.pdf_template or
    new.notes is distinct from old.notes or
    new.subtotal is distinct from old.subtotal or
    new.vat_total is distinct from old.vat_total or
    new.total is distinct from old.total or
    new.finalized_at is distinct from old.finalized_at
  ) then
    raise exception 'A finalized invoice cannot be edited';
  end if;

  return new;
end;
$$;

create or replace function public.delete_company(p_company_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform set_config('app.allow_company_unlink_from_finalized_invoice', 'on', true);

  delete from public.companies
   where id = p_company_id
     and owner_user_id = auth.uid();

  perform set_config('app.allow_company_unlink_from_finalized_invoice', 'off', true);
end;
$$;

grant execute on function public.delete_company(uuid) to authenticated;


-- ============================================================================

-- Source migration: supabase/migrations/20260809010000_company_active_state.sql

alter table public.companies
  add column if not exists is_active boolean not null default true;

create or replace function public.delete_company(p_company_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.invoices
    where company_id = p_company_id
      and owner_user_id = auth.uid()
  ) then
    raise exception 'Firmaet er brukt i fakturaer og kan ikke slettes. Sett det som inaktivt i stedet.';
  end if;

  delete from public.companies
   where id = p_company_id
     and owner_user_id = auth.uid();
end;
$$;

grant execute on function public.delete_company(uuid) to authenticated;

create or replace function public.set_company_active(
  p_company_id uuid,
  p_is_active boolean
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.companies
     set is_active = p_is_active
   where id = p_company_id
     and owner_user_id = auth.uid();
end;
$$;

grant execute on function public.set_company_active(uuid, boolean) to authenticated;


-- ============================================================================

-- Source migration: supabase/migrations/20260816000000_accounting_foundation.sql

-- A compact double-entry accounting ledger for sales invoices, supplier
-- invoices and manual vouchers. Posted journal entries are append-only;
-- corrections are represented by reversing entries.

create table if not exists public.accounting_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles (id) on delete cascade,
  account_number text not null check (account_number ~ '^[0-9]{4}$'),
  name text not null check (length(btrim(name)) > 0),
  category text not null check (category in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  system_key text,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, account_number)
);

create unique index if not exists accounting_accounts_owner_system_key_unique
  on public.accounting_accounts (owner_user_id, system_key)
  where system_key is not null;

create table if not exists public.accounting_sequences (
  owner_user_id uuid primary key references public.profiles (id) on delete cascade,
  last_voucher_number bigint not null default 0 check (last_voucher_number >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.accounting_periods (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles (id) on delete cascade,
  year integer not null check (year between 2000 and 2200),
  month integer not null check (month between 1 and 12),
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, year, month)
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  org_number text,
  email text,
  bank_account text,
  notes text,
  default_expense_account_id uuid references public.accounting_accounts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists suppliers_owner_org_number_unique
  on public.suppliers (owner_user_id, org_number)
  where org_number is not null and org_number <> '';

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles (id) on delete cascade,
  voucher_number bigint not null check (voucher_number > 0),
  entry_date date not null,
  description text not null check (length(btrim(description)) > 0),
  source_type text not null check (
    source_type in (
      'sales_invoice', 'sales_payment', 'supplier_invoice',
      'supplier_payment', 'manual', 'correction'
    )
  ),
  source_id uuid,
  reversal_of_id uuid references public.journal_entries (id) on delete cascade,
  created_at timestamptz not null default now(),
  posted_at timestamptz not null default now(),
  unique (owner_user_id, voucher_number)
);

create unique index if not exists journal_entries_source_unique
  on public.journal_entries (owner_user_id, source_type, source_id)
  where source_id is not null and source_type in ('sales_invoice', 'supplier_invoice');

create table if not exists public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references public.journal_entries (id) on delete cascade,
  account_id uuid not null references public.accounting_accounts (id) on delete restrict,
  description text,
  debit numeric(14, 2) not null default 0 check (debit >= 0),
  credit numeric(14, 2) not null default 0 check (credit >= 0),
  vat_rate numeric(5, 2),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0)),
  unique (journal_entry_id, sort_order)
);

create table if not exists public.supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles (id) on delete cascade,
  supplier_id uuid not null references public.suppliers (id) on delete restrict,
  invoice_number text not null check (length(btrim(invoice_number)) > 0),
  invoice_date date not null,
  due_date date,
  description text,
  currency text not null default 'NOK' check (currency = 'NOK'),
  status text not null default 'posted' check (status in ('posted', 'paid', 'cancelled')),
  subtotal numeric(14, 2) not null check (subtotal >= 0),
  vat_total numeric(14, 2) not null check (vat_total >= 0),
  total numeric(14, 2) not null check (total > 0),
  journal_entry_id uuid not null references public.journal_entries (id) on delete cascade,
  paid_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_date is null or due_date >= invoice_date),
  unique (owner_user_id, supplier_id, invoice_number)
);

create table if not exists public.supplier_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  supplier_invoice_id uuid not null references public.supplier_invoices (id) on delete cascade,
  expense_account_id uuid not null references public.accounting_accounts (id) on delete restrict,
  description text not null check (length(btrim(description)) > 0),
  net_amount numeric(14, 2) not null check (net_amount >= 0),
  vat_rate numeric(5, 2) not null check (vat_rate in (0, 12, 15, 25)),
  vat_amount numeric(14, 2) not null check (vat_amount >= 0),
  gross_amount numeric(14, 2) not null check (gross_amount > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (supplier_invoice_id, sort_order),
  check (gross_amount = net_amount + vat_amount)
);

create table if not exists public.supplier_invoice_attachments (
  id uuid primary key default gen_random_uuid(),
  supplier_invoice_id uuid not null references public.supplier_invoices (id) on delete cascade,
  storage_path text not null,
  original_name text not null,
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at timestamptz not null default now(),
  unique (supplier_invoice_id, storage_path)
);

create table if not exists public.accounting_payments (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles (id) on delete cascade,
  direction text not null check (direction in ('incoming', 'outgoing')),
  sales_invoice_id uuid references public.invoices (id) on delete cascade,
  supplier_invoice_id uuid references public.supplier_invoices (id) on delete cascade,
  bank_account_id uuid not null references public.accounting_accounts (id) on delete restrict,
  amount numeric(14, 2) not null check (amount > 0),
  payment_date date not null,
  journal_entry_id uuid not null references public.journal_entries (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'reversed')),
  reversed_at timestamptz,
  reversal_journal_entry_id uuid references public.journal_entries (id) on delete set null,
  created_at timestamptz not null default now(),
  check (
    (direction = 'incoming' and sales_invoice_id is not null and supplier_invoice_id is null)
    or
    (direction = 'outgoing' and supplier_invoice_id is not null and sales_invoice_id is null)
  )
);

create unique index if not exists accounting_payments_active_sales_unique
  on public.accounting_payments (sales_invoice_id)
  where status = 'active' and sales_invoice_id is not null;

create unique index if not exists accounting_payments_active_supplier_unique
  on public.accounting_payments (supplier_invoice_id)
  where status = 'active' and supplier_invoice_id is not null;

alter table public.invoices
  add column if not exists paid_at date;

create or replace function public.seed_default_accounting_accounts(p_owner_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.accounting_accounts (
    owner_user_id, account_number, name, category, system_key, is_system
  ) values
    (p_owner_user_id, '1500', 'Kundefordringer', 'asset', 'accounts_receivable', true),
    (p_owner_user_id, '1920', 'Bankinnskudd', 'asset', 'bank', true),
    (p_owner_user_id, '2000', 'Egenkapital', 'equity', 'equity', true),
    (p_owner_user_id, '2057', 'Privat innskudd og uttak', 'equity', 'private_equity', true),
    (p_owner_user_id, '2400', 'Leverandørgjeld', 'liability', 'accounts_payable', true),
    (p_owner_user_id, '2700', 'Utgående MVA, 25 %', 'liability', 'output_vat_25', true),
    (p_owner_user_id, '2701', 'Utgående MVA, 15 %', 'liability', 'output_vat_15', true),
    (p_owner_user_id, '2702', 'Utgående MVA, 12 %', 'liability', 'output_vat_12', true),
    (p_owner_user_id, '2710', 'Inngående MVA, 25 %', 'asset', 'input_vat_25', true),
    (p_owner_user_id, '2711', 'Inngående MVA, 15 %', 'asset', 'input_vat_15', true),
    (p_owner_user_id, '2712', 'Inngående MVA, 12 %', 'asset', 'input_vat_12', true),
    (p_owner_user_id, '2740', 'Oppgjørskonto merverdiavgift', 'liability', 'vat_settlement', true),
    (p_owner_user_id, '3000', 'Salgsinntekt, 25 % MVA', 'revenue', 'sales_25', true),
    (p_owner_user_id, '3100', 'Salgsinntekt, 15 % MVA', 'revenue', 'sales_15', true),
    (p_owner_user_id, '3200', 'Salgsinntekt, 12 % MVA', 'revenue', 'sales_12', true),
    (p_owner_user_id, '3220', 'Salgsinntekt uten MVA', 'revenue', 'sales_0', true),
    (p_owner_user_id, '4000', 'Varekostnad', 'expense', null, false),
    (p_owner_user_id, '4300', 'Innkjøp for videresalg', 'expense', null, false),
    (p_owner_user_id, '5000', 'Lønn', 'expense', null, false),
    (p_owner_user_id, '5400', 'Arbeidsgiveravgift', 'expense', null, false),
    (p_owner_user_id, '6300', 'Leie lokale', 'expense', null, false),
    (p_owner_user_id, '6500', 'Verktøy og inventar', 'expense', null, false),
    (p_owner_user_id, '6540', 'Datautstyr', 'expense', null, false),
    (p_owner_user_id, '6550', 'Driftsmaterialer', 'expense', null, false),
    (p_owner_user_id, '6700', 'Regnskap og juridisk bistand', 'expense', null, false),
    (p_owner_user_id, '6800', 'Kontorrekvisita', 'expense', null, false),
    (p_owner_user_id, '6900', 'Telefon og internett', 'expense', null, false),
    (p_owner_user_id, '7140', 'Reisekostnader', 'expense', null, false),
    (p_owner_user_id, '7320', 'Reklame og markedsføring', 'expense', null, false),
    (p_owner_user_id, '7770', 'Bank- og kortgebyrer', 'expense', null, false),
    (p_owner_user_id, '7790', 'Annen driftskostnad', 'expense', null, false)
  on conflict (owner_user_id, account_number) do nothing;

  insert into public.accounting_sequences (owner_user_id)
  values (p_owner_user_id)
  on conflict (owner_user_id) do nothing;
end;
$$;

create or replace function public.seed_accounting_for_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_default_accounting_accounts(new.id);
  return new;
end;
$$;

drop trigger if exists profiles_seed_accounting on public.profiles;
create trigger profiles_seed_accounting
  after insert on public.profiles
  for each row execute function public.seed_accounting_for_profile();

do $$
declare
  profile_row record;
begin
  for profile_row in select id from public.profiles loop
    perform public.seed_default_accounting_accounts(profile_row.id);
  end loop;
end;
$$;

create or replace function public.next_voucher_number(p_owner_user_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  result bigint;
begin
  insert into public.accounting_sequences (owner_user_id, last_voucher_number)
  values (p_owner_user_id, 1)
  on conflict (owner_user_id) do update
    set last_voucher_number = accounting_sequences.last_voucher_number + 1,
        updated_at = now()
  returning last_voucher_number into result;
  return result;
end;
$$;

create or replace function public.require_open_accounting_period(
  p_owner_user_id uuid,
  p_entry_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
      from public.accounting_periods
     where owner_user_id = p_owner_user_id
       and year = extract(year from p_entry_date)::integer
       and month = extract(month from p_entry_date)::integer
       and status = 'closed'
  ) then
    raise exception 'Regnskapsperioden % er låst', to_char(p_entry_date, 'MM.YYYY');
  end if;
end;
$$;

create or replace function public.accounting_account_id(
  p_owner_user_id uuid,
  p_system_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  result uuid;
begin
  select id into result
    from public.accounting_accounts
   where owner_user_id = p_owner_user_id
     and system_key = p_system_key
     and is_active;
  if result is null then
    raise exception 'Systemkonto % mangler eller er deaktivert', p_system_key;
  end if;
  return result;
end;
$$;

create or replace function public.sales_account_key(p_vat_rate numeric)
returns text
language sql
immutable
as $$
  select case
    when p_vat_rate = 25 then 'sales_25'
    when p_vat_rate = 15 then 'sales_15'
    when p_vat_rate = 12 then 'sales_12'
    when p_vat_rate = 0 then 'sales_0'
    else 'sales_25'
  end;
$$;

create or replace function public.vat_account_key(p_direction text, p_vat_rate numeric)
returns text
language sql
immutable
as $$
  select case
    when p_direction = 'output' and p_vat_rate = 25 then 'output_vat_25'
    when p_direction = 'output' and p_vat_rate = 15 then 'output_vat_15'
    when p_direction = 'output' and p_vat_rate = 12 then 'output_vat_12'
    when p_direction = 'input' and p_vat_rate = 25 then 'input_vat_25'
    when p_direction = 'input' and p_vat_rate = 15 then 'input_vat_15'
    when p_direction = 'input' and p_vat_rate = 12 then 'input_vat_12'
    when p_direction = 'output' and p_vat_rate > 0 then 'output_vat_25'
    when p_direction = 'input' and p_vat_rate > 0 then 'input_vat_25'
    else null
  end;
$$;

create or replace function public.post_sales_invoice_to_ledger(p_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_row public.invoices%rowtype;
  entry_id uuid;
  entry_number bigint;
  line_order integer := 0;
  grouped_line record;
  vat_key text;
begin
  select * into invoice_row from public.invoices where id = p_invoice_id;
  if not found or invoice_row.finalized_at is null or invoice_row.status = 'cancelled' then
    return null;
  end if;
  if invoice_row.total <= 0 then return null; end if;

  select id into entry_id
    from public.journal_entries
   where owner_user_id = invoice_row.owner_user_id
     and source_type = 'sales_invoice'
     and source_id = invoice_row.id;
  if entry_id is not null then return entry_id; end if;

  perform public.seed_default_accounting_accounts(invoice_row.owner_user_id);
  perform public.require_open_accounting_period(invoice_row.owner_user_id, invoice_row.issue_date);
  entry_number := public.next_voucher_number(invoice_row.owner_user_id);
  insert into public.journal_entries (
    owner_user_id, voucher_number, entry_date, description, source_type, source_id
  ) values (
    invoice_row.owner_user_id,
    entry_number,
    invoice_row.issue_date,
    'Utgående faktura ' || coalesce(invoice_row.invoice_number, invoice_row.id::text),
    'sales_invoice',
    invoice_row.id
  ) returning id into entry_id;

  insert into public.journal_lines (
    journal_entry_id, account_id, description, debit, credit, sort_order
  ) values (
    entry_id,
    public.accounting_account_id(invoice_row.owner_user_id, 'accounts_receivable'),
    invoice_row.recipient_name,
    invoice_row.total,
    0,
    line_order
  );
  line_order := line_order + 1;

  for grouped_line in
    select vat_rate, round(sum(line_subtotal), 2) as net, round(sum(line_vat), 2) as vat
      from public.invoice_items
     where invoice_id = invoice_row.id
     group by vat_rate
     order by vat_rate desc
  loop
    if grouped_line.net > 0 then
      insert into public.journal_lines (
        journal_entry_id, account_id, description, debit, credit, vat_rate, sort_order
      ) values (
        entry_id,
        public.accounting_account_id(
          invoice_row.owner_user_id,
          public.sales_account_key(grouped_line.vat_rate)
        ),
        'Salg ' || grouped_line.vat_rate || ' % MVA',
        0,
        grouped_line.net,
        grouped_line.vat_rate,
        line_order
      );
      line_order := line_order + 1;
    end if;
    vat_key := public.vat_account_key('output', grouped_line.vat_rate);
    if grouped_line.vat > 0 and vat_key is not null then
      insert into public.journal_lines (
        journal_entry_id, account_id, description, debit, credit, vat_rate, sort_order
      ) values (
        entry_id,
        public.accounting_account_id(invoice_row.owner_user_id, vat_key),
        'Utgående MVA ' || grouped_line.vat_rate || ' %',
        0,
        grouped_line.vat,
        grouped_line.vat_rate,
        line_order
      );
      line_order := line_order + 1;
    end if;
  end loop;

  if line_order = 1 then
    insert into public.journal_lines (
      journal_entry_id, account_id, description, debit, credit, sort_order
    ) values (
      entry_id,
      public.accounting_account_id(invoice_row.owner_user_id, 'sales_0'),
      invoice_row.title,
      0,
      invoice_row.total,
      line_order
    );
  end if;

  if not exists (
    select 1 from public.journal_lines where journal_entry_id = entry_id
    group by journal_entry_id having sum(debit) = sum(credit)
  ) then
    raise exception 'Bokføringen av faktura % balanserer ikke', invoice_row.invoice_number;
  end if;
  return entry_id;
end;
$$;

create or replace function public.post_finalized_sales_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.finalized_at is not null and old.finalized_at is null then
    perform public.post_sales_invoice_to_ledger(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_post_to_ledger on public.invoices;
create trigger invoices_post_to_ledger
  after update of status on public.invoices
  for each row execute function public.post_finalized_sales_invoice();

create or replace function public.create_supplier_invoice(
  p_invoice_id uuid,
  p_supplier_id uuid,
  p_invoice_number text,
  p_invoice_date date,
  p_due_date date,
  p_description text,
  p_lines jsonb,
  p_attachments jsonb default '[]'::jsonb,
  p_mark_paid boolean default false,
  p_payment_date date default null,
  p_bank_account_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid := auth.uid();
  entry_id uuid;
  entry_number bigint;
  subtotal_value numeric(14, 2);
  vat_value numeric(14, 2);
  total_value numeric(14, 2);
  item jsonb;
  item_order integer := 0;
  vat_group record;
  vat_key text;
begin
  if owner_id is null then raise exception 'Du må være logget inn'; end if;
  if nullif(btrim(p_invoice_number), '') is null then raise exception 'Fakturanummer mangler'; end if;
  if p_invoice_date is null then raise exception 'Fakturadato mangler'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Fakturaen må ha minst én kostnadslinje';
  end if;
  if not exists (select 1 from public.suppliers where id = p_supplier_id and owner_user_id = owner_id) then
    raise exception 'Leverandøren finnes ikke';
  end if;
  if jsonb_typeof(p_attachments) <> 'array' then
    raise exception 'Fakturavedlegg må være en liste';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_attachments) attachment
     where attachment ->> 'storage_path' not like owner_id::text || '/supplier-invoices/' || p_invoice_id::text || '/%'
       or attachment ->> 'mime_type' not in ('application/pdf', 'image/jpeg', 'image/png')
       or (attachment ->> 'size_bytes')::bigint not between 1 and 10485760
  ) or coalesce((
    select sum((attachment ->> 'size_bytes')::bigint)
      from jsonb_array_elements(p_attachments) attachment
  ), 0) > 20971520 then
    raise exception 'Et fakturavedlegg er ugyldig';
  end if;
  perform public.seed_default_accounting_accounts(owner_id);
  perform public.require_open_accounting_period(owner_id, p_invoice_date);

  select
    round(sum((line ->> 'net_amount')::numeric), 2),
    round(sum((line ->> 'vat_amount')::numeric), 2),
    round(sum((line ->> 'gross_amount')::numeric), 2)
    into subtotal_value, vat_value, total_value
    from jsonb_array_elements(p_lines) line;
  if coalesce(total_value, 0) <= 0 or total_value <> subtotal_value + vat_value then
    raise exception 'Beløpene på inngående faktura er ugyldige';
  end if;

  for item in select value from jsonb_array_elements(p_lines) loop
    if (item ->> 'vat_rate')::numeric not in (0, 12, 15, 25)
       or (item ->> 'gross_amount')::numeric <= 0
       or (item ->> 'net_amount')::numeric <= 0
       or (item ->> 'vat_amount')::numeric < 0
       or round((item ->> 'net_amount')::numeric + (item ->> 'vat_amount')::numeric, 2)
          <> round((item ->> 'gross_amount')::numeric, 2)
       or not exists (
         select 1 from public.accounting_accounts
          where id = (item ->> 'expense_account_id')::uuid
            and owner_user_id = owner_id
            and category in ('expense', 'asset')
            and is_active
       ) then
      raise exception 'En kostnadslinje er ugyldig';
    end if;
  end loop;

  entry_number := public.next_voucher_number(owner_id);
  insert into public.journal_entries (
    owner_user_id, voucher_number, entry_date, description, source_type, source_id
  ) values (
    owner_id, entry_number, p_invoice_date,
    'Inngående faktura ' || btrim(p_invoice_number), 'supplier_invoice', p_invoice_id
  ) returning id into entry_id;

  for item in select value from jsonb_array_elements(p_lines) loop
    insert into public.journal_lines (
      journal_entry_id, account_id, description, debit, credit, vat_rate, sort_order
    ) values (
      entry_id,
      (item ->> 'expense_account_id')::uuid,
      nullif(btrim(item ->> 'description'), ''),
      round((item ->> 'net_amount')::numeric, 2),
      0,
      (item ->> 'vat_rate')::numeric,
      item_order
    );
    item_order := item_order + 1;
  end loop;

  for vat_group in
    select (line ->> 'vat_rate')::numeric as vat_rate,
           round(sum((line ->> 'vat_amount')::numeric), 2) as vat
      from jsonb_array_elements(p_lines) line
     group by (line ->> 'vat_rate')::numeric
  loop
    vat_key := public.vat_account_key('input', vat_group.vat_rate);
    if vat_group.vat > 0 and vat_key is not null then
      insert into public.journal_lines (
        journal_entry_id, account_id, description, debit, credit, vat_rate, sort_order
      ) values (
        entry_id,
        public.accounting_account_id(owner_id, vat_key),
        'Inngående MVA ' || vat_group.vat_rate || ' %',
        vat_group.vat,
        0,
        vat_group.vat_rate,
        item_order
      );
      item_order := item_order + 1;
    end if;
  end loop;

  insert into public.journal_lines (
    journal_entry_id, account_id, description, debit, credit, sort_order
  ) values (
    entry_id,
    public.accounting_account_id(owner_id, 'accounts_payable'),
    'Gjeld til leverandør',
    0,
    total_value,
    item_order
  );

  if not exists (
    select 1 from public.journal_lines where journal_entry_id = entry_id
    group by journal_entry_id having sum(debit) = sum(credit)
  ) then
    raise exception 'Bokføringen av inngående faktura balanserer ikke';
  end if;

  insert into public.supplier_invoices (
    id, owner_user_id, supplier_id, invoice_number, invoice_date, due_date,
    description, subtotal, vat_total, total, journal_entry_id
  ) values (
    p_invoice_id, owner_id, p_supplier_id, btrim(p_invoice_number), p_invoice_date,
    p_due_date, nullif(btrim(p_description), ''), subtotal_value, vat_value,
    total_value, entry_id
  );

  insert into public.supplier_invoice_lines (
    supplier_invoice_id, expense_account_id, description, net_amount,
    vat_rate, vat_amount, gross_amount, sort_order
  )
  select
    p_invoice_id,
    (line ->> 'expense_account_id')::uuid,
    coalesce(nullif(btrim(line ->> 'description'), ''), 'Kostnad'),
    round((line ->> 'net_amount')::numeric, 2),
    (line ->> 'vat_rate')::numeric,
    round((line ->> 'vat_amount')::numeric, 2),
    round((line ->> 'gross_amount')::numeric, 2),
    ordinality::integer - 1
  from jsonb_array_elements(p_lines) with ordinality as expanded(line, ordinality);

  insert into public.supplier_invoice_attachments (
    id, supplier_invoice_id, storage_path, original_name, mime_type, size_bytes
  )
  select
    (attachment ->> 'id')::uuid,
    p_invoice_id,
    attachment ->> 'storage_path',
    attachment ->> 'original_name',
    attachment ->> 'mime_type',
    (attachment ->> 'size_bytes')::bigint
  from jsonb_array_elements(p_attachments) attachment;

  if p_mark_paid then
    perform public.set_supplier_invoice_paid(
      p_invoice_id,
      true,
      coalesce(p_payment_date, p_invoice_date),
      p_bank_account_id
    );
  end if;

  return p_invoice_id;
end;
$$;

create or replace function public.create_manual_journal_entry(
  p_entry_date date,
  p_description text,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid := auth.uid();
  entry_id uuid;
  entry_number bigint;
  debit_total numeric(14, 2);
  credit_total numeric(14, 2);
  item jsonb;
  item_order integer := 0;
begin
  if owner_id is null then raise exception 'Du må være logget inn'; end if;
  if p_entry_date is null then raise exception 'Bilagsdato mangler'; end if;
  if nullif(btrim(p_description), '') is null then raise exception 'Beskrivelse mangler'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 then
    raise exception 'Et manuelt bilag må ha minst to linjer';
  end if;
  perform public.require_open_accounting_period(owner_id, p_entry_date);

  select round(sum((line ->> 'debit')::numeric), 2),
         round(sum((line ->> 'credit')::numeric), 2)
    into debit_total, credit_total
    from jsonb_array_elements(p_lines) line;
  if debit_total <= 0 or debit_total <> credit_total then
    raise exception 'Debet og kredit må være like';
  end if;

  for item in select value from jsonb_array_elements(p_lines) loop
    if not exists (
      select 1 from public.accounting_accounts
       where id = (item ->> 'account_id')::uuid
         and owner_user_id = owner_id and is_active
    ) or not (
      ((item ->> 'debit')::numeric > 0 and (item ->> 'credit')::numeric = 0)
      or ((item ->> 'credit')::numeric > 0 and (item ->> 'debit')::numeric = 0)
    ) then
      raise exception 'En bilagslinje er ugyldig';
    end if;
  end loop;

  entry_number := public.next_voucher_number(owner_id);
  insert into public.journal_entries (
    owner_user_id, voucher_number, entry_date, description, source_type
  ) values (owner_id, entry_number, p_entry_date, btrim(p_description), 'manual')
  returning id into entry_id;

  for item in select value from jsonb_array_elements(p_lines) loop
    insert into public.journal_lines (
      journal_entry_id, account_id, description, debit, credit, sort_order
    ) values (
      entry_id,
      (item ->> 'account_id')::uuid,
      nullif(btrim(item ->> 'description'), ''),
      round((item ->> 'debit')::numeric, 2),
      round((item ->> 'credit')::numeric, 2),
      item_order
    );
    item_order := item_order + 1;
  end loop;
  return entry_id;
end;
$$;

create or replace function public.reverse_journal_entry(
  p_entry_id uuid,
  p_reversal_date date,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid := auth.uid();
  original public.journal_entries%rowtype;
  result_id uuid;
  entry_number bigint;
begin
  select * into original from public.journal_entries
   where id = p_entry_id and owner_user_id = owner_id;
  if not found then raise exception 'Bilaget finnes ikke'; end if;
  if exists (select 1 from public.journal_entries where reversal_of_id = original.id) then
    raise exception 'Bilaget er allerede reversert';
  end if;
  perform public.require_open_accounting_period(owner_id, p_reversal_date);
  entry_number := public.next_voucher_number(owner_id);
  insert into public.journal_entries (
    owner_user_id, voucher_number, entry_date, description,
    source_type, source_id, reversal_of_id
  ) values (
    owner_id, entry_number, p_reversal_date,
    coalesce(nullif(btrim(p_description), ''), 'Reversering av bilag ' || original.voucher_number),
    'correction', original.id, original.id
  ) returning id into result_id;
  insert into public.journal_lines (
    journal_entry_id, account_id, description, debit, credit, vat_rate, sort_order
  )
  select result_id, account_id, description, credit, debit, vat_rate, sort_order
    from public.journal_lines
   where journal_entry_id = original.id
   order by sort_order;
  return result_id;
end;
$$;

create or replace function public.set_sales_invoice_paid(
  p_invoice_id uuid,
  p_paid boolean,
  p_payment_date date default current_date,
  p_bank_account_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid := auth.uid();
  invoice_row public.invoices%rowtype;
  bank_id uuid;
  entry_id uuid;
  entry_number bigint;
  payment_row public.accounting_payments%rowtype;
  reversal_id uuid;
begin
  select * into invoice_row from public.invoices
   where id = p_invoice_id and owner_user_id = owner_id;
  if not found or invoice_row.finalized_at is null or invoice_row.status = 'cancelled' then
    raise exception 'Fakturaen kan ikke betalingsføres';
  end if;

  if p_paid then
    if exists (select 1 from public.accounting_payments where sales_invoice_id = p_invoice_id and status = 'active') then
      update public.invoices set paid = true, paid_at = coalesce(paid_at, p_payment_date) where id = p_invoice_id;
      return;
    end if;
    perform public.post_sales_invoice_to_ledger(p_invoice_id);
    perform public.require_open_accounting_period(owner_id, p_payment_date);
    bank_id := coalesce(p_bank_account_id, public.accounting_account_id(owner_id, 'bank'));
    if not exists (
      select 1 from public.accounting_accounts where id = bank_id
       and owner_user_id = owner_id and category = 'asset' and is_active
    ) then raise exception 'Ugyldig betalingskonto'; end if;
    entry_number := public.next_voucher_number(owner_id);
    insert into public.journal_entries (
      owner_user_id, voucher_number, entry_date, description, source_type, source_id
    ) values (
      owner_id, entry_number, p_payment_date,
      'Innbetaling faktura ' || invoice_row.invoice_number,
      'sales_payment', p_invoice_id
    ) returning id into entry_id;
    insert into public.journal_lines (
      journal_entry_id, account_id, description, debit, credit, sort_order
    ) values
      (entry_id, bank_id, invoice_row.recipient_name, invoice_row.total, 0, 0),
      (entry_id, public.accounting_account_id(owner_id, 'accounts_receivable'),
       'Oppgjør kundefordring', 0, invoice_row.total, 1);
    insert into public.accounting_payments (
      owner_user_id, direction, sales_invoice_id, bank_account_id,
      amount, payment_date, journal_entry_id
    ) values (owner_id, 'incoming', p_invoice_id, bank_id, invoice_row.total, p_payment_date, entry_id);
    update public.invoices set paid = true, paid_at = p_payment_date where id = p_invoice_id;
  else
    select * into payment_row from public.accounting_payments
     where sales_invoice_id = p_invoice_id and status = 'active';
    if not found then
      update public.invoices set paid = false, paid_at = null where id = p_invoice_id;
      return;
    end if;
    reversal_id := public.reverse_journal_entry(
      payment_row.journal_entry_id, p_payment_date,
      'Korrigering av innbetaling faktura ' || invoice_row.invoice_number
    );
    update public.accounting_payments
       set status = 'reversed', reversed_at = now(), reversal_journal_entry_id = reversal_id
     where id = payment_row.id;
    update public.invoices set paid = false, paid_at = null where id = p_invoice_id;
  end if;
end;
$$;

create or replace function public.set_supplier_invoice_paid(
  p_supplier_invoice_id uuid,
  p_paid boolean,
  p_payment_date date default current_date,
  p_bank_account_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid := auth.uid();
  invoice_row public.supplier_invoices%rowtype;
  supplier_name text;
  bank_id uuid;
  entry_id uuid;
  entry_number bigint;
  payment_row public.accounting_payments%rowtype;
  reversal_id uuid;
begin
  select * into invoice_row
    from public.supplier_invoices
   where id = p_supplier_invoice_id and owner_user_id = owner_id;
  if not found or invoice_row.status = 'cancelled' then
    raise exception 'Den inngående fakturaen kan ikke betalingsføres';
  end if;
  select name into supplier_name from public.suppliers where id = invoice_row.supplier_id;

  if p_paid then
    if invoice_row.status = 'paid' then return; end if;
    perform public.require_open_accounting_period(owner_id, p_payment_date);
    bank_id := coalesce(p_bank_account_id, public.accounting_account_id(owner_id, 'bank'));
    if not exists (
      select 1 from public.accounting_accounts where id = bank_id
       and owner_user_id = owner_id and category = 'asset' and is_active
    ) then raise exception 'Ugyldig betalingskonto'; end if;
    entry_number := public.next_voucher_number(owner_id);
    insert into public.journal_entries (
      owner_user_id, voucher_number, entry_date, description, source_type, source_id
    ) values (
      owner_id, entry_number, p_payment_date,
      'Betaling inngående faktura ' || invoice_row.invoice_number,
      'supplier_payment', p_supplier_invoice_id
    ) returning id into entry_id;
    insert into public.journal_lines (
      journal_entry_id, account_id, description, debit, credit, sort_order
    ) values
      (entry_id, public.accounting_account_id(owner_id, 'accounts_payable'),
       'Oppgjør leverandørgjeld', invoice_row.total, 0, 0),
      (entry_id, bank_id, supplier_name, 0, invoice_row.total, 1);
    insert into public.accounting_payments (
      owner_user_id, direction, supplier_invoice_id, bank_account_id,
      amount, payment_date, journal_entry_id
    ) values (owner_id, 'outgoing', p_supplier_invoice_id, bank_id, invoice_row.total, p_payment_date, entry_id);
    update public.supplier_invoices
       set status = 'paid', paid_at = p_payment_date
     where id = p_supplier_invoice_id;
  else
    select * into payment_row from public.accounting_payments
     where supplier_invoice_id = p_supplier_invoice_id and status = 'active';
    if not found then
      update public.supplier_invoices set status = 'posted', paid_at = null
       where id = p_supplier_invoice_id;
      return;
    end if;
    reversal_id := public.reverse_journal_entry(
      payment_row.journal_entry_id, p_payment_date,
      'Korrigering av betaling ' || invoice_row.invoice_number
    );
    update public.accounting_payments
       set status = 'reversed', reversed_at = now(), reversal_journal_entry_id = reversal_id
     where id = payment_row.id;
    update public.supplier_invoices set status = 'posted', paid_at = null
     where id = p_supplier_invoice_id;
  end if;
end;
$$;

create or replace function public.cancel_supplier_invoice(
  p_supplier_invoice_id uuid,
  p_cancellation_date date default current_date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid := auth.uid();
  invoice_row public.supplier_invoices%rowtype;
begin
  select * into invoice_row from public.supplier_invoices
   where id = p_supplier_invoice_id and owner_user_id = owner_id;
  if not found then raise exception 'Fakturaen finnes ikke'; end if;
  if invoice_row.status = 'cancelled' then return; end if;
  if invoice_row.status = 'paid' then
    raise exception 'Betalingen må korrigeres før fakturaen kan annulleres';
  end if;
  perform public.reverse_journal_entry(
    invoice_row.journal_entry_id, p_cancellation_date,
    'Annullering av inngående faktura ' || invoice_row.invoice_number
  );
  update public.supplier_invoices set status = 'cancelled'
   where id = p_supplier_invoice_id;
end;
$$;

create or replace function public.set_accounting_period_status(
  p_year integer,
  p_month integer,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_year not between 2000 and 2200 or p_month not between 1 and 12
     or p_status not in ('open', 'closed') then
    raise exception 'Ugyldig regnskapsperiode';
  end if;
  insert into public.accounting_periods (owner_user_id, year, month, status, closed_at)
  values (auth.uid(), p_year, p_month, p_status,
          case when p_status = 'closed' then now() else null end)
  on conflict (owner_user_id, year, month) do update
    set status = excluded.status,
        closed_at = excluded.closed_at;
end;
$$;

create or replace function public.prevent_posted_journal_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  raise exception 'Bokførte bilag kan ikke endres eller slettes';
end;
$$;

create or replace function public.protect_system_account_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.is_system and (
    new.owner_user_id is distinct from old.owner_user_id
    or new.account_number is distinct from old.account_number
    or new.name is distinct from old.name
    or new.category is distinct from old.category
    or new.system_key is distinct from old.system_key
    or new.is_system is distinct from old.is_system
    or not new.is_active
  ) then
    raise exception 'Systemkontoer kan ikke endres eller deaktiveres';
  end if;
  if not old.is_system and (
    new.owner_user_id is distinct from old.owner_user_id
    or new.is_system
    or new.system_key is not null
  ) then
    raise exception 'En vanlig konto kan ikke gjøres om til systemkonto';
  end if;
  return new;
end;
$$;

drop trigger if exists journal_entries_immutable on public.journal_entries;
create trigger journal_entries_immutable
  before update or delete on public.journal_entries
  for each row execute function public.prevent_posted_journal_changes();

drop trigger if exists journal_lines_immutable on public.journal_lines;
create trigger journal_lines_immutable
  before update or delete on public.journal_lines
  for each row execute function public.prevent_posted_journal_changes();

drop trigger if exists accounting_accounts_set_updated_at on public.accounting_accounts;
create trigger accounting_accounts_set_updated_at
  before update on public.accounting_accounts
  for each row execute function public.set_updated_at();
drop trigger if exists accounting_accounts_protect_system_fields on public.accounting_accounts;
create trigger accounting_accounts_protect_system_fields
  before update on public.accounting_accounts
  for each row execute function public.protect_system_account_fields();
drop trigger if exists accounting_periods_set_updated_at on public.accounting_periods;
create trigger accounting_periods_set_updated_at
  before update on public.accounting_periods
  for each row execute function public.set_updated_at();
drop trigger if exists suppliers_set_updated_at on public.suppliers;
create trigger suppliers_set_updated_at
  before update on public.suppliers
  for each row execute function public.set_updated_at();
drop trigger if exists supplier_invoices_set_updated_at on public.supplier_invoices;
create trigger supplier_invoices_set_updated_at
  before update on public.supplier_invoices
  for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'accounting-documents', 'accounting-documents', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.accounting_accounts enable row level security;
alter table public.accounting_sequences enable row level security;
alter table public.accounting_periods enable row level security;
alter table public.suppliers enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;
alter table public.supplier_invoices enable row level security;
alter table public.supplier_invoice_lines enable row level security;
alter table public.supplier_invoice_attachments enable row level security;
alter table public.accounting_payments enable row level security;

create policy "accounting_accounts_owner_select" on public.accounting_accounts
  for select using (auth.uid() = owner_user_id);
create policy "accounting_accounts_owner_update" on public.accounting_accounts
  for update using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
create policy "accounting_accounts_owner_insert" on public.accounting_accounts
  for insert with check (
    auth.uid() = owner_user_id
    and not is_system
    and system_key is null
  );
create policy "accounting_periods_owner_select" on public.accounting_periods
  for select using (auth.uid() = owner_user_id);
create policy "suppliers_owner_access" on public.suppliers
  for all using (auth.uid() = owner_user_id) with check (
    auth.uid() = owner_user_id
    and (
      default_expense_account_id is null
      or exists (
        select 1 from public.accounting_accounts account
         where account.id = default_expense_account_id
           and account.owner_user_id = auth.uid()
      )
    )
  );
create policy "journal_entries_owner_select" on public.journal_entries
  for select using (auth.uid() = owner_user_id);
create policy "journal_lines_owner_select" on public.journal_lines
  for select using (
    exists (select 1 from public.journal_entries entry
             where entry.id = journal_entry_id and entry.owner_user_id = auth.uid())
  );
create policy "supplier_invoices_owner_select" on public.supplier_invoices
  for select using (auth.uid() = owner_user_id);
create policy "supplier_invoice_lines_owner_select" on public.supplier_invoice_lines
  for select using (
    exists (select 1 from public.supplier_invoices invoice
             where invoice.id = supplier_invoice_id and invoice.owner_user_id = auth.uid())
  );
create policy "supplier_invoice_attachments_owner_select" on public.supplier_invoice_attachments
  for select using (
    exists (select 1 from public.supplier_invoices invoice
             where invoice.id = supplier_invoice_id and invoice.owner_user_id = auth.uid())
  );
create policy "accounting_payments_owner_select" on public.accounting_payments
  for select using (auth.uid() = owner_user_id);

drop policy if exists "accounting_documents_storage_select" on storage.objects;
create policy "accounting_documents_storage_select" on storage.objects for select
using (bucket_id = 'accounting-documents' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "accounting_documents_storage_insert" on storage.objects;
create policy "accounting_documents_storage_insert" on storage.objects for insert
with check (bucket_id = 'accounting-documents' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "accounting_documents_storage_delete" on storage.objects;
create policy "accounting_documents_storage_delete" on storage.objects for delete
using (bucket_id = 'accounting-documents' and (storage.foldername(name))[1] = auth.uid()::text);

grant select, insert, update on public.accounting_accounts to authenticated;
grant select on public.accounting_periods to authenticated;
grant select, insert, update, delete on public.suppliers to authenticated;
grant select on public.journal_entries, public.journal_lines to authenticated;
grant select on public.supplier_invoices, public.supplier_invoice_lines,
  public.supplier_invoice_attachments, public.accounting_payments to authenticated;

revoke all on function public.seed_default_accounting_accounts(uuid) from public, anon, authenticated;
revoke all on function public.next_voucher_number(uuid) from public, anon, authenticated;
revoke all on function public.require_open_accounting_period(uuid, date) from public, anon, authenticated;
revoke all on function public.accounting_account_id(uuid, text) from public, anon, authenticated;
revoke all on function public.post_sales_invoice_to_ledger(uuid) from public, anon, authenticated;
revoke all on function public.create_supplier_invoice(uuid, uuid, text, date, date, text, jsonb, jsonb, boolean, date, uuid) from public, anon;
revoke all on function public.create_manual_journal_entry(date, text, jsonb) from public, anon;
revoke all on function public.reverse_journal_entry(uuid, date, text) from public, anon, authenticated;
revoke all on function public.set_sales_invoice_paid(uuid, boolean, date, uuid) from public, anon;
revoke all on function public.set_supplier_invoice_paid(uuid, boolean, date, uuid) from public, anon;
revoke all on function public.cancel_supplier_invoice(uuid, date) from public, anon;
revoke all on function public.set_accounting_period_status(integer, integer, text) from public, anon;

grant execute on function public.create_supplier_invoice(uuid, uuid, text, date, date, text, jsonb, jsonb, boolean, date, uuid) to authenticated;
grant execute on function public.create_manual_journal_entry(date, text, jsonb) to authenticated;
grant execute on function public.set_sales_invoice_paid(uuid, boolean, date, uuid) to authenticated;
grant execute on function public.set_supplier_invoice_paid(uuid, boolean, date, uuid) to authenticated;
grant execute on function public.cancel_supplier_invoice(uuid, date) to authenticated;
grant execute on function public.set_accounting_period_status(integer, integer, text) to authenticated;

create index if not exists accounting_accounts_owner_idx on public.accounting_accounts (owner_user_id, account_number);
create index if not exists accounting_periods_owner_idx on public.accounting_periods (owner_user_id, year, month);
create index if not exists suppliers_owner_idx on public.suppliers (owner_user_id, name);
create index if not exists journal_entries_owner_date_idx on public.journal_entries (owner_user_id, entry_date desc);
create index if not exists journal_lines_entry_idx on public.journal_lines (journal_entry_id, sort_order);
create index if not exists journal_lines_account_idx on public.journal_lines (account_id);
create index if not exists supplier_invoices_owner_date_idx on public.supplier_invoices (owner_user_id, invoice_date desc);
create index if not exists supplier_invoices_supplier_idx on public.supplier_invoices (supplier_id);
create index if not exists supplier_invoice_lines_invoice_idx on public.supplier_invoice_lines (supplier_invoice_id);
create index if not exists supplier_invoice_attachments_invoice_idx on public.supplier_invoice_attachments (supplier_invoice_id);
create index if not exists accounting_payments_owner_date_idx on public.accounting_payments (owner_user_id, payment_date desc);

-- Backfill all finalized sales invoices and their existing paid state.
update public.invoices
   set finalized_at = coalesce(updated_at, created_at)
 where finalized_at is null
   and invoice_number is not null
   and status in ('ready', 'sent', 'reminded', 'paid');

update public.invoices set paid = true where status = 'paid' and not paid;

do $$
declare
  invoice_row record;
begin
  for invoice_row in
    select id, paid, coalesce(paid_at, updated_at::date) as payment_date
      from public.invoices
     where finalized_at is not null and status <> 'cancelled'
     order by issue_date, created_at
  loop
    perform public.post_sales_invoice_to_ledger(invoice_row.id);
    if invoice_row.paid and exists (
      select 1 from public.invoices paid_invoice
       where paid_invoice.id = invoice_row.id and paid_invoice.total > 0
    ) then
      -- Migration sessions do not have auth.uid(); create legacy payment rows
      -- directly after the sales invoice posting.
      declare
        source_invoice public.invoices%rowtype;
        payment_entry_id uuid;
        payment_number bigint;
        default_bank_id uuid;
      begin
        select * into source_invoice from public.invoices where id = invoice_row.id;
        default_bank_id := public.accounting_account_id(source_invoice.owner_user_id, 'bank');
        payment_number := public.next_voucher_number(source_invoice.owner_user_id);
        insert into public.journal_entries (
          owner_user_id, voucher_number, entry_date, description, source_type, source_id
        ) values (
          source_invoice.owner_user_id, payment_number, invoice_row.payment_date,
          'Innbetaling faktura ' || source_invoice.invoice_number,
          'sales_payment', source_invoice.id
        ) returning id into payment_entry_id;
        insert into public.journal_lines (
          journal_entry_id, account_id, description, debit, credit, sort_order
        ) values
          (payment_entry_id, default_bank_id, source_invoice.recipient_name, source_invoice.total, 0, 0),
          (payment_entry_id, public.accounting_account_id(source_invoice.owner_user_id, 'accounts_receivable'),
           'Oppgjør kundefordring', 0, source_invoice.total, 1);
        insert into public.accounting_payments (
          owner_user_id, direction, sales_invoice_id, bank_account_id,
          amount, payment_date, journal_entry_id
        ) values (
          source_invoice.owner_user_id, 'incoming', source_invoice.id, default_bank_id,
          source_invoice.total, invoice_row.payment_date, payment_entry_id
        );
        update public.invoices set paid_at = invoice_row.payment_date where id = source_invoice.id;
      exception when unique_violation then
        null;
      end;
    end if;
  end loop;
end;
$$;


-- ============================================================================

-- Source migration: supabase/migrations/20260816010000_supplier_invoice_pdf_import.sql

alter table public.supplier_invoices
  add column if not exists kid text check (kid is null or kid ~ '^[0-9]{2,25}$');

create or replace function public.require_supplier_invoice_attachment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
      from public.supplier_invoice_attachments
     where supplier_invoice_id = new.id
  ) then
    raise exception 'Den mottatte fakturaen må legges ved som originaldokument';
  end if;
  return new;
end;
$$;

drop trigger if exists supplier_invoice_requires_attachment on public.supplier_invoices;
create constraint trigger supplier_invoice_requires_attachment
  after insert on public.supplier_invoices
  deferrable initially deferred
  for each row execute function public.require_supplier_invoice_attachment();

create or replace function public.create_supplier_invoice(
  p_invoice_id uuid,
  p_supplier_id uuid,
  p_invoice_number text,
  p_invoice_date date,
  p_due_date date,
  p_kid text,
  p_description text,
  p_lines jsonb,
  p_attachments jsonb default '[]'::jsonb,
  p_mark_paid boolean default false,
  p_payment_date date default null,
  p_bank_account_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  created_invoice_id uuid;
begin
  if p_kid is not null and btrim(p_kid) !~ '^[0-9]{2,25}$' then
    raise exception 'KID er ugyldig';
  end if;
  if jsonb_typeof(p_attachments) <> 'array' or jsonb_array_length(p_attachments) = 0 then
    raise exception 'Den mottatte fakturaen må legges ved som originaldokument';
  end if;

  created_invoice_id := public.create_supplier_invoice(
    p_invoice_id,
    p_supplier_id,
    p_invoice_number,
    p_invoice_date,
    p_due_date,
    p_description,
    p_lines,
    p_attachments,
    p_mark_paid,
    p_payment_date,
    p_bank_account_id
  );

  update public.supplier_invoices
     set kid = nullif(btrim(p_kid), '')
   where id = created_invoice_id
     and owner_user_id = auth.uid();

  return created_invoice_id;
end;
$$;

revoke all on function public.require_supplier_invoice_attachment() from public, anon, authenticated;
revoke all on function public.create_supplier_invoice(uuid, uuid, text, date, date, text, text, jsonb, jsonb, boolean, date, uuid) from public, anon;
grant execute on function public.create_supplier_invoice(uuid, uuid, text, date, date, text, text, jsonb, jsonb, boolean, date, uuid) to authenticated;


-- ============================================================================

-- Source migration: supabase/migrations/20260816020000_supplier_invoice_currency.sql

alter table public.supplier_invoices
  drop constraint if exists supplier_invoices_currency_check;

alter table public.supplier_invoices
  add column if not exists exchange_rate numeric(18, 8) not null default 1,
  add column if not exists exchange_rate_date date,
  add column if not exists exchange_rate_source text,
  add column if not exists original_subtotal numeric(14, 2) not null default 0,
  add column if not exists original_vat_total numeric(14, 2) not null default 0,
  add column if not exists original_total numeric(14, 2) not null default 0;

update public.supplier_invoices
   set exchange_rate = 1,
       exchange_rate_date = coalesce(exchange_rate_date, invoice_date),
       exchange_rate_source = coalesce(exchange_rate_source, 'NOK'),
       original_subtotal = subtotal,
       original_vat_total = vat_total,
       original_total = total
 where original_total = 0;

alter table public.supplier_invoices
  add constraint supplier_invoices_currency_code_check check (currency ~ '^[A-Z]{3}$'),
  add constraint supplier_invoices_exchange_rate_check check (exchange_rate > 0),
  add constraint supplier_invoices_original_amounts_check check (
    (original_subtotal = 0 and original_vat_total = 0 and original_total = 0)
    or (
      original_subtotal >= 0
      and original_vat_total >= 0
      and original_total > 0
      and original_total = original_subtotal + original_vat_total
    )
  );

alter table public.supplier_invoice_lines
  add column if not exists original_net_amount numeric(14, 2) not null default 0,
  add column if not exists original_vat_amount numeric(14, 2) not null default 0,
  add column if not exists original_gross_amount numeric(14, 2) not null default 0;

update public.supplier_invoice_lines
   set original_net_amount = net_amount,
       original_vat_amount = vat_amount,
       original_gross_amount = gross_amount
 where original_gross_amount = 0;

alter table public.supplier_invoice_lines
  add constraint supplier_invoice_lines_original_amounts_check check (
    (original_net_amount = 0 and original_vat_amount = 0 and original_gross_amount = 0)
    or (
      original_net_amount >= 0
      and original_vat_amount >= 0
      and original_gross_amount > 0
      and original_gross_amount = original_net_amount + original_vat_amount
    )
  );

drop function if exists public.set_supplier_invoice_paid(uuid, boolean, date, uuid);

create or replace function public.set_supplier_invoice_paid(
  p_supplier_invoice_id uuid,
  p_paid boolean,
  p_payment_date date default current_date,
  p_bank_account_id uuid default null,
  p_paid_amount_nok numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid := auth.uid();
  invoice_row public.supplier_invoices%rowtype;
  supplier_name text;
  bank_id uuid;
  entry_id uuid;
  entry_number bigint;
  payment_row public.accounting_payments%rowtype;
  reversal_id uuid;
  paid_amount numeric(14, 2);
  currency_difference numeric(14, 2);
  difference_account_id uuid;
begin
  select * into invoice_row
    from public.supplier_invoices
   where id = p_supplier_invoice_id and owner_user_id = owner_id;
  if not found or invoice_row.status = 'cancelled' then
    raise exception 'Den inngående fakturaen kan ikke betalingsføres';
  end if;
  select name into supplier_name from public.suppliers where id = invoice_row.supplier_id;

  if p_paid then
    if invoice_row.status = 'paid' then return; end if;
    perform public.require_open_accounting_period(owner_id, p_payment_date);
    bank_id := coalesce(p_bank_account_id, public.accounting_account_id(owner_id, 'bank'));
    if not exists (
      select 1 from public.accounting_accounts where id = bank_id
       and owner_user_id = owner_id and category = 'asset' and is_active
    ) then raise exception 'Ugyldig betalingskonto'; end if;

    paid_amount := round(coalesce(p_paid_amount_nok, invoice_row.total), 2);
    if paid_amount <= 0 then raise exception 'Betalt beløp i NOK må være større enn 0'; end if;
    currency_difference := round(paid_amount - invoice_row.total, 2);

    entry_number := public.next_voucher_number(owner_id);
    insert into public.journal_entries (
      owner_user_id, voucher_number, entry_date, description, source_type, source_id
    ) values (
      owner_id, entry_number, p_payment_date,
      'Betaling inngående faktura ' || invoice_row.invoice_number,
      'supplier_payment', p_supplier_invoice_id
    ) returning id into entry_id;

    insert into public.journal_lines (
      journal_entry_id, account_id, description, debit, credit, sort_order
    ) values
      (entry_id, public.accounting_account_id(owner_id, 'accounts_payable'),
       'Oppgjør leverandørgjeld', invoice_row.total, 0, 0),
      (entry_id, bank_id, supplier_name, 0, paid_amount, 1);

    if currency_difference > 0 then
      select id into difference_account_id
        from public.accounting_accounts
       where owner_user_id = owner_id and account_number = '8160' and is_active;
      if difference_account_id is null then
        insert into public.accounting_accounts (
          owner_user_id, account_number, name, category, system_key, is_system
        ) values (owner_id, '8160', 'Valutatap', 'expense', null, true)
        on conflict (owner_user_id, account_number) do nothing
        returning id into difference_account_id;
        if difference_account_id is null then
          select id into difference_account_id from public.accounting_accounts
           where owner_user_id = owner_id and account_number = '8160' and is_active;
        end if;
      end if;
      if difference_account_id is null then raise exception 'Aktiv konto 8160 for valutatap mangler'; end if;
      insert into public.journal_lines (
        journal_entry_id, account_id, description, debit, credit, sort_order
      ) values (entry_id, difference_account_id, 'Valutatap ved betaling', currency_difference, 0, 2);
    elsif currency_difference < 0 then
      select id into difference_account_id
        from public.accounting_accounts
       where owner_user_id = owner_id and account_number = '8060' and is_active;
      if difference_account_id is null then
        insert into public.accounting_accounts (
          owner_user_id, account_number, name, category, system_key, is_system
        ) values (owner_id, '8060', 'Valutagevinst', 'revenue', null, true)
        on conflict (owner_user_id, account_number) do nothing
        returning id into difference_account_id;
        if difference_account_id is null then
          select id into difference_account_id from public.accounting_accounts
           where owner_user_id = owner_id and account_number = '8060' and is_active;
        end if;
      end if;
      if difference_account_id is null then raise exception 'Aktiv konto 8060 for valutagevinst mangler'; end if;
      insert into public.journal_lines (
        journal_entry_id, account_id, description, debit, credit, sort_order
      ) values (entry_id, difference_account_id, 'Valutagevinst ved betaling', 0, abs(currency_difference), 2);
    end if;

    if not exists (
      select 1 from public.journal_lines where journal_entry_id = entry_id
      group by journal_entry_id having sum(debit) = sum(credit)
    ) then
      raise exception 'Bokføringen av valutabetalingen balanserer ikke';
    end if;

    insert into public.accounting_payments (
      owner_user_id, direction, supplier_invoice_id, bank_account_id,
      amount, payment_date, journal_entry_id
    ) values (owner_id, 'outgoing', p_supplier_invoice_id, bank_id, paid_amount, p_payment_date, entry_id);
    update public.supplier_invoices
       set status = 'paid', paid_at = p_payment_date
     where id = p_supplier_invoice_id;
  else
    select * into payment_row from public.accounting_payments
     where supplier_invoice_id = p_supplier_invoice_id and status = 'active';
    if not found then
      update public.supplier_invoices set status = 'posted', paid_at = null
       where id = p_supplier_invoice_id;
      return;
    end if;
    reversal_id := public.reverse_journal_entry(
      payment_row.journal_entry_id, p_payment_date,
      'Korrigering av betaling ' || invoice_row.invoice_number
    );
    update public.accounting_payments
       set status = 'reversed', reversed_at = now(), reversal_journal_entry_id = reversal_id
     where id = payment_row.id;
    update public.supplier_invoices set status = 'posted', paid_at = null
     where id = p_supplier_invoice_id;
  end if;
end;
$$;

create or replace function public.create_supplier_invoice(
  p_invoice_id uuid,
  p_supplier_id uuid,
  p_invoice_number text,
  p_invoice_date date,
  p_due_date date,
  p_kid text,
  p_currency text,
  p_exchange_rate numeric,
  p_exchange_rate_date date,
  p_exchange_rate_source text,
  p_description text,
  p_lines jsonb,
  p_attachments jsonb default '[]'::jsonb,
  p_mark_paid boolean default false,
  p_payment_date date default null,
  p_bank_account_id uuid default null,
  p_payment_amount_nok numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  created_invoice_id uuid;
  currency_value text := upper(btrim(p_currency));
  rate_value numeric(18, 8);
  original_subtotal_value numeric(14, 2);
  original_vat_value numeric(14, 2);
  original_total_value numeric(14, 2);
begin
  if currency_value !~ '^[A-Z]{3}$' then raise exception 'Valutakoden er ugyldig'; end if;
  rate_value := case when currency_value = 'NOK' then 1 else p_exchange_rate end;
  if rate_value is null or rate_value <= 0 then raise exception 'Valutakursen er ugyldig'; end if;
  if p_exchange_rate_date is not null and p_exchange_rate_date > p_invoice_date then
    raise exception 'Kursdato kan ikke være etter fakturadato';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_lines) line
     where (line ->> 'original_net_amount')::numeric <= 0
        or (line ->> 'original_vat_amount')::numeric < 0
        or (line ->> 'original_gross_amount')::numeric <= 0
        or round(
          (line ->> 'original_net_amount')::numeric
          + (line ->> 'original_vat_amount')::numeric,
          2
        ) <> round((line ->> 'original_gross_amount')::numeric, 2)
        or round((line ->> 'original_net_amount')::numeric * rate_value, 2)
           <> round((line ->> 'net_amount')::numeric, 2)
        or round((line ->> 'original_vat_amount')::numeric * rate_value, 2)
           <> round((line ->> 'vat_amount')::numeric, 2)
  ) then
    raise exception 'Valutabeløpene på en kostnadslinje er ugyldige';
  end if;

  select
    round(sum((line ->> 'original_net_amount')::numeric), 2),
    round(sum((line ->> 'original_vat_amount')::numeric), 2),
    round(sum((line ->> 'original_gross_amount')::numeric), 2)
    into original_subtotal_value, original_vat_value, original_total_value
    from jsonb_array_elements(p_lines) line;
  if coalesce(original_total_value, 0) <= 0
     or original_total_value <> original_subtotal_value + original_vat_value then
    raise exception 'Originalbeløpene på fakturaen er ugyldige';
  end if;

  created_invoice_id := public.create_supplier_invoice(
    p_invoice_id,
    p_supplier_id,
    p_invoice_number,
    p_invoice_date,
    p_due_date,
    p_kid,
    p_description,
    p_lines,
    p_attachments,
    false,
    null,
    null
  );

  update public.supplier_invoices
     set currency = currency_value,
         exchange_rate = rate_value,
         exchange_rate_date = coalesce(p_exchange_rate_date, p_invoice_date),
         exchange_rate_source = coalesce(nullif(btrim(p_exchange_rate_source), ''), 'Manuelt oppgitt'),
         original_subtotal = original_subtotal_value,
         original_vat_total = original_vat_value,
         original_total = original_total_value
   where id = created_invoice_id
     and owner_user_id = auth.uid();

  update public.supplier_invoice_lines invoice_line
     set original_net_amount = round((source.line ->> 'original_net_amount')::numeric, 2),
         original_vat_amount = round((source.line ->> 'original_vat_amount')::numeric, 2),
         original_gross_amount = round((source.line ->> 'original_gross_amount')::numeric, 2)
    from jsonb_array_elements(p_lines) with ordinality as source(line, ordinality)
   where invoice_line.supplier_invoice_id = created_invoice_id
     and invoice_line.sort_order = source.ordinality::integer - 1;

  if p_mark_paid then
    perform public.set_supplier_invoice_paid(
      created_invoice_id,
      true,
      coalesce(p_payment_date, p_invoice_date),
      p_bank_account_id,
      p_payment_amount_nok
    );
  end if;

  return created_invoice_id;
end;
$$;

revoke all on function public.create_supplier_invoice(uuid, uuid, text, date, date, text, jsonb, jsonb, boolean, date, uuid) from authenticated;
revoke all on function public.create_supplier_invoice(uuid, uuid, text, date, date, text, text, jsonb, jsonb, boolean, date, uuid) from authenticated;
revoke all on function public.create_supplier_invoice(uuid, uuid, text, date, date, text, text, numeric, date, text, text, jsonb, jsonb, boolean, date, uuid, numeric) from public, anon;
revoke all on function public.set_supplier_invoice_paid(uuid, boolean, date, uuid, numeric) from public, anon;
grant execute on function public.create_supplier_invoice(uuid, uuid, text, date, date, text, text, numeric, date, text, text, jsonb, jsonb, boolean, date, uuid, numeric) to authenticated;
grant execute on function public.set_supplier_invoice_paid(uuid, boolean, date, uuid, numeric) to authenticated;


-- ============================================================================

-- Source migration: supabase/migrations/20260817000000_historical_sales_invoice_import.sql

alter table public.invoices
  add column if not exists is_historical boolean not null default false,
  add column if not exists historical_pdf_name text;

alter table public.invoices
  drop constraint if exists invoices_historical_source_check;
alter table public.invoices
  add constraint invoices_historical_source_check check (
    not is_historical
    or (
      company_id is null
      and pdf_storage_path is not null
      and nullif(btrim(historical_pdf_name), '') is not null
    )
  );

create index if not exists invoices_owner_historical_issue_date_idx
  on public.invoices (owner_user_id, issue_date desc)
  where is_historical;

create or replace function public.prevent_finalized_invoice_content_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin') then
    return new;
  end if;

  if old.finalized_at is not null and (
    new.owner_user_id is distinct from old.owner_user_id or
    new.company_id is distinct from old.company_id or
    new.recipient_name is distinct from old.recipient_name or
    new.recipient_org_number is distinct from old.recipient_org_number or
    new.recipient_email is distinct from old.recipient_email or
    new.recipient_country is distinct from old.recipient_country or
    new.invoice_number is distinct from old.invoice_number or
    new.title is distinct from old.title or
    new.issue_date is distinct from old.issue_date or
    new.due_date is distinct from old.due_date or
    new.pdf_template is distinct from old.pdf_template or
    new.notes is distinct from old.notes or
    new.subtotal is distinct from old.subtotal or
    new.vat_total is distinct from old.vat_total or
    new.total is distinct from old.total or
    new.finalized_at is distinct from old.finalized_at or
    new.is_historical is distinct from old.is_historical or
    new.historical_pdf_name is distinct from old.historical_pdf_name
  ) then
    raise exception 'A finalized invoice cannot be edited';
  end if;

  return new;
end;
$$;

create or replace function public.create_historical_sales_invoice(
  p_invoice_id uuid,
  p_invoice_number text,
  p_recipient_name text,
  p_recipient_org_number text,
  p_recipient_email text,
  p_recipient_country text,
  p_issue_date date,
  p_due_date date,
  p_title text,
  p_lines jsonb,
  p_pdf_storage_path text,
  p_pdf_original_name text,
  p_mark_paid boolean,
  p_payment_date date,
  p_bank_account_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  authenticated_owner_id uuid := auth.uid();
  expected_storage_path text;
  invoice_line jsonb;
  line_description text;
  gross_amount numeric(14, 2);
  vat_rate numeric(5, 2);
  net_amount numeric(14, 2);
  vat_amount numeric(14, 2);
  invoice_subtotal numeric(14, 2) := 0;
  invoice_vat_total numeric(14, 2) := 0;
  invoice_total numeric(14, 2) := 0;
  line_order integer := 0;
begin
  if authenticated_owner_id is null then
    raise exception 'Du må være innlogget for å importere en historisk faktura';
  end if;
  if p_invoice_id is null then
    raise exception 'Faktura-ID mangler';
  end if;
  if nullif(btrim(p_invoice_number), '') is null then
    raise exception 'Fakturanummer mangler';
  end if;
  if nullif(btrim(p_recipient_name), '') is null then
    raise exception 'Mottakernavn mangler';
  end if;
  if p_issue_date is null then
    raise exception 'Fakturadato mangler';
  end if;
  if p_issue_date > current_date then
    raise exception 'En historisk faktura kan ikke ha fakturadato i fremtiden';
  end if;
  if p_due_date is not null and p_due_date < p_issue_date then
    raise exception 'Forfallsdato kan ikke være før fakturadato';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Fakturaen må ha minst én fakturalinje';
  end if;

  expected_storage_path := authenticated_owner_id::text || '/historical-invoices/' || p_invoice_id::text || '.pdf';
  if p_pdf_storage_path is distinct from expected_storage_path then
    raise exception 'PDF-filen har en ugyldig lagringssti';
  end if;
  if nullif(btrim(p_pdf_original_name), '') is null then
    raise exception 'Navnet på original-PDF-en mangler';
  end if;
  if not exists (
    select 1
      from storage.objects
     where bucket_id = 'invoice-pdfs'
       and name = expected_storage_path
       and owner_id = authenticated_owner_id::text
  ) then
    raise exception 'Original-PDF-en er ikke lastet opp';
  end if;

  for invoice_line in select value from jsonb_array_elements(p_lines)
  loop
    if jsonb_typeof(invoice_line) <> 'object'
       or jsonb_typeof(invoice_line -> 'gross_amount') <> 'number'
       or jsonb_typeof(invoice_line -> 'vat_rate') <> 'number' then
      raise exception 'En eller flere fakturalinjer er ugyldige';
    end if;

    line_description := nullif(btrim(invoice_line ->> 'description'), '');
    gross_amount := round((invoice_line ->> 'gross_amount')::numeric, 2);
    vat_rate := (invoice_line ->> 'vat_rate')::numeric;

    if line_description is null then
      raise exception 'Alle fakturalinjer må ha en beskrivelse';
    end if;
    if gross_amount <= 0 then
      raise exception 'Alle fakturalinjer må ha et beløp større enn null';
    end if;
    if vat_rate not in (0, 12, 15, 25) then
      raise exception 'MVA-satsen må være 0, 12, 15 eller 25 prosent';
    end if;

    net_amount := case
      when vat_rate = 0 then gross_amount
      else round(gross_amount / (1 + vat_rate / 100), 2)
    end;
    vat_amount := gross_amount - net_amount;
    invoice_subtotal := invoice_subtotal + net_amount;
    invoice_vat_total := invoice_vat_total + vat_amount;
    invoice_total := invoice_total + gross_amount;
  end loop;

  insert into public.invoices (
    id,
    owner_user_id,
    company_id,
    recipient_name,
    recipient_org_number,
    recipient_email,
    recipient_country,
    schedule_id,
    invoice_number,
    title,
    issue_date,
    due_date,
    status,
    finalized_at,
    pdf_storage_path,
    pdf_locked_at,
    paid,
    pdf_template,
    notes,
    subtotal,
    vat_total,
    total,
    is_historical,
    historical_pdf_name
  ) values (
    p_invoice_id,
    authenticated_owner_id,
    null,
    btrim(p_recipient_name),
    nullif(regexp_replace(coalesce(p_recipient_org_number, ''), '[^0-9]', '', 'g'), ''),
    nullif(btrim(p_recipient_email), ''),
    coalesce(nullif(upper(btrim(p_recipient_country)), ''), 'NO'),
    null,
    btrim(p_invoice_number),
    coalesce(nullif(btrim(p_title), ''), 'Historisk faktura'),
    p_issue_date,
    p_due_date,
    'sent',
    p_issue_date::timestamptz,
    expected_storage_path,
    now(),
    false,
    'classic',
    'Importert historisk faktura fra original-PDF.',
    invoice_subtotal,
    invoice_vat_total,
    invoice_total,
    true,
    btrim(p_pdf_original_name)
  );

  for invoice_line in select value from jsonb_array_elements(p_lines)
  loop
    line_description := btrim(invoice_line ->> 'description');
    gross_amount := round((invoice_line ->> 'gross_amount')::numeric, 2);
    vat_rate := (invoice_line ->> 'vat_rate')::numeric;
    net_amount := case
      when vat_rate = 0 then gross_amount
      else round(gross_amount / (1 + vat_rate / 100), 2)
    end;
    vat_amount := gross_amount - net_amount;

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
    ) values (
      p_invoice_id,
      null,
      line_description,
      1,
      'stk',
      net_amount,
      vat_rate,
      net_amount,
      vat_amount,
      gross_amount,
      line_order
    );
    line_order := line_order + 1;
  end loop;

  perform public.post_sales_invoice_to_ledger(p_invoice_id);

  if coalesce(p_mark_paid, false) then
    if p_payment_date is null then
      raise exception 'Betalingsdato mangler';
    end if;
    if p_payment_date < p_issue_date then
      raise exception 'Betalingsdato kan ikke være før fakturadato';
    end if;
    if p_bank_account_id is null then
      raise exception 'Velg bankkonto for innbetalingen';
    end if;

    perform public.set_sales_invoice_paid(
      p_invoice_id,
      true,
      p_payment_date,
      p_bank_account_id
    );
  end if;

  return p_invoice_id;
end;
$$;

revoke all on function public.create_historical_sales_invoice(
  uuid, text, text, text, text, text, date, date, text, jsonb, text, text,
  boolean, date, uuid
) from public, anon;
grant execute on function public.create_historical_sales_invoice(
  uuid, text, text, text, text, text, date, date, text, jsonb, text, text,
  boolean, date, uuid
) to authenticated;


-- ============================================================================

-- Source migration: supabase/migrations/20260817010000_purchase_payments.sql

-- Direct card and bank purchases are posted against the account that funded the
-- purchase. Private outlays remain on a settlement/equity account until they are
-- reimbursed, instead of being routed through accounts payable.

alter table public.journal_entries
  drop constraint if exists journal_entries_source_type_check;

alter table public.journal_entries
  add constraint journal_entries_source_type_check check (
    source_type in (
      'sales_invoice', 'sales_payment', 'supplier_invoice',
      'supplier_payment', 'purchase_payment', 'purchase_reimbursement',
      'manual', 'correction'
    )
  );

create or replace function public.seed_purchase_payment_accounts(p_owner_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.accounting_accounts (
    owner_user_id, account_number, name, category, system_key, is_system
  ) values
    (p_owner_user_id, '2405', 'Kredittkortgjeld', 'liability', 'company_card', true),
    (p_owner_user_id, '2910', 'Gjeld ved private utlegg', 'liability', 'private_outlay', true)
  on conflict (owner_user_id, account_number) do nothing;
end;
$$;

create or replace function public.seed_purchase_payment_accounts_for_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_purchase_payment_accounts(new.id);
  return new;
end;
$$;

drop trigger if exists profiles_seed_purchase_payment_accounts on public.profiles;
create trigger profiles_seed_purchase_payment_accounts
  after insert on public.profiles
  for each row execute function public.seed_purchase_payment_accounts_for_profile();

do $$
declare
  profile_row record;
begin
  for profile_row in select id from public.profiles loop
    perform public.seed_purchase_payment_accounts(profile_row.id);
  end loop;
end;
$$;

create table if not exists public.purchase_payments (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles (id) on delete cascade,
  supplier_name text not null check (length(btrim(supplier_name)) > 0),
  supplier_org_number text,
  purchase_date date not null,
  description text not null check (length(btrim(description)) > 0),
  payment_source text not null check (payment_source in ('company', 'private')),
  settlement_account_id uuid not null references public.accounting_accounts (id) on delete restrict,
  paid_by text,
  attested_at timestamptz,
  attested_by uuid references public.profiles (id) on delete set null,
  status text not null default 'booked' check (status in ('booked', 'reimbursed', 'cancelled')),
  subtotal numeric(14, 2) not null check (subtotal >= 0),
  vat_total numeric(14, 2) not null check (vat_total >= 0),
  total numeric(14, 2) not null check (total > 0),
  journal_entry_id uuid not null references public.journal_entries (id) on delete cascade,
  reimbursed_at date,
  reimbursement_journal_entry_id uuid references public.journal_entries (id) on delete set null,
  cancelled_at date,
  cancellation_journal_entry_id uuid references public.journal_entries (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (payment_source = 'company' and paid_by is null and attested_at is null and attested_by is null)
    or
    (payment_source = 'private' and length(btrim(paid_by)) > 0 and attested_at is not null and attested_by is not null)
  )
);

create table if not exists public.purchase_payment_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_payment_id uuid not null references public.purchase_payments (id) on delete cascade,
  expense_account_id uuid not null references public.accounting_accounts (id) on delete restrict,
  description text not null check (length(btrim(description)) > 0),
  net_amount numeric(14, 2) not null check (net_amount >= 0),
  vat_rate numeric(5, 2) not null check (vat_rate in (0, 12, 15, 25)),
  vat_amount numeric(14, 2) not null check (vat_amount >= 0),
  gross_amount numeric(14, 2) not null check (gross_amount > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (purchase_payment_id, sort_order),
  check (gross_amount = net_amount + vat_amount)
);

create table if not exists public.purchase_payment_attachments (
  id uuid primary key default gen_random_uuid(),
  purchase_payment_id uuid not null references public.purchase_payments (id) on delete cascade,
  storage_path text not null,
  original_name text not null,
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at timestamptz not null default now(),
  unique (purchase_payment_id, storage_path)
);

create unique index if not exists journal_entries_purchase_payment_source_unique
  on public.journal_entries (owner_user_id, source_id)
  where source_id is not null and source_type = 'purchase_payment';

create index if not exists purchase_payments_owner_date_idx
  on public.purchase_payments (owner_user_id, purchase_date desc);
create index if not exists purchase_payment_lines_payment_idx
  on public.purchase_payment_lines (purchase_payment_id, sort_order);
create index if not exists purchase_payment_attachments_payment_idx
  on public.purchase_payment_attachments (purchase_payment_id);

alter table public.purchase_payments enable row level security;
alter table public.purchase_payment_lines enable row level security;
alter table public.purchase_payment_attachments enable row level security;

create policy "purchase_payments_owner_select" on public.purchase_payments
  for select using (auth.uid() = owner_user_id);
create policy "purchase_payment_lines_owner_select" on public.purchase_payment_lines
  for select using (
    exists (
      select 1 from public.purchase_payments payment
       where payment.id = purchase_payment_id
         and payment.owner_user_id = auth.uid()
    )
  );
create policy "purchase_payment_attachments_owner_select" on public.purchase_payment_attachments
  for select using (
    exists (
      select 1 from public.purchase_payments payment
       where payment.id = purchase_payment_id
         and payment.owner_user_id = auth.uid()
    )
  );

grant select on public.purchase_payments, public.purchase_payment_lines,
  public.purchase_payment_attachments to authenticated;

create or replace function public.create_purchase_payment(
  p_purchase_id uuid,
  p_supplier_name text,
  p_supplier_org_number text,
  p_purchase_date date,
  p_description text,
  p_payment_source text,
  p_settlement_account_id uuid,
  p_paid_by text,
  p_lines jsonb,
  p_attachments jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid := auth.uid();
  entry_id uuid;
  entry_number bigint;
  subtotal_value numeric(14, 2);
  vat_value numeric(14, 2);
  total_value numeric(14, 2);
  item jsonb;
  item_order integer := 0;
  vat_group record;
  vat_key text;
  account_key text;
begin
  if owner_id is null then raise exception 'Du må være logget inn'; end if;
  if p_purchase_id is null then raise exception 'Kjøps-ID mangler'; end if;
  if nullif(btrim(p_supplier_name), '') is null then raise exception 'Leverandørnavn mangler'; end if;
  if p_purchase_date is null then raise exception 'Kjøpsdato mangler'; end if;
  if nullif(btrim(p_description), '') is null then raise exception 'Formålet med kjøpet mangler'; end if;
  if p_payment_source not in ('company', 'private') then raise exception 'Betalingsmåten er ugyldig'; end if;
  if p_payment_source = 'private' and nullif(btrim(p_paid_by), '') is null then
    raise exception 'Navnet på den som la ut privat mangler';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Kjøpet må ha minst én kostnadslinje';
  end if;
  if jsonb_typeof(p_attachments) <> 'array' or jsonb_array_length(p_attachments) = 0 then
    raise exception 'Kvittering eller salgsdokument må legges ved';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_attachments) attachment
     where attachment ->> 'storage_path' not like owner_id::text || '/purchase-payments/' || p_purchase_id::text || '/%'
       or attachment ->> 'mime_type' not in ('application/pdf', 'image/jpeg', 'image/png')
       or (attachment ->> 'size_bytes')::bigint not between 1 and 10485760
  ) or coalesce((
    select sum((attachment ->> 'size_bytes')::bigint)
      from jsonb_array_elements(p_attachments) attachment
  ), 0) > 20971520 then
    raise exception 'Et kjøpsvedlegg er ugyldig';
  end if;

  perform public.seed_default_accounting_accounts(owner_id);
  perform public.seed_purchase_payment_accounts(owner_id);
  perform public.require_open_accounting_period(owner_id, p_purchase_date);

  select system_key into account_key
    from public.accounting_accounts
   where id = p_settlement_account_id
     and owner_user_id = owner_id
     and is_active;
  if not found or account_key is null
     or (p_payment_source = 'company' and account_key not in ('bank', 'company_card'))
     or (p_payment_source = 'private' and account_key not in ('private_outlay', 'private_equity')) then
    raise exception 'Oppgjørskontoen er ugyldig for valgt betalingsmåte';
  end if;

  select
    round(sum((line ->> 'net_amount')::numeric), 2),
    round(sum((line ->> 'vat_amount')::numeric), 2),
    round(sum((line ->> 'gross_amount')::numeric), 2)
    into subtotal_value, vat_value, total_value
    from jsonb_array_elements(p_lines) line;
  if coalesce(total_value, 0) <= 0 or total_value <> subtotal_value + vat_value then
    raise exception 'Beløpene på kjøpet er ugyldige';
  end if;

  for item in select value from jsonb_array_elements(p_lines) loop
    if (item ->> 'vat_rate')::numeric not in (0, 12, 15, 25)
       or (item ->> 'gross_amount')::numeric <= 0
       or (item ->> 'net_amount')::numeric <= 0
       or (item ->> 'vat_amount')::numeric < 0
       or round((item ->> 'net_amount')::numeric + (item ->> 'vat_amount')::numeric, 2)
          <> round((item ->> 'gross_amount')::numeric, 2)
       or nullif(btrim(item ->> 'description'), '') is null
       or not exists (
         select 1 from public.accounting_accounts
          where id = (item ->> 'expense_account_id')::uuid
            and owner_user_id = owner_id
            and category in ('expense', 'asset')
            and is_active
       ) then
      raise exception 'En kostnadslinje er ugyldig';
    end if;
  end loop;

  entry_number := public.next_voucher_number(owner_id);
  insert into public.journal_entries (
    owner_user_id, voucher_number, entry_date, description, source_type, source_id
  ) values (
    owner_id, entry_number, p_purchase_date,
    'Kort-/bankkjøp ' || btrim(p_supplier_name), 'purchase_payment', p_purchase_id
  ) returning id into entry_id;

  for item in select value from jsonb_array_elements(p_lines) loop
    insert into public.journal_lines (
      journal_entry_id, account_id, description, debit, credit, vat_rate, sort_order
    ) values (
      entry_id,
      (item ->> 'expense_account_id')::uuid,
      btrim(item ->> 'description'),
      round((item ->> 'net_amount')::numeric, 2),
      0,
      (item ->> 'vat_rate')::numeric,
      item_order
    );
    item_order := item_order + 1;
  end loop;

  for vat_group in
    select (line ->> 'vat_rate')::numeric as vat_rate,
           round(sum((line ->> 'vat_amount')::numeric), 2) as vat
      from jsonb_array_elements(p_lines) line
     group by (line ->> 'vat_rate')::numeric
  loop
    vat_key := public.vat_account_key('input', vat_group.vat_rate);
    if vat_group.vat > 0 and vat_key is not null then
      insert into public.journal_lines (
        journal_entry_id, account_id, description, debit, credit, vat_rate, sort_order
      ) values (
        entry_id,
        public.accounting_account_id(owner_id, vat_key),
        'Inngående MVA ' || vat_group.vat_rate || ' %',
        vat_group.vat,
        0,
        vat_group.vat_rate,
        item_order
      );
      item_order := item_order + 1;
    end if;
  end loop;

  insert into public.journal_lines (
    journal_entry_id, account_id, description, debit, credit, sort_order
  ) values (
    entry_id, p_settlement_account_id,
    case when p_payment_source = 'private' then 'Privat utlegg' else 'Betalt med selskapets konto/kort' end,
    0, total_value, item_order
  );

  if not exists (
    select 1 from public.journal_lines where journal_entry_id = entry_id
    group by journal_entry_id having sum(debit) = sum(credit)
  ) then
    raise exception 'Bokføringen av kjøpet balanserer ikke';
  end if;

  insert into public.purchase_payments (
    id, owner_user_id, supplier_name, supplier_org_number, purchase_date,
    description, payment_source, settlement_account_id, paid_by,
    attested_at, attested_by, subtotal, vat_total, total, journal_entry_id
  ) values (
    p_purchase_id, owner_id, btrim(p_supplier_name),
    nullif(regexp_replace(coalesce(p_supplier_org_number, ''), '\D', '', 'g'), ''),
    p_purchase_date, btrim(p_description), p_payment_source, p_settlement_account_id,
    case when p_payment_source = 'private' then btrim(p_paid_by) else null end,
    case when p_payment_source = 'private' then now() else null end,
    case when p_payment_source = 'private' then owner_id else null end,
    subtotal_value, vat_value, total_value, entry_id
  );

  insert into public.purchase_payment_lines (
    purchase_payment_id, expense_account_id, description, net_amount,
    vat_rate, vat_amount, gross_amount, sort_order
  )
  select
    p_purchase_id,
    (line ->> 'expense_account_id')::uuid,
    btrim(line ->> 'description'),
    round((line ->> 'net_amount')::numeric, 2),
    (line ->> 'vat_rate')::numeric,
    round((line ->> 'vat_amount')::numeric, 2),
    round((line ->> 'gross_amount')::numeric, 2),
    ordinality::integer - 1
  from jsonb_array_elements(p_lines) with ordinality as expanded(line, ordinality);

  insert into public.purchase_payment_attachments (
    id, purchase_payment_id, storage_path, original_name, mime_type, size_bytes
  )
  select
    (attachment ->> 'id')::uuid,
    p_purchase_id,
    attachment ->> 'storage_path',
    attachment ->> 'original_name',
    attachment ->> 'mime_type',
    (attachment ->> 'size_bytes')::bigint
  from jsonb_array_elements(p_attachments) attachment;

  return p_purchase_id;
end;
$$;

create or replace function public.reimburse_purchase_payment(
  p_purchase_id uuid,
  p_reimbursement_date date,
  p_bank_account_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid := auth.uid();
  purchase_row public.purchase_payments%rowtype;
  entry_id uuid;
  entry_number bigint;
begin
  select * into purchase_row from public.purchase_payments
   where id = p_purchase_id and owner_user_id = owner_id;
  if not found or purchase_row.payment_source <> 'private' or purchase_row.status <> 'booked' then
    raise exception 'Det private utlegget kan ikke refunderes';
  end if;
  if not exists (
    select 1 from public.accounting_accounts
     where id = p_bank_account_id and owner_user_id = owner_id
       and system_key = 'bank' and is_active
  ) then
    raise exception 'Bankkontoen er ugyldig';
  end if;
  perform public.require_open_accounting_period(owner_id, p_reimbursement_date);

  entry_number := public.next_voucher_number(owner_id);
  insert into public.journal_entries (
    owner_user_id, voucher_number, entry_date, description, source_type, source_id
  ) values (
    owner_id, entry_number, p_reimbursement_date,
    'Refusjon av privat utlegg ' || purchase_row.supplier_name,
    'purchase_reimbursement', purchase_row.id
  ) returning id into entry_id;

  insert into public.journal_lines (
    journal_entry_id, account_id, description, debit, credit, sort_order
  ) values
    (entry_id, purchase_row.settlement_account_id, 'Oppgjør privat utlegg', purchase_row.total, 0, 0),
    (entry_id, p_bank_account_id, 'Utbetaling fra bank', 0, purchase_row.total, 1);

  update public.purchase_payments
     set status = 'reimbursed', reimbursed_at = p_reimbursement_date,
         reimbursement_journal_entry_id = entry_id, updated_at = now()
   where id = purchase_row.id;
end;
$$;

create or replace function public.reverse_purchase_payment_reimbursement(
  p_purchase_id uuid,
  p_reversal_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid := auth.uid();
  purchase_row public.purchase_payments%rowtype;
begin
  select * into purchase_row from public.purchase_payments
   where id = p_purchase_id and owner_user_id = owner_id;
  if not found or purchase_row.status <> 'reimbursed' or purchase_row.reimbursement_journal_entry_id is null then
    raise exception 'Refusjonen kan ikke korrigeres';
  end if;
  perform public.reverse_journal_entry(
    purchase_row.reimbursement_journal_entry_id,
    p_reversal_date,
    'Korrigering av refusjon ' || purchase_row.supplier_name
  );
  update public.purchase_payments
     set status = 'booked', reimbursed_at = null,
         reimbursement_journal_entry_id = null, updated_at = now()
   where id = purchase_row.id;
end;
$$;

create or replace function public.cancel_purchase_payment(
  p_purchase_id uuid,
  p_cancellation_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid := auth.uid();
  purchase_row public.purchase_payments%rowtype;
  reversal_id uuid;
begin
  select * into purchase_row from public.purchase_payments
   where id = p_purchase_id and owner_user_id = owner_id;
  if not found or purchase_row.status <> 'booked' then
    raise exception 'Kjøpet må være bokført og uten aktiv refusjon før det kan annulleres';
  end if;
  reversal_id := public.reverse_journal_entry(
    purchase_row.journal_entry_id,
    p_cancellation_date,
    'Annullering av kjøp ' || purchase_row.supplier_name
  );
  update public.purchase_payments
     set status = 'cancelled', cancelled_at = p_cancellation_date,
         cancellation_journal_entry_id = reversal_id, updated_at = now()
   where id = purchase_row.id;
end;
$$;

revoke all on function public.seed_purchase_payment_accounts(uuid) from public, anon, authenticated;
revoke all on function public.create_purchase_payment(uuid, text, text, date, text, text, uuid, text, jsonb, jsonb) from public, anon;
revoke all on function public.reimburse_purchase_payment(uuid, date, uuid) from public, anon;
revoke all on function public.reverse_purchase_payment_reimbursement(uuid, date) from public, anon;
revoke all on function public.cancel_purchase_payment(uuid, date) from public, anon;

grant execute on function public.create_purchase_payment(uuid, text, text, date, text, text, uuid, text, jsonb, jsonb) to authenticated;
grant execute on function public.reimburse_purchase_payment(uuid, date, uuid) to authenticated;
grant execute on function public.reverse_purchase_payment_reimbursement(uuid, date) to authenticated;
grant execute on function public.cancel_purchase_payment(uuid, date) to authenticated;


-- ============================================================================

-- Source migration: supabase/migrations/20260817020000_profile_vat_registration.sql

alter table public.profiles
  add column if not exists is_vat_registered boolean not null default false;

drop function if exists public.save_profile_details(
  text, text, text, text, text, text, jsonb
);

create or replace function public.save_profile_details(
  p_full_name text,
  p_company_name text,
  p_address text,
  p_postal_address text,
  p_country text,
  p_org_number text,
  p_is_vat_registered boolean,
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
         org_number = nullif(btrim(p_org_number), ''),
         is_vat_registered = coalesce(p_is_vat_registered, false)
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

grant execute on function public.save_profile_details(
  text, text, text, text, text, text, boolean, jsonb
) to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_previous boolean := coalesce((new.raw_user_meta_data ->> 'has_sent_invoices_before')::boolean, false);
  v_is_vat_registered boolean := coalesce((new.raw_user_meta_data ->> 'is_vat_registered')::boolean, false);
  v_last_number bigint := coalesce(nullif(new.raw_user_meta_data ->> 'last_invoice_number', '')::bigint, 9999);
  v_invoice_number_prefix text := coalesce(new.raw_user_meta_data ->> 'invoice_number_prefix', '');
  v_invoice_number_padding_width integer := coalesce(nullif(new.raw_user_meta_data ->> 'invoice_number_padding_width', '')::integer, 0);
begin
  if not v_has_previous then
    v_last_number := 9999;
    v_invoice_number_prefix := '';
    v_invoice_number_padding_width := 0;
  end if;

  insert into public.profiles (
    id, email, full_name, company_name, address, postal_address, country,
    org_number, is_vat_registered, has_sent_invoices_before, last_invoice_number,
    invoice_number_prefix, invoice_number_padding_width
  ) values (
    new.id, new.email, new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'company_name', new.raw_user_meta_data ->> 'address',
    new.raw_user_meta_data ->> 'postal_address',
    coalesce(nullif(new.raw_user_meta_data ->> 'country', ''), 'NO'),
    new.raw_user_meta_data ->> 'org_number', v_is_vat_registered, v_has_previous,
    v_last_number, v_invoice_number_prefix, v_invoice_number_padding_width
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, profiles.full_name),
    company_name = coalesce(excluded.company_name, profiles.company_name),
    address = coalesce(excluded.address, profiles.address),
    postal_address = coalesce(excluded.postal_address, profiles.postal_address),
    country = coalesce(excluded.country, profiles.country),
    org_number = coalesce(excluded.org_number, profiles.org_number),
    is_vat_registered = excluded.is_vat_registered,
    invoice_number_prefix = excluded.invoice_number_prefix,
    invoice_number_padding_width = excluded.invoice_number_padding_width;

  insert into public.profile_bank_accounts (profile_id, account_name, account_number)
  select new.id, nullif(btrim(account ->> 'account_name'), ''), nullif(btrim(account ->> 'account_number'), '')
    from jsonb_array_elements(
      case when jsonb_typeof(new.raw_user_meta_data -> 'bank_accounts') = 'array'
        then new.raw_user_meta_data -> 'bank_accounts' else '[]'::jsonb end
    ) account
   where nullif(btrim(account ->> 'account_name'), '') is not null
     and nullif(btrim(account ->> 'account_number'), '') is not null;
  return new;
end;
$$;


-- ============================================================================

-- Source migration: supabase/migrations/20260817030000_profile_vat_rpc_compat.sql

-- Keep the previous RPC signature available while older browser sessions are
-- still in use. It preserves the current VAT status when saving other fields.
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
declare
  current_vat_status boolean;
begin
  select is_vat_registered into current_vat_status
    from public.profiles
   where id = auth.uid();

  perform public.save_profile_details(
    p_full_name,
    p_company_name,
    p_address,
    p_postal_address,
    p_country,
    p_org_number,
    coalesce(current_vat_status, false),
    p_bank_accounts
  );
end;
$$;

grant execute on function public.save_profile_details(
  text, text, text, text, text, text, jsonb
) to authenticated;
