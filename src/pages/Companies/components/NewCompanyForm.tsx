import { useState, type FormEvent } from "react";
import { Button } from "../../../components/Button";
import { FormField } from "../../../components/FormField";
import { Input, inputClass } from "../../../components/Input";
import { Select } from "../../../components/Select";
import type { CompanyInput } from "../../../lib/data";
import { countryOptions } from "../../../lib/countries";

type NewCompanyFormProps = {
  onCreateCompany: (input: CompanyInput) => Promise<void>;
  onMessage: (message: string) => void;
  onCreated: () => void;
  onCancel: () => void;
};

const emptyCompanyForm: CompanyInput = {
  name: "",
  org_number: "",
  email: "",
  address: "",
  postal_address: "",
  country: "NO",
  private_notes: "",
};

export function NewCompanyForm({
  onCreateCompany,
  onMessage,
  onCreated,
  onCancel,
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
      onCreated();
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Kunne ikke lagre selskapet.");
    } finally {
      setSavingCompany(false);
    }
  }

  return (
    <form onSubmit={handleCreateCompany}>
      <div className="space-y-4">
        <FormField label="Firmanavn">
          <Input
            value={companyForm.name}
            onChange={(event) => setCompanyForm((form) => ({ ...form, name: event.target.value }))}
            required
          />
        </FormField>
        <FormField label="Organisasjonsnummer">
          <Input
            value={companyForm.org_number}
            onChange={(event) => setCompanyForm((form) => ({ ...form, org_number: event.target.value }))}
          />
        </FormField>
        <FormField label="E-post">
          <Input
            type="email"
            value={companyForm.email}
            onChange={(event) => setCompanyForm((form) => ({ ...form, email: event.target.value }))}
          />
        </FormField>
        <FormField label="Adresse">
          <Input
            value={companyForm.address}
            onChange={(event) => setCompanyForm((form) => ({ ...form, address: event.target.value }))}
          />
        </FormField>
        <FormField label="Postadresse">
          <Input
            value={companyForm.postal_address}
            onChange={(event) => setCompanyForm((form) => ({ ...form, postal_address: event.target.value }))}
          />
        </FormField>
        <FormField label="Land">
          <Select
            value={companyForm.country}
            options={countryOptions}
            onChange={(country) => setCompanyForm((form) => ({ ...form, country }))}
            ariaLabel="Velg land for selskap"
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
          <Button variant="ghost" onClick={onCancel} disabled={savingCompany}>
            Avbryt
          </Button>
          <Button type="submit" disabled={savingCompany}>
            {savingCompany ? "Lagrer..." : "Lagre selskap"}
          </Button>
        </div>
      </div>
    </form>
  );
}
