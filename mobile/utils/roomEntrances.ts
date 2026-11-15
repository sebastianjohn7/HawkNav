/**
 * Where a route to a room ends, [lng, lat], when the room's own Point in the floor plan is not at
 * the door people walk in by (it can sit at a back door or in the room). The route then finishes at
 * the entrance spot and the destination flag is drawn there. Rooms not listed end at their Point.
 *
 * Only routing uses this: the Point itself (search, "near" text, room pins) is unchanged. Pick a
 * spot at the doorway, near a hallway: it joins the nearest hallway point automatically.
 */
import type { LngLat } from "./aStarRouting.ts";

export const ROOM_ENTRANCES: Record<string, Record<string, LngLat>> = {
  "UHCL.MAIN.DELTA.L2": {
    // The front doors, on the hallway beside the d242 photo that opens onto the room. The Point
    // (and the photo taken inside) is at the back door on the other side of the room.
    "241": [-95.103994, 29.577613],
  },
};
