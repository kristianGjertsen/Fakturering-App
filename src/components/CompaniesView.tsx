import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import type { Company, Product } from "../types";
import type { CompanyInput, ProductInput } from "../lib/data";
import { formatCurrency } from "../lib/format";
import { toNumber } from "../lib/invoiceMath";
import { EmptyState } from "./EmptyState";
import { FormField, buttonPrimaryClass, buttonSecondaryClass, inputClass } from "./FormField";
import { SectionHeader } from "./SectionHeader";

type CompaniesViewProps = {
  companies: Company[];
  products: Product[];
  onCreateCompany: (input: CompanyInput) => Promise<void>;
  onCreateProduct: (input: ProductInput) => Promise<void>;
};

const emptyCompanyForm: CompanyInput = {
  name: "",
  org_number: "",
  email: "",
  city: "",
  country: "Norway",
  private_notes: "",
};

export function CompaniesView({ companies, products, onCreateCompany, onCreateProduct }: CompaniesViewProps) {
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [companyForm, setCompanyForm] = useState<CompanyInput>(emptyCompanyForm);
  const [productForm, setProductForm] = useState({ name: "", description: "", unit: "stk", unit_price: "0", vat_rate: "25" });
  const [savingCompany, setSavingCompany] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!selectedCompanyId && companies[0]) {
      setSelectedCompanyId(companies[0].id);
    }
  }, [companies, selectedCompanyId]);

  const selectedCompany = companies.find((company) => company.id === selectedCompanyId) ?? null;
  const selectedProducts = products.filter((product) => product.company_id === selectedCompanyId);

  async function handleCreateCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingCompany(true);
    setMessage("");

    try {
      await onCreateCompany(companyForm);
      setCompanyForm(emptyCompanyForm);
      setMessage("Selskap lagret.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kunne ikke lagre selskapet.");
    } finally {
      setSavingCompany(false);
    }
  }

  async function handleCreateProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedCompanyId) {
      setMessage("Velg et selskap først.");
      return;
    }

    setSavingProduct(true);
    setMessage("");

    try {
      await onCreateProduct({
        company_id: selectedCompanyId,
        name: productForm.name,
        description: productForm.description,
        unit: productForm.unit,
        unit_price: toNumber(productForm.unit_price),
        vat_rate: toNumber(productForm.vat_rate, 25),
      });
      setProductForm({ name: "", description: "", unit: "stk", unit_price: "0", vat_rate: "25" });
      setMessage("Produkt lagret.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kunne ikke lagre produktet.");
    } finally {
      setSavingProduct(false);
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Selskaper og produkter"
        description="Registrer selskapene som skal faktureres. Produkter og tjenester lagres inne på hvert selskap."
      />

      {message && <p className="rounded-md border border-blue-100 bg-white px-4 py-3 text-sm text-blue-900 shadow-sm">{message}</p>}

      <section className="grid gap-5 lg:grid-cols-[360px_1fr]">
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
            <button className={buttonPrimaryClass} type="submit" disabled={savingCompany}>
              {savingCompany ? "Lagrer..." : "Lagre selskap"}
            </button>
          </div>
        </form>

        <div className="space-y-5">
          <div className="rounded-lg border border-blue-100 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-slate-950">Registrerte selskaper</h3>
            {companies.length === 0 ? (
              <div className="mt-4">
                <EmptyState title="Ingen selskaper" description="Legg inn et selskap før du registrerer produkter eller lager faktura." />
              </div>
            ) : (
              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {companies.map((company) => (
                  <button
                    key={company.id}
                    className={`rounded-lg border p-4 text-left transition ${
                      selectedCompanyId === company.id
                        ? "border-blue-400 bg-blue-50"
                        : "border-blue-100 bg-white hover:border-blue-300"
                    }`}
                    type="button"
                    onClick={() => setSelectedCompanyId(company.id)}
                  >
                    <span className="block font-semibold text-slate-950">{company.name}</span>
                    <span className="mt-1 block text-sm text-slate-600">{company.email || company.org_number || "Ingen detaljer"}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-blue-100 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-950">Produkter</h3>
                <p className="text-sm text-slate-600">{selectedCompany ? selectedCompany.name : "Velg et selskap"}</p>
              </div>
              {selectedCompany && <span className="text-sm text-slate-500">{selectedProducts.length} aktive</span>}
            </div>

            {selectedCompany ? (
              <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_320px]">
                <div className="overflow-x-auto">
                  {selectedProducts.length === 0 ? (
                    <EmptyState title="Ingen produkter" description="Legg inn produkter eller tjenester som skal kunne velges på faktura." />
                  ) : (
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead className="border-b border-blue-100 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="py-3 pr-4 font-semibold">Navn</th>
                          <th className="py-3 pr-4 font-semibold">Enhet</th>
                          <th className="py-3 pr-4 text-right font-semibold">Pris</th>
                          <th className="py-3 pr-4 text-right font-semibold">MVA</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-blue-50">
                        {selectedProducts.map((product) => (
                          <tr key={product.id}>
                            <td className="py-3 pr-4">
                              <span className="block font-medium text-slate-950">{product.name}</span>
                              {product.description && <span className="text-sm text-slate-500">{product.description}</span>}
                            </td>
                            <td className="py-3 pr-4 text-slate-600">{product.unit}</td>
                            <td className="py-3 pr-4 text-right font-medium text-slate-950">{formatCurrency(product.unit_price)}</td>
                            <td className="py-3 pr-4 text-right text-slate-600">{product.vat_rate}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <form className="rounded-lg border border-blue-100 bg-blue-50 p-4" onSubmit={handleCreateProduct}>
                  <h4 className="text-sm font-semibold text-slate-950">Nytt produkt</h4>
                  <div className="mt-4 space-y-3">
                    <FormField label="Navn">
                      <input
                        className={inputClass}
                        value={productForm.name}
                        onChange={(event) => setProductForm((form) => ({ ...form, name: event.target.value }))}
                        required
                      />
                    </FormField>
                    <FormField label="Beskrivelse">
                      <textarea
                        className={`${inputClass} min-h-20 resize-y`}
                        value={productForm.description}
                        onChange={(event) => setProductForm((form) => ({ ...form, description: event.target.value }))}
                      />
                    </FormField>
                    <div className="grid grid-cols-3 gap-2">
                      <FormField label="Enhet">
                        <input
                          className={inputClass}
                          value={productForm.unit}
                          onChange={(event) => setProductForm((form) => ({ ...form, unit: event.target.value }))}
                        />
                      </FormField>
                      <FormField label="Pris">
                        <input
                          className={inputClass}
                          inputMode="decimal"
                          value={productForm.unit_price}
                          onChange={(event) => setProductForm((form) => ({ ...form, unit_price: event.target.value }))}
                          required
                        />
                      </FormField>
                      <FormField label="MVA %">
                        <input
                          className={inputClass}
                          inputMode="decimal"
                          value={productForm.vat_rate}
                          onChange={(event) => setProductForm((form) => ({ ...form, vat_rate: event.target.value }))}
                          required
                        />
                      </FormField>
                    </div>
                    <button className={buttonSecondaryClass} type="submit" disabled={savingProduct}>
                      {savingProduct ? "Lagrer..." : "Lagre produkt"}
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="mt-4">
                <EmptyState title="Velg selskap" description="Produkter registreres på et bestemt selskap." />
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
