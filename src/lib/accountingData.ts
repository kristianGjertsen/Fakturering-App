import { supabase } from "../supabaseClient";
import type {
  AccountingAccount,
  AccountingPayment,
  AccountingPeriod,
  AccountingTaxCode,
  JournalEntry,
  PurchasePaymentSource,
  PurchasePaymentWithDetails,
  Supplier,
  SupplierInvoiceDraftLine,
  SupplierInvoiceWithDetails,
  AccountingAccountCategory,
} from "../types";
import { validateAttachmentFiles } from "./attachments";
import { calculateSupplierLine, roundMoney } from "./accounting";

export const ACCOUNTING_DOCUMENT_BUCKET = "accounting-documents";

export type AccountingData = {
  accounts: AccountingAccount[];
  taxCodes: AccountingTaxCode[];
  suppliers: Supplier[];
  supplierInvoices: SupplierInvoiceWithDetails[];
  purchasePayments: PurchasePaymentWithDetails[];
  journalEntries: JournalEntry[];
  payments: AccountingPayment[];
  periods: AccountingPeriod[];
};

export type SupplierInput = {
  ownerUserId: string;
  name: string;
  orgNumber: string;
  email: string;
  bankAccount: string;
  notes: string;
  defaultExpenseAccountId: string | null;
};

export type SupplierInvoiceInput = {
  ownerUserId: string;
  supplierId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  kid: string;
  currency: string;
  exchangeRate: number;
  exchangeRateDate: string;
  exchangeRateSource: string;
  description: string;
  lines: SupplierInvoiceDraftLine[];
  attachments: File[];
  markPaid: boolean;
  paymentDate: string;
  bankAccountId: string | null;
  paymentAmountNok: number;
};

export type PurchasePaymentInput = {
  ownerUserId: string;
  supplierName: string;
  supplierOrgNumber: string;
  purchaseDate: string;
  description: string;
  paymentSource: PurchasePaymentSource;
  settlementAccountId: string;
  paidBy: string;
  lines: SupplierInvoiceDraftLine[];
  attachments: File[];
};

export type ManualJournalLineInput = {
  accountId: string;
  description: string;
  debit: number;
  credit: number;
};

export async function fetchAccountingData(): Promise<AccountingData> {
  const [accountsResult, taxCodesResult, suppliersResult, invoicesResult, purchasesResult, entriesResult, paymentsResult, periodsResult] =
    await Promise.all([
      supabase.from("accounting_accounts").select("*").order("account_number"),
      supabase.from("accounting_tax_codes").select("*").order("direction").order("rate", { ascending: false }),
      supabase.from("suppliers").select("*").order("name"),
      supabase
        .from("supplier_invoices")
        .select("*, supplier:suppliers(*), supplier_invoice_lines(*, account:accounting_accounts(id,account_number,name)), supplier_invoice_attachments(*)")
        .order("invoice_date", { ascending: false }),
      supabase
        .from("purchase_payments")
        .select("*, supplier:suppliers(*), settlement_account:accounting_accounts!purchase_payments_settlement_account_id_fkey(id,account_number,name,system_key), purchase_payment_lines(*, account:accounting_accounts(id,account_number,name)), purchase_payment_attachments(*), purchase_payment_reimbursements(*, bank_account:accounting_accounts!purchase_payment_reimbursements_bank_account_id_fkey(id,account_number,name))")
        .order("purchase_date", { ascending: false }),
      supabase
        .from("journal_entries")
        .select("*, journal_lines(*, account:accounting_accounts(id,account_number,name,category,system_key,saft_grouping_category,saft_grouping_code), customer:companies(id,name,org_number), supplier:suppliers(id,name,org_number), tax_code:accounting_tax_codes(id,code,direction,rate,saft_standard_tax_code,saft_tax_type))")
        .order("voucher_number", { ascending: false }),
      supabase.from("accounting_payments").select("*").order("payment_date", { ascending: false }),
      supabase.from("accounting_periods").select("*").order("year", { ascending: false }).order("month", { ascending: false }),
    ]);

  const error = accountsResult.error
    ?? taxCodesResult.error
    ?? suppliersResult.error
    ?? invoicesResult.error
    ?? purchasesResult.error
    ?? entriesResult.error
    ?? paymentsResult.error
    ?? periodsResult.error;
  if (error) throw error;

  return {
    accounts: (accountsResult.data ?? []) as AccountingAccount[],
    taxCodes: (taxCodesResult.data ?? []) as AccountingTaxCode[],
    suppliers: (suppliersResult.data ?? []) as Supplier[],
    supplierInvoices: ((invoicesResult.data ?? []) as SupplierInvoiceWithDetails[]).map((invoice) => ({
      ...invoice,
      supplier_invoice_lines: [...(invoice.supplier_invoice_lines ?? [])]
        .sort((left, right) => left.sort_order - right.sort_order),
    })),
    purchasePayments: ((purchasesResult.data ?? []) as PurchasePaymentWithDetails[]).map((purchase) => ({
      ...purchase,
      purchase_payment_lines: [...(purchase.purchase_payment_lines ?? [])]
        .sort((left, right) => left.sort_order - right.sort_order),
      purchase_payment_reimbursements: [...(purchase.purchase_payment_reimbursements ?? [])]
        .sort((left, right) => right.reimbursement_date.localeCompare(left.reimbursement_date)
          || right.created_at.localeCompare(left.created_at)),
    })),
    journalEntries: ((entriesResult.data ?? []) as JournalEntry[]).map((entry) => ({
      ...entry,
      journal_lines: [...(entry.journal_lines ?? [])]
        .sort((left, right) => left.sort_order - right.sort_order),
    })),
    payments: (paymentsResult.data ?? []) as AccountingPayment[],
    periods: (periodsResult.data ?? []) as AccountingPeriod[],
  };
}

export async function createPurchasePayment(input: PurchasePaymentInput) {
  const validationError = validateAttachmentFiles(input.attachments);
  if (validationError) throw new Error(validationError);
  if (input.attachments.length === 0) throw new Error("Legg ved kvittering eller salgsdokument.");
  if (!input.supplierName.trim()) throw new Error("Leverandørnavn mangler.");
  if (!input.purchaseDate) throw new Error("Kjøpsdato mangler.");
  if (!input.description.trim()) throw new Error("Formålet med kjøpet mangler.");
  if (!input.settlementAccountId) throw new Error("Velg konto eller kort som ble brukt.");
  if (input.paymentSource === "private" && !input.paidBy.trim()) {
    throw new Error("Oppgi hvem som la ut for kjøpet.");
  }
  if (input.lines.length === 0) throw new Error("Legg til minst én kostnadslinje.");

  const lines = input.lines.map((line) => {
    const calculated = calculateSupplierLine(line);
    if (!line.description.trim() || !line.expenseAccountId || calculated.grossAmount <= 0) {
      throw new Error("Alle kostnadslinjer må ha tekst, konto og et beløp over 0.");
    }
    return {
      description: line.description.trim(),
      expense_account_id: line.expenseAccountId,
      net_amount: calculated.netAmount,
      vat_rate: calculated.vatRate,
      vat_amount: calculated.vatAmount,
      gross_amount: calculated.grossAmount,
    };
  });

  const purchaseId = crypto.randomUUID();
  const uploadedPaths: string[] = [];
  const attachments: Array<Record<string, string | number>> = [];

  try {
    for (const file of input.attachments) {
      const attachmentId = crypto.randomUUID();
      const storagePath = `${input.ownerUserId}/purchase-payments/${purchaseId}/${attachmentId}${fileExtension(file)}`;
      const { error } = await supabase.storage
        .from(ACCOUNTING_DOCUMENT_BUCKET)
        .upload(storagePath, file, { contentType: file.type, upsert: false });
      if (error) throw new Error(`Kunne ikke laste opp ${file.name}: ${error.message}`);
      uploadedPaths.push(storagePath);
      attachments.push({
        id: attachmentId,
        storage_path: storagePath,
        original_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
      });
    }

    const { error } = await supabase.rpc("create_purchase_payment", {
      p_purchase_id: purchaseId,
      p_supplier_name: input.supplierName.trim(),
      p_supplier_org_number: input.supplierOrgNumber.replace(/\D/g, "") || null,
      p_purchase_date: input.purchaseDate,
      p_description: input.description.trim(),
      p_payment_source: input.paymentSource,
      p_settlement_account_id: input.settlementAccountId,
      p_paid_by: input.paymentSource === "private" ? input.paidBy.trim() : null,
      p_lines: lines,
      p_attachments: attachments,
    });
    if (error) throw error;
    return purchaseId;
  } catch (error) {
    if (uploadedPaths.length > 0) {
      await supabase.storage.from(ACCOUNTING_DOCUMENT_BUCKET).remove(uploadedPaths);
    }
    throw error;
  }
}

export async function reimbursePurchasePayment(
  purchaseId: string,
  reimbursementDate: string,
  bankAccountId: string,
  amount: number,
) {
  const { error } = await supabase.rpc("reimburse_purchase_payment", {
    p_purchase_id: purchaseId,
    p_reimbursement_date: reimbursementDate,
    p_bank_account_id: bankAccountId,
    p_amount: amount,
  });
  if (error) throw error;
}

export async function reversePurchasePaymentReimbursement(reimbursementId: string, reversalDate: string) {
  const { error } = await supabase.rpc("reverse_purchase_reimbursement", {
    p_reimbursement_id: reimbursementId,
    p_reversal_date: reversalDate,
  });
  if (error) throw error;
}

export function purchaseReimbursementTotals(purchase: PurchasePaymentWithDetails) {
  const reimbursed = roundMoney((purchase.purchase_payment_reimbursements ?? [])
    .filter((reimbursement) => reimbursement.status === "active")
    .reduce((sum, reimbursement) => sum + Number(reimbursement.amount), 0));
  return {
    reimbursed,
    remaining: roundMoney(Math.max(0, Number(purchase.total) - reimbursed)),
  };
}

export async function cancelPurchasePayment(purchaseId: string, cancellationDate: string) {
  const { error } = await supabase.rpc("cancel_purchase_payment", {
    p_purchase_id: purchaseId,
    p_cancellation_date: cancellationDate,
  });
  if (error) throw error;
}

export async function createSupplier(input: SupplierInput) {
  if (!input.name.trim()) throw new Error("Leverandørnavn mangler.");

  const { data, error } = await supabase
    .from("suppliers")
    .insert({
      owner_user_id: input.ownerUserId,
      name: input.name.trim(),
      org_number: input.orgNumber.replace(/\D/g, "") || null,
      email: input.email.trim() || null,
      bank_account: input.bankAccount.replace(/\s/g, "") || null,
      notes: input.notes.trim() || null,
      default_expense_account_id: input.defaultExpenseAccountId,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as Supplier;
}

export async function createSupplierInvoice(input: SupplierInvoiceInput) {
  const validationError = validateAttachmentFiles(input.attachments);
  if (validationError) throw new Error(validationError);
  if (input.attachments.length === 0) throw new Error("Legg ved den mottatte fakturaen som originaldokument.");
  if (!input.supplierId) throw new Error("Velg en leverandør.");
  if (!input.invoiceNumber.trim()) throw new Error("Fakturanummer mangler.");
  if (!input.invoiceDate) throw new Error("Fakturadato mangler.");
  const kid = input.kid.replace(/\D/g, "");
  if (kid && (kid.length < 2 || kid.length > 25)) throw new Error("KID må inneholde 2 til 25 sifre.");
  if (input.lines.length === 0) throw new Error("Legg til minst én kostnadslinje.");
  const currency = input.currency.trim().toUpperCase();
  const exchangeRate = currency === "NOK" ? 1 : Number(input.exchangeRate);
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Valutakoden er ugyldig.");
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) throw new Error("Valutakursen må være større enn 0.");

  const lines = input.lines.map((line) => {
    const original = calculateSupplierLine(line);
    if (!line.description.trim() || !line.expenseAccountId || original.grossAmount <= 0) {
      throw new Error("Alle kostnadslinjer må ha tekst, konto og et beløp over 0.");
    }
    const netAmount = roundMoney(original.netAmount * exchangeRate);
    const vatAmount = roundMoney(original.vatAmount * exchangeRate);
    return {
      description: line.description.trim(),
      expense_account_id: line.expenseAccountId,
      net_amount: netAmount,
      vat_rate: original.vatRate,
      vat_amount: vatAmount,
      gross_amount: roundMoney(netAmount + vatAmount),
      original_net_amount: original.netAmount,
      original_vat_amount: original.vatAmount,
      original_gross_amount: original.grossAmount,
    };
  });

  const invoiceId = crypto.randomUUID();
  const uploadedPaths: string[] = [];
  const attachments: Array<Record<string, string | number>> = [];

  try {
    for (const file of input.attachments) {
      const attachmentId = crypto.randomUUID();
      const storagePath = `${input.ownerUserId}/supplier-invoices/${invoiceId}/${attachmentId}${fileExtension(file)}`;
      const { error } = await supabase.storage
        .from(ACCOUNTING_DOCUMENT_BUCKET)
        .upload(storagePath, file, { contentType: file.type, upsert: false });
      if (error) throw new Error(`Kunne ikke laste opp ${file.name}: ${error.message}`);
      uploadedPaths.push(storagePath);
      attachments.push({
        id: attachmentId,
        storage_path: storagePath,
        original_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
      });
    }

    const { error } = await supabase.rpc("create_supplier_invoice", {
      p_invoice_id: invoiceId,
      p_supplier_id: input.supplierId,
      p_invoice_number: input.invoiceNumber.trim(),
      p_invoice_date: input.invoiceDate,
      p_due_date: input.dueDate || null,
      p_kid: kid || null,
      p_currency: currency,
      p_exchange_rate: exchangeRate,
      p_exchange_rate_date: currency === "NOK" ? input.invoiceDate : input.exchangeRateDate || input.invoiceDate,
      p_exchange_rate_source: currency === "NOK" ? "NOK" : input.exchangeRateSource.trim() || "Manuelt oppgitt",
      p_description: input.description.trim() || null,
      p_lines: lines,
      p_attachments: attachments,
      p_mark_paid: input.markPaid,
      p_payment_date: input.markPaid ? input.paymentDate || input.invoiceDate : null,
      p_bank_account_id: input.markPaid ? input.bankAccountId : null,
      p_payment_amount_nok: input.markPaid
        ? input.paymentAmountNok || null
        : null,
    });
    if (error) throw error;

    return invoiceId;
  } catch (error) {
    if (uploadedPaths.length > 0) {
      await supabase.storage.from(ACCOUNTING_DOCUMENT_BUCKET).remove(uploadedPaths);
    }
    throw error;
  }
}

export async function createManualJournalEntry(
  entryDate: string,
  description: string,
  lines: ManualJournalLineInput[],
) {
  const { data, error } = await supabase.rpc("create_manual_journal_entry", {
    p_entry_date: entryDate,
    p_description: description.trim(),
    p_lines: lines.map((line) => ({
      account_id: line.accountId,
      description: line.description.trim() || null,
      debit: line.debit,
      credit: line.credit,
    })),
  });
  if (error) throw error;
  return data as string;
}

export async function setSupplierInvoicePaid(
  invoiceId: string,
  paid: boolean,
  paymentDate: string,
  bankAccountId: string | null = null,
  paidAmountNok: number | null = null,
) {
  const { error } = await supabase.rpc("set_supplier_invoice_paid", {
    p_supplier_invoice_id: invoiceId,
    p_paid: paid,
    p_payment_date: paymentDate,
    p_bank_account_id: bankAccountId,
    p_paid_amount_nok: paidAmountNok,
  });
  if (error) throw error;
}

export async function cancelSupplierInvoice(invoiceId: string, cancellationDate: string) {
  const { error } = await supabase.rpc("cancel_supplier_invoice", {
    p_supplier_invoice_id: invoiceId,
    p_cancellation_date: cancellationDate,
  });
  if (error) throw error;
}

export async function setAccountingPeriodStatus(
  year: number,
  month: number,
  status: "open" | "closed",
) {
  const { error } = await supabase.rpc("set_accounting_period_status", {
    p_year: year,
    p_month: month,
    p_status: status,
  });
  if (error) throw error;
}

export async function setAccountingAccountActive(accountId: string, isActive: boolean) {
  const { error } = await supabase
    .from("accounting_accounts")
    .update({ is_active: isActive })
    .eq("id", accountId);
  if (error) throw error;
}

export async function createAccountingAccount(
  ownerUserId: string,
  accountNumber: string,
  name: string,
  category: AccountingAccountCategory,
) {
  if (!/^\d{4}$/.test(accountNumber)) throw new Error("Kontonummeret må ha fire siffer.");
  if (!name.trim()) throw new Error("Kontonavn mangler.");
  const { data, error } = await supabase
    .from("accounting_accounts")
    .insert({
      owner_user_id: ownerUserId,
      account_number: accountNumber,
      name: name.trim(),
      category,
      is_system: false,
      system_key: null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as AccountingAccount;
}

export async function downloadSupplierInvoiceAttachment(
  storagePath: string,
  originalName: string,
) {
  const { data, error } = await supabase.storage
    .from(ACCOUNTING_DOCUMENT_BUCKET)
    .download(storagePath);
  if (error) throw error;

  const url = URL.createObjectURL(data);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = originalName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function fileExtension(file: File) {
  if (file.type === "application/pdf") return ".pdf";
  if (file.type === "image/jpeg") return ".jpg";
  if (file.type === "image/png") return ".png";
  return "";
}
