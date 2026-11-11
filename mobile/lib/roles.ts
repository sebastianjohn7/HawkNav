// Who can see what. Change access here; nothing else needs to know the rules.
// The database (RLS) is the real gate for data; this only decides which screens show.

// Matches the app_role enum in supabase/schema.sql.
export type Role = "visitor" | "student" | "faculty" | "driver" | "admin";

export type Tab = "shuttle" | "find" | "alerts";

type Access = {
  tabs: Tab[];
  /** Can open the Driver GPS screen inside the Shuttle tab. */
  canDrive: boolean;
  /** Can open Admin tools in Settings (user management now, more tools later). */
  canUseAdminTools: boolean;
  /** Can compose an alert (staff → pending; admin → live). Matches alerts RLS. */
  canComposeAlerts: boolean;
  /** Can approve/reject pending alerts and soft-pull live ones. Admin only. */
  canApproveAlerts: boolean;
};

const ALL_TABS: Tab[] = ["shuttle", "find", "alerts"];

const STUDENT: Access = {
  tabs: ALL_TABS,
  canDrive: false,
  canUseAdminTools: false,
  canComposeAlerts: false,
  canApproveAlerts: false,
};

export const ACCESS: Record<Role, Access> = {
  // Visitors are guests (no account): Delta map only.
  visitor: {
    tabs: ["find"],
    canDrive: false,
    canUseAdminTools: false,
    canComposeAlerts: false,
    canApproveAlerts: false,
  },
  student: STUDENT,
  // Faculty: same tabs as students, but can submit alerts for admin approval.
  faculty: {
    tabs: ALL_TABS,
    canDrive: false,
    canUseAdminTools: false,
    canComposeAlerts: true,
    canApproveAlerts: false,
  },
  driver: {
    tabs: ALL_TABS,
    canDrive: true,
    canUseAdminTools: false,
    canComposeAlerts: true,
    canApproveAlerts: false,
  },
  // Admin sees everything; posts alerts live and reviews pending.
  admin: {
    tabs: ALL_TABS,
    canDrive: true,
    canUseAdminTools: true,
    canComposeAlerts: true,
    canApproveAlerts: true,
  },
};

/** Null-safe; use instead of hardcoding faculty/driver/admin in UI. */
export function canComposeAlerts(role: Role | null | undefined): boolean {
  return role ? ACCESS[role].canComposeAlerts : false;
}

export function canApproveAlerts(role: Role | null | undefined): boolean {
  return role ? ACCESS[role].canApproveAlerts : false;
}

/** Only @uhcl.edu emails can create an account (the signup trigger in
 *  supabase/schema.sql enforces it too). Visitors use Continue as Visitor. */
export const UHCL_ONLY_SIGNUP = true;
export const UHCL_DOMAIN = "@uhcl.edu";
