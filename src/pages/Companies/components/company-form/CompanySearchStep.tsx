import { useEffect, useState } from "react";
import { Button } from "../../../../components/Button";
import { FormField } from "../../../../components/FormField";
import { Input } from "../../../../components/Input";
import { formatOrganizationNumber, searchBrregCompanies } from "./brreg";
import { SelectedCompanyCard } from "./SelectedCompanyCard";
import type { BrregCompany, CompanyFormData } from "./types";

type CompanySearchStepProps = {
  value: CompanyFormData;
  selectedCompany: BrregCompany | null;
  onChange: (patch: Partial<CompanyFormData>) => void;
  onSelect: (company: BrregCompany | null) => void;
};

export function CompanySearchStep({
  value,
  selectedCompany,
  onChange,
  onSelect,
}: CompanySearchStepProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BrregCompany[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [manualEntry, setManualEntry] = useState(false);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2 || selectedCompany || manualEntry) {
      setResults([]);
      setSearching(false);
      setSearchError("");
      return;
    }

    const controller = new AbortController();
    setSearching(true);
    setSearchError("");
    const timeoutId = window.setTimeout(async () => {
      try {
        setResults(await searchBrregCompanies(normalizedQuery, controller.signal));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setResults([]);
        setSearchError(error instanceof Error ? error.message : "Søket mislyktes.");
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 400);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [manualEntry, query, selectedCompany]);

  function selectCompany(company: BrregCompany) {
    onChange({
      companyName: company.name,
      organizationNumber: company.organizationNumber,
      address: company.address,
      postalAddress: company.postalAddress,
      country: "NO",
      email: company.email,
      phone: company.phone,
    });
    onSelect(company);
    setResults([]);
  }

  if (selectedCompany) {
    return (
      <SelectedCompanyCard
        company={selectedCompany}
        onChange={() => {
          onSelect(null);
          onChange({
            companyName: "",
            organizationNumber: "",
            address: "",
            postalAddress: "",
          });
          setQuery("");
        }}
      />
    );
  }

  if (manualEntry) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-semibold text-slate-950">Registrer manuelt</p>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              setManualEntry(false);
              onChange({
                companyName: "",
                organizationNumber: "",
                address: "",
                postalAddress: "",
              });
            }}
          >
            Søk i registeret
          </Button>
        </div>
        <FormField label="Firmanavn">
          <Input
            autoFocus
            value={value.companyName}
            onChange={(event) => onChange({ companyName: event.target.value })}
            required
          />
        </FormField>
        <FormField label="Organisasjonsnummer" helper="Ni siffer, hvis kunden har organisasjonsnummer.">
          <Input
            inputMode="numeric"
            value={value.organizationNumber}
            onChange={(event) => onChange({ organizationNumber: event.target.value.replace(/\D/g, "").slice(0, 9) })}
          />
        </FormField>
        <FormField label="Adresse">
          <Input value={value.address} onChange={(event) => onChange({ address: event.target.value })} />
        </FormField>
        <FormField label="Postnummer og poststed">
          <Input value={value.postalAddress} onChange={(event) => onChange({ postalAddress: event.target.value })} />
        </FormField>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FormField label="Søk etter firmanavn eller organisasjonsnummer">
        <div className="relative">
          <Input
            autoFocus
            value={query}
            placeholder="For eksempel Acme AS eller 123 456 789"
            onChange={(event) => setQuery(event.target.value)}
          />
          {searching && <span className="absolute right-3 top-2.5 text-xs text-slate-500">Søker…</span>}
        </div>
      </FormField>

      {searchError && (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{searchError}</p>
      )}

      {!searching && query.trim().length >= 2 && !searchError && results.length === 0 && (
        <p className="text-sm text-slate-500">Ingen bedrifter funnet.</p>
      )}

      {results.length > 0 && (
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1" role="listbox" aria-label="Søkeresultater">
          {results.map((company) => (
            <button
              key={company.organizationNumber}
              type="button"
              role="option"
              aria-selected={false}
              className="w-full rounded-lg border border-blue-100 bg-white p-3 text-left transition hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              onClick={() => selectCompany(company)}
            >
              <span className="block text-sm font-semibold text-slate-950">{company.name}</span>
              <span className="mt-1 block text-xs text-slate-600">
                Org.nr. {formatOrganizationNumber(company.organizationNumber)}
              </span>
              {(company.address || company.postalAddress) && (
                <span className="mt-1 block text-xs text-slate-500">
                  {[company.address, company.postalAddress].filter(Boolean).join(", ")}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="border-t border-blue-100 pt-4">
        <Button variant="ghost" size="sm" onClick={() => setManualEntry(true)}>
          Finner du ikke bedriften? Registrer manuelt
        </Button>
      </div>
    </div>
  );
}
