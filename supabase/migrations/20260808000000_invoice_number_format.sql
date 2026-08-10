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
