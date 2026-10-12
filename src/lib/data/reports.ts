import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { SupabaseClient } from "@supabase/supabase-js";
import { paiseToRupeesString } from "@/lib/utils/money";

export type ReportFilter = {
  from?: string;
  to?: string;
  categoryId?: string;
  accountId?: string;
};

export type CategoryReportRow = {
  categoryName: string;
  amountPaise: number;
  percentage: number;
  count: number;
};

export type AccountReportRow = {
  accountName: string;
  amountPaise: number;
  count: number;
};

export type PaymentMethodReportRow = {
  method: string;
  amountPaise: number;
  count: number;
};

export type TransactionReportRow = {
  date: string;
  category: string;
  title: string;
  account: string;
  method: string;
  note: string;
  amountPaise: number;
};

export type FullReport = {
  totalExpensePaise: number;
  totalIncomePaise: number;
  netSavingsPaise: number;
  savingsRatePct: number | null;
  transactionCount: number;
  categoryRows: CategoryReportRow[];
  accountRows: AccountReportRow[];
  methodRows: PaymentMethodReportRow[];
  transactions: TransactionReportRow[];
};

export async function fetchFullReport(db: SupabaseClient, filter: ReportFilter): Promise<FullReport> {
  // Query expenses
  let expQuery = db
    .from("transactions")
    .select("occurred_on, amount_paise, title, note, payment_method, category:categories(name), account:accounts(name)")
    .is("deleted_at", null)
    .order("occurred_on", { ascending: false });

  if (filter.from) expQuery = expQuery.gte("occurred_on", filter.from);
  if (filter.to) expQuery = expQuery.lte("occurred_on", filter.to);
  if (filter.categoryId) expQuery = expQuery.eq("category_id", filter.categoryId);
  if (filter.accountId) expQuery = expQuery.eq("account_id", filter.accountId);

  const { data: expenses, error: expErr } = await expQuery;
  if (expErr) throw expErr;

  // Query income (excluding transfers or capital movements)
  let incQuery = db.from("income").select("amount_paise, occurred_on");
  if (filter.from) incQuery = incQuery.gte("occurred_on", filter.from);
  if (filter.to) incQuery = incQuery.lte("occurred_on", filter.to);

  let totalIncomePaise = 0;
  try {
    const { data: incomeData, error: incErr } = await incQuery;
    if (!incErr && incomeData) {
      totalIncomePaise = incomeData.reduce((sum, r) => sum + Number(r.amount_paise), 0);
    }
  } catch {
    // Continue
  }

  let totalExpensePaise = 0;
  const catMap = new Map<string, { total: number; count: number }>();
  const accMap = new Map<string, { total: number; count: number }>();
  const methodMap = new Map<string, { total: number; count: number }>();
  const txRows: TransactionReportRow[] = [];

  for (const t of expenses ?? []) {
    const paise = Number(t.amount_paise);
    totalExpensePaise += paise;

    const catObj = t.category as unknown as { name?: string } | null;
    const catName = catObj?.name || "Uncategorized";
    const accObj = t.account as unknown as { name?: string } | null;
    const accName = accObj?.name || "No Account";
    const method = t.payment_method ? t.payment_method.toUpperCase() : "Unspecified";

    // Category
    const cEntry = catMap.get(catName) || { total: 0, count: 0 };
    catMap.set(catName, { total: cEntry.total + paise, count: cEntry.count + 1 });

    // Account
    const aEntry = accMap.get(accName) || { total: 0, count: 0 };
    accMap.set(accName, { total: aEntry.total + paise, count: aEntry.count + 1 });

    // Method
    const mEntry = methodMap.get(method) || { total: 0, count: 0 };
    methodMap.set(method, { total: mEntry.total + paise, count: mEntry.count + 1 });

    txRows.push({
      date: t.occurred_on,
      category: catName,
      title: t.title,
      account: accName,
      method,
      note: t.note || "",
      amountPaise: paise,
    });
  }

  const categoryRows: CategoryReportRow[] = Array.from(catMap.entries()).map(([categoryName, v]) => ({
    categoryName,
    amountPaise: v.total,
    count: v.count,
    percentage: totalExpensePaise > 0 ? Math.round((v.total / totalExpensePaise) * 1000) / 10 : 0,
  })).sort((a, b) => b.amountPaise - a.amountPaise);

  const accountRows: AccountReportRow[] = Array.from(accMap.entries()).map(([accountName, v]) => ({
    accountName,
    amountPaise: v.total,
    count: v.count,
  })).sort((a, b) => b.amountPaise - a.amountPaise);

  const methodRows: PaymentMethodReportRow[] = Array.from(methodMap.entries()).map(([method, v]) => ({
    method,
    amountPaise: v.total,
    count: v.count,
  })).sort((a, b) => b.amountPaise - a.amountPaise);

  const netSavingsPaise = totalIncomePaise - totalExpensePaise;
  const savingsRatePct = totalIncomePaise > 0
    ? Math.round((netSavingsPaise / totalIncomePaise) * 100)
    : null;

  return {
    totalExpensePaise,
    totalIncomePaise,
    netSavingsPaise,
    savingsRatePct,
    transactionCount: expenses?.length ?? 0,
    categoryRows,
    accountRows,
    methodRows,
    transactions: txRows,
  };
}

export function exportReportToCSV(report: FullReport, filename = "ledgerly_report.csv") {
  const rows = report.transactions.map((t) => ({
    Date: t.date,
    Category: t.category,
    Title: t.title,
    "Amount (INR)": paiseToRupeesString(t.amountPaise),
    Account: t.account,
    "Payment Method": t.method,
    Note: t.note,
  }));

  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportReportToExcel(report: FullReport, filename = "ledgerly_report.xlsx") {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Summary
  const summaryData = [
    ["Financial Metric", "Amount (INR)"],
    ["Total Expenses", paiseToRupeesString(report.totalExpensePaise)],
    ["Total Income", paiseToRupeesString(report.totalIncomePaise)],
    ["Net Savings", paiseToRupeesString(report.netSavingsPaise)],
    ["Savings Rate (%)", report.savingsRatePct !== null ? `${report.savingsRatePct}%` : "N/A"],
    ["Total Transactions", String(report.transactionCount)],
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

  // Sheet 2: Categories
  const categoryData = [
    ["Category", "Total Spent (INR)", "Percentage", "Count"],
    ...report.categoryRows.map((c) => [
      c.categoryName,
      paiseToRupeesString(c.amountPaise),
      `${c.percentage}%`,
      c.count,
    ]),
  ];
  const categorySheet = XLSX.utils.aoa_to_sheet(categoryData);
  XLSX.utils.book_append_sheet(wb, categorySheet, "Categories");

  // Sheet 3: Transactions
  const txData = [
    ["Date", "Category", "Title", "Amount (INR)", "Account", "Payment Method", "Note"],
    ...report.transactions.map((t) => [
      t.date,
      t.category,
      t.title,
      paiseToRupeesString(t.amountPaise),
      t.account,
      t.method,
      t.note,
    ]),
  ];
  const txSheet = XLSX.utils.aoa_to_sheet(txData);
  XLSX.utils.book_append_sheet(wb, txSheet, "Transactions");

  XLSX.writeFile(wb, filename);
}
