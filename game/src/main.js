// Solmar City: Streets of Gold — entry point. Wires the renderer, the game
// loop, input, menus, saves and the __game test hooks together.
import * as THREE from 'three';
import { S } from './state.js';
import { AudioSys } from './audio.js';
import { buildCity } from './city.js';
import { buildTrafficLights } from './traffic-lights.js';
import { buildPedestrians } from './people.js';
import { buildTraffic, updateTraffic, spawnBoats, spawnHeli, spawnParkedCars } from './vehicles.js';
import { updatePolice, updateExplosions } from './police.js';
import { showStartMarker, updateMissions, nearestInteraction } from './missions.js';
import {
  createPlayer, updatePlayer, updateCamera, tryEnterExit, tryInteract, shoot,
  saveGame, loadSave, applySave, respawn, wastePlayer, bustPlayer,
} from './player.js';
import { initHud, updateHud, toast, flashDamage } from './hud.js';
import { hitEnemies } from './missions.js';

S.hudToast = toast;
S.hudFlash = flashDamage;
S.saveGame = saveGame;
S.wastePlayer = wastePlayer;
S.bustPlayer = bustPlayer;

const params = new URLSearchParams(location.search);
S.lowfx = params.has('lowfx');

const renderer = new THREE.WebGLRenderer({ antialias: !S.lowfx, powerPreference: 'high-performance' });
// lowfx renders at half resolution: on software rasterizers the fill rate is
// the bottleneck, and this roughly quadruples the frame rate for tests.
renderer.setPixelRatio(S.lowfx ? 0.5 : Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
S.scene = scene;
S.renderer = renderer;
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 2000);
S.camera = camera;
camera.position.set(200, 80, 200);

S.audio = new AudioSys();

buildCity(scene);
buildTrafficLights(scene);
buildPedestrians(scene);
buildTraffic(scene, 10);
spawnBoats(scene);
spawnHeli(scene);
spawnParkedCars(scene);
createPlayer(scene);
initHud();

const saved = loadSave();
S.saveExists = !!saved;
if (saved) document.getElementById('btn-continue').classList.remove('hidden');

function startGame(fresh) {
  if (fresh || !saved) {
    S.money = 200;
    S.missionIndex = 0;
    S.ownedBusinesses = [];
    S.safehouseOwned = false;
  } else {
    applySave(saved);
  }
  S.player.health = 100;
  S.player.wanted = 0;
  S.mode = 'playing';
  document.getElementById('screen-start').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  document.getElementById('screen-pause').classList.add('hidden');
  showStartMarker();
  S.audio.init();
  if (S.player.vehicle) S.audio.radioStart();
}

// --- Input ---
addEventListener('keydown', (e) => {
  S.keys[e.code] = true;
  S.audio.init();
  if (e.code === 'KeyE' && S.mode === 'playing') {
    if (S.player.vehicle) tryEnterExit();
    else {
      const it = nearestInteraction();
      if (it) tryInteract();
      else tryEnterExit();
    }
  }
  if (e.code === 'KeyV' && S.mode === 'playing' && S.player.vehicle) {
    const st = S.audio.radioSwitch();
    toast(`♪ ${st.name} — ${st.track}`);
  }
  if (e.code === 'KeyR' && S.mode === 'playing' && !S.player.vehicle) {
    S.audio.radioSwitch();
  }
  if (e.code === 'Escape') {
    if (S.mode === 'playing') {
      S.mode = 'paused';
      document.getElementById('screen-pause').classList.remove('hidden');
    } else if (S.mode === 'paused') {
      S.mode = 'playing';
      document.getElementById('screen-pause').classList.add('hidden');
    }
  }
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => { S.keys[e.code] = false; });
addEventListener('mousedown', (e) => {
  S.audio.init();
  if (e.target === renderer.domElement && S.mode === 'playing') shoot();
});
let dragging = false;
let lastX = 0;
let lastY = 0;
renderer.domElement.addEventListener('mousedown', (e) => {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
});
addEventListener('mousemove', (e) => {
  if (!dragging) return;
  S.camYaw -= (e.clientX - lastX) * 0.005;
  S.camPitch = Math.max(0.08, Math.min(0.9, S.camPitch + (e.clientY - lastY) * 0.003));
  lastX = e.clientX;
  lastY = e.clientY;
});
addEventListener('mouseup', () => { dragging = false; });
renderer.domElement.addEventListener('wheel', (e) => {
  S.camDist = Math.max(5, Math.min(16, S.camDist + e.deltaY * 0.01));
}, { passive: true });

document.getElementById('btn-new').addEventListener('click', () => startGame(true));
document.getElementById('btn-continue').addEventListener('click', () => startGame(false));
document.getElementById('btn-resume').addEventListener('click', () => {
  S.mode = 'playing';
  document.getElementById('screen-pause').classList.add('hidden');
});
document.getElementById('btn-quit').addEventListener('click', () => {
  saveGame();
  S.mode = 'menu';
  document.getElementById('screen-pause').classList.add('hidden');
  document.getElementById('screen-start').classList.remove('hidden');
  document.getElementById('hud').classList.add('hidden');
});
document.getElementById('btn-respawn').addEventListener('click', respawn);
document.getElementById('btn-respawn2').addEventListener('click', respawn);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// --- Game loop (fixed 60 Hz steps, game-time driven) ---
let last = performance.now();
let acc = 0;
let frames = 0;
let fpsT = 0;

function step(dt) {
  S.time += dt;
  S.clockMin += dt * 0.5; // 1 game minute per 2 real seconds
  if (S._waterMat) {
    S._waterMat.map.offset.x += dt * 0.008;
    S._waterMat.map.offset.y += dt * 0.005;
  }
  if (S.trafficLights) S.trafficLights.update(S.time);
  if (S.mode === 'playing') {
    updatePlayer(dt);
    updateTraffic(dt);
    for (const w of S.pedestrians) if (!w.dead) w.update(dt);
    updatePolice(dt);
    updateExplosions(dt);
    updateMissions(dt);
    updateHud();
  } else if (S.mode === 'menu') {
    updateTraffic(dt);
    for (const w of S.pedestrians) if (!w.dead) w.update(dt);
  }
  updateCamera(dt);
}

function loop(now) {
  requestAnimationFrame(loop);
  const rawDt = (now - last) / 1000;
  const dt = Math.min(0.1, rawDt);
  last = now;
  acc += dt;
  let n = 0;
  while (acc >= 1 / 60 && n < 5) {
    step(1 / 60);
    acc -= 1 / 60;
    n++;
  }
  renderer.render(scene, camera);
  frames++;
  fpsT += rawDt;
  if (fpsT >= 1) {
    S.fps = Math.round(frames / fpsT);
    frames = 0;
    fpsT = 0;
  }
  S.drawCalls = renderer.info.render.calls;
}

requestAnimationFrame(loop);
window.__gameReady = true;

// --- Test hooks (also handy while playing) ---
window.__game = {
  S,
  state() {
    const p = S.player;
    return {
      mode: S.mode,
      time: S.time,
      clock: S.clockMin,
      money: S.money,
      wanted: p.wanted,
      health: p.health,
      armor: p.armor,
      ammo: p.ammo,
      mission: S.mission ? S.mission.def.name : null,
      missionIndex: S.missionIndex,
      missionStep: S.mission ? S.mission.step : null,
      objective: S.objectiveText || '',
      player: { x: p.pos.x, z: p.pos.z, y: p.y || 0, heading: p.heading, onFoot: p.onFoot },
      vehicle: p.vehicle
        ? { kind: p.vehicle.kind, type: p.vehicle.type, speed: p.vehicle.speed, y: p.vehicle.y || 0, health: p.vehicle.health }
        : null,
      traffic: S.traffic.length,
      pedestrians: S.pedestrians.filter((w) => !w.dead).length,
      pedWomen: S.pedestrians.filter((w) => !w.dead && w.sex === 'female').length,
      pedMen: S.pedestrians.filter((w) => !w.dead && w.sex === 'male').length,
      police: S.police.length,
      roadblocks: S.roadblocks.length,
      policeHeli: !!S.policeHeli,
      lampCount: S.lampCount,
      buildingCount: S.buildingCount,
      businesses: S.ownedBusinesses,
      safehouse: S.safehouseOwned,
      radio: S.radio.on ? S.audio.stationInfo().name : 'off',
      drawCalls: S.drawCalls,
      fps: S.fps,
    };
  },
  nearestInteraction,
  _hitEnemies: hitEnemies,
  debug: {
    teleport(x, z) {
      const p = S.player;
      p.pos.x = x;
      p.pos.z = z;
      if (p.vehicle) {
        p.vehicle.pos.x = x;
        p.vehicle.pos.z = z;
      }
      p.group.position.set(x, p.y || 0, z);
    },
    setWanted(n) { S.player.wanted = n; },
    giveMoney(n) { S.money += n; },
    setHealth(n) { S.player.health = n; },
    startMission(i) { S.missionIndex = i; showStartMarker(); },
    enterNearest() { tryEnterExit(); },
  },
};
