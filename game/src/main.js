// Solmar City: Streets of Gold — entry point. Wires the renderer, the city, the
// player, traffic, police, missions and HUD together, runs the game loop, and
// exposes a small window.__game handle for automated tests.
import * as THREE from '../vendor/three.module.min.js';
import { S } from './state.js';
import { buildCity } from './city.js';
import { Traffic, spawnParkedCars } from './vehicles.js';
import { Pedestrians } from './people.js';
import { Police } from './police.js';
import { Player } from './player.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';
import { SoundBank } from './audio.js';
import { clamp } from './util.js';

const SAVE_KEY = 'solmar-save-v1';
const SAVE_VERSION = 1;

let city = null;
let lastT = 0;
let camDist = 9;

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.version !== SAVE_VERSION) return null;
    return data;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        version: SAVE_VERSION,
        money: S.money,
        missionIndex: S.completedMissions.length,
        completedMissions: S.completedMissions,
        muted: S.muted,
      }),
    );
  } catch {
    /* storage unavailable */
  }
}

function init() {
  // ?lowfx=1 turns off antialiasing and shadows (for slow machines / tests).
  const lowfx = new URLSearchParams(location.search).has('lowfx');
  const renderer = new THREE.WebGLRenderer({ antialias: !lowfx });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  // Warmer, more saturated filmic grade (GTA look).
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = !lowfx;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('game-canvas').appendChild(renderer.domElement);
  S.renderer = renderer;

  const scene = new THREE.Scene();
  S.scene = scene;
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1500);
  S.camera = camera;

  S.sounds = new SoundBank();
  S.hud = new HUD();
  city = buildCity();
  S.colliders = city.colliders;
  S.traffic = new Traffic(14);
  spawnParkedCars();
  new Pedestrians(22);
  S.police = new Police();
  new Player(-28, -60);
  S.missions = new Missions();

  // HUD button wiring.
  S.hud.onNewGame = () => newGame();
  S.hud.onContinue = () => continueGame();
  S.hud.onResume = () => togglePause(false);
  S.hud.onRespawn = () => S.missions.respawn();

  // Input.
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    S.keys[e.code] = true;
    S.sounds.ensure();
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (S.mode === 'playing') togglePause();
      else if (S.mode === 'paused') togglePause(false);
    }
    if (e.code === 'KeyM') {
      S.muted = !S.muted;
      S.sounds.setMuted(S.muted);
      S.hud.showToast(S.muted ? 'Sound muted' : 'Sound on');
    }
    if (e.code === 'KeyE' && S.mode === 'playing' && S.player) {
      if (S.player.driving) S.player.exitCar();
      else {
        const car = S.player.nearestParkedCar();
        if (car) S.player.enterCar(car);
      }
    }
    if (e.code === 'KeyF' && S.mode === 'playing') S.player.punch();
    if (e.code === 'KeyR' && S.mode === 'playing') S.player.startReload();
    if (e.code === 'Digit1' && S.mode === 'playing') {
      S.weapon = 'pistol';
      S.hud.showToast('Pistol');
    }
    if (e.code === 'Digit2' && S.mode === 'playing') {
      S.weapon = 'fists';
      S.hud.showToast('Fists');
    }
    if (e.code === 'Space') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    S.keys[e.code] = false;
  });

  // Mouse: drag to orbit the camera; a plain click shoots (pistol) or punches.
  let dragging = false;
  let downX = 0;
  let downY = 0;
  let moved = 0;
  renderer.domElement.addEventListener('mousedown', (e) => {
    dragging = true;
    moved = 0;
    downX = e.clientX;
    downY = e.clientY;
    S.sounds.ensure();
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - downX;
    const dy = e.clientY - downY;
    downX = e.clientX;
    downY = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    if (S.player) {
      S.player.camYaw -= dx * 0.005;
      S.player.camPitch = clamp(S.player.camPitch + dy * 0.004, -0.15, 1.1);
    }
  });
  window.addEventListener('mouseup', () => {
    if (dragging && moved < 6 && S.mode === 'playing' && S.player) {
      if (S.weapon === 'pistol') S.player.shoot();
      else S.player.punch();
    }
    dragging = false;
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Start screen: Continue only when a save exists.
  const save = loadSave();
  const btnContinue = document.getElementById('btn-continue');
  if (!save) btnContinue.style.display = 'none';
  else btnContinue.textContent = `Continue — ${save.completedMissions.length}/5 missions, $${save.money.toLocaleString('en-US')}`;
  S.hud.showOverlay('start');

  // Test handle.
  window.__game = {
    S,
    newGame,
    continueGame,
    respawn: () => S.missions.respawn(),
    busted: () => S.missions.onBusted(),
    wasted: () => S.missions.onWasted(),
    state: () => ({
      mode: S.mode,
      money: S.money,
      health: Math.round(S.health),
      ammo: S.ammo,
      wanted: S.wanted,
      weapon: S.weapon,
      missionIndex: S.completedMissions.length,
      mission: S.missions && S.missions.current ? S.missions.current.def.name : null,
      missionStep: S.missions && S.missions.current ? S.missions.current.def.steps[S.missions.current.stepIndex]?.text ?? null : null,
      driving: S.player ? S.player.driving : false,
      carType: S.player && S.player.car ? S.player.car.type : null,
      playerPos: S.player ? { x: +S.player.pos.x.toFixed(1), y: +S.player.pos.y.toFixed(1), z: +S.player.pos.z.toFixed(1) } : null,
      speed: S.player ? +S.player.speed.toFixed(1) : 0,
      police: S.police ? S.police.units.length : 0,
      enemies: S.enemies.length,
      time: +S.time.toFixed(1),
      buildingCount: city.buildingCount,
    }),
  };
  window.__gameReady = true;

  renderer.setAnimationLoop(loop);
}

function newGame() {
  S.money = 0;
  S.health = 100;
  S.ammo = 12;
  S.ammoReserve = 48;
  S.weapon = 'pistol';
  S.wanted = 0;
  S.completedMissions = [];
  S.missionIndex = 0;
  S.time = 0;
  S.gameMinutes = 8 * 60 + 15;
  const p = S.player;
  if (p.driving) p.exitCar();
  p.pos.x = -28;
  p.pos.z = -60;
  p.pos.y = 0;
  p.vy = 0;
  p.heading = 0;
  p.camYaw = Math.PI / 2;
  if (S.police) S.police.clearWanted();
  S.mode = 'playing';
  S.hud.showOverlay(null);
  S.hud.setObjective('');
  S.hud.showToast('Welcome to Solmar City — Mara is calling…');
  S.missions.startMission(0);
  writeSave();
}

function continueGame() {
  const save = loadSave();
  if (!save) return newGame();
  S.money = save.money;
  S.health = 100;
  S.ammo = 12;
  S.ammoReserve = 48;
  S.weapon = 'pistol';
  S.wanted = 0;
  S.completedMissions = save.completedMissions || [];
  S.missionIndex = save.missionIndex || 0;
  S.time = 0;
  const p = S.player;
  p.pos.x = -28;
  p.pos.z = -60;
  p.pos.y = 0;
  S.mode = 'playing';
  S.hud.showOverlay(null);
  S.hud.showToast('Welcome back to Solmar City');
  if (S.completedMissions.length < 5) S.missions.startMission(S.completedMissions.length);
  else S.hud.setObjective('Free roam — courier jobs pay cash');
  writeSave();
}

function togglePause(force) {
  const wantPaused = force !== undefined ? force : S.mode === 'playing';
  if (wantPaused && S.mode === 'playing') {
    S.mode = 'paused';
    S.hud.showOverlay('pause');
  } else if (!wantPaused && S.mode === 'paused') {
    S.mode = 'playing';
    S.hud.showOverlay(null);
  }
}

function updateCamera(dt) {
  const p = S.player;
  if (!p) return;
  const targetDist = p.driving ? 13 : 9;
  camDist += (targetDist - camDist) * Math.min(1, dt * 4);
  const yaw = p.camYaw;
  const pitch = p.camPitch;
  const cx = p.pos.x - Math.cos(yaw) * Math.cos(pitch) * camDist;
  const cz = p.pos.z + Math.sin(yaw) * Math.cos(pitch) * camDist;
  const cy = (p.pos.y + 2.2) + Math.sin(pitch) * camDist;
  S.camera.position.set(cx, Math.max(cy, 1.4), cz);
  S.camera.lookAt(p.pos.x, p.pos.y + 2.0, p.pos.z);
}

function loop(t) {
  const dt = Math.min(0.05, lastT === 0 ? 0.016 : (t - lastT) / 1000);
  lastT = t;
  if (S.mode === 'playing') {
    S.time += dt;
    S.gameMinutes += dt * 0.5;
    S.player.update(dt);
    S.traffic.update(dt);
    for (const w of S.pedestrians) w.update(dt);
    for (const e of [...S.enemies]) e.update(dt);
    S.police.update(dt);
    S.missions.update(dt);
    city.update(dt);
    // Autosave every ~10 seconds.
    if (Math.floor(S.time) % 10 === 0 && Math.floor((S.time - dt) % 10) !== 0) writeSave();
  } else if (S.mode === 'menu') {
    // Slow cinematic orbit behind the start screen.
    S.time += dt;
    const a = S.time * 0.05;
    S.camera.position.set(Math.cos(a) * 190, 90, Math.sin(a) * 190);
    S.camera.lookAt(0, 10, 0);
    city.update(dt);
  }
  if (S.mode !== 'menu') updateCamera(dt);
  S.hud.update(dt);
  S.renderer.render(S.scene, S.camera);
}

init();
