# AutoFaktura

En faktureringsapp bygget med Vite, React, TypeScript, Tailwind og Supabase.

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

Gå til Supabase-dashboardet:

- Authentication -> Providers -> Email
- Aktiver innlogging med e-post og passord
- Kopier prosjekt-URL og offentlig anon-nøkkel til `.env`

### Databaseoppsett

Databaseskjemaet og senere skjemaendringer ligger under `supabase/migrations`.

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
- `products`: produkter/tjenester som tilhører en bedrift
- `invoice_schedules`: faktureringsplaner per bedrift, enten én gang, daglig, ukentlig eller månedlig
- `invoice_schedule_lines`: fakturalinjer som skal brukes når en plan gjentas
- `invoice_schedule_attachments`: vedleggsmetadata for linjer i faktureringsplaner
- `invoices`: fakturaer som er opprettet
- `invoice_items`: fakturalinjer for hver faktura
- `invoice_attachments`: vedleggsmetadata for fakturalinjer

Selve filene lagres privat i Storage-bucketen `invoice-attachments`.

Row Level Security er aktivert slik at hver bruker bare kan lese og endre sine egne data.
