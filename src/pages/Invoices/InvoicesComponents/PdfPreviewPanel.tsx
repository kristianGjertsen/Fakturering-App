import { Panel } from "../../../components/layout/Panel";
import type { InvoiceWithDetails } from "../../../types";
import { PdfPreview } from "./PdfPreview";

type PdfPreviewPanelProps = {
  invoice: InvoiceWithDetails;
  className?: string;
};

export function PdfPreviewPanel({ invoice, className = "" }: PdfPreviewPanelProps) {
  return (
    <Panel as="div" className={`mx-auto w-full max-w-md ${className}`.trim()}>
      <PdfPreview invoice={invoice} />
    </Panel>
  );
}
