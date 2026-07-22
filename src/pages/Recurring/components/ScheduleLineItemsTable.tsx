import { formatCurrency } from "../../../lib/format";
import type { InvoiceAttachment, InvoiceScheduleLine } from "../../../types";

type ReferencedAttachment = {
  attachment: InvoiceAttachment;
  reference: string;
};

type ScheduleLineItemsTableProps = {
  lines: InvoiceScheduleLine[];
  attachments: ReferencedAttachment[];
};

export function ScheduleLineItemsTable({
  lines,
  attachments,
}: ScheduleLineItemsTableProps) {
  return (
    <div className="mt-6 overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-blue-100 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="py-3 pr-4 font-semibold">Beskrivelse</th>
            <th className="py-3 pr-4 text-center font-semibold">Vedlegg</th>
            <th className="py-3 pr-4 text-right font-semibold">Antall</th>
            <th className="py-3 pr-4 text-right font-semibold">Pris</th>
            <th className="py-3 pr-4 text-right font-semibold">MVA</th>
            <th className="py-3 text-right font-semibold">Sum</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-blue-50">
          {lines.map((line) => {
            const references = attachments
              .filter(
                ({ attachment }) =>
                  attachment.invoice_item_id === `schedule-line-preview-${line.id}`,
              )
              .map(({ reference }) => reference);

            return (
              <tr key={line.id}>
                <td className="py-3 pr-4 font-medium text-slate-950">{line.description}</td>
                <td className="py-3 pr-4 text-center text-slate-600">
                  {references.length > 0 ? references.join(", ") : "NEI"}
                </td>
                <td className="py-3 pr-4 text-right text-slate-600">
                  {line.quantity} {line.unit}
                </td>
                <td className="py-3 pr-4 text-right text-slate-600">
                  {formatCurrency(line.unit_price)}
                </td>
                <td className="py-3 pr-4 text-right text-slate-600">{line.vat_rate}%</td>
                <td className="py-3 text-right font-medium text-slate-950">
                  {formatCurrency(
                    line.quantity * line.unit_price * (1 + line.vat_rate / 100),
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
