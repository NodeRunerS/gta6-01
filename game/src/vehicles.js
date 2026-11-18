// Cars: box-built vehicle meshes by type, arcade driving physics, traffic that
// follows the road grid, and the stealable parked cars.
import * as THREE from '../vendor/three.module.min.js';
import { S } from './state.js';
import { CITY } from './city.js';
import { angleToward, clamp, mulberry32, pick, rand, randInt } from './util.js';

export const CAR_TYPES = {
  sedan: { length: 4.6, width: 1.9, height: 1.35, maxSpeed: 30, accel: 15, color: [0x5a6b7d, 0x8a2f2f, 0x3f5a3a, 0x707070] },
  taxi: { length: 4.6, width: 1.9, height: 1.4, maxSpeed: 30, accel: 15, color: [0xf2c230] },
  truck: { length: 6.4, width: 2.2, height: 2.1, maxSpeed: 22, accel: 10, color: [0xd8d8d8, 0x9a3a2a, 0x3a6ea8] },
  sports: { length: 4.4, width: 2.0, height: 1.0, maxSpeed: 38, accel: 19, color: [0xc22a1a, 0xe86a10, 0x1a1a1a] },
  van: { length: 5.2, width: 2.1, height: 2.0, maxSpeed: 26, accel: 12, color: [0xe8e8e8, 0x4a6a8a, 0x8a8a7a] },
  coupe: { length: 4.3, width: 1.9, height: 1.15, maxSpeed: 34, accel: 17, color: [0x5a2a7a, 0x1a5a4a, 0x7a1a2a] },
  muscle: { length: 4.8, width: 2.0, height: 1.3, maxSpeed: 36, accel: 18, color: [0x8a1a1a, 0x1a1a1a, 0x2a4a7a] },
  convertible: { length: 4.4, width: 1.95, height: 1.05, maxSpeed: 35, accel: 18, color: [0xe86a10, 0xf2e6c8, 0x2a7a8a] },
  suv: { length: 5.0, width: 2.1, height: 1.9, maxSpeed: 28, accel: 13, color: [0x3a3a3a, 0x5a6b7d, 0x7a2a2a] },
  pickup: { length: 5.4, width: 2.1, height: 1.7, maxSpeed: 28, accel: 13, color: [0x4a6a3a, 0x8a2f2f, 0xd8d8d8] },
};

const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12);
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x181818 });
const glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2f42, emissive: 0x0a1622 });
const lightMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0xffdf70 });
const tailMat = new THREE.MeshLambertMaterial({ color: 0xaa1a1a, emissive: 0x550000 });
const darkTrimMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
const seatMat = new THREE.MeshLambertMaterial({ color: 0x3a2a22 });

// Spoked-rim texture for the wheel caps (one shared 64x64 canvas).
const rimMat = (() => {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#1c1c1c';
  x.fillRect(0, 0, 64, 64);
  x.translate(32, 32);
  x.strokeStyle = '#c8c8c8';
  x.lineWidth = 6;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    x.beginPath();
    x.moveTo(0, 0);
    x.lineTo(Math.cos(a) * 28, Math.sin(a) * 28);
    x.stroke();
  }
  x.fillStyle = '#8a8a8a';
  x.beginPath();
  x.arc(0, 0, 8, 0, Math.PI * 2);
  x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide });
})();
const rimGeo = new THREE.CircleGeometry(0.27, 12);

// Side-profile silhouettes (x: -L/2 rear .. L/2 front, y: height). The body
// is an extrusion of the profile across the car's width — shaped, not a box.
function profileFor(type, L) {
  switch (type) {
    case 'sports':
      return [[-L / 2, 0.24], [L / 2, 0.24], [L / 2, 0.44], [L * 0.25, 0.55], [L * 0.05, 0.58], [-L * 0.3, 0.58], [-L / 2, 0.52]];
    case 'coupe':
      return [[-L / 2, 0.26], [L / 2, 0.26], [L / 2, 0.48], [L * 0.28, 0.6], [L * 0.02, 0.63], [-L * 0.3, 0.63], [-L / 2, 0.55]];
    case 'muscle':
      return [[-L / 2, 0.3], [L / 2, 0.3], [L / 2, 0.55], [L * 0.35, 0.72], [L * 0.1, 0.78], [-L * 0.2, 0.78], [-L * 0.42, 0.6], [-L / 2, 0.52]];
    case 'convertible':
      return [[-L / 2, 0.24], [L / 2, 0.24], [L / 2, 0.46], [L * 0.28, 0.56], [L * 0.05, 0.58], [-L * 0.3, 0.58], [-L / 2, 0.5]];
    case 'suv':
      return [[-L / 2, 0.35], [L / 2, 0.35], [L / 2, 0.72], [L * 0.3, 0.78], [-L * 0.3, 0.78], [-L / 2, 0.7]];
    case 'pickup':
      return [[-L / 2, 0.35], [L / 2, 0.35], [L / 2, 0.62], [L * 0.3, 0.7], [L * 0.05, 0.72], [-L * 0.05, 0.72], [-L * 0.1, 0.55], [-L / 2, 0.55]];
    case 'van':
      return [[-L / 2, 0.4], [L / 2, 0.4], [L / 2, 0.85], [L * 0.38, 1.05], [-L * 0.38, 1.05], [-L / 2, 0.95]];
    case 'truck':
      return [[-L / 2, 0.45], [L / 2, 0.45], [L / 2, 0.95], [L * 0.3, 1.15], [L * 0.05, 1.18], [-L * 0.05, 1.18], [-L * 0.1, 0.85], [-L / 2, 0.85]];
    default: // sedan, taxi
      return [[-L / 2, 0.28], [L / 2, 0.28], [L / 2, 0.52], [L * 0.3, 0.66], [L * 0.05, 0.7], [-L * 0.28, 0.7], [-L / 2, 0.62]];
  }
}

// Nose-top height per type (drives headlight/grille height).
const NOSE_Y = { sedan: 0.52, taxi: 0.52, truck: 0.95, sports: 0.44, van: 0.85, coupe: 0.48, muscle: 0.55, convertible: 0.46, suv: 0.72, pickup: 0.62 };
// Deck height at the rear (drives spoiler height).
const DECK_Y = { sedan: 0.62, taxi: 0.62, truck: 0.85, sports: 0.52, van: 0.95, coupe: 0.55, muscle: 0.6, convertible: 0.5, suv: 0.7, pickup: 0.55 };

const bodyGeoCache = new Map();
const cabinGeoCache = new Map();

function bodyGeometry(type, L, W) {
  const key = `${type}:${L}:${W}`;
  if (!bodyGeoCache.has(key)) {
    const shape = new THREE.Shape();
    const pts = profileFor(type, L);
    shape.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: W * 0.92, bevelEnabled: false });
    geo.translate(0, 0, -(W * 0.92) / 2);
    bodyGeoCache.set(key, geo);
  }
  return bodyGeoCache.get(key);
}

/** Sloped glass cabin (trapezoid extrusion) for cars that have a roof. */
function cabinGeometry(L, W, H) {
  const key = `${L}:${W}:${H}`;
  if (!cabinGeoCache.has(key)) {
    const CL = L * 0.46;
    const CH = H * 0.42;
    const shape = new THREE.Shape();
    shape.moveTo(-CL / 2, 0);
    shape.lineTo(CL / 2, 0);
    shape.lineTo(CL * 0.3, CH);
    shape.lineTo(-CL * 0.32, CH);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: W * 0.8, bevelEnabled: false });
    geo.translate(0, 0, -(W * 0.8) / 2);
    cabinGeoCache.set(key, geo);
  }
  return cabinGeoCache.get(key);
}

/** Build a car mesh. Returns { group, wheels, length, width }. */
export function createCarMesh(type, opts = {}) {
  const def = CAR_TYPES[type] ?? CAR_TYPES.sedan;
  const color = opts.color ?? pick(mulberry32((type.length * 7919 + (opts.seed ?? 1)) >>> 0), def.color);
  const bodyMat = new THREE.MeshLambertMaterial({ color: opts.police ? 0xf2f2f2 : color });
  const group = new THREE.Group();
  const L = def.length;
  const W = def.width;
  const H = def.height;
  const noseY = NOSE_Y[type] ?? 0.52;
  const deckY = DECK_Y[type] ?? 0.6;

  // Shaped body (extruded side profile) instead of a plain box.
  const body = new THREE.Mesh(bodyGeometry(type, L, W), bodyMat);
  body.position.y = 0.12;
  body.castShadow = true;
  group.add(body);

  // Cabin / glasshouse per body style.
  if (type === 'convertible') {
    // Open top: sloped windshield + two seats, no roof.
    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, W * 0.8), glassMat);
    shield.position.set(L * 0.18, 0.82, 0);
    shield.rotation.z = -0.38;
    group.add(shield);
    for (const s of [-1, 1]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), seatMat);
      seat.position.set(-L * 0.05, 0.78, s * 0.45);
      group.add(seat);
    }
  } else if (type === 'suv' || type === 'van') {
    // Tall body: glass band around the upper half.
    const band = new THREE.Mesh(new THREE.BoxGeometry(L * 0.55, 0.3, W * 0.88), glassMat);
    band.position.set(-L * 0.04, type === 'suv' ? 0.92 : 1.08, 0);
    group.add(band);
    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, W * 0.8), glassMat);
    shield.position.set(L * 0.32, type === 'suv' ? 0.95 : 1.1, 0);
    shield.rotation.z = -0.35;
    group.add(shield);
  } else if (type === 'pickup') {
    // Cab windshield + open bed with side walls and tailgate.
    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, W * 0.8), glassMat);
    shield.position.set(L * 0.26, 0.9, 0);
    shield.rotation.z = -0.35;
    group.add(shield);
    for (const s of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(L * 0.42, 0.32, 0.08), bodyMat);
      wall.position.set(-L * 0.27, 0.72, s * (W / 2 - 0.06));
      group.add(wall);
    }
    const gate = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, W * 0.94), bodyMat);
    gate.position.set(-L / 2 + 0.06, 0.72, 0);
    group.add(gate);
  } else if (type === 'truck') {
    // Box-truck cargo container on the rear deck + windshield.
    const box = new THREE.Mesh(new THREE.BoxGeometry(L * 0.42, 1.0, W * 0.92), bodyMat);
    box.position.set(-L * 0.26, 1.35, 0);
    box.castShadow = true;
    group.add(box);
    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, W * 0.8), glassMat);
    shield.position.set(L * 0.32, 1.28, 0);
    shield.rotation.z = -0.3;
    group.add(shield);
  } else {
    const cabin = new THREE.Mesh(cabinGeometry(L, W, H), glassMat);
    cabin.position.set(-L * 0.06, deckY + 0.02, 0);
    cabin.castShadow = true;
    group.add(cabin);
  }

  // Spoilers.
  if (type === 'sports') {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.07, W * 0.95), bodyMat);
    wing.position.set(-L / 2 + 0.25, deckY + 0.34, 0);
    wing.castShadow = true;
    group.add(wing);
    for (const s of [-1, 1]) {
      const sup = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.08), darkTrimMat);
      sup.position.set(-L / 2 + 0.25, deckY + 0.17, s * W * 0.3);
      group.add(sup);
    }
  } else if (type === 'muscle') {
    const lip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.09, W * 0.9), bodyMat);
    lip.position.set(-L / 2 + 0.12, deckY + 0.05, 0);
    lip.rotation.z = 0.22;
    group.add(lip);
  } else if (type === 'coupe') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, W * 0.9), bodyMat);
    spoiler.position.set(-L / 2 + 0.15, deckY + 0.28, 0);
    group.add(spoiler);
  }
  if (type === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.28, 0.5), lightMat);
    sign.position.set(0, H * 1.15, 0);
    group.add(sign);
  }
  if (opts.police) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(L * 0.9, 0.18, W + 0.04), new THREE.MeshLambertMaterial({ color: 0x1a2a4a }));
    stripe.position.y = 0.62;
    group.add(stripe);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 1.1), new THREE.MeshLambertMaterial({ color: 0x223344 }));
    bar.position.set(0, H * 1.08, 0);
    group.add(bar);
    const redMat = new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 1 });
    const blueMat = new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x0022ff, emissiveIntensity: 1 });
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.45), redMat);
    red.position.set(0.18, H * 1.22, 0);
    group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.45), blueMat);
    blue.position.set(-0.18, H * 1.22, 0);
    group.add(blue);
    group.userData.lightRed = red;
    group.userData.lightBlue = blue;
    group.userData.lightRedMat = redMat;
    group.userData.lightBlueMat = blueMat;
  }

  // Bumpers + grille.
  for (const sx of [1, -1]) {
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, W * 0.96), darkTrimMat);
    bumper.position.set(sx * (L / 2 + 0.03), 0.32, 0);
    group.add(bumper);
  }
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, W * 0.55), darkTrimMat);
  grille.position.set(L / 2 + 0.01, noseY - 0.05, 0);
  group.add(grille);

  // Headlights and taillights (bigger, glowing).
  for (const s of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.5), lightMat);
    hl.position.set(L / 2 + 0.02, noseY - 0.12, s * (W / 2 - 0.35));
    group.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, 0.5), tailMat);
    tl.position.set(-L / 2 - 0.02, noseY - 0.12, s * (W / 2 - 0.35));
    group.add(tl);
  }

  // Wheels with spoked rims (rim disc rides on the outer face and spins).
  const wheels = [];
  for (const [wx, wz] of [[L * 0.32, W / 2], [L * 0.32, -W / 2], [-L * 0.32, W / 2], [-L * 0.32, -W / 2]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx, 0.42, wz);
    wheel.castShadow = true;
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(0, wz > 0 ? 0.16 : -0.16, 0);
    wheel.add(rim);
    group.add(wheel);
    wheels.push(wheel);
  }

  group.userData.def = def;
  return { group, wheels, length: L, width: W };
}

/** One drivable car with arcade physics. Forward is +X when heading is 0. */
export class Car {
  constructor(type, x, z, heading = 0, opts = {}) {
    this.type = type;
    this.def = CAR_TYPES[type] ?? CAR_TYPES.sedan;
    const built = createCarMesh(type, opts);
    this.group = built.group;
    this.wheels = built.wheels;
    this.length = built.length;
    this.width = built.width;
    this.pos = { x, z };
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.police = !!opts.police;
    this.parked = !!opts.parked;
    this.traffic = !!opts.traffic;
    this.radius = this.length / 2;
    this.group.position.set(x, 0, z);
    this.group.rotation.y = -heading;
    S.scene.add(this.group);
  }

  /** Arcade drive: throttle -1..1, steer -1..1, handbrake true/false. */
  drive(dt, throttle, steerInput, handbrake) {
    const def = this.def;
    const targetSteer = steerInput * 0.55;
    this.steer += (targetSteer - this.steer) * Math.min(1, dt * 8);
    if (throttle > 0) this.speed += def.accel * throttle * dt;
    else if (throttle < 0) this.speed += def.accel * 1.4 * throttle * dt; // brake / reverse
    if (handbrake) this.speed *= Math.max(0, 1 - dt * 2.2);
    // Rolling drag and reverse cap.
    this.speed -= this.speed * 0.55 * dt;
    this.speed = clamp(this.speed, -10, def.maxSpeed);
    const steerFactor = clamp(Math.abs(this.speed) / 8, 0, 1) * (this.speed >= 0 ? 1 : -1);
    this.heading += this.steer * steerFactor * dt * (handbrake ? 1.9 : 1.35);
    this.pos.x += Math.cos(this.heading) * this.speed * dt;
    this.pos.z += -Math.sin(this.heading) * this.speed * dt;
    this.syncMesh(dt);
  }

  /** Coast to a stop (used for parked / idle cars). */
  idle(dt) {
    this.speed *= Math.max(0, 1 - dt * 3);
    this.syncMesh(dt);
  }

  syncMesh(dt) {
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.group.rotation.y = -this.heading;
    // Wheel spin and a little body lean.
    const spin = (this.speed * dt) / 0.42;
    for (const w of this.wheels) w.rotation.y += spin;
    this.group.rotation.z = clamp(-this.steer * this.speed * 0.006, -0.06, 0.06);
  }

  dispose() {
    S.scene.remove(this.group);
  }
}

/** Traffic: cars cruising the road grid, turning at intersections. */
export class Traffic {
  constructor(count = 14) {
    this.rng = mulberry32(777);
    this.cars = [];
    const types = Object.keys(CAR_TYPES);
    for (let i = 0; i < count; i++) {
      const type = pick(this.rng, types);
      const car = new Car(type, 0, 0, 0, { traffic: true, seed: i + 3 });
      const axis = this.rng() > 0.5 ? 'x' : 'z';
      const line = pick(this.rng, CITY.LINES);
      const dir = this.rng() > 0.5 ? 1 : -1;
      const along = rand(this.rng, -210, 210);
      const lane = dir > 0 ? 3 : -3;
      if (axis === 'x') {
        car.pos.x = along;
        car.pos.z = line + lane;
        car.heading = dir > 0 ? 0 : Math.PI;
      } else {
        car.pos.x = line + lane;
        car.pos.z = along;
        car.heading = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      }
      car.trafficAxis = axis;
      car.trafficLine = line;
      car.trafficDir = dir;
      car.trafficSpeed = rand(this.rng, 8, 14);
      car.syncMesh(0);
      this.cars.push(car);
      S.cars.push(car);
    }
  }

  update(dt) {
    for (const car of this.cars) {
      // Slow down when the player is right ahead.
      const p = S.player ? S.player.pos : null;
      let target = car.trafficSpeed;
      if (p) {
        const d = Math.hypot(p.x - car.pos.x, p.z - car.pos.z);
        if (d < 12) target = Math.min(target, 4);
      }
      // Stop at a red (or yellow) traffic light ahead; commit if already at the line.
      let braking = false;
      if (S.trafficLights) {
        const light = S.trafficLights.stateForApproach(car.pos.x, car.pos.z, car.trafficAxis, car.trafficDir);
        if (light && (light.state === 'red' || light.state === 'yellow') && light.distToStop > 3 && light.distToStop < 18) {
          target = Math.min(target, Math.max(0, (light.distToStop - 3) * 0.9));
          braking = target < car.speed;
        }
      }
      car.speed += (target - car.speed) * Math.min(1, dt * (braking ? 6 : 1.5));
      const step = car.speed * dt * car.trafficDir;
      if (car.trafficAxis === 'x') car.pos.x += step;
      else car.pos.z += step;
      // At an intersection, sometimes turn onto the crossing road.
      const along = car.trafficAxis === 'x' ? car.pos.x : car.pos.z;
      const nearestLine = CITY.LINES.reduce((best, l) => (Math.abs(l - along) < Math.abs(best - along) ? l : best), CITY.LINES[0]);
      if (Math.abs(along - nearestLine) < 1.2 && !car._turnedAt?.includes(nearestLine)) {
        if (this.rng() < 0.22) {
          const newDir = this.rng() > 0.5 ? 1 : -1;
          const lane = newDir > 0 ? 3 : -3;
          if (car.trafficAxis === 'x') {
            car.trafficAxis = 'z';
            car.trafficLine = nearestLine;
            car.pos.x = nearestLine + lane;
            car.pos.z = along;
            car.heading = newDir > 0 ? -Math.PI / 2 : Math.PI / 2;
          } else {
            car.trafficAxis = 'x';
            car.trafficLine = nearestLine;
            car.pos.z = nearestLine + lane;
            car.pos.x = along;
            car.heading = newDir > 0 ? 0 : Math.PI;
          }
          car.trafficDir = newDir;
        }
        car._turnedAt = [nearestLine];
      }
      // At the city edge, turn around.
      if (along > 222 || along < -222) {
        car.trafficDir *= -1;
        if (car.trafficAxis === 'x') {
          car.heading = car.trafficDir > 0 ? 0 : Math.PI;
          car.pos.z = car.trafficLine + (car.trafficDir > 0 ? 3 : -3);
        } else {
          car.heading = car.trafficDir > 0 ? -Math.PI / 2 : Math.PI / 2;
          car.pos.x = car.trafficLine + (car.trafficDir > 0 ? 3 : -3);
        }
      }
      car.syncMesh(dt);
    }
  }
}

/** Eight stealable parked cars, one of them the beachfront sports car. */
export function spawnParkedCars() {
  const rng = mulberry32(4242);
  const spots = [
    { type: 'sedan', x: -140, z: -59.5, heading: 0 },
    { type: 'taxi', x: 84, z: 59.5, heading: Math.PI },
    { type: 'van', x: -59.5, z: 140, heading: -Math.PI / 2 },
    { type: 'coupe', x: 168, z: -115.5, heading: 0 },
    { type: 'truck', x: -115.5, z: -168, heading: Math.PI / 2 },
    { type: 'sports', x: 28, z: 227.5, heading: 0 }, // beachfront sports car, on the coast road
    { type: 'muscle', x: 59.5, z: -84, heading: Math.PI / 2 },
    { type: 'convertible', x: -168, z: 115.5, heading: 0 },
  ];
  const out = [];
  spots.forEach((s, i) => {
    const car = new Car(s.type, s.x, s.z, s.heading, { parked: true, seed: 100 + i });
    out.push(car);
    S.cars.push(car);
  });
  return out;
}
