// Wanted system for Solmar City: 0–6 stars with escalating police response —
// patrol cruisers, roadblocks at 3+, SWAT vans at 4+, a police helicopter
// at 5–6. Units chase along the road grid and ram the player up close.
import * as THREE from 'three';
import { S, WORLD, isLand } from './state.js';
import { clamp, dist2d } from './util.js';
import { makeCarMesh, makeVehicle } from './vehicles.js';

let roadblockTimer = 0;

function spawnUnit(scene, kind) {
  const type = kind === 'swat' ? 'swat' : 'police';
  const mesh = makeCarMesh(type);
  scene.add(mesh);
  return {
    kind, mesh, pos: { x: 0, z: 0 }, heading: 0, speed: 0,
    health: kind === 'swat' ? 220 : 120, ramTimer: 0,
    mode: 'road', axis: 'x', road: 0, s: 0, dir: 1, stuckTimer: 0,
  };
}

function roadRange(axis, road, s) {
  if (axis === 'x') {
    const bridge = WORLD.bridgeZ.includes(road);
    return bridge ? [-196, 196] : (s < 0 ? [-196, -56] : [56, 196]);
  }
  return [-168, 168];
}

// Put the unit on the nearest road (avenue or street) for road mode.
function snapToRoad(u) {
  const avs = [...WORLD.avenuesWest, ...WORLD.avenuesEast];
  let bestA = avs[0];
  let bestAd = 1e9;
  for (const a of avs) {
    const d = Math.abs(u.pos.x - a);
    if (d < bestAd) { bestAd = d; bestA = a; }
  }
  let bestS = WORLD.streets[0];
  let bestSd = 1e9;
  for (const s of WORLD.streets) {
    const d = Math.abs(u.pos.z - s);
    if (d < bestSd) { bestSd = d; bestS = s; }
  }
  if (bestAd <= bestSd) {
    u.axis = 'z'; u.road = bestA; u.s = u.pos.z; u.dir = u.pos.z < S.player.pos.z ? 1 : -1;
  } else {
    u.axis = 'x'; u.road = bestS; u.s = u.pos.x; u.dir = u.pos.x < S.player.pos.x ? 1 : -1;
  }
  u.mode = 'road';
  u.stuckTimer = 0;
}

// At an intersection, pick the road option that gets closest to the player.
function chooseTurn(u) {
  const p = S.player;
  const cross = u.axis === 'x' ? [...WORLD.avenuesWest, ...WORLD.avenuesEast] : WORLD.streets;
  let near = null;
  for (const c of cross) {
    if (Math.abs(u.s - c) < 2.5) { near = c; break; }
  }
  if (near === null) return;
  // Decide only once per intersection (avoid flip-flopping every frame).
  const key = u.axis + ':' + near;
  if (u._turnKey === key) return;
  u._turnKey = key;
  const newAxis = u.axis === 'x' ? 'z' : 'x';
  const options = [
    { axis: u.axis, road: u.road, s: u.s, dir: u.dir },
    { axis: newAxis, road: near, s: u.road, dir: 1 },
    { axis: newAxis, road: near, s: u.road, dir: -1 },
  ];
  let best = options[0];
  let bestD = 1e9;
  for (const o of options) {
    const px = o.axis === 'x' ? o.s + o.dir * 24 : o.road;
    const pz = o.axis === 'z' ? o.s + o.dir * 24 : o.road;
    const d = dist2d(px, pz, p.pos.x, p.pos.z) + Math.random() * 8;
    if (d < bestD) { bestD = d; best = o; }
  }
  u.axis = best.axis;
  u.road = best.road;
  u.s = best.s;
  u.dir = best.dir;
}

function driveOnRoad(u, dt, top) {
  u.speed += clamp(top - u.speed, -18 * dt, 12 * dt);
  u.s += u.dir * u.speed * dt;
  chooseTurn(u);
  const [lo, hi] = roadRange(u.axis, u.road, u.s);
  if (u.s > hi) { u.s = hi; u.dir = -1; }
  if (u.s < lo) { u.s = lo; u.dir = 1; }
  u.pos.x = u.axis === 'x' ? u.s : u.road;
  u.pos.z = u.axis === 'z' ? u.s : u.road;
  u.heading = u.axis === 'x' ? (u.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (u.dir > 0 ? 0 : Math.PI);
  u.mesh.position.set(u.pos.x, 0, u.pos.z);
  u.mesh.rotation.y = u.heading;
}

export function setWanted(n, reason) {
  const p = S.player;
  const before = p.wanted;
  p.wanted = clamp(n, 0, 6);
  if (p.wanted > before && S.audio) S.audio.blip(660, 0.15, 'square', 0.12);
  if (reason && p.wanted > before) S.hudToast && S.hudToast(`WANTED ${p.wanted}★ — ${reason}`);
}

export function addWanted(n, reason) {
  setWanted(S.player.wanted + n, reason);
}

function spawnPosNearPlayer() {
  const p = S.player.pos;
  const roads = [...WORLD.avenuesWest, ...WORLD.avenuesEast];
  for (let tries = 0; tries < 10; tries++) {
    const a = roads[Math.floor(Math.random() * roads.length)];
    const z = -168 + Math.random() * 336;
    const d = dist2d(a, z, p.x, p.z);
    if (d > 40 && d < 130) return { x: a, z };
  }
  return { x: p.x + 60, z: p.z };
}

export function updatePolice(dt) {
  const p = S.player;
  if (!p) return;
  const want = p.wanted;
  // Desired unit count scales with wanted level.
  const desired = want === 0 ? 0 : Math.min(2 + want, 8);
  // Spawn on a road near the player.
  while (S.police.length < desired) {
    const swatCount = S.police.filter((u) => u.kind === 'swat').length;
    const kind = want >= 4 && swatCount < 2 ? 'swat' : 'police';
    const u = spawnUnit(S.scene, kind);
    const sp = spawnPosNearPlayer();
    u.pos.x = sp.x;
    u.pos.z = sp.z;
    snapToRoad(u);
    u.mesh.position.set(u.pos.x, 0, u.pos.z);
    S.police.push(u);
  }
  // Despawn far / excess units.
  for (let i = S.police.length - 1; i >= 0; i--) {
    const u = S.police[i];
    if (want === 0 || dist2d(u.pos.x, u.pos.z, p.x, p.z) > 220) {
      S.scene.remove(u.mesh);
      S.police.splice(i, 1);
    }
  }
  // Chase: follow the road grid toward the player, then ram up close.
  for (const u of S.police) {
    const dx = p.pos.x - u.pos.x;
    const dz = p.pos.z - u.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const top = u.kind === 'swat' ? 26 : 32;
    if (u.mode === 'road') {
      if (d < 25) {
        u.mode = 'ram';
        u.stuckTimer = 0;
      } else {
        driveOnRoad(u, dt, top);
      }
    }
    if (u.mode === 'ram') {
      if (d > 48) {
        snapToRoad(u);
        continue;
      }
      const wantHeading = Math.atan2(dx, dz);
      let dh = wantHeading - u.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      u.heading += clamp(dh, -2.6 * dt, 2.6 * dt);
      u.speed += clamp(top - u.speed, -18 * dt, 12 * dt);
      const nx = u.pos.x + Math.sin(u.heading) * u.speed * dt;
      const nz = u.pos.z + Math.cos(u.heading) * u.speed * dt;
      if (isLand(nx, nz)) {
        u.pos.x = nx;
        u.pos.z = nz;
        u.stuckTimer = u.speed < 1.5 ? u.stuckTimer + dt : 0;
      } else {
        u.speed *= 0.5;
        u.heading += dt * 2;
        u.stuckTimer += dt;
      }
      if (u.stuckTimer > 2) {
        snapToRoad(u);
        continue;
      }
      u.mesh.position.set(u.pos.x, 0, u.pos.z);
      u.mesh.rotation.y = u.heading;
    }
    // Strobe flash on the light bar, with intense red/blue halos.
    const bar = u.mesh.userData.lightBar;
    if (bar) {
      const phase = Math.floor(S.time * 6) % 2 === 0;
      bar.children[0].material.color.setHex(phase ? 0xff2222 : 0x550000);
      bar.children[1].material.color.setHex(phase ? 0x000055 : 0x2244ff);
      const halos = bar.userData.halos;
      if (halos) {
        halos[0].material.opacity = phase ? 0.9 : 0.06;
        halos[1].material.opacity = phase ? 0.06 : 0.9;
      }
      u._strobePhase = phase;
    }
    // Ram the player.
    if (d < 4.5) {
      u.ramTimer += dt;
      if (p.vehicle) {
        p.vehicle.health -= 14 * dt;
        if (p.vehicle.health <= 0) explodeVehicle(p.vehicle);
      } else if (d < 2.6 && u.ramTimer > 1.5 && want >= 1) {
        // Arrest: held close for 1.5 s.
        S.bustPlayer && S.bustPlayer();
      }
    } else {
      u.ramTimer = 0;
    }
  }

  // Roadblocks at 3+ stars: two cruisers + barriers across the road ahead.
  roadblockTimer -= dt;
  if (want >= 3 && roadblockTimer <= 0 && S.roadblocks.length < 2) {
    roadblockTimer = 22;
    const ahead = { x: p.pos.x + Math.sin(p.heading) * 46, z: p.pos.z + Math.cos(p.heading) * 46 };
    if (isLand(ahead.x, ahead.z)) {
      const rb = { x: ahead.x, z: ahead.z, heading: p.heading, meshes: [], life: 30 };
      for (const off of [-4, 4]) {
        const m = makeCarMesh('police');
        m.position.set(ahead.x + Math.cos(p.heading) * off, 0, ahead.z - Math.sin(p.heading) * off);
        m.rotation.y = p.heading + Math.PI / 2;
        S.scene.add(m);
        rb.meshes.push(m);
      }
      const barrier = new THREE.Mesh(
        new THREE.BoxGeometry(10, 1.1, 0.6),
        new THREE.MeshLambertMaterial({ color: 0xffc93d }),
      );
      barrier.position.set(ahead.x, 0.55, ahead.z);
      barrier.rotation.y = p.heading + Math.PI / 2;
      S.scene.add(barrier);
      rb.meshes.push(barrier);
      S.roadblocks.push(rb);
    }
  }
  for (let i = S.roadblocks.length - 1; i >= 0; i--) {
    const rb = S.roadblocks[i];
    rb.life -= dt;
    if (rb.life <= 0 || want < 3) {
      for (const m of rb.meshes) S.scene.remove(m);
      S.roadblocks.splice(i, 1);
    }
  }

  // Police helicopter at 5–6 stars: circles above the player with a spotlight.
  if (want >= 5 && !S.policeHeli) {
    const h = makeVehicle('heli', 'heli', p.pos.x + 30, p.pos.z + 30, 0);
    h.group.traverse((o) => {
      if (o.isMesh && o.material && o.material.color) o.material.color.setHex(0x1c2f4d);
    });
    h.y = 45;
    h.group.position.set(h.pos.x, 45, h.pos.z);
    S.scene.add(h.group);
    const spot = new THREE.SpotLight(0xffffff, 300, 90, 0.32, 0.5);
    spot.position.set(0, 0, 0);
    h.group.add(spot);
    spot.target.position.set(0, -45, 0);
    h.group.add(spot.target);
    S.policeHeli = h;
  }
  if (S.policeHeli) {
    const h = S.policeHeli;
    if (want < 5) {
      S.scene.remove(h.group);
      S.policeHeli = null;
    } else {
      const dx = p.pos.x - h.pos.x;
      const dz = p.pos.z - h.pos.z;
      h.heading = Math.atan2(dx, dz);
      h.pos.x += Math.sin(h.heading) * 18 * dt;
      h.pos.z += Math.cos(h.heading) * 18 * dt;
      h.y = 42 + Math.sin(S.time * 0.8) * 3;
      h.group.position.set(h.pos.x, h.y, h.pos.z);
      h.group.rotation.y = h.heading;
      if (h.rotor) h.rotor.rotation.y += dt * 22;
    }
  }

  // Wanted decays when the player stays clean and out of sight.
  if (want > 0) {
    p._cleanTimer = (p._cleanTimer || 0) + dt;
    if (p._cleanTimer > 45 && S.police.length === 0) {
      setWanted(want - 1);
      p._cleanTimer = 0;
    }
  } else {
    p._cleanTimer = 0;
  }

  // Siren audio when police are near.
  if (S.audio && S.police.length > 0) {
    S.audio.setSiren(dist2d(S.police[0].pos.x, S.police[0].pos.z, p.pos.x, p.pos.z) < 90);
  }
}

export function explodeVehicle(v) {
  if (!v || v._exploded) return;
  v._exploded = true;
  if (S.audio) S.audio.explosion();
  addWanted(2, 'explosion');
  // Fireball: expanding emissive sphere that fades.
  const boom = new THREE.Mesh(
    new THREE.SphereGeometry(2.2, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xff7722, transparent: true, opacity: 0.9 }),
  );
  boom.position.copy(v.group.position);
  boom.position.y += 1;
  S.scene.add(boom);
  S._explosions = S._explosions || [];
  S._explosions.push({ mesh: boom, t: 0 });
  if (S.player.vehicle === v) {
    S.player.vehicle = null;
    S.player.onFoot = true;
    S.player.pos.x = v.pos.x + 3;
    S.player.pos.z = v.pos.z + 3;
    S.player.health -= 25;
  }
  v.group.visible = false;
  setTimeout(() => { S.scene.remove(v.group); }, 50);
}

export function updateExplosions(dt) {
  if (!S._explosions) return;
  for (let i = S._explosions.length - 1; i >= 0; i--) {
    const e = S._explosions[i];
    e.t += dt;
    e.mesh.scale.setScalar(1 + e.t * 3);
    e.mesh.material.opacity = Math.max(0, 0.9 - e.t * 1.4);
    if (e.t > 0.7) {
      S.scene.remove(e.mesh);
      S._explosions.splice(i, 1);
    }
  }
}

export function clearPolice() {
  for (const u of S.police) S.scene.remove(u.mesh);
  S.police = [];
  for (const rb of S.roadblocks) {
    for (const m of rb.meshes) S.scene.remove(m);
  }
  S.roadblocks = [];
  if (S.policeHeli) {
    S.scene.remove(S.policeHeli.group);
    S.policeHeli = null;
  }
}
