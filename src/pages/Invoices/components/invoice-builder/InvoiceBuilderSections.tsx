import type { Dispatch, SetStateAction } from "react";
import type { RepeatDraft } from "../../../../types";
import { formatCurrency } from "../../../../lib/format";
import { Button } from "../../../../components/Button";
import { FormField } from "../../../../components/FormField";
import { Input } from "../../../../components/Input";
import { Select } from "../../../../components/Select";
import { Modal } from "../../../../components/layout/Modal";
import { Panel } from "../../../../components/layout/Panel";
import type { InvoiceKind, InvoiceTotals } from "../../invoiceBuilderModel";

type InvoiceTypePanelProps = {
  value: InvoiceKind;
  open: boolean;
  recurringDisabled: boolean;
  onChange: (invoiceKind: InvoiceKind) => void;
  onClose: () => void;
};

type InvoiceCreationTimingProps = {
  scheduled: boolean;
  onChange: (scheduled: boolean) => void;
};

type InvoiceRecurrencePanelProps = {
  embedded?: boolean;
  repeat: RepeatDraft;
  onChange: Dispatch<SetStateAction<RepeatDraft>>;
};

const RECURRENCE_OPTIONS = [
  { value: "weekly:1", label: "Hver uke" },
  { value: "monthly:1", label: "Hver måned" },
  { value: "monthly:2", label: "Annenhver måned" },
  { value: "monthly:3", label: "Hver 3. måned" },
  { value: "monthly:6", label: "Hver 6. måned" },
  { value: "monthly:12", label: "Hvert år" },
] as const;

const WEEKDAY_OPTIONS = [
  { value: 1, label: "Mandag" },
  { value: 2, label: "Tirsdag" },
  { value: 3, label: "Onsdag" },
  { value: 4, label: "Torsdag" },
  { value: 5, label: "Fredag" },
  { value: 6, label: "Lørdag" },
  { value: 7, label: "Søndag" },
] as const;

export function InvoiceTypePanel({
  value,
  open,
  recurringDisabled,
  onChange,
  onClose,
}: InvoiceTypePanelProps) {
  function selectInvoiceKind(invoiceKind: InvoiceKind) {
    onChange(invoiceKind);
    onClose();
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Velg fakturatype"
        description="Velg om fakturaen skal opprettes én gang eller gjentas automatisk."
        labelledBy="invoice-type-dialog-title"
      >
        <div className="grid gap-3">
          <button
            type="button"
            className={`rounded-lg border p-4 text-left transition hover:border-blue-400 hover:bg-blue-50 ${value === "single" ? "border-blue-500 bg-blue-50" : "border-blue-100"
              }`}
            onClick={() => selectInvoiceKind("single")}
          >
            <span className="block font-semibold text-slate-950">Enkeltfaktura</span>
            <span className="mt-1 block text-sm text-slate-600">
              Opprettes nå med valgt fakturadato og betalingsfrist.
            </span>
          </button>
          <button
            type="button"
            className={`rounded-lg border p-4 text-left transition hover:border-blue-400 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 ${value === "recurring" ? "border-blue-500 bg-blue-50" : "border-blue-100"
              }`}
            disabled={recurringDisabled}
            onClick={() => selectInvoiceKind("recurring")}
          >
            <span className="block font-semibold text-slate-950">Gjentakende faktura</span>
            <span className="mt-1 block text-sm text-slate-600">
              {recurringDisabled
                ? "Krever at du velger et registrert selskap."
                : "Lagrer planen. Fakturaen opprettes og dateres ved utsending."}
            </span>
          </button>
        </div>
      </Modal>
    </>
  );
}

export function InvoiceCreationTiming({
  scheduled,
  onChange,
}: InvoiceCreationTimingProps) {
  return (
    <div className={`mt-5 rounded-lg border p-4 ${scheduled ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-slate-50"
      }`}>
      <div className="flex flex-col gap-4 lg:flex-row justify-between lg:items-center">
        <p className="text-sm mt-4 text-slate-600">
          {scheduled
            ? "Fakturaen opprettes og sendes automatisk på neste dato."
            : "Fakturaen lagres som utkast og kan sendes manuelt senere."}
        </p>
        <div className="grid gap-2 sm:flex">
          <Button className="w-full sm:w-auto" variant={!scheduled ? "primary" : "secondary"} onClick={() => onChange(false)}>
            Lagre som utkast
          </Button>
          <Button className="w-full sm:w-auto" variant={scheduled ? "primary" : "secondary"} onClick={() => onChange(true)}>
            Planlegg utsendelse
          </Button>
        </div>
      </div>

    </div>
  );
}

export function InvoiceTotalsPanel({ totals }: { totals: InvoiceTotals }) {
  return (
    <Panel>
      <h3 className="text-base font-semibold text-slate-950">Summer</h3>
      <dl className="mt-4 space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-slate-600">Eks. mva</dt>
          <dd className="font-medium text-slate-950">{formatCurrency(totals.subtotal)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-600">MVA</dt>
          <dd className="font-medium text-slate-950">{formatCurrency(totals.vatTotal)}</dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-blue-100 pt-3 text-base">
          <dt className="font-semibold text-slate-950">Total</dt>
          <dd className="font-semibold text-slate-950">{formatCurrency(totals.total)}</dd>
        </div>
      </dl>
    </Panel>
  );
}

export function InvoiceRecurrencePanel({
  embedded = false,
  repeat,
  onChange,
}: InvoiceRecurrencePanelProps) {
  function updateRepeat(patch: Partial<RepeatDraft>) {
    onChange((currentRepeat) => ({ ...currentRepeat, ...patch }));
  }

  function updateRecurrence(value: string) {
    const [frequency, intervalCount] = value.split(":");

    updateRepeat({
      frequency: frequency as RepeatDraft["frequency"],
      intervalCount: Number(intervalCount),
    });
  }

  const recurrenceValue = `${repeat.frequency}:${repeat.intervalCount}`;

  const content = (
    <>
      <h3 className="text-sm font-semibold text-slate-950">Gjentakelse</h3>
      <p className="mt-1 text-sm text-slate-600">
        Velg hvor ofte fakturaen skal opprettes og sendes automatisk.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <FormField label="Hvor ofte">
          <Select
            ariaLabel="Hvor ofte fakturaen skal gjentas"
            value={recurrenceValue}
            options={RECURRENCE_OPTIONS}
            onChange={updateRecurrence}
          />
        </FormField>
        {repeat.frequency === "weekly" && (
          <FormField label="Ukedag">
            <Select
              ariaLabel="Ukedag"
              value={repeat.dayOfWeek}
              options={WEEKDAY_OPTIONS}
              onChange={(dayOfWeek) => updateRepeat({ dayOfWeek: Number(dayOfWeek) })}
            />
          </FormField>
        )}
        {repeat.frequency === "monthly" && (
          <FormField label="Dag i måned">
            <Input
              max={31}
              min={1}
              type="number"
              value={repeat.dayOfMonth}
              onChange={(event) => updateRepeat({
                dayOfMonth: Math.max(1, Math.min(31, Number(event.target.value))),
              })}
            />
          </FormField>
        )}
        <FormField label="Startdato">
          <Input
            type="date"
            value={repeat.startDate}
            onChange={(event) => updateRepeat({ startDate: event.target.value })}
          />
        </FormField>
        <FormField
          label="Forfall etter utsending"
          helper="Antall dager fra utsending til forfallsdato."
        >
          <Input
            type="number"
            min={0}
            max={365}
            value={repeat.paymentTermsDays}
            onChange={(event) => updateRepeat({
              paymentTermsDays: Math.max(0, Math.min(365, Number(event.target.value))),
            })}
          />
        </FormField>
      </div>
    </>
  );

  if (embedded) {
    return (
      <section className="mt-5 border-t border-blue-100 pt-5">
        {content}
      </section>
    );
  }

  return <Panel>{content}</Panel>;
}
