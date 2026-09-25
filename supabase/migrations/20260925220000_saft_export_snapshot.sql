-- One MVCC snapshot, without PostgREST's row limit on entries or nested lines.
create or replace function public.get_saft_export_data(p_end_date date)
returns jsonb
language sql stable security invoker set search_path = public
as $$
  select jsonb_build_object(
    'profile', (select to_jsonb(p) from profiles p where p.id = auth.uid()),
    'accounts', coalesce((select jsonb_agg(a order by a.account_number) from accounting_accounts a where a.owner_user_id = auth.uid()), '[]'::jsonb),
    'taxCodes', coalesce((select jsonb_agg(t order by t.code) from accounting_tax_codes t where t.owner_user_id = auth.uid()), '[]'::jsonb),
    'customers', coalesce((select jsonb_agg(c) from companies c where c.owner_user_id = auth.uid()), '[]'::jsonb),
    'suppliers', coalesce((select jsonb_agg(s) from suppliers s where s.owner_user_id = auth.uid()), '[]'::jsonb),
    'entries', coalesce((select jsonb_agg(to_jsonb(e) || jsonb_build_object(
      'journal_lines', coalesce((select jsonb_agg(l order by l.sort_order, l.id) from journal_lines l where l.journal_entry_id = e.id), '[]'::jsonb)
    ) order by e.entry_date, e.voucher_number, e.id) from journal_entries e
      where e.owner_user_id = auth.uid() and e.entry_date <= p_end_date), '[]'::jsonb)
  ) where auth.uid() is not null;
$$;
revoke all on function public.get_saft_export_data(date) from public, anon;
grant execute on function public.get_saft_export_data(date) to authenticated;
