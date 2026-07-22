export const ATTACHMENT_BUCKET = "invoice-attachments";
export const ATTACHMENT_ACCEPT = "application/pdf,image/jpeg,image/png";
const MAX_ATTACHMENT_FILE_BYTES = 10 * 1024 * 1024;
const MAX_INVOICE_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const ALLOWED_ATTACHMENT_TYPES = new Set(ATTACHMENT_ACCEPT.split(","));

export function validateAttachmentFiles(files: File[], existingBytes = 0) {
  const unsupportedFile = files.find((file) => !ALLOWED_ATTACHMENT_TYPES.has(file.type));

  if (unsupportedFile) {
    return `${unsupportedFile.name} har et filformat som ikke støttes. Bruk PDF, JPG eller PNG.`;
  }

  const oversizedFile = files.find((file) => file.size <= 0 || file.size > MAX_ATTACHMENT_FILE_BYTES);

  if (oversizedFile) {
    return `${oversizedFile.name} må være større enn 0 byte og maksimalt 10 MB.`;
  }

  const selectedBytes = files.reduce((sum, file) => sum + file.size, 0);

  if (existingBytes + selectedBytes > MAX_INVOICE_ATTACHMENT_BYTES) {
    return "Vedleggene kan være maksimalt 20 MB totalt per faktura.";
  }

  return null;
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toLocaleString("nb-NO", {
    maximumFractionDigits: 1,
  })} MB`;
}

export function attachmentReference(lineIndex: number, attachmentIndex: number) {
  return `${lineLetter(lineIndex)}${attachmentIndex + 1}`;
}

export function attachmentFileName(originalName: string, reference: string) {
  return `${reference} - ${originalName}`;
}

export function referenceInvoiceAttachments<
  TLine extends { id: string; sort_order?: number },
  TAttachment extends {
    id: string;
    created_at: string;
    invoice_item_id: string;
  },
>(lines: TLine[], attachments: TAttachment[]) {
  const sortedLines = [...lines].sort(
    (left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0),
  );
  const lineIndexes = new Map(sortedLines.map((line, index) => [line.id, index]));
  const attachmentIndexes = new Map<string, number>();

  return [...attachments]
    .sort((left, right) => {
      const lineDifference =
        (lineIndexes.get(left.invoice_item_id) ?? Number.MAX_SAFE_INTEGER) -
        (lineIndexes.get(right.invoice_item_id) ?? Number.MAX_SAFE_INTEGER);

      return (
        lineDifference ||
        left.created_at.localeCompare(right.created_at) ||
        left.id.localeCompare(right.id)
      );
    })
    .map((attachment) => {
      const lineIndex = lineIndexes.get(attachment.invoice_item_id) ?? 0;
      const attachmentIndex = attachmentIndexes.get(attachment.invoice_item_id) ?? 0;
      attachmentIndexes.set(attachment.invoice_item_id, attachmentIndex + 1);

      return {
        attachment,
        reference: attachmentReference(lineIndex, attachmentIndex),
      };
    });
}

function lineLetter(index: number) {
  let value = index + 1;
  let result = "";

  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }

  return result;
}
