import { describe, expect, it } from "vitest";
import { borrowFormSchema } from "@/lib/validations/borrowing";
import { rupeesToPaise } from "@/lib/utils/money";

describe("borrowing validations", () => {
  it("validates valid lent record", () => {
    const res = borrowFormSchema.safeParse({
      person_name: "Ramesh Sharma",
      type: "lent",
      amount: "5000",
      occurred_on: "2026-11-15",
      due_date: "2026-12-15",
      status: "pending",
      settled_on: "",
      account_id: "",
      note: "Emergency help",
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.person_name).toBe("Ramesh Sharma");
      expect(res.data.type).toBe("lent");
      expect(rupeesToPaise(res.data.amount)).toBe(500000);
      expect(res.data.status).toBe("pending");
    }
  });

  it("validates valid borrowed record settled with settlement date", () => {
    const res = borrowFormSchema.safeParse({
      person_name: "Priya",
      type: "borrowed",
      amount: "12500.50",
      occurred_on: "2026-11-10",
      due_date: "",
      status: "settled",
      settled_on: "2026-11-14",
      account_id: "123e4567-e89b-12d3-a456-426614174000",
      note: "Weekend trip share",
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.type).toBe("borrowed");
      expect(res.data.status).toBe("settled");
      expect(res.data.settled_on).toBe("2026-11-14");
      expect(rupeesToPaise(res.data.amount)).toBe(1250050);
    }
  });

  it("rejects empty person name or zero amount", () => {
    const emptyName = borrowFormSchema.safeParse({
      person_name: "   ",
      type: "lent",
      amount: "1000",
      occurred_on: "2026-11-15",
      status: "pending",
    });
    expect(emptyName.success).toBe(false);

    const zeroAmount = borrowFormSchema.safeParse({
      person_name: "Amit",
      type: "lent",
      amount: "0",
      occurred_on: "2026-11-15",
      status: "pending",
    });
    expect(zeroAmount.success).toBe(false);

    const negAmount = borrowFormSchema.safeParse({
      person_name: "Amit",
      type: "lent",
      amount: "-500",
      occurred_on: "2026-11-15",
      status: "pending",
    });
    expect(negAmount.success).toBe(false);
  });

  it("rejects invalid date formats", () => {
    const invalidDate = borrowFormSchema.safeParse({
      person_name: "Karan",
      type: "borrowed",
      amount: "100",
      occurred_on: "15-11-2026",
      status: "pending",
    });
    expect(invalidDate.success).toBe(false);
  });
});
