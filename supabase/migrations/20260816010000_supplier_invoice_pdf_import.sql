alter table public.supplier_invoices
  add column if not exists kid text check (kid is null or kid ~ '^[0-9]{2,25}$');

create or replace function public.require_supplier_invoice_attachment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
      from public.supplier_invoice_attachments
     where supplier_invoice_id = new.id
  ) then
    raise exception 'Den mottatte fakturaen må legges ved som originaldokument';
  end if;
  return new;
end;
$$;

drop trigger if exists supplier_invoice_requires_attachment on public.supplier_invoices;
create constraint trigger supplier_invoice_requires_attachment
  after insert on public.supplier_invoices
  deferrable initially deferred
  for each row execute function public.require_supplier_invoice_attachment();

create or replace function public.create_supplier_invoice(
  p_invoice_id uuid,
  p_supplier_id uuid,
  p_invoice_number text,
  p_invoice_date date,
  p_due_date date,
  p_kid text,
  p_description text,
  p_lines jsonb,
  p_attachments jsonb default '[]'::jsonb,
  p_mark_paid boolean default false,
  p_payment_date date default null,
  p_bank_account_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  created_invoice_id uuid;
begin
  if p_kid is not null and btrim(p_kid) !~ '^[0-9]{2,25}$' then
    raise exception 'KID er ugyldig';
  end if;
  if jsonb_typeof(p_attachments) <> 'array' or jsonb_array_length(p_attachments) = 0 then
    raise exception 'Den mottatte fakturaen må legges ved som originaldokument';
  end if;

  created_invoice_id := public.create_supplier_invoice(
    p_invoice_id,
    p_supplier_id,
    p_invoice_number,
    p_invoice_date,
    p_due_date,
    p_description,
    p_lines,
    p_attachments,
    p_mark_paid,
    p_payment_date,
    p_bank_account_id
  );

  update public.supplier_invoices
     set kid = nullif(btrim(p_kid), '')
   where id = created_invoice_id
     and owner_user_id = auth.uid();

  return created_invoice_id;
end;
$$;

revoke all on function public.require_supplier_invoice_attachment() from public, anon, authenticated;
revoke all on function public.create_supplier_invoice(uuid, uuid, text, date, date, text, text, jsonb, jsonb, boolean, date, uuid) from public, anon;
grant execute on function public.create_supplier_invoice(uuid, uuid, text, date, date, text, text, jsonb, jsonb, boolean, date, uuid) to authenticated;
