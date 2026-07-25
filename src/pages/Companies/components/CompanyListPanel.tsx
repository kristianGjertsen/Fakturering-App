import { EmptyState } from "../../../components/EmptyState";
import { Panel } from "../../../components/layout/Panel";
import { countryLabel } from "../../../lib/countries";
import type { CompanyLogoPreferenceInput } from "../../../lib/data";
import type { Company } from "../../../types";
import { CompanyLogo } from "../../Company/components/CompanyLogo";

type CompanyListPanelProps = {
  companies: Company[];
  onOpenCompany: (companyId: string) => void;
  onUpdateCompanyLogoPreference: (
    companyId: string,
    input: CompanyLogoPreferenceInput,
  ) => Promise<void>;
};

export function CompanyListPanel({
  companies,
  onOpenCompany,
  onUpdateCompanyLogoPreference,
}: CompanyListPanelProps) {
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
              <button
                key={company.id}
                type="button"
                className="flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400"
                onClick={() => onOpenCompany(company.id)}
              >
                <CompanyLogo
                  company={company}
                  variant="compact"
                  discover
                  onLogoResolved={(source) => void onUpdateCompanyLogoPreference(company.id, {
                    logo_disabled: false,
                    logo_url: source.src,
                    logo_source: source.label,
                  })}
                />
                <div className="min-w-0 flex-1">
                  <h4 className="truncate text-sm font-semibold text-slate-950">
                    {company.name}
                  </h4>
                  <p className="mt-1 truncate text-sm text-slate-600">
                    {[
                      company.org_number,
                      company.email,
                      company.address,
                      company.postal_address,
                      countryLabel(company.country),
                    ].filter(Boolean).join(" · ") || "Ingen detaljer registrert"}
                  </p>
                </div>
                <span className="shrink-0 rounded-md border border-blue-200 bg-white px-3 py-1.5 text-sm font-semibold text-blue-800 shadow-sm">
                  Åpne
                </span>
              </button>
            ))}
          </div>
        )}
      </Panel>
    </section>
  );
}
