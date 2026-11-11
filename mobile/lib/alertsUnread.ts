import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import type { AlertAudience } from "./alerts";
import { supabase } from "./config";
import type { Role } from "./roles";

const SEEN_AT_KEY = "hawknav_alerts_seen_at";

/** Audiences this role may see in the live feed (admins see all — no filter). */
export function feedAudiencesForRole(role: Role | null | undefined): AlertAudience[] | null {
  if (!role || role === "admin" || role === "visitor") return null;
  // Students only see campus-wide; faculty/driver see campus-wide + staff.
  if (role === "student") return ["all"];
  return ["all", "staff"];
}

export function alertVisibleToRole(
  audience: AlertAudience,
  role: Role | null | undefined,
): boolean {
  if (!role || role === "visitor") return false;
  if (role === "admin") return true;
  if (audience === "all") return true;
  if (audience === "staff") {
    return role === "faculty" || role === "driver";
  }
  return false;
}

export async function getAlertsSeenAt(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(SEEN_AT_KEY);
  } catch {
    return null;
  }
}

/** Mark the feed as read up to now (or a provided ISO time). */
export async function markAlertsSeen(at: string = new Date().toISOString()) {
  try {
    await AsyncStorage.setItem(SEEN_AT_KEY, at);
  } catch {
    // ignore
  }
}

/**
 * Unread badge for the Alerts tab. First launch seeds "seen" so old rows don't badge;
 * new approved alerts after that show until the user opens Alerts.
 */
export function useAlertsUnreadBadge(
  role: Role | null,
  viewingAlerts: boolean,
): boolean {
  const [hasUnread, setHasUnread] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase || !role || role === "visitor") {
      setHasUnread(false);
      return;
    }

    let seenAt = await getAlertsSeenAt();
    if (!seenAt) {
      // Don't badge historical alerts the first time the app runs.
      await markAlertsSeen();
      setHasUnread(false);
      return;
    }

    let query = supabase
      .from("alerts")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved")
      .eq("active", true)
      .gt("expires_at", new Date().toISOString())
      .gt("created_at", seenAt);

    const audiences = feedAudiencesForRole(role);
    if (audiences) {
      query = query.in("audience", audiences);
    }

    const { count, error } = await query;
    if (error) {
      setHasUnread(false);
      return;
    }
    setHasUnread((count ?? 0) > 0);
  }, [role]);

  useEffect(() => {
    if (viewingAlerts) {
      void markAlertsSeen().then(() => setHasUnread(false));
      return;
    }
    void refresh();
  }, [viewingAlerts, refresh]);

  useEffect(() => {
    if (!supabase || !role || role === "visitor" || viewingAlerts) return;
    const client = supabase;
    const channel = client
      .channel("alerts_unread_badge")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alerts" },
        () => {
          void refresh();
        },
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [role, viewingAlerts, refresh]);

  return hasUnread;
}
