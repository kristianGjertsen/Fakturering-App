type LineWithSortOrder = {
  id: string;
  sort_order?: number;
};

type AttachmentWithLine = {
  id: string;
  created_at: string;
  invoice_item_id: string;
};

export function attachmentReference(lineIndex: number, attachmentIndex: number) {
  return `${lineLetter(lineIndex)}${attachmentIndex + 1}`;
}

export function referenceAttachmentsByLine<
  TLine extends LineWithSortOrder,
  TAttachment extends AttachmentWithLine,
>(lines: TLine[], attachments: TAttachment[]) {
  const sortedLines = [...lines].sort(
    (left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0),
  );
  const lineIndexes = new Map(sortedLines.map((line, index) => [line.id, index]));
  const attachmentIndexes = new Map<string, number>();

  return [...attachments]
    .sort((left, right) => {
      const lineDifference =
        (lineIndexes.get(left.invoice_item_id) ?? Number.MAX_SAFE_INTEGER)
        - (lineIndexes.get(right.invoice_item_id) ?? Number.MAX_SAFE_INTEGER);

      return lineDifference
        || left.created_at.localeCompare(right.created_at)
        || left.id.localeCompare(right.id);
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
