alter table public.companies
  add column if not exists is_active boolean not null default true;

create or replace function public.delete_company(p_company_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.invoices
    where company_id = p_company_id
      and owner_user_id = auth.uid()
  ) then
    raise exception 'Firmaet er brukt i fakturaer og kan ikke slettes. Sett det som inaktivt i stedet.';
  end if;

  delete from public.companies
   where id = p_company_id
     and owner_user_id = auth.uid();
end;
$$;

grant execute on function public.delete_company(uuid) to authenticated;

create or replace function public.set_company_active(
  p_company_id uuid,
  p_is_active boolean
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.companies
     set is_active = p_is_active
   where id = p_company_id
     and owner_user_id = auth.uid();
end;
$$;

grant execute on function public.set_company_active(uuid, boolean) to authenticated;
