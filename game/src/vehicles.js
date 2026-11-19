// Vehicles for Solmar City: 11 car types with arcade drifting physics,
// working headlights/taillights, traffic that follows the road grid and
// stops at red lights, two drivable speedboats and one flyable helicopter.
import * as THREE from 'three';
import { S, WORLD, isLand, isWater, hitsBuilding } from './state.js';
import { mulberry32, pick, clamp, angleLerp } from './util.js';

const rng = mulberry32(777);

export const CAR_TYPES = {
  sedan: { name: 'Box Sedan', len: 4.4, wid: 1.9, h: 1.35, top: 26, accel: 14, colors: [0x8a9aa8, 0xc8b89a, 0x5a6b7a, 0x9a3a3a] },
  supercar: { name: 'Comet GT', len: 4.3, wid: 2.0, h: 1.05, top: 42, accel: 20, colors: [0xff2e4d, 0xffc93d, 0xffffff, 0x00e5ff] },
  muscle: { name: 'Sabre Muscle', len: 4.8, wid: 2.0, h: 1.4, top: 34, accel: 17, colors: [0x4a4a58, 0x7a1a1a, 0x1a4a7a, 0xff8a3d] },
  convertible: { name: 'Breeze Convertible', len: 4.4, wid: 1.9, h: 1.2, top: 30, accel: 15, colors: [0xff7ab8, 0x9ad7f0, 0xffe08a, 0xffffff] },
  suv: { name: 'Rancher SUV', len: 4.9, wid: 2.1, h: 1.85, top: 27, accel: 13, colors: [0x3a5a3a, 0x5a4a3a, 0x2a3a55, 0x8a8a8a] },
  pickup: { name: 'Yankee Pickup', len: 5.1, wid: 2.0, h: 1.7, top: 28, accel: 13, colors: [0x8a5a2a, 0x4a6b4a, 0x7a7a7a, 0x9a3a2a] },
  police: { name: 'VCPD Cruiser', len: 4.6, wid: 2.0, h: 1.4, top: 36, accel: 18, colors: [0xf2f2f2] },
  ambulance: { name: 'Ambulance', len: 5.2, wid: 2.1, h: 2.2, top: 28, accel: 12, colors: [0xffffff] },
  bike: { name: 'PCJ Motorbike', len: 2.2, wid: 0.7, h: 1.1, top: 38, accel: 19, colors: [0xff2e4d, 0x00e5ff, 0x3a3a48] },
  swat: { name: 'SWAT Van', len: 5.4, wid: 2.2, h: 2.4, top: 30, accel: 14, colors: [0x3d3d48] },
  taxi: { name: 'Kaufman Taxi', len: 4.4, wid: 1.9, h: 1.4, top: 28, accel: 14, colors: [0xffc93d] },
};

function lam(color) {
  return new THREE.MeshLambertMaterial({ color });
}

function addBox(g, w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

export function makeCarMesh(typeName, colorOverride) {
  const def = CAR_TYPES[typeName];
  const color = colorOverride ?? pick(rng, def.colors);
  const g = new THREE.Group();
  // Body paint: a touch of same-colour emissive so no car ever reads as
  // pure black — the old near-black paints (0x2a2a2a, 0x1a1a1a) looked black.
  const bodyM = new THREE.MeshPhongMaterial({ color, shininess: 90, specular: 0x888888, emissive: color, emissiveIntensity: 0.22 });
  bodyM.userData.bodyPaint = true;
  const glassM = new THREE.MeshPhongMaterial({ color: 0x101826, shininess: 140, specular: 0xaaaaaa });
  const darkM = lam(0x14141a);
  const L = def.len;
  const W = def.wid;
  const H = def.h;

  if (typeName === 'bike') {
    addBox(g, 0.5, 0.5, L * 0.8, bodyM, 0, 0.75, 0);
    addBox(g, 0.4, 0.12, 0.8, darkM, 0, 1.0, -0.3);
    addBox(g, 0.5, 0.3, 0.7, bodyM, 0, 0.95, 0.35);
  } else {
    // Lower body + cabin.
    addBox(g, W, H * 0.55, L, bodyM, 0, H * 0.32, 0);
    if (typeName !== 'convertible') {
      const cabLen = typeName === 'supercar' ? L * 0.42 : L * 0.5;
      addBox(g, W * 0.86, H * 0.5, cabLen, glassM, 0, H * 0.78, typeName === 'supercar' ? -L * 0.06 : -L * 0.05);
    } else {
      addBox(g, W * 0.9, 0.12, L * 0.55, darkM, 0, H * 0.62, -L * 0.05);
    }
    if (typeName === 'pickup') addBox(g, W * 0.9, 0.3, L * 0.34, darkM, 0, H * 0.62, -L * 0.28);
    if (typeName === 'supercar' || typeName === 'muscle') {
      addBox(g, W * 0.95, 0.08, 0.4, darkM, 0, H * 0.95, -L * 0.48);
    }
    if (typeName === 'ambulance' || typeName === 'swat') {
      addBox(g, W * 0.95, H * 0.45, L * 0.62, bodyM, 0, H * 0.85, -L * 0.14);
    }
    if (typeName === 'taxi') {
      addBox(g, 0.7, 0.22, 0.4, new THREE.MeshBasicMaterial({ color: 0xffc93d }), 0, H * 1.05, 0);
    }
  }

  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 10);
  const wheelM = lam(0x0c0c10);
  const wheels = [];
  const wheelPos = typeName === 'bike'
    ? [[0, 0.36, L * 0.38], [0, 0.36, -L * 0.38]]
    : [[-W / 2, 0.38, L * 0.32], [W / 2, 0.38, L * 0.32], [-W / 2, 0.38, -L * 0.32], [W / 2, 0.38, -L * 0.32]];
  for (const [wx, wy, wz] of wheelPos) {
    const w = new THREE.Mesh(wheelGeo, wheelM);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, wy, wz);
    g.add(w);
    wheels.push(w);
  }

  // Headlight bar (warm white) + taillight bar (red), bright emissive, with
  // additive glow discs so both dazzle in daylight.
  const hl = new THREE.Mesh(new THREE.BoxGeometry(W - 0.5, 0.16, 0.06), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  hl.position.set(0, H * 0.38, L / 2 + 0.02);
  g.add(hl);
  const tl = new THREE.Mesh(new THREE.BoxGeometry(W - 0.5, 0.14, 0.06), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
  tl.position.set(0, H * 0.38, -L / 2 - 0.02);
  g.add(tl);
  const hlGlows = [];
  const hlGlowMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const hlGlowGeo = new THREE.CircleGeometry(0.42, 12);
  for (const gx of [-0.6, 0.6]) {
    const disc = new THREE.Mesh(hlGlowGeo, hlGlowMat);
    disc.position.set(gx, H * 0.38, L / 2 + 0.06);
    g.add(disc);
    hlGlows.push(disc);
  }
  const tlGlows = [];
  const tlGlowMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
  const tlGlowGeo = new THREE.CircleGeometry(0.38, 12);
  for (const gx of [-0.6, 0.6]) {
    const disc = new THREE.Mesh(tlGlowGeo, tlGlowMat);
    disc.position.set(gx, H * 0.38, -L / 2 - 0.06);
    disc.rotation.y = Math.PI;
    g.add(disc);
    tlGlows.push(disc);
  }

  // Police light bar + black-and-white doors.
  let lightBar = null;
  if (typeName === 'police') {
    lightBar = new THREE.Group();
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.3), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    r.position.x = -0.25;
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.3), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    b.position.x = 0.25;
    lightBar.add(r);
    lightBar.add(b);
    // Intense red/blue halos around the strobes (police.js pulses them).
    const rHalo = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    rHalo.position.x = -0.25;
    const bHalo = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x2244ff, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    bHalo.position.x = 0.25;
    lightBar.add(rHalo);
    lightBar.add(bHalo);
    lightBar.userData.halos = [rHalo, bHalo];
    lightBar.position.set(0, H * 1.02, 0);
    g.add(lightBar);
    addBox(g, W + 0.02, H * 0.4, L * 0.4, lam(0x1c1c22), 0, H * 0.35, 0);
  }
  g.userData = { type: typeName, def, wheels, lightBar, hl, tl, hlGlows, tlGlows };
  return g;
}

function makeBoatMesh() {
  const g = new THREE.Group();
  addBox(g, 2.2, 0.9, 6.4, new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 80 }), 0, 0.3, 0);
  addBox(g, 2.24, 0.25, 6.42, new THREE.MeshBasicMaterial({ color: 0xff2e88 }), 0, 0.55, 0);
  addBox(g, 1.6, 0.7, 2.2, new THREE.MeshPhongMaterial({ color: 0x101826, shininess: 120 }), 0, 0.95, -0.6);
  addBox(g, 0.8, 0.7, 0.5, lam(0x1c1c22), 0, 0.6, -3.1);
  g.userData = { type: 'boat' };
  return g;
}

function makeHeliMesh() {
  const g = new THREE.Group();
  addBox(g, 2.4, 1.8, 5.2, new THREE.MeshPhongMaterial({ color: 0xff5e3d, shininess: 70 }), 0, 1.4, 0);
  addBox(g, 2.2, 1.0, 1.6, new THREE.MeshPhongMaterial({ color: 0x101826, shininess: 140 }), 0, 1.6, 2.0);
  addBox(g, 0.7, 0.7, 4.4, new THREE.MeshPhongMaterial({ color: 0xff5e3d }), 0, 1.7, -4.2);
  addBox(g, 0.2, 1.6, 1.2, lam(0xff5e3d), 0, 2.4, -6.2);
  const rotor = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(11, 0.08, 0.5), lam(0x1c1c22));
    blade.rotation.y = (i * Math.PI) / 2;
    rotor.add(blade);
  }
  rotor.position.y = 2.6;
  g.add(rotor);
  for (const s of [-1, 1]) {
    addBox(g, 0.15, 0.15, 4.4, lam(0x1c1c22), s * 1.1, 0.15, 0);
  }
  g.userData = { type: 'heli', rotor };
  return g;
}

// --- Working headlights: a real SpotLight + visible beam cone + glow discs
// for the player's car (attached lazily when the player enters a car).
export function attachHeadlight(v) {
  if (v.headlight) return v.headlight;
  const g = v.group;
  const def = v.def;
  const L = def.len;
  const H = def.h;
  const spot = new THREE.SpotLight(0xffeebb, 800, 55, 0.46, 0.55, 1.2);
  spot.position.set(0, H * 0.5, L / 2);
  const target = new THREE.Object3D();
  target.position.set(0, 0, L / 2 + 26);
  g.add(target);
  spot.target = target;
  g.add(spot);
  // Visible beam cone (wide end forward, apex at the car).
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(2.4, 15, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffeebb, transparent: true, opacity: 0.17, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  cone.rotation.x = -Math.PI / 2;
  cone.position.set(0, H * 0.45, L / 2 + 7.5);
  g.add(cone);
  // Glow discs on the headlight bar.
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8, transparent: true, opacity: 1.0, blending: THREE.AdditiveBlending, depthWrite: false });
  const glowGeo = new THREE.CircleGeometry(0.5, 12);
  const glows = [];
  for (const gx of [-0.6, 0.6]) {
    const disc = new THREE.Mesh(glowGeo, glowMat);
    disc.position.set(gx, H * 0.38, L / 2 + 0.06);
    g.add(disc);
    glows.push(disc);
  }
  v.headlight = { spot, cone, glows };
  return v.headlight;
}

export function setHeadlightVisible(v, on) {
  if (!v || !v.headlight) return;
  v.headlight.spot.visible = on;
  v.headlight.cone.visible = on;
  for (const d of v.headlight.glows) d.visible = on;
}

// --- Player vehicle physics (arcade drift) ---
export function makeVehicle(kind, typeName, x, z, heading = 0) {
  const group = kind === 'boat' ? makeBoatMesh() : kind === 'heli' ? makeHeliMesh() : makeCarMesh(typeName);
  const def = kind === 'car' ? CAR_TYPES[typeName] : { top: kind === 'boat' ? 30 : 26, accel: 12 };
  const v = {
    kind, type: typeName, group, def,
    pos: { x, z }, y: 0, heading, speed: 0, steer: 0,
    slide: 0, health: 100, light: null, rotor: null,
    occupied: false,
  };
  if (kind === 'heli') v.rotor = group.userData.rotor;
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  return v;
}

function driveCar(v, input, dt) {
  const def = v.def;
  const fwd = input.forward ? 1 : input.back ? -0.6 : 0;
  const target = fwd * def.top;
  const accel = fwd !== 0 ? def.accel : 10;
  v.speed += clamp(target - v.speed, -accel * dt, accel * dt);
  const drift = input.handbrake ? 1.9 : 1.0;
  const steerAmt = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const steerSpeed = 2.1 * clamp(Math.abs(v.speed) / 12, 0.25, 1) * drift;
  v.heading += steerAmt * steerSpeed * dt * (v.speed >= 0 ? 1 : -1);
  // Lateral slide for drift feel.
  v.slide = angleLerp(v.slide, input.handbrake && Math.abs(v.speed) > 8 ? steerAmt * 0.35 : 0, dt * 4);
  const hx = Math.sin(v.heading);
  const hz = Math.cos(v.heading);
  const sx = Math.cos(v.heading);
  const sz = -Math.sin(v.heading);
  const nx = v.pos.x + (hx * v.speed + sx * v.slide * Math.abs(v.speed) * 0.4) * dt;
  const nz = v.pos.z + (hz * v.speed + sz * v.slide * Math.abs(v.speed) * 0.4) * dt;
  const onDeck = Math.abs(nx) < 60 && WORLD.bridgeZ.some((bz) => Math.abs(nz - bz) < 8);
  // Solid buildings: a car stops at the wall instead of driving through.
  if ((isLand(nx, nz) || onDeck) && !hitsBuilding(nx, nz, 1.6)) {
    v.pos.x = nx;
    v.pos.z = nz;
  } else {
    v.speed *= 0.4; // hit the water edge / wall
  }
  v.group.position.set(v.pos.x, 0, v.pos.z);
  v.group.rotation.y = v.heading;
  v.group.rotation.z = -v.slide * 0.12;
  v.group.rotation.x = clamp(-(v.speed - (v._prevSpeed || 0)) * 0.004, -0.05, 0.05);
  v._prevSpeed = v.speed;
  // Brake lights flare hard when reversing or handbraking: brighter bar
  // plus full-strength red glow discs.
  const tl = v.group.userData.tl;
  const tlGlows = v.group.userData.tlGlows || [];
  if (tl) {
    const braking = input.back || input.handbrake;
    tl.material.color.setHex(braking ? 0xff9999 : 0xff2a2a);
    for (const d of tlGlows) {
      d.material.opacity = braking ? 1.0 : 0.7;
      d.material.color.setHex(braking ? 0xff8888 : 0xff2a2a);
    }
  }
}

function driveBoat(v, input, dt) {
  const def = v.def;
  const fwd = input.forward ? 1 : input.back ? -0.5 : 0;
  v.speed += clamp(fwd * def.top - v.speed, -8 * dt, 8 * dt);
  const steerAmt = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  v.heading += steerAmt * 1.6 * dt * clamp(Math.abs(v.speed) / 10, 0.2, 1);
  const nx = v.pos.x + Math.sin(v.heading) * v.speed * dt;
  const nz = v.pos.z + Math.cos(v.heading) * v.speed * dt;
  if (isWater(nx, nz)) {
    v.pos.x = nx;
    v.pos.z = nz;
  } else {
    v.speed *= 0.5;
  }
  v.y = -0.4 + Math.sin(S.time * 2.2 + v.pos.x * 0.1) * 0.12;
  v.group.position.set(v.pos.x, v.y, v.pos.z);
  v.group.rotation.y = v.heading;
  v.group.rotation.z = -steerAmt * 0.08;
}

function driveHeli(v, input, dt) {
  const def = v.def;
  const lift = (input.up ? 1 : 0) - (input.down ? 1 : 0);
  v.vy = v.vy || 0;
  v.vy += clamp(lift * 14 - v.vy, -16 * dt, 16 * dt);
  v.vy = clamp(v.vy, -10, 12);
  v.y = clamp((v.y || 0) + v.vy * dt, 0, 130);
  const fwd = input.forward ? 1 : input.back ? -0.6 : 0;
  v.speed += clamp(fwd * def.top - v.speed, -10 * dt, 10 * dt);
  const steerAmt = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  v.heading += steerAmt * 1.8 * dt;
  const nx = v.pos.x + Math.sin(v.heading) * v.speed * dt;
  const nz = v.pos.z + Math.cos(v.heading) * v.speed * dt;
  v.pos.x = clamp(nx, -280, 280);
  v.pos.z = clamp(nz, -240, 240);
  if (v.rotor) v.rotor.rotation.y += dt * 22;
  v.group.position.set(v.pos.x, v.y, v.pos.z);
  v.group.rotation.y = v.heading;
  v.group.rotation.x = clamp(-v.speed * 0.008, -0.2, 0.2);
  v.group.rotation.z = -steerAmt * 0.1;
}

export function driveVehicle(v, input, dt) {
  if (v.kind === 'car') driveCar(v, input, dt);
  else if (v.kind === 'boat') driveBoat(v, input, dt);
  else if (v.kind === 'heli') driveHeli(v, input, dt);
}

// --- Traffic: cars that follow the road grid and obey lights ---
const TRAFFIC_TYPES = ['sedan', 'sedan', 'taxi', 'convertible', 'suv', 'pickup', 'muscle', 'sedan', 'supercar'];

class TrafficCar {
  constructor(scene) {
    const type = pick(rng, TRAFFIC_TYPES);
    this.mesh = makeCarMesh(type);
    this.type = type;
    // Random road: avenue or street.
    if (rng() < 0.5) {
      this.axis = 'z';
      const avs = [...WORLD.avenuesWest, ...WORLD.avenuesEast];
      this.road = pick(rng, avs);
      this.s = -168 + rng() * 336;
    } else {
      this.axis = 'x';
      this.road = pick(rng, WORLD.streets);
      const bridge = WORLD.bridgeZ.includes(this.road);
      this.s = bridge ? -196 + rng() * 392 : (rng() < 0.5 ? -196 + rng() * 140 : 56 + rng() * 140);
    }
    this.dir = rng() < 0.5 ? 1 : -1;
    this.speed = 0;
    this.cruise = 8 + rng() * 5;
    scene.add(this.mesh);
  }

  range() {
    if (this.axis === 'x') {
      const bridge = WORLD.bridgeZ.includes(this.road);
      return bridge ? [-196, 196] : (this.s < 0 ? [-196, -56] : [56, 196]);
    }
    return [-168, 168];
  }

  pos() {
    return this.axis === 'x' ? { x: this.s, z: this.road } : { x: this.road, z: this.s };
  }

  update(dt) {
    // Traffic-light stop.
    let target = this.cruise;
    const p = this.pos();
    const sig = S.trafficLights.stateForApproach(p.x, p.z, this.axis, this.dir);
    if (sig && (sig.state === 'red' || sig.state === 'yellow') && sig.dist > 0 && sig.dist < 16) {
      target = sig.dist < 2 ? 0 : this.cruise * (sig.dist / 16);
    }
    // Car ahead: slow down.
    for (const o of S.traffic) {
      if (o === this) continue;
      const op = o.pos();
      if (this.axis === 'x' && o.axis === 'x' && Math.abs(op.z - p.z) < 3) {
        const d = (op.x - p.x) * this.dir;
        if (d > 0 && d < 9) target = Math.min(target, 0);
      }
      if (this.axis === 'z' && o.axis === 'z' && Math.abs(op.x - p.x) < 3) {
        const d = (op.z - p.z) * this.dir;
        if (d > 0 && d < 9) target = Math.min(target, 0);
      }
    }
    this.speed += clamp(target - this.speed, -14 * dt, 7 * dt);
    // Brake lights flare while slowing for a light or a car ahead.
    const tl = this.mesh.userData.tl;
    const tlGlows = this.mesh.userData.tlGlows || [];
    const braking = target < this.speed - 1.5;
    if (tl) tl.material.color.setHex(braking ? 0xff9999 : 0xff2a2a);
    for (const d of tlGlows) {
      d.material.opacity = braking ? 1.0 : 0.7;
      d.material.color.setHex(braking ? 0xff8888 : 0xff2a2a);
    }
    this.s += this.dir * this.speed * dt;
    // Turn at an intersection sometimes.
    const cross = this.axis === 'x' ? [...WORLD.avenuesWest, ...WORLD.avenuesEast] : WORLD.streets;
    for (const c of cross) {
      if (Math.abs(this.s - c) < 1.2 && rng() < dt * 0.35) {
        const oldRoad = this.road;
        this.axis = this.axis === 'x' ? 'z' : 'x';
        this.road = c;
        this.s = oldRoad;
        this.dir = rng() < 0.5 ? 1 : -1;
        break;
      }
    }
    const [lo, hi] = this.range();
    if (this.s > hi) { this.s = hi; this.dir = -1; }
    if (this.s < lo) { this.s = lo; this.dir = 1; }
    const np = this.pos();
    this.mesh.position.set(np.x, 0, np.z);
    this.mesh.rotation.y = this.axis === 'x' ? (this.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (this.dir > 0 ? 0 : Math.PI);
  }
}

export function buildTraffic(scene, count = 10) {
  S.traffic = [];
  for (let i = 0; i < count; i++) S.traffic.push(new TrafficCar(scene));
  // One InstancedMesh of warm light pools on the road ahead of each
  // traffic car, so their headlights visibly work too.
  const poolGeo = new THREE.CircleGeometry(2.0, 16);
  const poolMat = new THREE.MeshBasicMaterial({
    color: 0xffeebb, transparent: true, opacity: 0.4,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const pools = new THREE.InstancedMesh(poolGeo, poolMat, count);
  pools.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(pools);
  S._trafficPools = pools;
  return S.traffic;
}

const _poolDummy = new THREE.Object3D();
export function updateTraffic(dt) {
  for (const c of S.traffic) c.update(dt);
  const pools = S._trafficPools;
  if (pools) {
    pools.visible = S.headlightsOn;
    _poolDummy.rotation.order = 'YXZ';
    for (let i = 0; i < S.traffic.length; i++) {
      const c = S.traffic[i];
      const p = c.pos();
      const h = c.axis === 'x' ? (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (c.dir > 0 ? 0 : Math.PI);
      _poolDummy.position.set(p.x + Math.sin(h) * 4.5, 0.06, p.z + Math.cos(h) * 4.5);
      _poolDummy.rotation.set(-Math.PI / 2, h, 0);
      _poolDummy.scale.set(1, 1.8, 1);
      _poolDummy.updateMatrix();
      pools.setMatrixAt(i, _poolDummy.matrix);
    }
    pools.instanceMatrix.needsUpdate = true;
  }
}

export function spawnBoats(scene) {
  S.boats = [];
  // Moored right off the marina shore (4u from the water's edge at x=56)
  // so the player can walk up and board with E — the old spots were 12u
  // out in the bay, out of boarding range, and one sat on dry land.
  const spots = [[52, 128, 0.4], [52, 152, -0.3], [52, 168, 1.2]];
  for (const [x, z, h] of spots) {
    const b = makeVehicle('boat', 'boat', x, z, h);
    b.y = -0.4;
    b.group.position.set(x, -0.4, z);
    scene.add(b.group);
    S.boats.push(b);
  }
  return S.boats;
}

export function spawnHeli(scene) {
  const h = makeVehicle('heli', 'heli', -168, 168, 0.6);
  h.y = 0;
  h.group.position.set(-168, 0, 168);
  scene.add(h.group);
  S.heli = h;
  return h;
}

// Parked cars the player can steal, placed on roads and in lots.
export function spawnParkedCars(scene) {
  const spots = [
    ['supercar', 140, -48, 1.57], ['sedan', 84, 48, 0], ['muscle', -140, -28, 1.57],
    ['convertible', 196, -56, 0], ['suv', -84, 112, -1.57], ['pickup', 140, 112, 1.57],
    ['sedan', 84, -112, 0], ['taxi', -196, 56, 1.57], ['supercar', 196, 112, 0],
    ['sedan', -140, 140, 0], ['muscle', 140, -84, 1.57], ['convertible', 140, 182, 0],
  ];
  const cars = [];
  for (const [type, x, z, h] of spots) {
    const v = makeVehicle('car', type, x, z, h);
    scene.add(v.group);
    cars.push(v);
  }
  S.parkedCars = cars;
  return cars;
}
