"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_FILTERS, errorMessage, fetchExpenses, fetchSummary, type ExpenseFilters } from "@/lib/data/expenses";
import { presetRange, todayISO } from "@/lib/utils/dates";
import type { ExpenseWithRefs } from "@/types/db";
import type { Summary } from "@/components/expenses/ExpenseSummary";

export function useExpenses() {
  const [filters, setFilters] = useState<ExpenseFilters>(DEFAULT_FILTERS);
  const [debouncedQ, setDebouncedQ] = useState("");
  const [rows, setRows] = useState<ExpenseWithRefs[]>([]);
  const [count, setCount] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  useEffect(() => { const t = setTimeout(() => setDebouncedQ(filters.q), 300); return () => clearTimeout(t); }, [filters.q]);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true); setError(null);
    const eff = { ...filters, q: debouncedQ };
    const month = presetRange("month");
    try {
      const db = createClient();
      const [list, sum] = await Promise.all([fetchExpenses(db, eff), fetchSummary(db, eff, todayISO(), month.from, month.to)]);
      if (id !== reqId.current) return; // a newer request superseded this one
      setRows(list.rows); setCount(list.count); setSummary(sum);
    } catch (e) {
      if (id === reqId.current) setError(errorMessage(e, "Could not load expenses."));
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [filters, debouncedQ]);

  useEffect(() => { void load(); }, [load]);

  const patch = useCallback((p: Partial<ExpenseFilters>) => setFilters((f) => ({ ...f, ...p })), []);
  return { filters, patch, rows, count, summary, loading, error, reload: load };
}
