import { FormField } from "../../../../components/FormField";
import { Input, inputClass } from "../../../../components/Input";
import { countryLabel } from "../../../../lib/countries";
import { formatOrganizationNumber } from "./brreg";
import type { CompanyFormData } from "./types";

type InvoiceSettingsStepProps = {
  value: CompanyFormData;
  onChange: (patch: Partial<CompanyFormData>) => void;
};

export function InvoiceSettingsStep({ value, onChange }: InvoiceSettingsStepProps) {
  return (
    <div className="space-y-5">
      <div className="space-y-4">
        <FormField label="Standard betalingsfrist" helper="Brukes som utgangspunkt på nye fakturaer.">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={365}
              className="max-w-28"
              value={value.paymentTermsDays}
              onChange={(event) => onChange({ paymentTermsDays: Number(event.target.value) })}
            />
            <span className="text-sm text-slate-600">dager</span>
          </div>
        </FormField>
        <FormField label="Standard fakturanotat">
          <textarea
            className={`${inputClass} min-h-20 resize-y`}
            value={value.invoiceNotes}
            onChange={(event) => onChange({ invoiceNotes: event.target.value })}
          />
        </FormField>
      </div>

      <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-4">
        <h3 className="text-sm font-semibold text-slate-950">Oppsummering</h3>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <SummaryItem label="Bedrift" value={value.companyName} />
          <SummaryItem label="Organisasjonsnummer" value={formatOrganizationNumber(value.organizationNumber)} />
          <SummaryItem label="Adresse" value={[value.address, value.postalAddress].filter(Boolean).join(", ")} />
          <SummaryItem label="E-post" value={value.email} />
          <SummaryItem label="Kontaktperson" value={value.contactPerson} />
          <SummaryItem label="Telefon" value={value.phone} />
          <SummaryItem label="Land" value={countryLabel(value.country) ?? value.country} />
          <SummaryItem label="Betalingsfrist" value={`${value.paymentTermsDays} dager`} />
        </dl>
      </div>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-slate-900">{value || "Ikke registrert"}</dd>
    </div>
  );
}
