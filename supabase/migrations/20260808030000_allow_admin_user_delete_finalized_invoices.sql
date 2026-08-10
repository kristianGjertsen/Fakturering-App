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
    new.finalized_at is distinct from old.finalized_at
  ) then
    raise exception 'A finalized invoice cannot be edited';
  end if;

  return new;
end;
$$;

create or replace function public.prevent_finalized_invoice_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin') then
    return old;
  end if;

  if old.finalized_at is not null then
    raise exception 'A finalized invoice cannot be deleted';
  end if;

  return old;
end;
$$;

create or replace function public.prevent_finalized_invoice_child_changes()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_invoice_id uuid;
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    v_invoice_id := old.invoice_id;
  else
    v_invoice_id := new.invoice_id;
  end if;

  if exists (select 1 from public.invoices where id = v_invoice_id and finalized_at is not null) then
    raise exception 'Lines and attachments on a finalized invoice cannot be changed';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
