export const CATEGORY_COLORS: Record<string, string> = {
  indigo: "#4F46E5", violet: "#7C3AED", sky: "#0284C7", teal: "#0D9488", green: "#16A34A",
  amber: "#D97706", orange: "#EA580C", red: "#DC2626", rose: "#E11D48", pink: "#DB2777", slate: "#64748B",
};
export const colorOf = (name: string) => CATEGORY_COLORS[name] ?? CATEGORY_COLORS.slate;
