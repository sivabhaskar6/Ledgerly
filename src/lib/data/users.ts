import type { SupabaseClient } from "@supabase/supabase-js";

export const PRIMARY_ADMIN_EMAIL = "gonthinasivabhaskar6@gmail.com";

export function isExplicitAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  const envAdmin = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  return normalized === PRIMARY_ADMIN_EMAIL || (envAdmin !== "" && normalized === envAdmin);
}

/**
 * Formats a clean, readable name for a user.
 * Never outputs "Anonymous User". If display_name is missing, derives a proper name from email.
 */
export function formatUserName(displayName?: string | null, email?: string | null): string {
  if (
    displayName &&
    displayName.trim().length > 0 &&
    !/^anonymous user$/i.test(displayName.trim())
  ) {
    return displayName.trim();
  }
  if (email && email.includes("@")) {
    const handle = email.split("@")[0] || "";
    const cleaned = handle.replace(/[._-]+/g, " ").trim();
    if (cleaned.length > 0) {
      return cleaned
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    }
  }
  return "Member";
}

export type UserProfile = {
  id: string;
  display_name: string | null;
  email: string | null;
  is_approved: boolean;
  is_admin: boolean;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  requested_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  rejection_count: number;
};

export type ApprovalStatusResult = {
  isApproved: boolean;
  isAdmin: boolean;
  status: "pending" | "approved" | "rejected";
  requested_at?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  rejection_count?: number;
};

/**
 * Calculates cooldown status for rejected users:
 * - 2 hours for the first 3 rejections
 * - 24 hours after 3 rejections
 */
export function getReRequestCooldown(
  rejectedAt?: string | null,
  rejectionCount: number = 0
): {
  isLocked: boolean;
  cooldownHours: number;
  remainingMs: number;
  formattedRemaining: string;
  allowedAt: Date | null;
} {
  if (!rejectedAt) {
    return { isLocked: false, cooldownHours: 0, remainingMs: 0, formattedRemaining: "", allowedAt: null };
  }

  // 2 hours for first 3 rejections, 24 hours after that
  const cooldownHours = rejectionCount <= 3 ? 2 : 24;
  const cooldownMs = cooldownHours * 60 * 60 * 1000;
  const rejectedTime = new Date(rejectedAt).getTime();
  const allowedTime = rejectedTime + cooldownMs;
  const remainingMs = allowedTime - Date.now();

  if (remainingMs <= 0) {
    return {
      isLocked: false,
      cooldownHours,
      remainingMs: 0,
      formattedRemaining: "",
      allowedAt: new Date(allowedTime),
    };
  }

  const hours = Math.floor(remainingMs / (1000 * 60 * 60));
  const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);

  const formattedRemaining =
    hours > 0 ? `${hours}h ${minutes}m` : minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

  return {
    isLocked: true,
    cooldownHours,
    remainingMs,
    formattedRemaining,
    allowedAt: new Date(allowedTime),
  };
}

/**
 * Checks whether the given user is approved by the admin.
 * Fails safely/gracefully if columns don't exist yet (pre-migration).
 * Automatically approves the super admin (gonthinasivabhaskar6@gmail.com).
 */
export async function checkUserApproval(
  db: SupabaseClient,
  userId: string,
  userEmail?: string | null
): Promise<ApprovalStatusResult> {
  if (isExplicitAdminEmail(userEmail)) {
    return { isApproved: true, isAdmin: true, status: "approved" };
  }

  try {
    const { data, error } = await db
      .from("profiles")
      .select("is_approved, is_admin, status, email, requested_at, approved_at, rejected_at, rejection_count, created_at")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      if (/column|does not exist/i.test(error.message)) {
        return { isApproved: true, isAdmin: false, status: "approved" };
      }
      return { isApproved: true, isAdmin: false, status: "approved" };
    }

    if (!data) {
      return { isApproved: true, isAdmin: false, status: "approved" };
    }

    if (isExplicitAdminEmail(data.email)) {
      return { isApproved: true, isAdmin: true, status: "approved" };
    }

    const isApproved = data.is_approved !== undefined ? Boolean(data.is_approved) : true;
    const isAdmin = Boolean(data.is_admin);
    const status = (data.status as "pending" | "approved" | "rejected") || (isApproved ? "approved" : "pending");

    return {
      isApproved,
      isAdmin,
      status,
      requested_at: data.requested_at || data.created_at || null,
      approved_at: data.approved_at || null,
      rejected_at: data.rejected_at || null,
      rejection_count: typeof data.rejection_count === "number" ? data.rejection_count : 0,
    };
  } catch {
    return { isApproved: true, isAdmin: false, status: "approved" };
  }
}

/**
 * Fetches all registered users for admin review.
 */
export async function fetchAdminUsers(db: SupabaseClient): Promise<{
  isCurrentUserAdmin: boolean;
  currentUserId: string | null;
  users: UserProfile[];
}> {
  const { data: authData } = await db.auth.getUser();
  const currentUserId = authData.user?.id ?? null;
  const userEmail = authData.user?.email ?? null;

  if (!currentUserId) {
    return { isCurrentUserAdmin: false, currentUserId: null, users: [] };
  }

  const isEmailAdmin = isExplicitAdminEmail(userEmail);

  // Check if current user is admin
  const { data: myProfile, error: myError } = await db
    .from("profiles")
    .select("is_admin, email")
    .eq("id", currentUserId)
    .maybeSingle();

  const isCurrentUserAdmin = Boolean(myProfile?.is_admin) || isEmailAdmin || isExplicitAdminEmail(myProfile?.email);

  if (!isCurrentUserAdmin && !myError) {
    return { isCurrentUserAdmin: false, currentUserId, users: [] };
  }

  // Fetch all profiles
  const { data: allProfiles, error: fetchError } = await db
    .from("profiles")
    .select("id, display_name, email, is_approved, is_admin, status, created_at, requested_at, approved_at, rejected_at, rejection_count")
    .order("created_at", { ascending: false });

  if (fetchError || !allProfiles) {
    return { isCurrentUserAdmin: true, currentUserId, users: [] };
  }

  const users: UserProfile[] = allProfiles.map((p) => {
    const isAdmin = Boolean(p.is_admin) || isExplicitAdminEmail(p.email);
    const isApproved = isAdmin || (p.is_approved !== undefined ? Boolean(p.is_approved) : false);
    return {
      id: p.id,
      display_name: formatUserName(p.display_name, p.email),
      email: p.email,
      is_approved: isApproved,
      is_admin: isAdmin,
      status: isAdmin ? "approved" : (p.status as "pending" | "approved" | "rejected") || (isApproved ? "approved" : "pending"),
      created_at: p.created_at,
      requested_at: p.requested_at || p.created_at || null,
      approved_at: p.approved_at || null,
      rejected_at: p.rejected_at || null,
      rejection_count: typeof p.rejection_count === "number" ? p.rejection_count : 0,
    };
  });

  return {
    isCurrentUserAdmin: true,
    currentUserId,
    users,
  };
}

/**
 * Approves a user profile so they can log in.
 * Stores approved_at timestamp so approval is permanent across refreshes.
 */
export async function approveUserProfile(db: SupabaseClient, userId: string): Promise<void> {
  const { error } = await db
    .from("profiles")
    .update({
      is_approved: true,
      status: "approved",
      approved_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) throw error;
}

/**
 * Rejects or revokes access for a user profile.
 * Records rejected_at and increments rejection_count for cooldown calculations.
 */
export async function rejectUserProfile(
  db: SupabaseClient,
  userId: string,
  currentRejectionCount: number = 0
): Promise<void> {
  const { error } = await db
    .from("profiles")
    .update({
      is_approved: false,
      status: "rejected",
      rejected_at: new Date().toISOString(),
      rejection_count: currentRejectionCount + 1,
    })
    .eq("id", userId);

  if (error) throw error;
}

/**
 * Re-requests access after cooldown has elapsed.
 */
export async function reRequestAccess(db: SupabaseClient): Promise<void> {
  const { error } = await db.rpc("re_request_access");
  if (error) {
    const { data: authData } = await db.auth.getUser();
    if (!authData.user) throw error;

    const { error: updErr } = await db
      .from("profiles")
      .update({
        status: "pending",
        is_approved: false,
        requested_at: new Date().toISOString(),
      })
      .eq("id", authData.user.id);

    if (updErr) throw updErr;
  }
}
