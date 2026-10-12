import type { SupabaseClient } from "@supabase/supabase-js";
import { format, getDaysInMonth, startOfMonth, endOfMonth } from "date-fns";

export type DailyTrendPoint = {
  date: string;
  dayLabel: string;
  amount_paise: number;
  rupees: number;
};

export type MonthlyComparisonPoint = {
  month: string;
  monthLabel: string;
  expense_paise: number;
  expense_rupees: number;
  income_paise: number;
  income_rupees: number;
  savings_rupees: number;
};

export type CategoryBreakdownPoint = {
  name: string;
  color: string;
  total_paise: number;
  rupees: number;
  percentage: number;
};

export type TrendsSummary = {
  selectedMonthTotalPaise: number;
  dailyAveragePaise: number;
  highestDay: { date: string; amount_paise: number } | null;
  momChangePct: number | null; // null if prior month had 0 spending
  dailyTrend: DailyTrendPoint[];
  monthlyComparison: MonthlyComparisonPoint[];
  categoryBreakdown: CategoryBreakdownPoint[];
};

export async function fetchMonthlyTrends(
  db: SupabaseClient,
  year: number,
  monthIndex: number // 0-11
): Promise<TrendsSummary> {
  const monthDate = new Date(year, monthIndex, 1);
  const mStart = format(startOfMonth(monthDate), "yyyy-MM-dd");
  const mEnd = format(endOfMonth(monthDate), "yyyy-MM-dd");
  const totalDays = getDaysInMonth(monthDate);

  // Range for the entire year for MoM comparison
  const yStart = `${year}-01-01`;
  const yEnd = `${year}-12-31`;

  // Fetch year's expenses
  const { data: yearExpenses, error: expErr } = await db
    .from("transactions")
    .select("occurred_on, amount_paise, category_id, category:categories(name, color)")
    .is("deleted_at", null)
    .gte("occurred_on", yStart)
    .lte("occurred_on", yEnd);
  if (expErr) throw expErr;

  // Fetch year's income
  let yearIncome: { occurred_on: string; amount_paise: number }[] = [];
  try {
    const { data: inc, error: incErr } = await db
      .from("income")
      .select("occurred_on, amount_paise")
      .gte("occurred_on", yStart)
      .lte("occurred_on", yEnd);
    if (!incErr && inc) yearIncome = inc as { occurred_on: string; amount_paise: number }[];
  } catch {
    // Continue if income table error
  }

  // 1. Daily trend for the selected month
  const dailyMap = new Map<string, number>();
  for (let d = 1; d <= totalDays; d++) {
    const dayStr = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    dailyMap.set(dayStr, 0);
  }

  const categoryMap = new Map<string, { name: string; color: string; total_paise: number }>();
  let selectedMonthTotalPaise = 0;

  for (const tx of yearExpenses ?? []) {
    if (tx.occurred_on >= mStart && tx.occurred_on <= mEnd) {
      const paise = Number(tx.amount_paise);
      selectedMonthTotalPaise += paise;

      const currentDayTotal = dailyMap.get(tx.occurred_on) || 0;
      dailyMap.set(tx.occurred_on, currentDayTotal + paise);

      // Category aggregation
      const catObj = tx.category as unknown as { name?: string; color?: string } | null;
      const catName = catObj?.name || "Uncategorized";
      const catColor = catObj?.color || "indigo";
      if (!categoryMap.has(catName)) {
        categoryMap.set(catName, { name: catName, color: catColor, total_paise: 0 });
      }
      categoryMap.get(catName)!.total_paise += paise;
    }
  }

  const dailyTrend: DailyTrendPoint[] = [];
  let highestDay: { date: string; amount_paise: number } | null = null;

  for (const [dateStr, paise] of dailyMap.entries()) {
    const dayNum = parseInt(dateStr.slice(8), 10);
    dailyTrend.push({
      date: dateStr,
      dayLabel: String(dayNum),
      amount_paise: paise,
      rupees: paise / 100,
    });

    if (paise > 0 && (!highestDay || paise > highestDay.amount_paise)) {
      highestDay = { date: dateStr, amount_paise: paise };
    }
  }

  // 2. Monthly Comparison (Jan to Dec)
  const monthlyExpenses = new Array(12).fill(0);
  const monthlyIncome = new Array(12).fill(0);

  for (const tx of yearExpenses ?? []) {
    const m = parseInt(tx.occurred_on.slice(5, 7), 10) - 1;
    if (m >= 0 && m < 12) {
      monthlyExpenses[m] += Number(tx.amount_paise);
    }
  }

  for (const inc of yearIncome) {
    const m = parseInt(inc.occurred_on.slice(5, 7), 10) - 1;
    if (m >= 0 && m < 12) {
      monthlyIncome[m] += Number(inc.amount_paise);
    }
  }

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthlyComparison: MonthlyComparisonPoint[] = monthNames.map((name, i) => {
    const expPaise = monthlyExpenses[i] || 0;
    const incPaise = monthlyIncome[i] || 0;
    return {
      month: String(i + 1).padStart(2, "0"),
      monthLabel: name,
      expense_paise: expPaise,
      expense_rupees: expPaise / 100,
      income_paise: incPaise,
      income_rupees: incPaise / 100,
      savings_rupees: (incPaise - expPaise) / 100,
    };
  });

  // 3. Category Breakdown
  const categoryBreakdown: CategoryBreakdownPoint[] = [];
  for (const c of categoryMap.values()) {
    const pct = selectedMonthTotalPaise > 0 ? (c.total_paise / selectedMonthTotalPaise) * 100 : 0;
    categoryBreakdown.push({
      name: c.name,
      color: c.color,
      total_paise: c.total_paise,
      rupees: c.total_paise / 100,
      percentage: Math.round(pct * 10) / 10,
    });
  }
  categoryBreakdown.sort((a, b) => b.total_paise - a.total_paise);

  // 4. MoM change percentage
  let momChangePct: number | null = null;
  const prevMonthIndex = monthIndex > 0 ? monthIndex - 1 : null;
  if (prevMonthIndex !== null) {
    const prevPaise = monthlyExpenses[prevMonthIndex] || 0;
    if (prevPaise > 0) {
      momChangePct = Math.round(((selectedMonthTotalPaise - prevPaise) / prevPaise) * 100);
    }
  }

  // Daily average
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === monthIndex;
  const elapsedDays = isCurrentMonth ? Math.max(1, today.getDate()) : totalDays;
  const dailyAveragePaise = Math.round(selectedMonthTotalPaise / elapsedDays);

  return {
    selectedMonthTotalPaise,
    dailyAveragePaise,
    highestDay,
    momChangePct,
    dailyTrend,
    monthlyComparison,
    categoryBreakdown,
  };
}
