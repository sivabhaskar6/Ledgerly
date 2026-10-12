import type { SupabaseClient } from "@supabase/supabase-js";
import type { Account, AccountWithBalance, TransferWithRefs } from "@/types/db";
import { toAccountRow, toTransferRow, type AccountFormValues, type TransferFormValues } from "@/lib/validations/account";

async function currentUserId(db: SupabaseClient) {
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) throw new Error("Your session has expired. Log in again.");
  return user.id;
}

export async function fetchAccounts(db: SupabaseClient, includeArchived = false): Promise<Account[]> {
  let query = db.from("accounts").select("*").order("name");
  if (!includeArchived) query = query.is("archived_at", null);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Account[];
}

export async function fetchAccountsWithBalances(db: SupabaseClient): Promise<{
  accounts: AccountWithBalance[];
  totalLiquidPaise: number;
  totalBrokeragePaise: number;
  netWorthPaise: number;
}> {
  const accounts = await fetchAccounts(db, true);
  if (accounts.length === 0) {
    return { accounts: [], totalLiquidPaise: 0, totalBrokeragePaise: 0, netWorthPaise: 0 };
  }

  // Fetch all non-deleted transactions that have an account_id
  const { data: txs, error: txErr } = await db
    .from("transactions")
    .select("account_id, amount_paise")
    .is("deleted_at", null)
    .not("account_id", "is", null);
  if (txErr) throw txErr;

  // Fetch income with account_id if available
  let incomeRows: { account_id: string; amount_paise: number }[] = [];
  try {
    const { data: inc, error: incErr } = await db
      .from("income")
      .select("account_id, amount_paise")
      .not("account_id", "is", null);
    if (!incErr && inc) {
      incomeRows = inc as { account_id: string; amount_paise: number }[];
    }
  } catch {
    // If account_id column is not yet present on income, gracefully proceed
  }

  // Fetch transfers if table exists
  let transfers: { from_account_id: string; to_account_id: string; amount_paise: number }[] = [];
  try {
    const { data: tf, error: tfErr } = await db
      .from("transfers")
      .select("from_account_id, to_account_id, amount_paise");
    if (!tfErr && tf) {
      transfers = tf as { from_account_id: string; to_account_id: string; amount_paise: number }[];
    }
  } catch {
    // If transfers table is not yet migrated
  }

  // Fetch investments affecting cash/brokerage accounts if table exists
  let investments: { account_id: string; trade_type: string; amount_paise: number }[] = [];
  try {
    const { data: inv, error: invErr } = await db
      .from("investments")
      .select("account_id, trade_type, amount_paise")
      .not("account_id", "is", null);
    if (!invErr && inv) {
      investments = inv as { account_id: string; trade_type: string; amount_paise: number }[];
    }
  } catch {
    // Table not yet migrated
  }

  const result: AccountWithBalance[] = accounts.map((acc) => {
    let balance = BigInt(acc.opening_balance_paise);
    let txCount = 0;

    // Subtract expenses
    for (const t of txs ?? []) {
      if (t.account_id === acc.id) {
        balance -= BigInt(t.amount_paise);
        txCount++;
      }
    }

    // Add income
    for (const i of incomeRows) {
      if (i.account_id === acc.id) {
        balance += BigInt(i.amount_paise);
        txCount++;
      }
    }

    // Transfers
    for (const tf of transfers) {
      if (tf.from_account_id === acc.id) {
        balance -= BigInt(tf.amount_paise);
        txCount++;
      }
      if (tf.to_account_id === acc.id) {
        balance += BigInt(tf.amount_paise);
        txCount++;
      }
    }

    // Investments (Buying stock or IPO apply takes money out of the account; selling or IPO refund puts money in)
    for (const iv of investments) {
      if (iv.account_id === acc.id) {
        if (iv.trade_type === "buy" || iv.trade_type === "ipo_apply") {
          balance -= BigInt(iv.amount_paise);
          txCount++;
        } else if (iv.trade_type === "sell" || iv.trade_type === "ipo_refund") {
          balance += BigInt(iv.amount_paise);
          txCount++;
        }
      }
    }

    return {
      ...acc,
      current_balance_paise: Number(balance),
      tx_count: txCount,
    };
  });

  const activeAccounts = result.filter((a) => !a.archived_at);
  const totalLiquidPaise = activeAccounts
    .filter((a) => a.type === "bank" || a.type === "cash")
    .reduce((sum, a) => sum + a.current_balance_paise, 0);

  const totalBrokeragePaise = activeAccounts
    .filter((a) => a.type === "brokerage")
    .reduce((sum, a) => sum + a.current_balance_paise, 0);

  const netWorthPaise = activeAccounts.reduce((sum, a) => sum + a.current_balance_paise, 0);

  return {
    accounts: result,
    totalLiquidPaise,
    totalBrokeragePaise,
    netWorthPaise,
  };
}

export async function createAccount(db: SupabaseClient, v: AccountFormValues) {
  const user_id = await currentUserId(db);
  const { error } = await db.from("accounts").insert({
    ...toAccountRow(v),
    user_id,
  });
  if (error) throw error;
}

export async function updateAccount(db: SupabaseClient, id: string, v: AccountFormValues) {
  const { data, error } = await db
    .from("accounts")
    .update(toAccountRow(v))
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Account not found.");
}

export async function archiveAccount(db: SupabaseClient, id: string) {
  const { data, error } = await db
    .from("accounts")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Account not found.");
}

export async function unarchiveAccount(db: SupabaseClient, id: string) {
  const { data, error } = await db
    .from("accounts")
    .update({ archived_at: null })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Account not found.");
}

export async function fetchTransfers(db: SupabaseClient): Promise<TransferWithRefs[]> {
  try {
    const { data, error } = await db
      .from("transfers")
      .select("*, from_account:accounts!transfers_from_account_id_fkey(name), to_account:accounts!transfers_to_account_id_fkey(name)")
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as TransferWithRefs[];
  } catch {
    return [];
  }
}

export async function createTransfer(db: SupabaseClient, v: TransferFormValues) {
  const user_id = await currentUserId(db);
  const { error } = await db.from("transfers").insert({
    ...toTransferRow(v),
    user_id,
  });
  if (error) throw error;
}

export async function deleteTransfer(db: SupabaseClient, id: string) {
  const { data, error } = await db.from("transfers").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Transfer not found.");
}
