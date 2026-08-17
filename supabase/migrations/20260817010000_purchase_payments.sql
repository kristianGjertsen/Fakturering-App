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
