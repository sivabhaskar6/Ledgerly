import type { SupabaseClient } from "@supabase/supabase-js";
import type { IpoGainWithRefs } from "@/types/db";
import { toIpoRow, type IpoFormValues } from "@/lib/validations/ipo";
import { todayISO } from "@/lib/utils/dates";

async function currentUserId(db: SupabaseClient) {
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) throw new Error("Your session has expired. Log in again.");
  return user.id;
}

export type IpoSummary = {
  trades: IpoGainWithRefs[];
  totalNetPnlPaise: number;
  todayNetPnlPaise: number;
  totalInvestedPaise: number;
  totalSoldPaise: number;
  totalChargesPaise: number;
  totalIpos: number;
  profitableIpos: number;
  lossIpos: number;
  winRatePct: number | null;
  todayIposCount: number;
  tableMissing?: boolean;
};

export async function fetchIpoGains(db: SupabaseClient): Promise<IpoSummary> {
  let trades: IpoGainWithRefs[] = [];
  let tableMissing = false;

  try {
    let { data, error } = await db
      .from("ipo_gains")
      .select("*, account:accounts(name)")
      .is("deleted_at", null)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false });

    if (error && /deleted_at/i.test(error.message)) {
      const fb = await db
        .from("ipo_gains")
        .select("*, account:accounts(name)")
        .order("occurred_on", { ascending: false })
        .order("created_at", { ascending: false });
      data = fb.data;
      error = fb.error;
    }

    if (error) {
      if (/schema cache/i.test(error.message)) {
        tableMissing = true;
      } else {
        throw error;
      }
    } else if (data) {
      trades = data as unknown as IpoGainWithRefs[];
    }
  } catch (err) {
    if (err instanceof Error && /schema cache/i.test(err.message)) {
      tableMissing = true;
    } else {
      throw err;
    }
  }

  const today = todayISO();
  let totalNetPnlPaise = 0;
  let todayNetPnlPaise = 0;
  let totalInvestedPaise = 0;
  let totalSoldPaise = 0;
  let totalChargesPaise = 0;
  let profitableIpos = 0;
  let lossIpos = 0;
  let todayIposCount = 0;

  for (const t of trades) {
    totalNetPnlPaise += t.net_pnl_paise;
    totalChargesPaise += t.charges_paise;
    totalInvestedPaise += t.issue_price_paise * t.quantity;
    totalSoldPaise += t.sold_price_paise * t.quantity;

    if (t.net_pnl_paise > 0) profitableIpos++;
    else if (t.net_pnl_paise < 0) lossIpos++;

    if (t.occurred_on === today) {
      todayNetPnlPaise += t.net_pnl_paise;
      todayIposCount++;
    }
  }

  const totalIpos = trades.length;
  const winRatePct =
    totalIpos > 0 ? Math.round((profitableIpos / totalIpos) * 1000) / 10 : null;

  return {
    trades,
    totalNetPnlPaise,
    todayNetPnlPaise,
    totalInvestedPaise,
    totalSoldPaise,
    totalChargesPaise,
    totalIpos,
    profitableIpos,
    lossIpos,
    winRatePct,
    todayIposCount,
    tableMissing,
  };
}

export function makeIpoIncomeTitle(entry: {
  symbol: string;
  name?: string | null;
  net_pnl_paise: number;
}) {
  const isProfit = entry.net_pnl_paise >= 0;
  const symbol = entry.symbol.toUpperCase();
  return `IPO Listing ${isProfit ? "Gain" : "Loss"}: ${symbol}`;
}

async function syncIpoToIncome(
  db: SupabaseClient,
  userId: string,
  row: ReturnType<typeof toIpoRow>,
  existingIncomeId?: string | null
): Promise<string | null> {
  if (row.net_pnl_paise === 0) {
    if (existingIncomeId) {
      try {
        await db.from("income").delete().eq("id", existingIncomeId);
      } catch {
        // ignore
      }
    }
    return null;
  }

  const title = makeIpoIncomeTitle(row);
  const isProfit = row.net_pnl_paise >= 0;
  const note =
    row.note ||
    `Realized IPO listing ${isProfit ? "gain" : "loss"} (${row.quantity} sh @ ₹${(
      row.sold_price_paise / 100
    ).toFixed(2)})`;

  if (existingIncomeId) {
    try {
      const payload: Record<string, unknown> = {
        title,
        amount_paise: row.net_pnl_paise,
        occurred_on: row.occurred_on,
        note,
      };
      if (row.account_id) payload.account_id = row.account_id;

      const { error } = await db
        .from("income")
        .update(payload)
        .eq("id", existingIncomeId);

      if (!error) return existingIncomeId;

      if (error && /account_id/i.test(error.message)) {
        delete payload.account_id;
        const { error: noAccErr } = await db
          .from("income")
          .update(payload)
          .eq("id", existingIncomeId);
        if (!noAccErr) return existingIncomeId;
      }
    } catch {
      // Fall through to insert if update failed
    }
  }

  const payload: Record<string, unknown> = {
    user_id: userId,
    title,
    source: "ipo_gain",
    amount_paise: row.net_pnl_paise,
    occurred_on: row.occurred_on,
    note,
  };
  if (row.account_id) payload.account_id = row.account_id;

  try {
    let { data, error } = await db
      .from("income")
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      // Fallback if ipo_gain source is rejected (though 'ipo_gain' is default in public.income)
      if (/source/i.test(error.message)) {
        payload.source = "stock_profit";
        const fbRes = await db
          .from("income")
          .insert(payload)
          .select("id")
          .single();
        data = fbRes.data;
        error = fbRes.error;
      }

      // If account_id column is missing
      if (error && /account_id/i.test(error.message)) {
        delete payload.account_id;
        const noAccRes = await db
          .from("income")
          .insert(payload)
          .select("id")
          .single();
        data = noAccRes.data;
        error = noAccRes.error;
      }

      if (error) return null;
    }
    return data?.id ?? null;
  } catch {
    return null;
  }
}

export async function syncUnsyncedIpoGains(db: SupabaseClient): Promise<number> {
  try {
    let { data: unsynced, error } = await db
      .from("ipo_gains")
      .select("*")
      .is("income_id", null)
      .is("deleted_at", null);

    if (error && /deleted_at/i.test(error.message)) {
      const fb = await db
        .from("ipo_gains")
        .select("*")
        .is("income_id", null);
      unsynced = fb.data;
      error = fb.error;
    }

    if (error || !unsynced || unsynced.length === 0) return 0;

    let synced = 0;
    for (const t of unsynced) {
      if (!t.net_pnl_paise || t.net_pnl_paise === 0) continue;
      const title = makeIpoIncomeTitle(t);
      const isProfit = t.net_pnl_paise >= 0;
      const note =
        t.note ||
        `Realized IPO listing ${isProfit ? "gain" : "loss"} (${t.quantity} sh @ ₹${(
          t.sold_price_paise / 100
        ).toFixed(2)})`;

      const payload: Record<string, unknown> = {
        user_id: t.user_id,
        title,
        source: "ipo_gain",
        amount_paise: t.net_pnl_paise,
        occurred_on: t.occurred_on,
        note,
      };
      if (t.account_id) payload.account_id = t.account_id;

      try {
        let { data, error: insErr } = await db
          .from("income")
          .insert(payload)
          .select("id")
          .single();

        if (insErr && /source/i.test(insErr.message)) {
          payload.source = "stock_profit";
          const res = await db.from("income").insert(payload).select("id").single();
          data = res.data;
          insErr = res.error;
        }

        if (insErr && /account_id/i.test(insErr.message)) {
          delete payload.account_id;
          const res = await db.from("income").insert(payload).select("id").single();
          data = res.data;
          insErr = res.error;
        }

        if (!insErr && data?.id) {
          await db.from("ipo_gains").update({ income_id: data.id }).eq("id", t.id);
          synced++;
        }
      } catch {
        // Continue
      }
    }
    return synced;
  } catch {
    return 0;
  }
}

export async function createIpoGain(db: SupabaseClient, v: IpoFormValues) {
  const user_id = await currentUserId(db);
  const row = toIpoRow(v);

  const income_id = await syncIpoToIncome(db, user_id, row);

  const { error } = await db.from("ipo_gains").insert({
    ...row,
    income_id,
    user_id,
  });
  if (error) throw error;
}

export async function updateIpoGain(
  db: SupabaseClient,
  id: string,
  v: IpoFormValues
) {
  const row = toIpoRow(v);

  const { data: existing } = await db
    .from("ipo_gains")
    .select("income_id, user_id")
    .eq("id", id)
    .single();

  const user_id = existing?.user_id || (await currentUserId(db));
  const income_id = await syncIpoToIncome(
    db,
    user_id,
    row,
    existing?.income_id ?? null
  );

  const { data, error } = await db
    .from("ipo_gains")
    .update({ ...row, income_id })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("IPO listing entry not found.");
}

export async function deleteIpoGain(db: SupabaseClient, id: string) {
  const { data: gain } = await db
    .from("ipo_gains")
    .select("income_id")
    .eq("id", id)
    .single();

  const now = new Date().toISOString();

  // 1. Soft-delete in ipo_gains (or fallback to hard delete if deleted_at column is missing)
  let softDeleted = false;
  try {
    const { error } = await db
      .from("ipo_gains")
      .update({ deleted_at: now })
      .eq("id", id)
      .is("deleted_at", null);

    if (!error) {
      softDeleted = true;
    } else if (!/deleted_at/i.test(error.message)) {
      throw error;
    }
  } catch (err) {
    if (err instanceof Error && !/deleted_at/i.test(err.message)) throw err;
  }

  if (!softDeleted) {
    const { data: hardData, error: hardErr } = await db
      .from("ipo_gains")
      .delete()
      .eq("id", id)
      .select("id");
    if (hardErr) throw hardErr;
    if (!hardData?.length) throw new Error("IPO listing entry not found or already deleted.");
  }

  // 2. Symmetrically soft-delete (or hard delete) the corresponding income entry
  if (gain?.income_id) {
    if (softDeleted) {
      try {
        const { error: incErr } = await db
          .from("income")
          .update({ deleted_at: now })
          .eq("id", gain.income_id)
          .is("deleted_at", null);

        if (incErr && /deleted_at/i.test(incErr.message)) {
          await db.from("income").delete().eq("id", gain.income_id);
        }
      } catch {
        try {
          await db.from("income").delete().eq("id", gain.income_id);
        } catch {
          // ignore
        }
      }
    } else {
      try {
        await db.from("income").delete().eq("id", gain.income_id);
      } catch {
        // ignore
      }
    }
  }
}

export async function restoreIpoGain(db: SupabaseClient, id: string) {
  const { data: gain } = await db
    .from("ipo_gains")
    .select("income_id")
    .eq("id", id)
    .single();

  const { error } = await db
    .from("ipo_gains")
    .update({ deleted_at: null })
    .eq("id", id)
    .not("deleted_at", "is", null);
  if (error) throw error;

  if (gain?.income_id) {
    try {
      await db
        .from("income")
        .update({ deleted_at: null })
        .eq("id", gain.income_id)
        .not("deleted_at", "is", null);
    } catch {
      // ignore
    }
  }
}

export async function permanentlyDeleteIpoGain(db: SupabaseClient, id: string) {
  const { data: gain } = await db
    .from("ipo_gains")
    .select("income_id")
    .eq("id", id)
    .single();

  const { error } = await db.from("ipo_gains").delete().eq("id", id);
  if (error) throw error;

  if (gain?.income_id) {
    try {
      await db.from("income").delete().eq("id", gain.income_id);
    } catch {
      // ignore
    }
  }
}
