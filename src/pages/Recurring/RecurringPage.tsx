import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DocumentBrowser, type DocumentBrowserItem } from "../../components/DocumentBrowser";
import { EmptyState } from "../../components/EmptyState";
import { SectionHeader } from "../../components/SectionHeader";
import { DetailModal } from "../../components/layout/DetailModal";
import { formatDate, frequencyLabel } from "../../lib/format";
import { calculateScheduleTotals } from "../../lib/schedulePreview";
import type { InvoiceScheduleWithDetails } from "../../types";
import { RecurringDetails } from "./components/RecurringDetails";
import { getScheduleDisplayTitle } from "./schedulePresentation";

type RecurringPageProps = {
  schedules: InvoiceScheduleWithDetails[];
};

export default function RecurringPage({ schedules }: RecurringPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedScheduleId = searchParams.get("scheduleId") ?? "";
  const [selectedScheduleId, setSelectedScheduleId] = useState(requestedScheduleId);
  const browserItems = useMemo(() => schedules.map(toScheduleBrowserItem), [schedules]);

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

  function selectSchedule(scheduleId: string) {
    updateSelection(selectedScheduleId === scheduleId ? "" : scheduleId);
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
        onClose={() => updateSelection("")}
        ariaLabel={selectedSchedule
          ? `Detaljer for ${getScheduleDisplayTitle(selectedSchedule)}`
          : "Detaljer for gjentakende plan"}
      >
        {selectedSchedule && <RecurringDetails schedule={selectedSchedule} />}
      </DetailModal>
    </>
  );
}

function toScheduleBrowserItem(schedule: InvoiceScheduleWithDetails): DocumentBrowserItem {
  return {
    id: schedule.id,
    companyId: schedule.company_id,
    companyName: schedule.company?.name ?? "Ukjent bedrift",
    title: getScheduleDisplayTitle(schedule),
    subtitle: frequencyLabel(schedule.frequency ?? "monthly", schedule.interval_count),
    statusLabel: schedule.auto_send ? "Automatisk" : "Manuell",
    statusTone: schedule.auto_send ? "info" : "neutral",
    amount: calculateScheduleTotals(schedule).total,
    date: schedule.next_run_at,
    dateLabel: `Neste: ${formatDate(schedule.next_run_at)}`,
  };
}
