import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "../../components/Button";
import { SectionHeader } from "../../components/SectionHeader";
import { Select } from "../../components/Select";
import { DetailModal } from "../../components/layout/DetailModal";
import { Notice } from "../../components/layout/Notice";
import {
  cancelSupplierInvoice,
  createAccountingAccount,
  createManualJournalEntry,
  createSupplier,
  createSupplierInvoice,
  downloadSupplierInvoiceAttachment,
  setAccountingAccountActive,
  setAccountingPeriodStatus,
  setSupplierInvoicePaid,
  type AccountingData,
  type ManualJournalLineInput,
  type SupplierInput,
  type SupplierInvoiceInput,
} from "../../lib/data";
import { buildAccountingReport } from "../../lib/accounting";
import type { AccountingAccountCategory, InvoiceWithDetails, SupplierInvoiceWithDetails } from "../../types";
import { AccountsView } from "./components/AccountsView";
import { AccountingOverview, DetailedReports } from "./components/AccountingReports";
import { JournalView } from "./components/JournalView";
import { ManualVoucherForm } from "./components/ManualVoucherForm";
import { SupplierInvoiceForm } from "./components/SupplierInvoiceForm";
import { SupplierInvoicesView } from "./components/SupplierInvoicesView";
import { availableAccountingYears } from "./accountingPresentation";

type AccountingPageProps = {
  ownerUserId: string;
  accounting: AccountingData;
  salesInvoices: InvoiceWithDetails[];
  onRefresh: () => Promise<void>;
};

type AccountingTab = "overview" | "incoming" | "journal" | "reports" | "accounts";

const tabs: Array<{ id: AccountingTab; label: string }> = [
  { id: "overview", label: "Oversikt" },
  { id: "incoming", label: "Inngående" },
  { id: "journal", label: "Bilag" },
  { id: "reports", label: "Rapporter" },
  { id: "accounts", label: "Kontoplan" },
];

export default function AccountingPage({ ownerUserId, accounting, salesInvoices, onRefresh }: AccountingPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab") as AccountingTab | null;
  const activeTab = tabs.some((tab) => tab.id === requestedTab) ? requestedTab! : "overview";
  const years = useMemo(() => availableAccountingYears([
    ...accounting.journalEntries.map((entry) => entry.entry_date),
    ...accounting.supplierInvoices.map((invoice) => invoice.invoice_date),
    ...salesInvoices.map((invoice) => invoice.issue_date),
  ]), [accounting.journalEntries, accounting.supplierInvoices, salesInvoices]);
  const requestedYear = Number(searchParams.get("year"));
  const year = years.includes(requestedYear) ? requestedYear : years[0];
  const report = useMemo(
    () => buildAccountingReport(accounting.journalEntries, accounting.accounts, year),
    [accounting.accounts, accounting.journalEntries, year],
  );
  const [showSupplierInvoiceForm, setShowSupplierInvoiceForm] = useState(false);
  const [showManualVoucherForm, setShowManualVoucherForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionInvoiceId, setActionInvoiceId] = useState("");
  const [updatingPeriod, setUpdatingPeriod] = useState("");
  const [updatingAccountId, setUpdatingAccountId] = useState("");
  const [feedback, setFeedback] = useState<{ message: string; tone: "info" | "danger" }>({ message: "", tone: "info" });

  function updateQuery(patch: { tab?: AccountingTab; year?: number }) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (patch.tab) next.set("tab", patch.tab);
      if (patch.year) next.set("year", String(patch.year));
      return next;
    }, { replace: true });
  }

  async function handleCreateSupplier(input: SupplierInput) {
    return createSupplier(input);
  }

  async function handleCreateSupplierInvoice(input: SupplierInvoiceInput) {
    setSaving(true);
    setFeedback({ message: "", tone: "info" });
    try {
      await createSupplierInvoice(input);
      await onRefresh();
      setShowSupplierInvoiceForm(false);
      updateQuery({ tab: "incoming" });
      setFeedback({ message: "Den inngående fakturaen er bokført.", tone: "info" });
    } finally {
      setSaving(false);
    }
  }

  async function handleManualVoucher(date: string, description: string, lines: ManualJournalLineInput[]) {
    setSaving(true);
    setFeedback({ message: "", tone: "info" });
    try {
      await createManualJournalEntry(date, description, lines);
      await onRefresh();
      setShowManualVoucherForm(false);
      updateQuery({ tab: "journal" });
      setFeedback({ message: "Bilaget er bokført.", tone: "info" });
    } finally {
      setSaving(false);
    }
  }

  async function handleSetSupplierPaid(invoice: SupplierInvoiceWithDetails, paid: boolean, date: string, bankAccountId: string | null) {
    setActionInvoiceId(invoice.id);
    setFeedback({ message: "", tone: "info" });
    try {
      await setSupplierInvoicePaid(invoice.id, paid, date, bankAccountId);
      await onRefresh();
      setFeedback({ message: paid ? "Betalingen er bokført." : "Betalingen er korrigert med et motbilag.", tone: "info" });
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : "Kunne ikke bokføre betalingen.", tone: "danger" });
    } finally {
      setActionInvoiceId("");
    }
  }

  async function handleCancelSupplierInvoice(invoice: SupplierInvoiceWithDetails, date: string) {
    setActionInvoiceId(invoice.id);
    setFeedback({ message: "", tone: "info" });
    try {
      await cancelSupplierInvoice(invoice.id, date);
      await onRefresh();
      setFeedback({ message: "Fakturaen er annullert med et motbilag.", tone: "info" });
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : "Kunne ikke annullere fakturaen.", tone: "danger" });
    } finally {
      setActionInvoiceId("");
    }
  }

  async function handleSetPeriodStatus(month: number, status: "open" | "closed") {
    const key = `${year}-${month}`;
    setUpdatingPeriod(key);
    setFeedback({ message: "", tone: "info" });
    try {
      await setAccountingPeriodStatus(year, month, status);
      await onRefresh();
      setFeedback({ message: `Perioden er ${status === "closed" ? "låst" : "åpnet"}.`, tone: "info" });
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : "Kunne ikke endre perioden.", tone: "danger" });
    } finally {
      setUpdatingPeriod("");
    }
  }

  async function handleToggleAccount(accountId: string, isActive: boolean) {
    setUpdatingAccountId(accountId);
    try {
      await setAccountingAccountActive(accountId, isActive);
      await onRefresh();
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : "Kunne ikke oppdatere kontoen.", tone: "danger" });
    } finally {
      setUpdatingAccountId("");
    }
  }

  async function handleCreateAccount(accountNumber: string, name: string, category: AccountingAccountCategory) {
    await createAccountingAccount(ownerUserId, accountNumber, name, category);
    await onRefresh();
    setFeedback({ message: `Konto ${accountNumber} er opprettet.`, tone: "info" });
  }

  async function handleDownload(storagePath: string, originalName: string) {
    try {
      await downloadSupplierInvoiceAttachment(storagePath, originalName);
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : "Kunne ikke laste ned filen.", tone: "danger" });
    }
  }

  return (
    <>
      <SectionHeader
        title="Regnskap"
        description="Bilag, hovedbok, MVA og rapporter fra utgående og inngående fakturaer."
        action={<div className="w-36"><Select ariaLabel="Velg regnskapsår" value={year} options={years.map((item) => ({ value: item, label: String(item) }))} onChange={(value) => updateQuery({ year: Number(value) })} /></div>}
      />

      {feedback.message && <Notice tone={feedback.tone}>{feedback.message}</Notice>}

      <nav className="flex gap-1 overflow-x-auto border-b border-blue-200" aria-label="Regnskapsvisninger">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            variant="ghost"
            className={`shrink-0 rounded-b-none border-b-2 px-4 py-2.5 ${activeTab === tab.id ? "border-blue-700 bg-blue-50 text-blue-900" : "border-transparent"}`}
            onClick={() => updateQuery({ tab: tab.id })}
          >
            {tab.label}
          </Button>
        ))}
      </nav>

      {activeTab === "overview" && <AccountingOverview year={year} report={report} entries={accounting.journalEntries} salesInvoices={salesInvoices} supplierInvoices={accounting.supplierInvoices} />}
      {activeTab === "incoming" && <SupplierInvoicesView year={year} invoices={accounting.supplierInvoices} accounts={accounting.accounts} entries={accounting.journalEntries} actionInvoiceId={actionInvoiceId} actionMessage={feedback.message} actionMessageTone={feedback.tone} onNewInvoice={() => setShowSupplierInvoiceForm(true)} onSetPaid={handleSetSupplierPaid} onCancelInvoice={handleCancelSupplierInvoice} onDownloadAttachment={handleDownload} />}
      {activeTab === "journal" && <JournalView year={year} entries={accounting.journalEntries} onOpenManualVoucher={() => setShowManualVoucherForm(true)} />}
      {activeTab === "reports" && <DetailedReports year={year} report={report} periods={accounting.periods} salesInvoices={salesInvoices} supplierInvoices={accounting.supplierInvoices} updatingPeriod={updatingPeriod} onSetPeriodStatus={(month, status) => void handleSetPeriodStatus(month, status)} />}
      {activeTab === "accounts" && <AccountsView year={year} accounts={accounting.accounts} entries={accounting.journalEntries} updatingAccountId={updatingAccountId} onToggleActive={(account) => void handleToggleAccount(account.id, !account.is_active)} onCreateAccount={handleCreateAccount} />}

      <DetailModal open={showSupplierInvoiceForm} onClose={() => !saving && setShowSupplierInvoiceForm(false)} title="Ny inngående faktura" ariaLabel="Registrer inngående faktura">
        <SupplierInvoiceForm ownerUserId={ownerUserId} accounts={accounting.accounts} suppliers={accounting.suppliers} saving={saving} onCreateSupplier={handleCreateSupplier} onSave={handleCreateSupplierInvoice} onCancel={() => setShowSupplierInvoiceForm(false)} />
      </DetailModal>

      <DetailModal open={showManualVoucherForm} onClose={() => !saving && setShowManualVoucherForm(false)} title="Nytt manuelt bilag" ariaLabel="Bokfør manuelt bilag">
        <ManualVoucherForm accounts={accounting.accounts} saving={saving} onSave={handleManualVoucher} onCancel={() => setShowManualVoucherForm(false)} />
      </DetailModal>
    </>
  );
}
