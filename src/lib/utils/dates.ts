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

export type Preset = "today" | "yesterday" | "week" | "month" | "year";
export function presetRange(p: Preset, now: Date = new Date()): { from: string; to: string } {
  switch (p) {
    case "today": return { from: toISODate(now), to: toISODate(now) };
    case "yesterday": { const y = addDays(now, -1); return { from: toISODate(y), to: toISODate(y) }; }
    case "week": return { from: toISODate(startOfWeek(now, { weekStartsOn: 1 })), to: toISODate(now) };
    case "month": return { from: toISODate(startOfMonth(now)), to: toISODate(endOfMonth(now)) };
    case "year": return { from: toISODate(startOfYear(now)), to: toISODate(endOfYear(now)) };
  }
}
