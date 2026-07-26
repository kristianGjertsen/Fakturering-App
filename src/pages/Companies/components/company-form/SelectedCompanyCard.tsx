import { Button } from "../../../../components/Button";
import { formatOrganizationNumber } from "./brreg";
import type { BrregCompany } from "./types";

type SelectedCompanyCardProps = {
  company: BrregCompany;
  onChange: () => void;
};

export function SelectedCompanyCard({ company, onChange }: SelectedCompanyCardProps) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Valgt bedrift</p>
          <p className="mt-1 font-semibold text-slate-950">{company.name}</p>
          <p className="mt-1 text-sm text-slate-600">
            Org.nr. {formatOrganizationNumber(company.organizationNumber)}
          </p>
          {(company.address || company.postalAddress) && (
            <p className="mt-1 text-sm text-slate-600">
              {[company.address, company.postalAddress].filter(Boolean).join(", ")}
            </p>
          )}
        </div>
        <Button size="xs" variant="secondary" onClick={onChange}>Endre</Button>
      </div>
    </div>
  );
}
