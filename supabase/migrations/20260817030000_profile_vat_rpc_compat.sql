-- Keep the previous RPC signature available while older browser sessions are
-- still in use. It preserves the current VAT status when saving other fields.
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
declare
  current_vat_status boolean;
begin
  select is_vat_registered into current_vat_status
    from public.profiles
   where id = auth.uid();

  perform public.save_profile_details(
    p_full_name,
    p_company_name,
    p_address,
    p_postal_address,
    p_country,
    p_org_number,
    coalesce(current_vat_status, false),
    p_bank_accounts
  );
end;
$$;

grant execute on function public.save_profile_details(
  text, text, text, text, text, text, jsonb
) to authenticated;
