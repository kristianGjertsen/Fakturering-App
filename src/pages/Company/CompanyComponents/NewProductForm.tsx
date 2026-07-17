import { useState, type FormEvent } from "react";
import { Button } from "../../../components/Button";
import { FormField, inputClass } from "../../../components/FormField";
import type { ProductInput } from "../../../lib/data";
import { toNumber } from "../../../lib/invoiceMath";

export type NewProductFormProps = {
  companyId: string;
  onCreateProduct: (input: ProductInput) => Promise<void>;
  onMessage: (message: string) => void;
};

const emptyProductForm = {
  name: "",
  description: "",
  unit: "stk",
  unit_price: "0",
  vat_rate: "25",
};

export function NewProductForm({ companyId, onCreateProduct, onMessage }: NewProductFormProps) {
  const [productForm, setProductForm] = useState(emptyProductForm);
  const [savingProduct, setSavingProduct] = useState(false);

  async function handleCreateProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingProduct(true);
    onMessage("");

    try {
      await onCreateProduct({
        company_id: companyId,
        name: productForm.name,
        description: productForm.description,
        unit: productForm.unit,
        unit_price: toNumber(productForm.unit_price),
        vat_rate: toNumber(productForm.vat_rate, 25),
      });
      setProductForm(emptyProductForm);
      onMessage("Produkt lagret.");
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Kunne ikke lagre produktet.");
    } finally {
      setSavingProduct(false);
    }
  }

  return (
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
        <Button variant="secondary" type="submit" disabled={savingProduct}>
          {savingProduct ? "Lagrer..." : "Lagre produkt"}
        </Button>
      </div>
    </form>
  );
}
