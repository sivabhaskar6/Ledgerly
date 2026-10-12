/** Money is handled as integer paise everywhere; floats are never used for arithmetic. */
export function rupeesToPaise(input: string | number): number {
  const s = String(input).trim().replace(/[,₹\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error("Enter a valid amount with at most 2 decimal places");
  const [whole = "0", frac = ""] = s.split(".");
  const paise = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(paise)) throw new Error("Amount is too large");
  return paise;
}

export function paiseToRupeesString(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });
export function formatINR(paise: number): string {
  return inr.format(Number(paiseToRupeesString(paise)));
}

export function sumPaise(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
