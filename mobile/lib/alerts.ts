/** Shared alert types, urgency labels, and comment shape. */

export type AlertAudience = "staff" | "all";
export type AlertStatus = "pending" | "approved" | "rejected";
/** Stored on the row — not derived from schedule time. */
export type AlertUrgency = "normal" | "high" | "critical";

export type CampusAlert = {
  id: number;
  title: string;
  body: string;
  audience: AlertAudience;
  status: AlertStatus;
  urgency: AlertUrgency;
  effective_at: string;
  expires_at: string;
  active: boolean;
  created_at: string;
};

export type AlertComment = {
  id: number;
  alert_id: number;
  body: string;
  created_by: string;
  created_at: string;
};

export const URGENCY_LEVELS: AlertUrgency[] = ["normal", "high", "critical"];

export function urgencyLabel(urgency: AlertUrgency): string {
  switch (urgency) {
    case "normal":
      return "Normal";
    case "high":
      return "High";
    case "critical":
      return "Critical";
  }
}

/** Higher = more urgent (for sorting). */
export function urgencyRank(urgency: AlertUrgency): number {
  switch (urgency) {
    case "normal":
      return 0;
    case "high":
      return 1;
    case "critical":
      return 2;
  }
}

/**
 * Critical stays on top until urgency drops or the alert expires.
 * Within the same urgency, newest posts first.
 */
export function sortAlerts(rows: CampusAlert[]): CampusAlert[] {
  return [...rows].sort((a, b) => {
    const byUrgency = urgencyRank(b.urgency) - urgencyRank(a.urgency);
    if (byUrgency !== 0) return byUrgency;
    return (
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  });
}
