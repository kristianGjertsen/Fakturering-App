import { EmptyState } from "../../../components/EmptyState";
import { formatCurrency } from "../../../lib/format";
import type { Product } from "../../../types";

type CompanyProductsProps = {
  products: Product[];
};

export function CompanyProducts({ products }: CompanyProductsProps) {
  return (
    <section className="rounded-lg border border-blue-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-950">Produkter og tjenester</h3>
          <p className="mt-1 text-sm text-slate-600">Produkter som kan brukes på fakturaer til dette selskapet.</p>
        </div>
        <span className="text-sm text-slate-500">{products.length} totalt</span>
      </div>

      {products.length === 0 ? (
        <div className="mt-5">
          <EmptyState title="Ingen produkter" description="Legg inn det første produktet med skjemaet under." />
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="border-b border-blue-100 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-3 pr-4 font-semibold">Navn</th>
                <th className="py-3 pr-4 font-semibold">Enhet</th>
                <th className="py-3 pr-4 text-right font-semibold">Pris</th>
                <th className="py-3 pr-4 text-right font-semibold">MVA</th>
                <th className="py-3 text-right font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-blue-50">
              {products.map((product) => (
                <tr key={product.id}>
                  <td className="py-3 pr-4">
                    <span className="block font-medium text-slate-950">{product.name}</span>
                    {product.description && <span className="text-sm text-slate-500">{product.description}</span>}
                  </td>
                  <td className="py-3 pr-4 text-slate-600">{product.unit}</td>
                  <td className="py-3 pr-4 text-right font-medium text-slate-950">{formatCurrency(product.unit_price)}</td>
                  <td className="py-3 pr-4 text-right text-slate-600">{product.vat_rate}%</td>
                  <td className="py-3 text-right">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                      product.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                    }`}>
                      {product.is_active ? "Aktiv" : "Inaktiv"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
