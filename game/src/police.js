// Solmar City — the wanted system and the Solmar Police Department.
// Crimes raise the star level; police cruisers spawn on the road grid, chase
// and ram the player, and bust Rex when they corner him on foot. Stay out of
// sight and the heat cools off.
import * as THREE from 'three';
import { clamp, dampAngle } from './util.js';
import { CITY } from './city.js';
import { makeCarMesh } from './vehicles.js';

export class PoliceSystem {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.wanted = 0;
    this.heatTimer = 0;      // seconds since the last crime
    this.decayTimer = 0;     // counts down to losing a star
    this.bustedTimer = 0;    // how long a cruiser has been on top of Rex
    this.cruisers = [];
    this.spawnTimer = 0;
    this.flashPhase = 0;
  }

  addWanted(n, reason) {
    const before = this.wanted;
    this.wanted = clamp(this.wanted + n, 0, 5);
    this.heatTimer = 0;
    this.decayTimer = 14;
    return { before, after: this.wanted, reason };
  }

  setWanted(n) {
    this.wanted = clamp(n, 0, 5);
    this.heatTimer = 0;
    this.decayTimer = 14;
  }

  clearWanted() {
    this.wanted = 0;
    this.bustedTimer = 0;
    this.removeCruisers();
  }

  removeCruisers() {
    for (const c of this.cruisers) this.scene.remove(c.mesh);
    this.cruisers = [];
  }

  wantedCount() {
    return this.wanted;
  }

  _spawnCruiser(playerPos) {
    const mesh = makeCarMesh(0xf2f2f2, 'police');
    // A black-and-white cruiser: dark doors.
    const doorMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.3, 1.6), doorMat);
    door.position.set(0, 0.62, 0.2);
    mesh.add(door);
    this.scene.add(mesh);
    // Spawn on a road 55-85 units away from the player.
    let x = playerPos.x, z = playerPos.z;
    for (let tries = 0; tries < 12; tries++) {
      const road = -CITY.half + Math.floor(Math.random() * (CITY.blocks + 1)) * CITY.pitch;
      const along = (Math.random() - 0.5) * CITY.half * 1.7;
      if (Math.random() < 0.5) { x = along; z = road; } else { x = road; z = along; }
      const d = Math.hypot(x - playerPos.x, z - playerPos.z);
      if (d > 55 && d < 95) break;
    }
    const cruiser = {
      mesh, pos: new THREE.Vector3(x, 0, z),
      heading: Math.atan2(playerPos.x - x, playerPos.z - z),
      speed: 0, health: 100,
    };
    this.cruisers.push(cruiser);
    return cruiser;
  }

  update(dt, player, playerCar, audio) {
    this.heatTimer += dt;
    this.flashPhase += dt * 6;
    // Cool off: lose a star after 14 quiet seconds, faster when hidden.
    if (this.wanted > 0) {
      this.decayTimer -= dt;
      if (this.decayTimer <= 0) {
        this.wanted--;
        this.decayTimer = this.wanted > 0 ? 14 : 0;
      }
    }
    const targetPos = playerCar ? playerCar.pos : player.pos;
    const want = this.wanted > 0 ? Math.min(this.wanted, 4) : 0;
    this.spawnTimer -= dt;
    if (this.cruisers.length < want && this.spawnTimer <= 0) {
      this._spawnCruiser(targetPos);
      this.spawnTimer = 1.2;
    }
    if (this.cruisers.length > want) {
      // Too many cruisers: remove the farthest one.
      let far = null, farD = -1;
      for (const c of this.cruisers) {
        const d = Math.hypot(c.pos.x - targetPos.x, c.pos.z - targetPos.z);
        if (d > farD) { farD = d; far = c; }
      }
      if (far) {
        this.scene.remove(far.mesh);
        this.cruisers.splice(this.cruisers.indexOf(far), 1);
      }
    }
    // Chase behaviour: steer toward the player, ram on contact.
    let busted = false;
    let closest = 999;
    for (const c of this.cruisers) {
      const dx = targetPos.x - c.pos.x;
      const dz = targetPos.z - c.pos.z;
      const dist = Math.hypot(dx, dz);
      closest = Math.min(closest, dist);
      const wantHeading = Math.atan2(dx, dz);
      c.heading = dampAngle(c.heading, wantHeading, 2.2, dt);
      let targetSpeed = dist > 10 ? 30 + this.wanted * 1.5 : 16;
      // When Rex is driving, cruisers match his pace and stay on his tail
      // (capped, so a fast car can still pull away on a straight).
      if (playerCar) targetSpeed = Math.min(34, Math.max(18, Math.abs(playerCar.speed) + 2));
      // Cornering Rex on foot: the cruiser pulls up beside him and stops
      // so the arrest can happen instead of driving past at full speed.
      if (!playerCar && dist < 7) targetSpeed = 0;
      c.speed += (targetSpeed - c.speed) * Math.min(1, dt * 1.5);
      c.pos.x += Math.sin(c.heading) * c.speed * dt;
      c.pos.z += Math.cos(c.heading) * c.speed * dt;
      if (this.city.resolveCollision(c.pos, 1.6)) c.speed *= 0.5;
      c.mesh.position.copy(c.pos);
      c.mesh.rotation.y = c.heading;
      // Light bar strobe.
      const bar = c.mesh.userData.lightBar;
      if (bar) {
        const on = Math.sin(this.flashPhase) > 0;
        bar.red.material.emissiveIntensity = on ? 2.2 : 0.2;
        bar.blue.material.emissiveIntensity = on ? 0.2 : 2.2;
      }
      // Ram the player's car.
      if (playerCar && dist < 3.2) {
        playerCar.health -= 14 * dt;
        playerCar.speed *= 1 - Math.min(1, dt * 1.5);
        const push = 3.2 - dist;
        playerCar.pos.x += (playerCar.pos.x - c.pos.x) / (dist || 1) * push * 0.5;
        playerCar.pos.z += (playerCar.pos.z - c.pos.z) / (dist || 1) * push * 0.5;
      }
      // Corner Rex on foot: busted after 2 seconds pressed against a cruiser.
      if (!playerCar && dist < 3.4 && c.speed < 6) {
        this.bustedTimer += dt;
        if (this.bustedTimer > 2) busted = true;
      }
    }
    if (closest > 6) this.bustedTimer = Math.max(0, this.bustedTimer - dt * 2);
    if (audio) audio.updateSiren(dt, this.wanted > 0);
    return { busted, closest };
  }
}
