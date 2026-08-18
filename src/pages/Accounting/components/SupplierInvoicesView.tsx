import { useMemo, useState } from "react";
import { Banknote, CreditCard, Download, FileText, Plus } from "@animateicons/react/lucide";
import { AnimatedIconButton } from "../../../components/AnimatedIconButton";
import { Button } from "../../../components/Button";
import { FormField } from "../../../components/FormField";
import { Input } from "../../../components/Input";
import { Select } from "../../../components/Select";
import { Tag } from "../../../components/Tag";
import { ConfirmDialog } from "../../../components/layout/ConfirmDialog";
import { DetailModal } from "../../../components/layout/DetailModal";
import { Panel } from "../../../components/layout/Panel";
import { Notice } from "../../../components/layout/Notice";
import { formatFileSize } from "../../../lib/attachments";
import { roundMoney } from "../../../lib/accounting";
import { formatCurrency, formatDate, formatMoney, todayInputValue } from "../../../lib/format";
import { purchaseReimbursementTotals } from "../../../lib/data";
import type { AccountingAccount, JournalEntry, PurchasePaymentReimbursement, PurchasePaymentWithDetails, SupplierInvoiceWithDetails } from "../../../types";
import { supplierInvoiceStatus } from "../accountingPresentation";
import { parseLocalizedMoney } from "../../../lib/supplierInvoiceParser";

type SupplierInvoicesViewProps = {
  year: number;
  invoices: SupplierInvoiceWithDetails[];
  purchases: PurchasePaymentWithDetails[];
  accounts: AccountingAccount[];
  entries: JournalEntry[];
  actionInvoiceId: string;
  actionPurchaseId: string;
  actionMessage: string;
  actionMessageTone: "info" | "danger";
  onNewInvoice: () => void;
  onNewPurchase: () => void;
  onNewReimbursement: () => void;
  onSetPaid: (invoice: SupplierInvoiceWithDetails, paid: boolean, date: string, bankAccountId: string | null, paidAmountNok?: number | null) => Promise<void>;
  onCancelInvoice: (invoice: SupplierInvoiceWithDetails, date: string) => Promise<void>;
  onReimbursePurchase: (purchase: PurchasePaymentWithDetails, date: string, bankAccountId: string, amount: number) => Promise<void>;
  onReversePurchaseReimbursement: (purchase: PurchasePaymentWithDetails, reimbursement: PurchasePaymentReimbursement, date: string) => Promise<void>;
  onCancelPurchase: (purchase: PurchasePaymentWithDetails, date: string) => Promise<void>;
  onDownloadAttachment: (storagePath: string, originalName: string) => Promise<void>;
};

export function SupplierInvoicesView({
  year,
  invoices,
  purchases,
  accounts,
  entries,
  actionInvoiceId,
  actionPurchaseId,
  actionMessage,
  actionMessageTone,
  onNewInvoice,
  onNewPurchase,
  onNewReimbursement,
  onSetPaid,
  onCancelInvoice,
  onReimbursePurchase,
  onReversePurchaseReimbursement,
  onCancelPurchase,
  onDownloadAttachment,
}: SupplierInvoicesViewProps) {
  const [viewMode, setViewMode] = useState<"invoices" | "purchases">("invoices");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [selectedPurchaseId, setSelectedPurchaseId] = useState("");
  const filteredInvoices = useMemo(() => invoices.filter((invoice) => {
    if (!invoice.invoice_date.startsWith(String(year))) return false;
    if (statusFilter !== "all" && invoice.status !== statusFilter) return false;
    const term = search.trim().toLowerCase();
    return !term || [invoice.invoice_number, invoice.description, invoice.supplier?.name, invoice.supplier?.org_number]
      .some((value) => value?.toLowerCase().includes(term));
  }), [invoices, search, statusFilter, year]);
  const filteredPurchases = useMemo(() => purchases.filter((purchase) => {
    if (!purchase.purchase_date.startsWith(String(year))) return false;
    if (statusFilter === "company" && (purchase.payment_source !== "company" || purchase.status !== "booked")) return false;
    if (statusFilter === "private" && (purchase.payment_source !== "private" || purchase.status !== "booked")) return false;
    if (["reimbursed", "cancelled"].includes(statusFilter) && purchase.status !== statusFilter) return false;
    const term = search.trim().toLowerCase();
    return !term || [purchase.supplier_name, purchase.supplier_org_number, purchase.description, purchase.paid_by]
      .some((value) => value?.toLowerCase().includes(term));
  }), [purchases, search, statusFilter, year]);
  const selected = invoices.find((invoice) => invoice.id === selectedId) ?? null;
  const selectedPurchase = purchases.find((purchase) => purchase.id === selectedPurchaseId) ?? null;

  function changeView(mode: "invoices" | "purchases") {
    setViewMode(mode);
    setSearch("");
    setStatusFilter("all");
  }

  return (
    <>
      <Panel padding="none" className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-blue-100 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h3 className="font-semibold text-slate-950">Inngående betalinger {year}</h3><p className="text-xs text-slate-500">{viewMode === "invoices" ? `${filteredInvoices.length} fakturaer · ${formatCurrency(filteredInvoices.reduce((sum, invoice) => sum + Number(invoice.total), 0))}` : `${filteredPurchases.length} kjøp · ${formatCurrency(filteredPurchases.reduce((sum, purchase) => sum + Number(purchase.total), 0))}`}</p></div>
          <div className="flex flex-wrap gap-2">
            <AnimatedIconButton icon={FileText} variant="secondary" size="sm" onClick={() => { changeView("invoices"); onNewInvoice(); }}>Registrer faktura</AnimatedIconButton>
            <AnimatedIconButton icon={Plus} size="sm" onClick={() => { changeView("purchases"); onNewPurchase(); }}>Registrer betaling</AnimatedIconButton>
            <AnimatedIconButton icon={Banknote} variant="secondary" size="sm" onClick={() => { changeView("purchases"); onNewReimbursement(); }}>Tilbakebetal utlegg</AnimatedIconButton>
          </div>
        </div>
        <div className="flex gap-1 border-b border-blue-100 p-2" role="tablist" aria-label="Type inngående betaling">
          <Button variant={viewMode === "invoices" ? "primary" : "ghost"} size="sm" onClick={() => changeView("invoices")} role="tab" aria-selected={viewMode === "invoices"}>Fakturaer</Button>
          <Button variant={viewMode === "purchases" ? "primary" : "ghost"} size="sm" onClick={() => changeView("purchases")} role="tab" aria-selected={viewMode === "purchases"}>Kort- og bankkjøp</Button>
        </div>
        <div className="grid gap-2 border-b border-blue-100 p-4 sm:grid-cols-[1fr_180px]">
          <Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={viewMode === "invoices" ? "Søk etter leverandør eller fakturanummer" : "Søk etter leverandør eller formål"} />
          <Select ariaLabel="Filtrer inngående betalinger" value={statusFilter} options={viewMode === "invoices" ? [{ value: "all", label: "Alle statuser" }, { value: "posted", label: "Ubetalt" }, { value: "paid", label: "Betalt" }, { value: "cancelled", label: "Annullert" }] : [{ value: "all", label: "Alle statuser" }, { value: "company", label: "Betalt av selskapet" }, { value: "private", label: "Privat utlegg" }, { value: "reimbursed", label: "Tilbakebetalt" }, { value: "cancelled", label: "Annullert" }]} onChange={setStatusFilter} />
        </div>
        {viewMode === "invoices" && (filteredInvoices.length === 0 ? <p className="px-4 py-12 text-center text-sm text-slate-500">Ingen inngående fakturaer i valgt år.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Leverandør</th><th className="px-4 py-3">Fakturanr.</th><th className="px-4 py-3">Dato</th><th className="px-4 py-3">Forfall</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">MVA</th><th className="px-4 py-3 text-right">Total</th></tr></thead>
              <tbody className="divide-y divide-blue-100">{filteredInvoices.map((invoice) => {
                const status = supplierInvoiceStatus(invoice);
                return <tr key={invoice.id} className="cursor-pointer hover:bg-blue-50" tabIndex={0} onClick={() => setSelectedId(invoice.id)} onKeyDown={(event) => { if (event.key === "Enter") setSelectedId(invoice.id); }}><td className="px-4 py-3 font-medium text-slate-950">{invoice.supplier?.name ?? "Ukjent"}</td><td className="px-4 py-3">{invoice.invoice_number}</td><td className="px-4 py-3 whitespace-nowrap">{formatDate(invoice.invoice_date)}</td><td className="px-4 py-3 whitespace-nowrap">{formatDate(invoice.due_date)}</td><td className="px-4 py-3"><Tag tone={status.tone}>{status.label}</Tag></td><td className="px-4 py-3 text-right">{formatCurrency(Number(invoice.vat_total))}</td><td className="px-4 py-3 text-right font-semibold"><span className="block">{formatCurrency(Number(invoice.total))}</span>{invoice.currency !== "NOK" && <span className="block text-xs font-normal text-slate-500">{formatMoney(Number(invoice.original_total), invoice.currency)}</span>}</td></tr>;
              })}</tbody>
            </table>
          </div>
        ))}
        {viewMode === "purchases" && (filteredPurchases.length === 0 ? <p className="px-4 py-12 text-center text-sm text-slate-500">Ingen kort- eller bankkjøp i valgt år.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Leverandør</th><th className="px-4 py-3">Dato</th><th className="px-4 py-3">Betalt med</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">MVA</th><th className="px-4 py-3 text-right">Total</th></tr></thead>
              <tbody className="divide-y divide-blue-100">{filteredPurchases.map((purchase) => {
                const status = purchaseStatus(purchase);
                return <tr key={purchase.id} className="cursor-pointer hover:bg-blue-50" tabIndex={0} onClick={() => setSelectedPurchaseId(purchase.id)} onKeyDown={(event) => { if (event.key === "Enter") setSelectedPurchaseId(purchase.id); }}><td className="px-4 py-3"><span className="block font-medium text-slate-950">{purchase.supplier_name}</span><span className="block text-xs text-slate-500">{purchase.description}</span></td><td className="px-4 py-3 whitespace-nowrap">{formatDate(purchase.purchase_date)}</td><td className="px-4 py-3">{purchase.payment_source === "company" ? "Selskapet" : purchase.paid_by}</td><td className="px-4 py-3"><Tag tone={status.tone}>{status.label}</Tag></td><td className="px-4 py-3 text-right">{formatCurrency(Number(purchase.vat_total))}</td><td className="px-4 py-3 text-right font-semibold">{formatCurrency(Number(purchase.total))}</td></tr>;
              })}</tbody>
            </table>
          </div>
        ))}
      </Panel>

      <DetailModal open={Boolean(selected)} onClose={() => setSelectedId("")} title="Inngående faktura" ariaLabel="Detaljer for inngående faktura">
        {selected && <SupplierInvoiceDetails key={selected.id} invoice={selected} accounts={accounts} entries={entries} busy={actionInvoiceId === selected.id} actionMessage={actionMessage} actionMessageTone={actionMessageTone} onSetPaid={onSetPaid} onCancelInvoice={onCancelInvoice} onDownloadAttachment={onDownloadAttachment} />}
      </DetailModal>
      <DetailModal open={Boolean(selectedPurchase)} onClose={() => setSelectedPurchaseId("")} title="Kort- eller bankkjøp" ariaLabel="Detaljer for kort- eller bankkjøp">
        {selectedPurchase && <PurchasePaymentDetails key={`${selectedPurchase.id}-${selectedPurchase.updated_at}`} purchase={selectedPurchase} accounts={accounts} entries={entries} busy={actionPurchaseId === selectedPurchase.id} actionMessage={actionMessage} actionMessageTone={actionMessageTone} onReimbursePurchase={onReimbursePurchase} onReversePurchaseReimbursement={onReversePurchaseReimbursement} onCancelPurchase={onCancelPurchase} onDownloadAttachment={onDownloadAttachment} />}
      </DetailModal>
    </>
  );
}

function SupplierInvoiceDetails({ invoice, accounts, entries, busy, actionMessage, actionMessageTone, onSetPaid, onCancelInvoice, onDownloadAttachment }: {
  invoice: SupplierInvoiceWithDetails;
  accounts: AccountingAccount[];
  entries: JournalEntry[];
  busy: boolean;
  actionMessage: string;
  actionMessageTone: "info" | "danger";
  onSetPaid: SupplierInvoicesViewProps["onSetPaid"];
  onCancelInvoice: SupplierInvoicesViewProps["onCancelInvoice"];
  onDownloadAttachment: SupplierInvoicesViewProps["onDownloadAttachment"];
}) {
  const today = todayInputValue();
  const bankAccounts = accounts.filter((account) => account.is_active && account.system_key === "bank");
  const [paymentDate, setPaymentDate] = useState(invoice.paid_at ?? today);
  const [bankAccountId, setBankAccountId] = useState(bankAccounts[0]?.id ?? "");
  const [paidAmountNok, setPaidAmountNok] = useState(String(Number(invoice.total)));
  const [showCorrection, setShowCorrection] = useState(false);
  const [showCancellation, setShowCancellation] = useState(false);
  const status = supplierInvoiceStatus(invoice);
  const journal = entries.find((entry) => entry.id === invoice.journal_entry_id);
  const actualPaidAmountNok = parseMoney(paidAmountNok);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.7fr)] lg:items-start">
      {actionMessage && <Notice tone={actionMessageTone} className="lg:col-span-2">{actionMessage}</Notice>}
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h3 className="text-xl font-semibold text-slate-950">{invoice.supplier?.name}</h3><p className="text-sm text-slate-600">Faktura {invoice.invoice_number}</p>{invoice.supplier?.org_number && <p className="text-sm text-slate-500">Org.nr. {invoice.supplier.org_number}</p>}</div>
          <div className="text-right"><p className="text-2xl font-semibold">{invoice.currency === "NOK" ? formatCurrency(Number(invoice.total)) : formatMoney(Number(invoice.original_total), invoice.currency)}</p>{invoice.currency !== "NOK" && <p className="text-sm text-slate-500">Bokført {formatCurrency(Number(invoice.total))}</p>}<Tag tone={status.tone}>{status.label}</Tag></div>
        </div>
        <dl className="mt-5 grid gap-4 border-y border-blue-100 py-4 text-sm sm:grid-cols-3 lg:grid-cols-5">
          <Info label="Fakturadato" value={formatDate(invoice.invoice_date)} />
          <Info label="Forfall" value={formatDate(invoice.due_date)} />
          <Info label="KID" value={invoice.kid || "-"} />
          <Info label="Valuta" value={invoice.currency} />
          <Info label="Kurs" value={invoice.currency === "NOK" ? "1" : `${Number(invoice.exchange_rate).toLocaleString("nb-NO", { maximumFractionDigits: 8 })} NOK/${invoice.currency}`} />
          {invoice.currency !== "NOK" && <Info label="Kursgrunnlag" value={`${invoice.exchange_rate_source || "Manuelt oppgitt"} · ${formatDate(invoice.exchange_rate_date)}`} />}
          <Info label="Betalt" value={formatDate(invoice.paid_at)} />
          <Info label="Bilag" value={journal ? `#${journal.voucher_number}` : "-"} />
        </dl>
        {invoice.description && <p className="mt-4 text-sm text-slate-700">{invoice.description}</p>}
        <div className="mt-5 overflow-x-auto rounded-md border border-blue-100">
          <table className="w-full min-w-[640px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Beskrivelse</th><th className="px-3 py-2">Konto</th><th className="px-3 py-2 text-right">Netto</th><th className="px-3 py-2 text-right">MVA</th><th className="px-3 py-2 text-right">Total</th></tr></thead><tbody className="divide-y divide-blue-50">{(invoice.supplier_invoice_lines ?? []).map((line) => <tr key={line.id}><td className="px-3 py-2 font-medium">{line.description}</td><td className="px-3 py-2 text-slate-600">{line.account?.account_number} {line.account?.name}</td><td className="px-3 py-2 text-right"><InvoiceLineAmount nok={Number(line.net_amount)} original={Number(line.original_net_amount)} currency={invoice.currency} /></td><td className="px-3 py-2 text-right"><span className="block">{line.vat_rate}%</span><InvoiceLineAmount nok={Number(line.vat_amount)} original={Number(line.original_vat_amount)} currency={invoice.currency} /></td><td className="px-3 py-2 text-right font-semibold"><InvoiceLineAmount nok={Number(line.gross_amount)} original={Number(line.original_gross_amount)} currency={invoice.currency} /></td></tr>)}</tbody></table>
        </div>
      </Panel>

      <div className="space-y-5">
        <Panel>
          <h3 className="font-semibold text-slate-950">Betaling</h3>
          {invoice.status === "cancelled" ? <p className="mt-2 text-sm text-slate-500">Fakturaen er annullert.</p> : (
            <>
              <div className="mt-4 space-y-3">
                <FormField label={invoice.status === "paid" ? "Korreksjonsdato" : "Betalingsdato"}><Input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} /></FormField>
                {invoice.status !== "paid" && <FormField label="Bankkonto"><Select ariaLabel="Bankkonto for betaling" value={bankAccountId} options={bankAccounts.map((account) => ({ value: account.id, label: `${account.account_number} ${account.name}` }))} onChange={setBankAccountId} /></FormField>}
                {invoice.status !== "paid" && invoice.currency !== "NOK" && <FormField label="Faktisk belastet bank (NOK)" helper="Differansen fra bokført fakturaverdi føres som valutagevinst eller valutatap."><Input inputMode="decimal" value={paidAmountNok} onChange={(event) => setPaidAmountNok(event.target.value)} required /></FormField>}
              </div>
              <Button className="mt-4 w-full" variant={invoice.status === "paid" ? "secondary" : "success"} disabled={busy || (invoice.status !== "paid" && invoice.currency !== "NOK" && actualPaidAmountNok === null)} onClick={() => invoice.status === "paid" ? setShowCorrection(true) : void onSetPaid(invoice, true, paymentDate, bankAccountId || null, invoice.currency === "NOK" ? Number(invoice.total) : actualPaidAmountNok)}>{busy ? "Bokfører..." : invoice.status === "paid" ? "Korriger betaling" : "Registrer som betalt"}</Button>
            </>
          )}
        </Panel>
        <Panel>
          <h3 className="font-semibold text-slate-950">Originaldokumenter</h3>
          {(invoice.supplier_invoice_attachments ?? []).length === 0 ? <p className="mt-2 text-sm text-slate-500">Ingen filer lastet opp.</p> : <ul className="mt-3 divide-y divide-blue-100">{(invoice.supplier_invoice_attachments ?? []).map((attachment) => <li key={attachment.id} className="flex items-center justify-between gap-3 py-2"><span className="min-w-0"><span className="block truncate text-sm">{attachment.original_name}</span><span className="text-xs text-slate-500">{formatFileSize(attachment.size_bytes)}</span></span><AnimatedIconButton icon={Download} variant="secondary" size="xs" onClick={() => void onDownloadAttachment(attachment.storage_path, attachment.original_name)}><span className="sr-only">Last ned</span></AnimatedIconButton></li>)}</ul>}
        </Panel>
        {invoice.status === "posted" && <Button className="w-full" variant="danger" disabled={busy} onClick={() => setShowCancellation(true)}>Annuller faktura</Button>}
      </div>

      <ConfirmDialog open={showCorrection} title="Korriger registrert betaling" message="Det opprinnelige betalingsbilaget beholdes, og et nytt motbilag opprettes på valgt dato." confirmLabel="Opprett motbilag" onCancel={() => setShowCorrection(false)} onConfirm={() => { setShowCorrection(false); void onSetPaid(invoice, false, paymentDate, null); }} />
      <ConfirmDialog open={showCancellation} title="Annuller inngående faktura" message="Fakturabilaget beholdes, og et nytt motbilag opprettes på valgt dato. Handlingen kan ikke slettes." confirmLabel="Annuller med motbilag" tone="danger" onCancel={() => setShowCancellation(false)} onConfirm={() => { setShowCancellation(false); void onCancelInvoice(invoice, paymentDate); }} />
    </div>
  );
}

function PurchasePaymentDetails({ purchase, accounts, entries, busy, actionMessage, actionMessageTone, onReimbursePurchase, onReversePurchaseReimbursement, onCancelPurchase, onDownloadAttachment }: {
  purchase: PurchasePaymentWithDetails;
  accounts: AccountingAccount[];
  entries: JournalEntry[];
  busy: boolean;
  actionMessage: string;
  actionMessageTone: "info" | "danger";
  onReimbursePurchase: SupplierInvoicesViewProps["onReimbursePurchase"];
  onReversePurchaseReimbursement: SupplierInvoicesViewProps["onReversePurchaseReimbursement"];
  onCancelPurchase: SupplierInvoicesViewProps["onCancelPurchase"];
  onDownloadAttachment: SupplierInvoicesViewProps["onDownloadAttachment"];
}) {
  const today = todayInputValue();
  const bankAccounts = accounts.filter((account) => account.is_active && account.system_key === "bank");
  const [actionDate, setActionDate] = useState(today);
  const [bankAccountId, setBankAccountId] = useState(bankAccounts[0]?.id ?? "");
  const totals = purchaseReimbursementTotals(purchase);
  const [reimbursementAmount, setReimbursementAmount] = useState(formatMoneyInput(totals.remaining));
  const [showReimbursement, setShowReimbursement] = useState(false);
  const [reimbursementToReverse, setReimbursementToReverse] = useState<PurchasePaymentReimbursement | null>(null);
  const [showCancellation, setShowCancellation] = useState(false);
  const status = purchaseStatus(purchase);
  const journal = entries.find((entry) => entry.id === purchase.journal_entry_id);
  const reimbursements = purchase.purchase_payment_reimbursements ?? [];
  const activeReimbursements = reimbursements.filter((reimbursement) => reimbursement.status === "active");
  const parsedReimbursementAmount = parseMoney(reimbursementAmount);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.7fr)] lg:items-start">
      {actionMessage && <Notice tone={actionMessageTone} className="lg:col-span-2">{actionMessage}</Notice>}
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h3 className="text-xl font-semibold text-slate-950">{purchase.supplier_name}</h3>{purchase.supplier_org_number && <p className="text-sm text-slate-500">Org.nr. {purchase.supplier_org_number}</p>}</div>
          <div className="text-right"><p className="text-2xl font-semibold">{formatCurrency(Number(purchase.total))}</p><Tag tone={status.tone}>{status.label}</Tag></div>
        </div>
        <dl className="mt-5 grid gap-4 border-y border-blue-100 py-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Kjøpsdato" value={formatDate(purchase.purchase_date)} />
          <Info label="Betalt med" value={purchase.payment_source === "company" ? "Selskapets konto/kort" : `Privat - ${purchase.paid_by}`} />
          <Info label="Oppgjørskonto" value={purchase.settlement_account ? `${purchase.settlement_account.account_number} ${purchase.settlement_account.name}` : "-"} />
          <Info label="Bilag" value={journal ? `#${journal.voucher_number}` : "-"} />
          {purchase.payment_source === "private" && <Info label="Tilbakebetalt" value={formatCurrency(totals.reimbursed)} />}
          {purchase.payment_source === "private" && <Info label="Gjenstår" value={formatCurrency(totals.remaining)} />}
          {purchase.cancelled_at && <Info label="Annullert" value={formatDate(purchase.cancelled_at)} />}
        </dl>
        <p className="mt-4 text-sm text-slate-700">{purchase.description}</p>
        <div className="mt-5 overflow-x-auto rounded-md border border-blue-100">
          <table className="w-full min-w-[620px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Beskrivelse</th><th className="px-3 py-2">Konto</th><th className="px-3 py-2 text-right">Netto</th><th className="px-3 py-2 text-right">MVA</th><th className="px-3 py-2 text-right">Total</th></tr></thead><tbody className="divide-y divide-blue-50">{(purchase.purchase_payment_lines ?? []).map((line) => <tr key={line.id}><td className="px-3 py-2 font-medium">{line.description}</td><td className="px-3 py-2 text-slate-600">{line.account?.account_number} {line.account?.name}</td><td className="px-3 py-2 text-right">{formatCurrency(Number(line.net_amount))}</td><td className="px-3 py-2 text-right"><span className="block">{line.vat_rate}%</span><span className="text-xs text-slate-500">{formatCurrency(Number(line.vat_amount))}</span></td><td className="px-3 py-2 text-right font-semibold">{formatCurrency(Number(line.gross_amount))}</td></tr>)}</tbody></table>
        </div>
      </Panel>

      <div className="space-y-5">
        {purchase.payment_source === "private" && purchase.status !== "cancelled" && (
          <Panel>
            <div className="flex items-center gap-2"><CreditCard size={19} className="text-blue-700" /><h3 className="font-semibold text-slate-950">Privat utlegg</h3></div>
            {totals.remaining > 0 ? (
              <>
                <div className="mt-4 space-y-3">
                  <FormField label="Tilbakebetalingsdato"><Input type="date" value={actionDate} onChange={(event) => setActionDate(event.target.value)} /></FormField>
                  <FormField label="Utbetalt fra bank"><Select ariaLabel="Bankkonto for tilbakebetaling" value={bankAccountId} options={bankAccounts.map((account) => ({ value: account.id, label: `${account.account_number} ${account.name}` }))} onChange={setBankAccountId} /></FormField>
                  <FormField label="Beløp" helper={`Gjenstående: ${formatCurrency(totals.remaining)}`}>
                    <Input inputMode="decimal" value={reimbursementAmount} onChange={(event) => setReimbursementAmount(event.target.value)} onBlur={() => { if (parsedReimbursementAmount !== null) setReimbursementAmount(formatMoneyInput(parsedReimbursementAmount)); }} />
                  </FormField>
                </div>
                <Button className="mt-4 w-full" variant="success" disabled={busy || !bankAccountId || parsedReimbursementAmount === null || parsedReimbursementAmount > totals.remaining} onClick={() => setShowReimbursement(true)}>{busy ? "Bokfører..." : "Bokfør tilbakebetaling"}</Button>
              </>
            ) : <p className="mt-3 text-sm text-slate-600">Utlegget er fullstendig tilbakebetalt.</p>}
          </Panel>
        )}
        {purchase.payment_source === "private" && reimbursements.length > 0 && (
          <Panel>
            <h3 className="font-semibold text-slate-950">Tilbakebetalinger</h3>
            <ul className="mt-3 divide-y divide-blue-100">
              {reimbursements.map((reimbursement) => (
                <li key={reimbursement.id} className="flex items-center justify-between gap-3 py-3">
                  <span className="min-w-0 text-sm">
                    <span className={`block font-semibold ${reimbursement.status === "reversed" ? "text-slate-500 line-through" : "text-slate-950"}`}>{formatCurrency(Number(reimbursement.amount))}</span>
                    <span className="block text-xs text-slate-500">{formatDate(reimbursement.reimbursement_date)} · {reimbursement.bank_account ? `${reimbursement.bank_account.account_number} ${reimbursement.bank_account.name}` : "Bankkonto"}{journalVoucher(entries, reimbursement.journal_entry_id)}</span>
                    {reimbursement.status === "reversed" && <span className="block text-xs text-red-700">Korrigert {formatDate(reimbursement.reversed_at)}</span>}
                  </span>
                  {reimbursement.status === "active" && <Button size="xs" variant="secondary" disabled={busy} onClick={() => setReimbursementToReverse(reimbursement)}>Korriger</Button>}
                </li>
              ))}
            </ul>
          </Panel>
        )}
        <Panel>
          <h3 className="font-semibold text-slate-950">Originaldokumenter</h3>
          <ul className="mt-3 divide-y divide-blue-100">{(purchase.purchase_payment_attachments ?? []).map((attachment) => <li key={attachment.id} className="flex items-center justify-between gap-3 py-2"><span className="min-w-0"><span className="block truncate text-sm">{attachment.original_name}</span><span className="text-xs text-slate-500">{formatFileSize(attachment.size_bytes)}</span></span><AnimatedIconButton icon={Download} variant="secondary" size="xs" onClick={() => void onDownloadAttachment(attachment.storage_path, attachment.original_name)}><span className="sr-only">Last ned</span></AnimatedIconButton></li>)}</ul>
        </Panel>
        {purchase.status === "booked" && activeReimbursements.length === 0 && <Button className="w-full" variant="danger" disabled={busy} onClick={() => setShowCancellation(true)}>Annuller kjøp</Button>}
      </div>

      <ConfirmDialog open={showReimbursement} title="Bokfør tilbakebetaling" message={`${parsedReimbursementAmount === null ? "Beløpet" : formatCurrency(parsedReimbursementAmount)} utbetales fra valgt bankkonto. Kjøpsbilaget beholdes uendret.`} confirmLabel="Bokfør tilbakebetaling" onCancel={() => setShowReimbursement(false)} onConfirm={() => { setShowReimbursement(false); if (parsedReimbursementAmount !== null) void onReimbursePurchase(purchase, actionDate, bankAccountId, parsedReimbursementAmount); }} />
      <ConfirmDialog open={Boolean(reimbursementToReverse)} title="Korriger tilbakebetaling" message="Tilbakebetalingsbilaget beholdes, og et nytt motbilag opprettes på valgt dato." confirmLabel="Opprett motbilag" onCancel={() => setReimbursementToReverse(null)} onConfirm={() => { const reimbursement = reimbursementToReverse; setReimbursementToReverse(null); if (reimbursement) void onReversePurchaseReimbursement(purchase, reimbursement, actionDate); }} />
      <ConfirmDialog open={showCancellation} title="Annuller kort-/bankkjøp" message="Kjøpsbilaget beholdes, og et nytt motbilag opprettes på valgt dato." confirmLabel="Annuller med motbilag" tone="danger" onCancel={() => setShowCancellation(false)} onConfirm={() => { setShowCancellation(false); void onCancelPurchase(purchase, actionDate); }} />
    </div>
  );
}

function purchaseStatus(purchase: PurchasePaymentWithDetails): { label: string; tone: "success" | "warning" | "danger" | "info" } {
  if (purchase.status === "cancelled") return { label: "Annullert", tone: "danger" };
  if (purchase.payment_source === "private") {
    const totals = purchaseReimbursementTotals(purchase);
    if (totals.remaining === 0) return { label: "Tilbakebetalt", tone: "success" };
    if (totals.reimbursed > 0) return { label: "Delvis tilbakebetalt", tone: "info" };
    return { label: "Privat utlegg", tone: "warning" };
  }
  return { label: "Betalt", tone: "success" };
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-slate-500">{label}</dt><dd className="mt-1 font-medium text-slate-950">{value}</dd></div>;
}

function InvoiceLineAmount({ nok, original, currency }: { nok: number; original: number; currency: string }) {
  if (currency === "NOK") return formatCurrency(nok);
  return (
    <span>
      <span className="block">{formatMoney(original, currency)}</span>
      <span className="block text-xs font-normal text-slate-500">{formatCurrency(nok)}</span>
    </span>
  );
}

function parseMoney(value: string) {
  const parsed = parseLocalizedMoney(value);
  return parsed !== null && parsed > 0 ? roundMoney(parsed) : null;
}

function journalVoucher(entries: JournalEntry[], journalEntryId: string) {
  const entry = entries.find((item) => item.id === journalEntryId);
  return entry ? ` · Bilag #${entry.voucher_number}` : "";
}

function formatMoneyInput(value: number) {
  return value.toLocaleString("nb-NO", {
    useGrouping: false,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
