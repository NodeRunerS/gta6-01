# Solmar City: Streets of Gold

[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/NodeRunerS/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/NodeRunerS/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

Entry for make.fun's **"Make GTA 6"** (`gta6-01`, free entry, $1,666 shared by the top 100).

**Solmar City: Streets of Gold** is an original open-world crime game in the spirit of GTA 6 — a sun-soaked coastal city to explore on foot and by car, with traffic and pedestrians, car theft, a wanted system with police chases and arrests, story missions, combat, a HUD with a live minimap, and a save. Everything is original: the city, characters, vehicles, names, story, art, sound and music. No Rockstar Games names, characters, maps or assets.

## The game

- **City:** an 8×8-block coastal city with ~120 buildings, golden-hour light, traffic and pedestrians.
- **Driving:** 6 car types to steal and drive; horn and headlights included.
- **Wanted:** 0–5 stars — police chase, ram and arrest you as the heat rises.
- **Missions:** 5 story jobs for Mara Solis, Eddie and the Broker, plus side courier jobs.
- **Combat:** fists and pistol, with reload, health and ammo on the HUD.
- **HUD:** live circular minimap, objective tracker, wanted stars, health bar, clock.
- **Screens:** start, pause, WASTED and BUSTED; progress saves to localStorage.
- **Sound:** WebAudio engine, siren, horn and gunshot sounds (M to mute).

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move (on foot) / drive (in a car) |
| Mouse drag | Orbit the camera |
| Mouse click | Shoot (pistol) / punch (fists) |
| Shift | Run |
| Space | Jump (on foot) / handbrake (driving) |
| E | Steal a car / exit a car |
| F | Punch |
| 1 / 2 | Pistol / fists |
| R | Reload |
| H | Horn |
| L | Headlights |
| P / Esc | Pause |
| M | Mute |

## How to run

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome.

## Files

| Path | What it is |
| --- | --- |
| `main.ts` | Entry program: copies `game/` and `screenshots/` to the output dir and writes `dossier.json` |
| `serve.ts` | Tiny static server for local play (`node serve.ts`, port 8080) |
| `game/index.html` | The game page: canvas, HUD, start/pause/WASTED/BUSTED screens |
| `game/src/main.js` | Entry point: renderer, game loop, input, save/load |
| `game/src/city.js` | The 8×8 city: roads, buildings, plaza, park, beach, mountains |
| `game/src/vehicles.js` | Car meshes, arcade driving, traffic, parked cars |
| `game/src/people.js` | Pedestrians and armed enemies |
| `game/src/police.js` | Wanted system, police chases, rams and arrests |
| `game/src/player.js` | On-foot and driving controls, combat |
| `game/src/missions.js` | 5 story missions, courier side jobs, WASTED/BUSTED |
| `game/src/hud.js` | HUD, live minimap, toasts, dialogue |
| `game/src/audio.js` | WebAudio sound effects |
| `game/src/state.js` | Shared game state |
| `game/src/util.js` | Math, RNG and collision helpers |
| `game/vendor/three.module.min.js` | three.js 0.160.0, vendored |
| `screenshots/` | 4 gameplay screenshots (1280×720) |
