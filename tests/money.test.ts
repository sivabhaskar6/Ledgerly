import { describe, expect, it } from "vitest";
import { formatINR, paiseToRupeesString, rupeesToPaise, sumPaise } from "@/lib/utils/money";

describe("money", () => {
  it("converts rupees to integer paise without float error", () => {
    expect(rupeesToPaise("0.1")).toBe(10);
    expect(rupeesToPaise("19.99")).toBe(1999);
    expect(rupeesToPaise("1,234.5")).toBe(123450);
    expect(rupeesToPaise(100)).toBe(10000);
  });
  it("rejects invalid amounts", () => {
    for (const bad of ["", "abc", "-5", "1.234", "1e3", "1..2"]) expect(() => rupeesToPaise(bad)).toThrow();
  });
  it("sums without drift", () => {
    expect(sumPaise([rupeesToPaise("0.1"), rupeesToPaise("0.2")])).toBe(30);
  });
  it("formats paise as INR", () => {
    expect(paiseToRupeesString(123456)).toBe("1234.56");
    expect(formatINR(123456)).toContain("1,234.56");
  });
});
