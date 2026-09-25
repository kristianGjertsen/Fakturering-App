# AutoFaktura

En fakturerings- og regnskapsapp bygget med Vite, React, TypeScript, Tailwind og Supabase.

Appen håndterer utgående fakturaer, gjentakende fakturering, inngående
leverandørfakturaer med originaldokumenter, manuelle betalinger og et enkelt
dobbelt bokholderi. Regnskapsfanen viser bilagsjournal, hovedbok, resultat, balanse, MVA-grunnlag, åpne poster og periodestatus.


## SAF-T Financial 1.40

Eksport finnes under **Regnskap → Rapporter**. Velg regnskapsår og fra-/til-dato.
Appens standardkontoer og kjente innenlandske MVA-koder kobles automatisk ved
eksport. Dette gjelder både eksisterende og nye kontoer. Lagrede/importerte
koblinger overstyres ikke. Bare ukjente kontoer og tvetydig MVA-behandling må
avklares i panelet. Manglende koblinger,
selskapsnavn, organisasjonsnummer, kontaktperson eller ubalanser stopper eksporten.
Kodelister og dokumentasjon: https://github.com/Skatteetaten/saf-t.

Installer migrasjonen `20260925220000_saft_export_snapshot.sql` sammen med tidligere
migrasjoner før funksjonen tas i bruk. Den nye RPC-en bruker innlogget brukers RLS
og ett konsistent databaseøyeblikksbilde, uten API-ets grense på 1000 rader.

Eksporten inkluderer kontoplan, kunde-/leverandørsaldoer, avgiftskoder og bokførte
posteringer, inkludert motbilag. Datoavgrensningen gjelder bokføringsdato.
Ubrukte kontoer uten kjent kobling utelates og blokkerer ikke eksporten.
Inngående saldo beregnes fra alle tidligere posteringer; importerte inngående
saldoer er allerede bokført som bilag og telles bare én gang. Eksporten oppretter
ikke årsoppgjør eller manglende bokføringer. Beløpene eksporteres i bokført NOK.
Avgiftsgrunnlag og avgiftsbeløp beholdes på sine respektive bokføringslinjer slik
at avgift ikke telles dobbelt.

Den genererte XML-filen valideres lokalt i en Web Worker med libxml2/WASM og
Skatteetatens uendrede XSD før nedlasting. Ingen regnskapsdata sendes til en ekstern
valideringstjeneste. Skjemaet ligger i `src/lib/saft/Financial-1.40.xsd`, hentet fra
https://raw.githubusercontent.com/Skatteetaten/saf-t/master/SAF-T_Financial_1.4/Norwegian_SAF-T_Financial_Schema_v_1.40.xsd
(versjon 1.40, revisjon 30.04.2026). XSD kontrollerer struktur, datatyper og lengder;
automatiske koblinger ligger i `src/lib/saft/mappings.ts` og er kontrollert mot
Skatteetatens næringsspesifikasjon 2025–2026 og Standard Tax Codes. For ukjente
kontoer velges koblingen manuelt. Null prosent utgående MVA krever valg av
behandling (fritatt, utenfor loven, eksport osv.); satsen alene avgjør ikke dette.
Konto 3220 følger dette valget. Har foretaket flere ulike nullsatsbehandlinger, må
disse bokføres på separate kontoer/avgiftskoder med egne koblinger. Eksporten sender ikke inn data til Skatteetaten.

Kontroller: `npm run test:saft` (Node 22.18+ / 24) og `npm run build`.
