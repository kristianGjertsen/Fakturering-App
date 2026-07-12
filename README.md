# Invoice Auth App

Vite + React + TypeScript + Tailwind + Supabase Auth.

## PDF-mal

Fakturadesignet ligger samlet i `src/pdf/InvoicePdfTemplate.tsx`. Nettleseren bruker malen til forhåndsvisning og manuell utsending. Automatiske fakturaer sender fakturadata til Vercel-funksjonen `api/generate-invoice-pdf.ts`, som renderer den samme malen.

Supabase-funksjonen `process-invoices` trenger følgende secrets:

```env
PDF_GENERATOR_URL=https://ditt-domene.no/api/generate-invoice-pdf
PDF_GENERATOR_SECRET=...
```

Samme `PDF_GENERATOR_SECRET` må settes i Vercel. Hvis den mangler der, brukes `CRON_SECRET` som fallback.

## Start

```bash
npm install
copy .env.example .env
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

Kjor eller kjor pa nytt SQL-en i `supabase/schema.sql` i `Supabase -> SQL Editor`.

Tabellene er satt opp slik:

- `profiles`: en rad per innlogget bruker fra `auth.users`
- `companies`: bedrifter/kunder som eies av en bruker
- `products`: produkter/tjenester som tilhorer en bedrift
- `invoice_schedules`: faste faktureringsplaner per bedrift, for eksempel daglig, ukentlig eller manedlig
- `invoice_schedule_items`: hvilke produkter som skal vare med i en gitt faktureringsplan
- `invoice_schedule_lines`: fakturalinjer som skal brukes nar en plan gjentas
- `invoices`: fakturaer som er opprettet
- `invoice_items`: fakturalinjer for hver faktura

Row Level Security er aktivert slik at hver bruker bare kan lese og endre sine egne data.
