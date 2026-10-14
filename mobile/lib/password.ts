// Password rules for creating an account. Supabase enforces them too: set the same rules in
// Authentication -> Sign In / Providers -> Email (see supabase/SETUP.md), or the server can
// reject a password this list accepts.

const SYMBOLS = /[!@#$%^&*()_+\-=[\]{};':"\\|<>?,./`~]/;

export const PASSWORD_RULES: Array<{
  id: string;
  label: string;
  test: (password: string) => boolean;
}> = [
  { id: "length", label: "At least 8 characters", test: (p) => p.length >= 8 },
  { id: "lower", label: "A lowercase letter (a-z)", test: (p) => /[a-z]/.test(p) },
  { id: "upper", label: "An uppercase letter (A-Z)", test: (p) => /[A-Z]/.test(p) },
  { id: "number", label: "A number (0-9)", test: (p) => /[0-9]/.test(p) },
  { id: "symbol", label: "A symbol (! @ # $ % & * ...)", test: (p) => SYMBOLS.test(p) },
];

/** The rules a password does not meet yet. Empty means it is acceptable. */
export function unmetRules(password: string) {
  return PASSWORD_RULES.filter((r) => !r.test(password));
}
