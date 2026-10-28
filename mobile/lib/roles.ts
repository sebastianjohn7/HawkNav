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
};

const ALL_TABS: Tab[] = ["shuttle", "find", "alerts"];

const STUDENT: Access = { tabs: ALL_TABS, canDrive: false, canUseAdminTools: false };

export const ACCESS: Record<Role, Access> = {
  // Visitors are guests (no account): Delta map only.
  visitor: { tabs: ["find"], canDrive: false, canUseAdminTools: false },
  student: STUDENT,
  // Faculty match students for now.
  faculty: STUDENT,
  driver: { tabs: ALL_TABS, canDrive: true, canUseAdminTools: false },
  // Admin sees everything.
  admin: { tabs: ALL_TABS, canDrive: true, canUseAdminTools: true },
};

/** Only @uhcl.edu emails can create an account (the signup trigger in
 *  supabase/schema.sql enforces it too). Visitors use Continue as Visitor. */
export const UHCL_ONLY_SIGNUP = true;
export const UHCL_DOMAIN = "@uhcl.edu";
