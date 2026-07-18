import { useEffect, useMemo, useState } from "react";
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
  const [selectedScheduleId, setSelectedScheduleId] = useState("");

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
    if (selectedScheduleId && !schedules.some((schedule) => schedule.id === selectedScheduleId)) {
      setSelectedScheduleId("");
    }
  }, [schedules, selectedScheduleId]);

  const selectedSchedule = schedules.find((schedule) => schedule.id === selectedScheduleId) ?? null;

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
          onSelect={(scheduleId) => {
            setSelectedScheduleId((current) => current === scheduleId ? "" : scheduleId);
          }}
          searchPlaceholder="Søk etter plan eller bedrift"
          itemLabel="planer"
        />
      )}

      <DetailModal
        open={Boolean(selectedSchedule)}
        onClose={() => setSelectedScheduleId("")}
        ariaLabel={selectedSchedule
          ? `Detaljer for ${displayScheduleTitle(selectedSchedule)}`
          : "Detaljer for gjentakende plan"}
      >
        {selectedSchedule && <RecurringDetails schedule={selectedSchedule} />}
      </DetailModal>
    </>
  );
}
