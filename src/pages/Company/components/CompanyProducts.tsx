import { useState } from "react";
import { Plus, Trash2 } from "@animateicons/react/lucide";
import { AnimatedIconButton } from "../../../components/AnimatedIconButton";
import { EmptyState } from "../../../components/EmptyState";
import { ConfirmDialog } from "../../../components/layout/ConfirmDialog";
import { Panel, PanelHeader } from "../../../components/layout/Panel";
import { formatCurrency } from "../../../lib/format";
import type { Product } from "../../../types";

type CompanyProductsProps = {
  products: Product[];
  onAddProduct: () => void;
  onDeleteProduct: (productId: string) => Promise<void>;
};

export function CompanyProducts({
  products,
  onAddProduct,
  onDeleteProduct,
}: CompanyProductsProps) {
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [deletingProductId, setDeletingProductId] = useState("");

  async function handleConfirmDeleteProduct() {
    if (!productToDelete || deletingProductId) {
      return;
    }

    setDeletingProductId(productToDelete.id);

    try {
      await onDeleteProduct(productToDelete.id);
      setProductToDelete(null);
    } catch {
      // The parent page shows the error message.
    } finally {
      setDeletingProductId("");
    }
  }

  return (
    <Panel>
      <PanelHeader
        title="Produkter og tjenester"
        description="Produkter som kan brukes på fakturaer til dette selskapet."
        action={
          <AnimatedIconButton icon={Plus} onClick={onAddProduct}>
            Nytt produkt
          </AnimatedIconButton>
        }
      />

      {products.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            title="Ingen produkter"
            description="Trykk på «Nytt produkt» for å registrere det første produktet."
          />
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-blue-100 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-3 pr-4 font-semibold">Navn</th>
                <th className="py-3 pr-4 font-semibold">Enhet</th>
                <th className="py-3 pr-4 text-right font-semibold">Pris</th>
                <th className="py-3 pr-4 text-right font-semibold">MVA</th>
                <th className="py-3 pr-4 text-right font-semibold">Status</th>
                <th className="py-3 text-right font-semibold">Handling</th>
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
                  <td className="py-3 pr-4 text-right font-medium text-slate-950">
                    {formatCurrency(product.unit_price)}
                  </td>
                  <td className="py-3 pr-4 text-right text-slate-600">{product.vat_rate}%</td>
                  <td className="py-3 pr-4 text-right">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        product.is_active
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {product.is_active ? "Aktiv" : "Inaktiv"}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <AnimatedIconButton
                      icon={Trash2}
                      iconSize={16}
                      size="xs"
                      variant="danger"
                      onClick={() => setProductToDelete(product)}
                      disabled={deletingProductId === product.id}
                      aria-label={`Slett ${product.name}`}
                    >
                      Slett
                    </AnimatedIconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(productToDelete)}
        title="Slett produkt"
        message={`Slette ${productToDelete?.name ?? "produktet"}? Produktet fjernes fra listen, men gamle fakturaer beholder linjene sine.`}
        confirmLabel={deletingProductId ? "Sletter..." : "Slett"}
        tone="danger"
        loading={Boolean(deletingProductId)}
        onCancel={() => setProductToDelete(null)}
        onConfirm={() => void handleConfirmDeleteProduct()}
      />
    </Panel>
  );
}
