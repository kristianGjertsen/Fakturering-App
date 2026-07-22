import { Modal } from "../../../components/layout/Modal";
import type { ProductInput } from "../../../lib/data";
import { NewProductForm } from "./NewProductForm";

type NewProductDialogProps = {
  open: boolean;
  companyId: string;
  companyName: string;
  onClose: () => void;
  onCreateProduct: (input: ProductInput) => Promise<void>;
  onMessage: (message: string) => void;
};

export function NewProductDialog({
  open,
  companyId,
  companyName,
  onClose,
  onCreateProduct,
  onMessage,
}: NewProductDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nytt produkt"
      description={`Produktet blir knyttet til ${companyName}.`}
      labelledBy="new-product-title"
    >
      <NewProductForm
        companyId={companyId}
        onCreateProduct={onCreateProduct}
        onMessage={onMessage}
        onCreated={onClose}
        onCancel={onClose}
      />
    </Modal>
  );
}
