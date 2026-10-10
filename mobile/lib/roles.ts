// Who can see what. Change access here; nothing else needs to know the rules.
// The database (RLS) is the real gate for data; this only decides which screens show.

// Matches the app_role enum in supabase/profiles.sql.
export type Role = "visitor" | "student" | "faculty" | "driver" | "admin";

export type Tab = "shuttle" | "find" | "alerts";

type Access = {
  tabs: Tab[];
  /** Can open the Driver GPS screen inside the Shuttle tab. */
  canDrive: boolean;
};

const STUDENT: Access = { tabs: ["shuttle", "find", "alerts"], canDrive: false };

export const ACCESS: Record<Role, Access> = {
  // Visitors (guests, or accounts with a non-UHCL email): Delta map only.
  visitor: { tabs: ["find"], canDrive: false },
  student: STUDENT,
  // Faculty match students for now.
  faculty: STUDENT,
  driver: { tabs: ["shuttle", "find", "alerts"], canDrive: true },
  // Admin sees everything.
  admin: { tabs: ["shuttle", "find", "alerts"], canDrive: true },
};

/** Set to true to require a UHCL email to create an account (also change the
 *  trigger in supabase/profiles.sql to match). */
export const UHCL_ONLY_SIGNUP = false;
export const UHCL_DOMAIN = "@uhcl.edu";
