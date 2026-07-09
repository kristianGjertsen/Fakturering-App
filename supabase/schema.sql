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
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update
    set email = excluded.email;

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
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly')),
  interval_count integer not null default 1 check (interval_count > 0),
  day_of_week integer check (day_of_week between 1 and 7),
  day_of_month integer check (day_of_month between 1 and 31),
  send_time time not null default '08:00',
  timezone text not null default 'Europe/Oslo',
  start_date date not null default current_date,
  next_run_at timestamptz,
  last_run_at timestamptz,
  is_active boolean not null default true,
  auto_send boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoice_schedules_frequency_rules check (
    (frequency = 'daily' and day_of_week is null and day_of_month is null) or
    (frequency = 'weekly' and day_of_week is not null and day_of_month is null) or
    (frequency = 'monthly' and day_of_month is not null and day_of_week is null)
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
  company_id uuid not null references public.companies (id) on delete restrict,
  schedule_id uuid references public.invoice_schedules (id) on delete set null,
  invoice_number text not null,
  issue_date date not null default current_date,
  due_date date,
  status text not null default 'draft' check (status in ('draft', 'ready', 'sent', 'paid', 'cancelled')),
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

alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.products enable row level security;
alter table public.invoice_schedules enable row level security;
alter table public.invoice_schedule_items enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.invoice_schedule_lines enable row level security;

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
    auth.uid() = owner_user_id and
    exists (
      select 1
      from public.companies c
      where c.id = company_id
        and c.owner_user_id = auth.uid()
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

create index if not exists companies_owner_user_id_idx on public.companies (owner_user_id);
create index if not exists products_company_id_idx on public.products (company_id);
create index if not exists invoice_schedules_owner_user_id_idx on public.invoice_schedules (owner_user_id);
create index if not exists invoice_schedules_company_id_idx on public.invoice_schedules (company_id);
create index if not exists invoice_schedules_next_run_at_idx on public.invoice_schedules (next_run_at);
create index if not exists invoice_schedule_items_schedule_id_idx on public.invoice_schedule_items (schedule_id);
create index if not exists invoices_owner_user_id_idx on public.invoices (owner_user_id);
create index if not exists invoices_company_id_idx on public.invoices (company_id);
create index if not exists invoices_created_at_idx on public.invoices (created_at desc);
create index if not exists invoice_items_invoice_id_idx on public.invoice_items (invoice_id);
create index if not exists invoice_schedule_lines_schedule_id_idx on public.invoice_schedule_lines (schedule_id);
