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
