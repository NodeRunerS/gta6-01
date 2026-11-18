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
};

const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12);
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x181818 });
const glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2f42, emissive: 0x0a1622 });
const lightMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0xffdf70 });
const tailMat = new THREE.MeshLambertMaterial({ color: 0xaa1a1a, emissive: 0x550000 });

/** Build a car mesh. Returns { group, wheels, length, width }. */
export function createCarMesh(type, opts = {}) {
  const def = CAR_TYPES[type] ?? CAR_TYPES.sedan;
  const color = opts.color ?? pick(mulberry32((type.length * 7919 + (opts.seed ?? 1)) >>> 0), def.color);
  const bodyMat = new THREE.MeshLambertMaterial({ color: opts.police ? 0xf2f2f2 : color });
  const group = new THREE.Group();
  const L = def.length;
  const W = def.width;
  const H = def.height;

  const body = new THREE.Mesh(new THREE.BoxGeometry(L, H * 0.55, W), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(L * 0.48, H * 0.5, W * 0.86),
    type === 'truck' || type === 'van' ? bodyMat : glassMat,
  );
  cabin.position.set(type === 'truck' ? L * 0.28 : -L * 0.06, H * 0.55 + H * 0.25, 0);
  cabin.castShadow = true;
  group.add(cabin);

  if (type === 'sports' || type === 'coupe') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, W * 0.9), bodyMat);
    spoiler.position.set(-L / 2 + 0.15, H * 0.95, 0);
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
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.45), new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xaa0000 }));
    red.position.set(0.18, H * 1.22, 0);
    group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.45), new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x0000aa }));
    blue.position.set(-0.18, H * 1.22, 0);
    group.add(blue);
    group.userData.lightRed = red;
    group.userData.lightBlue = blue;
  }

  // Headlights and taillights.
  for (const s of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.4), lightMat);
    hl.position.set(L / 2 + 0.02, 0.62, s * (W / 2 - 0.35));
    group.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.4), tailMat);
    tl.position.set(-L / 2 - 0.02, 0.62, s * (W / 2 - 0.35));
    group.add(tl);
  }

  const wheels = [];
  for (const [wx, wz] of [[L * 0.32, W / 2], [L * 0.32, -W / 2], [-L * 0.32, W / 2], [-L * 0.32, -W / 2]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx, 0.42, wz);
    wheel.castShadow = true;
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
      car.speed += (target - car.speed) * Math.min(1, dt * 1.5);
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

/** Six stealable parked cars, one of them the beachfront sports car. */
export function spawnParkedCars() {
  const rng = mulberry32(4242);
  const spots = [
    { type: 'sedan', x: -140, z: -59.5, heading: 0 },
    { type: 'taxi', x: 84, z: 59.5, heading: Math.PI },
    { type: 'van', x: -59.5, z: 140, heading: -Math.PI / 2 },
    { type: 'coupe', x: 168, z: -115.5, heading: 0 },
    { type: 'truck', x: -115.5, z: -168, heading: Math.PI / 2 },
    { type: 'sports', x: 28, z: 227.5, heading: 0 }, // beachfront sports car, on the coast road
  ];
  const out = [];
  spots.forEach((s, i) => {
    const car = new Car(s.type, s.x, s.z, s.heading, { parked: true, seed: 100 + i });
    out.push(car);
    S.cars.push(car);
  });
  return out;
}
