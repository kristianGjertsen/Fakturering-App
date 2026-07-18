import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import type { Company, InvoiceDraftLine, InvoiceWithDetails, PdfTemplate, Product, RepeatDraft } from "../../../types";
import type { InvoiceInput } from "../../../lib/data";
import { formatCurrency, todayInputValue } from "../../../lib/format";
import { createInvoiceNumber } from "../../../lib/data";
import { calculateLine, calculateTotals, toNumber } from "../../../lib/invoiceMath";
import { FormField } from "../../../components/FormField";
import { Input, inputClass } from "../../../components/Input";
import { Button } from "../../../components/Button";
import { Select } from "../../../components/Select";
import { SectionHeader } from "../../../components/SectionHeader";
import { Panel } from "../../../components/layout/Panel";
import { Notice } from "../../../components/layout/Notice";
import { PdfPreview } from "./PdfPreview";
import { PdfTemplateSelector } from "./PdfTemplateSelector";
import { UnsavedRecipientDialog } from "./UnsavedRecipientDialog";

type InvoiceBuilderProps = {
  companies: Company[];
  products: Product[];
  onCreateInvoice: (input: Omit<InvoiceInput, "ownerUserId">) => Promise<void>;
  onOpenCompanies: () => void;
  initialCompanyId?: string;
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

export function InvoiceBuilder({ companies, products, onCreateInvoice, onOpenCompanies, initialCompanyId = "" }: InvoiceBuilderProps) {
  const [invoiceKind, setInvoiceKind] = useState<"single" | "recurring">("single");
  const [companyId, setCompanyId] = useState(initialCompanyId);
  const [recipientMode, setRecipientMode] = useState<"company" | "guest">("company");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [showUnsavedRecipientDialog, setShowUnsavedRecipientDialog] = useState(() => companies.length === 0);
  const [invoiceNumber] = useState(createInvoiceNumber);
  const [invoiceTitle, setInvoiceTitle] = useState("");
  const [issueDate, setIssueDate] = useState(todayInputValue);
  const [paymentTermsDays, setPaymentTermsDays] = useState(14);
  const [notes, setNotes] = useState("");
  const [pdfTemplate, setPdfTemplate] = useState<PdfTemplate>("classic");
  const [lines, setLines] = useState<InvoiceDraftLine[]>([createEmptyLine()]);
  const [repeat, setRepeat] = useState<RepeatDraft>(createDefaultRepeat);
  const [scheduleOnce, setScheduleOnce] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (recipientMode === "company" && !companyId && companies[0]) {
      setCompanyId(companies[0].id);
    }
  }, [companies, companyId, recipientMode]);

  const companyProducts = products.filter((product) => product.company_id === companyId);
  const totals = calculateTotals(lines);
  const selectedCompany = companies.find((company) => company.id === companyId) ?? null;
  const dueDate = addDaysFromDate(issueDate, paymentTermsDays);
  const previewIssueDate = invoiceKind === "recurring" ? repeat.startDate : issueDate;
  const previewDueDate = invoiceKind === "recurring"
    ? addDaysFromDate(repeat.startDate, repeat.paymentTermsDays)
    : dueDate;
  const previewInvoice: InvoiceWithDetails = {
    id: "preview",
    owner_user_id: "preview",
    company_id: companyId || null,
    recipient_name: selectedCompany?.name ?? (recipientName.trim() || recipientEmail.trim() || "Engangskunde"),
    recipient_org_number: selectedCompany?.org_number ?? null,
    recipient_email: selectedCompany?.email ?? (recipientEmail.trim() || null),
    recipient_country: selectedCompany?.country ?? null,
    schedule_id: null,
    scheduled_for: null,
    invoice_number: invoiceKind === "recurring"
      ? "Neste faktura"
      : scheduleOnce
        ? "Opprettes ved utsending"
        : invoiceNumber || "Fakturanummer",
    title: invoiceTitle.trim() || (
      invoiceKind === "recurring" || scheduleOnce
        ? "Opprettes ved utsending"
        : invoiceNumber || "Fakturanummer"
    ),
    issue_date: previewIssueDate,
    due_date: previewDueDate,
    status: "ready",
    paid: false,
    pdf_template: pdfTemplate,
    notes: notes || null,
    subtotal: totals.subtotal,
    vat_total: totals.vatTotal,
    total: totals.total,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    company: selectedCompany ?? (
      recipientMode === "guest"
        ? {
          id: "guest",
          owner_user_id: "preview",
          name: recipientName.trim() || "Engangskunde",
          org_number: null,
          email: recipientEmail.trim() || null,
          address: null,
          postal_address: null,
          country: null,
          private_notes: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        : null
    ),
    invoice_items: lines
      .filter((line) => line.description.trim())
      .map((line, index) => {
        const calculated = calculateLine(line);
        return {
          id: `preview-${line.localId}`,
          invoice_id: "preview",
          product_id: line.productId,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          unit_price: line.unitPrice,
          vat_rate: line.vatRate,
          line_subtotal: calculated.line_subtotal,
          line_vat: calculated.line_vat,
          line_total: calculated.line_total,
          sort_order: index,
          created_at: new Date().toISOString(),
        };
      }),
  };

  function handleCompanyChange(nextCompanyId: string) {
    if (nextCompanyId === "__guest__") {
      setShowUnsavedRecipientDialog(true);
      return;
    }

    setRecipientMode("company");
    setCompanyId(nextCompanyId);
    setRecipientName("");
    setRecipientEmail("");
    setLines([createEmptyLine()]);
  }

  function continueWithoutCompany() {
    setRecipientMode("guest");
    setCompanyId("");
    setInvoiceKind("single");
    setScheduleOnce(false);
    setLines([createEmptyLine()]);
    setShowUnsavedRecipientDialog(false);
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const validLines = lines.filter((line) => line.description.trim() && line.quantity > 0);

    if (recipientMode === "company" && !companyId) {
      setMessage("Velg et selskap før du lagrer fakturaen.");
      return;
    }

    if (recipientMode === "guest" && !recipientEmail.trim()) {
      setMessage("Oppgi e-postadressen til mottakeren.");
      return;
    }

    if (recipientMode === "guest" && (invoiceKind === "recurring" || scheduleOnce)) {
      setMessage("Engangskunder kan bare brukes på fakturaer som lagres nå.");
      return;
    }

    if (validLines.length === 0) {
      setMessage("Legg inn minst én fakturalinje.");
      return;
    }

    if (invoiceKind === "single" && scheduleOnce && !selectedCompany?.email) {
      setMessage("Selskapet må ha en e-postadresse før fakturaen kan planlegges.");
      return;
    }

    setSaving(true);

    try {
      await onCreateInvoice({
        companyId: companyId || null,
        recipientName,
        recipientEmail,
        invoiceNumber,
        invoiceTitle,
        issueDate,
        dueDate,
        notes,
        pdfTemplate,
        lines: validLines,
        repeat: { ...repeat, enabled: invoiceKind === "recurring", autoSend: true },
        scheduleOnce: {
          enabled: invoiceKind === "single" && scheduleOnce,
        },
      });

      setMessage(
        invoiceKind === "recurring"
          ? "Gjentakende faktura lagret. Første faktura opprettes ved utsending."
          : scheduleOnce
            ? "Fakturaen er planlagt og opprettes på fakturadatoen."
            : "Faktura lagret.",
      );
      setInvoiceTitle("");
      setIssueDate(todayInputValue());
      setPaymentTermsDays(14);
      setNotes("");
      setPdfTemplate("classic");
      setLines([createEmptyLine()]);
      setRepeat(createDefaultRepeat());
      setScheduleOnce(false);
      setInvoiceKind("single");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kunne ikke lagre fakturaen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <UnsavedRecipientDialog
        open={showUnsavedRecipientDialog}
        onCancel={() => setShowUnsavedRecipientDialog(false)}
        onCreateCompany={onOpenCompanies}
        onContinue={continueWithoutCompany}
      />
      <SectionHeader
        title="Ny faktura"
        description="Velg et selskap, fyll inn produkter eller manuelle linjer, og lagre fakturaen i Supabase."
        action={
          <Button type="submit" disabled={saving}>
            {saving
              ? "Lagrer..."
              : invoiceKind === "recurring"
                ? "Lagre gjentakelse"
                : scheduleOnce
                  ? "Planlegg faktura"
                  : "Lagre faktura"}
          </Button>
        }
      />

      {message && <Notice>{message}</Notice>}

      <Panel>
        <h3 className="text-base font-semibold text-slate-950">Type faktura</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className={`cursor-pointer rounded-lg border p-4 ${invoiceKind === "single" ? "border-blue-500 bg-blue-50" : "border-blue-100"}`}>
            <Input className="mr-3" type="radio" name="invoiceKind" checked={invoiceKind === "single"} onChange={() => setInvoiceKind("single")} />
            <span className="font-semibold text-slate-950">Enkeltfaktura</span>
            <span className="mt-1 block text-sm text-slate-600">Opprettes nå med valgt fakturadato og betalingsfrist.</span>
          </label>
          <label className={`cursor-pointer rounded-lg border p-4 ${invoiceKind === "recurring" ? "border-blue-500 bg-blue-50" : "border-blue-100"}`}>
            <Input
              className="mr-3"
              type="radio"
              name="invoiceKind"
              checked={invoiceKind === "recurring"}
              disabled={recipientMode === "guest"}
              onChange={() => {
                setInvoiceKind("recurring");
                setScheduleOnce(false);
              }}
            />
            <span className="font-semibold text-slate-950">Gjentakende faktura</span>
            <span className="mt-1 block text-sm text-slate-600">Lagrer bare planen. Fakturaen opprettes og dateres ved utsending.</span>
          </label>
        </div>
      </Panel>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-5">
          <Panel>
            <h3 className="text-base font-semibold text-slate-950">Fakturainfo</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <FormField
                label="Tittel"
                helper="Kun til intern oversikt. Vises ikke på PDF-en."
              >
                <Input
                  value={invoiceTitle}
                  onChange={(event) => setInvoiceTitle(event.target.value)}
                  placeholder="Bruker fakturanummer hvis tom"
                />
              </FormField>
              <FormField label="Selskap">
                <Select
                  ariaLabel="Selskap"
                  value={recipientMode === "guest" ? "__guest__" : companyId}
                  options={[
                    ...(companies.length === 0
                      ? [{ value: "", label: "Ingen registrerte selskaper" }]
                      : []),
                    ...companies.map((company) => ({ value: company.id, label: company.name })),
                    { value: "__guest__", label: "Ingen selskap (engangskunde)" },
                  ]}
                  onChange={handleCompanyChange}
                />
              </FormField>
              {recipientMode === "guest" && (
                <>
                  <FormField label="Mottakernavn">
                    <Input
                      value={recipientName}
                      onChange={(event) => setRecipientName(event.target.value)}
                      placeholder="Valgfritt navn"
                    />
                  </FormField>
                  <FormField label="Mottakers e-post">
                    <Input
                      type="email"
                      value={recipientEmail}
                      onChange={(event) => setRecipientEmail(event.target.value)}
                      placeholder="mottaker@eksempel.no"
                      required
                    />
                  </FormField>
                </>
              )}
              {invoiceKind === "single" && <FormField label="Fakturadato">
                <Input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} required />
              </FormField>}
              {invoiceKind === "single" && <FormField label="Betalingsfrist" helper={`Forfallsdato blir ${dueDate.split("-").reverse().join(".")}.`}>
                <div className="space-y-2">
                  <div className="relative">
                    <Input
                      className="pr-16"
                      min={0}
                      max={365}
                      type="number"
                      value={paymentTermsDays}
                      onChange={(event) => setPaymentTermsDays(Math.max(0, Math.min(365, Number(event.target.value) || 0)))}
                      required
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-500">dager</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2" aria-label="Velg betalingsfrist">
                    {[7, 14, 30].map((days) => (
                      <Button
                        key={days}
                        variant={paymentTermsDays === days ? "primary" : "secondary"}
                        size="sm"
                        onClick={() => setPaymentTermsDays(days)}
                      >
                        {days} dager
                      </Button>
                    ))}
                  </div>
                </div>
              </FormField>}
            </div>

            {invoiceKind === "single" && recipientMode === "company" && (
              <div className={`mt-5 rounded-lg border p-4 ${scheduleOnce ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-slate-50"}`}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-950">Når skal fakturaen opprettes?</h4>
                    <p className="mt-1 text-sm text-slate-600">
                      Lagre den med en gang, eller opprett og send den automatisk på fakturadatoen.
                    </p>
                  </div>
                  <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex" aria-label="Velg når fakturaen skal opprettes">
                    <Button variant={!scheduleOnce ? "primary" : "secondary"} onClick={() => setScheduleOnce(false)}>
                      Lagre faktura uten å sende
                    </Button>
                    <Button variant={scheduleOnce ? "primary" : "secondary"} onClick={() => setScheduleOnce(true)}>
                      Send på fakturadato
                    </Button>
                  </div>
                </div>

              </div>
            )}
          </Panel>

          <Panel>
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
                    <div className="min-w-0 space-y-3">
                      <FormField label="Produkt">
                        <Select
                          ariaLabel={`Produkt for fakturalinje ${index + 1}`}
                          value={line.productId ?? ""}
                          options={[
                            { value: "", label: "Manuell" },
                            ...companyProducts.map((product) => ({ value: product.id, label: product.name })),
                          ]}
                          onChange={(value) => handleProductSelect(line.localId, value)}
                        />
                      </FormField>
                      <FormField label="Tekst">
                        <textarea
                          className={`${inputClass} resize-y`}
                          rows={2}
                          value={line.description}
                          onChange={(event) => updateLine(line.localId, { description: event.target.value })}
                          placeholder="Beskrivelse på fakturalinjen"
                          required
                        />
                      </FormField>
                      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)_minmax(125px,auto)]">
                        <FormField label="Antall">
                          <Input
                            inputMode="decimal"
                            value={line.quantity}
                            onChange={(event) => updateLine(line.localId, { quantity: toNumber(event.target.value, 1) })}
                            required
                          />
                        </FormField>
                        <FormField label="Enhet">
                          <Input value={line.unit} onChange={(event) => updateLine(line.localId, { unit: event.target.value })} />
                        </FormField>
                        <FormField label="Pris">
                          <Input
                            inputMode="decimal"
                            value={line.unitPrice}
                            onChange={(event) => updateLine(line.localId, { unitPrice: toNumber(event.target.value) })}
                            required
                          />
                        </FormField>
                        <FormField label="MVA">
                          <Input
                            inputMode="decimal"
                            value={line.vatRate}
                            onChange={(event) => updateLine(line.localId, { vatRate: toNumber(event.target.value, 25) })}
                            required
                          />
                        </FormField>
                        <div className="flex items-end justify-between gap-2">
                          <div>
                            <span className="text-sm font-medium text-slate-700">Sum</span>
                            <p className="mt-3 text-sm font-semibold text-slate-950">{formatCurrency(calculated.line_total)}</p>
                          </div>
                          <Button
                            variant="danger"
                            size="xs"
                            className="h-9 w-9 shrink-0 rounded-md !bg-red-500 !p-0 !text-black hover:!bg-red-600"
                            onClick={() => removeLine(line.localId)}
                            aria-label={`Fjern linje ${index + 1}`}
                            title="Fjern linje"
                          >
                            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 text-black" fill="none" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" />
                            </svg>
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel>
            <FormField label="Notat på faktura">
              <textarea className={`${inputClass} min-h-24 resize-y`} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </FormField>
          </Panel>
        </div>

        <aside className="space-y-5">
          <Panel className="space-y-4">
            <PdfTemplateSelector value={pdfTemplate} onChange={setPdfTemplate} />
            <PdfPreview invoice={previewInvoice} compact />
          </Panel>

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

          {invoiceKind === "recurring" && (
          <Panel>
            <div>
              <div>
                <h3 className="text-base font-semibold text-slate-950">Gjentakelse</h3>
                <p className="text-sm text-slate-600">Fakturaen opprettes og sendes automatisk på neste dato.</p>
              </div>

              <div className="mt-4 space-y-4">
                <div className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-medium text-slate-800">
                  {repeatIntervalLabel(repeat.frequency, repeat.intervalCount)}
                </div>
                <FormField label="Frekvens">
                  <Select
                    ariaLabel="Frekvens"
                    value={repeat.frequency}
                    options={[
                      { value: "daily", label: "Daglig" },
                      { value: "weekly", label: "Ukentlig" },
                      { value: "monthly", label: "Månedlig" },
                    ]}
                    onChange={(frequency) => setRepeat((value) => ({ ...value, frequency: frequency as RepeatDraft["frequency"] }))}
                  />
                </FormField>
                <FormField label="Gjentas hver" helper={repeatIntervalHelper(repeat.frequency)}>
                  <Input
                    min={1}
                    type="number"
                    value={repeat.intervalCount}
                    onChange={(event) => setRepeat((value) => ({ ...value, intervalCount: Math.max(1, Number(event.target.value)) }))}
                  />
                </FormField>
                {repeat.frequency === "weekly" && (
                  <FormField label="Ukedag">
                    <Select
                      ariaLabel="Ukedag"
                      value={repeat.dayOfWeek}
                      options={[
                        { value: 1, label: "Mandag" },
                        { value: 2, label: "Tirsdag" },
                        { value: 3, label: "Onsdag" },
                        { value: 4, label: "Torsdag" },
                        { value: 5, label: "Fredag" },
                        { value: 6, label: "Lørdag" },
                        { value: 7, label: "Søndag" },
                      ]}
                      onChange={(dayOfWeek) => setRepeat((value) => ({ ...value, dayOfWeek: Number(dayOfWeek) }))}
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
                      onChange={(event) => setRepeat((value) => ({ ...value, dayOfMonth: Math.max(1, Math.min(31, Number(event.target.value))) }))}
                    />
                  </FormField>
                )}
                <FormField label="Startdato">
                  <Input
                    type="date"
                    value={repeat.startDate}
                    onChange={(event) => setRepeat((value) => ({ ...value, startDate: event.target.value }))}
                  />
                </FormField>
                <FormField label="Forfall etter utsending" helper="Antall dager fra utsending til forfallsdato.">
                  <Input
                    type="number"
                    min={0}
                    max={365}
                    value={repeat.paymentTermsDays}
                    onChange={(event) => setRepeat((value) => ({ ...value, paymentTermsDays: Math.max(0, Math.min(365, Number(event.target.value))) }))}
                  />
                </FormField>
              </div>
            </div>
          </Panel>
          )}
        </aside>
      </section>
    </form>
  );
}
