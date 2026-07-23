import {
  DocumentBrowser,
  type DocumentBrowserItem,
} from "../../../../components/DocumentBrowser";

type FullInvoiceListProps = {
  items: DocumentBrowserItem[];
  selectedId: string;
  onSelect: (invoiceId: string) => void;
};

export function FullInvoiceList({ items, selectedId, onSelect }: FullInvoiceListProps) {
  return (
    <DocumentBrowser
      items={items}
      selectedId={selectedId}
      onSelect={onSelect}
      searchPlaceholder="Søk etter faktura eller bedrift"
      itemLabel="fakturaer"
      calendarEnabled
    />
  );
}
