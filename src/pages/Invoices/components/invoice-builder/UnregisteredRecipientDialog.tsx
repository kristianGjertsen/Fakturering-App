import { Button } from "../../../../components/Button";

type UnregisteredRecipientDialogProps = {
  open: boolean;
  onCancel: () => void;
  onCreateCompany: () => void;
  onContinue: () => void;
};

export function UnregisteredRecipientDialog({
  open,
  onCreateCompany,
  onContinue,
}: UnregisteredRecipientDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4" role="presentation">
      <section
        className="w-full max-w-md rounded-xl border border-blue-100 bg-white p-6 shadow-xl"
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

        <div className="mt-6 flex  gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onContinue}>Fortsett uten selskap</Button>
          <Button onClick={onCreateCompany}>Opprett selskap</Button>
        </div>
      </section>
    </div>
  );
}
