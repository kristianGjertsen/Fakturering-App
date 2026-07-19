import { useState } from "react";
import { Button } from "../../../components/Button";
import { statusToneClasses } from "../../../components/DocumentBrowser";
import {
  attachmentFileName,
  formatFileSize,
  referenceInvoiceAttachments,
} from "../../../lib/attachments";
import { countryLabel } from "../../../lib/countries";
import { downloadInvoiceAttachment } from "../../../lib/data";
import { formatCurrency, formatDate } from "../../../lib/format";
import type { InvoiceScheduleWithDetails, InvoiceWithDetails } from "../../../types";
import { invoiceStatusLabels, invoiceStatusTone } from "./InvoiceList";
import { PdfPreviewPanel } from "./PdfPreviewPanel";
import { Panel } from "../../../components/layout/Panel";

type InvoiceDetailsProps = {
  invoice: InvoiceWithDetails;
  schedule: InvoiceScheduleWithDetails | null;
  deleting: boolean;
  sending: boolean;
  updatingPaid: boolean;
  onDelete: () => void;
  onSend: (action: "send" | "remind") => void;
  onTogglePaid: () => void;
};

export function InvoiceDetails({
  invoice,
  schedule,
  deleting,
  sending,
  updatingPaid,
  onDelete,
  onSend,
  onTogglePaid,
}: InvoiceDetailsProps) {
  const [attachmentMessage, setAttachmentMessage] = useState("");
  const attachments = referenceInvoiceAttachments(
    invoice.invoice_items ?? [],
    invoice.invoice_attachments ?? [],
  );

  async function handleDownload(
    attachment: NonNullable<InvoiceWithDetails["invoice_attachments"]>[number],
    reference: string,
  ) {
    setAttachmentMessage("");

    try {
      await downloadInvoiceAttachment(attachment, reference);
    } catch (error) {
      setAttachmentMessage(
        error instanceof Error ? error.message : `Kunne ikke laste ned ${attachment.original_name}.`
      );
    }
  }

  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-2 lg:items-start">
      <Panel as="div">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">
              {invoice.title || invoice.invoice_number}
            </h3>
            <p className="text-sm font-medium text-slate-700">{invoice.invoice_number}</p>
            <p className="text-sm text-slate-600">{invoice.company?.name ?? invoice.recipient_name}</p>
            {(invoice.company?.address || invoice.company?.postal_address) && (
              <p className="text-sm text-slate-600">
                {[invoice.company?.address, invoice.company?.postal_address].filter(Boolean).join(", ")}
              </p>
            )}
            {(invoice.company?.org_number ?? invoice.recipient_org_number) && (
              <p className="text-sm text-slate-600">Org.nr. {invoice.company?.org_number ?? invoice.recipient_org_number}</p>
            )}
            {(invoice.company?.country ?? invoice.recipient_country) && (
              <p className="text-sm text-slate-600">{countryLabel(invoice.company?.country ?? invoice.recipient_country)}</p>
            )}
            <p className="text-sm text-slate-600">{invoice.company?.email ?? invoice.recipient_email ?? "!Mangler e-post!"}</p>
          </div>
          <div className="flex flex-col items-start gap-3 sm:items-end">
            <p className="text-2xl font-semibold text-slate-950">{formatCurrency(invoice.total)}</p>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
              statusToneClasses[schedule ? "purple" : invoiceStatusTone(invoice.status, invoice.paid)]
            }`}>
              {schedule ? "Planlagt" : invoice.paid ? "Betalt" : invoiceStatusLabels[invoice.status] ?? invoice.status}
            </span>
            <div className="flex flex-wrap gap-2">
              {schedule ? (
                <Button variant="secondary" disabled>Planlagt</Button>
              ) : (
                <Button
                  variant={invoice.paid ? "secondary" : "success"}
                  onClick={onTogglePaid}
                  disabled={updatingPaid}
                >
                  {updatingPaid ? "Oppdaterer..." : invoice.paid ? "Marker som ubetalt" : "Marker som betalt"}
                </Button>
              )}
              {!schedule && (invoice.status === "draft" || invoice.status === "ready") && (
                <Button onClick={() => onSend("send")} disabled={sending}>
                  {sending ? "Sender..." : "Send faktura"}
                </Button>
              )}
              {!schedule && invoice.status === "sent" && (
                <Button variant="danger" onClick={() => onSend("remind")} disabled={sending}>
                  {sending ? "Sender..." : "Purre"}
                </Button>
              )}
              {!schedule && (
                <Button variant="danger" onClick={onDelete} disabled={deleting}>
                  {deleting ? "Sletter..." : "Slett faktura"}
                </Button>
              )}
            </div>
          </div>
        </div>

        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <InfoItem label="Fakturadato" value={formatDate(invoice.issue_date)} />
          <InfoItem label="Forfall" value={formatDate(invoice.due_date)} />
          <InfoItem
            label="Type"
            value={schedule ? "Planlagt engangsutsending" : invoice.schedule_id ? "Gjentakende faktura" : "Enkeltfaktura"}
          />
          {schedule && <InfoItem label="Planlagt utsending" value={formatDate(schedule.next_run_at)} />}
        </dl>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-blue-100 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-3 pr-4 font-semibold">Tekst</th>
                <th className="py-3 pr-4 text-center font-semibold">Vedlegg</th>
                <th className="py-3 pr-4 text-right font-semibold">Antall</th>
                <th className="py-3 pr-4 text-right font-semibold">Pris</th>
                <th className="py-3 pr-4 text-right font-semibold">MVA</th>
                <th className="py-3 pr-4 text-right font-semibold">Sum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-blue-50">
              {[...(invoice.invoice_items ?? [])]
                .sort((left, right) => left.sort_order - right.sort_order)
                .map((item) => {
                  const references = attachments
                    .filter(({ attachment }) => attachment.invoice_item_id === item.id)
                    .map(({ reference }) => reference);

                  return (
                    <tr key={item.id}>
                      <td className="py-3 pr-4 font-medium text-slate-950">
                        {item.description}
                      </td>
                      <td className="py-3 pr-4 text-center text-slate-600">
                        {references.length > 0 ? references.join(", ") : "NEI"}
                      </td>
                      <td className="py-3 pr-4 text-right text-slate-600">{item.quantity} {item.unit}</td>
                      <td className="py-3 pr-4 text-right text-slate-600">{formatCurrency(item.unit_price)}</td>
                      <td className="py-3 pr-4 text-right text-slate-600">{item.vat_rate}%</td>
                      <td className="py-3 pr-4 text-right font-medium text-slate-950">{formatCurrency(item.line_total)}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {attachments.length > 0 && (
          <div className="mt-5 border-t border-blue-100 pt-4">
            <h4 className="text-sm font-semibold text-slate-950">
              Vedlegg x{attachments.length}
            </h4>
            <ul className="mt-2 divide-y divide-blue-100 rounded-md border border-blue-100">
              {attachments.map(({ attachment, reference }) => (
                <li key={attachment.id} className="flex min-w-0 items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-slate-800">
                      {attachmentFileName(attachment.original_name, reference)}
                    </span>
                    <span className="block text-xs text-slate-500">{formatFileSize(attachment.size_bytes)}</span>
                  </span>
                  <Button variant="secondary" size="xs" onClick={() => void handleDownload(attachment, reference)}>
                    Last ned
                  </Button>
                </li>
              ))}
            </ul>
            {attachmentMessage && <p className="mt-2 text-sm text-red-700">{attachmentMessage}</p>}
          </div>
        )}
      </Panel>

      <PdfPreviewPanel invoice={invoice} className="lg:sticky lg:top-12" />
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-1 font-medium text-slate-950">{value}</dd>
    </div>
  );
}
