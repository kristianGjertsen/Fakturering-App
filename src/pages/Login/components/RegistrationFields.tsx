import { FileText, Upload } from "@animateicons/react/lucide";
import { useState } from "react";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { Select } from "../../../components/Select";
import { countryOptions } from "../../../lib/countries";
import { extractSaftImportPrefill, SAFT_IMPORT_ACCEPT } from "../../../lib/saftImportData";
import {
  BankAccountFields,
  createBankAccountFormRow,
  type BankAccountFormRow,
} from "./BankAccountFields";

export type RegistrationStep = 1 | 2 | 3;

export type RegistrationFormState = {
  fullName: string;
  companyName: string;
  address: string;
  postalAddress: string;
  country: string;
  orgNumber: string;
  isVatRegistered: boolean;
  hasSentInvoicesBefore: boolean;
  invoiceNumberPrefix: string;
  lastInvoiceNumber: string;
  isSwitchingAccountingSystem: boolean | null;
  saftImportFile: File | null;
  bankAccounts: BankAccountFormRow[];
};

type RegistrationFieldsProps = {
  value: RegistrationFormState;
  currentStep: RegistrationStep;
  onChange: (value: RegistrationFormState) => void;
  onMessage: (message: string) => void;
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
    isVatRegistered: false,
    hasSentInvoicesBefore: false,
    invoiceNumberPrefix: "",
    lastInvoiceNumber: "",
    isSwitchingAccountingSystem: null,
    saftImportFile: null,
    bankAccounts: [createBankAccountFormRow()],
  };
}

const registrationSteps = [
  { number: 1, label: "SAF-T" },
  { number: 2, label: "Firma" },
  { number: 3, label: "Fakturering" },
] as const;

export function RegistrationFields({
  value,
  currentStep,
  onChange,
  onMessage,
}: RegistrationFieldsProps) {
  const [readingSaft, setReadingSaft] = useState(false);
  const [saftSummary, setSaftSummary] = useState("");

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

  async function handleSaftFileSelection(fileList: FileList | null) {
    const file = fileList?.[0] ?? null;
    updateField("saftImportFile", file);
    setSaftSummary("");
    onMessage("");

    if (!file) {
      return;
    }

    setReadingSaft(true);
    try {
      const result = await extractSaftImportPrefill(file);
      if (result.profile) {
        onChange({
          ...value,
          saftImportFile: file,
          companyName: result.profile.companyName ?? value.companyName,
          orgNumber: result.profile.orgNumber ?? value.orgNumber,
          address: result.profile.address ?? value.address,
          postalAddress: result.profile.postalAddress ?? value.postalAddress,
          country: result.profile.country ?? value.country,
        });
      }
      setSaftSummary(result.message);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Kunne ikke lese SAF-T-filen.");
    } finally {
      setReadingSaft(false);
    }
  }

  return (
    <>
      <RegistrationStepIndicator currentStep={currentStep} />

      {currentStep === 1 && (
        <div className="space-y-4">
          <div className="rounded-lg border border-blue-100 bg-white p-4 shadow-sm">
            <p className="text-lg font-semibold text-slate-950">
              Bytter du regnskapsprogram?
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Hvis virksomheten allerede har regnskap fra et annet system, kan en SAF-T-fil brukes til å hente inn historikken.
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Dersom du starter ved et årsskifte og ikke trenger historikk fra tidligere år, er dette ikke nødvendig.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant={value.isSwitchingAccountingSystem === true ? "primary" : "secondary"}
                onClick={() => updateField("isSwitchingAccountingSystem", true)}
              >
                Ja
              </Button>
              <Button
                type="button"
                variant={value.isSwitchingAccountingSystem === false ? "primary" : "secondary"}
                onClick={() => onChange({
                  ...value,
                  isSwitchingAccountingSystem: false,
                  saftImportFile: null,
                })}
              >
                Nei
              </Button>
            </div>
          </div>

          {value.isSwitchingAccountingSystem === true && (
            <div className="rounded-lg border border-dashed border-blue-200 bg-blue-50 p-4">
              <div className="flex items-start gap-3">
                <Upload size={22} className="mt-0.5 shrink-0 text-blue-700" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-950">Last opp SAF-T-fil</p>
                  <p className="mt-1 text-sm text-slate-600">
                    Appen prøver å fylle inn firma, kontoplan, kunder, leverandører, MVA-koder og historiske bilag fra XML-filen.
                  </p>
                </div>
              </div>
              <Input
                className={inputClassName}
                type="file"
                accept={SAFT_IMPORT_ACCEPT}
                disabled={readingSaft}
                onChange={(event) => void handleSaftFileSelection(event.currentTarget.files)}
              />
              {value.saftImportFile && (
                <div className="mt-3 flex min-w-0 items-center gap-2 rounded-md border border-blue-100 bg-white px-3 py-2 text-sm text-slate-700">
                  <FileText size={16} className="shrink-0 text-blue-700" />
                  <span className="min-w-0 truncate">{value.saftImportFile.name}</span>
                </div>
              )}
              {readingSaft && <p className="mt-2 text-sm text-slate-500">Leser SAF-T-filen...</p>}
              {saftSummary && <p className="mt-2 text-sm text-slate-600">{saftSummary}</p>}
            </div>
          )}

          {value.isSwitchingAccountingSystem === false && (
            <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              Da starter du uten historisk SAF-T-import. Du kan fortsatt legge inn firmaopplysninger og begynne med ny fakturanummerserie.
            </p>
          )}

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-950">Hva er SAF-T?</p>
            <p className="mt-1 text-sm text-slate-600">
              SAF-T er en standard regnskapsfil som kan eksporteres fra mange regnskapssystemer. Den kan inneholde firmaopplysninger, kontoplan, kunder, leverandører, MVA-koder, saldoer og bokførte bilag.
            </p>
          </div>
        </div>
      )}

      {currentStep === 2 && (
        <div className="space-y-4">
          <RegistrationTextField
            label="Navn"
            value={value.fullName}
            onChange={(fullName) => updateField("fullName", fullName)}
          />
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

          <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-4">
            <Input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-slate-900"
              checked={value.isVatRegistered}
              onChange={(event) => updateField("isVatRegistered", event.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium text-slate-800">Registrert i MVA-registeret</span>
              <span className="mt-1 block text-xs text-slate-500">Velg dette bare når virksomheten er registrert hos Skatteetaten.</span>
            </span>
          </label>

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
        </div>
      )}

      {currentStep === 3 && (
        <div className="space-y-4">
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

          <BankAccountFields
            accounts={value.bankAccounts}
            onChange={(bankAccounts) => updateField("bankAccounts", bankAccounts)}
          />
        </div>
      )}
    </>
  );
}

export function RegistrationStepActions({
  currentStep,
  form,
  loading,
  onBack,
  onNext,
}: {
  currentStep: RegistrationStep;
  form: RegistrationFormState;
  loading: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  if (currentStep === 1) {
    return (
      <Button className="w-full" type="button" disabled={loading || !canContinueRegistrationStep(currentStep, form)} onClick={onNext}>
        Neste
      </Button>
    );
  }

  if (currentStep === 2) {
    return (
      <div className="flex gap-2">
        <Button className="flex-1" type="button" variant="secondary" disabled={loading} onClick={onBack}>
          Tilbake
        </Button>
        <Button className="flex-1" type="button" disabled={loading || !canContinueRegistrationStep(currentStep, form)} onClick={onNext}>
          Neste
        </Button>
      </div>
    );
  }

  return null;
}

export function canContinueRegistrationStep(step: RegistrationStep, form: RegistrationFormState) {
  if (step === 1) return form.isSwitchingAccountingSystem !== null;
  if (step === 2) {
    return Boolean(
      form.fullName.trim()
      && form.companyName.trim()
      && form.address.trim()
      && form.postalAddress.trim()
      && form.orgNumber.trim(),
    );
  }
  return true;
}

function RegistrationStepIndicator({ currentStep }: { currentStep: RegistrationStep }) {
  return (
    <div>
      <div className="flex items-center" aria-label={`Steg ${currentStep} av 3`}>
        {registrationSteps.map((step, index) => {
          const active = step.number === currentStep;
          const completed = step.number < currentStep;

          return (
            <div key={step.number} className="flex min-w-0 flex-1 items-center last:flex-none">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${active || completed
                      ? "bg-blue-700 text-white"
                      : "border border-blue-200 bg-white text-slate-500"
                    }`}
                >
                  {completed ? "✓" : step.number}
                </span>
                <span className={`hidden text-xs font-semibold sm:block ${active ? "text-blue-900" : "text-slate-500"}`}>
                  {step.label}
                </span>
              </div>
              {index < registrationSteps.length - 1 && (
                <span className={`mx-2 h-px min-w-5 flex-1 ${completed ? "bg-blue-500" : "bg-blue-100"}`} />
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs font-medium text-slate-500">Steg {currentStep} av 3</p>
    </div>
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
