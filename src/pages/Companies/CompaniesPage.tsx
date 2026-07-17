import { useState } from "react";
import type { Company } from "../../types";
import type { CompanyInput } from "../../lib/data";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { SectionHeader } from "../../components/SectionHeader";
import { NewCompanyForm } from "./CompaniesComponents/NewCompanyForm";

type CompaniesPageProps = {
  companies: Company[];
  onCreateCompany: (input: CompanyInput) => Promise<void>;
  onOpenCompany: (companyId: string) => void;
};

export default function CompaniesPage({ companies, onCreateCompany, onOpenCompany }: CompaniesPageProps) {
  const [message, setMessage] = useState("");

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Selskaper"
        description="Registrer et nytt selskap, eller åpne et eksisterende selskap for detaljer og produkter."
      />

      {message && (
        <p className="rounded-md border border-blue-100 bg-white px-4 py-3 text-sm text-blue-900 shadow-sm">
          {message}
        </p>
      )}

      <section className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <NewCompanyForm onCreateCompany={onCreateCompany} onMessage={setMessage} />

        <div className="rounded-lg border border-blue-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-950">Registrerte selskaper</h3>
              <p className="mt-1 text-sm text-slate-600">Klikk på et selskap for å åpne all informasjon.</p>
            </div>
            <span className="text-sm text-slate-500">{companies.length} totalt</span>
          </div>

          {companies.length === 0 ? (
            <div className="mt-5">
              <EmptyState title="Ingen selskaper" description="Legg inn det første selskapet med skjemaet." />
            </div>
          ) : (
            <div className="mt-5 divide-y divide-blue-100 overflow-hidden rounded-lg border border-blue-100">
              {companies.map((company) => (
                <Button
                  key={company.id}
                  variant="ghost"
                  className="w-full justify-between rounded-none px-4 py-4 text-left hover:bg-blue-50"
                  onClick={() => onOpenCompany(company.id)}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-slate-950">{company.name}</span>
                    <span className="mt-1 block truncate text-sm font-normal text-slate-600">
                      {[company.org_number, company.email, company.city].filter(Boolean).join(" · ") || "Ingen detaljer registrert"}
                    </span>
                  </span>
                  <span aria-hidden="true" className="shrink-0 text-lg text-blue-700">→</span>
                </Button>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
