"use client";
import { ArrowDown, ArrowUp, Eye, Pencil, Trash2 } from "lucide-react";
import type { ExpenseWithRefs } from "@/types/db";
import type { ExpenseFilters, SortKey } from "@/lib/data/expenses";
import { formatINR } from "@/lib/utils/money";
import { displayDate } from "@/lib/utils/dates";

type Props = {
  rows: ExpenseWithRefs[]; sort: SortKey; dir: "asc" | "desc";
  onSort: (k: SortKey) => void; onView: (e: ExpenseWithRefs) => void; onEdit: (e: ExpenseWithRefs) => void; onDelete: (e: ExpenseWithRefs) => void;
};
export type { ExpenseFilters };

function Actions({ e, onView, onEdit, onDelete }: Pick<Props, "onView" | "onEdit" | "onDelete"> & { e: ExpenseWithRefs }) {
  const b = "rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900";
  return (
    <div className="flex justify-end gap-1">
      <button className={b} aria-label={`View ${e.title}`} onClick={() => onView(e)}><Eye className="h-3.5 w-3.5" /></button>
      <button className={b} aria-label={`Edit ${e.title}`} onClick={() => onEdit(e)}><Pencil className="h-3.5 w-3.5" /></button>
      <button className={`${b} hover:text-red-600`} aria-label={`Delete ${e.title}`} onClick={() => onDelete(e)}><Trash2 className="h-3.5 w-3.5" /></button>
    </div>
  );
}

function SortHead({ label, k, sort, dir, onSort, right }: { label: string; k: SortKey; sort: SortKey; dir: "asc" | "desc"; onSort: (k: SortKey) => void; right?: boolean }) {
  const active = sort === k;
  return (
    <th scope="col" aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"} className={`px-4 py-2 font-semibold ${right ? "text-right" : "text-left"}`}>
      <button onClick={() => onSort(k)} className="inline-flex items-center gap-1 hover:text-slate-900">
        {label}{active && (dir === "asc" ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />)}
      </button>
    </th>
  );
}

export function ExpenseTable({ rows, sort, dir, onSort, onView, onEdit, onDelete }: Props) {
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Desktop / tablet table */}
      <div className="hidden md:flex flex-1 min-h-0 overflow-y-auto overflow-x-auto rounded-card border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-xs md:text-sm text-left">
          <caption className="sr-only">Expenses</caption>
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-slate-600 text-xs font-semibold shadow-xs">
            <tr>
              <th scope="col" className="px-4 py-2 font-semibold">Category</th>
              <th scope="col" className="px-4 py-2 font-semibold">Expense title</th>
              <SortHead label="Date" k="date" sort={sort} dir={dir} onSort={onSort} />
              <th scope="col" className="px-4 py-2 font-semibold">Note</th>
              <SortHead label="Amount" k="amount" sort={sort} dir={dir} onSort={onSort} right />
              <th scope="col" className="px-4 py-2 text-right font-semibold"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((e) => (
              <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-2 text-slate-600 font-medium">{e.category?.name ?? "—"}</td>
                <td className="px-4 py-2 font-semibold text-slate-900">{e.title}</td>
                <td className="num whitespace-nowrap px-4 py-2 text-slate-600">{displayDate(e.occurred_on)}</td>
                <td className="max-w-[16rem] truncate px-4 py-2 text-slate-500" title={e.note ?? undefined}>{e.note ?? ""}</td>
                <td className="num whitespace-nowrap px-4 py-2 text-right font-bold text-red-600">{formatINR(e.amount_paise)}</td>
                <td className="px-2 py-1"><Actions e={e} onView={onView} onEdit={onEdit} onDelete={onDelete} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Mobile card list */}
      <ul className="space-y-2 md:hidden overflow-y-auto flex-1 min-h-0">
        {rows.map((e) => (
          <li key={e.id} className="rounded-card border border-slate-200 bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{e.title}</p>
                <p className="mt-0.5 text-xs text-slate-500">{e.category?.name ?? "—"} · {displayDate(e.occurred_on)}</p>
              </div>
              <p className="num shrink-0 font-semibold text-red-600">{formatINR(e.amount_paise)}</p>
            </div>
            {e.note && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{e.note}</p>}
            <div className="mt-1 border-t border-slate-100 pt-1"><Actions e={e} onView={onView} onEdit={onEdit} onDelete={onDelete} /></div>
          </li>
        ))}
      </ul>
    </div>
  );
}
