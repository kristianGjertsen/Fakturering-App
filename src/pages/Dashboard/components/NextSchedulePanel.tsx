import { Panel } from "../../../components/layout/Panel";
import { formatDate } from "../../../lib/format";
import type { InvoiceScheduleWithDetails } from "../../../types";

type NextSchedulePanelProps = {
  schedule?: InvoiceScheduleWithDetails;
};

export function NextSchedulePanel({ schedule }: NextSchedulePanelProps) {
  return (
    <Panel as="div">
      <h2 className="text-lg font-semibold text-slate-950">Neste gjentakelse</h2>
      {schedule ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-slate-600">{schedule.company?.name}</p>
          <p className="text-2xl font-semibold text-slate-950">
            {formatDate(schedule.next_run_at)}
          </p>
          <p className="text-sm text-slate-600">{schedule.title}</p>
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-600">
          Ingen aktive gjentakende fakturaer er planlagt.
        </p>
      )}
    </Panel>
  );
}
