"use client";
import { useCallback, useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Calendar,
  Receipt,
  Award,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchMonthlyTrends, type TrendsSummary } from "@/lib/data/trends";
import { errorMessage } from "@/lib/data/expenses";
import { formatINR } from "@/lib/utils/money";
import { displayDate } from "@/lib/utils/dates";
import { colorOf } from "@/components/categories/colors";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";

const MONTHS = [
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

export function TrendsView() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [monthIndex, setMonthIndex] = useState(now.getMonth());
  const [data, setData] = useState<TrendsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const db = createClient();
      const res = await fetchMonthlyTrends(db, year, monthIndex);
      setData(res);
    } catch (e) {
      setError(errorMessage(e, "Could not load spending trends."));
    } finally {
      setLoading(false);
    }
  }, [year, monthIndex]);

  useEffect(() => {
    void load();
  }, [load]);

  function prevMonth() {
    if (monthIndex === 0) {
      setMonthIndex(11);
      setYear((y) => y - 1);
    } else {
      setMonthIndex((m) => m - 1);
    }
  }

  function nextMonth() {
    if (monthIndex === 11) {
      setMonthIndex(0);
      setYear((y) => y + 1);
    } else {
      setMonthIndex((m) => m + 1);
    }
  }

  const hasData = (data?.selectedMonthTotalPaise ?? 0) > 0;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header Bar (Fixed) */}
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Monthly Trends & Analytics
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Daily patterns, month-over-month comparisons, and category distribution.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="secondary"
            className="h-8 px-2 text-xs shadow-xs"
            onClick={prevMonth}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-800 shadow-xs">
            <Calendar className="h-3.5 w-3.5 text-brand-600" />
            <span>
              {MONTHS[monthIndex]} {year}
            </span>
          </div>
          <Button
            variant="secondary"
            className="h-8 px-2 text-xs shadow-xs"
            onClick={nextMonth}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700 shrink-0"
        >
          {error}{" "}
          <button className="underline" onClick={() => void load()}>
            Try again
          </button>
        </div>
      )}

      {/* KPI Cards (Fixed) */}
      <dl className="mb-2.5 grid grid-cols-2 gap-2.5 lg:grid-cols-4 shrink-0">
        {/* Total Spent */}
        <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs">
          <div className="flex items-center justify-between">
            <dt className="text-[11px] font-medium text-slate-500">
              Total Spent in {MONTHS[monthIndex]}
            </dt>
            <Receipt className="h-3.5 w-3.5 text-rose-500" />
          </div>
          <dd className="num mt-0.5 text-lg font-bold text-slate-900 md:text-xl">
            {loading && !data ? (
              <Skeleton className="mt-1 h-6 w-20" />
            ) : (
              formatINR(data?.selectedMonthTotalPaise ?? 0)
            )}
          </dd>
          <p className="text-[10px] text-slate-400 truncate">
            Total monthly expenses
          </p>
        </div>

        {/* Daily Average */}
        <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs">
          <div className="flex items-center justify-between">
            <dt className="text-[11px] font-medium text-slate-500">
              Average Daily Spend
            </dt>
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <dd className="num mt-0.5 text-lg font-bold text-slate-900 md:text-xl">
            {loading && !data ? (
              <Skeleton className="mt-1 h-6 w-20" />
            ) : (
              formatINR(data?.dailyAveragePaise ?? 0)
            )}
          </dd>
          <p className="text-[10px] text-slate-400 truncate">
            Prorated per elapsed day
          </p>
        </div>

        {/* Highest Spend Day */}
        <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs">
          <div className="flex items-center justify-between">
            <dt className="text-[11px] font-medium text-slate-500">
              Highest Spend Day
            </dt>
            <Award className="h-3.5 w-3.5 text-amber-500" />
          </div>
          <dd className="num mt-0.5 text-lg font-bold text-slate-900 md:text-xl">
            {loading && !data ? (
              <Skeleton className="mt-1 h-6 w-20" />
            ) : data?.highestDay ? (
              formatINR(data.highestDay.amount_paise)
            ) : (
              "—"
            )}
          </dd>
          <p className="text-[10px] text-slate-400 truncate">
            {data?.highestDay ? displayDate(data.highestDay.date) : "No peak spend day"}
          </p>
        </div>

        {/* MoM Delta */}
        <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs">
          <div className="flex items-center justify-between">
            <dt className="text-[11px] font-medium text-slate-500">
              Month-over-Month Delta
            </dt>
            {data?.momChangePct !== null && data?.momChangePct !== undefined ? (
              data.momChangePct <= 0 ? (
                <TrendingDown className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <TrendingUp className="h-3.5 w-3.5 text-rose-600" />
              )
            ) : null}
          </div>
          <dd
            className={`num mt-0.5 text-lg font-bold md:text-xl ${
              data?.momChangePct !== null && data?.momChangePct !== undefined
                ? data.momChangePct <= 0
                  ? "text-emerald-700"
                  : "text-rose-700"
                : "text-slate-900"
            }`}
          >
            {loading && !data ? (
              <Skeleton className="mt-1 h-6 w-16" />
            ) : data?.momChangePct !== null && data?.momChangePct !== undefined ? (
              data.momChangePct > 0
                ? `+${data.momChangePct}%`
                : `${data.momChangePct}%`
            ) : (
              "—"
            )}
          </dd>
          <p className="text-[10px] text-slate-400 truncate">
            Compared to previous month
          </p>
        </div>
      </dl>

      {/* Main Charts Area (Scrollable within viewport, cards stay fixed above) */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2.5 pr-0.5">
        {!loading && !hasData ? (
          <EmptyState
            title={`No expenses recorded for ${MONTHS[monthIndex]} ${year}`}
            body="Add expenses for this period or select a different month to see analytical charts and trends."
          />
        ) : (
          <div className="space-y-2.5">
            {/* Daily Trend Area Chart */}
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-xs font-semibold text-slate-800">
                    Daily Spending Trend ({MONTHS[monthIndex]} {year})
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Daily outflows across the days of the month.
                  </p>
                </div>
              </div>
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={data?.dailyTrend ?? []}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#4F46E5" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#E2E8F0"
                    />
                    <XAxis
                      dataKey="dayLabel"
                      stroke="#94A3B8"
                      fontSize={11}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="#94A3B8"
                      fontSize={11}
                      tickLine={false}
                      tickFormatter={(v) => `₹${v}`}
                    />
                    <Tooltip
                      formatter={(val: unknown) => [
                        formatINR(Number(val) * 100),
                        "Spent",
                      ]}
                      labelFormatter={(label) =>
                        `Day ${label} of ${MONTHS[monthIndex]}`
                      }
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid #E2E8F0",
                        fontSize: "12px",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="rupees"
                      stroke="#4F46E5"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorSpend)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid gap-2.5 lg:grid-cols-2">
              {/* MoM Comparison Bar Chart */}
              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
                <div className="mb-2">
                  <h3 className="text-xs font-semibold text-slate-800">
                    Monthly Spending vs Income ({year})
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Month-by-month financial inflows and outflows.
                  </p>
                </div>
                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data?.monthlyComparison ?? []}
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#E2E8F0"
                      />
                      <XAxis
                        dataKey="monthLabel"
                        stroke="#94A3B8"
                        fontSize={11}
                        tickLine={false}
                      />
                      <YAxis
                        stroke="#94A3B8"
                        fontSize={11}
                        tickLine={false}
                        tickFormatter={(v) => `₹${v}`}
                      />
                      <Tooltip
                        formatter={(val: unknown, name: unknown) => [
                          formatINR(Number(val) * 100),
                          String(name) === "expense_rupees" ||
                          String(name) === "Expenses"
                            ? "Expenses"
                            : "Income",
                        ]}
                        contentStyle={{
                          borderRadius: "8px",
                          border: "1px solid #E2E8F0",
                          fontSize: "12px",
                        }}
                      />
                      <Bar
                        dataKey="expense_rupees"
                        name="Expenses"
                        fill="#EF4444"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="income_rupees"
                        name="Income"
                        fill="#10B981"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Category Breakdown */}
              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
                <div className="mb-2">
                  <h3 className="text-xs font-semibold text-slate-800">
                    Category Distribution ({MONTHS[monthIndex]})
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Proportional breakdown of your expenses.
                  </p>
                </div>

                {(data?.categoryBreakdown.length ?? 0) === 0 ? (
                  <div className="flex h-60 items-center justify-center text-xs text-slate-400">
                    No category data for this month.
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4 sm:flex-row h-60">
                    <div className="h-44 w-44 shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={data?.categoryBreakdown ?? []}
                            dataKey="rupees"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={42}
                            outerRadius={68}
                            paddingAngle={2}
                          >
                            {data?.categoryBreakdown.map((c) => (
                              <Cell key={c.name} fill={colorOf(c.color)} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(v: unknown) => [
                              formatINR(Number(v) * 100),
                              "Spent",
                            ]}
                            contentStyle={{
                              borderRadius: "8px",
                              border: "1px solid #E2E8F0",
                              fontSize: "12px",
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    <ul className="w-full flex-1 divide-y divide-slate-100 text-xs overflow-y-auto max-h-52 pr-1">
                      {data?.categoryBreakdown.slice(0, 7).map((c) => (
                        <li
                          key={c.name}
                          className="flex items-center justify-between py-1.5"
                        >
                          <div className="flex items-center gap-2 truncate pr-2">
                            <span
                              className="h-2 w-2 rounded-full shrink-0"
                              style={{ background: colorOf(c.color) }}
                            />
                            <span className="font-medium text-slate-700 truncate">
                              {c.name}
                            </span>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-semibold text-slate-900">
                              {formatINR(c.total_paise)}
                            </span>
                            <span className="ml-1 text-[11px] text-slate-400">
                              ({c.percentage}%)
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
