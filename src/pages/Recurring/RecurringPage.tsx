import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "@animateicons/react/lucide";
import { AnimatedIconButton } from "../../components/AnimatedIconButton";
import { EmptyState } from "../../components/EmptyState";
import { SectionHeader } from "../../components/SectionHeader";
import { ConfirmDialog } from "../../components/layout/ConfirmDialog";
import { Notice } from "../../components/layout/Notice";
import { useDetailSelection } from "../../components/layout/useDetailSelection";
import { DetailModal } from "../../components/layout/DetailModal";
import { scheduleToPreviewInvoice } from "../../lib/schedulePreview";
import type { InvoiceScheduleWithDetails, Profile } from "../../types";
import { InvoiceDetails } from "../Invoices/components/view/InvoiceDetails";
import { InvoiceList } from "../Invoices/components/view/InvoiceList";
import { getScheduleDisplayTitle } from "./schedulePresentation";

type RecurringPageProps = {
  schedules: InvoiceScheduleWithDetails[];
  sellerProfile: Profile;
  onDeleteSchedule: (scheduleId: string) => Promise<void>;
};

export default function RecurringPage({ schedules, sellerProfile, onDeleteSchedule }: RecurringPageProps) {
  const [deleting, setDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const {
    selectedItem: selectedSchedule,
    selectedId: selectedScheduleId,
    updateSelection: updateScheduleSelection,
  } = useDetailSelection("scheduleId", schedules);
  const selectedListId = selectedScheduleId ? `schedule-preview-${selectedScheduleId}` : "";
  const selectedPreviewInvoice = useMemo(
    () => selectedSchedule ? scheduleToPreviewInvoice(selectedSchedule) : null,
    [selectedSchedule],
  );

  async function handleDeleteSchedule() {
    if (!selectedSchedule || deleting) return;
    setDeleting(true);
    setActionMessage("");
    try {
      await onDeleteSchedule(selectedSchedule.id);
      setShowDeleteDialog(false);
      updateSelection("");
    } catch (error) {
      setShowDeleteDialog(false);
      setActionMessage(error instanceof Error ? error.message : "Kunne ikke slette fakturaplanen. Prøv igjen.");
    } finally {
      setDeleting(false);
    }
  }

  function updateSelection(nextScheduleId: string) {
    setShowDeleteDialog(false);
    setActionMessage("");
    updateScheduleSelection(nextScheduleId);
  }

  function selectSchedule(listItemId: string) {
    const scheduleId = listItemId.startsWith("schedule-preview-")
      ? listItemId.slice("schedule-preview-".length)
      : listItemId;

    updateSelection(selectedScheduleId === scheduleId ? "" : scheduleId);
  }

  const navigate = useNavigate();

  return (
    <>
      <SectionHeader
        title="Gjentakende fakturaer"
        description="Gjentakende fakturaer lar deg sette opp automatiske faktureringer for kunder på faste intervaller."
        action={
          <AnimatedIconButton
            icon={Plus}
            variant="primary"
            size="sm"
            onClick={() => {
              navigate("/invoices", {
                state: {
                  openCreateForm: true,
                  invoiceKind: "recurring",
                },
              });
            }
            }
          >
            Ny gjentagende faktura
          </AnimatedIconButton>}
      />
      {
        schedules.length === 0 ? (
          <EmptyState
            title="Ingen gjentakelser"
            description="Når du lager en faktura og slår på gjentakelse, vises planen her."
          />
        ) : (
          <InvoiceList
            invoices={[]}
            schedules={schedules}
            selectedId={selectedListId}
            onSelect={selectSchedule}
            itemLabel="planer"
          />
        )
      }

      <DetailModal
        open={Boolean(selectedSchedule)}
        onClose={() => !deleting && updateSelection("")}
        title="Gjentagende fakturaplan"
        ariaLabel={selectedSchedule
          ? `Detaljer for ${getScheduleDisplayTitle(selectedSchedule)}`
          : "Detaljer for gjentakende plan"}
      >
        {actionMessage && <Notice className="mb-5">{actionMessage}</Notice>}
        {selectedSchedule && selectedPreviewInvoice && (
          <InvoiceDetails
            invoice={selectedPreviewInvoice}
            sellerProfile={sellerProfile}
            schedule={selectedSchedule}
            deleting={deleting}
            sending={false}
            updatingPaid={false}
            onDelete={() => setShowDeleteDialog(true)}
            onSend={() => undefined}
            onTogglePaid={() => undefined}
          />
        )}
      </DetailModal>
      <ConfirmDialog
        open={Boolean(selectedSchedule && showDeleteDialog)}
        title="Slett gjentakelse"
        message="Slette gjentakelsen? Alle fremtidige utsendinger fra planen stoppes. Fakturaer som allerede er opprettet, beholdes."
        confirmLabel={deleting ? "Sletter..." : "Slett gjentakelse"}
        tone="danger"
        loading={deleting}
        onCancel={() => !deleting && setShowDeleteDialog(false)}
        onConfirm={() => void handleDeleteSchedule()}
      />
    </>
  );
}
