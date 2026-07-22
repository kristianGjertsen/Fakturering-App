import { Panel } from "../../../components/layout/Panel";
import type { InvoiceWithDetails } from "../../../types";
import { InvoicePdfPreview } from "./InvoicePdfPreview";

type InvoicePdfPreviewPanelProps = {
  invoice: InvoiceWithDetails;
  className?: string;
};

export function InvoicePdfPreviewPanel({ invoice, className = "" }: InvoicePdfPreviewPanelProps) {
  return (
    <Panel as="div" className={`mx-auto w-full max-w-md ${className}`.trim()}>
      <InvoicePdfPreview invoice={invoice} />
    </Panel>
  );
}
