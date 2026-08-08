import { Input } from "../../../components/Input";
import { Select } from "../../../components/Select";
import { countryOptions } from "../../../lib/countries";
import {
  BankAccountFields,
  createBankAccountFormRow,
  type BankAccountFormRow,
} from "./BankAccountFields";

type RegistrationFormState = {
  fullName: string;
  companyName: string;
  address: string;
  postalAddress: string;
  country: string;
  orgNumber: string;
  hasSentInvoicesBefore: boolean;
  invoiceNumberPrefix: string;
  lastInvoiceNumber: string;
  bankAccounts: BankAccountFormRow[];
};

type RegistrationFieldsProps = {
  value: RegistrationFormState;
  onChange: (value: RegistrationFormState) => void;
};

const inputClassName =
  "mt-1 rounded-lg border-slate-300 bg-white text-base focus:border-slate-900 focus:ring-0";

export function createRegistrationFormState(): RegistrationFormState {
  return {
    fullName: "",
    companyName: "",
    address: "",
    postalAddress: "",
    country: "NO",
    orgNumber: "",
    hasSentInvoicesBefore: false,
    invoiceNumberPrefix: "",
    lastInvoiceNumber: "",
    bankAccounts: [createBankAccountFormRow()],
  };
}

export function RegistrationFields({ value, onChange }: RegistrationFieldsProps) {
  function updateField<Key extends keyof RegistrationFormState>(
    field: Key,
    fieldValue: RegistrationFormState[Key],
  ) {
    onChange({ ...value, [field]: fieldValue });
  }

  const parsedLastInvoiceNumber = parseInvoiceNumberInput(value.lastInvoiceNumber);
  const nextInvoiceNumber = parsedLastInvoiceNumber
    ? formatInvoiceNumber(
        value.invoiceNumberPrefix,
        parsedLastInvoiceNumber.number + 1,
        parsedLastInvoiceNumber.paddingWidth,
      )
    : "…";

  return (
    <>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Navn</span>
        <Input
          className={inputClassName}
          type="text"
          value={value.fullName}
          onChange={(event) => updateField("fullName", event.target.value)}
          required
        />
      </label>

      <fieldset className="rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-medium text-slate-700">
          Har firmaet sendt fakturaer tidligere?
        </legend>
        <span className="mt-1 block text-xs text-slate-500">
          Dette brukes for å bestemme neste fakturanummer. Fakturanumre må være sekvensielle.
        </span>
        <div className="mt-2 flex gap-5">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="radio"
              name="hasSentInvoicesBefore"
              checked={!value.hasSentInvoicesBefore}
              onChange={() => onChange({
                ...value,
                hasSentInvoicesBefore: false,
                invoiceNumberPrefix: "",
                lastInvoiceNumber: "",
              })}
            />
            Nei
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="radio"
              name="hasSentInvoicesBefore"
              checked={value.hasSentInvoicesBefore}
              onChange={() => updateField("hasSentInvoicesBefore", true)}
            />
            Ja
          </label>
        </div>
        {value.hasSentInvoicesBefore ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Prefix</span>
              <Input
                className={inputClassName}
                type="text"
                value={value.invoiceNumberPrefix}
                onChange={(event) => updateField("invoiceNumberPrefix", event.target.value)}
                placeholder="INV-"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Siste brukte fakturanummer</span>
              <Input
                className={inputClassName}
                type="text"
                value={value.lastInvoiceNumber}
                onChange={(event) => updateField("lastInvoiceNumber", event.target.value)}
                placeholder="10000"
                required
              />
            </label>
            <span className="text-xs text-slate-500 sm:col-span-2">
              Neste faktura får nummer {nextInvoiceNumber}. Prefix er valgfritt, og ledende nuller beholdes.
            </span>
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate-500">Første faktura får nummer 10000.</p>
        )}
      </fieldset>

      <RegistrationTextField
        label="Firmanavn"
        value={value.companyName}
        onChange={(companyName) => updateField("companyName", companyName)}
      />
      <RegistrationTextField
        label="Adresse"
        value={value.address}
        onChange={(address) => updateField("address", address)}
      />
      <RegistrationTextField
        label="Postadresse"
        value={value.postalAddress}
        onChange={(postalAddress) => updateField("postalAddress", postalAddress)}
      />
      <RegistrationTextField
        label="Organisasjonsnummer"
        value={value.orgNumber}
        onChange={(orgNumber) => updateField("orgNumber", orgNumber)}
      />

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Land</span>
        <Select
          className={inputClassName}
          value={value.country}
          options={countryOptions}
          onChange={(country) => updateField("country", country)}
          ariaLabel="Velg land"
        />
      </label>

      <BankAccountFields
        accounts={value.bankAccounts}
        onChange={(bankAccounts) => updateField("bankAccounts", bankAccounts)}
      />
    </>
  );
}

type RegistrationTextFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

function RegistrationTextField({ label, value, onChange }: RegistrationTextFieldProps) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <Input
        className={inputClassName}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
      />
    </label>
  );
}

function parseInvoiceNumberInput(value: string) {
  const match = value.trim().match(/^(\d+)$/);

  if (!match) {
    return null;
  }

  const [, numberText] = match;
  const number = Number(numberText);

  if (!Number.isSafeInteger(number) || number < 0) {
    return null;
  }

  return {
    number,
    paddingWidth: numberText.length,
  };
}

function formatInvoiceNumber(prefix: string, number: number, paddingWidth: number) {
  return `${prefix}${String(number).padStart(Math.max(paddingWidth, String(number).length), "0")}`;
}
