// Solmar City — vehicles: low-poly car models in several kinds (sedan, taxi,
// sport, truck, van, police), the traffic system that drives them along the
// road grid, parked cars to steal, and the player's arcade driving physics
// with skid marks, dust puffs and headlights.
import * as THREE from 'three';
import { mulberry32, clamp, randomPick } from './util.js';
import { CITY } from './city.js';

const CAR_COLORS = [0xc0392b, 0x2e6fb0, 0xe8e4da, 0x2c2c34, 0xd98a2b, 0x7a9a5b, 0x8e44ad, 0x4fa8a0, 0xb03a5b, 0xd8d3c3];
const GLASS_MAT = new THREE.MeshLambertMaterial({ color: 0x1c2733 });
const TIRE_MAT = new THREE.MeshLambertMaterial({ color: 0x161616 });
const TRIM_MAT = new THREE.MeshLambertMaterial({ color: 0x222226 });
const LIGHT_MAT = new THREE.MeshLambertMaterial({ color: 0xfff6c9, emissive: 0xffedb0, emissiveIntensity: 0.9 });
const TAIL_MAT = new THREE.MeshLambertMaterial({ color: 0xc02020, emissive: 0x800000, emissiveIntensity: 0.6 });

export function makeCarMesh(color, kind) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const isTruck = kind === 'truck';
  const isSport = kind === 'sport';
  const bodyLen = isTruck ? 5.2 : 4.2;
  const bodyH = isSport ? 0.45 : 0.58;
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, bodyH, bodyLen), bodyMat);
  body.position.y = 0.62;
  body.castShadow = true;
  group.add(body);
  if (isTruck) {
    const cargo = new THREE.Mesh(new THREE.BoxGeometry(1.85, 1.1, 2.6), new THREE.MeshLambertMaterial({ color: 0xd8d3c3 }));
    cargo.position.set(0, 1.35, -1.1);
    cargo.castShadow = true;
    group.add(cargo);
  }
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.5, isTruck ? 1.4 : 2.0), GLASS_MAT);
  cabin.position.set(0, 1.12, isTruck ? 1.1 : -0.25);
  cabin.castShadow = true;
  group.add(cabin);
  if (isSport) {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.35), TRIM_MAT);
    spoiler.position.set(0, 1.05, -bodyLen / 2 + 0.25);
    group.add(spoiler);
  }
  if (kind === 'taxi') {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.16, 1.2), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    stripe.position.set(0, 0.72, 0.4);
    group.add(stripe);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.5), new THREE.MeshLambertMaterial({ color: 0xf7c948, emissive: 0xa88200, emissiveIntensity: 0.5 }));
    sign.position.set(0, 1.5, -0.2);
    group.add(sign);
  }
  if (kind === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.4), TRIM_MAT);
    bar.position.set(0, 1.42, -0.25);
    group.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.42), new THREE.MeshLambertMaterial({ color: 0xff2020, emissive: 0xff0000, emissiveIntensity: 1.4 }));
    red.position.set(-0.28, 1.44, -0.25);
    group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.42), new THREE.MeshLambertMaterial({ color: 0x2040ff, emissive: 0x0020ff, emissiveIntensity: 1.4 }));
    blue.position.set(0.28, 1.44, -0.25);
    group.add(blue);
    group.userData.lightBar = { red, blue };
  }
  // Headlights and taillights.
  for (const sx of [-0.62, 0.62]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), LIGHT_MAT);
    head.position.set(sx, 0.62, bodyLen / 2 + 0.01);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), TAIL_MAT);
    tail.position.set(sx, 0.62, -bodyLen / 2 - 0.01);
    group.add(tail);
  }
  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  const wheels = [];
  for (const [wx, wz] of [[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]]) {
    const wheel = new THREE.Mesh(wheelGeo, TIRE_MAT);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }
  group.userData.wheels = wheels;
  group.userData.bodyLen = bodyLen;
  return group;
}

// A short-lived dust puff / smoke sprite used for skids, crashes and exhaust.
export class DustPool {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    this.geo = new THREE.SphereGeometry(0.5, 8, 6);
    this.mat = new THREE.MeshLambertMaterial({ color: 0xcfc4a8, transparent: true, opacity: 0.55 });
    this.smokeMat = new THREE.MeshLambertMaterial({ color: 0x555555, transparent: true, opacity: 0.5 });
  }

  spawn(x, y, z, smoke) {
    let puff = this.pool.find((p) => !p.active);
    if (!puff) {
      if (this.pool.length >= 40) return;
      puff = { mesh: new THREE.Mesh(this.geo, this.mat.clone()), active: false, life: 0 };
      this.scene.add(puff.mesh);
      this.pool.push(puff);
    }
    puff.mesh.material = smoke ? this.smokeMat : this.mat;
    puff.mesh.position.set(x, y, z);
    puff.mesh.scale.setScalar(0.5 + Math.random() * 0.6);
    puff.active = true;
    puff.life = 0.7;
  }

  update(dt) {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dt;
      p.mesh.position.y += dt * 0.8;
      p.mesh.scale.multiplyScalar(1 + dt * 1.6);
      p.mesh.material.opacity = Math.max(0, p.life / 0.7) * 0.5;
      if (p.life <= 0) {
        p.active = false;
        p.mesh.visible = false;
      } else {
        p.mesh.visible = true;
      }
    }
  }
}

// Dark skid-mark quads left on the asphalt while drifting or braking hard.
export class SkidMarks {
  constructor(scene) {
    this.scene = scene;
    this.marks = [];
    this.geo = new THREE.PlaneGeometry(0.3, 1.4);
    this.mat = new THREE.MeshBasicMaterial({ color: 0x141414, transparent: true, opacity: 0.5 });
  }

  add(x, z, heading) {
    if (this.marks.length >= 120) {
      const old = this.marks.shift();
      this.scene.remove(old);
    }
    const mark = new THREE.Mesh(this.geo, this.mat);
    mark.rotation.x = -Math.PI / 2;
    mark.rotation.z = -heading;
    mark.position.set(x, 0.06, z);
    this.scene.add(mark);
    this.marks.push(mark);
  }
}

// A drivable car: arcade physics, building and traffic collisions, damage.
export class DriveCar {
  constructor(mesh, x, z, heading) {
    this.mesh = mesh;
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = heading || 0;
    this.speed = 0;
    this.steer = 0;
    this.health = 100;
    this.maxSpeed = 32;
    this.isPlayer = false;
  }

  get forward() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }

  update(dt, input, city, traffic, dust, skids, onCrash) {
    const fwd = this.forward;
    const accel = input.forward ? 16 : 0;
    const brake = input.back ? 26 : 0;
    if (input.forward) this.speed += accel * dt;
    if (input.back) this.speed -= (this.speed > 0.5 ? brake : 10) * dt;
    if (!input.forward && !input.back) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 9 * dt);
    this.speed = clamp(this.speed, -9, this.maxSpeed);
    const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    this.steer += (steerTarget * 0.55 - this.steer) * Math.min(1, dt * 8);
    if (Math.abs(this.speed) > 0.3) {
      this.heading += (this.speed / 2.9) * Math.tan(this.steer) * dt;
    }
    const before = { x: this.pos.x, z: this.pos.z };
    // Move one axis at a time so the car slides along building walls
    // instead of stopping dead when it clips a corner.
    this.pos.x += fwd.x * this.speed * dt;
    this.pos.x = clamp(this.pos.x, -CITY.half - 20, CITY.half + 20);
    let hitWall = city.resolveCollision(this.pos, 1.6);
    this.pos.z += fwd.z * this.speed * dt;
    this.pos.z = clamp(this.pos.z, -CITY.half - 20, 196);
    hitWall = city.resolveCollision(this.pos, 1.6) || hitWall;
    if (hitWall) {
      const impact = Math.abs(this.speed);
      if (impact > 6 && onCrash) onCrash(impact);
      // A hard head-on hit bounces the car back; a graze just scrubs speed
      // so the car keeps sliding along the wall.
      this.speed *= impact > 15 ? -0.25 : 0.6;
      this.health -= impact * 0.9;
    }
    // Traffic collisions: push apart, lose speed, take damage.
    for (const t of traffic.cars) {
      const dx = this.pos.x - t.pos.x;
      const dz = this.pos.z - t.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 9 && d2 > 0.001) {
        const d = Math.sqrt(d2);
        const push = (3 - d) / 2;
        this.pos.x += (dx / d) * push;
        this.pos.z += (dz / d) * push;
        t.pos.x -= (dx / d) * push;
        t.pos.z -= (dz / d) * push;
        const impact = Math.abs(this.speed);
        if (impact > 5 && onCrash) onCrash(impact);
        this.speed *= 0.45;
        this.health -= impact * 0.5;
        t.speed *= 0.5;
      }
    }
    // Skid marks and dust when drifting or braking hard.
    const drifting = Math.abs(this.steer) > 0.35 && Math.abs(this.speed) > 12;
    if (drifting && skids) {
      const bx = this.pos.x - fwd.x * 1.4;
      const bz = this.pos.z - fwd.z * 1.4;
      skids.add(bx - fwd.z * 0.8, bz + fwd.x * 0.8, this.heading);
      skids.add(bx + fwd.z * 0.8, bz - fwd.x * 0.8, this.heading);
      if (dust && Math.random() < 0.5) dust.spawn(bx, 0.3, bz, false);
    }
    if (this.health < 45 && dust && Math.random() < 0.3) {
      dust.spawn(this.pos.x, 1.2, this.pos.z - fwd.z * 1.5, true);
    }
    // Write transform.
    this.mesh.position.set(this.pos.x, 0, this.pos.z);
    this.mesh.rotation.y = this.heading;
    const spin = (this.speed * dt) / 0.36;
    for (const w of this.mesh.userData.wheels) w.rotation.x += spin;
    if (this.mesh.userData.wheels.length >= 2) {
      this.mesh.userData.wheels[0].rotation.y = this.steer * 0.7;
      this.mesh.userData.wheels[1].rotation.y = this.steer * 0.7;
    }
    return { moved: Math.hypot(this.pos.x - before.x, this.pos.z - before.z), drifting };
  }
}

// Traffic: cars that cruise the road grid, turn at intersections and stop
// for the car ahead. Parked cars sit at the kerb, waiting to be stolen.
export class TrafficManager {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.rng = mulberry32(777);
    this.cars = [];
    this.parked = [];
    const kinds = ['sedan', 'sedan', 'taxi', 'sport', 'truck', 'van', 'sedan', 'taxi'];
    for (let i = 0; i < 14; i++) {
      const kind = kinds[i % kinds.length];
      const color = kind === 'taxi' ? 0xf7c948 : randomPick(this.rng, CAR_COLORS);
      const mesh = makeCarMesh(color, kind);
      scene.add(mesh);
      const axis = this.rng() < 0.5 ? 'x' : 'z';
      const road = -CITY.half + Math.floor(this.rng() * (CITY.blocks + 1)) * CITY.pitch;
      const lane = (this.rng() < 0.5 ? -1 : 1) * 2.2;
      const car = {
        mesh, kind, axis, road, lane,
        pos: new THREE.Vector3(axis === 'x' ? (this.rng() - 0.5) * 260 : road + lane, 0, axis === 'z' ? (this.rng() - 0.5) * 260 : road + lane),
        dir: this.rng() < 0.5 ? 1 : -1,
        speed: 7 + this.rng() * 5,
        cruise: 7 + this.rng() * 5,
        heading: 0,
        stopped: 0,
      };
      car.heading = axis === 'x' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
      this.cars.push(car);
    }
    // Parked cars at kerbs, engines off, doors unlocked.
    const spots = [
      { x: 24, z: -30, h: 0 }, { x: -60, z: 42, h: Math.PI / 2 }, { x: 96, z: 6, h: Math.PI },
      { x: -18, z: -66, h: -Math.PI / 2 }, { x: 54, z: 114, h: 0 }, { x: -102, z: -18, h: Math.PI / 2 },
    ];
    for (const s of spots) {
      const mesh = makeCarMesh(randomPick(this.rng, CAR_COLORS), 'sedan');
      mesh.position.set(s.x, 0, s.z);
      mesh.rotation.y = s.h;
      scene.add(mesh);
      this.parked.push({ mesh, pos: new THREE.Vector3(s.x, 0, s.z), heading: s.h, taken: false });
    }
  }

  update(dt, playerCar) {
    for (const car of this.cars) {
      // Slow down for the car ahead on the same lane.
      let targetSpeed = car.cruise;
      for (const other of this.cars) {
        if (other === car || other.axis !== car.axis || Math.abs(other.road - car.road) > 1) continue;
        const along = car.axis === 'x' ? other.pos.x - car.pos.x : other.pos.z - car.pos.z;
        if (along * car.dir > 0 && along * car.dir < 8) targetSpeed = 0;
      }
      if (playerCar) {
        const dx = playerCar.pos.x - car.pos.x;
        const dz = playerCar.pos.z - car.pos.z;
        if (dx * dx + dz * dz < 36) targetSpeed = Math.min(targetSpeed, 2);
      }
      car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 2);
      if (car.axis === 'x') car.pos.x += car.dir * car.speed * dt;
      else car.pos.z += car.dir * car.speed * dt;
      // Turn at an intersection sometimes, or wrap around the city edge.
      const along = car.axis === 'x' ? car.pos.x : car.pos.z;
      const nearCross = Math.abs(((along + CITY.half) % CITY.pitch + CITY.pitch) % CITY.pitch) < 1.2;
      if (nearCross && this.rng() < 0.012) {
        const cross = Math.round((along + CITY.half) / CITY.pitch) * CITY.pitch - CITY.half;
        if (car.axis === 'x') {
          car.axis = 'z';
          car.road = cross;
          car.pos.x = car.road + car.lane;
          car.dir = this.rng() < 0.5 ? 1 : -1;
          car.heading = car.dir > 0 ? 0 : Math.PI;
        } else {
          car.axis = 'x';
          car.road = cross;
          car.pos.z = car.road + car.lane;
          car.dir = this.rng() < 0.5 ? 1 : -1;
          car.heading = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        }
      }
      const limit = CITY.half + 16;
      if (car.axis === 'x' && Math.abs(car.pos.x) > limit) car.pos.x = -Math.sign(car.pos.x) * limit;
      if (car.axis === 'z' && Math.abs(car.pos.z) > limit) car.pos.z = -Math.sign(car.pos.z) * limit;
      car.mesh.position.copy(car.pos);
      car.mesh.rotation.y = car.heading;
      const spin = (car.speed * dt) / 0.36;
      for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
    }
  }

  nearestCar(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of this.cars) {
      const d = Math.hypot(car.pos.x - x, car.pos.z - z);
      if (d < bestD) { bestD = d; best = { kind: 'traffic', ref: car }; }
    }
    for (const car of this.parked) {
      if (car.taken) continue;
      const d = Math.hypot(car.pos.x - x, car.pos.z - z);
      if (d < bestD) { bestD = d; best = { kind: 'parked', ref: car }; }
    }
    return best;
  }
}
