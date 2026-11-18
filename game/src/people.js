// People on foot: pedestrians wandering the sidewalks (they flee from gunfire and
// from cars, and fall when run over) and armed enemies who shoot back.
import * as THREE from '../vendor/three.module.min.js';
import { S } from './state.js';
import { CITY } from './city.js';
import { angleToward, circleVsBox, clamp, mulberry32, pick, rand } from './util.js';

const SHIRT_COLORS = [0xc22a2a, 0x2a6ac2, 0x2a9a4a, 0xd8a020, 0x7a4a9a, 0xe8e8e8, 0x222222, 0xd86a20];

/** Build a simple person mesh: body capsule, head, legs. Returns the group. */
export function makePersonMesh(shirtColor, skinColor = 0xd9a986) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.5, 1.05, 10),
    new THREE.MeshLambertMaterial({ color: shirtColor }),
  );
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 12, 10),
    new THREE.MeshLambertMaterial({ color: skinColor }),
  );
  head.position.y = 1.9;
  head.castShadow = true;
  group.add(head);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x2a2a33 });
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.55, 8), legMat);
    leg.position.set(0, 0.28, s * 0.18);
    group.add(leg);
  }
  return group;
}

class Walker {
  constructor(x, z, shirtColor) {
    this.group = makePersonMesh(shirtColor);
    this.group.userData.person = this;
    this.group.position.set(x, 0, z);
    this.pos = { x, z };
    this.heading = Math.random() * Math.PI * 2;
    this.speed = 0;
    this.state = 'walk'; // walk | flee | down
    this.downTimer = 0;
    this.target = this._newTarget();
    S.scene.add(this.group);
  }

  _newTarget() {
    const line = pick(Math.random, CITY.LINES);
    const along = rand(Math.random, -200, 200);
    return Math.random() > 0.5 ? { x: along, z: line + (Math.random() > 0.5 ? 9.5 : -9.5) } : { x: line + (Math.random() > 0.5 ? 9.5 : -9.5), z: along };
  }

  update(dt) {
    if (this.state === 'down') {
      this.downTimer -= dt;
      if (this.downTimer <= 0) {
        // Get back up elsewhere in the city.
        const t = this._newTarget();
        this.pos.x = t.x;
        this.pos.z = t.z;
        this.group.position.set(t.x, 0, t.z);
        this.group.rotation.x = 0;
        this.group.visible = true;
        this.state = 'walk';
        this.target = this._newTarget();
      }
      return;
    }
    const p = S.player ? S.player.pos : null;
    let speed = 1.6;
    if (p) {
      const d = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
      const shooting = S.player.shotsFiredAt > S.time - 1.5;
      if ((d < 14 && shooting) || d < 6) {
        // Flee away from the player.
        this.state = 'flee';
        this.target = { x: this.pos.x + (this.pos.x - p.x) * 3, z: this.pos.z + (this.pos.z - p.z) * 3 };
        speed = 4.5;
      }
    }
    if (this.state === 'flee') speed = 4.5;
    const dx = this.target.x - this.pos.x;
    const dz = this.target.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1.5) {
      if (this.state === 'flee') this.state = 'walk';
      this.target = this._newTarget();
    } else {
      const want = Math.atan2(-dz, dx);
      this.heading = angleToward(this.heading, want, dt * 5);
      this.pos.x += Math.cos(this.heading) * speed * dt;
      this.pos.z += -Math.sin(this.heading) * speed * dt;
    }
    this.pos.x = clamp(this.pos.x, -222, 222);
    this.pos.z = clamp(this.pos.z, -222, 222);
    for (const box of S.colliders) circleVsBox(this.pos, 0.5, box);
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.group.rotation.y = -this.heading;
    // Simple walk bob.
    this.group.position.y = Math.abs(Math.sin(S.time * 8 + this.pos.x)) * 0.06 * (speed / 4.5);
  }

  /** Knocked down (run over or shot). */
  knockDown() {
    if (this.state === 'down') return;
    this.state = 'down';
    this.downTimer = 6;
    this.group.rotation.x = -Math.PI / 2;
    this.group.position.y = 0.3;
  }
}

/** The crowd. */
export class Pedestrians {
  constructor(count = 22) {
    this.rng = mulberry32(31337);
    this.walkers = [];
    for (let i = 0; i < count; i++) {
      const line = pick(this.rng, CITY.LINES);
      const along = rand(this.rng, -200, 200);
      const off = this.rng() > 0.5 ? 9.5 : -9.5;
      const x = this.rng() > 0.5 ? along : line + off;
      const z = this.rng() > 0.5 ? line + off : along;
      const w = new Walker(clamp(x, -220, 220), clamp(z, -220, 220), pick(this.rng, SHIRT_COLORS));
      this.walkers.push(w);
    }
    S.pedestrians = this.walkers;
  }

  update(dt) {
    for (const w of this.walkers) w.update(dt);
  }
}

/** An armed enemy: stands, aims and shoots at the player. */
export class Enemy {
  constructor(x, z, opts = {}) {
    this.group = makePersonMesh(opts.shirt ?? 0x1a1a1a);
    this.group.userData.person = this;
    // A visible gun in hand.
    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.12, 0.12),
      new THREE.MeshLambertMaterial({ color: 0x111111 }),
    );
    gun.position.set(0.4, 1.25, 0.25);
    this.group.add(gun);
    this.group.position.set(x, 0, z);
    this.pos = { x, z };
    this.heading = 0;
    this.health = 100;
    this.shootTimer = rand(Math.random, 0.5, 1.5);
    this.dead = false;
    this.deadTimer = 0;
    S.scene.add(this.group);
    S.enemies.push(this);
  }

  update(dt) {
    if (this.dead) {
      this.deadTimer -= dt;
      if (this.deadTimer <= 0) {
        S.scene.remove(this.group);
        const i = S.enemies.indexOf(this);
        if (i >= 0) S.enemies.splice(i, 1);
      }
      return;
    }
    const p = S.player;
    if (!p || S.mode !== 'playing') return;
    const dx = p.pos.x - this.pos.x;
    const dz = p.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    this.heading = angleToward(this.heading, Math.atan2(-dz, dx), dt * 4);
    this.group.rotation.y = -this.heading;
    if (dist < 48) {
      this.shootTimer -= dt;
      if (this.shootTimer <= 0) {
        this.shootTimer = rand(Math.random, 1.4, 2.6);
        // Hit chance falls with distance; a hit hurts.
        const chance = clamp(0.55 - dist / 120, 0.12, 0.55);
        if (Math.random() < chance) {
          p.damage(rand(Math.random, 5, 10), 'shot');
          if (S.hud) S.hud.flashDamage();
        }
        // Muzzle flash + crack so the player can tell who is shooting.
        if (S.sounds) S.sounds.shot();
      }
    }
  }

  takeDamage(n) {
    if (this.dead) return false;
    this.health -= n;
    if (this.health <= 0) {
      this.dead = true;
      this.deadTimer = 5;
      this.group.rotation.x = -Math.PI / 2;
      this.group.position.y = 0.3;
      S.money += 50;
      if (S.hud) S.hud.showToast('Gunman down  +$50');
      return true;
    }
    return false;
  }
}
