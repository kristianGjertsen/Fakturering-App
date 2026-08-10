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
