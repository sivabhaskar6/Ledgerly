"use client";
import { useCallback, useEffect, useState } from "react";
import { FileSpreadsheet, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchFullReport, exportReportToCSV, exportReportToExcel, type FullReport } from "@/lib/data/reports";
import { fetchCategories, fetchAccounts } from "@/lib/data/expenses";
import { errorMessage } from "@/lib/data/expenses";
import { formatINR } from "@/lib/utils/money";
import { displayDate, presetRange } from "@/lib/utils/dates";
import type { Account, Category } from "@/types/db";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";

type PresetOption = "month" | "year" | "all" | "custom";

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

  // Initialize dates
  const loadLookups = useCallback(async () => {
    try {
      const db = createClient();
      const [cats, accs] = await Promise.all([fetchCategories(db), fetchAccounts(db)]);
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

  function handleExportCSV() {
    if (!report || report.transactions.length === 0) {
      notify("error", "No data available to export.");
      return;
    }
    exportReportToCSV(report, `ledgerly_report_${preset}.csv`);
    notify("success", "Exported report as CSV.");
  }

  function handleExportExcel() {
    if (!report || report.transactions.length === 0) {
      notify("error", "No data available to export.");
      return;
    }
    exportReportToExcel(report, `ledgerly_report_${preset}.xlsx`);
    notify("success", "Exported report as Excel (.xlsx).");
  }

  return (
    <>
      <PageHeader
        title="Financial Reports"
        description="Audited spending summaries and multi-sheet statement exports."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={handleExportCSV}
              disabled={loading || (report?.transactions.length ?? 0) === 0}
            >
              <FileText className="h-4 w-4" aria-hidden />
              Export CSV
            </Button>
            <Button
              onClick={handleExportExcel}
              disabled={loading || (report?.transactions.length ?? 0) === 0}
            >
              <FileSpreadsheet className="h-4 w-4" aria-hidden />
              Export Excel (.xlsx)
            </Button>
          </div>
        }
      />

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error} <button className="underline" onClick={() => void loadReport()}>Try again</button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="mb-6 rounded-card border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs font-medium">
            <button
              onClick={() => setPreset("month")}
              className={`rounded-md px-3 py-1.5 transition-colors ${preset === "month" ? "bg-brand-600 text-white" : "text-slate-600 hover:text-slate-900"}`}
            >
              This Month
            </button>
            <button
              onClick={() => setPreset("year")}
              className={`rounded-md px-3 py-1.5 transition-colors ${preset === "year" ? "bg-brand-600 text-white" : "text-slate-600 hover:text-slate-900"}`}
            >
              This Year
            </button>
            <button
              onClick={() => setPreset("all")}
              className={`rounded-md px-3 py-1.5 transition-colors ${preset === "all" ? "bg-brand-600 text-white" : "text-slate-600 hover:text-slate-900"}`}
            >
              All Time
            </button>
            <button
              onClick={() => setPreset("custom")}
              className={`rounded-md px-3 py-1.5 transition-colors ${preset === "custom" ? "bg-brand-600 text-white" : "text-slate-600 hover:text-slate-900"}`}
            >
              Custom Range
            </button>
          </div>

          {preset === "custom" && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-8 rounded-lg border border-slate-300 px-2 text-xs"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-8 rounded-lg border border-slate-300 px-2 text-xs"
              />
            </div>
          )}

          <div className="ml-auto flex flex-wrap gap-2">
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="h-8 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-700"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="h-8 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-700"
            >
              <option value="">All Accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-card border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Total Expenses</p>
          {loading && !report ? (
            <Skeleton className="mt-2 h-7 w-24" />
          ) : (
            <p className="num mt-1 text-xl font-bold text-red-600">
              {formatINR(report?.totalExpensePaise ?? 0)}
            </p>
          )}
          <p className="mt-1 text-xs text-slate-400">{report?.transactionCount ?? 0} transactions</p>
        </div>

        <div className="rounded-card border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Total Income</p>
          {loading && !report ? (
            <Skeleton className="mt-2 h-7 w-24" />
          ) : (
            <p className="num mt-1 text-xl font-bold text-emerald-600">
              {formatINR(report?.totalIncomePaise ?? 0)}
            </p>
          )}
          <p className="mt-1 text-xs text-slate-400">Recorded earnings</p>
        </div>

        <div className="rounded-card border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Net Savings</p>
          {loading && !report ? (
            <Skeleton className="mt-2 h-7 w-24" />
          ) : (
            <p className={`num mt-1 text-xl font-bold ${(report?.netSavingsPaise ?? 0) >= 0 ? "text-indigo-700" : "text-amber-600"}`}>
              {formatINR(report?.netSavingsPaise ?? 0)}
            </p>
          )}
          <p className="mt-1 text-xs text-slate-400">Income − Expenses</p>
        </div>

        <div className="rounded-card border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Savings Rate</p>
          {loading && !report ? (
            <Skeleton className="mt-2 h-7 w-24" />
          ) : (
            <p className="num mt-1 text-xl font-bold text-slate-900">
              {report?.savingsRatePct !== null && report?.savingsRatePct !== undefined
                ? `${report.savingsRatePct}%`
                : "—"}
            </p>
          )}
          <p className="mt-1 text-xs text-slate-400">% of earnings saved</p>
        </div>
      </div>

      {/* Breakdowns */}
      {!loading && (report?.transactions.length ?? 0) === 0 ? (
        <EmptyState
          title="No records found for this period"
          body="Change the date range or filters above to view financial report breakdowns."
        />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Category Breakdown Table */}
            <div className="overflow-hidden rounded-card border border-slate-200 bg-white">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                <h3 className="text-sm font-semibold text-slate-800">Category Breakdown</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50/50 text-slate-600">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Category</th>
                      <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                      <th className="px-4 py-2.5 text-right font-medium">Share</th>
                      <th className="px-4 py-2.5 text-right font-medium">Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report?.categoryRows.map((c) => (
                      <tr key={c.categoryName} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-medium text-slate-900">{c.categoryName}</td>
                        <td className="num px-4 py-2.5 text-right font-semibold text-slate-800">{formatINR(c.amountPaise)}</td>
                        <td className="num px-4 py-2.5 text-right text-slate-500">{c.percentage}%</td>
                        <td className="num px-4 py-2.5 text-right text-slate-500">{c.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Account & Payment Method Breakdown */}
            <div className="space-y-6">
              <div className="overflow-hidden rounded-card border border-slate-200 bg-white">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <h3 className="text-sm font-semibold text-slate-800">Account Distribution</h3>
                </div>
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50/50 text-slate-600">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Account</th>
                      <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                      <th className="px-4 py-2.5 text-right font-medium">Transactions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report?.accountRows.map((a) => (
                      <tr key={a.accountName} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-medium text-slate-900">{a.accountName}</td>
                        <td className="num px-4 py-2.5 text-right font-semibold text-slate-800">{formatINR(a.amountPaise)}</td>
                        <td className="num px-4 py-2.5 text-right text-slate-500">{a.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Detailed Transaction Table */}
          <div className="overflow-hidden rounded-card border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-800">
                All Transactions in Scope ({report?.transactions.length ?? 0})
              </h3>
            </div>
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 border-b border-slate-200 bg-slate-100 text-slate-600">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    <th className="px-4 py-2.5 font-medium">Category</th>
                    <th className="px-4 py-2.5 font-medium">Title</th>
                    <th className="px-4 py-2.5 font-medium">Account</th>
                    <th className="px-4 py-2.5 font-medium">Method</th>
                    <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report?.transactions.map((t, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="num whitespace-nowrap px-4 py-2.5 text-slate-600">{displayDate(t.date)}</td>
                      <td className="px-4 py-2.5 text-slate-600">{t.category}</td>
                      <td className="max-w-[14rem] truncate px-4 py-2.5 font-medium text-slate-900" title={t.title}>{t.title}</td>
                      <td className="px-4 py-2.5 text-slate-500">{t.account}</td>
                      <td className="px-4 py-2.5 text-slate-500">{t.method}</td>
                      <td className="num whitespace-nowrap px-4 py-2.5 text-right font-semibold text-red-600">{formatINR(t.amountPaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
