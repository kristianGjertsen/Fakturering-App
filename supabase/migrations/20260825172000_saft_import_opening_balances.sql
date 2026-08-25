-- Import SAF-T opening balances as a posted journal entry when the file carries
-- opening balances. This is required when switching accounting system mid-year.

create or replace function public.import_saft_file_payload(
  p_import_file_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid := auth.uid();
  import_row public.saft_import_files%rowtype;
  profile_payload jsonb := coalesce(p_payload -> 'profile', '{}'::jsonb);
  selection_payload jsonb := coalesce(p_payload -> 'selectionCriteria', '{}'::jsonb);
  item jsonb;
  transaction_payload jsonb;
  line_payload jsonb;
  account_id uuid;
  customer_id uuid;
  supplier_id uuid;
  tax_code_id uuid;
  entry_id uuid;
  entry_number bigint;
  transaction_id text;
  entry_date date;
  opening_date date;
  debit_total numeric(14, 2);
  credit_total numeric(14, 2);
  opening_debit_total numeric(14, 2);
  opening_credit_total numeric(14, 2);
  line_order integer;
  accounts_count integer := 0;
  customers_count integer := 0;
  suppliers_count integer := 0;
  tax_codes_count integer := 0;
  journal_entries_count integer := 0;
  journal_lines_count integer := 0;
  opening_balance_lines_count integer := 0;
  summary jsonb;
begin
  if owner_id is null then
    raise exception 'Du må være logget inn';
  end if;

  select * into import_row
    from public.saft_import_files
   where id = p_import_file_id
     and owner_user_id = owner_id
   for update;

  if not found then
    raise exception 'SAF-T-filen finnes ikke';
  end if;

  update public.saft_import_files
     set status = 'validating',
         validation_errors = '[]'::jsonb,
         updated_at = now()
   where id = import_row.id;

  update public.profiles
     set company_name = coalesce(nullif(btrim(profile_payload ->> 'companyName'), ''), company_name),
         org_number = coalesce(nullif(btrim(profile_payload ->> 'orgNumber'), ''), org_number),
         address = coalesce(nullif(btrim(profile_payload ->> 'address'), ''), address),
         postal_address = coalesce(nullif(btrim(profile_payload ->> 'postalAddress'), ''), postal_address),
         country = coalesce(nullif(btrim(profile_payload ->> 'country'), ''), country),
         saft_street_name = coalesce(nullif(btrim(profile_payload ->> 'streetName'), ''), saft_street_name),
         saft_street_number = coalesce(nullif(btrim(profile_payload ->> 'streetNumber'), ''), saft_street_number),
         saft_postal_code = coalesce(nullif(btrim(profile_payload ->> 'postalCode'), ''), saft_postal_code),
         saft_city = coalesce(nullif(btrim(profile_payload ->> 'city'), ''), saft_city),
         saft_region = coalesce(nullif(btrim(profile_payload ->> 'region'), ''), saft_region),
         saft_default_currency_code = coalesce(nullif(btrim(profile_payload ->> 'currencyCode'), ''), saft_default_currency_code),
         updated_at = now()
   where id = owner_id;

  for item in select value from jsonb_array_elements(coalesce(p_payload -> 'accounts', '[]'::jsonb)) loop
    if coalesce(item ->> 'accountNumber', '') !~ '^[0-9]{4}$' then
      raise exception 'Kontonummer fra SAF-T er ugyldig: %', coalesce(item ->> 'accountNumber', '');
    end if;

    insert into public.accounting_accounts (
      owner_user_id, account_number, name, category,
      saft_grouping_category, saft_grouping_code, is_system
    ) values (
      owner_id,
      item ->> 'accountNumber',
      coalesce(nullif(btrim(item ->> 'name'), ''), item ->> 'accountNumber'),
      coalesce(nullif(btrim(item ->> 'category'), ''), 'expense'),
      nullif(btrim(item ->> 'saftGroupingCategory'), ''),
      nullif(btrim(item ->> 'saftGroupingCode'), ''),
      false
    )
    on conflict (owner_user_id, account_number) do update
      set name = case
            when public.accounting_accounts.is_system then public.accounting_accounts.name
            else coalesce(nullif(btrim(excluded.name), ''), public.accounting_accounts.name)
          end,
          saft_grouping_category = coalesce(excluded.saft_grouping_category, public.accounting_accounts.saft_grouping_category),
          saft_grouping_code = coalesce(excluded.saft_grouping_code, public.accounting_accounts.saft_grouping_code),
          updated_at = now();

    accounts_count := accounts_count + 1;
  end loop;

  opening_debit_total := 0;
  opening_credit_total := 0;
  for item in select value from jsonb_array_elements(coalesce(p_payload -> 'accounts', '[]'::jsonb)) loop
    opening_debit_total := opening_debit_total + coalesce(nullif(item ->> 'openingDebitBalance', '')::numeric, 0);
    opening_credit_total := opening_credit_total + coalesce(nullif(item ->> 'openingCreditBalance', '')::numeric, 0);
  end loop;

  if opening_debit_total > 0 or opening_credit_total > 0 then
    if round(opening_debit_total, 2) <> round(opening_credit_total, 2) then
      raise exception 'Åpningsbalansen i SAF-T-filen balanserer ikke';
    end if;

    transaction_id := 'SAFT-OPENING-' || p_import_file_id::text;
    if not exists (
      select 1 from public.journal_entries
       where owner_user_id = owner_id
         and saft_transaction_id = transaction_id
    ) then
      opening_date := coalesce(
        nullif(selection_payload ->> 'periodStartDate', '')::date,
        (
          select min(nullif(entry ->> 'date', '')::date)
            from jsonb_array_elements(coalesce(p_payload -> 'journalEntries', '[]'::jsonb)) entry
        ),
        current_date
      );

      entry_number := public.next_voucher_number(owner_id);
      insert into public.journal_entries (
        owner_user_id, voucher_number, entry_date, description,
        source_type, source_id, saft_journal_id, saft_transaction_id
      ) values (
        owner_id,
        entry_number,
        opening_date,
        'Åpningsbalanse importert fra SAF-T',
        'manual',
        p_import_file_id,
        'GENERAL',
        transaction_id
      )
      returning id into entry_id;

      line_order := 0;
      for item in select value from jsonb_array_elements(coalesce(p_payload -> 'accounts', '[]'::jsonb)) loop
        debit_total := coalesce(nullif(item ->> 'openingDebitBalance', '')::numeric, 0);
        credit_total := coalesce(nullif(item ->> 'openingCreditBalance', '')::numeric, 0);
        if debit_total = 0 and credit_total = 0 then
          continue;
        end if;

        select id into account_id
          from public.accounting_accounts
         where owner_user_id = owner_id
           and account_number = item ->> 'accountNumber'
         limit 1;

        insert into public.journal_lines (
          journal_entry_id, account_id, description, debit, credit, source_line_type, sort_order
        ) values (
          entry_id,
          account_id,
          'Åpningsbalanse ' || (item ->> 'accountNumber'),
          round(debit_total, 2),
          round(credit_total, 2),
          'saft_opening_balance',
          line_order
        );

        line_order := line_order + 1;
        opening_balance_lines_count := opening_balance_lines_count + 1;
        journal_lines_count := journal_lines_count + 1;
      end loop;

      journal_entries_count := journal_entries_count + 1;
    end if;
  end if;

  for item in select value from jsonb_array_elements(coalesce(p_payload -> 'taxCodes', '[]'::jsonb)) loop
    if nullif(btrim(item ->> 'code'), '') is null then
      continue;
    end if;

    insert into public.accounting_tax_codes (
      owner_user_id, code, description, direction, rate,
      saft_standard_tax_code, saft_tax_type, is_system
    ) values (
      owner_id,
      btrim(item ->> 'code'),
      coalesce(nullif(btrim(item ->> 'description'), ''), btrim(item ->> 'code')),
      coalesce(nullif(btrim(item ->> 'direction'), ''), 'none'),
      coalesce(nullif(item ->> 'rate', '')::numeric, 0),
      nullif(btrim(item ->> 'saftStandardTaxCode'), ''),
      nullif(btrim(item ->> 'saftTaxType'), ''),
      false
    )
    on conflict (owner_user_id, code) do update
      set description = excluded.description,
          direction = excluded.direction,
          rate = excluded.rate,
          saft_standard_tax_code = coalesce(excluded.saft_standard_tax_code, public.accounting_tax_codes.saft_standard_tax_code),
          saft_tax_type = coalesce(excluded.saft_tax_type, public.accounting_tax_codes.saft_tax_type),
          is_active = true,
          updated_at = now();

    tax_codes_count := tax_codes_count + 1;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_payload -> 'customers', '[]'::jsonb)) loop
    if nullif(btrim(item ->> 'name'), '') is null then
      continue;
    end if;

    select id into customer_id
      from public.companies
     where owner_user_id = owner_id
       and (
         (nullif(btrim(item ->> 'orgNumber'), '') is not null and org_number = nullif(btrim(item ->> 'orgNumber'), ''))
         or (nullif(btrim(item ->> 'saftCustomerId'), '') is not null and saft_customer_id = nullif(btrim(item ->> 'saftCustomerId'), ''))
       )
     order by created_at
     limit 1;

    if customer_id is null then
      insert into public.companies (
        owner_user_id, name, org_number, email, address, postal_address, country,
        saft_customer_id, saft_street_name, saft_street_number,
        saft_postal_code, saft_city, saft_region
      ) values (
        owner_id,
        btrim(item ->> 'name'),
        nullif(btrim(item ->> 'orgNumber'), ''),
        nullif(btrim(item ->> 'email'), ''),
        nullif(btrim(item ->> 'address'), ''),
        nullif(btrim(item ->> 'postalAddress'), ''),
        coalesce(nullif(btrim(item ->> 'country'), ''), 'NO'),
        nullif(btrim(item ->> 'saftCustomerId'), ''),
        nullif(btrim(item ->> 'streetName'), ''),
        nullif(btrim(item ->> 'streetNumber'), ''),
        nullif(btrim(item ->> 'postalCode'), ''),
        nullif(btrim(item ->> 'city'), ''),
        nullif(btrim(item ->> 'region'), '')
      );
    else
      update public.companies
         set name = btrim(item ->> 'name'),
             email = coalesce(nullif(btrim(item ->> 'email'), ''), email),
             address = coalesce(nullif(btrim(item ->> 'address'), ''), address),
             postal_address = coalesce(nullif(btrim(item ->> 'postalAddress'), ''), postal_address),
             country = coalesce(nullif(btrim(item ->> 'country'), ''), country),
             saft_customer_id = coalesce(nullif(btrim(item ->> 'saftCustomerId'), ''), saft_customer_id),
             saft_street_name = coalesce(nullif(btrim(item ->> 'streetName'), ''), saft_street_name),
             saft_street_number = coalesce(nullif(btrim(item ->> 'streetNumber'), ''), saft_street_number),
             saft_postal_code = coalesce(nullif(btrim(item ->> 'postalCode'), ''), saft_postal_code),
             saft_city = coalesce(nullif(btrim(item ->> 'city'), ''), saft_city),
             saft_region = coalesce(nullif(btrim(item ->> 'region'), ''), saft_region),
             updated_at = now()
       where id = customer_id;
    end if;

    customers_count := customers_count + 1;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_payload -> 'suppliers', '[]'::jsonb)) loop
    if nullif(btrim(item ->> 'name'), '') is null then
      continue;
    end if;

    supplier_id := public.find_or_create_supplier_for_purchase_payment(
      owner_id,
      btrim(item ->> 'name'),
      nullif(btrim(item ->> 'orgNumber'), '')
    );

    update public.suppliers
       set email = coalesce(nullif(btrim(item ->> 'email'), ''), email),
           address = coalesce(nullif(btrim(item ->> 'address'), ''), address),
           postal_address = coalesce(nullif(btrim(item ->> 'postalAddress'), ''), postal_address),
           country = coalesce(nullif(btrim(item ->> 'country'), ''), country),
           saft_supplier_id = coalesce(nullif(btrim(item ->> 'saftSupplierId'), ''), saft_supplier_id),
           saft_street_name = coalesce(nullif(btrim(item ->> 'streetName'), ''), saft_street_name),
           saft_street_number = coalesce(nullif(btrim(item ->> 'streetNumber'), ''), saft_street_number),
           saft_postal_code = coalesce(nullif(btrim(item ->> 'postalCode'), ''), saft_postal_code),
           saft_city = coalesce(nullif(btrim(item ->> 'city'), ''), saft_city),
           saft_region = coalesce(nullif(btrim(item ->> 'region'), ''), saft_region),
           updated_at = now()
     where id = supplier_id;

    suppliers_count := suppliers_count + 1;
  end loop;

  for transaction_payload in
    select value from jsonb_array_elements(coalesce(p_payload -> 'journalEntries', '[]'::jsonb))
  loop
    transaction_id := nullif(btrim(transaction_payload ->> 'transactionId'), '');
    entry_date := nullif(transaction_payload ->> 'date', '')::date;

    if transaction_id is null then
      raise exception 'Et bilag i SAF-T mangler TransactionID';
    end if;

    if exists (
      select 1 from public.journal_entries
       where owner_user_id = owner_id
         and saft_transaction_id = transaction_id
    ) then
      continue;
    end if;

    debit_total := 0;
    credit_total := 0;
    for line_payload in select value from jsonb_array_elements(coalesce(transaction_payload -> 'lines', '[]'::jsonb)) loop
      debit_total := debit_total + coalesce(nullif(line_payload ->> 'debit', '')::numeric, 0);
      credit_total := credit_total + coalesce(nullif(line_payload ->> 'credit', '')::numeric, 0);
    end loop;

    if debit_total <= 0 or round(debit_total, 2) <> round(credit_total, 2) then
      raise exception 'SAF-T-bilag % balanserer ikke', transaction_id;
    end if;

    entry_number := public.next_voucher_number(owner_id);
    insert into public.journal_entries (
      owner_user_id, voucher_number, entry_date, description,
      source_type, source_id, saft_journal_id, saft_transaction_id
    ) values (
      owner_id,
      entry_number,
      entry_date,
      coalesce(nullif(btrim(transaction_payload ->> 'description'), ''), 'Importert SAF-T-bilag ' || transaction_id),
      'manual',
      p_import_file_id,
      coalesce(nullif(btrim(transaction_payload ->> 'journalId'), ''), 'GENERAL'),
      transaction_id
    )
    returning id into entry_id;

    line_order := 0;
    for line_payload in select value from jsonb_array_elements(coalesce(transaction_payload -> 'lines', '[]'::jsonb)) loop
      select id into account_id
        from public.accounting_accounts
       where owner_user_id = owner_id
         and account_number = line_payload ->> 'accountNumber'
       limit 1;

      if account_id is null then
        raise exception 'SAF-T-bilag % bruker konto % som ikke finnes i kontoplanen', transaction_id, line_payload ->> 'accountNumber';
      end if;

      select id into tax_code_id
        from public.accounting_tax_codes
       where owner_user_id = owner_id
         and code = nullif(btrim(line_payload ->> 'taxCode'), '')
       limit 1;

      select id into customer_id
        from public.companies
       where owner_user_id = owner_id
         and (
           saft_customer_id = nullif(btrim(line_payload ->> 'customerId'), '')
           or org_number = nullif(btrim(line_payload ->> 'customerOrgNumber'), '')
         )
       limit 1;

      select id into supplier_id
        from public.suppliers
       where owner_user_id = owner_id
         and (
           saft_supplier_id = nullif(btrim(line_payload ->> 'supplierId'), '')
           or org_number = nullif(btrim(line_payload ->> 'supplierOrgNumber'), '')
         )
       limit 1;

      insert into public.journal_lines (
        journal_entry_id, account_id, description, debit, credit, vat_rate,
        customer_id, customer_name, customer_org_number,
        supplier_id, supplier_name, supplier_org_number,
        tax_code_id, tax_base_amount, tax_amount, source_line_type, sort_order
      ) values (
        entry_id,
        account_id,
        nullif(btrim(line_payload ->> 'description'), ''),
        coalesce(nullif(line_payload ->> 'debit', '')::numeric, 0),
        coalesce(nullif(line_payload ->> 'credit', '')::numeric, 0),
        nullif(line_payload ->> 'vatRate', '')::numeric,
        customer_id,
        nullif(btrim(line_payload ->> 'customerName'), ''),
        nullif(btrim(line_payload ->> 'customerOrgNumber'), ''),
        supplier_id,
        nullif(btrim(line_payload ->> 'supplierName'), ''),
        nullif(btrim(line_payload ->> 'supplierOrgNumber'), ''),
        tax_code_id,
        nullif(line_payload ->> 'taxBaseAmount', '')::numeric,
        nullif(line_payload ->> 'taxAmount', '')::numeric,
        'saft_import',
        line_order
      );

      line_order := line_order + 1;
      journal_lines_count := journal_lines_count + 1;
    end loop;

    journal_entries_count := journal_entries_count + 1;
  end loop;

  summary := jsonb_build_object(
    'accounts', accounts_count,
    'customers', customers_count,
    'suppliers', suppliers_count,
    'taxCodes', tax_codes_count,
    'journalEntries', journal_entries_count,
    'journalLines', journal_lines_count,
    'openingBalanceLines', opening_balance_lines_count
  );

  update public.saft_import_files
     set status = 'imported',
         detected_saft_version = nullif(btrim(p_payload ->> 'version'), ''),
         import_summary = summary,
         imported_at = now(),
         updated_at = now()
   where id = import_row.id;

  return summary;
exception
  when others then
    update public.saft_import_files
       set status = 'failed',
           validation_errors = jsonb_build_array(jsonb_build_object('message', sqlerrm)),
           updated_at = now()
     where id = p_import_file_id
       and owner_user_id = owner_id;
    raise;
end;
$$;

grant execute on function public.import_saft_file_payload(uuid, jsonb) to authenticated;
