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
