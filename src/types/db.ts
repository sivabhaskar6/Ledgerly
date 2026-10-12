export type Category = { id: string; name: string; icon: string; color: string; created_at: string };

export type Account = {
  id: string;
  name: string;
  type: "cash" | "bank" | "brokerage";
  opening_balance_paise: number;
  opening_date: string | null;
  archived_at: string | null;
  created_at: string;
};

export type AccountWithBalance = Account & {
  current_balance_paise: number;
  tx_count: number;
};

export type Expense = {
  id: string;
  category_id: string;
  account_id: string | null;
  title: string;
  note: string | null;
  occurred_on: string;
  amount_paise: number;
  payment_method: string | null;
  external_ref?: string | null;
  fingerprint?: string | null;
  import_batch_id?: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ExpenseWithRefs = Expense & {
  category: { name: string } | null;
  account: { name: string } | null;
};

export type Transfer = {
  id: string;
  from_account_id: string;
  to_account_id: string;
  amount_paise: number;
  occurred_on: string;
  note: string | null;
  created_at: string;
};

export type TransferWithRefs = Transfer & {
  from_account: { name: string } | null;
  to_account: { name: string } | null;
};

export type AssetType = "stock" | "etf" | "mutual_fund" | "ipo" | "other";
export type TradeType = "buy" | "sell" | "ipo_apply" | "ipo_allotment" | "ipo_refund";

export type Investment = {
  id: string;
  account_id: string | null;
  symbol: string;
  name: string;
  asset_type: AssetType;
  trade_type: TradeType;
  quantity: number;
  price_paise: number;
  amount_paise: number;
  current_price_paise: number | null;
  occurred_on: string;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type InvestmentWithRefs = Investment & {
  account: { name: string } | null;
};

export type ImportBatch = {
  id: string;
  filename: string;
  imported_count: number;
  duplicate_count: number;
  skipped_count: number;
  created_at: string;
};
