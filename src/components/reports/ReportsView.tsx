"use client";
import { useCallback, useEffect, useState, useMemo } from "react";
import { format } from "date-fns";
import {
  FileSpreadsheet,
  FileText,
  Download,
  TrendingUp,
  TrendingDown,
  Receipt,
  Percent,
  Search,
  ChevronLeft,
  ChevronRight,
  PieChart,
  Layers,
  ArrowDownRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  fetchFullReport,
  exportReportToCSV,
  exportReportToExcel,
  exportReportToPDF,
  type FullReport,
} from "@/lib/data/reports";
import { fetchCategories, fetchAccounts } from "@/lib/data/expenses";
import { errorMessage } from "@/lib/data/expenses";
import { formatINR } from "@/lib/utils/money";
import { displayDate, presetRange } from "@/lib/utils/dates";
import type { Account, Category } from "@/types/db";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";

type PresetOption = "month" | "year" | "all" | "custom";
type TxFilter = "all" | "expense" | "income";

const TX_PAGE_SIZE = 25;

export function ReportsView() {
  const { notify } = useToast();
  const [preset, setPreset] = useState<PresetOption>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");

  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [report, setReport] = useState<FullReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<"excel" | "csv" | "pdf" | null>(null);

  // In-scope transaction search, filter & pagination state
  const [txSearch, setTxSearch] = useState("");
  const [txFilter, setTxFilter] = useState<TxFilter>("all");
  const [txPage, setTxPage] = useState(0);

  // Initialize lookups
  const loadLookups = useCallback(async () => {
    try {
      const db = createClient();
      const [cats, accs] = await Promise.all([
        fetchCategories(db),
        fetchAccounts(db),
      ]);
      setCategories(cats);
      setAccounts(accs);
    } catch {
      // Continue
    }
  }, []);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const db = createClient();
      let from: string | undefined;
      let to: string | undefined;

      if (preset === "month") {
        const r = presetRange("month");
        from = r.from;
        to = r.to;
      } else if (preset === "year") {
        const r = presetRange("year");
        from = r.from;
        to = r.to;
      } else if (preset === "custom") {
        from = customFrom || undefined;
        to = customTo || undefined;
      }

      const res = await fetchFullReport(db, {
        from,
        to,
        categoryId: categoryId || undefined,
        accountId: accountId || undefined,
      });
      setReport(res);
      setTxPage(0);
    } catch (e) {
      setError(errorMessage(e, "Could not load report."));
    } finally {
      setLoading(false);
    }
  }, [preset, customFrom, customTo, categoryId, accountId]);

  useEffect(() => {
    void loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const selectedCategoryName = useMemo(() => {
    if (!categoryId) return "All Categories";
    return categories.find((c) => c.id === categoryId)?.name || "Selected Category";
  }, [categoryId, categories]);

  const selectedAccountName = useMemo(() => {
    if (!accountId) return "All Accounts";
    return accounts.find((a) => a.id === accountId)?.name || "Selected Account";
  }, [accountId, accounts]);

  const dateRangeLabel = useMemo(() => {
    if (preset === "month") {
      const now = new Date();
      const r = presetRange("month", now);
      const mName = format(now, "MMMM yyyy");
      return `${mName} (${displayDate(r.from)} – ${displayDate(r.to)})`;
    }
    if (preset === "year") {
      const now = new Date();
      const r = presetRange("year", now);
      const yName = format(now, "yyyy");
      return `Year ${yName} (${displayDate(r.from)} – ${displayDate(r.to)})`;
    }
    if (preset === "all") {
      return "All Time Records";
    }
    if (preset === "custom") {
      const fromStr = customFrom ? displayDate(customFrom) : "Beginning";
      const toStr = customTo ? displayDate(customTo) : "Present";
      return `Custom Range: ${fromStr} to ${toStr}`;
    }
    return "Selected Range";
  }, [preset, customFrom, customTo]);

  const exportFileBase = useMemo(() => {
    const sanitize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    if (preset === "month") {
      return `ledgerly_report_${sanitize(format(new Date(), "MMMM_yyyy"))}`;
    }
    if (preset === "year") {
      return `ledgerly_report_${format(new Date(), "yyyy")}`;
    }
    if (preset === "custom") {
      return `ledgerly_report_custom_${customFrom || "start"}_${customTo || "end"}`;
    }
    return "ledgerly_report_all_time";
  }, [preset, customFrom, customTo]);

  function handleExportCSV() {
    if (!report || report.transactions.length === 0) {
      notify("error", "No data available to export.");
      return;
    }
    setIsExporting("csv");
    try {
      exportReportToCSV(report, {
        dateRangeLabel,
        categoryLabel: selectedCategoryName,
        accountLabel: selectedAccountName,
        filename: `${exportFileBase}.csv`,
      });
      notify("success", "Exported complete transaction ledger as CSV.");
    } catch {
      notify("error", "Failed to generate CSV export.");
    } finally {
      setIsExporting(null);
    }
  }

  function handleExportExcel() {
    if (!report || report.transactions.length === 0) {
      notify("error", "No data available to export.");
      return;
    }
    setIsExporting("excel");
    try {
      exportReportToExcel(report, {
        dateRangeLabel,
        categoryLabel: selectedCategoryName,
        accountLabel: selectedAccountName,
        filename: `${exportFileBase}.xlsx`,
      });
      notify("success", "Exported crystal-clear report as Excel (.xlsx).");
    } catch {
      notify("error", "Failed to generate Excel export.");
    } finally {
      setIsExporting(null);
    }
  }

  function handleExportPDF() {
    if (!report || report.transactions.length === 0) {
      notify("error", "No data available to export.");
      return;
    }
    setIsExporting("pdf");
    try {
      exportReportToPDF(report, {
        dateRangeLabel,
        categoryLabel: selectedCategoryName,
        accountLabel: selectedAccountName,
        filename: `${exportFileBase}.pdf`,
      });
      notify("success", "Exported executive financial statement as PDF.");
    } catch {
      notify("error", "Failed to generate PDF export.");
    } finally {
      setIsExporting(null);
    }
  }

  // Filtered transactions in scope
  const filteredTransactions = useMemo(() => {
    if (!report) return [];
    return report.transactions.filter((t) => {
      if (txFilter === "expense" && t.type !== "expense") return false;
      if (txFilter === "income" && t.type !== "income") return false;

      if (txSearch.trim()) {
        const q = txSearch.trim().toLowerCase();
        const match =
          t.title.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q) ||
          t.account.toLowerCase().includes(q) ||
          t.note.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [report, txFilter, txSearch]);

  const totalTxPages = Math.max(
    1,
    Math.ceil(filteredTransactions.length / TX_PAGE_SIZE)
  );
  const paginatedTransactions = useMemo(() => {
    const from = txPage * TX_PAGE_SIZE;
    return filteredTransactions.slice(from, from + TX_PAGE_SIZE);
  }, [filteredTransactions, txPage]);

  // Net Savings P&L calculation
  const netSavings = report?.netSavingsPaise ?? 0;
  const isNetProfit = netSavings >= 0;

  const totalIncome = report?.totalIncomePaise ?? 0;
  const isIncomePos = totalIncome >= 0;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Top Header Bar (Fixed) */}
      <div className="mb-2 sm:mb-2.5 flex flex-wrap items-center justify-between gap-2 sm:gap-3 shrink-0">
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Financial Reports
          </h1>
          <p className="mt-0.5 text-[11px] sm:text-xs text-slate-500 dark:text-zinc-400">
            Audited spending summaries, P&L breakdown, and multi-sheet statement exports.
          </p>
        </div>

        {/* Download Buttons: Excel, CSV, PDF (PC & Mobile Responsive) */}
        <div className="grid grid-cols-3 gap-1.5 w-full sm:w-auto sm:flex sm:items-center sm:gap-2">
          <Button
            onClick={handleExportExcel}
            disabled={loading || isExporting !== null || (report?.transactions.length ?? 0) === 0}
            className="h-8 sm:h-9 px-2 sm:px-3 text-xs font-semibold shadow-xs justify-center flex-1 sm:flex-initial"
            title="Download full multi-sheet Excel report (.xlsx)"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1 shrink-0 text-emerald-300 dark:text-emerald-400" aria-hidden />
            <span>{isExporting === "excel" ? "Exporting..." : "Excel"}</span>
            <span className="hidden sm:inline ml-0.5 text-[11px] opacity-80">(.xlsx)</span>
          </Button>

          <Button
            variant="secondary"
            onClick={handleExportCSV}
            disabled={loading || isExporting !== null || (report?.transactions.length ?? 0) === 0}
            className="h-8 sm:h-9 px-2 sm:px-3 text-xs font-semibold shadow-xs justify-center flex-1 sm:flex-initial"
            title="Download full data CSV (.csv)"
          >
            <FileText className="h-3.5 w-3.5 mr-1 shrink-0 text-slate-600 dark:text-zinc-400" aria-hidden />
            <span>{isExporting === "csv" ? "Exporting..." : "CSV"}</span>
            <span className="hidden sm:inline ml-0.5 text-[11px] opacity-80">(.csv)</span>
          </Button>

          <Button
            variant="secondary"
            onClick={handleExportPDF}
            disabled={loading || isExporting !== null || (report?.transactions.length ?? 0) === 0}
            className="h-8 sm:h-9 px-2 sm:px-3 text-xs font-semibold shadow-xs justify-center flex-1 sm:flex-initial"
            title="Download executive printable PDF statement"
          >
            <Download className="h-3.5 w-3.5 mr-1 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden />
            <span>{isExporting === "pdf" ? "Exporting..." : "PDF"}</span>
            <span className="hidden sm:inline ml-0.5 text-[11px] opacity-80">Statement</span>
          </Button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700 shrink-0"
        >
          {error}{" "}
          <button className="underline" onClick={() => void loadReport()}>
            Try again
          </button>
        </div>
      )}

      {/* Filter Bar (Fixed) */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-xs shrink-0 dark:border-white/10 dark:bg-[#141414]">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="filter-capsule">
            <button
              onClick={() => setPreset("month")}
              className={preset === "month" ? "filter-pill-active" : "filter-pill-inactive"}
            >
              This Month
            </button>
            <button
              onClick={() => setPreset("year")}
              className={preset === "year" ? "filter-pill-active" : "filter-pill-inactive"}
            >
              This Year
            </button>
            <button
              onClick={() => setPreset("all")}
              className={preset === "all" ? "filter-pill-active" : "filter-pill-inactive"}
            >
              All Time
            </button>
            <button
              onClick={() => setPreset("custom")}
              className={preset === "custom" ? "filter-pill-active" : "filter-pill-inactive"}
            >
              Custom
            </button>
          </div>

          {preset === "custom" && (
            <div className="flex items-center gap-1 text-xs">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs shadow-xs focus:border-brand-500 focus:outline-none dark:border-white/10 dark:bg-[#181818] dark:text-white"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs shadow-xs focus:border-brand-500 focus:outline-none dark:border-white/10 dark:bg-[#181818] dark:text-white"
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 focus:border-brand-500 focus:outline-none cursor-pointer dark:border-white/10 dark:bg-[#181818] dark:text-zinc-300"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 focus:border-brand-500 focus:outline-none cursor-pointer dark:border-white/10 dark:bg-[#181818] dark:text-zinc-300"
          >
            <option value="">All Accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary KPI Cards (Fixed Position, Matching All Other Sections) */}
      <dl className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4 shrink-0">
        {/* Total Expenses */}
        <div className="rounded-xl border border-slate-200 bg-white p-2 sm:p-2.5 shadow-xs dark:border-white/10 dark:bg-[#141414]">
          <div className="flex items-center justify-between">
            <dt className="text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-zinc-400">Total Expenses</dt>
            <Receipt className="h-3.5 w-3.5 text-rose-500 shrink-0" />
          </div>
          <dd className="num mt-0.5 text-base sm:text-lg font-bold text-rose-700 md:text-xl dark:text-rose-400">
            {loading && !report ? (
              <Skeleton className="mt-1 h-6 w-20" />
            ) : (
              formatINR(report?.totalExpensePaise ?? 0)
            )}
          </dd>
          <p className="text-[9px] sm:text-[10px] text-slate-400 dark:text-zinc-500 truncate">
            {report?.expenseCount ?? report?.transactionCount ?? 0} expenses logged
          </p>
        </div>

        {/* Total Income */}
        <div className="rounded-xl border border-slate-200 bg-white p-2 sm:p-2.5 shadow-xs dark:border-white/10 dark:bg-[#141414]">
          <div className="flex items-center justify-between">
            <dt className="text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-zinc-400">Total Income</dt>
            {isIncomePos ? (
              <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
          </div>
          <dd
            className={`num mt-0.5 text-base sm:text-lg font-bold md:text-xl ${
              isIncomePos ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"
            }`}
          >
            {loading && !report ? (
              <Skeleton className="mt-1 h-6 w-20" />
            ) : isIncomePos ? (
              `+${formatINR(totalIncome)}`
            ) : (
              formatINR(totalIncome)
            )}
          </dd>
          <p className="text-[9px] sm:text-[10px] text-slate-400 dark:text-zinc-500 truncate">
            Earnings & P&L
          </p>
        </div>

        {/* Net Savings (P&L) */}
        <div className="rounded-xl border border-slate-200 bg-white p-2 sm:p-2.5 shadow-xs dark:border-white/10 dark:bg-[#141414]">
          <div className="flex items-center justify-between">
            <dt className="text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-zinc-400">Net Savings (P&L)</dt>
            {isNetProfit ? (
              <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
          </div>
          <dd
            className={`num mt-0.5 text-base sm:text-lg font-bold md:text-xl ${
              isNetProfit ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"
            }`}
          >
            {loading && !report ? (
              <Skeleton className="mt-1 h-6 w-20" />
            ) : isNetProfit ? (
              `+${formatINR(netSavings)}`
            ) : (
              formatINR(netSavings)
            )}
          </dd>
          <p className="text-[9px] sm:text-[10px] text-slate-400 dark:text-zinc-500 truncate">Income − Expenses</p>
        </div>

        {/* Savings Rate */}
        <div className="rounded-xl border border-slate-200 bg-white p-2 sm:p-2.5 shadow-xs dark:border-white/10 dark:bg-[#141414]">
          <div className="flex items-center justify-between">
            <dt className="text-[11px] font-medium text-slate-500">Savings Rate</dt>
            <Percent className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <dd
            className={`num mt-0.5 text-lg font-bold md:text-xl ${
              (report?.savingsRatePct ?? 0) >= 0 ? "text-slate-900" : "text-rose-700"
            }`}
          >
            {loading && !report ? (
              <Skeleton className="mt-1 h-6 w-16" />
            ) : report?.savingsRatePct !== null &&
              report?.savingsRatePct !== undefined ? (
              `${report.savingsRatePct}%`
            ) : (
              "—"
            )}
          </dd>
          <p className="text-[10px] text-slate-400 truncate">
            % of earnings retained
          </p>
        </div>
      </dl>

      {/* Main Content Area (Scrollable within viewport, cards stay fixed above) */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2.5 pr-0.5">
        {!loading && (report?.transactions.length ?? 0) === 0 ? (
          <EmptyState
            title="No records found for this period"
            body="Change the date range or filters above to view financial report breakdowns."
          />
        ) : (
          <>
            {/* Category Breakdown & Account Distribution */}
            <div className="grid gap-2.5 lg:grid-cols-2">
              {/* Category Breakdown Table */}
              <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden flex flex-col">
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-4 py-2 shrink-0">
                  <div className="flex items-center gap-2">
                    <PieChart className="h-4 w-4 text-brand-600" />
                    <h3 className="text-xs font-semibold text-slate-800">
                      Category Breakdown ({report?.categoryRows.length ?? 0})
                    </h3>
                  </div>
                  <span className="text-[11px] text-slate-500">By Expense Volume</span>
                </div>
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <table className="w-full text-left text-xs md:text-sm">
                    <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-slate-600 text-xs font-semibold shadow-xs">
                      <tr>
                        <th className="px-4 py-2 font-medium">Category</th>
                        <th className="px-4 py-2 text-right font-medium">Amount</th>
                        <th className="px-4 py-2 text-right font-medium">Share</th>
                        <th className="px-4 py-2 text-right font-medium">Count</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report?.categoryRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-4 py-4 text-center text-xs text-slate-400"
                          >
                            No category expenses in selected scope
                          </td>
                        </tr>
                      ) : (
                        report?.categoryRows.map((c) => (
                          <tr
                            key={c.categoryName}
                            className="hover:bg-slate-50/70 transition"
                          >
                            <td className="px-4 py-2 font-medium text-slate-900">
                              <span className="inline-block h-2 w-2 "/>
                              {c.categoryName}
                            </td>
                            <td className="num px-4 py-2 text-right font-semibold text-slate-800">
                              {formatINR(c.amountPaise)}
                            </td>
                            <td className="px-4 py-2 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                  <div
                                    className="bg-brand-600 h-full rounded-full"
                                    style={{
                                      width: `${Math.min(100, Math.max(0, c.percentage))}%`,
                                    }}
                                  />
                                </div>
                                <span className="num text-xs text-slate-600 w-9 text-right">
                                  {c.percentage}%
                                </span>
                              </div>
                            </td>
                            <td className="num px-4 py-2 text-right text-slate-500 text-xs">
                              {c.count}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Account Distribution Table */}
              <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden flex flex-col">
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-4 py-2 shrink-0">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-slate-600" />
                    <h3 className="text-xs font-semibold text-slate-800">
                      Account Distribution ({report?.accountRows.length ?? 0})
                    </h3>
                  </div>
                  <span className="text-[11px] text-slate-500">By Transactions</span>
                </div>
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <table className="w-full text-left text-xs md:text-sm">
                    <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-slate-600 text-xs font-semibold shadow-xs">
                      <tr>
                        <th className="px-4 py-2 font-medium">Account</th>
                        <th className="px-4 py-2 text-right font-medium">Amount</th>
                        <th className="px-4 py-2 text-right font-medium">Transactions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report?.accountRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={3}
                            className="px-4 py-4 text-center text-xs text-slate-400"
                          >
                            No account activity in selected scope
                          </td>
                        </tr>
                      ) : (
                        report?.accountRows.map((a) => (
                          <tr
                            key={a.accountName}
                            className="hover:bg-slate-50/70 transition"
                          >
                            <td className="px-4 py-2 font-medium text-slate-900">
                              {a.accountName}
                            </td>
                            <td className="num px-4 py-2 text-right font-semibold text-slate-800">
                              {formatINR(a.amountPaise)}
                            </td>
                            <td className="num px-4 py-2 text-right text-slate-500 text-xs">
                              {a.count}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Complete All Transactions in Scope Table */}
            <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden flex flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-200 bg-slate-50/70 px-4 py-2 shrink-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-semibold text-slate-800">
                    All Transactions in Scope ({filteredTransactions.length})
                  </h3>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Filter Tabs: All | Expenses | Income */}
                  <div className="filter-capsule">
                    <button
                      onClick={() => {
                        setTxFilter("all");
                        setTxPage(0);
                      }}
                      className={txFilter === "all" ? "filter-pill-active" : "filter-pill-inactive"}
                    >
                      All ({report?.transactions.length ?? 0})
                    </button>
                    <button
                      onClick={() => {
                        setTxFilter("expense");
                        setTxPage(0);
                      }}
                      className={txFilter === "expense" ? "filter-pill-active" : "filter-pill-inactive"}
                    >
                      Expenses ({report?.expenseCount ?? 0})
                    </button>
                    <button
                      onClick={() => {
                        setTxFilter("income");
                        setTxPage(0);
                      }}
                      className={txFilter === "income" ? "filter-pill-active" : "filter-pill-inactive"}
                    >
                      Income / P&L ({report?.incomeCount ?? 0})
                    </button>
                  </div>

                  {/* Search input */}
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search in scope..."
                      value={txSearch}
                      onChange={(e) => {
                        setTxSearch(e.target.value);
                        setTxPage(0);
                      }}
                      className="h-7 w-36 sm:w-48 rounded-lg border border-slate-200 bg-white pl-8 pr-2 text-xs shadow-2xs focus:border-brand-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Transactions Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs md:text-sm">
                  <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-slate-600 text-xs font-semibold shadow-xs">
                    <tr>
                      <th className="px-4 py-2 font-medium">Date</th>
                      <th className="px-4 py-2 font-medium">Type</th>
                      <th className="px-4 py-2 font-medium">Category</th>
                      <th className="px-4 py-2 font-medium">Title & Note</th>
                      <th className="px-4 py-2 font-medium">Account</th>
                      <th className="px-4 py-2 font-medium">Method</th>
                      <th className="px-4 py-2 text-right font-medium">
                        Net Amount / P&L
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedTransactions.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-4 py-6 text-center text-xs text-slate-400"
                        >
                          No transactions found in this scope
                        </td>
                      </tr>
                    ) : (
                      paginatedTransactions.map((t, idx) => {
                        const isIncome = t.type === "income";
                        const isProfit = isIncome && t.amountPaise >= 0;
                        const isLoss = isIncome && t.amountPaise < 0;

                        return (
                          <tr
                            key={t.id || idx}
                            className="hover:bg-slate-50/70 transition"
                          >
                            <td className="num whitespace-nowrap px-4 py-2 text-slate-600">
                              {displayDate(t.date)}
                            </td>
                            <td className="px-4 py-2">
                              {isIncome ? (
                                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                  Income
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                                  Expense
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-slate-700 font-medium">
                              {t.category}
                            </td>
                            <td className="px-4 py-2 text-slate-900 max-w-[14rem]">
                              <p className="truncate font-semibold">{t.title}</p>
                              {t.note && (
                                <p className="truncate text-[11px] text-slate-500">
                                  {t.note}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-2 text-slate-500 text-xs">
                              {t.account}
                            </td>
                            <td className="px-4 py-2 text-slate-500 text-xs">
                              {t.method}
                            </td>
                            <td className="num whitespace-nowrap px-4 py-2 text-right font-bold">
                              {isProfit ? (
                                <span className="text-emerald-700 inline-flex items-center justify-end gap-1">
                                  <TrendingUp className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                  +{formatINR(t.amountPaise)}
                                </span>
                              ) : isLoss ? (
                                <span className="text-rose-700 inline-flex items-center justify-end gap-1">
                                  <TrendingDown className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                                  {formatINR(t.amountPaise)}
                                </span>
                              ) : (
                                <span className="text-rose-700 inline-flex items-center justify-end gap-1">
                                  <ArrowDownRight className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                                  -{formatINR(t.amountPaise)}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Transactions Pagination */}
              {totalTxPages > 1 && (
                <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/50 px-4 py-2 text-xs text-slate-600 shrink-0">
                  <span className="num">
                    Page {txPage + 1} of {totalTxPages} ·{" "}
                    {filteredTransactions.length} transactions
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      className="h-7 px-2.5 text-xs shadow-2xs"
                      disabled={txPage === 0}
                      onClick={() => setTxPage(txPage - 1)}
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="secondary"
                      className="h-7 px-2.5 text-xs shadow-2xs"
                      disabled={txPage + 1 >= totalTxPages}
                      onClick={() => setTxPage(txPage + 1)}
                      aria-label="Next page"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
