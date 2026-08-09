import type {
  InvoiceScheduleWithDetails,
  InvoiceWithDetails,
} from "../../../../types";
import { getVisibleInvoices } from "../../invoicePresentation";
import { CompactInvoiceList } from "./CompactInvoiceList";
import { FullInvoiceList } from "./FullInvoiceList";
import { buildInvoiceListItems } from "./invoiceListItems";

type InvoiceListProps = {
  invoices: InvoiceWithDetails[];
  schedules?: InvoiceScheduleWithDetails[];
  selectedId: string;
  onSelect: (invoiceId: string) => void;
  onMarkPaid?: (invoiceId: string) => void;
  markingPaidId?: string;
  compact?: boolean;
  itemLabel?: string;
  limit?: number;
};

export function InvoiceList({
  invoices,
  schedules = [],
  selectedId,
  onSelect,
  onMarkPaid,
  markingPaidId = "",
  compact = false,
  itemLabel = "fakturaer",
  limit,
}: InvoiceListProps) {
  const visibleInvoices = getVisibleInvoices(invoices);
  const listItems = buildInvoiceListItems(visibleInvoices, schedules);
  const displayedItems = typeof limit === "number" ? listItems.slice(0, limit) : listItems;

  if (compact) {
    return <CompactInvoiceList items={displayedItems} onSelect={onSelect} />;
  }

  return (
    <FullInvoiceList
      items={displayedItems}
      selectedId={selectedId}
      onSelect={onSelect}
      onMarkPaid={onMarkPaid}
      markingPaidId={markingPaidId}
      itemLabel={itemLabel}
    />
  );
}
