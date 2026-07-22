import { frequencyLabel } from "../../lib/format";
import type { InvoiceScheduleWithDetails } from "../../types";

export function getScheduleDisplayTitle(schedule: InvoiceScheduleWithDetails) {
  const genericTitle = `Gjentakende faktura - ${schedule.company?.name ?? ""}`;

  return schedule.title === genericTitle
    ? frequencyLabel(schedule.frequency ?? "monthly", schedule.interval_count)
    : schedule.title;
}
