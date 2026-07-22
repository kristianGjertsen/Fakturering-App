import { Panel, PanelHeader } from "../../../components/layout/Panel";
import { countryLabel } from "../../../lib/countries";
import { formatDate } from "../../../lib/format";
import type { Company } from "../../../types";

type CompanyInfoProps = {
  company: Company;
};

export function CompanyInfo({ company }: CompanyInfoProps) {
  return (
    <Panel>
      <PanelHeader title="Selskapsinformasjon" />

      <dl className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
        <InfoItem label="Navn" value={company.name} />
        <InfoItem label="Organisasjonsnummer" value={company.org_number} />
        <InfoItem label="E-post" value={company.email} />
        <InfoItem label="Adresse" value={company.address} />
        <InfoItem label="Postadresse" value={company.postal_address} />
        <InfoItem label="Land" value={countryLabel(company.country)} />
        <InfoItem label="Opprettet" value={formatDate(company.created_at)} />
        <InfoItem label="Sist oppdatert" value={formatDate(company.updated_at)} />
      </dl>

      <div className="mt-6 border-t border-blue-100 pt-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Internt notat</p>
        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
          {company.private_notes || "Ingen interne notater registrert."}
        </p>
      </div>
    </Panel>
  );
}

function InfoItem({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-slate-950">{value || "Ikke registrert"}</dd>
    </div>
  );
}
