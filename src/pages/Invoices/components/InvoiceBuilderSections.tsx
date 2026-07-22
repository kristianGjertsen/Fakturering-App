import type { Dispatch, SetStateAction } from "react";
import type { RepeatDraft } from "../../../types";
import { formatCurrency } from "../../../lib/format";
import { Button } from "../../../components/Button";
import { FormField } from "../../../components/FormField";
import { Input } from "../../../components/Input";
import { Select } from "../../../components/Select";
import { Panel } from "../../../components/layout/Panel";
import type { InvoiceKind, InvoiceTotals } from "../invoiceBuilderModel";
import {
  getRepeatIntervalHint,
  getRepeatIntervalLabel,
} from "../invoiceBuilderModel";

type InvoiceTypePanelProps = {
  value: InvoiceKind;
  recurringDisabled: boolean;
  onChange: (invoiceKind: InvoiceKind) => void;
};

type InvoiceCreationTimingProps = {
  scheduled: boolean;
  onChange: (scheduled: boolean) => void;
};

type InvoiceRecurrencePanelProps = {
  repeat: RepeatDraft;
  onChange: Dispatch<SetStateAction<RepeatDraft>>;
};

const FREQUENCY_OPTIONS = [
  { value: "daily", label: "Daglig" },
  { value: "weekly", label: "Ukentlig" },
  { value: "monthly", label: "Månedlig" },
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
  recurringDisabled,
  onChange,
}: InvoiceTypePanelProps) {
  return (
    <Panel>
      <h3 className="text-base font-semibold text-slate-950">Type faktura</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className={`cursor-pointer rounded-lg border p-4 ${
          value === "single" ? "border-blue-500 bg-blue-50" : "border-blue-100"
        }`}>
          <Input
            className="mr-3"
            type="radio"
            name="invoiceKind"
            checked={value === "single"}
            onChange={() => onChange("single")}
          />
          <span className="font-semibold text-slate-950">Enkeltfaktura</span>
          <span className="mt-1 block text-sm text-slate-600">
            Opprettes nå med valgt fakturadato og betalingsfrist.
          </span>
        </label>
        <label className={`cursor-pointer rounded-lg border p-4 ${
          value === "recurring" ? "border-blue-500 bg-blue-50" : "border-blue-100"
        }`}>
          <Input
            className="mr-3"
            type="radio"
            name="invoiceKind"
            checked={value === "recurring"}
            disabled={recurringDisabled}
            onChange={() => onChange("recurring")}
          />
          <span className="font-semibold text-slate-950">Gjentakende faktura</span>
          <span className="mt-1 block text-sm text-slate-600">
            Lagrer bare planen. Fakturaen opprettes og dateres ved utsending.
          </span>
        </label>
      </div>
    </Panel>
  );
}

export function InvoiceCreationTiming({
  scheduled,
  onChange,
}: InvoiceCreationTimingProps) {
  return (
    <div className={`mt-5 rounded-lg border p-4 ${
      scheduled ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-slate-50"
    }`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h4 className="text-sm font-semibold text-slate-950">Når skal fakturaen opprettes?</h4>
          <p className="mt-1 text-sm text-slate-600">
            Lagre den med en gang, eller opprett og send den automatisk på fakturadatoen.
          </p>
        </div>
        <div
          className="grid shrink-0 grid-cols-2 gap-2 sm:flex"
          aria-label="Velg når fakturaen skal opprettes"
        >
          <Button variant={!scheduled ? "primary" : "secondary"} onClick={() => onChange(false)}>
            Lagre faktura uten å sende
          </Button>
          <Button variant={scheduled ? "primary" : "secondary"} onClick={() => onChange(true)}>
            Send på fakturadato
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
  repeat,
  onChange,
}: InvoiceRecurrencePanelProps) {
  function updateRepeat(patch: Partial<RepeatDraft>) {
    onChange((currentRepeat) => ({ ...currentRepeat, ...patch }));
  }

  return (
    <Panel>
      <h3 className="text-base font-semibold text-slate-950">Gjentakelse</h3>
      <p className="text-sm text-slate-600">
        Fakturaen opprettes og sendes automatisk på neste dato.
      </p>

      <div className="mt-4 space-y-4">
        <div className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-medium text-slate-800">
          {getRepeatIntervalLabel(repeat.frequency, repeat.intervalCount)}
        </div>
        <FormField label="Frekvens">
          <Select
            ariaLabel="Frekvens"
            value={repeat.frequency}
            options={FREQUENCY_OPTIONS}
            onChange={(frequency) => updateRepeat({
              frequency: frequency as RepeatDraft["frequency"],
            })}
          />
        </FormField>
        <FormField label="Gjentas hver" helper={getRepeatIntervalHint(repeat.frequency)}>
          <Input
            min={1}
            type="number"
            value={repeat.intervalCount}
            onChange={(event) => updateRepeat({
              intervalCount: Math.max(1, Number(event.target.value)),
            })}
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
    </Panel>
  );
}
