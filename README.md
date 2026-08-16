# AutoFaktura

En fakturerings- og regnskapsapp bygget med Vite, React, TypeScript, Tailwind og Supabase.

Appen håndterer utgående fakturaer, gjentakende fakturering, inngående
leverandørfakturaer med originaldokumenter, manuelle betalinger og et enkelt
dobbelt bokholderi. Regnskapsfanen viser bilagsjournal, hovedbok, resultat,
balanse, MVA-grunnlag, åpne poster og periodestatus.

## Start

```bash
npm install
npm run dev
```

Legg inn Supabase-verdiene i `.env`:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
LOGO_DEV_SECRET_KEY=sk_...
```

`LOGO_DEV_SECRET_KEY` brukes bare på serveren til eksakt navnesøk etter logoer.
Hvis den mangler, brukes nettside-/e-postdomene og deretter vanlig fallback; nøkkelen
skal aldri ha `VITE_`-prefiks.

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
- `accounting_accounts`: brukerens kontoplan med systemkontoer og egne kontoer
- `accounting_periods`: åpne og låste regnskapsmåneder
- `suppliers`: leverandørregister
- `supplier_invoices`: inngående fakturaer og betalingsstatus
- `supplier_invoice_lines`: kostnad, MVA og kostnadskonto per fakturalinje
- `supplier_invoice_attachments`: originaldokumenter for inngående fakturaer
- `journal_entries`: nummererte, uforanderlige bilag
- `journal_lines`: debet- og kreditposteringene i hvert bilag
- `accounting_payments`: manuelle inn- og utbetalinger med betalingsdato

Utgående fakturavedlegg lagres privat i `invoice-attachments`. Originaler til
inngående fakturaer lagres privat i `accounting-documents`.

Row Level Security er aktivert slik at hver bruker bare kan lese og endre sine egne data.

### Regnskapsflyt

- En ferdigstilt utgående faktura bokføres automatisk mot kundefordringer,
  salgsinntekt og utgående MVA.
- En inngående faktura bokføres mot valgt kostnadskonto, inngående MVA og
  leverandørgjeld.
- Betaling registreres manuelt med dato og bokføres som et eget bilag mot bank.
- Feil betalinger og annullerte leverandørfakturaer slettes ikke. Det opprettes
  et motbilag, slik at historikken kan følges.
- Manuelle bilag krever minst to linjer og lik sum debet og kredit.
- En låst måned avviser nye bilag og korrigeringer med dato i måneden.

Migreringen `20260816000000_accounting_foundation.sql` oppretter standard
kontoplan og bokfører historiske, ferdigstilte salgsfakturaer. Kjør
databasemigrasjonen før den nye frontend-versjonen tas i bruk:

```bash
npx supabase db push
npm run build
```

### Avgrensninger

Regnskapet bruker NOK og kalenderår. MVA-satsene for inngående fakturaer er
0, 12, 15 og 25 prosent. Banktransaksjoner og AI-tolking er bevisst ikke med;
betalinger registreres manuelt. Løsningen lager regnskapsrapporter, men sender
ikke MVA-melding og eksporterer foreløpig ikke SAF-T.
