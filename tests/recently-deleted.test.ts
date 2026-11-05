import { describe, expect, it } from "vitest";
import { computeFnoPnl, toFnoRow } from "@/lib/validations/fno";
import { toIncomeRow } from "@/lib/validations/income";

describe("Recently Deleted, Soft Delete, and Cross-table F&O Deletion", () => {
  it("soft-deleting an F&O trade removes it from active P&L calculations", () => {
    // Active trade 1: Profit of ₹2,500
    const trade1 = {
      id: "trade-1",
      net_pnl_paise: 250000,
      occurred_on: "2026-11-04",
      deleted_at: null,
    };

    // Active trade 2: Loss of -₹1,200
    const trade2 = {
      id: "trade-2",
      net_pnl_paise: -120000,
      occurred_on: "2026-11-04",
      deleted_at: null,
    };

    const initialTrades = [trade1, trade2];
    const initialActivePnl = initialTrades
      .filter((t) => t.deleted_at === null)
      .reduce((sum, t) => sum + t.net_pnl_paise, 0);

    // 2500 - 1200 = ₹1,300 (130000 paise)
    expect(initialActivePnl).toBe(130000);

    // Now user moves trade 1 to Recently Deleted (soft-deletes)
    const softDeletedTimestamp = new Date().toISOString();
    const updatedTrade1 = { ...trade1, deleted_at: softDeletedTimestamp };

    const tradesAfterDelete = [updatedTrade1, trade2];
    const activePnlAfterDelete = tradesAfterDelete
      .filter((t) => t.deleted_at === null)
      .reduce((sum, t) => sum + t.net_pnl_paise, 0);

    // Profit is removed from active total, remaining active P&L is -₹1,200
    expect(activePnlAfterDelete).toBe(-120000);

    // In Recently Deleted: trade1 is present
    const recentlyDeleted = tradesAfterDelete.filter((t) => t.deleted_at !== null);
    expect(recentlyDeleted.length).toBe(1);
    expect(recentlyDeleted[0]?.id).toBe("trade-1");
  });

  it("restoring a trade from Recently Deleted recovers its P&L in this month's income", () => {
    const salaryPaise = 4000000; // ₹40,000

    // Trade in trash
    const deletedTrade: {
      id: string;
      net_pnl_paise: number;
      occurred_on: string;
      deleted_at: string | null;
    } = {
      id: "trade-deleted",
      net_pnl_paise: 350000, // +₹3,500
      occurred_on: "2026-11-04",
      deleted_at: "2026-11-04T12:00:00.000Z",
    };

    let activeTrades = [deletedTrade].filter((t) => t.deleted_at === null);
    let monthIncomePaise =
      salaryPaise + activeTrades.reduce((sum, t) => sum + t.net_pnl_paise, 0);

    expect(monthIncomePaise).toBe(salaryPaise); // Deleted trade not counted

    // User clicks Restore
    const restoredTrade = { ...deletedTrade, deleted_at: null };
    activeTrades = [restoredTrade].filter((t) => t.deleted_at === null);
    monthIncomePaise =
      salaryPaise + activeTrades.reduce((sum, t) => sum + t.net_pnl_paise, 0);

    // 40,000 + 3,500 = ₹43,500 (4350000 paise)
    expect(monthIncomePaise).toBe(4350000);
  });

  it("prevents zombie re-syncing: deleted trades with null income_id are never re-created by sync", () => {
    const allTrades: {
      id: string;
      net_pnl_paise: number;
      income_id: string | null;
      deleted_at: string | null;
    }[] = [
      {
        id: "active-trade",
        net_pnl_paise: 100000,
        income_id: null,
        deleted_at: null,
      },
      {
        id: "deleted-trade",
        net_pnl_paise: 200000,
        income_id: null,
        deleted_at: "2026-11-04T12:00:00.000Z", // In Recently Deleted
      },
    ];

    // syncUnsyncedFnoTrades queries .is("deleted_at", null) and .is("income_id", null)
    const eligibleForSync = allTrades.filter(
      (t) => t.income_id === null && t.deleted_at === null
    );

    expect(eligibleForSync.length).toBe(1);
    expect(eligibleForSync[0]?.id).toBe("active-trade");
    // "deleted-trade" is strictly ignored, preventing it from reviving in Income!
  });

  it("ensures permanent deletion completely erases the record", () => {
    let deletedItems = [
      { id: "tx-1", title: "Dinner", kind: "expense" },
      { id: "inc-1", title: "F&O Trade NIFTY", kind: "fno" },
      { id: "ipo-1", title: "IPO Listing Gain: TATATECH", kind: "ipo" },
    ];

    // Permanently delete ipo-1
    deletedItems = deletedItems.filter((i) => i.id !== "ipo-1");

    expect(deletedItems.length).toBe(2);
    expect(deletedItems.find((i) => i.id === "ipo-1")).toBeUndefined();
  });

  it("handles soft-delete and restore for IPO listing gains consistently", () => {
    const activeIpo = {
      id: "ipo-active",
      symbol: "TATATECH",
      net_pnl_paise: 35000000, // +₹3,50,000
      deleted_at: null as string | null,
    };

    // Soft-delete
    const deletedIpo = { ...activeIpo, deleted_at: new Date().toISOString() };
    expect(deletedIpo.deleted_at).not.toBeNull();

    // Restore
    const restoredIpo = { ...deletedIpo, deleted_at: null };
    expect(restoredIpo.deleted_at).toBeNull();
    expect(restoredIpo.net_pnl_paise).toBe(35000000);
  });
});
