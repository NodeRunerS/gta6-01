// People on foot: pedestrians wandering the sidewalks (they flee from gunfire and
// from cars, and fall when run over) and armed enemies who shoot back.
//
// Characters are human-proportioned low-poly people: head with face and hair,
// torso, arms and legs pivoted at the shoulders and hips so they swing while
// walking. Geometries and materials are shared across all characters.
import * as THREE from '../vendor/three.module.min.js';
import { S } from './state.js';
import { CITY } from './city.js';
import { angleToward, circleVsBox, clamp, mulberry32, pick, rand } from './util.js';

const SHIRT_COLORS = [0xc22a2a, 0x2a6ac2, 0x2a9a4a, 0xd8a020, 0x7a4a9a, 0xe8e8e8, 0x222222, 0xd86a20];
const SKIN_TONES = [0xd9a986, 0xc98e6a, 0x8a5a3b, 0xf0c8a0, 0x6b4423, 0xe8b98a];
const HAIR_COLORS = [0x1a1a1a, 0x3a2a1a, 0x6a4a2a, 0x8a8a8a, 0xd8b040, 0x5a2a1a];
const HAIR_STYLES = ['cap', 'flat', 'long', 'bald', 'mohawk'];
const PANTS_COLORS = [0x2a2a33, 0x1e3a5f, 0x3a3a3a, 0x5a4a3a, 0x2a4a3a, 0x6a6a72];
const JACKET_COLORS = [0x1e3a5f, 0x5a1a1a, 0x2a4a2a, 0x3a3a4a, 0x7a5a20, null, null];

// ---- Shared geometry / material caches (one entry per size / color). ----
const _geo = new Map();
function boxGeo(w, h, d) {
  const k = `b${w}|${h}|${d}`;
  if (!_geo.has(k)) _geo.set(k, new THREE.BoxGeometry(w, h, d));
  return _geo.get(k);
}
function cylGeo(rt, rb, h, seg) {
  const k = `c${rt}|${rb}|${h}|${seg}`;
  if (!_geo.has(k)) _geo.set(k, new THREE.CylinderGeometry(rt, rb, h, seg));
  return _geo.get(k);
}
function sphGeo(r, w = 12, h = 10) {
  const k = `s${r}|${w}|${h}`;
  if (!_geo.has(k)) _geo.set(k, new THREE.SphereGeometry(r, w, h));
  return _geo.get(k);
}
const _mat = new Map();
function mat(color) {
  if (!_mat.has(color)) _mat.set(color, new THREE.MeshLambertMaterial({ color }));
  return _mat.get(color);
}

function mesh(geo, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/**
 * Build a human-proportioned low-poly person (~1.8 units tall).
 * Returns the group; the animated parts live on group.userData.parts:
 * { legL, legR, armL, armR, head, torso }.
 * opts: skin, hairColor, hairStyle ('cap'|'flat'|'long'|'bald'|'mohawk'|'hat'),
 * pants, jacket (color or null), scale, uniform (navy police uniform + cap).
 */
export function makePersonMesh(shirtColor, skinColor = 0xd9a986, opts = {}) {
  const skin = skinColor;
  const pants = opts.pants ?? 0x2a2a33;
  const hairColor = opts.hairColor ?? 0x1a1a1a;
  const hairStyle = opts.uniform ? 'hat' : (opts.hairStyle ?? 'cap');
  const shirt = opts.uniform ? 0x1a2a55 : shirtColor;
  const female = !!opts.female;
  const group = new THREE.Group();

  // Legs: pivoted at the hips so they swing while walking.
  const parts = {};
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(s * (female ? 0.10 : 0.11), 0.85, 0);
    const thigh = mesh(boxGeo(0.16, 0.85, 0.18), pants, 0, -0.42, 0);
    leg.add(thigh);
    // Shoe.
    leg.add(mesh(boxGeo(0.17, 0.09, 0.28), 0x141414, 0, -0.82, 0.04));
    group.add(leg);
    parts[s < 0 ? 'legL' : 'legR'] = leg;
  }

  // Torso (narrower shoulders on women).
  const torso = mesh(boxGeo(female ? 0.44 : 0.52, 0.62, 0.28), shirt, 0, 1.18, 0);
  group.add(torso);
  parts.torso = torso;
  // Dress: a flared skirt over the hips (women only).
  if (opts.dress) {
    const skirt = new THREE.Mesh(cylGeo(0.26, 0.46, 0.62, 8), mat(opts.dress));
    skirt.position.set(0, 0.62, 0);
    skirt.castShadow = true;
    group.add(skirt);
  }
  // Jacket: an open layer over the lower torso, shirt showing on the chest.
  if (opts.jacket) {
    group.add(mesh(boxGeo(0.56, 0.42, 0.32), opts.jacket, 0, 1.08, 0));
  }
  // Police badge.
  if (opts.uniform) {
    group.add(mesh(boxGeo(0.09, 0.07, 0.02), 0xffd23d, -0.14, 1.32, 0.15));
  }

  // Arms: pivoted at the shoulders, with a skin hand at the end.
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * (female ? 0.27 : 0.32), 1.44, 0);
    arm.add(mesh(boxGeo(0.13, 0.56, 0.15), opts.uniform ? 0x1a2a55 : shirt, 0, -0.28, 0));
    arm.add(mesh(boxGeo(0.12, 0.12, 0.12), skin, 0, -0.62, 0));
    group.add(arm);
    parts[s < 0 ? 'armL' : 'armR'] = arm;
  }

  // Head + face + hair.
  const head = new THREE.Group();
  head.position.set(0, 1.66, 0);
  head.add(mesh(sphGeo(0.19), skin, 0, 0, 0));
  // Eyes.
  head.add(mesh(boxGeo(0.035, 0.045, 0.02), 0x111111, -0.07, 0.02, 0.175));
  head.add(mesh(boxGeo(0.035, 0.045, 0.02), 0x111111, 0.07, 0.02, 0.175));
  // Hair styles.
  if (hairStyle === 'cap') {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(hairColor));
    cap.position.y = 0.03;
    cap.castShadow = true;
    head.add(cap);
  } else if (hairStyle === 'flat') {
    head.add(mesh(boxGeo(0.34, 0.07, 0.34), hairColor, 0, 0.18, 0));
  } else if (hairStyle === 'long') {
    head.add(mesh(boxGeo(0.36, 0.1, 0.36), hairColor, 0, 0.17, 0));
    head.add(mesh(boxGeo(0.34, 0.42, 0.1), hairColor, 0, -0.08, -0.16));
  } else if (hairStyle === 'ponytail') {
    head.add(mesh(boxGeo(0.34, 0.08, 0.34), hairColor, 0, 0.18, 0));
    // Tail hanging down the back of the head.
    head.add(mesh(boxGeo(0.12, 0.44, 0.1), hairColor, 0, -0.06, -0.18));
  } else if (hairStyle === 'mohawk') {
    head.add(mesh(boxGeo(0.05, 0.14, 0.3), hairColor, 0, 0.22, 0));
  } else if (hairStyle === 'hat') {
    // Police cap: brim + crown.
    const brim = new THREE.Mesh(cylGeo(0.24, 0.24, 0.03, 12), mat(0x0e1a3a));
    brim.position.set(0, 0.15, 0.03);
    brim.castShadow = true;
    head.add(brim);
    const crown = new THREE.Mesh(cylGeo(0.16, 0.19, 0.12, 12), mat(0x1a2a55));
    crown.position.y = 0.21;
    crown.castShadow = true;
    head.add(crown);
  }
  group.add(head);
  parts.head = head;

  group.userData.parts = parts;
  if (opts.scale && opts.scale !== 1) group.scale.setScalar(opts.scale);
  return group;
}

/** Swing arms and legs for a walk cycle. phase advances with movement. */
export function animateWalk(parts, phase, amount) {
  if (!parts) return;
  const swing = 0.55 * amount;
  parts.legL.rotation.x = Math.sin(phase) * swing;
  parts.legR.rotation.x = -Math.sin(phase) * swing;
  parts.armL.rotation.x = -Math.sin(phase) * swing * 0.8;
  parts.armR.rotation.x = Math.sin(phase) * swing * 0.8;
  parts.armL.rotation.z = 0.08 * amount;
  parts.armR.rotation.z = -0.08 * amount;
}

const FEMALE_SHIRTS = [0xe86a8a, 0xd84a7a, 0x2a9a8a, 0xe8c020, 0x8a5aa8, 0xf0f0f0, 0xe86a10];
const DRESS_COLORS = [0xd84a7a, 0x2a6ac2, 0xe8c020, 0x8a3a5a, 0x2a9a8a, 0xc22a2a];

/** A random citizen: women (long hair / ponytail, dresses, slimmer build) and men. */
function randomPerson(rng) {
  const female = rng() < 0.5;
  if (female) {
    return {
      shirt: pick(rng, FEMALE_SHIRTS),
      skin: pick(rng, SKIN_TONES),
      hairColor: pick(rng, HAIR_COLORS),
      hairStyle: pick(rng, ['long', 'ponytail', 'long', 'ponytail', 'flat']),
      pants: pick(rng, PANTS_COLORS),
      jacket: null,
      dress: rng() < 0.45 ? pick(rng, DRESS_COLORS) : null,
      female: true,
      scale: rand(rng, 0.88, 0.98),
    };
  }
  return {
    shirt: pick(rng, SHIRT_COLORS),
    skin: pick(rng, SKIN_TONES),
    hairColor: pick(rng, HAIR_COLORS),
    hairStyle: pick(rng, ['cap', 'flat', 'mohawk', 'bald', 'flat']),
    pants: pick(rng, PANTS_COLORS),
    jacket: pick(rng, JACKET_COLORS),
    female: false,
    scale: rand(rng, 0.94, 1.08),
  };
}

class Walker {
  constructor(x, z, look) {
    this.group = makePersonMesh(look.shirt, look.skin, look);
    this.look = look;
    this.sex = look.female ? 'female' : 'male';
    this.parts = this.group.userData.parts;
    this.group.userData.person = this;
    this.group.position.set(x, 0, z);
    this.pos = { x, z };
    this.heading = Math.random() * Math.PI * 2;
    this.speed = 0;
    this.state = 'walk'; // walk | flee | down
    this.downTimer = 0;
    this.phase = Math.random() * Math.PI * 2;
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
    let moving = false;
    if (dist < 1.5) {
      if (this.state === 'flee') this.state = 'walk';
      this.target = this._newTarget();
    } else {
      const want = Math.atan2(-dz, dx);
      this.heading = angleToward(this.heading, want, dt * 5);
      this.pos.x += Math.cos(this.heading) * speed * dt;
      this.pos.z += -Math.sin(this.heading) * speed * dt;
      moving = true;
    }
    this.pos.x = clamp(this.pos.x, -222, 222);
    this.pos.z = clamp(this.pos.z, -222, 222);
    for (const box of S.colliders) circleVsBox(this.pos, 0.5, box);
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.group.rotation.y = -this.heading;
    // Walk cycle: swing arms and legs, small bob.
    if (moving) this.phase += dt * speed * 2.4;
    const amount = moving ? Math.min(1, speed / 4.5 + 0.35) : 0;
    animateWalk(this.parts, this.phase, amount);
    this.group.position.y = Math.abs(Math.sin(this.phase)) * 0.05 * (moving ? 1 : 0);
  }

  /** Knocked down (run over or shot). */
  knockDown() {
    if (this.state === 'down') return;
    this.state = 'down';
    this.downTimer = 6;
    animateWalk(this.parts, 0, 0);
    this.group.rotation.x = -Math.PI / 2;
    this.group.position.y = 0.3;
  }
}

/** The crowd: 38 walkers (women and men) plus 3 officers on patrol. */
export class Pedestrians {
  constructor(count = 38) {
    this.rng = mulberry32(31337);
    this.walkers = [];
    for (let i = 0; i < count; i++) {
      const line = pick(this.rng, CITY.LINES);
      // Bias toward the busy center, plaza and beachfront so the city feels lived-in.
      const along = this.rng() < 0.6 ? rand(this.rng, -140, 140) : rand(this.rng, -200, 200);
      const off = this.rng() > 0.5 ? 9.5 : -9.5;
      const x = this.rng() > 0.5 ? along : line + off;
      const z = this.rng() > 0.5 ? line + off : along;
      const w = new Walker(clamp(x, -220, 220), clamp(z, -220, 220), randomPerson(this.rng));
      this.walkers.push(w);
    }
    // A few uniformed officers on patrol around the plaza.
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      const w = new Walker(
        CITY.PLAZA.x + Math.cos(a) * 26,
        CITY.PLAZA.z + Math.sin(a) * 26,
        { shirt: 0x1a2a55, skin: pick(this.rng, SKIN_TONES), pants: 0x1a2a55, uniform: true, scale: rand(this.rng, 0.96, 1.04) },
      );
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
    this.group = makePersonMesh(opts.shirt ?? 0x1a1a1a, opts.skin ?? 0xc98e6a, {
      hairStyle: opts.hairStyle ?? 'flat',
      hairColor: opts.hairColor ?? 0x1a1a1a,
      pants: 0x222226,
      jacket: 0x111111,
    });
    this.parts = this.group.userData.parts;
    this.group.userData.person = this;
    // A visible gun in the right hand.
    const gun = new THREE.Mesh(
      boxGeo(0.1, 0.1, 0.5),
      mat(0x111111),
    );
    gun.position.set(0, -0.62, 0.16);
    gun.castShadow = true;
    this.parts.armR.add(gun);
    this.group.position.set(x, 0, z);
    this.pos = { x, z };
    this.heading = 0;
    this.health = 100;
    this.shootTimer = rand(Math.random, 0.5, 1.5);
    this.dead = false;
    this.deadTimer = 0;
    this.phase = 0;
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
    // Aim the gun arm forward while engaging.
    const aiming = dist < 48 ? 1 : 0;
    this.parts.armR.rotation.x += (aiming * -1.35 - this.parts.armR.rotation.x) * Math.min(1, dt * 6);
    this.parts.armL.rotation.x += (0 - this.parts.armL.rotation.x) * Math.min(1, dt * 6);
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
