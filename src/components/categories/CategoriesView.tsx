"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Category } from "@/types/db";
import { createClient } from "@/lib/supabase/client";
import { errorMessage, fetchCategories } from "@/lib/data/expenses";
import { formatINR } from "@/lib/utils/money";
import { presetRange, type Preset } from "@/lib/utils/dates";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField, TextField } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { FormError } from "@/components/layout/AuthShell";
import { CATEGORY_COLORS, colorOf } from "./colors";

type Totals = Record<string, { total: number; count: number }>;
const schema = z.object({ name: z.string().trim().min(1, "Enter a name").max(60, "Keep the name under 60 characters"), color: z.string() });
type FormValues = z.infer<typeof schema>;
const RANGES: { key: Preset | "all"; label: string }[] = [
  { key: "all", label: "All time" }, { key: "month", label: "This month" }, { key: "year", label: "This year" }, { key: "week", label: "This week" },
];

export function CategoriesView() {
  const { notify } = useToast();
  const [cats, setCats] = useState<Category[]>([]);
  const [totals, setTotals] = useState<Totals>({});
  const [range, setRange] = useState<Preset | "all">("month");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const db = createClient();
      const r = range === "all" ? { from: null, to: null } : presetRange(range);
      const [c, t] = await Promise.all([fetchCategories(db), db.rpc("category_totals", { p_from: r.from, p_to: r.to })]);
      if (t.error) throw t.error;
      setCats(c);
      setTotals(Object.fromEntries((t.data as { category_id: string; total_paise: number; tx_count: number }[]).map((x) => [x.category_id, { total: Number(x.total_paise), count: Number(x.tx_count) }])));
    } catch (e) { setError(errorMessage(e, "Could not load categories.")); } finally { setLoading(false); }
  }, [range]);
  useEffect(() => { void load(); }, [load]);

  const grand = useMemo(() => Object.values(totals).reduce((a, b) => a + b.total, 0), [totals]);
  const sorted = useMemo(() => [...cats].sort((a, b) => (totals[b.id]?.total ?? 0) - (totals[a.id]?.total ?? 0) || a.name.localeCompare(b.name)), [cats, totals]);

  return (
    <>
      <PageHeader title="Spending categories" description="See where your money goes and manage your categories."
        actions={<Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" aria-hidden />Add category</Button>} />
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Date range">
        {RANGES.map((r) => (
          <button key={r.key} onClick={() => setRange(r.key)} aria-pressed={range === r.key}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${range === r.key ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}>{r.label}</button>
        ))}
      </div>
      {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error} <button className="underline" onClick={() => void load()}>Try again</button></div>}
      {loading ? <ListSkeleton /> : sorted.length === 0 && !error ? (
        <EmptyState title="No categories yet" body="Add a category to start organising expenses." />
      ) : (
        <ul className="divide-y divide-slate-100 rounded-card border border-slate-200 bg-white">
          {sorted.map((c) => {
            const t = totals[c.id] ?? { total: 0, count: 0 };
            const pct = grand > 0 ? (t.total / grand) * 100 : 0;
            return (
              <li key={c.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Link href={`/expenses?category=${c.id}`} className="flex min-w-0 items-center gap-2 font-medium hover:underline">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: colorOf(c.color) }} aria-hidden />
                    <span className="truncate">{c.name}</span>
                  </Link>
                  <div className="flex items-center gap-1">
                    <span className="num mr-2 text-sm"><span className="font-semibold">{formatINR(t.total)}</span> <span className="text-slate-500">· {pct.toFixed(1)}% · {t.count} {t.count === 1 ? "expense" : "expenses"}</span></span>
                    <button aria-label={`Edit ${c.name}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => setEditing(c)}><Pencil className="h-4 w-4" /></button>
                    <button aria-label={`Delete ${c.name}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-red-600" onClick={() => setDeleting(c)}><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100" role="presentation"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: colorOf(c.color) }} /></div>
              </li>
            );
          })}
        </ul>
      )}
      <CategoryForm target={editing} onClose={() => setEditing(null)} onSaved={() => void load()} notify={notify} />
      <DeleteCategory target={deleting} all={cats} counts={totals} onClose={() => setDeleting(null)} onDone={() => void load()} notify={notify} />
    </>
  );
}

type Notify = (k: "success" | "error", m: string) => void;

function CategoryForm({ target, onClose, onSaved, notify }: { target: Category | "new" | null; onClose: () => void; onSaved: () => void; notify: Notify }) {
  const [error, setError] = useState<string | null>(null);
  const existing = target && target !== "new" ? target : null;
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { name: "", color: "indigo" } });
  useEffect(() => { if (target) { reset({ name: existing?.name ?? "", color: existing?.color ?? "indigo" }); setError(null); } }, [target, existing, reset]);

  async function onSubmit(v: FormValues) {
    setError(null);
    try {
      const db = createClient();
      if (existing) {
        const { error } = await db.from("categories").update({ name: v.name.trim(), color: v.color }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { data: { user } } = await db.auth.getUser();
        if (!user) throw new Error("Your session has expired. Log in again.");
        const { error } = await db.from("categories").insert({ name: v.name.trim(), color: v.color, user_id: user.id });
        if (error) throw error;
      }
      notify("success", existing ? "Category updated." : "Category added.");
      onSaved(); onClose();
    } catch (e) {
      const msg = errorMessage(e);
      setError(/categories_user_name_uq|duplicate key/i.test(msg) ? "You already have a category with that name." : msg);
    }
  }
  return (
    <Dialog open={!!target} onClose={onClose} title={existing ? "Edit category" : "Add category"}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormError message={error} />
        <TextField label="Name" {...register("name")} error={errors.name?.message} autoFocus />
        <SelectField label="Colour" {...register("color")}>
          {Object.keys(CATEGORY_COLORS).map((c) => <option key={c} value={c}>{c[0]!.toUpperCase() + c.slice(1)}</option>)}
        </SelectField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" loading={isSubmitting}>Save category</Button>
        </div>
      </form>
    </Dialog>
  );
}

function DeleteCategory({ target, all, onClose, onDone, notify }: { target: Category | null; all: Category[]; counts: Totals; onClose: () => void; onDone: () => void; notify: Notify }) {
  const [replacement, setReplacement] = useState("");
  const [busy, setBusy] = useState(false);
  const [used, setUsed] = useState<number | null>(null);
  useEffect(() => {
    setReplacement(""); setUsed(null);
    if (!target) return;
    // Count ALL transactions (including trashed) so nothing is orphaned.
    void createClient().from("transactions").select("id", { count: "exact", head: true }).eq("category_id", target.id)
      .then(({ count, error }) => setUsed(error ? null : count ?? 0));
  }, [target]);
  const options = all.filter((c) => c.id !== target?.id);

  async function confirm() {
    if (!target) return;
    setBusy(true);
    try {
      const { error } = await createClient().rpc("delete_category", { p_id: target.id, p_replacement: replacement || null });
      if (error) throw error;
      notify("success", used ? `Category deleted. ${used} transactions moved.` : "Category deleted.");
      onDone(); onClose();
    } catch (e) { notify("error", errorMessage(e, "Could not delete the category.")); } finally { setBusy(false); }
  }
  const needsReplacement = (used ?? 0) > 0;
  return (
    <Dialog open={!!target} onClose={onClose} title={`Delete "${target?.name ?? ""}"?`}>
      {used === null ? <p className="text-sm text-slate-500">Checking transactions…</p> : needsReplacement ? (
        <>
          <p className="mb-3 text-sm text-slate-600">{used} transactions use this category. Choose where to move them first.</p>
          <SelectField label="Move transactions to" value={replacement} onChange={(e) => setReplacement(e.target.value)}>
            <option value="">Choose a category</option>
            {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </SelectField>
        </>
      ) : <p className="text-sm text-slate-600">No transactions use this category.</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="danger" loading={busy} disabled={used === null || (needsReplacement && !replacement)} onClick={confirm}>Delete category</Button>
      </div>
    </Dialog>
  );
}
