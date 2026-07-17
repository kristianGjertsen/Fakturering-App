import { FormField, inputClass } from "../../components/FormField";
import type { Company, Product } from "../../types";

 <form className="rounded-lg border border-blue-100 bg-white p-5 shadow-sm" onSubmit={handleCreateCompany}>
          <h3 className="text-base font-semibold text-slate-950">Nytt selskap</h3>
          <div className="mt-4 space-y-4">
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
            <Button type="submit" disabled={savingCompany}>
              {savingCompany ? "Lagrer..." : "Lagre selskap"}
            </Button>
          </div>
        </form>