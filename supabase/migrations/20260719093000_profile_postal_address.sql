alter table public.profiles
  add column if not exists postal_address text,
  add column if not exists country text not null default 'NO';

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
