import { EmptyState } from "../../../components/EmptyState";
import { Panel } from "../../../components/layout/Panel";
import { countryLabel } from "../../../lib/countries";
import type { CompanyLogoPreferenceInput } from "../../../lib/data";
import type { Company } from "../../../types";
import {
  CompanyLogo,
  NO_LOGO_FOUND_SOURCE,
} from "../../Company/components/CompanyLogo";

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
  const activeCompanies = companies.filter((company) => company.is_active !== false);
  const inactiveCompanies = companies.filter((company) => company.is_active === false);

  return (
    <section>
      <Panel as="div">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-950">Registrerte selskaper</h3>

          </div>
          <span className="text-sm text-slate-500">{activeCompanies.length} aktive</span>
        </div>

        {activeCompanies.length === 0 ? (
          <div className="mt-5">
            <EmptyState
              title={inactiveCompanies.length > 0 ? "Ingen aktive selskaper" : "Ingen selskaper"}
              description={inactiveCompanies.length > 0
                ? "Inaktive firmaer ligger nederst på siden."
                : "Trykk på «Nytt selskap» for å registrere det første selskapet."}
            />
          </div>
        ) : (
          <CompanyList
            companies={activeCompanies}
            onOpenCompany={onOpenCompany}
            onUpdateCompanyLogoPreference={onUpdateCompanyLogoPreference}
          />
        )}

        <h3 className="text-base font-semibold text-slate-950 pt-6">Inaktive selskaper</h3>
        {inactiveCompanies.length > 0 && (
          <details className="mt-4 rounded-lg border border-slate-200 bg-slate-50">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700">
              Inaktive firmaer ({inactiveCompanies.length})
            </summary>
            <div className="border-t border-slate-200">
              <CompanyList
                companies={inactiveCompanies}
                onOpenCompany={onOpenCompany}
                onUpdateCompanyLogoPreference={onUpdateCompanyLogoPreference}
                inactive
              />
            </div>
          </details>
        )}
      </Panel>
    </section>
  );
}

function CompanyList({
  companies,
  inactive = false,
  onOpenCompany,
  onUpdateCompanyLogoPreference,
}: CompanyListPanelProps & { inactive?: boolean }) {
  return (
    <div className={`${inactive ? "" : "mt-5"} divide-y divide-blue-100 overflow-hidden rounded-lg border border-blue-100 bg-white`}>
      {companies.map((company) => (
        <button
          key={company.id}
          type="button"
          className={`flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400 ${inactive ? "opacity-80" : ""
            }`}
          onClick={() => onOpenCompany(company.id)}
        >
          <CompanyLogo
            company={company}
            variant="compact"
            discover={!inactive}
            onLogoResolved={(source, logoBlob) => void onUpdateCompanyLogoPreference(company.id, {
              logo_disabled: false,
              logo_url: source.src,
              logo_source: source.label,
              logo_blob: logoBlob,
            })}
            onLogoSearchExhausted={() => void onUpdateCompanyLogoPreference(company.id, {
              logo_disabled: false,
              logo_url: null,
              logo_source: NO_LOGO_FOUND_SOURCE,
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
  );
}
