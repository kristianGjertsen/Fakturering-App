create or replace function public.prevent_finalized_invoice_content_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin') then
    return new;
  end if;

  if current_setting('app.allow_company_unlink_from_finalized_invoice', true) = 'on'
     and old.finalized_at is not null
     and new.company_id is null
     and old.company_id is not null
     and new.owner_user_id is not distinct from old.owner_user_id
     and new.recipient_name is not distinct from old.recipient_name
     and new.recipient_org_number is not distinct from old.recipient_org_number
     and new.recipient_email is not distinct from old.recipient_email
     and new.recipient_country is not distinct from old.recipient_country
     and new.invoice_number is not distinct from old.invoice_number
     and new.title is not distinct from old.title
     and new.issue_date is not distinct from old.issue_date
     and new.due_date is not distinct from old.due_date
     and new.pdf_template is not distinct from old.pdf_template
     and new.notes is not distinct from old.notes
     and new.subtotal is not distinct from old.subtotal
     and new.vat_total is not distinct from old.vat_total
     and new.total is not distinct from old.total
     and new.finalized_at is not distinct from old.finalized_at then
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
    new.finalized_at is distinct from old.finalized_at
  ) then
    raise exception 'A finalized invoice cannot be edited';
  end if;

  return new;
end;
$$;

create or replace function public.delete_company(p_company_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform set_config('app.allow_company_unlink_from_finalized_invoice', 'on', true);

  delete from public.companies
   where id = p_company_id
     and owner_user_id = auth.uid();

  perform set_config('app.allow_company_unlink_from_finalized_invoice', 'off', true);
end;
$$;

grant execute on function public.delete_company(uuid) to authenticated;
