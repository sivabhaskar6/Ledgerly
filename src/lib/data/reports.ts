import Papa from "papaparse";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
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
  id?: string;
  date: string;
  category: string;
  title: string;
  account: string;
  method: string;
  note: string;
  amountPaise: number;
  type: "expense" | "income";
};

export type FullReport = {
  totalExpensePaise: number;
  totalIncomePaise: number;
  netSavingsPaise: number;
  savingsRatePct: number | null;
  transactionCount: number;
  expenseCount: number;
  incomeCount: number;
  categoryRows: CategoryReportRow[];
  accountRows: AccountReportRow[];
  methodRows: PaymentMethodReportRow[];
  transactions: TransactionReportRow[];
};

export const sourceLabel = (v: string) => {
  const map: Record<string, string> = {
    salary: "Salary",
    business: "Business",
    dividend: "Dividend",
    stock_profit: "Stock Profit",
    fno_trading: "F&O Trading",
    ipo_gain: "IPO Listing",
    crypto: "Crypto",
    rental: "Rental",
    other: "Other Income",
  };
  return map[v] || v;
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
  let incQuery = db
    .from("income")
    .select("id, amount_paise, occurred_on, title, source, note")
    .is("deleted_at", null);
  if (filter.from) incQuery = incQuery.gte("occurred_on", filter.from);
  if (filter.to) incQuery = incQuery.lte("occurred_on", filter.to);

  let totalIncomePaise = 0;
  const incomeRows: Array<{
    id: string;
    amount_paise: number;
    occurred_on: string;
    title: string;
    source: string;
    note: string | null;
  }> = [];

  try {
    let { data: incomeData, error: incErr } = await incQuery;
    if (incErr && /deleted_at/i.test(incErr.message)) {
      let fbQuery = db
        .from("income")
        .select("id, amount_paise, occurred_on, title, source, note");
      if (filter.from) fbQuery = fbQuery.gte("occurred_on", filter.from);
      if (filter.to) fbQuery = fbQuery.lte("occurred_on", filter.to);
      const fb = await fbQuery;
      incomeData = fb.data;
      incErr = fb.error;
    }
    if (!incErr && incomeData) {
      for (const r of incomeData) {
        const paise = Number(r.amount_paise);
        totalIncomePaise += paise;
        incomeRows.push({
          id: r.id,
          amount_paise: paise,
          occurred_on: r.occurred_on,
          title: r.title,
          source: r.source,
          note: r.note,
        });
      }
    }

    // Also include any unsynced non-deleted F&O trades (where income_id is null)
    let fnoQuery = db
      .from("fno_trades")
      .select("id, symbol, instrument_type, strike_price_paise, net_pnl_paise, occurred_on, note")
      .is("income_id", null)
      .is("deleted_at", null);
    if (filter.from) fnoQuery = fnoQuery.gte("occurred_on", filter.from);
    if (filter.to) fnoQuery = fnoQuery.lte("occurred_on", filter.to);
    const fnoRes = await fnoQuery;
    let unsyncedTrades = fnoRes.data;
    if (fnoRes.error && /deleted_at/i.test(fnoRes.error.message)) {
      let fbFno = db
        .from("fno_trades")
        .select("id, symbol, instrument_type, strike_price_paise, net_pnl_paise, occurred_on, note")
        .is("income_id", null);
      if (filter.from) fbFno = fbFno.gte("occurred_on", filter.from);
      if (filter.to) fbFno = fbFno.lte("occurred_on", filter.to);
      const fb = await fbFno;
      unsyncedTrades = fb.data;
    }
    if (unsyncedTrades) {
      for (const t of unsyncedTrades) {
        const paise = Number(t.net_pnl_paise || 0);
        totalIncomePaise += paise;
        incomeRows.push({
          id: `fno_${t.id}`,
          amount_paise: paise,
          occurred_on: t.occurred_on,
          title: `${t.symbol} ${t.instrument_type || ""}`.trim(),
          source: "fno_trading",
          note: t.note || (paise >= 0 ? "Realized F&O profit" : "Realized F&O loss"),
        });
      }
    }

    // Also include any unsynced non-deleted IPO listing gains (where income_id is null)
    let ipoQuery = db
      .from("ipo_gains")
      .select("id, symbol, name, net_pnl_paise, occurred_on, note")
      .is("income_id", null)
      .is("deleted_at", null);
    if (filter.from) ipoQuery = ipoQuery.gte("occurred_on", filter.from);
    if (filter.to) ipoQuery = ipoQuery.lte("occurred_on", filter.to);
    const ipoRes = await ipoQuery;
    let unsyncedIpos = ipoRes.data;
    if (ipoRes.error && /deleted_at/i.test(ipoRes.error.message)) {
      let fbIpo = db
        .from("ipo_gains")
        .select("id, symbol, name, net_pnl_paise, occurred_on, note")
        .is("income_id", null);
      if (filter.from) fbIpo = fbIpo.gte("occurred_on", filter.from);
      if (filter.to) fbIpo = fbIpo.lte("occurred_on", filter.to);
      const fb = await fbIpo;
      unsyncedIpos = fb.data;
    }
    if (unsyncedIpos) {
      for (const ipo of unsyncedIpos) {
        const paise = Number(ipo.net_pnl_paise || 0);
        totalIncomePaise += paise;
        incomeRows.push({
          id: `ipo_${ipo.id}`,
          amount_paise: paise,
          occurred_on: ipo.occurred_on,
          title: `${ipo.symbol} - ${ipo.name || "Listing Gain"}`,
          source: "ipo_gain",
          note: ipo.note || "IPO Listing Gain",
        });
      }
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
      type: "expense",
    });
  }

  // Include income rows in scope if not filtering specifically by an expense category
  if (!filter.categoryId) {
    for (const inc of incomeRows) {
      txRows.push({
        id: inc.id,
        date: inc.occurred_on,
        category: sourceLabel(inc.source),
        title: inc.title,
        account: "Income",
        method: "DIRECT",
        note: inc.note || "",
        amountPaise: inc.amount_paise,
        type: "income",
      });
    }
  }

  // Sort chronologically newest first
  txRows.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));

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
    transactionCount: txRows.length,
    expenseCount: expenses?.length ?? 0,
    incomeCount: txRows.length - (expenses?.length ?? 0),
    categoryRows,
    accountRows,
    methodRows,
    transactions: txRows,
  };
}

export type ExportReportOptions = {
  dateRangeLabel?: string;
  categoryLabel?: string;
  accountLabel?: string;
  filename?: string;
};

export function formatINRNumber(paise: number): string {
  const abs = Math.abs(paise) / 100;
  const parts = abs.toFixed(2).split(".");
  let intPart = parts[0] ?? "0";
  const decPart = parts[1] ?? "00";
  if (intPart.length > 3) {
    const last3 = intPart.substring(intPart.length - 3);
    const rest = intPart.substring(0, intPart.length - 3);
    intPart = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3;
  }
  const sign = paise < 0 ? "-" : "";
  return `${sign}${intPart}.${decPart}`;
}

export function normalizeExportOptions(
  opt?: string | ExportReportOptions,
  defaultExt = "xlsx"
): {
  dateRangeLabel: string;
  categoryLabel: string;
  accountLabel: string;
  filename: string;
} {
  if (typeof opt === "string") {
    return {
      dateRangeLabel: "Selected Period",
      categoryLabel: "All Categories",
      accountLabel: "All Accounts",
      filename: opt.endsWith(`.${defaultExt}`) ? opt : `${opt}.${defaultExt}`,
    };
  }
  const dateRangeLabel = opt?.dateRangeLabel || "Selected Period";
  const categoryLabel = opt?.categoryLabel || "All Categories";
  const accountLabel = opt?.accountLabel || "All Accounts";
  const rawFilename = opt?.filename || `ledgerly_financial_report`;
  const filename = rawFilename.endsWith(`.${defaultExt}`)
    ? rawFilename
    : `${rawFilename}.${defaultExt}`;
  return { dateRangeLabel, categoryLabel, accountLabel, filename };
}

export function buildReportCSV(
  report: FullReport,
  options?: string | ExportReportOptions
): { filename: string; content: string } {
  const opt = normalizeExportOptions(options, "csv");
  const sections: (string | number)[][] = [];

  // 1. Header & Scope
  sections.push(["LEDGERLY FINANCIAL REPORT & AUDIT STATEMENT"]);
  sections.push(["Scope", opt.dateRangeLabel]);
  sections.push(["Category Scope", opt.categoryLabel]);
  sections.push(["Account Scope", opt.accountLabel]);
  sections.push(["Generated On", new Date().toLocaleString("en-IN")]);
  sections.push([]);

  // 2. Executive Financial Summary
  sections.push(["=== EXECUTIVE FINANCIAL SUMMARY ==="]);
  sections.push(["Metric", "Amount (INR)", "Scope Details"]);
  sections.push([
    "Total Income & P&L Credits",
    Number(paiseToRupeesString(report.totalIncomePaise)),
    `${report.incomeCount} records`,
  ]);
  sections.push([
    "Total Expenses Debited",
    Number(paiseToRupeesString(report.totalExpensePaise)),
    `${report.expenseCount} records`,
  ]);
  sections.push([
    "Net Savings / Net P&L",
    Number(paiseToRupeesString(report.netSavingsPaise)),
    report.netSavingsPaise >= 0 ? "Net Surplus (+)" : "Net Deficit (-)",
  ]);
  sections.push([
    "Savings Retention Rate",
    report.savingsRatePct !== null ? `${report.savingsRatePct}%` : "N/A",
    "% of income retained",
  ]);
  sections.push([
    "Total Scope Transactions",
    report.transactionCount,
    `${report.expenseCount} Expenses + ${report.incomeCount} Income/Trades`,
  ]);
  sections.push([]);

  // 3. Category Breakdown (Expenses)
  sections.push(["=== CATEGORY BREAKDOWN (EXPENSES) ==="]);
  sections.push([
    "Rank",
    "Category Name",
    "Total Spent (INR)",
    "Share (%)",
    "Transaction Count",
  ]);
  report.categoryRows.forEach((c, i) => {
    sections.push([
      i + 1,
      c.categoryName,
      Number(paiseToRupeesString(c.amountPaise)),
      `${c.percentage}%`,
      c.count,
    ]);
  });
  sections.push([
    "",
    "Total Expenses",
    Number(paiseToRupeesString(report.totalExpensePaise)),
    "100.0%",
    report.expenseCount,
  ]);
  sections.push([]);

  // 4. Account Activity Distribution
  if (report.accountRows.length > 0) {
    sections.push(["=== ACCOUNT ACTIVITY DISTRIBUTION ==="]);
    sections.push(["Rank", "Account Name", "Total Activity (INR)", "Transaction Count"]);
    report.accountRows.forEach((a, i) => {
      sections.push([
        i + 1,
        a.accountName,
        Number(paiseToRupeesString(a.amountPaise)),
        a.count,
      ]);
    });
    sections.push([]);
  }

  // 5. Complete In-Scope Transactions Ledger
  sections.push(["=== COMPLETE IN-SCOPE TRANSACTIONS LEDGER ==="]);
  sections.push([
    "Date",
    "Flow Type",
    "Category / Source",
    "Title",
    "Description / Note",
    "Account",
    "Payment Method",
    "Net Amount (INR)",
    "Cash Flow Direction",
  ]);
  report.transactions.forEach((t) => {
    const isInc = t.type === "income";
    const sign = isInc ? (t.amountPaise >= 0 ? "+" : "-") : "-";
    sections.push([
      t.date,
      isInc ? "Income / Trading" : "Expense",
      t.category,
      t.title,
      t.note || "",
      t.account,
      t.method,
      `${sign}${paiseToRupeesString(Math.abs(t.amountPaise))}`,
      isInc
        ? t.amountPaise >= 0
          ? "Credit (+)"
          : "Trading Loss (-)"
        : "Debit (-)",
    ]);
  });
  sections.push([
    "TOTALS",
    `${report.transactions.length} records`,
    "",
    "",
    "",
    "",
    "Net Balance:",
    Number(paiseToRupeesString(report.netSavingsPaise)),
    report.netSavingsPaise >= 0 ? "Surplus (+)" : "Deficit (-)",
  ]);

  const content = Papa.unparse(sections);
  return { filename: opt.filename, content };
}

export function exportReportToCSV(
  report: FullReport,
  options?: string | ExportReportOptions
) {
  const { filename, content } = buildReportCSV(report, options);
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  return content;
}

export function buildReportExcelWorkbook(
  report: FullReport,
  options?: string | ExportReportOptions
): { filename: string; workbook: XLSX.WorkBook } {
  const opt = normalizeExportOptions(options, "xlsx");
  const wb = XLSX.utils.book_new();

  // Sheet 1: Full Financial Report (Comprehensive view with All KPI Cards, Category Breakdown, Account Activity, AND Complete Transactions Ledger)
  const fullReportAoa: (string | number)[][] = [
    ["LEDGERLY FINANCIAL REPORT & AUDIT STATEMENT"],
    ["Date Range:", opt.dateRangeLabel],
    ["Category Scope:", opt.categoryLabel],
    ["Account Scope:", opt.accountLabel],
    ["Generated On:", new Date().toLocaleString("en-IN")],
    [],
    ["EXECUTIVE FINANCIAL SUMMARY", "AMOUNT (INR)", "SCOPE BREAKDOWN"],
    [
      "Total Income & P&L Credits",
      Number(paiseToRupeesString(report.totalIncomePaise)),
      `${report.incomeCount} records`,
    ],
    [
      "Total Expenses Debited",
      Number(paiseToRupeesString(report.totalExpensePaise)),
      `${report.expenseCount} records`,
    ],
    [
      "Net Savings / Net P&L",
      Number(paiseToRupeesString(report.netSavingsPaise)),
      report.netSavingsPaise >= 0 ? "Net Surplus (+)" : "Net Deficit (-)",
    ],
    [
      "Savings Retention Rate",
      report.savingsRatePct !== null ? `${report.savingsRatePct}%` : "N/A",
      "% of income retained",
    ],
    [
      "Total Scope Transactions",
      report.transactionCount,
      `${report.expenseCount} Expenses + ${report.incomeCount} Income/Trades`,
    ],
    [],
    ["CATEGORY BREAKDOWN (EXPENSES)"],
    ["Rank", "Category Name", "Total Spent (INR)", "Share (%)", "Transaction Count"],
    ...report.categoryRows.map((c, i) => [
      i + 1,
      c.categoryName,
      Number(paiseToRupeesString(c.amountPaise)),
      `${c.percentage}%`,
      c.count,
    ]),
    [
      "",
      "Total Expenses",
      Number(paiseToRupeesString(report.totalExpensePaise)),
      "100.0%",
      report.expenseCount,
    ],
    [],
    ["ACCOUNT ACTIVITY DISTRIBUTION"],
    ["Rank", "Account Name", "Total Activity (INR)", "Transaction Count"],
    ...report.accountRows.map((a, i) => [
      i + 1,
      a.accountName,
      Number(paiseToRupeesString(a.amountPaise)),
      a.count,
    ]),
    [],
    ["COMPLETE IN-SCOPE TRANSACTIONS LEDGER"],
    [
      "Date",
      "Flow Type",
      "Category / Source",
      "Title",
      "Description / Note",
      "Account",
      "Payment Method",
      "Net Amount (INR)",
      "Cash Flow Impact",
    ],
    ...report.transactions.map((t) => [
      t.date,
      t.type === "income" ? "Income / Trading" : "Expense",
      t.category,
      t.title,
      t.note || "",
      t.account,
      t.method,
      Number(paiseToRupeesString(t.amountPaise)),
      t.type === "income"
        ? t.amountPaise >= 0
          ? "Credit (+)"
          : "Trading Loss (-)"
        : "Debit (-)",
    ]),
    [
      "TOTALS",
      `${report.transactions.length} records`,
      "",
      "",
      "",
      "",
      "Net Balance:",
      Number(paiseToRupeesString(report.netSavingsPaise)),
      report.netSavingsPaise >= 0 ? "Surplus (+)" : "Deficit (-)",
    ],
  ];

  const fullReportSheet = XLSX.utils.aoa_to_sheet(fullReportAoa);
  fullReportSheet["!cols"] = [
    { wch: 14 },
    { wch: 20 },
    { wch: 26 },
    { wch: 34 },
    { wch: 36 },
    { wch: 20 },
    { wch: 16 },
    { wch: 18 },
    { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(wb, fullReportSheet, "Full Financial Report");

  // Sheet 2: All Transactions (Clean Tabular Data)
  const txAoa: (string | number)[][] = [
    ["ITEMIZED TRANSACTIONS & CASH FLOW AUDIT"],
    ["Scope:", opt.dateRangeLabel, "Total Transactions:", report.transactions.length],
    [],
    [
      "Date",
      "Flow Type",
      "Category / Source",
      "Title",
      "Description / Note",
      "Account",
      "Payment Method",
      "Net Amount (INR)",
      "Cash Flow Impact",
    ],
    ...report.transactions.map((t) => [
      t.date,
      t.type === "income" ? "Income / Trading" : "Expense",
      t.category,
      t.title,
      t.note || "",
      t.account,
      t.method,
      Number(paiseToRupeesString(t.amountPaise)),
      t.type === "income"
        ? t.amountPaise >= 0
          ? "Credit (+)"
          : "Trading Loss (-)"
        : "Debit (-)",
    ]),
    [
      "TOTALS",
      `${report.transactions.length} records`,
      "",
      "",
      "",
      "",
      "Net Balance:",
      Number(paiseToRupeesString(report.netSavingsPaise)),
      report.netSavingsPaise >= 0 ? "Surplus (+)" : "Deficit (-)",
    ],
  ];
  const txSheet = XLSX.utils.aoa_to_sheet(txAoa);
  txSheet["!cols"] = [
    { wch: 13 },
    { wch: 18 },
    { wch: 24 },
    { wch: 32 },
    { wch: 36 },
    { wch: 18 },
    { wch: 16 },
    { wch: 18 },
    { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(wb, txSheet, "All Transactions");

  // Sheet 3: Category Breakdown (Deep Dive)
  const categoryAoa: (string | number)[][] = [
    ["CATEGORY BREAKDOWN - DETAILED AUDIT"],
    ["Scope:", opt.dateRangeLabel],
    [],
    ["Rank", "Category Name", "Total Spent (INR)", "Share (%)", "Transactions", "Average / Tx (INR)"],
    ...report.categoryRows.map((c, i) => [
      i + 1,
      c.categoryName,
      Number(paiseToRupeesString(c.amountPaise)),
      `${c.percentage}%`,
      c.count,
      c.count > 0 ? Number((c.amountPaise / (c.count * 100)).toFixed(2)) : 0,
    ]),
    [
      "",
      "TOTAL",
      Number(paiseToRupeesString(report.totalExpensePaise)),
      "100.0%",
      report.expenseCount,
      report.expenseCount > 0
        ? Number((report.totalExpensePaise / (report.expenseCount * 100)).toFixed(2))
        : 0,
    ],
  ];
  const categorySheet = XLSX.utils.aoa_to_sheet(categoryAoa);
  categorySheet["!cols"] = [
    { wch: 8 },
    { wch: 28 },
    { wch: 20 },
    { wch: 14 },
    { wch: 16 },
    { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, categorySheet, "Category Breakdown");

  // Sheet 4: Account Distribution
  const accountAoa: (string | number)[][] = [
    ["ACCOUNT DISTRIBUTION - DETAILED AUDIT"],
    ["Scope:", opt.dateRangeLabel],
    [],
    ["Rank", "Account Name", "Total Activity (INR)", "Transactions"],
    ...report.accountRows.map((a, i) => [
      i + 1,
      a.accountName,
      Number(paiseToRupeesString(a.amountPaise)),
      a.count,
    ]),
  ];
  const accountSheet = XLSX.utils.aoa_to_sheet(accountAoa);
  accountSheet["!cols"] = [
    { wch: 8 },
    { wch: 28 },
    { wch: 22 },
    { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(wb, accountSheet, "Account Distribution");

  return { filename: opt.filename, workbook: wb };
}

export function exportReportToExcel(
  report: FullReport,
  options?: string | ExportReportOptions
) {
  const { filename, workbook } = buildReportExcelWorkbook(report, options);
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    const wbout = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  return workbook;
}

export function buildReportPDFDoc(
  report: FullReport,
  options?: string | ExportReportOptions
): { filename: string; doc: jsPDF } {
  const opt = normalizeExportOptions(options, "pdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // Document Branding Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(30, 41, 59);
  doc.text("LEDGERLY", 14, 15);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(59, 130, 246);
  doc.text("FINANCIAL STATEMENT & AUDIT REPORT", 14, 21);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Scope: ${opt.dateRangeLabel}`, 14, 27);
  doc.text(`Filters: ${opt.categoryLabel} | ${opt.accountLabel}`, 14, 32);
  doc.text(`Generated On: ${new Date().toLocaleString("en-IN")}`, 14, 37);

  // Decorative divider line
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.line(14, 40, 196, 40);

  // Section 1: Executive Financial Summary Table
  autoTable(doc, {
    startY: 44,
    head: [["Executive Financial Indicator", "Amount (INR)", "Scope & Status"]],
    body: [
      [
        "Total Income & P&L Credits",
        (report.totalIncomePaise >= 0 ? "+" : "") +
          "Rs. " +
          formatINRNumber(report.totalIncomePaise),
        `${report.incomeCount} records`,
      ],
      [
        "Total Expenses Debited",
        "-Rs. " + formatINRNumber(report.totalExpensePaise),
        `${report.expenseCount} records`,
      ],
      [
        "Net Savings / Net P&L",
        (report.netSavingsPaise >= 0 ? "+Rs. " : "-Rs. ") +
          formatINRNumber(Math.abs(report.netSavingsPaise)),
        report.netSavingsPaise >= 0 ? "Net Surplus (+)" : "Net Deficit (-)",
      ],
      [
        "Savings Retention Rate",
        report.savingsRatePct !== null ? `${report.savingsRatePct}%` : "N/A",
        `${report.transactionCount} total scope transactions`,
      ],
    ],
    theme: "striped",
    headStyles: {
      fillColor: [37, 99, 235],
      textColor: 255,
      fontStyle: "bold",
      fontSize: 9,
    },
    bodyStyles: { fontSize: 8.5, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 70, fontStyle: "bold" },
      1: { cellWidth: 45, halign: "right", fontStyle: "bold" },
      2: { halign: "left" },
    },
  });

  // Section 2: Category Breakdown Table
  let currentY = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY ?? 90) + 7;
  if (report.categoryRows.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    doc.text(`1. Category Breakdown (${report.categoryRows.length} categories)`, 14, currentY);

    autoTable(doc, {
      startY: currentY + 3,
      head: [["#", "Category Name", "Total Spent (INR)", "Share (%)", "Transactions"]],
      body: report.categoryRows.map((c, i) => [
        (i + 1).toString(),
        c.categoryName,
        "Rs. " + formatINRNumber(c.amountPaise),
        `${c.percentage}%`,
        c.count.toString(),
      ]),
      foot: [
        [
          "",
          "Total Expenses",
          "Rs. " + formatINRNumber(report.totalExpensePaise),
          "100.0%",
          report.expenseCount.toString(),
        ],
      ],
      theme: "grid",
      headStyles: {
        fillColor: [71, 85, 105],
        textColor: 255,
        fontStyle: "bold",
        fontSize: 8,
      },
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: "bold",
        fontSize: 8,
      },
      bodyStyles: { fontSize: 8, cellPadding: 1.8 },
      columnStyles: {
        0: { cellWidth: 10, halign: "center" },
        2: { halign: "right", fontStyle: "bold" },
        3: { halign: "right" },
        4: { halign: "center" },
      },
    });

    currentY = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY ?? currentY) + 7;
  }

  // Section 3: Account Distribution Table
  if (report.accountRows.length > 0 && currentY < 230) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    doc.text(`2. Account Activity Distribution (${report.accountRows.length} accounts)`, 14, currentY);

    autoTable(doc, {
      startY: currentY + 3,
      head: [["#", "Account Name", "Total Activity (INR)", "Transactions"]],
      body: report.accountRows.map((a, i) => [
        (i + 1).toString(),
        a.accountName,
        "Rs. " + formatINRNumber(a.amountPaise),
        a.count.toString(),
      ]),
      theme: "grid",
      headStyles: {
        fillColor: [71, 85, 105],
        textColor: 255,
        fontStyle: "bold",
        fontSize: 8,
      },
      bodyStyles: { fontSize: 8, cellPadding: 1.8 },
      columnStyles: {
        0: { cellWidth: 10, halign: "center" },
        2: { halign: "right", fontStyle: "bold" },
        3: { halign: "center" },
      },
    });

    currentY = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY ?? currentY) + 7;
  }

  // Section 4: Complete In-Scope Transactions Ledger
  if (report.transactions.length > 0) {
    // If running near bottom of page, add page before starting transactions table
    if (currentY > 230) {
      doc.addPage();
      currentY = 18;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    doc.text(
      `3. Complete In-Scope Transactions Ledger (${report.transactions.length} records)`,
      14,
      currentY
    );

    autoTable(doc, {
      startY: currentY + 3,
      head: [["Date", "Type", "Category", "Title & Note", "Account", "Amount (INR)"]],
      body: report.transactions.map((t) => [
        t.date,
        t.type === "income" ? "Income" : "Expense",
        t.category,
        t.note ? `${t.title} (${t.note})` : t.title,
        t.account,
        (t.type === "income"
          ? t.amountPaise >= 0
            ? "+Rs. "
            : "-Rs. "
          : "-Rs. ") + formatINRNumber(Math.abs(t.amountPaise)),
      ]),
      foot: [
        [
          "",
          "",
          "",
          "Net Scope Balance",
          "",
          (report.netSavingsPaise >= 0 ? "+Rs. " : "-Rs. ") +
            formatINRNumber(Math.abs(report.netSavingsPaise)),
        ],
      ],
      theme: "grid",
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: 255,
        fontStyle: "bold",
        fontSize: 7.5,
      },
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: "bold",
        fontSize: 8,
      },
      bodyStyles: { fontSize: 7.5, cellPadding: 1.8 },
      columnStyles: {
        0: { cellWidth: 20, halign: "center" },
        1: { cellWidth: 16, halign: "center" },
        2: { cellWidth: 28 },
        3: { cellWidth: "auto" },
        4: { cellWidth: 22 },
        5: { cellWidth: 28, halign: "right", fontStyle: "bold" },
      },
    });
  }

  // Draw running page footer on all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.setDrawColor(226, 232, 240);
    doc.line(14, 286, 196, 286);
    doc.text("Ledgerly Financial Statement · Confidential", 14, 290);
    doc.text(`Page ${i} of ${totalPages}`, 196, 290, { align: "right" });
  }

  return { filename: opt.filename, doc };
}

export function exportReportToPDF(
  report: FullReport,
  options?: string | ExportReportOptions
) {
  const { filename, doc } = buildReportPDFDoc(report, options);
  if (typeof window !== "undefined") {
    doc.save(filename);
  }
  return doc;
}
