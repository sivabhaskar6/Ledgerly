import { describe, expect, it, vi } from "vitest";
import {
  checkUserApproval,
  approveUserProfile,
  rejectUserProfile,
  reRequestAccess,
  getReRequestCooldown,
  formatUserName,
  PRIMARY_ADMIN_EMAIL,
  isExplicitAdminEmail,
} from "@/lib/data/users";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("User approval workflow & cooldown tracking", () => {
  it("formats user names cleanly and never returns Anonymous User", () => {
    expect(formatUserName("Varalashmi", "varalashmi0002@gmail.com")).toBe("Varalashmi");
    expect(formatUserName("Ramesh Kumar", "ramesh@example.com")).toBe("Ramesh Kumar");
    expect(formatUserName("Anonymous User", "siva.bhaskar@gmail.com")).toBe("Siva Bhaskar");
    expect(formatUserName(null, "varalashmi0002@gmail.com")).toBe("Varalashmi0002");
    expect(formatUserName("", "friend.account@test.org")).toBe("Friend Account");
  });

  it("identifies the super admin email", () => {
    expect(isExplicitAdminEmail(PRIMARY_ADMIN_EMAIL)).toBe(true);
    expect(isExplicitAdminEmail("gonthinasivabhaskar6@gmail.com")).toBe(true);
    expect(isExplicitAdminEmail(" GONTHINASIVABHASKAR6@GMAIL.COM ")).toBe(true);
    expect(isExplicitAdminEmail("friend@example.com")).toBe(false);
  });

  it("always approves the super admin", async () => {
    const mockDb = {} as unknown as SupabaseClient;
    const res = await checkUserApproval(mockDb, "admin-id", PRIMARY_ADMIN_EMAIL);
    expect(res.isApproved).toBe(true);
    expect(res.isAdmin).toBe(true);
    expect(res.status).toBe("approved");
  });

  it("calculates 2-hour cooldown for first 3 rejections", () => {
    // 30 minutes ago, 1st rejection
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const cd1 = getReRequestCooldown(thirtyMinsAgo, 1);
    expect(cd1.isLocked).toBe(true);
    expect(cd1.cooldownHours).toBe(2);
    expect(cd1.remainingMs).toBeGreaterThan(0);

    // 2.5 hours ago, 1st rejection -> unlocked!
    const twoAndHalfHoursAgo = new Date(Date.now() - 2.5 * 3600 * 1000).toISOString();
    const cd2 = getReRequestCooldown(twoAndHalfHoursAgo, 1);
    expect(cd2.isLocked).toBe(false);
  });

  it("calculates 24-hour cooldown after 3 rejections (rejection_count > 3)", () => {
    // 5 hours ago, 4th rejection -> still locked under 24h cooldown
    const fiveHoursAgo = new Date(Date.now() - 5 * 3600 * 1000).toISOString();
    const cd1 = getReRequestCooldown(fiveHoursAgo, 4);
    expect(cd1.isLocked).toBe(true);
    expect(cd1.cooldownHours).toBe(24);

    // 25 hours ago, 4th rejection -> unlocked!
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
    const cd2 = getReRequestCooldown(twentyFiveHoursAgo, 4);
    expect(cd2.isLocked).toBe(false);
  });

  it("approves user with status approved and approved_at timestamp", async () => {
    const updateSpy = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const mockDb = {
      from: vi.fn().mockReturnValue({
        update: updateSpy,
      }),
    } as unknown as SupabaseClient;

    await approveUserProfile(mockDb, "user-to-approve");
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        is_approved: true,
        status: "approved",
      })
    );
  });

  it("rejects user by marking is_approved false, rejected_at, and increments rejection_count", async () => {
    const updateSpy = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const mockDb = {
      from: vi.fn().mockReturnValue({
        update: updateSpy,
      }),
    } as unknown as SupabaseClient;

    await rejectUserProfile(mockDb, "user-to-reject", 2);
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        is_approved: false,
        status: "rejected",
        rejection_count: 3,
      })
    );
  });

  it("allows re-requesting access", async () => {
    const rpcSpy = vi.fn().mockResolvedValue({ error: null });
    const mockDb = {
      rpc: rpcSpy,
    } as unknown as SupabaseClient;

    await reRequestAccess(mockDb);
    expect(rpcSpy).toHaveBeenCalledWith("re_request_access");
  });
});
