import {
  referenceAttachmentsByLine,
} from "../_shared/attachment-references.ts";
import { blobToBase64 } from "../_shared/base64.ts";
import type {
  InvoiceItem,
  StoredAttachment,
  SupabaseClient,
} from "./types.ts";

export async function loadStoredAttachments(
  supabase: SupabaseClient,
  attachments: StoredAttachment[],
  lines: InvoiceItem[],
) {
  const referencedAttachments = referenceAttachmentsByLine(lines, attachments);

  return Promise.all(
    referencedAttachments.map(async ({ attachment, reference }) => {
      const { data, error } = await supabase.storage
        .from("invoice-attachments")
        .download(attachment.storage_path);

      if (error) {
        throw new Error(
          `Kunne ikke hente vedlegget ${attachment.original_name}: ${error.message}`,
        );
      }

      return {
        filename: `${reference} - ${attachment.original_name}`,
        content: await blobToBase64(data),
      };
    }),
  );
}
