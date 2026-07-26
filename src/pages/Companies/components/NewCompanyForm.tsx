import { useState, type FormEvent } from "react";
import { Button } from "../../../components/Button";
import type { CompanyInput } from "../../../lib/data";
import { CompanySearchStep } from "./company-form/CompanySearchStep";
import { ContactDetailsStep } from "./company-form/ContactDetailsStep";
import { FormStepIndicator } from "./company-form/FormStepIndicator";
import { InvoiceSettingsStep } from "./company-form/InvoiceSettingsStep";
import {
  emptyCompanyForm,
  type BrregCompany,
  type BrregPrefilledFields,
  type CompanyFormData,
  type FormStep,
} from "./company-form/types";

type NewCompanyFormProps = {
  onCreateCompany: (input: CompanyInput) => Promise<void>;
  onMessage: (message: string) => void;
  onCreated: () => void;
  onCancel: () => void;
};

export function NewCompanyForm({
  onCreateCompany,
  onMessage,
  onCreated,
  onCancel,
}: NewCompanyFormProps) {
  const [currentStep, setCurrentStep] = useState<FormStep>(1);
  const [companyForm, setCompanyForm] = useState<CompanyFormData>(emptyCompanyForm);
  const [selectedCompany, setSelectedCompany] = useState<BrregCompany | null>(null);
  const [brregPrefilledFields, setBrregPrefilledFields] = useState<BrregPrefilledFields>({
    email: false,
    phone: false,
  });
  const [savingCompany, setSavingCompany] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");

  function updateForm(patch: Partial<CompanyFormData>) {
    setCompanyForm((form) => ({ ...form, ...patch }));
    setBrregPrefilledFields((fields) => ({
      email: patch.email === undefined ? fields.email : false,
      phone: patch.phone === undefined ? fields.phone : false,
    }));
    setValidationMessage("");
  }

  function handleCompanySelect(company: BrregCompany | null) {
    setSelectedCompany(company);
    setBrregPrefilledFields({
      email: Boolean(company?.email),
      phone: Boolean(company?.phone),
    });
  }

  function goToNextStep() {
    const error = validateStep(currentStep, companyForm);
    if (error) {
      setValidationMessage(error);
      return;
    }

    setValidationMessage("");
    setCurrentStep((step) => Math.min(3, step + 1) as FormStep);
  }

  function goToPreviousStep() {
    setValidationMessage("");
    setCurrentStep((step) => Math.max(1, step - 1) as FormStep);
  }

  async function handleCreateCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (currentStep !== 3) {
      goToNextStep();
      return;
    }

    const error = validateStep(3, companyForm);
    if (error) {
      setValidationMessage(error);
      return;
    }

    setSavingCompany(true);
    onMessage("");

    try {
      await onCreateCompany(toCompanyInput(companyForm));
      setCompanyForm(emptyCompanyForm);
      setSelectedCompany(null);
      setBrregPrefilledFields({ email: false, phone: false });
      setCurrentStep(1);
      onMessage("Selskap lagret.");
      onCreated();
    } catch (submitError) {
      setValidationMessage(
        submitError instanceof Error ? submitError.message : "Kunne ikke lagre selskapet.",
      );
    } finally {
      setSavingCompany(false);
    }
  }

  return (
    <form onSubmit={handleCreateCompany}>
      <FormStepIndicator currentStep={currentStep} />

      <div className="mt-5">
        {currentStep === 1 && (
          <CompanySearchStep
            value={companyForm}
            selectedCompany={selectedCompany}
            onChange={updateForm}
            onSelect={handleCompanySelect}
          />
        )}
        {currentStep === 2 && (
          <ContactDetailsStep
            value={companyForm}
            brregPrefilledFields={brregPrefilledFields}
            onChange={updateForm}
          />
        )}
        {currentStep === 3 && <InvoiceSettingsStep value={companyForm} onChange={updateForm} />}
      </div>

      {validationMessage && (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {validationMessage}
        </p>
      )}

      <div className="sticky -bottom-5 mt-6 flex items-center justify-between gap-3 border-t border-blue-100 bg-white py-4">
        <div>
          {currentStep === 1 ? (
            <Button variant="ghost" onClick={onCancel} disabled={savingCompany}>Avbryt</Button>
          ) : (
            <Button variant="ghost" onClick={goToPreviousStep} disabled={savingCompany}>Tilbake</Button>
          )}
        </div>
        {currentStep < 3 ? (
          <Button type="button" onClick={goToNextStep} disabled={savingCompany || !canContinue(currentStep, companyForm)}>
            Neste
          </Button>
        ) : (
          <Button type="submit" disabled={savingCompany}>
            {savingCompany ? "Oppretter…" : "Opprett kunde"}
          </Button>
        )}
      </div>
    </form>
  );
}

function canContinue(step: FormStep, form: CompanyFormData) {
  if (step === 1) return Boolean(form.companyName.trim());
  if (step === 2) return isValidEmail(form.email);
  return true;
}

function validateStep(step: FormStep, form: CompanyFormData) {
  if (step === 1 && !form.companyName.trim()) {
    return "Velg en bedrift eller registrer kunden manuelt.";
  }

  if (step === 2 && !isValidEmail(form.email)) {
    return "Skriv inn en gyldig e-postadresse.";
  }

  if (
    step === 3
    && (!Number.isInteger(form.paymentTermsDays)
      || form.paymentTermsDays < 0
      || form.paymentTermsDays > 365)
  ) {
    return "Betalingsfristen må være et helt antall dager mellom 0 og 365.";
  }

  return "";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function toCompanyInput(form: CompanyFormData): CompanyInput {
  return {
    name: form.companyName,
    org_number: form.organizationNumber.replace(/\D/g, ""),
    email: form.email,
    address: form.address,
    postal_address: form.postalAddress,
    country: form.country,
    private_notes: form.privateNotes,
    contact_person: form.contactPerson,
    phone: form.phone,
    payment_terms_days: form.paymentTermsDays,
    invoice_notes: form.invoiceNotes,
  };
}
