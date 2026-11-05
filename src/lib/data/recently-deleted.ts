import type { SupabaseClient } from "@supabase/supabase-js";
import { permanentlyDeleteExpense, restoreExpense } from "@/lib/data/expenses";

export type DeletedItemKind = "expense" | "income" | "fno" | "ipo";

export type DeletedItem = {
  id: string;
  kind: DeletedItemKind;
  title: string;
  amount_paise: number;
  occurred_on: string;
  deleted_at: string;
  badge: string;
  subtext?: string;
  account_name?: string | null;
  linkedTradeId?: string | null;
  linkedIpoId?: string | null;
  linkedIncomeId?: string | null;
};

export async function fetchRecentlyDeleted(db: SupabaseClient): Promise<DeletedItem[]> {
  const items: DeletedItem[] = [];

  // 1. Fetch soft-deleted Expenses
  try {
    const { data: exps, error: expErr } = await db
      .from("transactions")
      .select("id, title, amount_paise, occurred_on, deleted_at, note, category:categories(name), account:accounts(name)")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });

    if (!expErr && exps) {
      for (const e of exps) {
        const cat = e.category as unknown as { name?: string } | null;
        const acc = e.account as unknown as { name?: string } | null;
        items.push({
          id: e.id,
          kind: "expense",
          title: e.title,
          amount_paise: Number(e.amount_paise),
          occurred_on: e.occurred_on,
          deleted_at: e.deleted_at || new Date().toISOString(),
          badge: cat?.name ? `Expense · ${cat.name}` : "Expense",
          subtext: e.note || undefined,
          account_name: acc?.name || null,
        });
      }
    }
  } catch {
    // Continue
  }

  // 2. Fetch soft-deleted Income entries
  const deletedIncomeMap = new Map<string, {
    id: string;
    title: string;
    source: string;
    amount_paise: number;
    occurred_on: string;
    deleted_at: string;
    note: string | null;
    account_name: string | null;
  }>();

  try {
    const { data: incs, error: incErr } = await db
      .from("income")
      .select("id, title, source, amount_paise, occurred_on, deleted_at, note, account:accounts(name)")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });

    if (!incErr && incs) {
      for (const i of incs) {
        const acc = i.account as unknown as { name?: string } | null;
        deletedIncomeMap.set(i.id, {
          id: i.id,
          title: i.title,
          source: i.source,
          amount_paise: Number(i.amount_paise),
          occurred_on: i.occurred_on,
          deleted_at: i.deleted_at || new Date().toISOString(),
          note: i.note,
          account_name: acc?.name || null,
        });
      }
    }
  } catch {
    // deleted_at column might not exist yet on income
  }

  // 3. Fetch soft-deleted F&O trades
  const handledIncomeIds = new Set<string>();

  try {
    const { data: trades, error: fnoErr } = await db
      .from("fno_trades")
      .select("id, symbol, instrument_type, strike_price_paise, net_pnl_paise, occurred_on, deleted_at, note, income_id, account:accounts(name)")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });

    if (!fnoErr && trades) {
      for (const t of trades) {
        const acc = t.account as unknown as { name?: string } | null;
        const strikeLabel = t.strike_price_paise ? ` ${Math.floor(t.strike_price_paise / 100)}` : "";
        const instLabel = t.instrument_type === "call" ? "CE" : t.instrument_type === "put" ? "PE" : "FUT";
        const netPaise = Number(t.net_pnl_paise);
        const isProfit = netPaise >= 0;

        let incomeEntry: ReturnType<typeof deletedIncomeMap.get> | undefined;
        if (t.income_id && deletedIncomeMap.has(t.income_id)) {
          incomeEntry = deletedIncomeMap.get(t.income_id);
          handledIncomeIds.add(t.income_id);
        }

        const deletedAt = t.deleted_at || incomeEntry?.deleted_at || new Date().toISOString();

        items.push({
          id: t.id,
          kind: "fno",
          title: `F&O ${isProfit ? "Profit" : "Loss"}: ${t.symbol.toUpperCase()}${strikeLabel} ${instLabel}`,
          amount_paise: netPaise,
          occurred_on: t.occurred_on,
          deleted_at: deletedAt,
          badge: `F&O ${instLabel}`,
          subtext: t.note || (isProfit ? "Realized trading profit" : "Realized trading loss"),
          account_name: acc?.name || incomeEntry?.account_name || null,
          linkedTradeId: t.id,
          linkedIncomeId: t.income_id || null,
        });
      }
    }
  } catch {
    // deleted_at column or fno_trades table might not exist yet
  }

  // 4. Fetch soft-deleted IPO gains
  try {
    const { data: ipos, error: ipoErr } = await db
      .from("ipo_gains")
      .select("id, symbol, name, quantity, issue_price_paise, sold_price_paise, net_pnl_paise, occurred_on, deleted_at, note, income_id, account:accounts(name)")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });

    if (!ipoErr && ipos) {
      for (const t of ipos) {
        const acc = t.account as unknown as { name?: string } | null;
        const netPaise = Number(t.net_pnl_paise);
        const isProfit = netPaise >= 0;

        let incomeEntry: ReturnType<typeof deletedIncomeMap.get> | undefined;
        if (t.income_id && deletedIncomeMap.has(t.income_id)) {
          incomeEntry = deletedIncomeMap.get(t.income_id);
          handledIncomeIds.add(t.income_id);
        }

        const deletedAt = t.deleted_at || incomeEntry?.deleted_at || new Date().toISOString();

        items.push({
          id: t.id,
          kind: "ipo",
          title: `IPO Listing ${isProfit ? "Gain" : "Loss"}: ${t.symbol.toUpperCase()}`,
          amount_paise: netPaise,
          occurred_on: t.occurred_on,
          deleted_at: deletedAt,
          badge: "IPO Listing",
          subtext:
            t.note ||
            `${t.quantity} sh @ ₹${(t.sold_price_paise / 100).toFixed(2)} (Allotted @ ₹${(
              t.issue_price_paise / 100
            ).toFixed(2)})`,
          account_name: acc?.name || incomeEntry?.account_name || null,
          linkedIpoId: t.id,
          linkedIncomeId: t.income_id || null,
        });
      }
    }
  } catch {
    // ipo_gains table might not exist yet
  }

  // 5. Add remaining deleted income rows (those not already represented by F&O or IPO)
  for (const [incId, inc] of deletedIncomeMap.entries()) {
    if (handledIncomeIds.has(incId)) continue;

    const isFno = inc.source === "fno_trading";
    const isIpo = inc.source === "ipo_gain";
    items.push({
      id: inc.id,
      kind: isFno ? "fno" : isIpo ? "ipo" : "income",
      title: inc.title,
      amount_paise: inc.amount_paise,
      occurred_on: inc.occurred_on,
      deleted_at: inc.deleted_at,
      badge: isFno ? "F&O Trade" : isIpo ? "IPO Listing" : formatIncomeSourceBadge(inc.source),
      subtext: inc.note || undefined,
      account_name: inc.account_name,
      linkedIncomeId: inc.id,
    });
  }

  // Sort all deleted items by deleted_at descending
  items.sort((a, b) => b.deleted_at.localeCompare(a.deleted_at));

  return items;
}

function formatIncomeSourceBadge(source: string) {
  switch (source) {
    case "stock_profit":
      return "Stock profit";
    case "fno_trading":
      return "F&O Trade";
    case "ipo_gain":
      return "IPO gain";
    case "dividend":
      return "Dividend";
    case "interest":
      return "Interest";
    default:
      return "Income";
  }
}

export async function restoreRecentlyDeleted(db: SupabaseClient, item: DeletedItem) {
  if (item.kind === "expense") {
    await restoreExpense(db, item.id);
    return;
  }

  // If item is F&O or linked to F&O
  if (item.kind === "fno") {
    const tradeId = item.linkedTradeId || (item.id.startsWith("fno_") ? item.id.slice(4) : item.id);
    const incomeId = item.linkedIncomeId;

    // 1. Restore F&O trade
    if (tradeId) {
      try {
        await db
          .from("fno_trades")
          .update({ deleted_at: null })
          .eq("id", tradeId)
          .not("deleted_at", "is", null);
      } catch {
        // ignore
      }
    }

    // 2. Restore linked income entry
    if (incomeId) {
      try {
        await db
          .from("income")
          .update({ deleted_at: null })
          .eq("id", incomeId)
          .not("deleted_at", "is", null);
      } catch {
        // ignore
      }
    } else if (tradeId) {
      try {
        await db
          .from("income")
          .update({ deleted_at: null })
          .eq("id", tradeId)
          .not("deleted_at", "is", null);
      } catch {
        // ignore
      }
    }
    return;
  }

  // If item is IPO or linked to IPO
  if (item.kind === "ipo") {
    const ipoId = item.linkedIpoId || (item.id.startsWith("ipo_") ? item.id.slice(4) : item.id);
    const incomeId = item.linkedIncomeId;

    // 1. Restore IPO gain
    if (ipoId) {
      try {
        await db
          .from("ipo_gains")
          .update({ deleted_at: null })
          .eq("id", ipoId)
          .not("deleted_at", "is", null);
      } catch {
        // ignore
      }
    }

    // 2. Restore linked income entry
    if (incomeId) {
      try {
        await db
          .from("income")
          .update({ deleted_at: null })
          .eq("id", incomeId)
          .not("deleted_at", "is", null);
      } catch {
        // ignore
      }
    } else if (ipoId) {
      try {
        await db
          .from("income")
          .update({ deleted_at: null })
          .eq("id", ipoId)
          .not("deleted_at", "is", null);
      } catch {
        // ignore
      }
    }
    return;
  }

  // Regular Income entry
  if (item.kind === "income") {
    const { error } = await db
      .from("income")
      .update({ deleted_at: null })
      .eq("id", item.id)
      .not("deleted_at", "is", null);
    if (error) throw error;
  }
}

export async function permanentlyDeleteRecentlyDeleted(db: SupabaseClient, item: DeletedItem) {
  if (item.kind === "expense") {
    await permanentlyDeleteExpense(db, item.id);
    return;
  }

  // If item is F&O or linked to F&O
  if (item.kind === "fno") {
    const tradeId = item.linkedTradeId || (item.id.startsWith("fno_") ? item.id.slice(4) : item.id);
    const incomeId = item.linkedIncomeId;

    // Delete F&O trade
    if (tradeId) {
      try {
        await db.from("fno_trades").delete().eq("id", tradeId);
      } catch {
        // ignore
      }
    }

    // Delete income entry
    if (incomeId) {
      try {
        await db.from("income").delete().eq("id", incomeId);
      } catch {
        // ignore
      }
    } else if (tradeId) {
      try {
        await db.from("income").delete().eq("id", tradeId);
      } catch {
        // ignore
      }
    }
    return;
  }

  // If item is IPO or linked to IPO
  if (item.kind === "ipo") {
    const ipoId = item.linkedIpoId || (item.id.startsWith("ipo_") ? item.id.slice(4) : item.id);
    const incomeId = item.linkedIncomeId;

    // Delete IPO gain
    if (ipoId) {
      try {
        await db.from("ipo_gains").delete().eq("id", ipoId);
      } catch {
        // ignore
      }
    }

    // Delete income entry
    if (incomeId) {
      try {
        await db.from("income").delete().eq("id", incomeId);
      } catch {
        // ignore
      }
    } else if (ipoId) {
      try {
        await db.from("income").delete().eq("id", ipoId);
      } catch {
        // ignore
      }
    }
    return;
  }

  // Regular Income entry
  if (item.kind === "income") {
    const { error } = await db.from("income").delete().eq("id", item.id);
    if (error) throw error;
  }
}
