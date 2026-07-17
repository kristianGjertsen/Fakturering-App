import { useState, type FormEvent } from "react";
import { Button } from "../../../components/Button";
import { FormField, inputClass } from "../../../components/FormField";
import type { CompanyInput } from "../../../lib/data";

type NewCompanyFormProps = {
  onCreateCompany: (input: CompanyInput) => Promise<void>;
  onMessage: (message: string) => void;
  onCreated?: () => void;
  onCancel?: () => void;
  embedded?: boolean;
};

const emptyCompanyForm: CompanyInput = {
  name: "",
  org_number: "",
  email: "",
  city: "",
  country: "Norway",
  private_notes: "",
};

export function NewCompanyForm({
  onCreateCompany,
  onMessage,
  onCreated,
  onCancel,
  embedded = false,
}: NewCompanyFormProps) {
  const [companyForm, setCompanyForm] = useState<CompanyInput>(emptyCompanyForm);
  const [savingCompany, setSavingCompany] = useState(false);

  async function handleCreateCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingCompany(true);
    onMessage("");

    try {
      await onCreateCompany(companyForm);
      setCompanyForm(emptyCompanyForm);
      onMessage("Selskap lagret.");
      onCreated?.();
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Kunne ikke lagre selskapet.");
    } finally {
      setSavingCompany(false);
    }
  }

  return (
    <form
      className={embedded ? "" : "rounded-lg border border-blue-100 bg-white p-5 shadow-sm"}
      onSubmit={handleCreateCompany}
    >
      {!embedded && <h3 className="text-base font-semibold text-slate-950">Nytt selskap</h3>}
      <div className={embedded ? "space-y-4" : "mt-4 space-y-4"}>
        <FormField label="Navn">
          <input
            className={inputClass}
            value={companyForm.name}
            onChange={(event) => setCompanyForm((form) => ({ ...form, name: event.target.value }))}
            required
          />
        </FormField>
        <FormField label="Org.nr.">
          <input
            className={inputClass}
            value={companyForm.org_number}
            onChange={(event) => setCompanyForm((form) => ({ ...form, org_number: event.target.value }))}
          />
        </FormField>
        <FormField label="E-post">
          <input
            className={inputClass}
            type="email"
            value={companyForm.email}
            onChange={(event) => setCompanyForm((form) => ({ ...form, email: event.target.value }))}
          />
        </FormField>
        <FormField label="By">
          <input
            className={inputClass}
            value={companyForm.city}
            onChange={(event) => setCompanyForm((form) => ({ ...form, city: event.target.value }))}
          />
        </FormField>
        <FormField label="Land">
          <input
            className={inputClass}
            value={companyForm.country}
            onChange={(event) => setCompanyForm((form) => ({ ...form, country: event.target.value }))}
          />
        </FormField>
        <FormField label="Internt notat">
          <textarea
            className={`${inputClass} min-h-24 resize-y`}
            value={companyForm.private_notes}
            onChange={(event) => setCompanyForm((form) => ({ ...form, private_notes: event.target.value }))}
          />
        </FormField>
        <div className="flex justify-end gap-2">
          {onCancel && (
            <Button variant="ghost" onClick={onCancel} disabled={savingCompany}>
              Avbryt
            </Button>
          )}
          <Button type="submit" disabled={savingCompany}>
            {savingCompany ? "Lagrer..." : "Lagre selskap"}
          </Button>
        </div>
      </div>
    </form>
  );
}
