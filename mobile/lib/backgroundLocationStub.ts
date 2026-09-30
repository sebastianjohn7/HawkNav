import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

/** Stub only — Phase 1B uses foreground watchPositionAsync. */
export const BACKGROUND_LOCATION_TASK = "hawknav-shuttle-background-location";

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.warn("background location task error", error.message);
    return;
  }
  // Future: upsert from background updates when TaskManager hardening lands.
  void data;
  void Location;
});
