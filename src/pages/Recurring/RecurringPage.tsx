import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DetailModal } from "../../components/layout/DetailModal";
import { DocumentBrowser, type DocumentBrowserItem } from "../../components/DocumentBrowser";
import { EmptyState } from "../../components/EmptyState";
import { SectionHeader } from "../../components/SectionHeader";
import { formatDate, frequencyLabel } from "../../lib/format";
import { calculateScheduleTotals } from "../../lib/schedulePreview";
import type { InvoiceScheduleWithDetails } from "../../types";
import { displayScheduleTitle, RecurringDetails } from "./RecurringComponents/RecurringDetails";

type RecurringViewProps = {
  schedules: InvoiceScheduleWithDetails[];
};

export default function RecurringPage({ schedules }: RecurringViewProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedScheduleId = searchParams.get("scheduleId") ?? "";
  const [selectedScheduleId, setSelectedScheduleId] = useState(requestedScheduleId);

  const browserItems = useMemo<DocumentBrowserItem[]>(() => schedules.map((schedule) => ({
    id: schedule.id,
    companyId: schedule.company_id,
    companyName: schedule.company?.name ?? "Ukjent bedrift",
    title: displayScheduleTitle(schedule),
    subtitle: frequencyLabel(schedule.frequency ?? "monthly", schedule.interval_count),
    statusLabel: schedule.auto_send ? "Automatisk" : "Manuell",
    statusTone: schedule.auto_send ? "info" : "neutral",
    amount: calculateScheduleTotals(schedule).total,
    date: schedule.next_run_at,
    dateLabel: `Neste: ${formatDate(schedule.next_run_at)}`,
  })), [schedules]);

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

  const selectedSchedule = schedules.find((schedule) => schedule.id === selectedScheduleId) ?? null;

  function selectSchedule(scheduleId: string) {
    const nextScheduleId = selectedScheduleId === scheduleId ? "" : scheduleId;
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

  function closeScheduleDetails() {
    setSelectedScheduleId("");
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("scheduleId");
      return next;
    }, { replace: true });
  }

  return (
    <>
      <SectionHeader
        title="Gjentakende fakturaer"
        description="Finn en plan etter bedrift, eller vis alle. Klikk på en plan for detaljer og PDF-forhåndsvisning."
      />

      {schedules.length === 0 ? (
        <EmptyState
          title="Ingen gjentakelser"
          description="Når du lager en faktura og slår på gjentakelse, vises planen her."
        />
      ) : (
        <DocumentBrowser
          items={browserItems}
          selectedId={selectedScheduleId}
          onSelect={selectSchedule}
          searchPlaceholder="Søk etter plan eller bedrift"
          itemLabel="planer"
        />
      )}

      <DetailModal
        open={Boolean(selectedSchedule)}
        onClose={closeScheduleDetails}
        ariaLabel={selectedSchedule
          ? `Detaljer for ${displayScheduleTitle(selectedSchedule)}`
          : "Detaljer for gjentakende plan"}
      >
        {selectedSchedule && <RecurringDetails schedule={selectedSchedule} />}
      </DetailModal>
    </>
  );
}
