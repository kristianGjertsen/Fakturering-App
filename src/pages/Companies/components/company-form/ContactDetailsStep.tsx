import { FormField } from "../../../../components/FormField";
import { Input, inputClass } from "../../../../components/Input";
import { Select } from "../../../../components/Select";
import { countryOptions } from "../../../../lib/countries";
import type { BrregPrefilledFields, CompanyFormData } from "./types";

type ContactDetailsStepProps = {
  value: CompanyFormData;
  brregPrefilledFields: BrregPrefilledFields;
  onChange: (patch: Partial<CompanyFormData>) => void;
};

export function ContactDetailsStep({
  value,
  brregPrefilledFields,
  onChange,
}: ContactDetailsStepProps) {
  return (
    <div className="space-y-4">
      <FormField
        label="E-post"
        helper="Brukes som mottakeradresse når du sender faktura."
      >
        {brregPrefilledFields.email && <BrregSourceTag />}
        <Input
          autoFocus
          type="email"
          className={brregPrefilledFields.email ? "mt-2" : ""}
          value={value.email}
          onChange={(event) => onChange({ email: event.target.value })}
          required
        />
      </FormField>
      <FormField label="Kontaktperson">
        <Input value={value.contactPerson} onChange={(event) => onChange({ contactPerson: event.target.value })} />
      </FormField>
      <FormField label="Telefonnummer">
        {brregPrefilledFields.phone && <BrregSourceTag />}
        <Input
          type="tel"
          className={brregPrefilledFields.phone ? "mt-2" : ""}
          value={value.phone}
          onChange={(event) => onChange({ phone: event.target.value })}
        />
      </FormField>
      <FormField label="Land">
        <Select
          value={value.country}
          options={countryOptions}
          onChange={(country) => onChange({ country })}
          ariaLabel="Velg land for selskap"
        />
      </FormField>
      <FormField label="Internt notat">
        <textarea
          className={`${inputClass} min-h-20 resize-y`}
          value={value.privateNotes}
          onChange={(event) => onChange({ privateNotes: event.target.value })}
        />
      </FormField>
    </div>
  );
}

function BrregSourceTag() {
  return (
    <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-800">
      Hentet fra Brønnøysundregistrene
    </span>
  );
}
