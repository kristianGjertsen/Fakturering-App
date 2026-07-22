import type { InvoiceDraftLine, Product } from "../../../types";
import {
  ATTACHMENT_ACCEPT,
  attachmentFileName,
  attachmentReference,
  formatFileSize,
} from "../../../lib/attachments";
import { formatCurrency } from "../../../lib/format";
import { calculateLine, toNumber } from "../../../lib/invoiceMath";
import { Button } from "../../../components/Button";
import { FormField } from "../../../components/FormField";
import { Input, inputClass } from "../../../components/Input";
import { Select } from "../../../components/Select";
import { Panel } from "../../../components/layout/Panel";
import { isSubmittableInvoiceLine } from "../invoiceBuilderModel";

type InvoiceLinesEditorProps = {
  lines: InvoiceDraftLine[];
  products: Product[];
  onAddLine: () => void;
  onAddLineWithAttachments: (files: FileList | null) => void;
  onAddAttachments: (lineId: string, files: FileList | null) => void;
  onRemoveAttachment: (lineId: string, attachmentId: string) => void;
  onRemoveLine: (lineId: string) => void;
  onUpdateLine: (lineId: string, patch: Partial<InvoiceDraftLine>) => void;
};

type InvoiceLineCardProps = Pick<
  InvoiceLinesEditorProps,
  "onAddAttachments" | "onRemoveAttachment" | "onRemoveLine" | "onUpdateLine" | "products"
> & {
  attachmentLineIndex: number;
  line: InvoiceDraftLine;
  lineIndex: number;
};

export function InvoiceLinesEditor({
  lines,
  products,
  onAddLine,
  onAddLineWithAttachments,
  onAddAttachments,
  onRemoveAttachment,
  onRemoveLine,
  onUpdateLine,
}: InvoiceLinesEditorProps) {
  return (
    <Panel>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-950">Fakturalinjer</h3>
          <p className="text-sm text-slate-600">Velg lagrede produkter eller skriv inn manuelle linjer.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onAddLine}>
            Legg til linje
          </Button>
          <input
            id="new-line-attachments"
            className="sr-only"
            type="file"
            accept={ATTACHMENT_ACCEPT}
            multiple
            onChange={(event) => {
              onAddLineWithAttachments(event.currentTarget.files);
              event.currentTarget.value = "";
            }}
          />
          <Button
            variant="secondary"
            onClick={() => document.getElementById("new-line-attachments")?.click()}
          >
            Legg til linje med vedlegg
          </Button>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {lines.map((line, lineIndex) => (
          <InvoiceLineCard
            key={line.localId}
            line={line}
            lineIndex={lineIndex}
            attachmentLineIndex={countSubmittableLines(lines.slice(0, lineIndex))}
            products={products}
            onAddAttachments={onAddAttachments}
            onRemoveAttachment={onRemoveAttachment}
            onRemoveLine={onRemoveLine}
            onUpdateLine={onUpdateLine}
          />
        ))}
      </div>
    </Panel>
  );
}

function InvoiceLineCard({
  attachmentLineIndex,
  line,
  lineIndex,
  products,
  onAddAttachments,
  onRemoveAttachment,
  onRemoveLine,
  onUpdateLine,
}: InvoiceLineCardProps) {
  const calculatedLine = calculateLine(line);

  function handleProductSelect(productId: string) {
    if (!productId) {
      onUpdateLine(line.localId, { productId: null });
      return;
    }

    const product = products.find((candidate) => candidate.id === productId);
    if (!product) return;

    onUpdateLine(line.localId, {
      productId: product.id,
      description: product.description ? `${product.name} - ${product.description}` : product.name,
      unit: product.unit,
      unitPrice: product.unit_price,
      vatRate: product.vat_rate,
    });
  }

  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
      <div className="min-w-0 space-y-3">
        <FormField label="Produkt">
          <Select
            ariaLabel={`Produkt for fakturalinje ${lineIndex + 1}`}
            value={line.productId ?? ""}
            options={[
              { value: "", label: "Manuell" },
              ...products.map((product) => ({ value: product.id, label: product.name })),
            ]}
            onChange={handleProductSelect}
          />
        </FormField>
        <FormField label="Tekst">
          <textarea
            className={`${inputClass} resize-y`}
            rows={2}
            value={line.description}
            onChange={(event) => onUpdateLine(line.localId, { description: event.target.value })}
            placeholder="Beskrivelse på fakturalinjen"
            required
          />
        </FormField>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)_minmax(125px,auto)]">
          <FormField label="Antall">
            <Input
              inputMode="decimal"
              value={line.quantity}
              onChange={(event) => onUpdateLine(line.localId, { quantity: toNumber(event.target.value, 1) })}
              required
            />
          </FormField>
          <FormField label="Enhet">
            <Input
              value={line.unit}
              onChange={(event) => onUpdateLine(line.localId, { unit: event.target.value })}
            />
          </FormField>
          <FormField label="Pris">
            <Input
              inputMode="decimal"
              value={line.unitPrice}
              onChange={(event) => onUpdateLine(line.localId, { unitPrice: toNumber(event.target.value) })}
              required
            />
          </FormField>
          <FormField label="MVA">
            <Input
              inputMode="decimal"
              value={line.vatRate}
              onChange={(event) => onUpdateLine(line.localId, { vatRate: toNumber(event.target.value, 25) })}
              required
            />
          </FormField>
          <div className="flex items-end justify-between gap-2">
            <div>
              <span className="text-sm font-medium text-slate-700">Sum</span>
              <p className="mt-3 text-sm font-semibold text-slate-950">
                {formatCurrency(calculatedLine.line_total)}
              </p>
            </div>
            <Button
              variant="danger"
              size="xs"
              className="h-9 w-9 shrink-0 rounded-md !bg-red-500 !p-0 !text-black hover:!bg-red-600"
              onClick={() => onRemoveLine(line.localId)}
              aria-label={`Fjern linje ${lineIndex + 1}`}
              title="Fjern linje"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-5 w-5 text-black"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"
                />
              </svg>
            </Button>
          </div>
        </div>

        <LineAttachments
          attachmentLineIndex={attachmentLineIndex}
          line={line}
          onAddAttachments={onAddAttachments}
          onRemoveAttachment={onRemoveAttachment}
        />
      </div>
    </div>
  );
}

function LineAttachments({
  attachmentLineIndex,
  line,
  onAddAttachments,
  onRemoveAttachment,
}: Pick<InvoiceLineCardProps, "attachmentLineIndex" | "line" | "onAddAttachments" | "onRemoveAttachment">) {
  const inputId = `line-attachments-${line.localId}`;

  return (
    <div className="border-t border-blue-100 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-slate-700">
            Vedlegg{line.attachments.length > 0 ? ` x${line.attachments.length}` : ""}
          </p>
          <p className="text-xs text-slate-500">PDF, JPG eller PNG. Maks 10 MB per fil.</p>
        </div>
        <input
          id={inputId}
          className="sr-only"
          type="file"
          accept={ATTACHMENT_ACCEPT}
          multiple
          onChange={(event) => {
            onAddAttachments(line.localId, event.currentTarget.files);
            event.currentTarget.value = "";
          }}
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => document.getElementById(inputId)?.click()}
        >
          Legg til vedlegg
        </Button>
      </div>

      {line.attachments.length > 0 && (
        <ul className="mt-3 divide-y divide-blue-100 rounded-md border border-blue-100 bg-white px-3">
          {line.attachments.map((attachment, attachmentIndex) => {
            const reference = attachmentReference(attachmentLineIndex, attachmentIndex);

            return (
              <li
                key={attachment.localId}
                className="flex min-w-0 items-center justify-between gap-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-slate-800">
                    {attachmentFileName(attachment.file.name, reference)}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {formatFileSize(attachment.file.size)}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => onRemoveAttachment(line.localId, attachment.localId)}
                  aria-label={`Fjern ${attachment.file.name}`}
                >
                  Fjern
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function countSubmittableLines(lines: InvoiceDraftLine[]) {
  return lines.filter(isSubmittableInvoiceLine).length;
}
