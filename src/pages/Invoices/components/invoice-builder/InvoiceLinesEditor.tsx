import { Plus, Trash2 } from "@animateicons/react/lucide";
import { useEffect, useRef, useState } from "react";
import type { InvoiceDraftLine, Product } from "../../../../types";
import {
  ATTACHMENT_ACCEPT,
  attachmentFileName,
  attachmentReference,
  formatFileSize,
} from "../../../../lib/attachments";
import { formatCurrency } from "../../../../lib/format";
import { calculateLine, toNumber } from "../../../../lib/invoiceMath";
import { Button } from "../../../../components/Button";
import { AnimatedIconButton } from "../../../../components/AnimatedIconButton";
import { FormField } from "../../../../components/FormField";
import { Input, inputClass } from "../../../../components/Input";
import { Select } from "../../../../components/Select";
import { Panel } from "../../../../components/layout/Panel";
import { isSubmittableInvoiceLine } from "../../invoiceBuilderModel";

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
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  const [openLineId, setOpenLineId] = useState<string | null>(lines[0]?.localId ?? null);
  const knownLineIds = useRef(new Set(lines.map((line) => line.localId)));

  useEffect(() => {
    const addedLine = lines.find((line) => !knownLineIds.current.has(line.localId));

    if (addedLine) {
      setOpenLineId(addedLine.localId);
    } else {
      setOpenLineId((current) =>
        current && lines.some((line) => line.localId === current) ? current : null
      );
    }

    knownLineIds.current = new Set(lines.map((line) => line.localId));
  }, [lines]);

  return (
    <Panel>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-950">Fakturalinjer</h3>
          <p className="text-sm text-slate-600">Velg lagrede produkter eller skriv inn manuelle linjer.</p>
        </div>
        <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
          <AnimatedIconButton icon={Plus} className="w-full sm:w-auto" variant="secondary" onClick={onAddLine}>
            Legg til linje
          </AnimatedIconButton>
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
          <AnimatedIconButton
            icon={Plus}
            className="w-full sm:w-auto"
            variant="secondary"
            onClick={() => document.getElementById("new-line-attachments")?.click()}
          >
            Legg til linje med vedlegg
          </AnimatedIconButton>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {lines.map((line, lineIndex) => (
          <InvoiceLineCard
            key={line.localId}
            line={line}
            lineIndex={lineIndex}
            open={openLineId === line.localId}
            onOpenChange={(open) => setOpenLineId(open ? line.localId : null)}
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
  open,
  products,
  onAddAttachments,
  onOpenChange,
  onRemoveAttachment,
  onRemoveLine,
  onUpdateLine,
}: InvoiceLineCardProps) {
  const calculatedLine = calculateLine(line);
  const editorId = `invoice-line-editor-${line.localId}`;
  const selectedProduct = products.find((product) => product.id === line.productId);
  const lineName = (selectedProduct?.name ?? line.description.trim()) || `Ny fakturalinje ${lineIndex + 1}`;

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
    <div className="overflow-hidden rounded-lg border border-blue-100 bg-white">
      <div className={`flex items-center ${open ? "bg-blue-50" : "bg-white"}`}>
        <button
          type="button"
          className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] items-start gap-2 px-3 py-3 text-left transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400 min-[420px]:grid-cols-[minmax(0,1fr)_auto] min-[420px]:items-center sm:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] sm:gap-3 sm:px-4"
          aria-expanded={open}
          aria-controls={editorId}
          onClick={() => onOpenChange(!open)}
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-slate-950">
              {lineName}
            </span>
            <span className="mt-0.5 block text-xs text-slate-500 sm:hidden">
              {line.quantity} {line.unit || "stk"} · {formatCurrency(line.unitPrice)} · MVA {line.vatRate}%
            </span>
            {line.attachments.length > 0 && (
              <span className="mt-0.5 block text-xs text-slate-500">
                {line.attachments.length} vedlegg
              </span>
            )}
          </span>
          <span className="hidden whitespace-nowrap text-sm text-slate-600 sm:block">
            {line.quantity} {line.unit || "stk"}
          </span>
          <span className="hidden whitespace-nowrap text-sm text-slate-600 sm:block">
            {formatCurrency(line.unitPrice)}
          </span>
          <span className="hidden whitespace-nowrap text-sm text-slate-600 sm:block">
            MVA {line.vatRate}%
          </span>
          <span className="flex items-center justify-between gap-3 min-[420px]:justify-start">
            <span className="whitespace-nowrap text-sm font-semibold text-slate-950">
              {formatCurrency(calculatedLine.line_total)}
            </span>
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m5 7.5 5 5 5-5" />
            </svg>
          </span>
        </button>
        <AnimatedIconButton
          icon={Trash2}
          iconSize={18}
          variant="danger"
          size="xs"
          className="mr-2 h-9 w-9 shrink-0 !p-0 shadow-sm sm:mr-3"
          onClick={() => onRemoveLine(line.localId)}
          aria-label={`Fjern linje ${lineIndex + 1}`}
          title="Fjern linje"
        >
          <span className="sr-only">Slett</span>
        </AnimatedIconButton>
      </div>

      {open && (
        <div id={editorId} className="min-w-0 space-y-3 border-t border-blue-100 bg-blue-50 p-3 sm:p-4">
          <FormField label="Produkt">
            <Select
              ariaLabel={`Produkt for fakturalinje ${lineIndex + 1}`}
              value={line.productId ?? ""}
              options={[
                { value: "", label: "Skriv inn produkt manuelt" },
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
          <div className="flex items-end">
            <div>
              <span className="text-sm font-medium text-slate-700">Sum</span>
              <p className="mt-3 text-sm font-semibold text-slate-950">
                {formatCurrency(calculatedLine.line_total)}
              </p>
            </div>
          </div>
        </div>

        <LineAttachments
          attachmentLineIndex={attachmentLineIndex}
          line={line}
          onAddAttachments={onAddAttachments}
          onRemoveAttachment={onRemoveAttachment}
        />

          <div className="flex justify-end">
            <Button className="w-full sm:w-auto" variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
              Ferdig
            </Button>
          </div>
        </div>
      )}
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
        <AnimatedIconButton
          icon={Plus}
          className="w-full sm:w-auto"
          variant="secondary"
          size="sm"
          onClick={() => document.getElementById(inputId)?.click()}
        >
          Legg til vedlegg
        </AnimatedIconButton>
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
