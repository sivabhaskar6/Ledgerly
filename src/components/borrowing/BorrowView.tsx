"use client";
import { useCallback, useEffect, useState, useMemo } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  RotateCcw,
  Users,
  HandCoins,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  fetchBorrowRecords,
  deleteBorrowRecord,
  unsettleBorrowRecord,
} from "@/lib/data/borrowing";
import { fetchAccounts } from "@/lib/data/accounts";
import { errorMessage } from "@/lib/data/expenses";
import { formatINR } from "@/lib/utils/money";
import { displayDate, todayISO, presetRange } from "@/lib/utils/dates";
import type { Account, BorrowRecordWithRefs } from "@/types/db";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { BorrowFormModal } from "./BorrowFormModal";
import { SettleModal } from "./SettleModal";

export function BorrowView() {
  const { notify } = useToast();
  const [records, setRecords] = useState<BorrowRecordWithRefs[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [tableMissing, setTableMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals & Actions
  const [formOpen, setFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<BorrowRecordWithRefs | null>(null);
  const [settlingRecord, setSettlingRecord] = useState<BorrowRecordWithRefs | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BorrowRecordWithRefs | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const db = createClient();
      const [res, accs] = await Promise.all([
        fetchBorrowRecords(db),
        fetchAccounts(db).catch(() => []),
      ]);
      setRecords(res.records);
      setTableMissing(!!res.tableMissing);
      setAccounts(accs);
    } catch (e) {
      setError(errorMessage(e, "Could not load borrow and lend records."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      const db = createClient();
      await deleteBorrowRecord(db, deleteTarget.id);
      notify("success", `Record for ${deleteTarget.person_name} moved to Recently deleted.`);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      notify("error", errorMessage(e, "Could not delete record."));
    }
  }

  async function handleUnsettle(record: BorrowRecordWithRefs) {
    try {
      const db = createClient();
      await unsettleBorrowRecord(db, record.id);
      notify("success", `Record for ${record.person_name} reopened as pending.`);
      await load();
    } catch (e) {
      notify("error", errorMessage(e, "Could not update status."));
    }
  }

  // Filtered records
  const filteredRecords = useMemo(() => {
    const today = todayISO();
    const w = presetRange("week");
    const m = presetRange("month");
    const y = presetRange("year");

    return records.filter((r) => {
      // Search filter
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matchesName = r.person_name.toLowerCase().includes(q);
        const matchesNote = r.note ? r.note.toLowerCase().includes(q) : false;
        if (!matchesName && !matchesNote) return false;
      }

      // Type filter
      if (typeFilter !== "all" && r.type !== typeFilter) return false;

      // Status filter
      if (statusFilter !== "all" && r.status !== statusFilter) return false;

      // Date filter
      if (dateFilter === "today" && r.occurred_on !== today) return false;
      if (dateFilter === "week" && (r.occurred_on < w.from || r.occurred_on > w.to)) return false;
      if (dateFilter === "month" && (r.occurred_on < m.from || r.occurred_on > m.to)) return false;
      if (dateFilter === "year" && (r.occurred_on < y.from || r.occurred_on > y.to)) return false;

      return true;
    });
  }, [records, search, typeFilter, statusFilter, dateFilter]);

  // Derived KPI Metrics
  const kpiMetrics = useMemo(() => {
    let pendingLent = 0;
    let pendingBorrowed = 0;
    let settledTotal = 0;
    let pendingLentCount = 0;
    let pendingBorrowedCount = 0;
    let settledCount = 0;

    for (const r of filteredRecords) {
      if (r.status === "pending") {
        if (r.type === "lent") {
          pendingLent += r.amount_paise;
          pendingLentCount++;
        } else {
          pendingBorrowed += r.amount_paise;
          pendingBorrowedCount++;
        }
      } else {
        settledTotal += r.amount_paise;
        settledCount++;
      }
    }

    const netBalance = pendingLent - pendingBorrowed;

    return {
      netBalancePaise: netBalance,
      pendingLentPaise: pendingLent,
      pendingBorrowedPaise: pendingBorrowed,
      settledTotalPaise: settledTotal,
      pendingLentCount,
      pendingBorrowedCount,
      settledCount,
      totalCount: filteredRecords.length,
    };
  }, [filteredRecords]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header Bar */}
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Borrow & Lend</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Track money lent to borrowers and borrowed from lenders, repayment dates, and settlement status.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              setEditingRecord(null);
              setFormOpen(true);
            }}
            className="h-9 px-3.5 text-xs font-semibold shadow-xs"
          >
            <Plus className="h-4 w-4 mr-1.5" aria-hidden />
            Record Entry
          </Button>
        </div>
      </div>

      {/* Migration Notice */}
      {tableMissing && (
        <div className="mb-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 shrink-0">
          <p className="font-semibold text-amber-950">Database Setup Required</p>
          <p className="mt-0.5 text-amber-800">
            The <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs">public.borrow_records</code> table has not been created in your Supabase database yet. Please run migration{" "}
            <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs">0012_borrow_records.sql</code> in your <strong>Supabase SQL Editor</strong> to enable Borrow & Lend tracking.
          </p>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mb-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700 shrink-0"
        >
          {error}{" "}
          <button className="underline" onClick={() => void load()}>
            Try again
          </button>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-5 shrink-0">
        {/* Net Balance */}
        <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-500">Net Due Balance</span>
            <HandCoins className="h-3.5 w-3.5 text-slate-400" />
          </div>
          {loading ? (
            <Skeleton className="mt-1 h-6 w-20" />
          ) : (
            <p
              className={`num mt-0.5 text-lg font-bold md:text-xl ${
                kpiMetrics.netBalancePaise > 0
                  ? "text-emerald-700"
                  : kpiMetrics.netBalancePaise < 0
                  ? "text-rose-700"
                  : "text-slate-800"
              }`}
            >
              {kpiMetrics.netBalancePaise > 0
                ? `+${formatINR(kpiMetrics.netBalancePaise)}`
                : formatINR(kpiMetrics.netBalancePaise)}
            </p>
          )}
          <p className="text-[10px] text-slate-400 truncate">
            {kpiMetrics.netBalancePaise > 0
              ? "To receive back"
              : kpiMetrics.netBalancePaise < 0
              ? "You owe to others"
              : "All balances settled"}
          </p>
        </div>

        {/* You Lent (To Receive) */}
        <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-500">You Lent (Given)</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" />
          </div>
          {loading ? (
            <Skeleton className="mt-1 h-6 w-20" />
          ) : (
            <p className="num mt-0.5 text-lg font-bold text-emerald-700 md:text-xl">
              {formatINR(kpiMetrics.pendingLentPaise)}
            </p>
          )}
          <p className="text-[10px] text-slate-400 truncate">
            {kpiMetrics.pendingLentCount} pending borrower(s)
          </p>
        </div>

        {/* You Borrowed (To Pay) */}
        <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-500">You Borrowed (Taken)</span>
            <ArrowDownLeft className="h-3.5 w-3.5 text-amber-600" />
          </div>
          {loading ? (
            <Skeleton className="mt-1 h-6 w-20" />
          ) : (
            <p className="num mt-0.5 text-lg font-bold text-amber-700 md:text-xl">
              {formatINR(kpiMetrics.pendingBorrowedPaise)}
            </p>
          )}
          <p className="text-[10px] text-slate-400 truncate">
            {kpiMetrics.pendingBorrowedCount} pending lender(s)
          </p>
        </div>

        {/* Settled / Returned */}
        <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-500">Settled / Returned</span>
            <CheckCircle2 className="h-3.5 w-3.5 text-slate-400" />
          </div>
          {loading ? (
            <Skeleton className="mt-1 h-6 w-20" />
          ) : (
            <p className="num mt-0.5 text-lg font-bold text-slate-800 md:text-xl">
              {formatINR(kpiMetrics.settledTotalPaise)}
            </p>
          )}
          <p className="text-[10px] text-slate-400 truncate">
            {kpiMetrics.settledCount} settled record(s)
          </p>
        </div>

        {/* Total Records */}
        <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-500">Total Entries</span>
            <Users className="h-3.5 w-3.5 text-slate-400" />
          </div>
          {loading ? (
            <Skeleton className="mt-1 h-6 w-14" />
          ) : (
            <p className="num mt-0.5 text-lg font-bold text-slate-900 md:text-xl">
              {kpiMetrics.totalCount}
            </p>
          )}
          <p className="text-[10px] text-slate-400 truncate">In active view</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-xs shrink-0">
        <div className="relative min-w-[14rem] flex-1 flex items-center">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search person name or note..."
            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-3 text-xs md:text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none transition-colors"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            Filter:
          </span>

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 focus:border-brand-500 focus:outline-none transition-colors cursor-pointer"
          >
            <option value="all">All Types</option>
            <option value="lent">I Gave / Lent (Borrowers)</option>
            <option value="borrowed">I Took / Borrowed (Lenders)</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 focus:border-brand-500 focus:outline-none transition-colors cursor-pointer"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending / Due</option>
            <option value="settled">Settled / Done</option>
          </select>

          {/* Date Filter */}
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 focus:border-brand-500 focus:outline-none transition-colors cursor-pointer"
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="year">This Year</option>
          </select>
        </div>
      </div>

      {/* Table & Footer */}
      <div className="flex-1 min-h-0 flex flex-col">
        {loading && records.length === 0 ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : filteredRecords.length === 0 ? (
          <EmptyState
            title={
              search || typeFilter !== "all" || statusFilter !== "all" || dateFilter !== "all"
                ? "No matching borrow/lend records"
                : "No borrow or lending records yet"
            }
            body="Keep track of money you give to friends, family, or colleagues (borrowers) and money you borrow, with settlement dates and notes."
            action={
              <Button
                onClick={() => {
                  setEditingRecord(null);
                  setFormOpen(true);
                }}
                className="h-9 px-3.5 text-xs font-semibold shadow-xs"
              >
                <Plus className="h-4 w-4 mr-1.5" aria-hidden />
                Record your first entry
              </Button>
            }
          />
        ) : (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto rounded-card border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-xs md:text-sm">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-slate-600 text-xs font-semibold shadow-xs">
                  <tr>
                    <th className="px-3.5 py-2 whitespace-nowrap">Date</th>
                    <th className="px-3.5 py-2">Person Name</th>
                    <th className="px-3 py-2 whitespace-nowrap">Type</th>
                    <th className="px-3.5 py-2 text-right whitespace-nowrap">Amount</th>
                    <th className="px-3 py-2 whitespace-nowrap">Due Date</th>
                    <th className="px-3.5 py-2 whitespace-nowrap">Status</th>
                    <th className="px-3.5 py-2">Account / Note</th>
                    <th className="px-3.5 py-2 text-right whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRecords.map((r) => {
                    const isLent = r.type === "lent";
                    const isSettled = r.status === "settled";

                    return (
                      <tr key={r.id} className="transition hover:bg-slate-50/70">
                        <td className="num whitespace-nowrap px-3.5 py-2 text-slate-600">
                          {displayDate(r.occurred_on)}
                        </td>

                        <td className="px-3.5 py-2 font-semibold text-slate-900">
                          <div className="flex items-center gap-1.5">
                            <span>{r.person_name}</span>
                          </div>
                        </td>

                        <td className="px-3 py-2 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase border ${
                              isLent
                                ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-400"
                                : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-400"
                            }`}
                          >
                            {isLent ? (
                              <ArrowUpRight className="h-3 w-3" />
                            ) : (
                              <ArrowDownLeft className="h-3 w-3" />
                            )}
                            {isLent ? "Gave / Lent" : "Took / Borrowed"}
                          </span>
                        </td>

                        <td className="num whitespace-nowrap px-3.5 py-2 text-right">
                          <span
                            className={`font-bold text-xs md:text-sm ${
                              isLent ? "text-emerald-700" : "text-amber-700"
                            }`}
                          >
                            {isLent ? `+${formatINR(r.amount_paise)}` : `−${formatINR(r.amount_paise)}`}
                          </span>
                        </td>

                        <td className="num whitespace-nowrap px-3 py-2 text-slate-500 text-xs">
                          {r.due_date ? displayDate(r.due_date) : "—"}
                        </td>

                        <td className="whitespace-nowrap px-3.5 py-2">
                          {isSettled ? (
                            <div>
                              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                <CheckCircle2 className="h-3 w-3" />
                                Done / Settled
                              </span>
                              {r.settled_on && (
                                <p className="num mt-0.5 text-[10px] text-slate-400">
                                  on {displayDate(r.settled_on)}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                              <Clock className="h-3 w-3" />
                              Pending
                            </span>
                          )}
                        </td>

                        <td className="px-3.5 py-2 text-xs text-slate-500 max-w-[12rem] truncate">
                          <p className="truncate font-medium text-slate-700">{r.note || "—"}</p>
                          {r.account?.name && (
                            <p className="text-[10px] text-slate-400 truncate">
                              via {r.account.name}
                            </p>
                          )}
                        </td>

                        <td className="whitespace-nowrap px-3.5 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {!isSettled ? (
                              <button
                                type="button"
                                onClick={() => setSettlingRecord(r)}
                                title="Mark as Done (Settled)"
                                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white shadow-xs hover:bg-emerald-500 transition-all dark:bg-emerald-500 dark:text-zinc-950 dark:hover:bg-emerald-400 cursor-pointer"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 stroke-[2.5]" />
                                Done
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleUnsettle(r)}
                                title="Reopen as pending"
                                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 transition shadow-xs"
                              >
                                <RotateCcw className="h-3 w-3" />
                                Reopen
                              </button>
                            )}

                            <button
                              type="button"
                              aria-label={`Edit record for ${r.person_name}`}
                              onClick={() => {
                                setEditingRecord(r);
                                setFormOpen(true);
                              }}
                              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition"
                              title="Edit record"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>

                            <button
                              type="button"
                              aria-label={`Delete record for ${r.person_name}`}
                              onClick={() => setDeleteTarget(r)}
                              className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                              title="Delete record"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pinned Bottom Footer */}
            <div className="shrink-0 mt-2 flex items-center justify-between text-xs text-slate-500 px-1">
              <span>
                Showing {filteredRecords.length} of {records.length} entries
              </span>
              <span className="text-[11px] text-slate-400">
                ⚡ Deleting moves to Recently deleted and can be restored anytime
              </span>
            </div>
          </>
        )}
      </div>

      {/* Form Modal */}
      <BorrowFormModal
        open={formOpen}
        record={editingRecord}
        accounts={accounts}
        onClose={() => {
          setFormOpen(false);
          setEditingRecord(null);
        }}
        onSaved={() => void load()}
        notify={notify}
      />

      {/* Quick Settle Modal */}
      <SettleModal
        open={!!settlingRecord}
        record={settlingRecord}
        onClose={() => setSettlingRecord(null)}
        onSettled={() => void load()}
        notify={notify}
      />

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Move to Recently deleted?"
        body={`This will move the borrow/lend record for ${deleteTarget?.person_name} (${formatINR(
          deleteTarget?.amount_paise ?? 0
        )}) to Recently deleted. You can restore it anytime.`}
        confirmLabel="Move to trash"
        tone="danger"
      />
    </div>
  );
}
