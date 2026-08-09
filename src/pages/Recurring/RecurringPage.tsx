import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus } from "@animateicons/react/lucide";
import { AnimatedIconButton } from "../../components/AnimatedIconButton";
import { EmptyState } from "../../components/EmptyState";
import { SectionHeader } from "../../components/SectionHeader";
import { DetailModal } from "../../components/layout/DetailModal";
import { scheduleToPreviewInvoice } from "../../lib/schedulePreview";
import type { InvoiceScheduleWithDetails, Profile } from "../../types";
import { InvoiceDetails } from "../Invoices/components/view/InvoiceDetails";
import { InvoiceList } from "../Invoices/components/view/InvoiceList";
import { getScheduleDisplayTitle } from "./schedulePresentation";

type RecurringPageProps = {
  schedules: InvoiceScheduleWithDetails[];
  sellerProfile: Profile;
};

export default function RecurringPage({ schedules, sellerProfile }: RecurringPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedScheduleId = searchParams.get("scheduleId") ?? "";
  const [selectedScheduleId, setSelectedScheduleId] = useState(requestedScheduleId);

  useEffect(() => {
    if (
      requestedScheduleId &&
      requestedScheduleId !== selectedScheduleId &&
      schedules.some((schedule) => schedule.id === requestedScheduleId)
    ) {
      setSelectedScheduleId(requestedScheduleId);
      return;
    }

    if (
      selectedScheduleId &&
      !schedules.some((schedule) => schedule.id === selectedScheduleId)
    ) {
      setSelectedScheduleId("");
    }
  }, [requestedScheduleId, schedules, selectedScheduleId]);

  const selectedSchedule =
    schedules.find((schedule) => schedule.id === selectedScheduleId) ?? null;
  const selectedListId = selectedScheduleId ? `schedule-preview-${selectedScheduleId}` : "";
  const selectedPreviewInvoice = useMemo(
    () => selectedSchedule ? scheduleToPreviewInvoice(selectedSchedule) : null,
    [selectedSchedule],
  );

  function updateSelection(nextScheduleId: string) {
    setSelectedScheduleId(nextScheduleId);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);

      if (nextScheduleId) {
        next.set("scheduleId", nextScheduleId);
      } else {
        next.delete("scheduleId");
      }

      return next;
    }, { replace: true });
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
        onClose={() => updateSelection("")}
        title="Gjentagende fakturaplan"
        ariaLabel={selectedSchedule
          ? `Detaljer for ${getScheduleDisplayTitle(selectedSchedule)}`
          : "Detaljer for gjentakende plan"}
      >
        {selectedSchedule && selectedPreviewInvoice && (
          <InvoiceDetails
            invoice={selectedPreviewInvoice}
            sellerProfile={sellerProfile}
            schedule={selectedSchedule}
            deleting={false}
            sending={false}
            updatingPaid={false}
            onDelete={() => undefined}
            onSend={() => undefined}
            onTogglePaid={() => undefined}
          />
        )}
      </DetailModal>
    </>
  );
}
