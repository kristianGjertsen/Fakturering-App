import { useState } from "react";
import { Button } from "../../../components/Button";
import { attachmentFileName, formatFileSize } from "../../../lib/attachments";
import { downloadInvoiceAttachment } from "../../../lib/data";
import type { InvoiceAttachment } from "../../../types";

type ReferencedAttachment = {
  attachment: InvoiceAttachment;
  reference: string;
};

type ScheduleAttachmentListProps = {
  attachments: ReferencedAttachment[];
};

export function ScheduleAttachmentList({ attachments }: ScheduleAttachmentListProps) {
  const [message, setMessage] = useState("");

  async function handleDownload(attachment: InvoiceAttachment, reference: string) {
    setMessage("");

    try {
      await downloadInvoiceAttachment(attachment, reference);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : `Kunne ikke laste ned ${attachment.original_name}.`,
      );
    }
  }

  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="mt-5 border-t border-blue-100 pt-4">
      <h4 className="text-sm font-semibold text-slate-950">Vedlegg x{attachments.length}</h4>
      <ul className="mt-2 divide-y divide-blue-100 rounded-md border border-blue-100">
        {attachments.map(({ attachment, reference }) => (
          <li
            key={attachment.id}
            className="flex min-w-0 items-center justify-between gap-3 px-3 py-2"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm text-slate-800">
                {attachmentFileName(attachment.original_name, reference)}
              </span>
              <span className="block text-xs text-slate-500">
                {formatFileSize(attachment.size_bytes)}
              </span>
            </span>
            <Button
              variant="secondary"
              size="xs"
              onClick={() => void handleDownload(attachment, reference)}
            >
              Last ned
            </Button>
          </li>
        ))}
      </ul>
      {message && <p className="mt-2 text-sm text-red-700">{message}</p>}
    </div>
  );
}
