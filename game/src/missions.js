// Story missions, courier side jobs and the cash economy for Solmar City:
// gun shop, a buyable safehouse and three income-generating businesses.
import * as THREE from 'three';
import { S, isLand } from './state.js';
import { dist2d, clamp } from './util.js';
import { makeHuman } from './people.js';
import { setWanted } from './police.js';

export const MISSIONS = [
  {
    name: 'Wheels Up', giver: 'Mara Solis', reward: 800,
    start: { x: 140, z: -56 },
    steps: [
      { kind: 'goto', pos: { x: -196, z: 140 }, text: 'Drive to the Solmar Docks' },
      { kind: 'kill', pos: { x: -196, z: 140 }, count: 3, text: 'Take out the dock guards (3)' },
      { kind: 'goto', pos: { x: 140, z: -56 }, text: 'Return to Mara on Ocean Drive' },
    ],
  },
  {
    name: 'Neon Nights', giver: 'Eddie', reward: 1200,
    start: { x: 196, z: 56 },
    steps: [
      { kind: 'collect', pos: { x: 196, z: 56 }, text: 'Pick up the package at Neon Nights' },
      { kind: 'goto', pos: { x: -140, z: 84 }, text: 'Deliver it to the Print Works' },
    ],
  },
  {
    name: 'Harbor Lights', giver: 'The Broker', reward: 2000,
    start: { x: 62, z: 140 },
    steps: [
      { kind: 'boat', pos: { x: 0, z: 196 }, text: 'Take a boat to Starfish Island' },
      { kind: 'collect', pos: { x: 0, z: 196 }, text: 'Grab the stash at the mansion' },
      { kind: 'boat', pos: { x: 62, z: 140 }, text: 'Bring it back to the Marina' },
    ],
  },
  {
    name: 'Top Gun', giver: 'Mara Solis', reward: 2500,
    start: { x: -168, z: 168 },
    steps: [
      { kind: 'fly', pos: { x: 0, z: 0 }, minAlt: 25, text: 'Fly the helicopter over the bay' },
      { kind: 'goto', pos: { x: -168, z: 168 }, text: 'Land back at the Helipad' },
    ],
  },
  {
    name: 'Vice King', giver: 'The Broker', reward: 3000,
    start: { x: -140, z: -56 },
    steps: [
      { kind: 'kill', pos: { x: -140, z: -28 }, count: 5, text: 'Clear the tower plaza (5)' },
      { kind: 'kill', pos: { x: -140, z: -28 }, count: 1, boss: true, text: 'Take down the Vice King' },
      { kind: 'goto', pos: { x: -140, z: -56 }, text: 'Report back to the Broker' },
    ],
  },
];

let marker = null;
let startMarker = null;
let itemMesh = null;
let incomeTimer = 0;

function makeMarker(color) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(2.6, 2.6, 3.2, 20, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.position.y = 1.6;
  g.add(ring);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 30, 8, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 15;
  g.add(beam);
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(2.6, 20),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.06;
  g.add(disc);
  return g;
}

export function showStartMarker() {
  hideMarkers();
  const def = MISSIONS[S.missionIndex];
  if (!def) return;
  startMarker = makeMarker(0xff2e88);
  startMarker.position.set(def.start.x, 0, def.start.z);
  S.scene.add(startMarker);
  S.objectiveText = `Go to ${def.giver} — ${def.name} ($${def.reward})`;
}

export function hideMarkers() {
  if (marker) { S.scene.remove(marker); marker = null; }
  if (startMarker) { S.scene.remove(startMarker); startMarker = null; }
  if (itemMesh) { S.scene.remove(itemMesh); itemMesh = null; }
}

function showStepMarker(step) {
  if (marker) S.scene.remove(marker);
  marker = makeMarker(0xffc93d);
  marker.position.set(step.pos.x, 0, step.pos.z);
  S.scene.add(marker);
  S.objectiveText = step.text;
}

export function startMission(i) {
  const def = MISSIONS[i];
  if (!def) return false;
  // Clean up a previous mission's enemies so a restart leaves no orphans.
  if (S.mission && S.mission.enemies) {
    for (const e of S.mission.enemies) S.scene.remove(e.group);
  }
  hideMarkers();
  S.mission = { def, index: i, step: 0, enemies: [], remaining: 0 };
  S.enemies = S.mission.enemies;
  showStepMarker(def.steps[0]);
  S.hudToast && S.hudToast(`${def.name} — ${def.giver}`);
  if (S.audio) S.audio.pickup();
  return true;
}

function advanceStep() {
  const m = S.mission;
  if (!m) return;
  m.step++;
  if (m.step >= m.def.steps.length) {
    completeMission();
    return;
  }
  showStepMarker(m.def.steps[m.step]);
  if (S.audio) S.audio.pickup();
}

function completeMission() {
  const m = S.mission;
  const reward = m.def.reward;
  S.money += reward;
  S.stats.moneyEarned += reward;
  S.stats.missionsDone++;
  S.missionIndex = Math.min(S.missionIndex + 1, MISSIONS.length);
  S.mission = null;
  S.enemies = [];
  hideMarkers();
  S.hudToast && S.hudToast(`MISSION COMPLETE — $${reward}`);
  if (S.audio) {
    S.audio.pickup();
    S.audio.blip(1046, 0.2, 'sine', 0.2);
  }
  S.saveGame && S.saveGame();
  if (S.missionIndex < MISSIONS.length) showStartMarker();
  else S.objectiveText = 'All story missions complete — Vice City is yours!';
}

function spawnEnemies(pos, count, boss) {
  const list = [];
  for (let i = 0; i < count; i++) {
    const built = makeHuman({
      sex: 'male', topColor: 0x1c1c22, pantsColor: 0x1c1c22, hairStyle: 'flat',
      scale: boss ? 1.12 : 0.95 + Math.random() * 0.08,
    });
    const x = pos.x + (Math.random() - 0.5) * 14;
    const z = pos.z + (Math.random() - 0.5) * 14;
    built.group.position.set(x, 0, z);
    // Gun in the right hand.
    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.12, 0.42),
      new THREE.MeshLambertMaterial({ color: 0x0c0c10 }),
    );
    gun.position.set(0, -0.62, 0.2);
    built.parts.armR.add(gun);
    S.scene.add(built.group);
    list.push({
      group: built.group, parts: built.parts, pos: { x, z },
      health: boss ? 220 : 100, shootTimer: 1 + Math.random() * 2, dead: false, boss: !!boss,
    });
  }
  return list;
}

export function hitEnemies(origin, dir, range, dmg) {
  // origin/dir are {x,z} on the ground plane; simple 2D cone test.
  const m = S.mission;
  if (!m) return null;
  let best = null;
  let bestD = range;
  for (const e of m.enemies) {
    if (e.dead) continue;
    const dx = e.pos.x - origin.x;
    const dz = e.pos.z - origin.z;
    const d = Math.hypot(dx, dz);
    if (d > range) continue;
    const dot = (dx * dir.x + dz * dir.z) / (d || 1);
    if (dot < 0.94) continue;
    if (d < bestD) { best = e; bestD = d; }
  }
  if (best) {
    best.health -= dmg;
    if (best.health <= 0) {
      best.dead = true;
      best.group.rotation.x = -Math.PI / 2;
      best.group.position.y = 0.3;
      m.remaining--;
      S.stats.kills++;
      if (m.remaining <= 0) advanceStep();
    }
  }
  return best;
}

function updateEnemies(dt) {
  const m = S.mission;
  if (!m) return;
  const p = S.player;
  for (const e of m.enemies) {
    if (e.dead) continue;
    const d = dist2d(e.pos.x, e.pos.z, p.pos.x, p.pos.z);
    // Face the player and shuffle closer when far.
    e.group.rotation.y = Math.atan2(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
    if (d > 12 && d < 40) {
      e.pos.x += Math.sin(e.group.rotation.y) * 2.2 * dt;
      e.pos.z += Math.cos(e.group.rotation.y) * 2.2 * dt;
      e.group.position.set(e.pos.x, 0, e.pos.z);
      e.parts.legL.rotation.x = Math.sin(S.time * 8) * 0.5;
      e.parts.legR.rotation.x = -Math.sin(S.time * 8) * 0.5;
    }
    // Shoot back.
    e.shootTimer -= dt;
    if (e.shootTimer <= 0 && d < 34) {
      e.shootTimer = 1.1 + Math.random() * 0.9;
      e.parts.armR.rotation.x = -1.2;
      setTimeout(() => { if (e.parts) e.parts.armR.rotation.x = 0; }, 180);
      if (S.audio) S.audio.blip(180, 0.08, 'square', 0.06);
      if (Math.random() < 0.42) {
        const dmg = e.boss ? 12 : 6;
        if (p.armor > 0) p.armor = Math.max(0, p.armor - dmg);
        else p.health -= dmg;
        S.hudFlash && S.hudFlash();
        if (p.health <= 0) S.wastePlayer && S.wastePlayer();
      }
    }
  }
  // Clean up dead enemies after a while.
  for (let i = m.enemies.length - 1; i >= 0; i--) {
    const e = m.enemies[i];
    if (e.dead) {
      e._deadT = (e._deadT || 0) + dt;
      if (e._deadT > 4) {
        S.scene.remove(e.group);
        m.enemies.splice(i, 1);
      }
    }
  }
}

function checkStep(dt) {
  const m = S.mission;
  if (!m) return;
  const step = m.def.steps[m.step];
  const p = S.player;
  const d = dist2d(p.pos.x, p.pos.z, step.pos.x, step.pos.z);
  if (step.kind === 'goto') {
    if (d < 5) advanceStep();
  } else if (step.kind === 'collect') {
    if (!itemMesh) {
      itemMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.5, 0.5),
        new THREE.MeshBasicMaterial({ color: 0xffc93d }),
      );
      itemMesh.position.set(step.pos.x, 1.2, step.pos.z);
      S.scene.add(itemMesh);
    }
    itemMesh.position.y = 1.2 + Math.sin(S.time * 3) * 0.2;
    itemMesh.rotation.y += dt * 2;
    if (d < 3.5) {
      S.scene.remove(itemMesh);
      itemMesh = null;
      advanceStep();
    }
  } else if (step.kind === 'kill') {
    if (m.enemies.length === 0) {
      m.enemies = spawnEnemies(step.pos, step.count, step.boss);
      S.enemies = m.enemies;
      m.remaining = step.count;
    }
  } else if (step.kind === 'boat') {
    if (d < 8 && p.vehicle && p.vehicle.kind === 'boat') advanceStep();
  } else if (step.kind === 'fly') {
    if (d < 12 && p.vehicle && p.vehicle.kind === 'heli' && (p.vehicle.y || 0) >= (step.minAlt || 20)) {
      advanceStep();
    }
  }
}

// --- Courier side jobs ---
export function startCourier() {
  if (S.courier) return;
  const spots = [
    { x: -140, z: 0 }, { x: 140, z: 112 }, { x: -84, z: 168 }, { x: 196, z: -84 }, { x: 0, z: 196 },
  ];
  const target = spots[Math.floor(Math.random() * spots.length)];
  S.courier = { target, deadline: 60 };
  if (marker) S.scene.remove(marker);
  marker = makeMarker(0x00e5ff);
  marker.position.set(target.x, 0, target.z);
  S.scene.add(marker);
  S.objectiveText = 'Courier: deliver the package in 60s (+$150)';
  S.hudToast && S.hudToast('Courier job started!');
}

function updateCourier(dt) {
  if (!S.courier) return;
  S.courier.deadline -= dt;
  const p = S.player;
  if (dist2d(p.pos.x, p.pos.z, S.courier.target.x, S.courier.target.z) < 5) {
    S.money += 150;
    S.stats.moneyEarned += 150;
    S.hudToast && S.hudToast('Delivery done — +$150');
    if (S.audio) S.audio.pickup();
    if (marker) { S.scene.remove(marker); marker = null; }
    S.courier = null;
    if (!S.mission) showStartMarker();
    return;
  }
  if (S.courier.deadline <= 0) {
    S.hudToast && S.hudToast('Courier job failed — too slow');
    if (marker) { S.scene.remove(marker); marker = null; }
    S.courier = null;
    if (!S.mission) showStartMarker();
  }
}

// --- Economy: gun shop, safehouse, businesses ---
export function nearestInteraction() {
  const p = S.player;
  const L = S.locations;
  const cands = [];
  cands.push({ type: 'gunshop', x: L.gunshop.x, z: L.gunshop.z, label: 'AMMU-NATION — E: armor $800 / ammo $300' });
  if (!S.safehouseOwned) {
    cands.push({ type: 'safehouse', x: L.safehouse.x, z: L.safehouse.z, label: 'Ocean Safehouse — E: buy $5,000' });
  }
  for (const b of L.businesses) {
    if (!S.ownedBusinesses.includes(b.id)) {
      cands.push({ type: 'business', id: b.id, x: b.x, z: b.z, label: `${b.name} — E: buy $${b.price.toLocaleString()} ($${b.income}/30s)` });
    }
  }
  cands.push({ type: 'courier', x: L.plaza.x, z: L.plaza.z, label: 'Courier jobs — E: start delivery (+$150)' });
  let best = null;
  let bestD = 6;
  for (const c of cands) {
    const d = dist2d(p.pos.x, p.pos.z, c.x, c.z);
    if (d < bestD) { best = c; bestD = d; }
  }
  return best;
}

export function doInteraction(it) {
  const p = S.player;
  if (it.type === 'gunshop') {
    if (p.armor < 100 && S.money >= 800) {
      S.money -= 800;
      p.armor = 100;
      S.hudToast && S.hudToast('Armor bought — $800');
    } else if (S.money >= 300) {
      S.money -= 300;
      p.ammo += 60;
      S.hudToast && S.hudToast('Ammo +60 — $300');
    } else {
      S.hudToast && S.hudToast('Not enough cash!');
    }
    if (S.audio) S.audio.pickup();
  } else if (it.type === 'safehouse') {
    if (S.money >= 5000) {
      S.money -= 5000;
      S.safehouseOwned = true;
      p.health = 100;
      p.armor = 100;
      S.hudToast && S.hudToast('Safehouse bought! Health restored.');
      S.saveGame && S.saveGame();
    } else {
      S.hudToast && S.hudToast('Need $5,000 for the safehouse.');
    }
  } else if (it.type === 'business') {
    const b = S.locations.businesses.find((x) => x.id === it.id);
    if (S.money >= b.price) {
      S.money -= b.price;
      S.ownedBusinesses.push(b.id);
      S.hudToast && S.hudToast(`${b.name} is yours! +$${b.income} every 30s.`);
      S.saveGame && S.saveGame();
    } else {
      S.hudToast && S.hudToast(`Need $${b.price.toLocaleString()} for ${b.name}.`);
    }
  } else if (it.type === 'courier') {
    startCourier();
  }
}

function updateIncome(dt) {
  incomeTimer += dt;
  if (incomeTimer >= 30) {
    incomeTimer = 0;
    let total = 0;
    for (const id of S.ownedBusinesses) {
      const b = S.locations.businesses.find((x) => x.id === id);
      if (b) total += b.income;
    }
    if (total > 0) {
      S.money += total;
      S.stats.moneyEarned += total;
      S.hudToast && S.hudToast(`Business income +$${total}`);
    }
  }
}

export function updateMissions(dt) {
  // Marker pulse.
  for (const mk of [marker, startMarker]) {
    if (mk) {
      const s = 1 + Math.sin(S.time * 3) * 0.08;
      mk.scale.set(s, 1, s);
      mk.rotation.y += dt * 0.6;
    }
  }
  // Walk into the pink start marker to begin the next story mission.
  if (!S.mission && S.missionIndex < MISSIONS.length && startMarker) {
    const def = MISSIONS[S.missionIndex];
    if (dist2d(S.player.pos.x, S.player.pos.z, def.start.x, def.start.z) < 5) startMission(S.missionIndex);
  }
  checkStep(dt);
  updateEnemies(dt);
  updateCourier(dt);
  updateIncome(dt);
  // Safehouse heal when owned and standing close.
  if (S.safehouseOwned && S.player) {
    const L = S.locations.safehouse;
    if (dist2d(S.player.pos.x, S.player.pos.z, L.x, L.z) < 5) {
      S.player.health = Math.min(100, S.player.health + 10 * dt);
    }
  }
}
