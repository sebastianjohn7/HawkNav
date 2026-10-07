# HawkNav mobile (Expo)

Expo port of Josh’s app shell (Landing → Sign-in → bottom NavModule), with Seb’s Shuttle Rider/Driver + live campus map inside the **Shuttle** tab and Delta Indoors floor plan under **Find** (custom paths later).

The full UHCL GeoJSON (~118MB) stays local/gitignored; Find loads the extracted [`assets/maps/delta_floorplan.json`](assets/maps/delta_floorplan.json). Re-extract with:

```bash
python3 scripts/extract_delta_floorplan.py
```

Boot: [`../RUN.md`](../RUN.md).

```bash
cp .env.example .env   # EXPO_PUBLIC_SUPABASE_* and EXPO_PUBLIC_API_URL
npm install
npx expo start
```

Flutter work from earlier: [`../archive/mobile-flutter/`](../archive/mobile-flutter/). Josh’s Flutter source of the shell: `josh` branch.
