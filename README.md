# ✈️ SKYCOMMAND — Airport Control

A polished, fully playable **2D airport air-traffic-control game** for the browser. Land arriving aircraft, park them at gates, watch the turnaround, push them back, taxi to the runway and launch them — with one or two taps per action.

Built for everyone: a 7-year-old can play **Kids** mode immediately, while **Pro ATC** mode gives adults runway conflicts, wake separation, fuel limits and emergencies.

## Features

- **One beautiful international airport**: two parallel runways (09L/09R) with full markings and approach lights, high-speed exits, one-way taxiways with painted guidance, a terminal with 20 gates and animated jet bridges, ATC tower with a rotating radar, fire station, hangars, cargo area, fuel farm and landside car parks.
- **Original top-down aircraft** inspired by the ATR 72, E190, A320, 737, A321, 787, A350, 777 and A380 (plus three rare special visitors), drawn to correct relative size with distinctive wings, engines, winglets and tails. All airline liveries are fictional.
- **Living airport**: baggage trains, fuel and catering trucks service parked aircraft; pushback tugs; fire trucks escort emergency landings; buses and cars drive around; navigation lights, beacons, strobes and landing lights; day/night cycle, clouds with ground shadows, rain, storms with lightning, and fog.
- **Simple controls**: tap an aircraft, then 🛬 Land · 🅿️ Park · ⏪ Push back · ➡️ Taxi · 🛫 Take off · ✋ Hold · 🔄 Go around. Valid gates and runways are highlighted. You can also **drag a line** from an aircraft along the taxiways to draw your own route, which snaps to valid taxiways. Mouse, touch, pinch and trackpad gestures and keyboard shortcuts all work.
- **Modes**: Kids, Casual, Pro ATC, Sandbox (unlimited money; spawn aircraft and control weather and time), plus a **Daily Challenge** with a server-verified leaderboard.
- **Progression** (100% free, no ads, no purchases): coins, XP levels, stars, missions, 20 achievements, Hangar unlocks (gates, the south runway, special aircraft, weather, four airport locations, decorations), an aircraft encyclopedia, statistics, replays, save and resume, pause and 1×/2×/3× speed, and **undo** for instructions that haven't happened yet.
- **Accessibility**: UI scaling, reduced motion, high contrast, label density, haptics, screen-reader announcements of radio messages, full keyboard control.
- **Sound**: every effect and the calm ambient soundtrack are synthesised live with WebAudio, so there are no audio files.

## Controls

| Action | Mouse / touch | Keyboard |
| --- | --- | --- |
| Select aircraft | tap it (or a flight board row) | `Tab` / `Shift+Tab` |
| Land / Park / Taxi / Take off | action buttons | `L` / `P` / `T` |
| Push back / Hold / Go around | action buttons | `B` / `H` / `G` |
| Draw a taxi route | drag from the selected aircraft | — |
| Pan / zoom | drag · pinch · wheel | arrows / `+` `-` |
| Pause / speed | top bar | `Space` / `1` `2` `3` |
| Undo | Undo button | `U` or `Ctrl+Z` |

## Architecture

```
src/sim/      Pure, deterministic fixed-timestep simulation (20 Hz) — shared by client & server
  airport.ts    runways, one-way taxi graph, gates
  engine.ts     aircraft state machine, flight model, ground movement, runway logic, scoring
  commands.ts   validated player commands (+ undo)
  dmath.ts      engine-independent sin/cos/atan2 so results match in every browser and the Worker
  replay.ts     replays = seed + accepted commands, re-simulated exactly
  invariants.ts safety checks used by tests
src/render/   PixiJS renderer: procedural art cached as textures, lights, weather, vehicles
src/game/     controller (loop, saves, replays, rewards), progression, missions, achievements
src/ui/       React + Tailwind + Motion interface
worker/       Cloudflare Worker: static assets, API, Durable Object verifier, D1 leaderboard
```

**Ground safety model.** Every taxiway is one-way, so aircraft can never meet head-on. Junctions, stand entrances and holding points are exclusive locks acquired ahead of time, with a "don't block the junction" rule. Car-following keeps gaps, runways and gates are exclusive reservations, and pushbacks reserve their whole swept area. Every phase change goes through a validated state machine.

**Anti-cheat.** Local progression is single-player and offline. The online daily-challenge leaderboard never trusts client scores: the client submits only its list of instructions. A Durable Object (one per challenge date) whitelists and sanitises them, re-runs the full deterministic simulation and stores the *verified* score in D1. It also rate-limits submissions and rejects duplicate replays. Player names come from safe word lists, so nobody types free text. The design is defensive, not a claim of being cheat-proof.

## Development

```bash
npm install
npm run dev          # Vite dev server (proxies /api to wrangler dev on :8787)
npx wrangler dev     # local Worker + D1 + Durable Objects
npm run typecheck
npm test             # Vitest: unit, property-based (fast-check), determinism, soak & verification tests
npx vite build && npx playwright test   # end-to-end tests (desktop + mobile)
npm run deploy       # build + wrangler deploy
```

## Tech

TypeScript · React · Vite · PixiJS · Tailwind CSS · Motion · Zustand · Cloudflare Workers (Static Assets, D1, Durable Objects) · Vitest · fast-check · Playwright.
