/**
 * Floor plan units the app ignores completely: they are never a route stop or destination, never
 * part of a route, not in the room search and not named as the user's location. Their shapes are
 * still drawn on the map. To hide another unit, add its floor plan NAME here.
 */
export const EXCLUDED_UNITS: ReadonlySet<string> = new Set([
  "STAIR_4", // not a stairwell students use
]);
