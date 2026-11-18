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
- **Missions:** 5 story jobs for Rex, plus side courier jobs.
- **Combat:** fists and pistol, with reload, health and ammo on the HUD.
- **HUD:** live circular minimap, objective tracker, wanted stars, health bar, clock.
- **Screens:** start, pause, WASTED and BUSTED; progress saves to localStorage.
- **Sound:** WebAudio engine, siren, horn and gunshot sounds (M to mute).

## Controls

| Keys | Action |
| --- | --- |
| W A S D | Move / drive |
| Mouse drag / wheel | Camera / zoom |
| Shift | Sprint |
| E | Steal / exit car |
| Click | Shoot (pistol) |
| Space | Jump / handbrake |
| F | Punch (fists) |
| 1 / 2 | Fists / pistol |
| R | Reload |
| H / L | Horn / headlights |
| P / Esc | Pause |
| M | Mute |

## Play it

The game is static files under `game/` — no build step, no network requests. Serve it and open `game/index.html` in desktop Chrome:

```sh
node serve.ts
# open http://localhost:8080
```

Three.js is vendored under `game/vendor/`; every script, image, sound and font the game loads is a file under `game/` or a `data:` URI.

## The program

`main.ts` (Node 22) hands the game in: it copies `game/` and `screenshots/` to the output directory and writes `output/dossier.json` with the kit's `buildDossier`:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Files

| File | What it is |
| --- | --- |
| `main.ts` | Entry program: copies `game/` and `screenshots/`, writes `dossier.json` |
| `serve.ts` | Local static server for playtesting (`node serve.ts`, port 8080) |
| `game/index.html` | The game page (HUD, overlays, import map) |
| `game/src/` | Game source, one job per file: `city`, `vehicles`, `people`, `police`, `missions`, `player`, `hud`, `audio`, `util`, `main` |
| `game/vendor/three.module.min.js` | Vendored three.js |
| `screenshots/` | 4 real renders of the game (1280×720 each) |
| `vendor/makefun-game.ts` | The kit's dossier library, unchanged |
| `LICENSE` | MIT |
| `README.md` | This file |
