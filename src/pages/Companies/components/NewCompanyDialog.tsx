import { Modal } from "../../../components/layout/Modal";
import type { CompanyInput } from "../../../lib/data";
import { NewCompanyForm } from "./NewCompanyForm";

type NewCompanyDialogProps = {
  open: boolean;
  onClose: () => void;
  onCreateCompany: (input: CompanyInput) => Promise<void>;
  onMessage: (message: string) => void;
};

export function NewCompanyDialog({
  open,
  onClose,
  onCreateCompany,
  onMessage,
}: NewCompanyDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nytt selskap"
      description="Lagre kundeinformasjon for fakturaer, produkter og statistikk."
      labelledBy="new-company-title"
    >
      <NewCompanyForm
        onCreateCompany={onCreateCompany}
        onMessage={onMessage}
        onCreated={onClose}
        onCancel={onClose}
      />
    </Modal>
  );
}
