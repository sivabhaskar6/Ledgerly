"use client";
import { useCallback, useEffect, useState, useMemo } from "react";
import { RotateCcw, Trash2, CandlestickChart, IndianRupee, Receipt, Rocket, ArrowLeftRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/data/expenses";
import {
  fetchRecentlyDeleted,
  restoreRecentlyDeleted,
  permanentlyDeleteRecentlyDeleted,
  type DeletedItem,
} from "@/lib/data/recently-deleted";
import { formatINR } from "@/lib/utils/money";
import { displayDate } from "@/lib/utils/dates";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";

type FilterTab = "all" | "expense" | "income" | "fno" | "ipo" | "borrowing";

export function RecentlyDeletedView() {
  const { notify } = useToast();
  const [items, setItems] = useState<DeletedItem[]>([]);
  const [tab, setTab] = useState<FilterTab>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<DeletedItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const db = createClient();
      const res = await fetchRecentlyDeleted(db);
      setItems(res);
    } catch (e) {
      setError(errorMessage(e, "Could not load deleted items."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRestore(item: DeletedItem) {
    setBusyId(item.id);
    try {
      const db = createClient();
      await restoreRecentlyDeleted(db, item);
      notify("success", `Restored "${item.title}".`);
      await load();
    } catch (err) {
      notify("error", errorMessage(err, "Could not restore the item."));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDestroy() {
    if (!target) return;
    setBusyId(target.id);
    try {
      const db = createClient();
      await permanentlyDeleteRecentlyDeleted(db, target);
      notify("success", "Deleted permanently.");
      setTarget(null);
      await load();
    } catch (err) {
      notify("error", errorMessage(err, "Could not delete permanently."));
    } finally {
      setBusyId(null);
    }
  }

  const counts = useMemo(() => {
    let expense = 0;
    let income = 0;
    let fno = 0;
    let ipo = 0;
    let borrowing = 0;
    for (const i of items) {
      if (i.kind === "expense") expense++;
      else if (i.kind === "income") income++;
      else if (i.kind === "fno") fno++;
      else if (i.kind === "ipo") ipo++;
      else if (i.kind === "borrowing") borrowing++;
    }
    return { all: items.length, expense, income, fno, ipo, borrowing };
  }, [items]);

  const filteredItems = useMemo(() => {
    if (tab === "all") return items;
    return items.filter((i) => i.kind === tab);
  }, [items, tab]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Recently deleted</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Deleted expenses, income entries, F&O trades, IPO listing gains, and borrow & lend records stay here until removed permanently. They do not count toward any totals.
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-2 shrink-0">
        <button
          type="button"
          onClick={() => setTab("all")}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
            tab === "all"
              ? "bg-slate-900 text-white shadow-sm"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          All
          <span
            className={`rounded-full px-1.5 py-0.2 text-[10px] ${
              tab === "all" ? "bg-slate-800 text-slate-200" : "bg-white text-slate-600"
            }`}
          >
            {counts.all}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTab("expense")}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
            tab === "expense"
              ? "bg-rose-700 text-white shadow-sm"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <Receipt className="h-3.5 w-3.5" />
          Expenses
          <span
            className={`rounded-full px-1.5 py-0.2 text-[10px] ${
              tab === "expense" ? "bg-rose-800 text-rose-100" : "bg-white text-slate-600"
            }`}
          >
            {counts.expense}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTab("income")}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
            tab === "income"
              ? "bg-emerald-700 text-white shadow-sm"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <IndianRupee className="h-3.5 w-3.5" />
          Income
          <span
            className={`rounded-full px-1.5 py-0.2 text-[10px] ${
              tab === "income" ? "bg-emerald-800 text-emerald-100" : "bg-white text-slate-600"
            }`}
          >
            {counts.income}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTab("fno")}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
            tab === "fno"
              ? "bg-violet-700 text-white shadow-sm"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <CandlestickChart className="h-3.5 w-3.5" />
          F&O
          <span
            className={`rounded-full px-1.5 py-0.2 text-[10px] ${
              tab === "fno" ? "bg-violet-800 text-violet-100" : "bg-white text-slate-600"
            }`}
          >
            {counts.fno}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTab("ipo")}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
            tab === "ipo"
              ? "bg-blue-700 text-white shadow-sm"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <Rocket className="h-3.5 w-3.5" />
          IPO
          <span
            className={`rounded-full px-1.5 py-0.2 text-[10px] ${
              tab === "ipo" ? "bg-blue-800 text-blue-100" : "bg-white text-slate-600"
            }`}
          >
            {counts.ipo}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTab("borrowing")}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
            tab === "borrowing"
              ? "bg-indigo-700 text-white shadow-sm"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <ArrowLeftRight className="h-3.5 w-3.5" />
          Borrow & Lend
          <span
            className={`rounded-full px-1.5 py-0.2 text-[10px] ${
              tab === "borrowing" ? "bg-indigo-800 text-indigo-100" : "bg-white text-slate-600"
            }`}
          >
            {counts.borrowing}
          </span>
        </button>
      </div>

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

      <div className="flex-1 min-h-0 flex flex-col">
        {loading ? (
          <ListSkeleton rows={3} />
        ) : filteredItems.length === 0 && !error ? (
          <EmptyState
            title={
              tab === "all"
                ? "Nothing in Recently deleted"
                : tab === "fno"
                ? "No deleted F&O trades"
                : tab === "ipo"
                ? "No deleted IPO listing gains"
                : tab === "borrowing"
                ? "No deleted borrow & lend records"
                : tab === "income"
                ? "No deleted income entries"
                : "No deleted expenses"
            }
            body="Entries you delete will appear here so you can restore or permanently delete them."
          />
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto rounded-card border border-slate-200 bg-white shadow-sm">
            <ul className="divide-y divide-slate-100">
              {filteredItems.map((item) => {
                const isExpense = item.kind === "expense";
                const isPos = !isExpense && item.amount_paise >= 0;

                let badgeClass = "border-slate-200 bg-slate-100 text-slate-700";
                if (item.kind === "fno") {
                  badgeClass = "border-violet-200 bg-violet-50 text-violet-800";
                } else if (item.kind === "ipo") {
                  badgeClass = "border-blue-200 bg-blue-50 text-blue-800";
                } else if (item.kind === "income") {
                  badgeClass = "border-emerald-200 bg-emerald-50 text-emerald-800";
                } else if (item.kind === "borrowing") {
                  badgeClass = "border-indigo-200 bg-indigo-50 text-indigo-800";
                }

                return (
                  <li
                    key={`${item.kind}-${item.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 transition hover:bg-slate-50/70"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-xs md:text-sm font-semibold text-slate-900">{item.title}</p>
                        <span
                          className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badgeClass}`}
                        >
                          {item.badge}
                        </span>
                      </div>

                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {item.account_name ? `${item.account_name} · ` : ""}
                        {displayDate(item.occurred_on)} · deleted{" "}
                        {new Date(item.deleted_at).toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>

                      {item.subtext && (
                        <p className="mt-0.5 truncate text-[11px] text-slate-500">{item.subtext}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`num mr-2 font-bold text-xs md:text-sm ${
                          isExpense
                            ? "text-rose-600"
                            : isPos
                            ? "text-emerald-700"
                            : "text-rose-700"
                        }`}
                      >
                        {isExpense
                          ? `−${formatINR(item.amount_paise)}`
                          : isPos
                          ? `+${formatINR(item.amount_paise)}`
                          : formatINR(item.amount_paise)}
                      </span>

                      <Button
                        variant="secondary"
                        className="h-8 px-2.5 text-xs shadow-xs"
                        loading={busyId === item.id}
                        onClick={() => handleRestore(item)}
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                        Restore
                      </Button>

                      <Button
                        variant="ghost"
                        className="h-8 px-2.5 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                        disabled={busyId === item.id}
                        onClick={() => setTarget(item)}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        Delete forever
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!target}
        title="Delete permanently?"
        busy={!!busyId}
        confirmLabel="Delete forever"
        body={
          target
            ? `"${target.title}" will be permanently erased from your database and cannot be recovered.${
                target.kind === "fno"
                  ? " This will permanently erase both the F&O trading entry and any linked income records."
                  : ""
              }`
            : ""
        }
        onConfirm={handleDestroy}
        onClose={() => setTarget(null)}
      />
    </div>
  );
}
