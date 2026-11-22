import { addDays, endOfMonth, endOfYear, format, parse, startOfMonth, startOfWeek, startOfYear, isValid } from "date-fns";

export const ISO = "yyyy-MM-dd";
export const toISODate = (d: Date) => format(d, ISO);
export const todayISO = () => toISODate(new Date());

export function parseISODate(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = parse(s, ISO, new Date());
  return isValid(d) && toISODate(d) === s ? d : null;
}

export function displayDate(s: string): string {
  const d = parseISODate(s);
  return d ? format(d, "dd MMM yyyy") : s;
}

export type Preset = "today" | "yesterday" | "week" | "month" | "year" | "fy";

/**
 * Computes Indian Financial Year (FY) starting on April 1 and ending on March 31.
 * e.g., for Nov 2026 or Jan 2027, returns { from: '2026-04-01', to: '2027-03-31', label: 'FY 2026–27' }
 */
export function indianFinancialYearRange(now: Date = new Date()): {
  from: string;
  to: string;
  label: string;
  shortLabel: string;
} {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed: 0 = Jan, 3 = Apr, 11 = Dec

  // If before April (Jan-Mar), we are in the second half of the previous calendar year's FY
  const startYear = currentMonth >= 3 ? currentYear : currentYear - 1;
  const endYear = startYear + 1;

  const from = `${startYear}-04-01`;
  const to = `${endYear}-03-31`;
  const shortEndYear = String(endYear).slice(-2);
  const label = `FY ${startYear}–${shortEndYear}`;
  const shortLabel = `FY ${shortEndYear}`;

  return { from, to, label, shortLabel };
}

export function presetRange(p: Preset, now: Date = new Date()): { from: string; to: string } {
  switch (p) {
    case "today": return { from: toISODate(now), to: toISODate(now) };
    case "yesterday": { const y = addDays(now, -1); return { from: toISODate(y), to: toISODate(y) }; }
    case "week": return { from: toISODate(startOfWeek(now, { weekStartsOn: 1 })), to: toISODate(now) };
    case "month": return { from: toISODate(startOfMonth(now)), to: toISODate(endOfMonth(now)) };
    case "year": return { from: toISODate(startOfYear(now)), to: toISODate(endOfYear(now)) };
    case "fy": {
      const { from, to } = indianFinancialYearRange(now);
      return { from, to };
    }
  }
}
