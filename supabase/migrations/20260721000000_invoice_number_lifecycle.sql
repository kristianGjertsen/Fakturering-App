-- Invoice numbers belong to the seller profile and are only consumed when an
-- invoice is finalized. The profile row is the lock for concurrent numbering.
alter table public.profiles
  add column if not exists has_sent_invoices_before boolean not null default false,
  add column if not exists last_invoice_number bigint not null default 9999
    check (last_invoice_number >= 0);

alter table public.invoices alter column invoice_number drop not null;
alter table public.invoices
  add column if not exists finalized_at timestamptz,
  add column if not exists pdf_storage_path text,
  add column if not exists pdf_locked_at timestamptz;

-- Old draft numbers were placeholders and must not consume the legal sequence.
update public.invoices
   set invoice_number = null
 where status = 'draft'
   and finalized_at is null;

create unique index if not exists invoices_owner_invoice_number_unique
  on public.invoices (owner_user_id, invoice_number)
  where invoice_number is not null;

create or replace function public.assign_invoice_number_on_finalize()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number bigint;
begin
  if new.status <> 'draft'
     and new.finalized_at is null then
    update public.profiles
       set last_invoice_number = last_invoice_number + 1
     where id = new.owner_user_id
     returning last_invoice_number into v_number;

    if v_number is null then
      raise exception 'Seller profile is missing for invoice %', new.id;
    end if;

    new.invoice_number := v_number::text;
    new.finalized_at := now();
  elsif new.finalized_at is null then
    new.invoice_number := null;
  end if;

  return new;
end;
$$;

drop trigger if exists invoices_assign_number_on_finalize on public.invoices;
create trigger invoices_assign_number_on_finalize
  before insert or update of status on public.invoices
  for each row execute procedure public.assign_invoice_number_on_finalize();

create or replace function public.finalize_invoice(p_invoice_id uuid)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_number text;
begin
  update public.invoices
     set status = 'ready'
   where id = p_invoice_id
     and owner_user_id = auth.uid()
     and status = 'draft'
  returning invoice_number into v_number;

  if v_number is null then
    select invoice_number into v_number
      from public.invoices
     where id = p_invoice_id
       and owner_user_id = auth.uid()
       and finalized_at is not null;
  end if;

  if v_number is null then
    raise exception 'Invoice % is not an available draft', p_invoice_id;
  end if;

  return v_number;
end;
$$;

revoke all on function public.finalize_invoice(uuid) from public, anon;
grant execute on function public.finalize_invoice(uuid) to authenticated;

create or replace function public.lock_invoice_pdf(p_invoice_id uuid, p_storage_path text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.invoices
     set pdf_storage_path = p_storage_path,
         pdf_locked_at = now()
   where id = p_invoice_id
     and owner_user_id = auth.uid()
     and finalized_at is not null
     and pdf_storage_path is null;

  if not found then
    raise exception 'Invoice PDF is already locked or invoice is unavailable';
  end if;
end;
$$;

revoke all on function public.lock_invoice_pdf(uuid, text) from public, anon;
grant execute on function public.lock_invoice_pdf(uuid, text) to authenticated;

create or replace function public.prevent_finalized_invoice_content_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
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

drop trigger if exists invoices_prevent_finalized_content_changes on public.invoices;
create trigger invoices_prevent_finalized_content_changes
  before update on public.invoices
  for each row execute procedure public.prevent_finalized_invoice_content_changes();

create or replace function public.prevent_finalized_invoice_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.finalized_at is not null then
    raise exception 'A finalized invoice cannot be deleted';
  end if;
  return old;
end;
$$;

drop trigger if exists invoices_prevent_finalized_delete on public.invoices;
create trigger invoices_prevent_finalized_delete
  before delete on public.invoices
  for each row execute procedure public.prevent_finalized_invoice_delete();

create or replace function public.prevent_finalized_invoice_child_changes()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_invoice_id uuid;
begin
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

drop trigger if exists invoice_items_prevent_finalized_changes on public.invoice_items;
create trigger invoice_items_prevent_finalized_changes
  before insert or update or delete on public.invoice_items
  for each row execute procedure public.prevent_finalized_invoice_child_changes();

drop trigger if exists invoice_attachments_prevent_finalized_changes on public.invoice_attachments;
create trigger invoice_attachments_prevent_finalized_changes
  before insert or update or delete on public.invoice_attachments
  for each row execute procedure public.prevent_finalized_invoice_child_changes();

insert into storage.buckets (id, name, public, allowed_mime_types)
values ('invoice-pdfs', 'invoice-pdfs', false, array['application/pdf'])
on conflict (id) do update
set public = false, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "invoice_pdfs_storage_select" on storage.objects;
create policy "invoice_pdfs_storage_select" on storage.objects for select
using (bucket_id = 'invoice-pdfs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "invoice_pdfs_storage_insert" on storage.objects;
create policy "invoice_pdfs_storage_insert" on storage.objects for insert
with check (bucket_id = 'invoice-pdfs' and (storage.foldername(name))[1] = auth.uid()::text);

-- Signup metadata initializes the seller's sequence. A new seller starts at
-- 10000; an existing seller starts at the number after the one they provide.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_previous boolean := coalesce((new.raw_user_meta_data ->> 'has_sent_invoices_before')::boolean, false);
  v_last_number bigint := coalesce(nullif(new.raw_user_meta_data ->> 'last_invoice_number', '')::bigint, 9999);
begin
  if not v_has_previous then v_last_number := 9999; end if;

  insert into public.profiles (
    id, email, full_name, company_name, address, postal_address, country,
    org_number, has_sent_invoices_before, last_invoice_number
  ) values (
    new.id, new.email, new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'company_name', new.raw_user_meta_data ->> 'address',
    new.raw_user_meta_data ->> 'postal_address',
    coalesce(nullif(new.raw_user_meta_data ->> 'country', ''), 'NO'),
    new.raw_user_meta_data ->> 'org_number', v_has_previous, v_last_number
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, profiles.full_name),
    company_name = coalesce(excluded.company_name, profiles.company_name),
    address = coalesce(excluded.address, profiles.address),
    postal_address = coalesce(excluded.postal_address, profiles.postal_address),
    country = coalesce(excluded.country, profiles.country),
    org_number = coalesce(excluded.org_number, profiles.org_number);

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
