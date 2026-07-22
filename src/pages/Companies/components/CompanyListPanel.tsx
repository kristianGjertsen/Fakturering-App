import { Button } from "../../../components/Button";
import { EmptyState } from "../../../components/EmptyState";
import { Panel } from "../../../components/layout/Panel";
import { countryLabel } from "../../../lib/countries";
import type { Company } from "../../../types";

type CompanyListPanelProps = {
  companies: Company[];
  onOpenCompany: (companyId: string) => void;
};

export function CompanyListPanel({ companies, onOpenCompany }: CompanyListPanelProps) {
  return (
    <section>
      <Panel as="div">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-950">Registrerte selskaper</h3>
            <p className="mt-1 text-sm text-slate-600">
              Klikk på et selskap for å åpne all informasjon.
            </p>
          </div>
          <span className="text-sm text-slate-500">{companies.length} totalt</span>
        </div>

        {companies.length === 0 ? (
          <div className="mt-5">
            <EmptyState
              title="Ingen selskaper"
              description="Trykk på «Nytt selskap» for å registrere det første selskapet."
            />
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
                  <span className="block truncate font-semibold text-slate-950">
                    {company.name}
                  </span>
                  <span className="mt-1 block truncate text-sm font-normal text-slate-600">
                    {[
                      company.org_number,
                      company.email,
                      company.address,
                      company.postal_address,
                      countryLabel(company.country),
                    ].filter(Boolean).join(" · ") || "Ingen detaljer registrert"}
                  </span>
                </span>
                <span aria-hidden="true" className="shrink-0 text-lg text-blue-700">
                  →
                </span>
              </Button>
            ))}
          </div>
        )}
      </Panel>
    </section>
  );
}
