// Solmar City — pedestrians: low-poly citizens who stroll the sidewalks,
// turn at intersections, flee from gunfire and speeding cars, and fall when
// hit. Each has its own shirt, skin and walking pace.
import * as THREE from 'three';
import { mulberry32, clamp, randomPick } from './util.js';
import { CITY } from './city.js';

const SHIRTS = [0xe74c3c, 0x3498db, 0xf1c40f, 0x9b59b6, 0x1abc9c, 0xe67e22, 0xecf0f1, 0x2ecc71, 0xfd79a8, 0x00cec9];
const PANTS = [0x2c3e50, 0x34495e, 0x7f8c8d, 0x5d4037, 0x1a1a2e];
const SKINS = [0xf1c27d, 0xe0ac69, 0x8d5524, 0xffdbac, 0xc68642];

export function makePersonMesh(shirt, pants, skin) {
  const group = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirtMat);
  torso.position.y = 1.12;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), skinMat);
  head.position.y = 1.68;
  head.castShadow = true;
  group.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshLambertMaterial({ color: 0x2b2118 }));
  hair.position.y = 1.72;
  group.add(hair);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.24), pantsMat);
  legL.position.set(-0.16, 0.36, 0);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.16;
  group.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.18), shirtMat);
  armL.position.set(-0.4, 1.1, 0);
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.4;
  group.add(armR);
  group.userData = { legL, legR, armL, armR, torso, head };
  return group;
}

export class PedestrianManager {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.rng = mulberry32(4242);
    this.peds = [];
    for (let i = 0; i < 16; i++) this.spawnPed(true);
  }

  sidewalkPoint() {
    // A point on a sidewalk: just off a road centreline.
    const road = -CITY.half + Math.floor(this.rng() * (CITY.blocks + 1)) * CITY.pitch;
    const along = (this.rng() - 0.5) * CITY.half * 1.7;
    const side = (this.rng() < 0.5 ? -1 : 1) * (CITY.roadHalf + 1.6);
    if (this.rng() < 0.5) return { x: along, z: road + side, axis: 'x', dir: this.rng() < 0.5 ? 1 : -1 };
    return { x: road + side, z: along, axis: 'z', dir: this.rng() < 0.5 ? 1 : -1 };
  }

  spawnPed(anywhere) {
    const mesh = makePersonMesh(randomPick(this.rng, SHIRTS), randomPick(this.rng, PANTS), randomPick(this.rng, SKINS));
    this.scene.add(mesh);
    const p = this.sidewalkPoint();
    const ped = {
      mesh, x: p.x, z: p.z, axis: p.axis, dir: p.dir,
      speed: 1.1 + this.rng() * 0.7,
      state: 'walk', stateTime: 0,
      walkPhase: this.rng() * 10,
      fleeX: 0, fleeZ: 0,
    };
    mesh.position.set(p.x, 0, p.z);
    this.peds.push(ped);
    return ped;
  }

  // Everyone within `radius` of (x, z) runs away from it.
  scare(x, z, radius) {
    for (const ped of this.peds) {
      if (ped.state === 'down') continue;
      const dx = ped.x - x;
      const dz = ped.z - z;
      if (dx * dx + dz * dz < radius * radius) {
        ped.state = 'flee';
        ped.stateTime = 3;
        ped.fleeX = dx;
        ped.fleeZ = dz;
      }
    }
  }

  // Returns the pedestrian hit by a car-sized circle, if any.
  checkCarHit(x, z, radius) {
    for (const ped of this.peds) {
      if (ped.state === 'down') continue;
      const dx = ped.x - x;
      const dz = ped.z - z;
      if (dx * dx + dz * dz < radius * radius) return ped;
    }
    return null;
  }

  knockDown(ped) {
    ped.state = 'down';
    ped.stateTime = 6;
    ped.mesh.rotation.x = -Math.PI / 2;
    ped.mesh.position.y = 0.35;
  }

  update(dt, playerPos, playerSpeed) {
    for (const ped of this.peds) {
      ped.stateTime -= dt;
      if (ped.state === 'down') {
        if (ped.stateTime <= 0) {
          // Get up somewhere else and walk on.
          const p = this.sidewalkPoint();
          ped.x = p.x; ped.z = p.z; ped.axis = p.axis; ped.dir = p.dir;
          ped.state = 'walk';
          ped.mesh.rotation.x = 0;
          ped.mesh.position.y = 0;
        }
        continue;
      }
      if (ped.state === 'flee') {
        const len = Math.hypot(ped.fleeX, ped.fleeZ) || 1;
        ped.x += (ped.fleeX / len) * 4.2 * dt;
        ped.z += (ped.fleeZ / len) * 4.2 * dt;
        ped.x = clamp(ped.x, -CITY.half - 12, CITY.half + 12);
        ped.z = clamp(ped.z, -CITY.half - 12, 190);
        ped.mesh.rotation.y = Math.atan2(ped.fleeX, ped.fleeZ);
        if (ped.stateTime <= 0) ped.state = 'walk';
      } else {
        // Walk the sidewalk grid; turn at intersections sometimes.
        const step = ped.speed * dt;
        if (ped.axis === 'x') ped.x += ped.dir * step;
        else ped.z += ped.dir * step;
        const along = ped.axis === 'x' ? ped.x : ped.z;
        const nearCross = Math.abs(((along + CITY.half) % CITY.pitch + CITY.pitch) % CITY.pitch) < 0.6;
        if (nearCross && this.rng() < 0.02) {
          ped.axis = ped.axis === 'x' ? 'z' : 'x';
          ped.dir = this.rng() < 0.5 ? 1 : -1;
        }
        if (along > CITY.half + 12 || along < -CITY.half - 12) ped.dir *= -1;
        ped.mesh.rotation.y = ped.axis === 'x' ? (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (ped.dir > 0 ? 0 : Math.PI);
        // Flee a fast car that is close.
        if (playerPos && playerSpeed > 8) {
          const dx = ped.x - playerPos.x;
          const dz = ped.z - playerPos.z;
          if (dx * dx + dz * dz < 49) {
            ped.state = 'flee';
            ped.stateTime = 2.5;
            ped.fleeX = dx;
            ped.fleeZ = dz;
          }
        }
      }
      // Walk-cycle swing.
      ped.walkPhase += dt * (ped.state === 'flee' ? 11 : 6.5);
      const swing = Math.sin(ped.walkPhase) * (ped.state === 'flee' ? 0.85 : 0.55);
      const u = ped.mesh.userData;
      u.legL.rotation.x = swing;
      u.legR.rotation.x = -swing;
      u.armL.rotation.x = -swing * 0.8;
      u.armR.rotation.x = swing * 0.8;
      ped.mesh.position.set(ped.x, ped.mesh.position.y, ped.z);
    }
  }
}
