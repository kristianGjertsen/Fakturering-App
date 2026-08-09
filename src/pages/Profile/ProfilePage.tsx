import { useCallback, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { InvoiceWithDetails, Profile } from "../../types";
import { Button } from "../../components/Button";
import { SectionHeader } from "../../components/SectionHeader";
import { Notice } from "../../components/layout/Notice";
import { Modal } from "../../components/layout/Modal";
import { Panel } from "../../components/layout/Panel";
import { ConfirmDialog } from "../../components/layout/ConfirmDialog";
import { downloadAccountingExport } from "../../lib/accountingExport";
import { deleteCurrentUser } from "../../lib/data";
import {
  ProfileForm,
  type ProfileFeedbackTone,
} from "./components/ProfileForm";

type ProfilePageProps = {
  session: Session;
  profile: Profile;
  invoices: InvoiceWithDetails[];
  onSignOut: () => Promise<void>;
};

type Feedback = {
  message: string;
  tone: ProfileFeedbackTone;
};

export default function ProfilePage({ session, profile, invoices, onSignOut }: ProfilePageProps) {
  const [feedback, setFeedback] = useState<Feedback>({ message: "", tone: "info" });
  const [deleting, setDeleting] = useState(false);
  const [exportingAccounting, setExportingAccounting] = useState(false);
  const [showAccountingExportDialog, setShowAccountingExportDialog] = useState(false);
  const [showSignOutDialog, setShowSignOutDialog] = useState(false);
  const [showDeleteUserDialog, setShowDeleteUserDialog] = useState(false);
  const paidInvoiceCount = invoices.filter((invoice) => invoice.paid || invoice.status === "paid").length;

  const showFeedback = useCallback((message: string, tone: ProfileFeedbackTone) => {
    setFeedback({ message, tone });
  }, []);

  async function handleDeleteUser() {
    setDeleting(true);
    showFeedback("", "danger");

    try {
      await deleteCurrentUser();
      setShowDeleteUserDialog(false);
      await onSignOut();
    } catch (error) {
      showFeedback(
        error instanceof Error ? error.message : "Kunne ikke slette brukeren.",
        "danger",
      );
    } finally {
      setDeleting(false);
    }
  }

  async function handleAccountingExport() {
    setExportingAccounting(true);
    showFeedback("", "info");

    try {
      const exportedCount = await downloadAccountingExport(invoices, profile);
      setShowAccountingExportDialog(false);
      showFeedback(`Regnskapsgrunnlag er lastet ned med ${exportedCount} betalte fakturaer.`, "info");
    } catch (error) {
      showFeedback(
        error instanceof Error ? error.message : "Kunne ikke lage regnskapsgrunnlag.",
        "danger",
      );
    } finally {
      setExportingAccounting(false);
    }
  }

  return (
    <>
      <SectionHeader title="Profil" description="Brukerinformasjon og kontohandlinger." />

      {feedback.message && <Notice tone={feedback.tone}>{feedback.message}</Notice>}

      <ProfileForm
        userId={session.user.id}
        email={session.user.email ?? ""}
        onFeedback={showFeedback}
      />

      <Panel>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-950">Regnskapsgrunnlag</h3>
            <p className="mt-1 text-sm text-slate-600">
              Last ned ZIP med oversikter, faktura-PDF-er, fakturajournal og vedlegg.
            </p>
            <p className="mt-2 text-sm font-medium text-slate-700">
              {paidInvoiceCount} betalte fakturaer klare for eksport.
            </p>
          </div>
          <Button onClick={() => setShowAccountingExportDialog(true)}>
            Last ned ZIP
          </Button>
        </div>
      </Panel>

      <Panel>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Sist logget inn</dt>
            <dd className="mt-1 font-medium text-slate-950">
              {session.user.last_sign_in_at
                ? new Date(session.user.last_sign_in_at).toLocaleString("no-NO")
                : "Ukjent"}
            </dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setShowSignOutDialog(true)}>
            Logg ut
          </Button>
          <Button
            variant="danger"
            onClick={() => setShowDeleteUserDialog(true)}
            disabled={deleting}
          >
            {deleting ? "Sletter..." : "Slett bruker"}
          </Button>
        </div>
      </Panel>

      <Modal
        open={showAccountingExportDialog}
        onClose={() => setShowAccountingExportDialog(false)}
        title="Lag regnskapsgrunnlag"
        description="Kun fakturaer som er markert som betalt blir ført i eksporten."
        labelledBy="accounting-export-title"
      >
        <div className="space-y-5">
          <div className="rounded-md border border-blue-100 bg-blue-50 p-4 text-sm text-slate-700">
            ZIP-filen inneholder fakturaoversikt, fakturalinjer, betalinger, fakturajournal, faktura-PDF-er og vedlegg for betalte fakturaer.
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setShowAccountingExportDialog(false)}
              disabled={exportingAccounting}
            >
              Avbryt
            </Button>
            <Button
              onClick={() => void handleAccountingExport()}
              disabled={exportingAccounting}
            >
              {exportingAccounting ? "Lager ZIP..." : `Lag ZIP (${paidInvoiceCount})`}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={showSignOutDialog}
        title="Logg ut"
        message="Er du sikker på at du vil logge ut?"
        confirmLabel="Logg ut"
        tone="info"
        onCancel={() => setShowSignOutDialog(false)}
        onConfirm={() => void onSignOut()}
      />

      <ConfirmDialog
        open={showDeleteUserDialog}
        title="Slett bruker og all tilhørende data"
        message="Er du sikker på at du vil slette brukeren? Dette sletter kontoen og tilhørende data."
        confirmLabel={deleting ? "Sletter..." : "Slett bruker"}
        tone="danger"
        loading={deleting}
        onCancel={() => setShowDeleteUserDialog(false)}
        onConfirm={() => void handleDeleteUser()}
      />
    </>
  );
}
