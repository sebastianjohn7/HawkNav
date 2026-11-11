# HawkNav mobile (Expo)

Expo app: Landing → Sign-in (Supabase email + password, MFA, or Visitor) → bottom NavModule with three tabs, shown by role (see [`lib/roles.ts`](lib/roles.ts)):

- **Shuttle**: Rider and Driver views with a live campus map
- **Map**: Delta Indoors floor plans (Level 1 and 2), room info, routing between rooms, and 360° photos from a room's Location card
- **Alerts**: campus alerts feed, with compose and approval for staff and admins

Settings holds the signed-in role, sign out, and **Admin tools** (admins only).

The full UHCL GeoJSON (~118MB) stays local/gitignored; the Map tab loads the extracted [`assets/maps/delta_floorplan_copy.json`](assets/maps/delta_floorplan_copy.json). Re-extract with:

```bash
python3 scripts/extract_delta_floorplan.py
```

360° photos and their positions live in [`assets/panoramas/`](assets/panoramas/). The scripts in [`scripts/`](scripts/) (`process_panoramas.ps1`, `fill_panorama_positions.mjs`, `suggest_panorama_links.mjs`, `check_panorama_links.mjs`) prepare and validate them.

Boot: [`../README.md`](../README.md).

```bash
cp env .env   # EXPO_PUBLIC_SUPABASE_* and EXPO_PUBLIC_API_URL
npm install
npx expo start
```
