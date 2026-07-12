import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import type { Company, InvoiceDraftLine, Product, RepeatDraft } from "../../../types";
import type { InvoiceInput } from "../../../lib/data";
import { addMonthsInputValue, formatCurrency, todayInputValue } from "../../../lib/format";
import { createInvoiceNumber } from "../../../lib/data";
import { calculateLine, calculateTotals, toNumber } from "../../../lib/invoiceMath";
import { EmptyState } from "../../../components/EmptyState";
import { FormField, inputClass } from "../../../components/FormField";
import { Button } from "../../../components/Button";
import { SectionHeader } from "../../../components/SectionHeader";

type InvoiceBuilderProps = {
  companies: Company[];
  products: Product[];
  onCreateInvoice: (input: Omit<InvoiceInput, "ownerUserId">) => Promise<void>;
  onOpenCompanies: () => void;
};

function createEmptyLine(): InvoiceDraftLine {
  return {
    localId: crypto.randomUUID(),
    productId: null,
    description: "",
    quantity: 1,
    unit: "stk",
    unitPrice: 0,
    vatRate: 25,
  };
}

function createDefaultRepeat(): RepeatDraft {
  const today = new Date();
  const jsDay = today.getDay();

  return {
    enabled: false,
    frequency: "monthly",
    intervalCount: 1,
    dayOfWeek: jsDay === 0 ? 7 : jsDay,
    dayOfMonth: today.getDate(),
    sendTime: "08:00",
    startDate: todayInputValue(),
    autoSend: true,
    paymentTermsDays: 14,
  };
}

function addDaysFromDate(dateValue: string, days: number) {
  const date = new Date(dateValue);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMonthsFromDate(dateValue: string, months: number) {
  const date = new Date(dateValue);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}

function repeatIntervalLabel(frequency: RepeatDraft["frequency"], intervalCount: number) {
  if (frequency === "daily") {
    return intervalCount === 1 ? "Hver dag" : `Hver ${intervalCount}. dag`;
  }

  if (frequency === "weekly") {
    if (intervalCount === 1) {
      return "Hver uke";
    }

    if (intervalCount === 2) {
      return "Annenhver uke";
    }

    return `Hver ${intervalCount}. uke`;
  }

  if (intervalCount === 1) {
    return "Hver måned";
  }

  if (intervalCount === 2) {
    return "Annenhver måned";
  }

  return `Hver ${intervalCount}. måned`;
}

function repeatIntervalHelper(frequency: RepeatDraft["frequency"]) {
  if (frequency === "daily") {
    return "1 = hver dag, 2 = hver andre dag";
  }

  if (frequency === "weekly") {
    return "1 = hver uke, 2 = annenhver uke";
  }

  return "1 = hver måned, 2 = annenhver måned";
}

export function InvoiceBuilder({ companies, products, onCreateInvoice, onOpenCompanies }: InvoiceBuilderProps) {
  const [invoiceKind, setInvoiceKind] = useState<"single" | "recurring">("single");
  const [companyId, setCompanyId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState(createInvoiceNumber);
  const [issueDate, setIssueDate] = useState(todayInputValue);
  const [dueDate, setDueDate] = useState(() => addMonthsInputValue(1));
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<InvoiceDraftLine[]>([createEmptyLine()]);
  const [repeat, setRepeat] = useState<RepeatDraft>(createDefaultRepeat);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!companyId && companies[0]) {
      setCompanyId(companies[0].id);
    }
  }, [companies, companyId]);

  const companyProducts = products.filter((product) => product.company_id === companyId);
  const totals = calculateTotals(lines);

  function handleCompanyChange(nextCompanyId: string) {
    setCompanyId(nextCompanyId);
    setLines([createEmptyLine()]);
  }

  function updateLine(localId: string, patch: Partial<InvoiceDraftLine>) {
    setLines((currentLines) =>
      currentLines.map((line) => (line.localId === localId ? { ...line, ...patch } : line))
    );
  }

  function handleProductSelect(localId: string, productId: string) {
    if (!productId) {
      updateLine(localId, { productId: null });
      return;
    }

    const product = companyProducts.find((item) => item.id === productId);

    if (!product) {
      return;
    }

    updateLine(localId, {
      productId: product.id,
      description: product.description ? `${product.name} - ${product.description}` : product.name,
      unit: product.unit,
      unitPrice: product.unit_price,
      vatRate: product.vat_rate,
    });
  }

  function addManualLine() {
    setLines((currentLines) => [...currentLines, createEmptyLine()]);
  }

  function removeLine(localId: string) {
    setLines((currentLines) =>
      currentLines.length === 1 ? [createEmptyLine()] : currentLines.filter((line) => line.localId !== localId)
    );
  }

  function applyDueDatePreset(preset: "week" | "twoWeeks" | "month") {
    if (preset === "week") {
      setDueDate(addDaysFromDate(issueDate, 7));
      return;
    }

    if (preset === "twoWeeks") {
      setDueDate(addDaysFromDate(issueDate, 14));
      return;
    }

    setDueDate(addMonthsFromDate(issueDate, 1));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const validLines = lines.filter((line) => line.description.trim() && line.quantity > 0);

    if (!companyId) {
      setMessage("Velg et selskap før du lagrer fakturaen.");
      return;
    }

    if (validLines.length === 0) {
      setMessage("Legg inn minst én fakturalinje.");
      return;
    }

    setSaving(true);

    try {
      await onCreateInvoice({
        companyId,
        invoiceNumber,
        issueDate,
        dueDate,
        notes,
        lines: validLines,
        repeat: { ...repeat, enabled: invoiceKind === "recurring", autoSend: true },
      });

      setMessage(invoiceKind === "recurring" ? "Gjentakende faktura lagret. Første faktura opprettes ved utsending." : "Faktura lagret.");
      setInvoiceNumber(createInvoiceNumber());
      setIssueDate(todayInputValue());
      setDueDate(addMonthsInputValue(1));
      setNotes("");
      setLines([createEmptyLine()]);
      setRepeat(createDefaultRepeat());
      setInvoiceKind("single");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kunne ikke lagre fakturaen.");
    } finally {
      setSaving(false);
    }
  }

  if (companies.length === 0) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Ny faktura" description="Du må ha minst ett selskap før du kan lage faktura." />
        <EmptyState title="Ingen selskaper" description="Registrer et selskap først, og legg deretter til produkter eller manuelle linjer." />
        <Button onClick={onOpenCompanies}>
          Gå til selskaper
        </Button>
      </div>
    );
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <SectionHeader
        title="Ny faktura"
        description="Velg et selskap, fyll inn produkter eller manuelle linjer, og lagre fakturaen i Supabase."
        action={
          <Button type="submit" disabled={saving}>
            {saving ? "Lagrer..." : invoiceKind === "recurring" ? "Lagre gjentakelse" : "Lagre faktura"}
          </Button>
        }
      />

      {message && <p className="rounded-md border border-blue-100 bg-white px-4 py-3 text-sm text-blue-900 shadow-sm">{message}</p>}

      <section className="rounded-lg border border-blue-100 bg-white p-5 shadow-sm">
        <h3 className="text-base font-semibold text-slate-950">Type faktura</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className={`cursor-pointer rounded-lg border p-4 ${invoiceKind === "single" ? "border-blue-500 bg-blue-50" : "border-blue-100"}`}>
            <input className="mr-3" type="radio" name="invoiceKind" checked={invoiceKind === "single"} onChange={() => setInvoiceKind("single")} />
            <span className="font-semibold text-slate-950">Enkeltfaktura</span>
            <span className="mt-1 block text-sm text-slate-600">Opprettes nå med fakturadato og fast forfallsdato.</span>
          </label>
          <label className={`cursor-pointer rounded-lg border p-4 ${invoiceKind === "recurring" ? "border-blue-500 bg-blue-50" : "border-blue-100"}`}>
            <input className="mr-3" type="radio" name="invoiceKind" checked={invoiceKind === "recurring"} onChange={() => setInvoiceKind("recurring")} />
            <span className="font-semibold text-slate-950">Gjentakende faktura</span>
            <span className="mt-1 block text-sm text-slate-600">Lagrer bare planen. Fakturaen opprettes og dateres ved utsending.</span>
          </label>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <div className="rounded-lg border border-blue-100 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-slate-950">Fakturainfo</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <FormField label="Selskap">
                <select className={inputClass} value={companyId} onChange={(event) => handleCompanyChange(event.target.value)} required>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </FormField>
              {invoiceKind === "single" && <FormField label="Fakturanummer">
                <input className={inputClass} value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} required />
              </FormField>}
              {invoiceKind === "single" && <FormField label="Fakturadato">
                <input className={inputClass} type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} required />
              </FormField>}
              {invoiceKind === "single" && <FormField label="Forfallsdato">
                <div className="space-y-2">
                  <input className={inputClass} type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required />
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" onClick={() => applyDueDatePreset("week")}>
                      Om 1 uke
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => applyDueDatePreset("twoWeeks")}>
                      Om 14 dager
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => applyDueDatePreset("month")}>
                      Om 1 måned
                    </Button>
                  </div>
                </div>
              </FormField>}
            </div>
          </div>

          <div className="rounded-lg border border-blue-100 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-950">Fakturalinjer</h3>
                <p className="text-sm text-slate-600">Velg lagrede produkter eller skriv inn manuelle linjer.</p>
              </div>
              <Button variant="secondary" onClick={addManualLine}>
                Legg til linje
              </Button>
            </div>

            <div className="mt-5 space-y-4">
              {lines.map((line, index) => {
                const calculated = calculateLine(line);

                return (
                  <div key={line.localId} className="rounded-lg border border-blue-100 bg-blue-50 p-4">
                    <div className="grid gap-3 xl:grid-cols-[190px_1fr_82px_82px_110px_82px_110px_auto]">
                      <FormField label="Produkt">
                        <select className={inputClass} value={line.productId ?? ""} onChange={(event) => handleProductSelect(line.localId, event.target.value)}>
                          <option value="">Manuell</option>
                          {companyProducts.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.name}
                            </option>
                          ))}
                        </select>
                      </FormField>
                      <FormField label="Tekst">
                        <input
                          className={inputClass}
                          value={line.description}
                          onChange={(event) => updateLine(line.localId, { description: event.target.value })}
                          placeholder="Beskrivelse på fakturalinjen"
                          required
                        />
                      </FormField>
                      <FormField label="Antall">
                        <input
                          className={inputClass}
                          inputMode="decimal"
                          value={line.quantity}
                          onChange={(event) => updateLine(line.localId, { quantity: toNumber(event.target.value, 1) })}
                          required
                        />
                      </FormField>
                      <FormField label="Enhet">
                        <input className={inputClass} value={line.unit} onChange={(event) => updateLine(line.localId, { unit: event.target.value })} />
                      </FormField>
                      <FormField label="Pris">
                        <input
                          className={inputClass}
                          inputMode="decimal"
                          value={line.unitPrice}
                          onChange={(event) => updateLine(line.localId, { unitPrice: toNumber(event.target.value) })}
                          required
                        />
                      </FormField>
                      <FormField label="MVA">
                        <input
                          className={inputClass}
                          inputMode="decimal"
                          value={line.vatRate}
                          onChange={(event) => updateLine(line.localId, { vatRate: toNumber(event.target.value, 25) })}
                          required
                        />
                      </FormField>
                      <div>
                        <span className="text-sm font-medium text-slate-700">Sum</span>
                        <p className="mt-3 text-sm font-semibold text-slate-950">{formatCurrency(calculated.line_total)}</p>
                      </div>
                      <div className="flex items-end">
                        <Button variant="secondary" size="sm" onClick={() => removeLine(line.localId)} aria-label={`Fjern linje ${index + 1}`}>
                          Fjern
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-blue-100 bg-white p-5 shadow-sm">
            <FormField label="Notat på faktura">
              <textarea className={`${inputClass} min-h-24 resize-y`} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </FormField>
          </div>
        </div>

        <aside className="space-y-5">
          <div className="rounded-lg border border-blue-100 bg-white p-5 shadow-sm">
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
          </div>

          {invoiceKind === "recurring" && (
          <div className="rounded-lg border border-blue-100 bg-white p-5 shadow-sm">
            <div>
              <div>
                <h3 className="text-base font-semibold text-slate-950">Gjentakelse</h3>
                <p className="text-sm text-slate-600">Fakturaen opprettes og sendes automatisk på neste tidspunkt.</p>
              </div>

              <div className="mt-4 space-y-4">
                <div className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-medium text-slate-800">
                  {repeatIntervalLabel(repeat.frequency, repeat.intervalCount)}
                </div>
                <FormField label="Frekvens">
                  <select
                    className={inputClass}
                    value={repeat.frequency}
                    onChange={(event) => setRepeat((value) => ({ ...value, frequency: event.target.value as RepeatDraft["frequency"] }))}
                  >
                    <option value="daily">Daglig</option>
                    <option value="weekly">Ukentlig</option>
                    <option value="monthly">Månedlig</option>
                  </select>
                </FormField>
                <FormField label="Gjentas hver" helper={repeatIntervalHelper(repeat.frequency)}>
                  <input
                    className={inputClass}
                    min={1}
                    type="number"
                    value={repeat.intervalCount}
                    onChange={(event) => setRepeat((value) => ({ ...value, intervalCount: Math.max(1, Number(event.target.value)) }))}
                  />
                </FormField>
                {repeat.frequency === "weekly" && (
                  <FormField label="Ukedag">
                    <select
                      className={inputClass}
                      value={repeat.dayOfWeek}
                      onChange={(event) => setRepeat((value) => ({ ...value, dayOfWeek: Number(event.target.value) }))}
                    >
                      <option value={1}>Mandag</option>
                      <option value={2}>Tirsdag</option>
                      <option value={3}>Onsdag</option>
                      <option value={4}>Torsdag</option>
                      <option value={5}>Fredag</option>
                      <option value={6}>Lørdag</option>
                      <option value={7}>Søndag</option>
                    </select>
                  </FormField>
                )}
                {repeat.frequency === "monthly" && (
                  <FormField label="Dag i måned">
                    <input
                      className={inputClass}
                      max={31}
                      min={1}
                      type="number"
                      value={repeat.dayOfMonth}
                      onChange={(event) => setRepeat((value) => ({ ...value, dayOfMonth: Math.max(1, Math.min(31, Number(event.target.value))) }))}
                    />
                  </FormField>
                )}
                <FormField label="Startdato">
                  <input
                    className={inputClass}
                    type="date"
                    value={repeat.startDate}
                    onChange={(event) => setRepeat((value) => ({ ...value, startDate: event.target.value }))}
                  />
                </FormField>
                <FormField label="Tidspunkt">
                  <input
                    className={inputClass}
                    type="time"
                    value={repeat.sendTime}
                    onChange={(event) => setRepeat((value) => ({ ...value, sendTime: event.target.value }))}
                  />
                </FormField>
                <FormField label="Forfall etter utsending" helper="Antall dager fra utsending til forfallsdato.">
                  <input
                    className={inputClass}
                    type="number"
                    min={0}
                    max={365}
                    value={repeat.paymentTermsDays}
                    onChange={(event) => setRepeat((value) => ({ ...value, paymentTermsDays: Math.max(0, Math.min(365, Number(event.target.value))) }))}
                  />
                </FormField>
              </div>
            </div>
          </div>
          )}
        </aside>
      </section>
    </form>
  );
}
