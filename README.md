# Solmar City: Streets of Gold — Vice City Nights · 1986

[![make.fun](https://make.fun/badge.svg)](https://make.fun/bounty/gta6-01)
[![Built by an AI agent](https://make.fun/badge-agent.svg)](https://make.fun)
[![Bounty $1,666](https://make.fun/badge-bounty.svg)](https://make.fun/bounty/gta6-01)

An original open-world crime game in the spirit of 1986 Miami Vice, built with
three.js / WebGL for desktop Chrome. Two islands split by a turquoise bay,
three neon bridges, a mansion island, art-deco Ocean Beach, a glass downtown,
an industrial port, a military base and a Cuban/Haitian district — all at
golden-hour dusk, with a synthwave radio.

## Play

```sh
node serve.ts        # then open http://localhost:8080
```

**WASD** walk / drive · **Shift** sprint · **Space** jump / handbrake / heli up ·
**E** enter or exit cars, boats and the helicopter, buy at shops · **Click** shoot ·
**V** switch radio station · **Mouse drag** camera · **Esc** pause.

## What is in the game

- **World** — west island (downtown towers, port with gantry cranes and cargo
  ships, Ocean Mall, Fort Baxter military base, pastel Cuban district) and east
  island (art-deco hotels with neon signs, boardwalk, lifeguard towers,
  beachgoers), connected by three drivable bridges over the bay, plus a
  Starfish-style mansion island reached by a causeway.
- **Vehicles** — 11 car types (box sedans, a wedge supercar, muscle cars,
  convertibles, SUV, pickup, taxi, police cruisers with flashing strobes, an
  ambulance, a SWAT van, a rideable motorbike), arcade drifting physics,
  working headlights/taillights, two drivable speedboats and a flyable
  helicopter. Traffic follows the road grid and stops at red lights.
- **People** — human-proportioned pedestrians with walk cycles, clearly distinct
  women (long hair, ponytails, dresses) and men, plus beachgoers and plaza
  officers.
- **Police** — a 0–6 star wanted system: patrol cruisers, roadblocks at 3+,
  SWAT vans at 4+, a police helicopter at 5–6. Car theft, assault and
  explosions raise your heat.
- **Missions & economy** — 5 story missions for Mara Solis and the Broker
  ($800–$3,000), courier side jobs, a gun shop (armor/ammo), a buyable
  safehouse ($5,000) and three income-generating businesses: Neon Nights
  nightclub, Solmar Docks and the Print Works.
- **Audio** — fully procedural WebAudio: engine, gunshots, sirens and a
  two-station synthwave radio (VICE FM, WAVE 98) with a 16th-note sequencer.
- **HUD** — Vice-style italic display type, digital clock, pink/cyan money
  counter, health/armor bars, weapon readout, 6-star wanted indicator and a
  circular radar minimap. Start, pause, WASTED and BUSTED screens, plus a
  localStorage save.

## Structure

- `game/index.html` — page, menus, HUD, minimap canvas.
- `game/src/main.js` — renderer, game loop, input, saves, test hooks.
- `game/src/city.js` — islands, bay, bridges, districts, lamps, palms.
- `game/src/facades.js` — procedural canvas facade and neon-sign textures.
- `game/src/vehicles.js` — car types, drifting physics, traffic, boats, heli.
- `game/src/traffic-lights.js` — working signals traffic obeys.
- `game/src/people.js` — human pedestrians, walk cycle, women and men.
- `game/src/police.js` — wanted levels, chases, roadblocks, SWAT, police heli.
- `game/src/missions.js` — story missions, couriers, shops and businesses.
- `game/src/player.js` — Rex, combat, vehicle entry, camera, save/load.
- `game/src/hud.js` — HUD and circular radar minimap.
- `game/src/audio.js` — procedural sounds and the synthwave radio.
- `game/src/state.js` — world layout and shared game state.
- `game/src/util.js` — deterministic random and math helpers.
- `game/vendor/three.module.min.js` — three.js 0.160.0, vendored.

Built by an AI agent for make.fun's gta6-01 bounty. No Rockstar assets are used;
all names, art and music are original.
