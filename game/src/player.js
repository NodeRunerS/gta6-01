// Rex — the protagonist in a loud Hawaiian shirt and jeans. On-foot movement,
// combat (fist + pistol), vehicle entry/exit, camera follow, health/armor,
// WASTED / BUSTED, and the localStorage save.
import * as THREE from 'three';
import { S, isLand, isWater, clampToLand } from './state.js';
import { clamp, dist2d, angleLerp } from './util.js';
import { makeHuman } from './people.js';
import { makeVehicle, driveVehicle } from './vehicles.js';
import { addWanted, clearPolice } from './police.js';
import { nearestInteraction, doInteraction, hitEnemies } from './missions.js';

const SAVE_KEY = 'solmar-vice-save';

function hawaiianShirtMaterial() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ff5e8a';
  ctx.fillRect(0, 0, 128, 128);
  const cols = ['#00e5ff', '#ffc93d', '#7a5cff', '#ffffff', '#35d07f'];
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = cols[i % cols.length];
    const x = Math.random() * 128;
    const y = Math.random() * 128;
    ctx.beginPath();
    ctx.arc(x, y, 6 + Math.random() * 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x - 2, y - 10, 4, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshLambertMaterial({ map: t });
}

export function createPlayer(scene) {
  const built = makeHuman({ sex: 'male', scale: 1.0, hairStyle: 'flat', topColor: 0xff5e8a });
  // Swap the torso material for a Hawaiian print.
  built.parts.torso.material = hawaiianShirtMaterial();
  const g = built.group;
  g.position.set(140, 0, 0);
  scene.add(g);
  const p = {
    group: g, parts: built.parts,
    pos: { x: 140, z: 0 }, y: 0, vy: 0, heading: Math.PI,
    health: 100, armor: 0, wanted: 0,
    weapon: 'pistol', ammo: 48,
    vehicle: null, onFoot: true,
    walkPhase: 0, speed: 0,
    camYaw: Math.PI, _cleanTimer: 0, _bustTimer: 0,
    _shootCooldown: 0,
  };
  S.player = p;
  return p;
}

export function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: S.money, missionIndex: S.missionIndex,
      ownedBusinesses: S.ownedBusinesses, safehouseOwned: S.safehouseOwned,
      health: S.player.health, armor: S.player.armor, ammo: S.player.ammo,
    }));
  } catch (e) { /* storage unavailable */ }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export function applySave(sv) {
  if (!sv) return;
  S.money = sv.money ?? 200;
  S.missionIndex = sv.missionIndex ?? 0;
  S.ownedBusinesses = sv.ownedBusinesses || [];
  S.safehouseOwned = !!sv.safehouseOwned;
  S.player.health = sv.health ?? 100;
  S.player.armor = sv.armor ?? 0;
  S.player.ammo = sv.ammo ?? 48;
}

export function wastePlayer() {
  const p = S.player;
  if (S.mode !== 'playing') return;
  p.health = 0;
  S.mode = 'wasted';
  clearPolice();
  setWanted(0);
  document.getElementById('screen-wasted').classList.add('show');
  document.getElementById('hud').classList.add('hidden');
  if (S.audio) {
    S.audio.setEngine(0, false);
    S.audio.setSiren(false);
    S.audio.radioStop();
  }
}

export function bustPlayer() {
  const p = S.player;
  if (S.mode !== 'playing') return;
  S.mode = 'busted';
  clearPolice();
  setWanted(0);
  S.money = Math.max(0, S.money - 200);
  document.getElementById('screen-busted').classList.add('show');
  document.getElementById('hud').classList.add('hidden');
  if (S.audio) {
    S.audio.setEngine(0, false);
    S.audio.setSiren(false);
    S.audio.radioStop();
  }
}

export function respawn() {
  const p = S.player;
  document.getElementById('screen-wasted').classList.remove('show');
  document.getElementById('screen-busted').classList.remove('show');
  document.getElementById('hud').classList.remove('hidden');
  p.health = 100;
  p.armor = 0;
  p.wanted = 0;
  if (p.vehicle) {
    p.vehicle = null;
    p.onFoot = true;
  }
  const home = S.safehouseOwned ? S.locations.safehouse : { x: 140, z: 0 };
  p.pos.x = home.x;
  p.pos.z = home.z;
  p.group.position.set(home.x, 0, home.z);
  S.mode = 'playing';
  saveGame();
}

function nearestVehicle(maxD) {
  const p = S.player;
  let best = null;
  let bestD = maxD;
  const all = [...(S.parkedCars || []), ...S.traffic, ...S.boats, S.heli].filter(Boolean);
  for (const v of all) {
    if (v.occupied || v._exploded) continue;
    if (v.kind === 'boat' && isLand(p.pos.x, p.pos.z)) {
      // Board a boat only from the water edge.
      if (dist2d(p.pos.x, p.pos.z, v.pos.x, v.pos.z) > maxD + 2) continue;
    }
    const d = dist2d(p.pos.x, p.pos.z, v.pos.x, v.pos.z);
    if (d < bestD) { best = v; bestD = d; }
  }
  return best;
}

export function enterVehicle(v) {
  const p = S.player;
  p.vehicle = v;
  p.onFoot = false;
  v.occupied = true;
  p.group.visible = false;
  if (v.kind === 'car') {
    addWanted(1, 'car theft');
    S.stats.carsStolen++;
  }
  if (S.audio) S.audio.radioStart();
}

export function exitVehicle() {
  const p = S.player;
  const v = p.vehicle;
  if (!v) return;
  let ex = v.pos.x + Math.sin(v.heading + Math.PI / 2) * 3;
  let ez = v.pos.z + Math.cos(v.heading + Math.PI / 2) * 3;
  if (v.kind === 'boat') {
    // Only step out onto dry land — never strand the player mid-bay.
    const sideA = isLand(ex, ez);
    const sideB = isLand(
      v.pos.x - Math.sin(v.heading + Math.PI / 2) * 3,
      v.pos.z - Math.cos(v.heading + Math.PI / 2) * 3,
    );
    if (!sideA && !sideB) {
      S.hudToast && S.hudToast('Too deep to get out here — dock first!');
      return;
    }
    if (!sideA) {
      ex = v.pos.x - Math.sin(v.heading + Math.PI / 2) * 3;
      ez = v.pos.z - Math.cos(v.heading + Math.PI / 2) * 3;
    }
  }
  if (v.kind === 'heli' && (v.y || 0) > 3) {
    S.hudToast && S.hudToast('Too high to jump — land first!');
    return;
  }
  if (isWater(ex, ez) && v.kind === 'car') {
    ex = v.pos.x;
    ez = v.pos.z;
  }
  p.pos.x = ex;
  p.pos.z = ez;
  p.group.position.set(ex, 0, ez);
  p.group.visible = true;
  p.vehicle = null;
  p.onFoot = true;
  v.occupied = false;
  v.speed = 0;
  if (S.audio) S.audio.radioStop();
}

export function shoot() {
  const p = S.player;
  if (S.mode !== 'playing' || p._shootCooldown > 0) return;
  p._shootCooldown = 0.32;
  if (p.vehicle) return;
  if (p.ammo <= 0) {
    // Fist: short-range swing.
    punch();
    return;
  }
  p.ammo--;
  if (S.audio) S.audio.gunshot();
  // Muzzle flash pose.
  p.parts.armR.rotation.x = -1.4;
  setTimeout(() => { if (p.parts) p.parts.armR.rotation.x = 0; }, 140);
  const dir = { x: Math.sin(p.heading), z: Math.cos(p.heading) };
  const hit = hitEnemies(p.pos, dir, 42, 34);
  if (!hit) {
    // Hitting a pedestrian is a crime.
    for (const w of S.pedestrians) {
      if (w.dead) continue;
      const dx = w.pos.x - p.pos.x;
      const dz = w.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 42 && (dx * dir.x + dz * dir.z) / (d || 1) > 0.94) {
        w.group.rotation.x = -Math.PI / 2;
        w.group.position.y = 0.3;
        w.dead = true;
        addWanted(1, 'attacking a pedestrian');
        break;
      }
    }
  }
  // Tracer line.
  const tracer = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.06, 10),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.8 }),
  );
  tracer.position.set(p.pos.x + dir.x * 5, 1.4, p.pos.z + dir.z * 5);
  tracer.rotation.y = p.heading;
  S.scene.add(tracer);
  setTimeout(() => S.scene.remove(tracer), 90);
}

function punch() {
  const p = S.player;
  p.parts.armR.rotation.x = -1.4;
  setTimeout(() => { if (p.parts) p.parts.armR.rotation.x = 0; }, 160);
  const dir = { x: Math.sin(p.heading), z: Math.cos(p.heading) };
  for (const w of S.pedestrians) {
    if (w.dead) continue;
    const d = dist2d(p.pos.x, p.pos.z, w.pos.x, w.pos.z);
    if (d < 2.2) {
      w.group.rotation.x = -Math.PI / 2;
      w.dead = true;
      addWanted(1, 'assault');
      break;
    }
  }
  hitEnemies(p.pos, dir, 2.4, 25);
}

export function updatePlayer(dt) {
  const p = S.player;
  if (!p || S.mode !== 'playing') return;
  p._shootCooldown = Math.max(0, p._shootCooldown - dt);
  const k = S.keys;
  const input = {
    forward: !!(k.KeyW || k.ArrowUp),
    back: !!(k.KeyS || k.ArrowDown),
    left: !!(k.KeyA || k.ArrowLeft),
    right: !!(k.KeyD || k.ArrowRight),
    handbrake: !!k.Space,
    up: !!k.Space,
    down: !!k.ShiftLeft,
  };

  if (p.vehicle) {
    const v = p.vehicle;
    // Heli uses Space=up, Shift=down; car uses Space=handbrake.
    const vInput = {
      ...input,
      up: v.kind === 'heli' ? !!k.Space : false,
      down: v.kind === 'heli' ? !!k.ShiftLeft : false,
    };
    driveVehicle(v, vInput, dt);
    p.pos.x = v.pos.x;
    p.pos.z = v.pos.z;
    p.heading = v.heading;
    p.group.position.set(v.pos.x, v.y || 0, v.pos.z);
    if (S.audio) S.audio.setEngine(clamp(Math.abs(v.speed) / 30, 0, 1), true);
    return;
  }

  // On foot: WASD relative to camera yaw.
  const camYaw = S.camYaw;
  let mx = 0;
  let mz = 0;
  if (input.forward) { mx += Math.sin(camYaw); mz += Math.cos(camYaw); }
  if (input.back) { mx -= Math.sin(camYaw); mz -= Math.cos(camYaw); }
  if (input.left) { mx -= Math.cos(camYaw); mz += Math.sin(camYaw); }
  if (input.right) { mx += Math.cos(camYaw); mz -= Math.sin(camYaw); }
  const moving = mx !== 0 || mz !== 0;
  const sprint = !!k.ShiftLeft;
  const speed = sprint ? 9.5 : 5.2;
  if (moving) {
    const len = Math.hypot(mx, mz);
    mx /= len;
    mz /= len;
    const nx = p.pos.x + mx * speed * dt;
    const nz = p.pos.z + mz * speed * dt;
    if (isLand(nx, nz)) {
      p.pos.x = nx;
      p.pos.z = nz;
    } else if (isLand(nx, p.pos.z)) {
      p.pos.x = nx;
    } else if (isLand(p.pos.x, nz)) {
      p.pos.z = nz;
    }
    p.heading = Math.atan2(mx, mz);
    p.walkPhase += dt * speed * 1.6;
    const s = Math.sin(p.walkPhase);
    p.parts.legL.rotation.x = s * 0.6;
    p.parts.legR.rotation.x = -s * 0.6;
    p.parts.armL.rotation.x = -s * 0.5;
    p.parts.armR.rotation.x = s * 0.5;
  } else {
    p.parts.legL.rotation.x *= 0.8;
    p.parts.legR.rotation.x *= 0.8;
    p.parts.armL.rotation.x *= 0.8;
    p.parts.armR.rotation.x *= 0.8;
  }
  // Jump.
  if (k.Space && p.y === 0) p.vy = 7;
  if (p.y > 0 || p.vy !== 0) {
    p.vy -= 22 * dt;
    p.y += p.vy * dt;
    if (p.y <= 0) { p.y = 0; p.vy = 0; }
  }
  p.group.position.set(p.pos.x, p.y, p.pos.z);
  p.group.rotation.y = p.heading;
  if (S.audio) S.audio.setEngine(0, false);
}

export function tryEnterExit() {
  const p = S.player;
  if (S.mode !== 'playing') return;
  if (p.vehicle) {
    exitVehicle();
    return;
  }
  const v = nearestVehicle(4.5);
  if (v) enterVehicle(v);
}

export function tryInteract() {
  const p = S.player;
  if (S.mode !== 'playing' || p.vehicle) return;
  const it = nearestInteraction();
  if (it) doInteraction(it);
}

export function updateCamera(dt) {
  const p = S.player;
  const cam = S.camera;
  if (!cam || !p) return;
  if (S.mode === 'menu') {
    S.menuAngle += dt * 0.05;
    const r = 260;
    cam.position.set(Math.sin(S.menuAngle) * r, 90, Math.cos(S.menuAngle) * r);
    cam.lookAt(0, 10, 0);
    return;
  }
  const target = p.vehicle ? p.vehicle : p;
  const yaw = p.vehicle ? p.heading : S.camYaw;
  const dist = S.camDist;
  const pitch = S.camPitch;
  const cx = target.pos.x - Math.sin(yaw) * Math.cos(pitch) * dist;
  const cz = target.pos.z - Math.cos(yaw) * Math.cos(pitch) * dist;
  const cy = (target.y || 0) + 2 + Math.sin(pitch) * dist;
  cam.position.x += (cx - cam.position.x) * Math.min(1, dt * 6);
  cam.position.y += (cy - cam.position.y) * Math.min(1, dt * 6);
  cam.position.z += (cz - cam.position.z) * Math.min(1, dt * 6);
  cam.lookAt(target.pos.x, (target.y || 0) + 2, target.pos.z);
}
