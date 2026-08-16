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
