import { describe, expect, it } from "vitest";
import {
  parseFlexibleDate,
  parseFlexibleAmount,
  normalizeTitle,
  generateFingerprint,
} from "@/lib/data/imports";

describe("statement import parsers", () => {
  it("parses diverse bank date formats to standard ISO", () => {
    expect(parseFlexibleDate("2026-10-11")).toBe("2026-10-11");
    expect(parseFlexibleDate("11/10/2026")).toBe("2026-10-11");
    expect(parseFlexibleDate("11-10-2026")).toBe("2026-10-11");
    expect(parseFlexibleDate("2026/10/11")).toBe("2026-10-11");
    expect(parseFlexibleDate("invalid-date")).toBeNull();
    expect(parseFlexibleDate("")).toBeNull();
  });

  it("parses formatted currency amounts to integer paise", () => {
    expect(parseFlexibleAmount("120.50")).toBe(12050);
    expect(parseFlexibleAmount("₹ 1,234.50")).toBe(123450);
    expect(parseFlexibleAmount("1,234.50 Dr")).toBe(123450);
    expect(parseFlexibleAmount("-500.00")).toBe(50000);
    expect(parseFlexibleAmount("(500.00)")).toBe(50000);
    expect(parseFlexibleAmount("0.00")).toBe(0);
    expect(parseFlexibleAmount("invalid")).toBeNull();
  });

  it("normalizes statement titles cleanly", () => {
    expect(normalizeTitle("UPI/528392/Swiggy Bangalore/OKBI")).toBe("upi 528392 swiggy bangalore okbi");
    expect(normalizeTitle("  NETFLIX.COM  #123   ")).toBe("netflix com 123");
  });

  it("generates deterministic fingerprints without matching date and amount alone", () => {
    const fp1 = generateFingerprint("2026-10-11", 50000, "Swiggy Order");
    const fp2 = generateFingerprint("2026-10-11", 50000, "Zomato Order");
    const fp3 = generateFingerprint("2026-10-11", 50000, "Swiggy Order #999");

    // Fingerprints with different merchants on the same date and amount must NOT match
    expect(fp1).not.toBe(fp2);
    expect(fp1).toContain("2026-10-11_50000_swiggy");
  });
});
