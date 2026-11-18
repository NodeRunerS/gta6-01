// Human-like pedestrians for Solmar City: jointed low-poly people with a
// walk cycle, clearly distinct women (long hair, ponytails, dresses) and men,
// plus beachgoers on Ocean Beach. Kept lean (~7 meshes per person) so the
// city stays fast on software rendering.
import * as THREE from 'three';
import { S, isLand, isWater } from './state.js';
import { mulberry32, pick, clamp } from './util.js';

const rng = mulberry32(2026);

const SKINS = [0xe8b88a, 0xc98a5a, 0x8a5a34, 0xf2c89b, 0xa86a3f, 0x6b4226];
const HAIRS = [0x1a1210, 0x4a2a12, 0xd8b25a, 0x8a8a8a, 0x7a3a1a];
const TOPS = [0xff5e8a, 0x00c8d8, 0xffc93d, 0x7a5cff, 0x35d07f, 0xffffff, 0xff8a3d, 0x2ea8ff];
const PANTS = [0x2a3a55, 0x3a2a1a, 0x5a5a5a, 0x7a2d3d, 0x2f4a3a, 0x8a6a3a];

function lam(color) {
  return new THREE.MeshLambertMaterial({ color });
}

// Build one human. Returns { group, parts, look }; parts pivot for the walk
// cycle (legL/legR, armL/armR, torso, head).
export function makeHuman(opts = {}) {
  const sex = opts.sex || 'male';
  const skin = opts.skin ?? pick(rng, SKINS);
  const hairColor = opts.hairColor ?? pick(rng, HAIRS);
  const topColor = opts.topColor ?? pick(rng, TOPS);
  const pantsColor = opts.pantsColor ?? pick(rng, PANTS);
  const dress = sex === 'female' && (opts.dress ?? rng() < 0.45);
  const hairStyle = sex === 'female'
    ? (opts.hairStyle ?? pick(rng, ['long', 'ponytail', 'bob', 'long', 'bun']))
    : (opts.hairStyle ?? pick(rng, ['flat', 'cap', 'mohawk', 'bald', 'flat']));
  const scale = opts.scale ?? (sex === 'female' ? 0.88 + rng() * 0.1 : 0.95 + rng() * 0.13);

  const g = new THREE.Group();
  const parts = {};
  const skinM = lam(skin);
  const topM = lam(topColor);
  const pantsM = lam(pantsColor);
  const hairM = lam(hairColor);

  // Legs (hip pivots at y 0.78), one box each reaching the ground.
  function leg(side) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.11, 0.78, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.78, 0.17), dress ? topM : pantsM);
    mesh.position.y = -0.39;
    pivot.add(mesh);
    g.add(pivot);
    return pivot;
  }
  parts.legL = leg(-1);
  parts.legR = leg(1);

  // Dress skirt (static, flared).
  if (dress) {
    const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.62, 8), topM);
    skirt.position.y = 0.62;
    g.add(skirt);
  }

  // Torso.
  const torsoW = sex === 'female' ? 0.42 : 0.52;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(torsoW, 0.62, 0.26), topM);
  torso.position.y = 1.12;
  g.add(torso);
  parts.torso = torso;

  // Arms (shoulder pivots at y 1.38), one box each.
  function arm(side) {
    const pivot = new THREE.Group();
    pivot.position.set(side * (torsoW / 2 + 0.06), 1.38, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.64, 0.13), topM);
    mesh.position.y = -0.32;
    pivot.add(mesh);
    g.add(pivot);
    return pivot;
  }
  parts.armL = arm(-1);
  parts.armR = arm(1);

  // Head + hair.
  const head = new THREE.Group();
  head.position.y = 1.62;
  head.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.28), skinM));
  if (hairStyle === 'long' || hairStyle === 'ponytail') {
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.5, 0.1), hairM);
    back.position.set(0, -0.12, -0.14);
    head.add(back);
  }
  if (hairStyle === 'ponytail') {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.42, 0.09), hairM);
    tail.position.set(0, -0.1, -0.22);
    tail.rotation.x = 0.35;
    head.add(tail);
  }
  if (hairStyle === 'bob') {
    const bob = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.32), hairM);
    bob.position.y = 0.1;
    head.add(bob);
  }
  if (hairStyle === 'bun') {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), hairM);
    bun.position.set(0, 0.22, -0.05);
    head.add(bun);
  }
  if (hairStyle === 'flat' || hairStyle === 'mohawk' || hairStyle === 'cap') {
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.3), hairM);
    top.position.y = 0.18;
    head.add(top);
  }
  if (hairStyle === 'mohawk') {
    const moh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.3), lam(0xff2e88));
    moh.position.y = 0.28;
    head.add(moh);
  }
  if (hairStyle === 'cap') {
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.04, 0.14), lam(0xff2e4d));
    brim.position.set(0, 0.16, 0.2);
    head.add(brim);
  }
  g.add(head);
  parts.head = head;

  g.scale.setScalar(scale);
  g.userData.parts = parts;
  return { group: g, parts, look: { sex, dress, hairStyle, skin, topColor, pantsColor } };
}

export class Walker {
  constructor(x, z, opts = {}) {
    const built = makeHuman(opts);
    this.group = built.group;
    this.parts = built.parts;
    this.look = built.look;
    this.sex = this.look.sex;
    this.pos = { x, z };
    this.heading = rng() * Math.PI * 2;
    this.speed = 0.9 + rng() * 0.9;
    this.walkPhase = rng() * Math.PI * 2;
    this.beach = !!opts.beach;
    this.officer = !!opts.officer;
    this.dead = false;
    this.target = null;
    this.group.position.set(x, 0, z);
    this.group.rotation.y = this.heading;
  }

  update(dt) {
    if (this.dead) return;
    // Pick a nearby land target and stroll toward it.
    if (!this.target || Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z) < 2) {
      this.target = { x: this.pos.x, z: this.pos.z };
      for (let tries = 0; tries < 8; tries++) {
        const tx = this.pos.x + (rng() - 0.5) * 90;
        const tz = this.pos.z + (rng() - 0.5) * 90;
        if (isLand(tx, tz) && !isWater(tx, tz)) { this.target = { x: tx, z: tz }; break; }
      }
    }
    const dx = this.target.x - this.pos.x;
    const dz = this.target.z - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const want = Math.atan2(dx, dz);
    let dh = want - this.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    this.heading += clamp(dh, -2.2 * dt, 2.2 * dt);
    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;
    this.walkPhase += dt * this.speed * 5.2;
    const s = Math.sin(this.walkPhase);
    this.parts.legL.rotation.x = s * 0.55;
    this.parts.legR.rotation.x = -s * 0.55;
    this.parts.armL.rotation.x = -s * 0.45;
    this.parts.armR.rotation.x = s * 0.45;
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.group.rotation.y = this.heading;
  }
}

export function buildPedestrians(scene) {
  const list = [];
  const spots = [];
  let femaleCount = 0;
  // Busy center / plaza / beachfront bias.
  for (let i = 0; i < 14; i++) spots.push([84 + rng() * 112, -112 + rng() * 224]);
  for (let i = 0; i < 10; i++) spots.push([-196 + rng() * 112, -168 + rng() * 336]);
  for (let i = 0; i < 8; i++) spots.push([196 + rng() * 8, -168 + rng() * 336]);
  for (const [x, z] of spots) {
    if (!isLand(x, z)) continue;
    const sex = rng() < 0.45 ? 'female' : 'male';
    const opts = { sex };
    if (sex === 'female') {
      femaleCount++;
      if (femaleCount % 4 === 2) opts.hairStyle = 'ponytail';
    }
    const w = new Walker(x, z, opts);
    scene.add(w.group);
    list.push(w);
  }
  // Beachgoers on Ocean Beach.
  for (let i = 0; i < 8; i++) {
    const sex = rng() < 0.5 ? 'female' : 'male';
    const opts = {
      sex, beach: true,
      topColor: pick(rng, [0xff5e8a, 0x00c8d8, 0xffc93d, 0xffffff]),
    };
    if (sex === 'female' && i % 3 === 0) opts.hairStyle = 'ponytail';
    const w = new Walker(228 + rng() * 20, -170 + rng() * 340, opts);
    scene.add(w.group);
    list.push(w);
  }
  // Three uniformed officers at the plaza.
  for (let i = 0; i < 3; i++) {
    const w = new Walker(140 + (i - 1) * 4, 8 + i * 2, {
      sex: 'male', officer: true, topColor: 0x1c2f4d, pantsColor: 0x1c2f4d, hairStyle: 'cap',
    });
    scene.add(w.group);
    list.push(w);
  }
  S.pedestrians = list;
  return list;
}
