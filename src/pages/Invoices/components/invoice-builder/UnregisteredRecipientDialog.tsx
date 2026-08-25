import { Button } from "../../../../components/Button";
import { ModalOverlay } from "../../../../components/layout/ModalOverlay";

type UnregisteredRecipientDialogProps = {
  open: boolean;
  onCancel: () => void;
  onCreateCompany: () => void;
  onContinue: () => void;
};

export function UnregisteredRecipientDialog({
  open,
  onCancel,
  onCreateCompany,
  onContinue,
}: UnregisteredRecipientDialogProps) {
  return (
    <ModalOverlay open={open} onClose={onCancel}>
      <section
        className="my-4 w-full max-w-md rounded-xl border border-blue-100 bg-white p-5 shadow-xl sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="unregistered-recipient-title"
      >
        <h2 id="unregistered-recipient-title" className="text-lg font-semibold text-slate-950">
          Vi anbefaler å registrere selskapet
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Et registrert selskap gir samlet fakturahistorikk, bedre statistikk, lagrede produkter og raskere oppretting av nye fakturaer.
        </p>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Du kan fortsatt lage en enkeltfaktura uten å lagre mottakeren. Da må du oppgi e-postadressen manuelt.
        </p>

        <div className="mt-6 grid gap-2 sm:flex sm:justify-end">
          <Button className="w-full sm:w-auto" variant="secondary" onClick={onContinue}>Fortsett uten selskap</Button>
          <Button className="w-full sm:w-auto" onClick={onCreateCompany}>Opprett selskap</Button>
        </div>
      </section>
    </ModalOverlay>
  );
}
