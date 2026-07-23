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
  compact?: boolean;
  limit?: number;
};

export function InvoiceList({
  invoices,
  schedules = [],
  selectedId,
  onSelect,
  compact = false,
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
    />
  );
}
