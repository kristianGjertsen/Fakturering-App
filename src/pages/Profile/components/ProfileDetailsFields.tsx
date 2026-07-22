import { FormField } from "../../../components/FormField";
import { Input } from "../../../components/Input";
import { Select } from "../../../components/Select";
import { countryOptions } from "../../../lib/countries";

export type ProfileDetailsFormValue = {
  fullName: string;
  companyName: string;
  address: string;
  postalAddress: string;
  country: string;
  orgNumber: string;
};

type ProfileDetailsField = keyof ProfileDetailsFormValue;

type ProfileDetailsFieldsProps = {
  email: string;
  value: ProfileDetailsFormValue;
  disabled: boolean;
  onChange: (field: ProfileDetailsField, value: string) => void;
};

export function ProfileDetailsFields({
  email,
  value,
  disabled,
  onChange,
}: ProfileDetailsFieldsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField label="E-post">
        <Input value={email} disabled />
      </FormField>
      <ProfileTextField
        label="Navn"
        value={value.fullName}
        onChange={(fullName) => onChange("fullName", fullName)}
        disabled={disabled}
      />
      <ProfileTextField
        label="Firmanavn"
        value={value.companyName}
        onChange={(companyName) => onChange("companyName", companyName)}
        disabled={disabled}
        required
      />
      <ProfileTextField
        label="Organisasjonsnummer"
        value={value.orgNumber}
        onChange={(orgNumber) => onChange("orgNumber", orgNumber)}
        disabled={disabled}
        required
      />
      <ProfileTextField
        label="Adresse"
        value={value.address}
        onChange={(address) => onChange("address", address)}
        disabled={disabled}
        required
      />
      <ProfileTextField
        label="Postadresse"
        value={value.postalAddress}
        onChange={(postalAddress) => onChange("postalAddress", postalAddress)}
        disabled={disabled}
        required
      />
      <FormField label="Land">
        <Select
          value={value.country}
          options={countryOptions}
          onChange={(country) => onChange("country", country)}
          ariaLabel="Velg land for egen virksomhet"
          disabled={disabled}
        />
      </FormField>
    </div>
  );
}

type ProfileTextFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  required?: boolean;
};

function ProfileTextField({
  label,
  value,
  onChange,
  disabled,
  required = false,
}: ProfileTextFieldProps) {
  return (
    <FormField label={label}>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        required={required}
      />
    </FormField>
  );
}
