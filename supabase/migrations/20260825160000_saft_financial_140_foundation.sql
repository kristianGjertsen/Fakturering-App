-- SAF-T Financial 1.40 foundation.
--
-- This migration only stores explicit mappings and source context needed by a
-- SAF-T exporter. It deliberately does not guess official SAF-T grouping codes
-- or StandardTaxCode values; missing mappings are reported by validation RPCs.

alter table public.profiles
  add column if not exists saft_street_name text,
  add column if not exists saft_street_number text,
  add column if not exists saft_postal_code text,
  add column if not exists saft_city text,
  add column if not exists saft_region text,
  add column if not exists saft_contact_person text,
  add column if not exists saft_contact_phone text,
  add column if not exists saft_default_currency_code text not null default 'NOK';

alter table public.companies
  add column if not exists saft_customer_id text,
  add column if not exists saft_street_name text,
  add column if not exists saft_street_number text,
  add column if not exists saft_postal_code text,
  add column if not exists saft_city text,
  add column if not exists saft_region text;

alter table public.suppliers
  add column if not exists saft_supplier_id text,
  add column if not exists address text,
  add column if not exists postal_address text,
  add column if not exists country text,
  add column if not exists contact_person text,
  add column if not exists phone text,
  add column if not exists saft_street_name text,
  add column if not exists saft_street_number text,
  add column if not exists saft_postal_code text,
  add column if not exists saft_city text,
  add column if not exists saft_region text;

alter table public.accounting_accounts
  add column if not exists saft_grouping_category text,
  add column if not exists saft_grouping_code text,
  add column if not exists saft_opening_balance_account boolean not null default true;

create table if not exists public.accounting_tax_codes (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles (id) on delete cascade,
  code text not null check (length(btrim(code)) > 0),
  description text not null check (length(btrim(description)) > 0),
  direction text not null check (direction in ('input', 'output', 'none')),
  rate numeric(5, 2) not null check (rate >= 0),
  saft_standard_tax_code text,
  saft_tax_type text,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, code)
);

create index if not exists accounting_tax_codes_owner_direction_rate_idx
  on public.accounting_tax_codes (owner_user_id, direction, rate)
  where is_active;

alter table public.journal_entries
  add column if not exists saft_journal_id text not null default 'GENERAL',
  add column if not exists saft_transaction_id text;

alter table public.journal_lines
  add column if not exists customer_id uuid references public.companies (id) on delete set null,
  add column if not exists customer_name text,
  add column if not exists customer_org_number text,
  add column if not exists supplier_id uuid references public.suppliers (id) on delete set null,
  add column if not exists supplier_name text,
  add column if not exists supplier_org_number text,
  add column if not exists tax_code_id uuid references public.accounting_tax_codes (id) on delete restrict,
  add column if not exists tax_base_amount numeric(14, 2),
  add column if not exists tax_amount numeric(14, 2),
  add column if not exists source_line_type text,
  add column if not exists source_line_id uuid;

alter table public.purchase_payments
  add column if not exists supplier_id uuid references public.suppliers (id) on delete set null;

create table if not exists public.saft_export_runs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles (id) on delete cascade,
  from_date date not null,
  to_date date not null,
  status text not null default 'requested' check (status in ('requested', 'validated', 'generated', 'failed')),
  file_name text,
  checksum_sha256 text,
  error_message text,
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_date <= to_date)
);

create table if not exists public.saft_export_run_entries (
  export_run_id uuid not null references public.saft_export_runs (id) on delete cascade,
  journal_entry_id uuid not null references public.journal_entries (id) on delete restrict,
  primary key (export_run_id, journal_entry_id)
);

create index if not exists journal_entries_owner_saft_journal_idx
  on public.journal_entries (owner_user_id, saft_journal_id, entry_date);
create index if not exists journal_lines_customer_idx on public.journal_lines (customer_id);
create index if not exists journal_lines_supplier_idx on public.journal_lines (supplier_id);
create index if not exists journal_lines_tax_code_idx on public.journal_lines (tax_code_id);
create index if not exists saft_export_runs_owner_created_idx
  on public.saft_export_runs (owner_user_id, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'profiles_saft_default_currency_code_check'
       and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_saft_default_currency_code_check
      check (saft_default_currency_code ~ '^[A-Z]{3}$');
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'journal_entries_saft_journal_id_check'
       and conrelid = 'public.journal_entries'::regclass
  ) then
    alter table public.journal_entries
      add constraint journal_entries_saft_journal_id_check
      check (saft_journal_id in ('SALES', 'PURCHASE', 'BANK', 'GENERAL'));
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'journal_entries_saft_transaction_id_unique'
       and conrelid = 'public.journal_entries'::regclass
  ) then
    alter table public.journal_entries
      add constraint journal_entries_saft_transaction_id_unique
      unique (owner_user_id, saft_transaction_id);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'journal_lines_tax_amounts_non_negative_check'
       and conrelid = 'public.journal_lines'::regclass
  ) then
    alter table public.journal_lines
      add constraint journal_lines_tax_amounts_non_negative_check
      check (
        (tax_base_amount is null or tax_base_amount >= 0)
        and (tax_amount is null or tax_amount >= 0)
      );
  end if;
end;
$$;

create or replace function public.saft_journal_id_for_source_type(p_source_type text)
returns text
language sql
immutable
as $$
  select case
    when p_source_type = 'sales_invoice' then 'SALES'
    when p_source_type in ('supplier_invoice', 'purchase_payment') then 'PURCHASE'
    when p_source_type in ('sales_payment', 'supplier_payment', 'purchase_reimbursement') then 'BANK'
    else 'GENERAL'
  end;
$$;

create or replace function public.saft_tax_code_key(p_direction text, p_rate numeric)
returns text
language sql
immutable
as $$
  select upper(p_direction) || '_' || replace(trim(trailing '.' from trim(trailing '0' from p_rate::text)), '.', '_');
$$;

create or replace function public.ensure_accounting_tax_code(
  p_owner_user_id uuid,
  p_direction text,
  p_rate numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_direction text := lower(btrim(p_direction));
  normalized_rate numeric(5, 2) := round(p_rate, 2);
  tax_code_id uuid;
  tax_code_key text;
begin
  if auth.uid() is not null and p_owner_user_id <> auth.uid() then
    raise exception 'Kan ikke opprette MVA-kode for en annen bruker';
  end if;
  if p_owner_user_id is null then raise exception 'Eier mangler for MVA-kode'; end if;
  if normalized_direction not in ('input', 'output', 'none') then
    raise exception 'Ugyldig MVA-retning';
  end if;
  if normalized_rate < 0 then raise exception 'Ugyldig MVA-sats'; end if;

  tax_code_key := public.saft_tax_code_key(normalized_direction, normalized_rate);

  insert into public.accounting_tax_codes (
    owner_user_id, code, description, direction, rate, is_system
  ) values (
    p_owner_user_id,
    tax_code_key,
    case
      when normalized_direction = 'output' then 'Utgående MVA ' || normalized_rate || ' %'
      when normalized_direction = 'input' then 'Inngående MVA ' || normalized_rate || ' %'
      else 'Ingen MVA ' || normalized_rate || ' %'
    end,
    normalized_direction,
    normalized_rate,
    true
  )
  on conflict (owner_user_id, code) do update
    set description = excluded.description,
        direction = excluded.direction,
        rate = excluded.rate,
        is_system = true,
        is_active = true,
        updated_at = now()
  returning id into tax_code_id;

  return tax_code_id;
end;
$$;

create or replace function public.set_journal_entry_saft_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.saft_journal_id := coalesce(
    nullif(new.saft_journal_id, ''),
    public.saft_journal_id_for_source_type(new.source_type)
  );

  if new.saft_journal_id = 'GENERAL' then
    new.saft_journal_id := public.saft_journal_id_for_source_type(new.source_type);
  end if;

  new.saft_transaction_id := coalesce(
    nullif(new.saft_transaction_id, ''),
    new.saft_journal_id || '-' || new.voucher_number::text
  );

  return new;
end;
$$;

drop trigger if exists journal_entries_set_saft_fields on public.journal_entries;
create trigger journal_entries_set_saft_fields
  before insert or update on public.journal_entries
  for each row execute function public.set_journal_entry_saft_fields();

create or replace function public.set_journal_line_saft_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  entry_row public.journal_entries%rowtype;
  account_row public.accounting_accounts%rowtype;
  inferred_direction text;
begin
  select * into entry_row from public.journal_entries where id = new.journal_entry_id;
  select * into account_row from public.accounting_accounts where id = new.account_id;

  if not found or entry_row.id is null or account_row.id is null then
    return new;
  end if;

  if new.customer_id is null and entry_row.source_type in ('sales_invoice', 'sales_payment') then
    select
      invoice.company_id,
      invoice.recipient_name,
      invoice.recipient_org_number
      into new.customer_id, new.customer_name, new.customer_org_number
      from public.invoices invoice
     where invoice.id = entry_row.source_id
       and invoice.owner_user_id = entry_row.owner_user_id;
  elsif entry_row.source_type in ('sales_invoice', 'sales_payment')
        and (new.customer_name is null or new.customer_org_number is null) then
    select
      coalesce(new.customer_name, invoice.recipient_name),
      coalesce(new.customer_org_number, invoice.recipient_org_number)
      into new.customer_name, new.customer_org_number
      from public.invoices invoice
     where invoice.id = entry_row.source_id
       and invoice.owner_user_id = entry_row.owner_user_id;
  end if;

  if new.supplier_id is null and entry_row.source_type in ('supplier_invoice', 'supplier_payment') then
    select
      invoice.supplier_id,
      supplier.name,
      supplier.org_number
      into new.supplier_id, new.supplier_name, new.supplier_org_number
      from public.supplier_invoices invoice
      join public.suppliers supplier on supplier.id = invoice.supplier_id
     where invoice.id = entry_row.source_id
       and invoice.owner_user_id = entry_row.owner_user_id;
  elsif entry_row.source_type in ('supplier_invoice', 'supplier_payment')
        and (new.supplier_name is null or new.supplier_org_number is null) then
    select
      coalesce(new.supplier_name, supplier.name),
      coalesce(new.supplier_org_number, supplier.org_number)
      into new.supplier_name, new.supplier_org_number
      from public.supplier_invoices invoice
      join public.suppliers supplier on supplier.id = invoice.supplier_id
     where invoice.id = entry_row.source_id
       and invoice.owner_user_id = entry_row.owner_user_id;
  end if;

  if new.supplier_id is null and entry_row.source_type = 'purchase_payment' then
    select
      payment.supplier_id,
      payment.supplier_name,
      payment.supplier_org_number
      into new.supplier_id, new.supplier_name, new.supplier_org_number
      from public.purchase_payments payment
     where payment.id = entry_row.source_id
       and payment.owner_user_id = entry_row.owner_user_id;
  elsif entry_row.source_type = 'purchase_payment'
        and (new.supplier_name is null or new.supplier_org_number is null) then
    select
      coalesce(new.supplier_name, payment.supplier_name),
      coalesce(new.supplier_org_number, payment.supplier_org_number)
      into new.supplier_name, new.supplier_org_number
      from public.purchase_payments payment
     where payment.id = entry_row.source_id
       and payment.owner_user_id = entry_row.owner_user_id;
  end if;

  if new.supplier_id is null and entry_row.source_type = 'purchase_reimbursement' then
    select
      payment.supplier_id,
      payment.supplier_name,
      payment.supplier_org_number
      into new.supplier_id, new.supplier_name, new.supplier_org_number
      from public.purchase_payment_reimbursements reimbursement
      join public.purchase_payments payment on payment.id = reimbursement.purchase_payment_id
     where reimbursement.id = entry_row.source_id
       and reimbursement.owner_user_id = entry_row.owner_user_id;
  elsif entry_row.source_type = 'purchase_reimbursement'
        and (new.supplier_name is null or new.supplier_org_number is null) then
    select
      coalesce(new.supplier_name, payment.supplier_name),
      coalesce(new.supplier_org_number, payment.supplier_org_number)
      into new.supplier_name, new.supplier_org_number
      from public.purchase_payment_reimbursements reimbursement
      join public.purchase_payments payment on payment.id = reimbursement.purchase_payment_id
     where reimbursement.id = entry_row.source_id
       and reimbursement.owner_user_id = entry_row.owner_user_id;
  end if;

  if new.source_line_type is null then
    if entry_row.source_type = 'sales_invoice' and account_row.category = 'revenue' then
      new.source_line_type := 'sales_invoice_vat_group';
    elsif entry_row.source_type = 'supplier_invoice' and account_row.category in ('expense', 'asset') then
      new.source_line_type := 'supplier_invoice_line';
    elsif entry_row.source_type = 'purchase_payment' and account_row.category in ('expense', 'asset') then
      new.source_line_type := 'purchase_payment_line';
    elsif account_row.system_key like 'output_vat_%' or account_row.system_key like 'input_vat_%' then
      new.source_line_type := 'vat_summary';
    elsif entry_row.source_type like '%payment%' or entry_row.source_type = 'purchase_reimbursement' then
      new.source_line_type := 'payment';
    else
      new.source_line_type := entry_row.source_type;
    end if;
  end if;

  if new.tax_code_id is null and new.vat_rate is not null then
    if account_row.system_key like 'output_vat_%'
       or (entry_row.source_type = 'sales_invoice' and account_row.category = 'revenue') then
      inferred_direction := 'output';
    elsif account_row.system_key like 'input_vat_%'
       or (entry_row.source_type in ('supplier_invoice', 'purchase_payment') and account_row.category in ('expense', 'asset')) then
      inferred_direction := 'input';
    end if;

    if inferred_direction is not null then
      new.tax_code_id := public.ensure_accounting_tax_code(
        entry_row.owner_user_id,
        inferred_direction,
        new.vat_rate
      );
    end if;
  end if;

  if new.tax_base_amount is null
     and new.vat_rate is not null
     and account_row.system_key not like 'output_vat_%'
     and account_row.system_key not like 'input_vat_%'
     and new.tax_code_id is not null then
    new.tax_base_amount := greatest(new.debit, new.credit);
  end if;

  if new.tax_amount is null
     and new.vat_rate is not null
     and (
       account_row.system_key like 'output_vat_%'
       or account_row.system_key like 'input_vat_%'
     ) then
    new.tax_amount := greatest(new.debit, new.credit);
  end if;

  return new;
end;
$$;

drop trigger if exists journal_lines_set_saft_context on public.journal_lines;
create trigger journal_lines_set_saft_context
  before insert or update on public.journal_lines
  for each row execute function public.set_journal_line_saft_context();

create or replace function public.attach_supplier_invoice_line_to_journal_line()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.journal_lines line
     set supplier_id = invoice.supplier_id,
         supplier_name = supplier.name,
         supplier_org_number = supplier.org_number,
         source_line_id = new.id,
         source_line_type = 'supplier_invoice_line'
    from public.supplier_invoices invoice
    join public.suppliers supplier on supplier.id = invoice.supplier_id
   where invoice.id = new.supplier_invoice_id
     and line.journal_entry_id = invoice.journal_entry_id
     and line.sort_order = new.sort_order
     and line.account_id = new.expense_account_id
     and line.source_line_id is null;
  return new;
end;
$$;

drop trigger if exists supplier_invoice_lines_attach_journal_line on public.supplier_invoice_lines;
create trigger supplier_invoice_lines_attach_journal_line
  after insert on public.supplier_invoice_lines
  for each row execute function public.attach_supplier_invoice_line_to_journal_line();

create or replace function public.attach_purchase_payment_line_to_journal_line()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.journal_lines line
     set supplier_id = payment.supplier_id,
         supplier_name = payment.supplier_name,
         supplier_org_number = payment.supplier_org_number,
         source_line_id = new.id,
         source_line_type = 'purchase_payment_line'
    from public.purchase_payments payment
   where payment.id = new.purchase_payment_id
     and line.journal_entry_id = payment.journal_entry_id
     and line.sort_order = new.sort_order
     and line.account_id = new.expense_account_id
     and line.source_line_id is null;
  return new;
end;
$$;

drop trigger if exists purchase_payment_lines_attach_journal_line on public.purchase_payment_lines;
create trigger purchase_payment_lines_attach_journal_line
  after insert on public.purchase_payment_lines
  for each row execute function public.attach_purchase_payment_line_to_journal_line();

create or replace function public.sync_purchase_payment_supplier_to_journal_lines()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.journal_lines line
     set supplier_id = new.supplier_id,
         supplier_name = new.supplier_name,
         supplier_org_number = new.supplier_org_number
   where line.journal_entry_id = new.journal_entry_id
     and (line.supplier_id is null or line.supplier_name is null);
  return new;
end;
$$;

drop trigger if exists purchase_payments_sync_supplier_to_journal_lines on public.purchase_payments;
create trigger purchase_payments_sync_supplier_to_journal_lines
  after insert or update of supplier_id on public.purchase_payments
  for each row
  when (new.supplier_id is not null)
  execute function public.sync_purchase_payment_supplier_to_journal_lines();

create or replace function public.find_or_create_supplier_for_purchase_payment(
  p_owner_user_id uuid,
  p_supplier_name text,
  p_supplier_org_number text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_org text := nullif(regexp_replace(coalesce(p_supplier_org_number, ''), '\D', '', 'g'), '');
  supplier_id uuid;
begin
  if auth.uid() is not null and p_owner_user_id <> auth.uid() then
    raise exception 'Kan ikke opprette leverandør for en annen bruker';
  end if;

  if normalized_org is not null then
    select id into supplier_id
      from public.suppliers
     where owner_user_id = p_owner_user_id
       and org_number = normalized_org
     limit 1;
  end if;

  if supplier_id is null then
    select id into supplier_id
      from public.suppliers
     where owner_user_id = p_owner_user_id
       and lower(btrim(name)) = lower(btrim(p_supplier_name))
       and coalesce(org_number, '') = coalesce(normalized_org, '')
     order by created_at
     limit 1;
  end if;

  if supplier_id is null then
    insert into public.suppliers (owner_user_id, name, org_number)
    values (p_owner_user_id, btrim(p_supplier_name), normalized_org)
    returning id into supplier_id;
  end if;

  return supplier_id;
end;
$$;

create or replace function public.set_purchase_payment_supplier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.supplier_id is null then
    new.supplier_id := public.find_or_create_supplier_for_purchase_payment(
      new.owner_user_id,
      new.supplier_name,
      new.supplier_org_number
    );
  end if;
  return new;
end;
$$;

drop trigger if exists purchase_payments_set_supplier on public.purchase_payments;
create trigger purchase_payments_set_supplier
  before insert or update of supplier_name, supplier_org_number, supplier_id on public.purchase_payments
  for each row execute function public.set_purchase_payment_supplier();

insert into public.accounting_tax_codes (
  owner_user_id, code, description, direction, rate, is_system
)
select profile.id, seed.code, seed.description, seed.direction, seed.rate, true
  from public.profiles profile
 cross join (
   values
     ('OUTPUT_25', 'Utgående MVA 25 %', 'output', 25::numeric),
     ('OUTPUT_15', 'Utgående MVA 15 %', 'output', 15::numeric),
     ('OUTPUT_12', 'Utgående MVA 12 %', 'output', 12::numeric),
     ('OUTPUT_0', 'Utgående MVA 0 %', 'output', 0::numeric),
     ('INPUT_25', 'Inngående MVA 25 %', 'input', 25::numeric),
     ('INPUT_15', 'Inngående MVA 15 %', 'input', 15::numeric),
     ('INPUT_12', 'Inngående MVA 12 %', 'input', 12::numeric),
     ('INPUT_0', 'Inngående MVA 0 %', 'input', 0::numeric),
     ('NONE_0', 'Ingen MVA 0 %', 'none', 0::numeric)
 ) as seed(code, description, direction, rate)
on conflict (owner_user_id, code) do nothing;

update public.journal_entries
   set saft_journal_id = public.saft_journal_id_for_source_type(source_type),
       saft_transaction_id = public.saft_journal_id_for_source_type(source_type) || '-' || voucher_number::text
 where saft_transaction_id is null
    or saft_journal_id = 'GENERAL';

update public.purchase_payments payment
   set supplier_id = public.find_or_create_supplier_for_purchase_payment(
     payment.owner_user_id,
     payment.supplier_name,
     payment.supplier_org_number
   )
 where payment.supplier_id is null;

update public.journal_lines
   set sort_order = sort_order;

update public.journal_lines line
   set source_line_id = supplier_line.id,
       source_line_type = 'supplier_invoice_line',
       supplier_id = invoice.supplier_id
  from public.supplier_invoice_lines supplier_line
  join public.supplier_invoices invoice on invoice.id = supplier_line.supplier_invoice_id
 where line.journal_entry_id = invoice.journal_entry_id
   and line.sort_order = supplier_line.sort_order
   and line.account_id = supplier_line.expense_account_id
   and line.source_line_id is null;

update public.journal_lines line
   set source_line_id = purchase_line.id,
       source_line_type = 'purchase_payment_line',
       supplier_id = payment.supplier_id
  from public.purchase_payment_lines purchase_line
  join public.purchase_payments payment on payment.id = purchase_line.purchase_payment_id
 where line.journal_entry_id = payment.journal_entry_id
   and line.sort_order = purchase_line.sort_order
   and line.account_id = purchase_line.expense_account_id
   and line.source_line_id is null;

alter table public.accounting_tax_codes enable row level security;
alter table public.saft_export_runs enable row level security;
alter table public.saft_export_run_entries enable row level security;

create policy "accounting_tax_codes_owner_access" on public.accounting_tax_codes
  for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create policy "saft_export_runs_owner_access" on public.saft_export_runs
  for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create policy "saft_export_run_entries_owner_access" on public.saft_export_run_entries
  for all using (
    exists (
      select 1 from public.saft_export_runs run
       where run.id = export_run_id
         and run.owner_user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.saft_export_runs run
       where run.id = export_run_id
         and run.owner_user_id = auth.uid()
    )
    and exists (
      select 1 from public.journal_entries entry
       where entry.id = journal_entry_id
         and entry.owner_user_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.accounting_tax_codes to authenticated;
grant select, insert, update, delete on public.saft_export_runs to authenticated;
grant select, insert, update, delete on public.saft_export_run_entries to authenticated;

create or replace function public.saft_missing_account_mappings(
  p_from_date date,
  p_to_date date
)
returns table (
  account_id uuid,
  account_number text,
  account_name text,
  missing_grouping_category boolean,
  missing_grouping_code boolean
)
language sql
security invoker
set search_path = public
as $$
  select distinct
    account.id,
    account.account_number,
    account.name,
    nullif(btrim(coalesce(account.saft_grouping_category, '')), '') is null as missing_grouping_category,
    nullif(btrim(coalesce(account.saft_grouping_code, '')), '') is null as missing_grouping_code
  from public.journal_entries entry
  join public.journal_lines line on line.journal_entry_id = entry.id
  join public.accounting_accounts account on account.id = line.account_id
  where entry.owner_user_id = auth.uid()
    and entry.entry_date between p_from_date and p_to_date
    and (
      nullif(btrim(coalesce(account.saft_grouping_category, '')), '') is null
      or nullif(btrim(coalesce(account.saft_grouping_code, '')), '') is null
    )
  order by account.account_number;
$$;

create or replace function public.saft_missing_tax_mappings(
  p_from_date date,
  p_to_date date
)
returns table (
  journal_line_id uuid,
  voucher_number bigint,
  account_number text,
  vat_rate numeric,
  internal_tax_code text,
  missing_tax_code boolean,
  missing_standard_tax_code boolean
)
language sql
security invoker
set search_path = public
as $$
  select
    line.id,
    entry.voucher_number,
    account.account_number,
    line.vat_rate,
    tax.code,
    line.tax_code_id is null,
    tax.id is not null and nullif(btrim(coalesce(tax.saft_standard_tax_code, '')), '') is null
  from public.journal_entries entry
  join public.journal_lines line on line.journal_entry_id = entry.id
  join public.accounting_accounts account on account.id = line.account_id
  left join public.accounting_tax_codes tax on tax.id = line.tax_code_id
  where entry.owner_user_id = auth.uid()
    and entry.entry_date between p_from_date and p_to_date
    and line.vat_rate is not null
    and (
      line.tax_code_id is null
      or nullif(btrim(coalesce(tax.saft_standard_tax_code, '')), '') is null
    )
  order by entry.voucher_number, line.sort_order;
$$;

create or replace function public.saft_validate_source_data(
  p_from_date date,
  p_to_date date
)
returns table (
  type text,
  entity_id text,
  message text
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  owner_id uuid := auth.uid();
begin
  if owner_id is null then
    return query select 'AUTH_REQUIRED', null::text, 'Du må være logget inn for å eksportere SAF-T.';
    return;
  end if;

  if p_from_date is null or p_to_date is null or p_from_date > p_to_date then
    return query select 'INVALID_EXPORT_PERIOD', null::text, 'Eksportperioden er ugyldig.';
    return;
  end if;

  return query
  select 'COMPANY_NAME_MISSING', profile.id::text, 'Selskapsnavn mangler.'
    from public.profiles profile
   where profile.id = owner_id
     and nullif(btrim(coalesce(profile.company_name, '')), '') is null;

  return query
  select 'ORG_NUMBER_INVALID', profile.id::text, 'Organisasjonsnummer må bestå av 9 sifre.'
    from public.profiles profile
   where profile.id = owner_id
     and coalesce(regexp_replace(coalesce(profile.org_number, ''), '\D', '', 'g'), '') !~ '^[0-9]{9}$';

  return query
  select 'COMPANY_COUNTRY_MISSING', profile.id::text, 'Land mangler på selskapet.'
    from public.profiles profile
   where profile.id = owner_id
     and nullif(btrim(coalesce(profile.country, '')), '') is null;

  return query
  select
    'ACCOUNT_MAPPING_MISSING',
    missing.account_id::text,
    'Konto ' || missing.account_number || ' ' || missing.account_name || ' mangler SAF-T-mapping.'
  from public.saft_missing_account_mappings(p_from_date, p_to_date) missing;

  return query
  select
    'TAX_MAPPING_MISSING',
    missing.journal_line_id::text,
    'Bilag ' || missing.voucher_number::text || ', konto ' || missing.account_number
      || ' med MVA-sats ' || coalesce(missing.vat_rate::text, '-') || ' mangler SAF-T StandardTaxCode.'
  from public.saft_missing_tax_mappings(p_from_date, p_to_date) missing;

  return query
  select
    'VOUCHER_NOT_BALANCED',
    entry.id::text,
    'Bilag ' || entry.voucher_number::text || ' balanserer ikke.'
  from public.journal_entries entry
  join public.journal_lines line on line.journal_entry_id = entry.id
  where entry.owner_user_id = owner_id
    and entry.entry_date between p_from_date and p_to_date
  group by entry.id, entry.voucher_number
  having round(sum(line.debit), 2) <> round(sum(line.credit), 2);

  return query
  select
    'INVALID_DEBIT_CREDIT',
    line.id::text,
    'Bilag ' || entry.voucher_number::text || ' har en ugyldig debet/kredit-linje.'
  from public.journal_entries entry
  join public.journal_lines line on line.journal_entry_id = entry.id
  where entry.owner_user_id = owner_id
    and entry.entry_date between p_from_date and p_to_date
    and not (
      (line.debit > 0 and line.credit = 0)
      or (line.credit > 0 and line.debit = 0)
    );

  return query
  select
    'CUSTOMER_REFERENCE_MISSING',
    entry.id::text,
    'Bilag ' || entry.voucher_number::text || ' mangler kundereferanse.'
  from public.journal_entries entry
  where entry.owner_user_id = owner_id
    and entry.entry_date between p_from_date and p_to_date
    and entry.source_type in ('sales_invoice', 'sales_payment')
    and not exists (
      select 1 from public.journal_lines line
       where line.journal_entry_id = entry.id
         and (
           line.customer_id is not null
           or nullif(btrim(coalesce(line.customer_name, '')), '') is not null
         )
    );

  return query
  select
    'SUPPLIER_REFERENCE_MISSING',
    entry.id::text,
    'Bilag ' || entry.voucher_number::text || ' mangler leverandørreferanse.'
  from public.journal_entries entry
  where entry.owner_user_id = owner_id
    and entry.entry_date between p_from_date and p_to_date
    and entry.source_type in ('supplier_invoice', 'supplier_payment', 'purchase_payment', 'purchase_reimbursement')
    and not exists (
      select 1 from public.journal_lines line
       where line.journal_entry_id = entry.id
         and (
           line.supplier_id is not null
           or nullif(btrim(coalesce(line.supplier_name, '')), '') is not null
         )
    );

  return query
  select
    'TRANSACTION_ID_MISSING',
    entry.id::text,
    'Bilag ' || entry.voucher_number::text || ' mangler SAF-T TransactionID.'
  from public.journal_entries entry
  where entry.owner_user_id = owner_id
    and entry.entry_date between p_from_date and p_to_date
    and nullif(btrim(coalesce(entry.saft_transaction_id, '')), '') is null;
end;
$$;

revoke all on function public.ensure_accounting_tax_code(uuid, text, numeric) from public, anon, authenticated;
revoke all on function public.set_journal_entry_saft_fields() from public, anon, authenticated;
revoke all on function public.set_journal_line_saft_context() from public, anon, authenticated;
revoke all on function public.attach_supplier_invoice_line_to_journal_line() from public, anon, authenticated;
revoke all on function public.attach_purchase_payment_line_to_journal_line() from public, anon, authenticated;
revoke all on function public.sync_purchase_payment_supplier_to_journal_lines() from public, anon, authenticated;
revoke all on function public.find_or_create_supplier_for_purchase_payment(uuid, text, text) from public, anon, authenticated;
revoke all on function public.set_purchase_payment_supplier() from public, anon, authenticated;
grant execute on function public.saft_missing_account_mappings(date, date) to authenticated;
grant execute on function public.saft_missing_tax_mappings(date, date) to authenticated;
grant execute on function public.saft_validate_source_data(date, date) to authenticated;
