"use client";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { errorMessage, fetchAccounts, fetchCategories } from "@/lib/data/expenses";
import type { Account, Category } from "@/types/db";

export function useLookups() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const db = createClient();
      const [c, a] = await Promise.all([fetchCategories(db), fetchAccounts(db)]);
      setCategories(c); setAccounts(a);
    } catch (e) { setError(errorMessage(e)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return { categories, accounts, loading, error, reload: load };
}
