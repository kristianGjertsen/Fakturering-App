# Invoice Auth App

Vite + React + TypeScript + Tailwind + Supabase Auth.

## Start

```bash
npm install
npm run dev
```

Legg inn Supabase-verdiene i `.env`:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## Supabase

Ga til Supabase dashboard:

- Authentication -> Providers -> Email
- Aktiver email/password login
- Kopier Project URL og anon public key til `.env`

### Databaseoppsett

Databaseskjemaet ligger i den ene baseline-migrasjonen under `supabase/migrations`.

For lokal Supabase:

```bash
npx supabase db reset
```

For et koblet prosjekt:

```bash
npx supabase db push
```

Tabellene er satt opp slik:

- `profiles`: en rad per innlogget bruker fra `auth.users`
- `companies`: bedrifter/kunder som eies av en bruker
- `products`: produkter/tjenester som tilhorer en bedrift
- `invoice_schedules`: faste faktureringsplaner per bedrift, for eksempel daglig, ukentlig eller manedlig
- `invoice_schedule_lines`: fakturalinjer som skal brukes nar en plan gjentas
- `invoice_schedule_attachments`: vedleggsmetadata for linjer i faktureringsplaner
- `invoices`: fakturaer som er opprettet
- `invoice_items`: fakturalinjer for hver faktura
- `invoice_attachments`: vedleggsmetadata for fakturalinjer

Selve filene lagres privat i Storage-bucketen `invoice-attachments`.

Row Level Security er aktivert slik at hver bruker bare kan lese og endre sine egne data.
