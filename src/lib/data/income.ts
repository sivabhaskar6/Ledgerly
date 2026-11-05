import type { SupabaseClient } from "@supabase/supabase-js";
import { toIncomeRow, type IncomeFormValues } from "@/lib/validations/income";
import { presetRange, todayISO } from "@/lib/utils/dates";
import { deleteFnoTrade, makeFnoIncomeTitle, syncUnsyncedFnoTrades } from "@/lib/data/fno";
import { deleteIpoGain, makeIpoIncomeTitle, syncUnsyncedIpoGains } from "@/lib/data/ipo";

export type Income = {
  id: string;
  title: string;
  source: string;
  note: string | null;
  occurred_on: string;
  amount_paise: number;
  deleted_at?: string | null;
  created_at: string;
};

export const INCOME_PAGE_SIZE = 20;

export async function fetchIncome(db: SupabaseClient, page: number) {
  // 1. Attempt to sync any unsynced F&O trades and IPO gains into the database income table
  await Promise.all([
    syncUnsyncedFnoTrades(db).catch(() => 0),
    syncUnsyncedIpoGains(db).catch(() => 0),
  ]);

  const from = page * INCOME_PAGE_SIZE;

  let data: Income[] | null = null;
  let count: number | null = null;
  let queryError: { message: string } | null = null;

  try {
    const res = await db
      .from("income")
      .select("*", { count: "exact" })
      .is("deleted_at", null)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, from + INCOME_PAGE_SIZE - 1);
    data = (res.data as unknown as Income[]) ?? null;
    count = res.count;
    queryError = res.error;

    if (queryError && /deleted_at/i.test(queryError.message)) {
      // Fallback for pre-migration table without deleted_at column
      const fb = await db
        .from("income")
        .select("*", { count: "exact" })
        .order("occurred_on", { ascending: false })
        .order("created_at", { ascending: false })
        .range(from, from + INCOME_PAGE_SIZE - 1);
      data = (fb.data as unknown as Income[]) ?? null;
      count = fb.count;
      queryError = fb.error;
    }
  } catch (err) {
    if (err instanceof Error) queryError = err;
  }

  if (queryError) throw queryError;

  let rows = (data ?? []) as Income[];
  let totalCount = count ?? 0;

  // 2. Fallback synthesis for any unsynced non-deleted F&O trades
  const syntheticRows: Income[] = [];

  try {
    const query = db
      .from("fno_trades")
      .select("id, symbol, instrument_type, strike_price_paise, net_pnl_paise, occurred_on, note, created_at")
      .is("income_id", null)
      .is("deleted_at", null)
      .neq("net_pnl_paise", 0)
      .order("occurred_on", { ascending: false });

    const fnoRes = await query;
    let unsyncedTrades = fnoRes.data;
    if (fnoRes.error && /deleted_at/i.test(fnoRes.error.message)) {
      const fb = await db
        .from("fno_trades")
        .select("id, symbol, instrument_type, strike_price_paise, net_pnl_paise, occurred_on, note, created_at")
        .is("income_id", null)
        .neq("net_pnl_paise", 0)
        .order("occurred_on", { ascending: false });
      unsyncedTrades = fb.data;
    }

    if (unsyncedTrades && unsyncedTrades.length > 0) {
      for (const t of unsyncedTrades) {
        syntheticRows.push({
          id: `fno_${t.id}`,
          title: makeFnoIncomeTitle({
            symbol: t.symbol,
            strike_price_paise: t.strike_price_paise,
            instrument_type: t.instrument_type,
            net_pnl_paise: t.net_pnl_paise,
          }),
          source: "fno_trading",
          occurred_on: t.occurred_on,
          amount_paise: t.net_pnl_paise,
          note: t.note || (t.net_pnl_paise >= 0 ? "Realized F&O profit" : "Realized F&O loss"),
          created_at: t.created_at,
        });
      }
    }
  } catch {
    // fno_trades table might not exist yet
  }

  // 3. Fallback synthesis for any unsynced non-deleted IPO gains
  try {
    const ipoQuery = db
      .from("ipo_gains")
      .select("id, symbol, name, net_pnl_paise, occurred_on, note, created_at")
      .is("income_id", null)
      .is("deleted_at", null)
      .neq("net_pnl_paise", 0)
      .order("occurred_on", { ascending: false });

    const ipoRes = await ipoQuery;
    let unsyncedIpos = ipoRes.data;
    if (ipoRes.error && /deleted_at/i.test(ipoRes.error.message)) {
      const fb = await db
        .from("ipo_gains")
        .select("id, symbol, name, net_pnl_paise, occurred_on, note, created_at")
        .is("income_id", null)
        .neq("net_pnl_paise", 0)
        .order("occurred_on", { ascending: false });
      unsyncedIpos = fb.data;
    }

    if (unsyncedIpos && unsyncedIpos.length > 0) {
      for (const t of unsyncedIpos) {
        syntheticRows.push({
          id: `ipo_${t.id}`,
          title: makeIpoIncomeTitle({
            symbol: t.symbol,
            name: t.name,
            net_pnl_paise: t.net_pnl_paise,
          }),
          source: "ipo_gain",
          occurred_on: t.occurred_on,
          amount_paise: t.net_pnl_paise,
          note: t.note || (t.net_pnl_paise >= 0 ? "Realized IPO listing gain" : "Realized IPO listing loss"),
          created_at: t.created_at,
        });
      }
    }
  } catch {
    // ipo_gains table might not exist yet
  }

  if (syntheticRows.length > 0) {
    const combined = [...rows, ...syntheticRows].sort((a, b) => {
      if (a.occurred_on !== b.occurred_on) {
        return b.occurred_on.localeCompare(a.occurred_on);
      }
      return b.created_at.localeCompare(a.created_at);
    });

    totalCount += syntheticRows.length;
    rows = combined.slice(from, from + INCOME_PAGE_SIZE);
  }

  return { rows, count: totalCount };
}

export async function fetchIncomeSummary(db: SupabaseClient) {
  const m = presetRange("month");
  const y = presetRange("year");
  const today = todayISO();

  // Try to sync any unsynced F&O trades and IPO gains first
  await Promise.all([
    syncUnsyncedFnoTrades(db).catch(() => 0),
    syncUnsyncedIpoGains(db).catch(() => 0),
  ]);

  let todayPaise = 0;
  let monthPaise = 0;
  let yearPaise = 0;

  try {
    const { data, error } = await db.rpc("income_summary", {
      p_today: today,
      p_month_start: m.from,
      p_month_end: m.to,
      p_year_start: y.from,
      p_year_end: y.to,
    });
    if (!error && data) {
      const r = (data as { today_paise: number; month_paise: number; year_paise: number }[])[0];
      todayPaise = Number(r?.today_paise ?? 0);
      monthPaise = Number(r?.month_paise ?? 0);
      yearPaise = Number(r?.year_paise ?? 0);
    } else {
      // Direct sum fallback if RPC is unavailable
      const incRes = await db
        .from("income")
        .select("amount_paise, occurred_on")
        .is("deleted_at", null);
      let incRows = incRes.data;

      if (incRes.error && /deleted_at/i.test(incRes.error.message)) {
        const fb = await db.from("income").select("amount_paise, occurred_on");
        incRows = fb.data;
      }

      if (incRows) {
        for (const row of incRows) {
          const amt = Number(row.amount_paise || 0);
          if (row.occurred_on === today) todayPaise += amt;
          if (row.occurred_on >= m.from && row.occurred_on <= m.to) monthPaise += amt;
          if (row.occurred_on >= y.from && row.occurred_on <= y.to) yearPaise += amt;
        }
      }
    }
  } catch {
    // Continue
  }

  // Factor in any remaining unsynced non-deleted F&O trades (where income_id is null)
  try {
    const fnoRes = await db
      .from("fno_trades")
      .select("net_pnl_paise, occurred_on")
      .is("income_id", null)
      .is("deleted_at", null);
    let unsyncedTrades = fnoRes.data;

    if (fnoRes.error && /deleted_at/i.test(fnoRes.error.message)) {
      const fb = await db
        .from("fno_trades")
        .select("net_pnl_paise, occurred_on")
        .is("income_id", null);
      unsyncedTrades = fb.data;
    }

    if (unsyncedTrades) {
      for (const t of unsyncedTrades) {
        const net = Number(t.net_pnl_paise || 0);
        if (t.occurred_on === today) todayPaise += net;
        if (t.occurred_on >= m.from && t.occurred_on <= m.to) monthPaise += net;
        if (t.occurred_on >= y.from && t.occurred_on <= y.to) yearPaise += net;
      }
    }
  } catch {
    // fno_trades table might not exist
  }

  // Factor in any remaining unsynced non-deleted IPO gains (where income_id is null)
  try {
    const ipoRes = await db
      .from("ipo_gains")
      .select("net_pnl_paise, occurred_on")
      .is("income_id", null)
      .is("deleted_at", null);
    let unsyncedIpos = ipoRes.data;

    if (ipoRes.error && /deleted_at/i.test(ipoRes.error.message)) {
      const fb = await db
        .from("ipo_gains")
        .select("net_pnl_paise, occurred_on")
        .is("income_id", null);
      unsyncedIpos = fb.data;
    }

    if (unsyncedIpos) {
      for (const t of unsyncedIpos) {
        const net = Number(t.net_pnl_paise || 0);
        if (t.occurred_on === today) todayPaise += net;
        if (t.occurred_on >= m.from && t.occurred_on <= m.to) monthPaise += net;
        if (t.occurred_on >= y.from && t.occurred_on <= y.to) yearPaise += net;
      }
    }
  } catch {
    // ipo_gains table might not exist
  }

  return { today: todayPaise, month: monthPaise, year: yearPaise };
}

export async function createIncome(db: SupabaseClient, v: IncomeFormValues) {
  const {
    data: { user },
    error: uerr,
  } = await db.auth.getUser();
  if (uerr || !user) throw new Error("Your session has expired. Log in again.");

  const row = toIncomeRow(v);

  const { error } = await db.from("income").insert({ ...row, user_id: user.id });
  if (error) throw error;
}

export async function updateIncome(db: SupabaseClient, id: string, v: IncomeFormValues) {
  if (id.startsWith("fno_")) {
    throw new Error("This entry is managed by the F&O Trading Journal. Please edit it under F&O.");
  }
  if (id.startsWith("ipo_")) {
    throw new Error("This entry is managed by IPO Listing Gains. Please edit it under IPO Listing Gains.");
  }
  const { data, error } = await db.from("income").update(toIncomeRow(v)).eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("This income entry no longer exists.");
}

export async function deleteIncome(db: SupabaseClient, id: string) {
  // If it's a synthetic unsynced F&O entry
  if (id.startsWith("fno_")) {
    const tradeId = id.slice(4);
    await deleteFnoTrade(db, tradeId);
    return;
  }

  // If it's a synthetic unsynced IPO entry
  if (id.startsWith("ipo_")) {
    const ipoId = id.slice(4);
    await deleteIpoGain(db, ipoId);
    return;
  }

  const now = new Date().toISOString();

  // Find if any fno_trades or ipo_gains is linked to this income entry
  let linkedTradeId: string | null = null;
  try {
    const { data: trade } = await db
      .from("fno_trades")
      .select("id")
      .eq("income_id", id)
      .maybeSingle();
    if (trade?.id) linkedTradeId = trade.id;
  } catch {
    // Table might not exist
  }

  let linkedIpoId: string | null = null;
  try {
    const { data: ipo } = await db
      .from("ipo_gains")
      .select("id")
      .eq("income_id", id)
      .maybeSingle();
    if (ipo?.id) linkedIpoId = ipo.id;
  } catch {
    // Table might not exist
  }

  // 1. Soft-delete the income entry (or fallback to hard delete if column missing)
  let softDeleted = false;
  try {
    const { error: incErr } = await db
      .from("income")
      .update({ deleted_at: now })
      .eq("id", id)
      .is("deleted_at", null);

    if (!incErr) {
      softDeleted = true;
    } else if (!/deleted_at/i.test(incErr.message)) {
      throw incErr;
    }
  } catch (err) {
    if (err instanceof Error && !/deleted_at/i.test(err.message)) throw err;
  }

  if (!softDeleted) {
    const { data: hardData, error: hardErr } = await db
      .from("income")
      .delete()
      .eq("id", id)
      .select("id");
    if (hardErr) throw hardErr;
    if (!hardData?.length) throw new Error("This income entry was already deleted.");
  }

  // 2. If it was added from F&O, STRICTLY delete/soft-delete from fno_trades too!
  if (linkedTradeId) {
    if (softDeleted) {
      try {
        const { error: tradeErr } = await db
          .from("fno_trades")
          .update({ deleted_at: now })
          .eq("id", linkedTradeId)
          .is("deleted_at", null);

        if (tradeErr && /deleted_at/i.test(tradeErr.message)) {
          await db.from("fno_trades").delete().eq("id", linkedTradeId);
        }
      } catch {
        try {
          await db.from("fno_trades").delete().eq("id", linkedTradeId);
        } catch {
          // ignore
        }
      }
    } else {
      try {
        await db.from("fno_trades").delete().eq("id", linkedTradeId);
      } catch {
        // ignore
      }
    }
  }

  // 3. If it was added from IPO, STRICTLY delete/soft-delete from ipo_gains too!
  if (linkedIpoId) {
    if (softDeleted) {
      try {
        const { error: ipoErr } = await db
          .from("ipo_gains")
          .update({ deleted_at: now })
          .eq("id", linkedIpoId)
          .is("deleted_at", null);

        if (ipoErr && /deleted_at/i.test(ipoErr.message)) {
          await db.from("ipo_gains").delete().eq("id", linkedIpoId);
        }
      } catch {
        try {
          await db.from("ipo_gains").delete().eq("id", linkedIpoId);
        } catch {
          // ignore
        }
      }
    } else {
      try {
        await db.from("ipo_gains").delete().eq("id", linkedIpoId);
      } catch {
        // ignore
      }
    }
  }
}

export async function restoreIncome(db: SupabaseClient, id: string) {
  // 1. Restore income row
  const { error } = await db
    .from("income")
    .update({ deleted_at: null })
    .eq("id", id)
    .not("deleted_at", "is", null);
  if (error) throw error;

  // 2. Also restore any linked F&O trade
  try {
    await db
      .from("fno_trades")
      .update({ deleted_at: null })
      .eq("income_id", id)
      .not("deleted_at", "is", null);
  } catch {
    // ignore
  }

  // 3. Also restore any linked IPO gain
  try {
    await db
      .from("ipo_gains")
      .update({ deleted_at: null })
      .eq("income_id", id)
      .not("deleted_at", "is", null);
  } catch {
    // ignore
  }
}

export async function permanentlyDeleteIncome(db: SupabaseClient, id: string) {
  // 1. Delete linked F&O trade if any
  try {
    await db.from("fno_trades").delete().eq("income_id", id);
  } catch {
    // ignore
  }

  // 2. Delete linked IPO gain if any
  try {
    await db.from("ipo_gains").delete().eq("income_id", id);
  } catch {
    // ignore
  }

  // 3. Delete income entry
  const { error } = await db.from("income").delete().eq("id", id);
  if (error) throw error;
}
