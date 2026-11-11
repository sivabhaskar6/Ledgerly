import type { SupabaseClient } from "@supabase/supabase-js";
import type { FnoTradeWithRefs } from "@/types/db";
import {
  toFnoRow,
  calculateGrowwCharges,
  resolveFnoSegment,
  type FnoFormValues,
} from "@/lib/validations/fno";
import { todayISO } from "@/lib/utils/dates";

async function currentUserId(db: SupabaseClient) {
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) throw new Error("Your session has expired. Log in again.");
  return user.id;
}

export type FnoSummary = {
  trades: FnoTradeWithRefs[];
  totalNetPnlPaise: number;
  todayNetPnlPaise: number;
  totalGrossPnlPaise: number;
  totalChargesPaise: number;
  totalTrades: number;
  winTrades: number;
  lossTrades: number;
  winRatePct: number | null;
  todayTradesCount: number;
  tableMissing?: boolean;
};

export async function fetchFnoTrades(db: SupabaseClient): Promise<FnoSummary> {
  let trades: FnoTradeWithRefs[] = [];
  let tableMissing = false;

  try {
    let { data, error } = await db
      .from("fno_trades")
      .select("*, account:accounts(name)")
      .is("deleted_at", null)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false });

    if (error && /deleted_at/i.test(error.message)) {
      const fb = await db
        .from("fno_trades")
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
      trades = data as unknown as FnoTradeWithRefs[];
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
  let totalGrossPnlPaise = 0;
  let totalChargesPaise = 0;
  let winTrades = 0;
  let lossTrades = 0;
  let todayTradesCount = 0;

  for (const t of trades) {
    totalNetPnlPaise += t.net_pnl_paise;
    totalGrossPnlPaise += t.gross_pnl_paise;
    totalChargesPaise += t.charges_paise;

    if (t.net_pnl_paise > 0) winTrades++;
    else if (t.net_pnl_paise < 0) lossTrades++;

    if (t.occurred_on === today) {
      todayNetPnlPaise += t.net_pnl_paise;
      todayTradesCount++;
    }
  }

  const totalTrades = trades.length;
  const winRatePct =
    totalTrades > 0 ? Math.round((winTrades / totalTrades) * 1000) / 10 : null;

  return {
    trades,
    totalNetPnlPaise,
    todayNetPnlPaise,
    totalGrossPnlPaise,
    totalChargesPaise,
    totalTrades,
    winTrades,
    lossTrades,
    winRatePct,
    todayTradesCount,
    tableMissing,
  };
}

export function makeFnoIncomeTitle(trade: {
  symbol: string;
  strike_price_paise?: number | null;
  instrument_type: string;
  net_pnl_paise: number;
}) {
  const isProfit = trade.net_pnl_paise >= 0;
  const strikeLabel = trade.strike_price_paise
    ? ` ${Math.floor(trade.strike_price_paise / 100)}`
    : "";
  const typeLabel =
    trade.instrument_type === "call"
      ? "CE"
      : trade.instrument_type === "put"
      ? "PE"
      : "FUT";
  return `F&O ${isProfit ? "Profit" : "Loss"}: ${trade.symbol.toUpperCase()}${strikeLabel} ${typeLabel}`;
}

async function syncTradeToIncome(
  db: SupabaseClient,
  userId: string,
  row: ReturnType<typeof toFnoRow>,
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

  const title = makeFnoIncomeTitle(row);
  const isProfit = row.net_pnl_paise >= 0;
  const note = row.note || `Realized F&O ${isProfit ? "profit" : "loss"}`;

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
    source: "fno_trading",
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
      // If fno_trading source is not yet in the DB constraint, fallback to stock_profit
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

export async function syncUnsyncedFnoTrades(db: SupabaseClient): Promise<number> {
  try {
    let { data: unsynced, error } = await db
      .from("fno_trades")
      .select("*")
      .is("income_id", null)
      .is("deleted_at", null);

    if (error && /deleted_at/i.test(error.message)) {
      const fb = await db
        .from("fno_trades")
        .select("*")
        .is("income_id", null);
      unsynced = fb.data;
      error = fb.error;
    }

    if (error || !unsynced || unsynced.length === 0) return 0;

    let synced = 0;
    for (const t of unsynced) {
      if (!t.net_pnl_paise || t.net_pnl_paise === 0) continue;
      const title = makeFnoIncomeTitle(t);
      const isProfit = t.net_pnl_paise >= 0;
      const note = t.note || `Realized F&O ${isProfit ? "profit" : "loss"}`;

      const payload: Record<string, unknown> = {
        user_id: t.user_id,
        title,
        source: "fno_trading",
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
          await db.from("fno_trades").update({ income_id: data.id }).eq("id", t.id);
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

export async function createFnoTrade(db: SupabaseClient, v: FnoFormValues) {
  const user_id = await currentUserId(db);
  const row = toFnoRow(v);

  const income_id = await syncTradeToIncome(db, user_id, row);

  const payload: Record<string, unknown> = {
    ...row,
    income_id,
    user_id,
  };

  let { error } = await db.from("fno_trades").insert(payload);
  if (
    error &&
    (/segment/i.test(error.message) ||
      /lots/i.test(error.message) ||
      /lot_size/i.test(error.message))
  ) {
    delete payload.segment;
    delete payload.lots;
    delete payload.lot_size;
    const res = await db.from("fno_trades").insert(payload);
    error = res.error;
  }
  if (error) throw error;
}

export async function updateFnoTrade(
  db: SupabaseClient,
  id: string,
  v: FnoFormValues
) {
  const row = toFnoRow(v);

  const { data: existing } = await db
    .from("fno_trades")
    .select("income_id, user_id")
    .eq("id", id)
    .single();

  const user_id = existing?.user_id || (await currentUserId(db));
  const income_id = await syncTradeToIncome(
    db,
    user_id,
    row,
    existing?.income_id ?? null
  );

  const payload: Record<string, unknown> = { ...row, income_id };

  let { data, error } = await db
    .from("fno_trades")
    .update(payload)
    .eq("id", id)
    .select("id");

  if (
    error &&
    (/segment/i.test(error.message) ||
      /lots/i.test(error.message) ||
      /lot_size/i.test(error.message))
  ) {
    delete payload.segment;
    delete payload.lots;
    delete payload.lot_size;
    const res = await db
      .from("fno_trades")
      .update(payload)
      .eq("id", id)
      .select("id");
    data = res.data;
    error = res.error;
  }

  if (error) throw error;
  if (!data?.length) throw new Error("F&O trade not found.");
}

export async function deleteFnoTrade(db: SupabaseClient, id: string) {
  const { data: trade } = await db
    .from("fno_trades")
    .select("income_id")
    .eq("id", id)
    .single();

  const now = new Date().toISOString();

  // 1. Soft-delete in fno_trades (or fallback to hard delete if deleted_at column is missing)
  let softDeleted = false;
  try {
    const { error } = await db
      .from("fno_trades")
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
      .from("fno_trades")
      .delete()
      .eq("id", id)
      .select("id");
    if (hardErr) throw hardErr;
    if (!hardData?.length) throw new Error("F&O trade not found or already deleted.");
  }

  // 2. Also soft-delete (or hard delete) the corresponding income entry
  if (trade?.income_id) {
    if (softDeleted) {
      try {
        const { error: incErr } = await db
          .from("income")
          .update({ deleted_at: now })
          .eq("id", trade.income_id)
          .is("deleted_at", null);

        if (incErr && /deleted_at/i.test(incErr.message)) {
          await db.from("income").delete().eq("id", trade.income_id);
        }
      } catch {
        try {
          await db.from("income").delete().eq("id", trade.income_id);
        } catch {
          // ignore
        }
      }
    } else {
      try {
        await db.from("income").delete().eq("id", trade.income_id);
      } catch {
        // ignore
      }
    }
  }
}

export async function restoreFnoTrade(db: SupabaseClient, id: string) {
  const { data: trade } = await db
    .from("fno_trades")
    .select("income_id")
    .eq("id", id)
    .single();

  const { error } = await db
    .from("fno_trades")
    .update({ deleted_at: null })
    .eq("id", id)
    .not("deleted_at", "is", null);
  if (error) throw error;

  if (trade?.income_id) {
    try {
      await db
        .from("income")
        .update({ deleted_at: null })
        .eq("id", trade.income_id)
        .not("deleted_at", "is", null);
    } catch {
      // ignore
    }
  }
}

export async function permanentlyDeleteFnoTrade(db: SupabaseClient, id: string) {
  const { data: trade } = await db
    .from("fno_trades")
    .select("income_id")
    .eq("id", id)
    .single();

  const { error } = await db.from("fno_trades").delete().eq("id", id);
  if (error) throw error;

  if (trade?.income_id) {
    try {
      await db.from("income").delete().eq("id", trade.income_id);
    } catch {
      // ignore
    }
  }
}

/**
 * Recalculates charges and net P&L for all active F&O trades using the latest official Groww rates.
 * Symmetrically updates both fno_trades and mirrored income/savings records.
 */
export async function recalculateAllFnoCharges(
  db: SupabaseClient
): Promise<{ updatedCount: number }> {
  const userId = await currentUserId(db);
  const { data: trades, error } = await db
    .from("fno_trades")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null);

  if (error || !trades || trades.length === 0) return { updatedCount: 0 };

  let updatedCount = 0;
  for (const t of trades) {
    const buyPriceRupees = (t.buy_price_paise || 0) / 100;
    const sellPriceRupees = (t.sell_price_paise || 0) / 100;
    const qty = t.quantity || 1;
    const symbol = t.symbol || "NIFTY";
    const segment = resolveFnoSegment(symbol, t.segment);
    const instrumentType = t.instrument_type || "call";

    const chargesBreakdown = calculateGrowwCharges({
      segment,
      instrumentType,
      quantity: qty,
      buyPriceRupees,
      sellPriceRupees,
      symbol,
    });

    const newChargesPaise = chargesBreakdown.totalChargesPaise;
    const buyTurnoverPaise = t.buy_price_paise * qty;
    const sellTurnoverPaise = t.sell_price_paise * qty;
    const grossPnlPaise = sellTurnoverPaise - buyTurnoverPaise;
    const netPnlPaise = grossPnlPaise - newChargesPaise;

    const updatePayload: Record<string, unknown> = {
      charges_paise: newChargesPaise,
      gross_pnl_paise: grossPnlPaise,
      net_pnl_paise: netPnlPaise,
      segment,
    };

    const { error: updateErr } = await db
      .from("fno_trades")
      .update(updatePayload)
      .eq("id", t.id);

    if (updateErr && /segment/i.test(updateErr.message)) {
      delete updatePayload.segment;
      await db.from("fno_trades").update(updatePayload).eq("id", t.id);
    }

    await syncTradeToIncome(
      db,
      userId,
      {
        ...t,
        segment,
        gross_pnl_paise: grossPnlPaise,
        net_pnl_paise: netPnlPaise,
      },
      t.income_id
    );

    updatedCount++;
  }

  return { updatedCount };
}
