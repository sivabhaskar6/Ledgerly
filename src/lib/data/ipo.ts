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

export function isIpoIncome(inc: { source?: string | null; title?: string | null }): boolean {
  if (inc.source === "ipo_gain") return true;
  if (!inc.title) return false;
  return /\bipo\b/i.test(inc.title);
}

export function parseIpoFromIncome(
  title: string,
  amountPaise: number,
  note?: string | null
): {
  symbol: string;
  name: string | null;
  quantity: number;
  issuePricePaise: number;
  soldPricePaise: number;
  chargesPaise: number;
} {
  const rawTitle = (title || "").trim();

  // Strip prefix like "IPO Listing Gain: ", "IPO Listing Loss: ", "IPO Gain: ", "IPO: "
  const cleaned = rawTitle.replace(/^IPO\s*(?:Listing)?\s*(?:Gain|Loss)?\s*:\s*/i, "").trim();

  // Extract clean symbol candidate
  let symbolCandidate = cleaned
    .replace(/\b(IPO|Listing|Gain|Gains|Profit|Profits|Loss|Losses|Pop)\b/gi, "")
    .trim()
    .replace(/\s+/g, " ");

  if (!symbolCandidate) {
    symbolCandidate = cleaned || "IPO";
  }

  const symbol = symbolCandidate.toUpperCase().slice(0, 30);
  const name = rawTitle.toUpperCase() !== symbol ? rawTitle : null;

  let quantity = 1;
  const chargesPaise = 0;
  let issuePricePaise = 0;
  let soldPricePaise = 0;

  if (note) {
    const qtyMatch = note.match(/(\d+)\s*(?:sh|shares|qty)/i);
    if (qtyMatch && qtyMatch[1]) {
      const q = parseInt(qtyMatch[1], 10);
      if (q > 0) quantity = q;
    }
  }

  if (amountPaise >= 0) {
    issuePricePaise = 0;
    soldPricePaise = Math.round(amountPaise / quantity);
  } else {
    issuePricePaise = Math.round(Math.abs(amountPaise) / quantity);
    soldPricePaise = 0;
  }

  return {
    symbol,
    name,
    quantity,
    issuePricePaise,
    soldPricePaise,
    chargesPaise,
  };
}

export async function syncIncomeToIpoGains(db: SupabaseClient): Promise<number> {
  try {
    // 1. Fetch active income entries that match source: 'ipo_gain' or title containing 'IPO'
    let { data: ipoIncomes, error: incErr } = await db
      .from("income")
      .select("id, user_id, title, source, amount_paise, occurred_on, note, account_id, deleted_at")
      .or("source.eq.ipo_gain,title.ilike.%IPO%")
      .is("deleted_at", null);

    if (incErr && /deleted_at/i.test(incErr.message)) {
      const fb = await db
        .from("income")
        .select("id, user_id, title, source, amount_paise, occurred_on, note, account_id")
        .or("source.eq.ipo_gain,title.ilike.%IPO%");
      ipoIncomes = fb.data as typeof ipoIncomes;
      incErr = fb.error;
    }

    if (incErr || !ipoIncomes || ipoIncomes.length === 0) return 0;

    const candidates = ipoIncomes.filter((i) => isIpoIncome(i));
    if (candidates.length === 0) return 0;

    // 2. Fetch existing ipo_gains to find which income_ids are already tracked
    const { data: existingGains, error: ipoErr } = await db
      .from("ipo_gains")
      .select("id, income_id");

    if (ipoErr) {
      // Table might not exist yet
      return 0;
    }

    const trackedIncomeIds = new Set<string>();
    if (existingGains) {
      for (const g of existingGains) {
        if (g.income_id) trackedIncomeIds.add(g.income_id);
      }
    }

    let syncedCount = 0;

    for (const inc of candidates) {
      if (trackedIncomeIds.has(inc.id)) continue;

      const parsed = parseIpoFromIncome(inc.title, Number(inc.amount_paise), inc.note);
      const netPnlPaise = Number(inc.amount_paise);
      const grossPnlPaise = netPnlPaise + parsed.chargesPaise;

      const payload: Record<string, unknown> = {
        user_id: inc.user_id,
        income_id: inc.id,
        symbol: parsed.symbol,
        name: parsed.name,
        quantity: parsed.quantity,
        issue_price_paise: parsed.issuePricePaise,
        sold_price_paise: parsed.soldPricePaise,
        charges_paise: parsed.chargesPaise,
        gross_pnl_paise: grossPnlPaise,
        net_pnl_paise: netPnlPaise,
        occurred_on: inc.occurred_on,
        note: inc.note || "Synced from Income",
      };
      if (inc.account_id) payload.account_id = inc.account_id;

      try {
        const { error: insErr } = await db.from("ipo_gains").insert(payload);
        if (!insErr) {
          syncedCount++;
          trackedIncomeIds.add(inc.id);
          if (inc.source !== "ipo_gain") {
            await db.from("income").update({ source: "ipo_gain" }).eq("id", inc.id);
          }
        } else if (/account_id/i.test(insErr.message)) {
          delete payload.account_id;
          const { error: noAccErr } = await db.from("ipo_gains").insert(payload);
          if (!noAccErr) {
            syncedCount++;
            trackedIncomeIds.add(inc.id);
            if (inc.source !== "ipo_gain") {
              await db.from("income").update({ source: "ipo_gain" }).eq("id", inc.id);
            }
          }
        }
      } catch {
        // Continue
      }
    }

    return syncedCount;
  } catch {
    return 0;
  }
}

export async function fetchIpoGains(db: SupabaseClient): Promise<IpoSummary> {
  // 1. Sync any existing income entries that were added previously
  await syncIncomeToIpoGains(db).catch(() => 0);

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

  // 2. Synthesize any remaining income entries with source 'ipo_gain'
  // (e.g. if ipo_gains table is missing or pending schema refresh)
  try {
    const existingIncomeIds = new Set(
      trades.map((t) => t.income_id).filter(Boolean) as string[]
    );

    const initialRes = await db
      .from("income")
      .select("id, user_id, title, source, amount_paise, occurred_on, note, account_id, created_at, account:accounts(name)")
      .or("source.eq.ipo_gain,title.ilike.%IPO%")
      .is("deleted_at", null)
      .order("occurred_on", { ascending: false });

    let ipoIncomes = initialRes.data;
    if (initialRes.error && /deleted_at/i.test(initialRes.error.message)) {
      const fb = await db
        .from("income")
        .select("id, user_id, title, source, amount_paise, occurred_on, note, account_id, created_at, account:accounts(name)")
        .or("source.eq.ipo_gain,title.ilike.%IPO%")
        .order("occurred_on", { ascending: false });
      ipoIncomes = fb.data;
    }

    if (ipoIncomes && ipoIncomes.length > 0) {
      const syntheticTrades: IpoGainWithRefs[] = [];
      for (const inc of ipoIncomes) {
        if (!isIpoIncome(inc)) continue;
        if (existingIncomeIds.has(inc.id)) continue;

        const parsed = parseIpoFromIncome(inc.title, Number(inc.amount_paise), inc.note);
        const netPaise = Number(inc.amount_paise);
        const grossPaise = netPaise + parsed.chargesPaise;
        const acc = inc.account as unknown as { name?: string } | null;

        syntheticTrades.push({
          id: `inc_${inc.id}`,
          account_id: inc.account_id || null,
          income_id: inc.id,
          symbol: parsed.symbol,
          name: parsed.name,
          quantity: parsed.quantity,
          issue_price_paise: parsed.issuePricePaise,
          sold_price_paise: parsed.soldPricePaise,
          charges_paise: parsed.chargesPaise,
          gross_pnl_paise: grossPaise,
          net_pnl_paise: netPaise,
          occurred_on: inc.occurred_on,
          note: inc.note || "Imported from Income",
          deleted_at: null,
          created_at: inc.created_at,
          updated_at: inc.created_at,
          account: acc?.name ? { name: acc.name } : null,
        });
      }

      if (syntheticTrades.length > 0) {
        trades = [...trades, ...syntheticTrades].sort((a, b) => {
          if (a.occurred_on !== b.occurred_on) {
            return b.occurred_on.localeCompare(a.occurred_on);
          }
          return b.created_at.localeCompare(a.created_at);
        });
      }
    }
  } catch {
    // Continue
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
  // If synthetic from income
  if (id.startsWith("inc_")) {
    const incId = id.slice(4);
    const row = toIpoRow(v);
    const user_id = await currentUserId(db);
    await syncIpoToIncome(db, user_id, row, incId);
    try {
      await db.from("ipo_gains").insert({
        ...row,
        income_id: incId,
        user_id,
      });
    } catch {
      // ignore
    }
    return;
  }

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
  // If synthetic from income
  if (id.startsWith("inc_")) {
    const incId = id.slice(4);
    const now = new Date().toISOString();
    try {
      const { error } = await db.from("income").update({ deleted_at: now }).eq("id", incId);
      if (error && /deleted_at/i.test(error.message)) {
        await db.from("income").delete().eq("id", incId);
      }
    } catch {
      await db.from("income").delete().eq("id", incId);
    }
    return;
  }

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
