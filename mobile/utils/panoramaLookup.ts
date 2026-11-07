import { PANORAMA_NODES, type PanoramaNode } from "../screens/PanoramaScreen";

/**
 * 360° photos for one floor plan unit (the feature the map's info card shows).
 * Photos are not separate map points: a photo belongs to every unit in its floorPlanRef, so a
 * hallway photo and an inside-the-room photo of the same room both show on that room's card.
 *
 * levelId looks like "UHCL.MAIN.DELTA.L2"; unitName is the unit's NAME property ("201", "T2007").
 * A lettered unit (119A) also matches a photo registered for 119.
 */
export function panoramasForUnit(levelId: string | undefined, unitName: string | undefined): PanoramaNode[] {
  const m = /^UHCL\.MAIN\.([A-Z]+)\.L(\d+)$/.exec(levelId ?? "");
  if (!m || !unitName) return [];
  const building = m[1];
  const floor = Number(m[2]);
  const base = unitName.replace(/[A-Z]$/, "");
  return PANORAMA_NODES.filter(
    (n) =>
      n.building.toUpperCase() === building &&
      n.floor === floor &&
      n.floorPlanRef.some((ref) => ref === unitName || ref === base),
  ).sort((a, b) => Number(isInsideRoom(a)) - Number(isInsideRoom(b)));
}

/** Photos taken inside a room are the ones whose id contains "-room-". */
export function isInsideRoom(n: PanoramaNode): boolean {
  return n.id.includes("-room-");
}

export function viewLabel(n: PanoramaNode): string {
  return isInsideRoom(n) ? "Inside the room" : "Outside / hallway";
}
