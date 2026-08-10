import { Panel } from "../../../../components/layout/Panel";
import type { InvoiceWithDetails, Profile } from "../../../../types";
import { InvoicePdfPreview } from "./InvoicePdfPreview";

type InvoicePdfPreviewPanelProps = {
  invoice: InvoiceWithDetails;
  sellerProfile: Profile;
  className?: string;
};

export function InvoicePdfPreviewPanel({ invoice, sellerProfile, className = "" }: InvoicePdfPreviewPanelProps) {
  return (
    <Panel as="div" className={`mx-auto w-full max-w-md ${className}`.trim()}>
      <InvoicePdfPreview invoice={invoice} sellerProfile={sellerProfile} />
    </Panel>
  );
}
