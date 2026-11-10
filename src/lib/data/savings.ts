import type { SupabaseClient } from "@supabase/supabase-js";
import { todayISO } from "@/lib/utils/dates";

export type MonthlySavingsRecord = {
  monthKey: string; // e.g. "2026-11"
  monthLabel: string; // e.g. "November 2026"
  year: number; // 2026
  monthNumber: number; // 11
  isCurrentMonth: boolean;

  // Components
  regularIncomePaise: number;
  expensePaise: number;
  fnoPnlPaise: number;
  ipoPnlPaise: number;

  // Counts for transparency
  expenseCount: number;
  fnoTradeCount: number;
  ipoCount: number;

  // Net calculations
  netSavingsPaise: number; // regularIncome - expense + fnoPnl + ipoPnl
  cumulativeSavingsPaise: number; // Running total of savings up to and including this month

  // Savings rate percentage
  savingsRatePercent: number | null;
};

export type SavingsSummary = {
  allTimeSavingsPaise: number;
  currentYearSavingsPaise: number;
  currentMonthSavingsPaise: number;
  allTimeIncomePaise: number;
  allTimeExpensePaise: number;
  allTimeFnoPnlPaise: number;
  allTimeIpoPnlPaise: number;
  records: MonthlySavingsRecord[];
  availableYears: number[];
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function getMonthLabel(monthKey: string): string {
  const [yStr, mStr] = monthKey.split("-");
  const year = parseInt(yStr || "0", 10);
  const mIndex = parseInt(mStr || "0", 10) - 1;
  const name = MONTH_NAMES[mIndex] || monthKey;
  return `${name} ${year}`;
}

export async function fetchSavingsSummary(
  db: SupabaseClient,
  filterYear?: number
): Promise<SavingsSummary> {
  const currentMonthKey = todayISO().slice(0, 7);
  const currentYear = new Date().getFullYear();

  // 1. Fetch Expenses (transactions)
  const expQuery = db
    .from("transactions")
    .select("occurred_on, amount_paise")
    .is("deleted_at", null)
    .order("occurred_on", { ascending: true });

  const { data: expenses, error: expErr } = await expQuery;
  if (expErr && !/deleted_at/i.test(expErr.message)) {
    throw expErr;
  }
  let expRows = expenses;
  if (expErr && /deleted_at/i.test(expErr.message)) {
    const fb = await db
      .from("transactions")
      .select("occurred_on, amount_paise")
      .order("occurred_on", { ascending: true });
    expRows = fb.data;
  }

  // 2. Fetch Income (excluding mirrored F&O and IPO entries to prevent double-counting)
  let incRows: { id: string; occurred_on: string; amount_paise: number; source?: string; title?: string }[] = [];
  try {
    const incRes = await db
      .from("income")
      .select("id, occurred_on, amount_paise, source, title")
      .is("deleted_at", null);

    if (incRes.error && /deleted_at/i.test(incRes.error.message)) {
      const fb = await db.from("income").select("id, occurred_on, amount_paise, source, title");
      incRows = (fb.data || []) as typeof incRows;
    } else if (incRes.data) {
      incRows = incRes.data as typeof incRows;
    }
  } catch {
    // continue
  }

  // 3. Fetch F&O Trades
  let fnoRows: { occurred_on: string; net_pnl_paise: number }[] = [];
  try {
    const fnoRes = await db
      .from("fno_trades")
      .select("occurred_on, net_pnl_paise")
      .is("deleted_at", null);

    if (fnoRes.error && /deleted_at/i.test(fnoRes.error.message)) {
      const fb = await db.from("fno_trades").select("occurred_on, net_pnl_paise");
      fnoRows = (fb.data || []) as typeof fnoRows;
    } else if (fnoRes.data) {
      fnoRows = fnoRes.data as typeof fnoRows;
    }
  } catch {
    // If fno_trades table is missing, fallback to income entries where source === 'fno_trading'
    for (const inc of incRows) {
      if (inc.source === "fno_trading" || /F&O/i.test(inc.title || "")) {
        fnoRows.push({ occurred_on: inc.occurred_on, net_pnl_paise: Number(inc.amount_paise) });
      }
    }
  }

  // 4. Fetch IPO Gains
  let ipoRows: { occurred_on: string; net_pnl_paise: number }[] = [];
  try {
    const ipoRes = await db
      .from("ipo_gains")
      .select("occurred_on, net_pnl_paise")
      .is("deleted_at", null);

    if (ipoRes.error && /deleted_at/i.test(ipoRes.error.message)) {
      const fb = await db.from("ipo_gains").select("occurred_on, net_pnl_paise");
      ipoRows = (fb.data || []) as typeof ipoRows;
    } else if (ipoRes.data) {
      ipoRows = ipoRes.data as typeof ipoRows;
    }
  } catch {
    // If ipo_gains table is missing, fallback to income entries where source === 'ipo_gain'
    for (const inc of incRows) {
      if (inc.source === "ipo_gain" || /IPO/i.test(inc.title || "")) {
        ipoRows.push({ occurred_on: inc.occurred_on, net_pnl_paise: Number(inc.amount_paise) });
      }
    }
  }

  // Intermediate monthly bucket accumulator
  type MonthAccumulator = {
    regularIncomePaise: number;
    expensePaise: number;
    fnoPnlPaise: number;
    ipoPnlPaise: number;
    expenseCount: number;
    fnoTradeCount: number;
    ipoCount: number;
  };

  const monthMap = new Map<string, MonthAccumulator>();

  function getOrCreateMonth(key: string): MonthAccumulator {
    let existing = monthMap.get(key);
    if (!existing) {
      existing = {
        regularIncomePaise: 0,
        expensePaise: 0,
        fnoPnlPaise: 0,
        ipoPnlPaise: 0,
        expenseCount: 0,
        fnoTradeCount: 0,
        ipoCount: 0,
      };
      monthMap.set(key, existing);
    }
    return existing;
  }

  // Always include the current month
  getOrCreateMonth(currentMonthKey);

  // A. Process Expenses
  for (const exp of expRows || []) {
    if (!exp.occurred_on) continue;
    const mKey = exp.occurred_on.slice(0, 7);
    const bucket = getOrCreateMonth(mKey);
    bucket.expensePaise += Number(exp.amount_paise || 0);
    bucket.expenseCount += 1;
  }

  // B. Process Regular Income (filtering out mirrored F&O / IPO entries)
  for (const inc of incRows) {
    if (!inc.occurred_on) continue;
    const isMirroredFno = inc.source === "fno_trading" || /F&O/i.test(inc.title || "");
    const isMirroredIpo = inc.source === "ipo_gain" || /IPO/i.test(inc.title || "");
    if (isMirroredFno || isMirroredIpo) {
      continue; // Handled directly via fnoRows and ipoRows to avoid duplication
    }
    const mKey = inc.occurred_on.slice(0, 7);
    const bucket = getOrCreateMonth(mKey);
    bucket.regularIncomePaise += Number(inc.amount_paise || 0);
  }

  // C. Process F&O Trades
  for (const t of fnoRows) {
    if (!t.occurred_on) continue;
    const mKey = t.occurred_on.slice(0, 7);
    const bucket = getOrCreateMonth(mKey);
    bucket.fnoPnlPaise += Number(t.net_pnl_paise || 0);
    bucket.fnoTradeCount += 1;
  }

  // D. Process IPO Listing Gains
  for (const ipo of ipoRows) {
    if (!ipo.occurred_on) continue;
    const mKey = ipo.occurred_on.slice(0, 7);
    const bucket = getOrCreateMonth(mKey);
    bucket.ipoPnlPaise += Number(t_net(ipo.net_pnl_paise));
    bucket.ipoCount += 1;
  }

  function t_net(val: unknown) {
    return Number(val || 0);
  }

  // Sort all month keys chronologically ascending (earliest to latest) to compute running cumulative savings
  const sortedMonthKeys = Array.from(monthMap.keys()).sort();

  let runningCumulativePaise = 0;
  const allChronologicalRecords: MonthlySavingsRecord[] = [];
  const yearsSet = new Set<number>();

  for (const mKey of sortedMonthKeys) {
    const bucket = monthMap.get(mKey)!;
    const [yStr, mStr] = mKey.split("-");
    const year = parseInt(yStr || "0", 10);
    const monthNumber = parseInt(mStr || "0", 10);
    yearsSet.add(year);

    // Net Savings formula: Regular Income - Expenses + F&O P&L + IPO P&L
    const netSavingsPaise =
      bucket.regularIncomePaise -
      bucket.expensePaise +
      bucket.fnoPnlPaise +
      bucket.ipoPnlPaise;

    runningCumulativePaise += netSavingsPaise;

    // Savings rate % = net savings / total positive inflow
    const positiveInflow =
      bucket.regularIncomePaise +
      Math.max(0, bucket.fnoPnlPaise) +
      Math.max(0, bucket.ipoPnlPaise);

    let savingsRatePercent: number | null = null;
    if (positiveInflow > 0) {
      savingsRatePercent = Math.round((netSavingsPaise / positiveInflow) * 100);
    }

    allChronologicalRecords.push({
      monthKey: mKey,
      monthLabel: getMonthLabel(mKey),
      year,
      monthNumber,
      isCurrentMonth: mKey === currentMonthKey,
      regularIncomePaise: bucket.regularIncomePaise,
      expensePaise: bucket.expensePaise,
      fnoPnlPaise: bucket.fnoPnlPaise,
      ipoPnlPaise: bucket.ipoPnlPaise,
      expenseCount: bucket.expenseCount,
      fnoTradeCount: bucket.fnoTradeCount,
      ipoCount: bucket.ipoCount,
      netSavingsPaise,
      cumulativeSavingsPaise: runningCumulativePaise,
      savingsRatePercent,
    });
  }

  // Calculate high-level summary KPIs
  const allTimeSavingsPaise = runningCumulativePaise;

  const currentMonthRecord = allChronologicalRecords.find(
    (r) => r.monthKey === currentMonthKey
  );
  const currentMonthSavingsPaise = currentMonthRecord ? currentMonthRecord.netSavingsPaise : 0;

  const currentYearRecords = allChronologicalRecords.filter((r) => r.year === currentYear);
  const currentYearSavingsPaise = currentYearRecords.reduce(
    (acc, r) => acc + r.netSavingsPaise,
    0
  );

  let allTimeIncomePaise = 0;
  let allTimeExpensePaise = 0;
  let allTimeFnoPnlPaise = 0;
  let allTimeIpoPnlPaise = 0;

  for (const r of allChronologicalRecords) {
    allTimeIncomePaise += r.regularIncomePaise;
    allTimeExpensePaise += r.expensePaise;
    allTimeFnoPnlPaise += r.fnoPnlPaise;
    allTimeIpoPnlPaise += r.ipoPnlPaise;
  }

  // Filter records by selected year if requested
  let displayedRecords = allChronologicalRecords;
  if (filterYear) {
    displayedRecords = allChronologicalRecords.filter((r) => r.year === filterYear);
  }

  // Sort descending (latest month on top) for presentation
  displayedRecords.sort((a, b) => b.monthKey.localeCompare(a.monthKey));

  const availableYears = Array.from(yearsSet).sort((a, b) => b - a);
  if (!availableYears.includes(currentYear)) {
    availableYears.unshift(currentYear);
  }

  return {
    allTimeSavingsPaise,
    currentYearSavingsPaise,
    currentMonthSavingsPaise,
    allTimeIncomePaise,
    allTimeExpensePaise,
    allTimeFnoPnlPaise,
    allTimeIpoPnlPaise,
    records: displayedRecords,
    availableYears,
  };
}
