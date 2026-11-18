// Traffic lights: working signals at the nine main intersections of the road
// grid. Each light is a pole + diagonal arm + a head with lamps on all four
// faces, so drivers on every approach can see it. The two road directions
// run opposite phases (green -> yellow -> all-red -> cross green) on a 20 s
// cycle with a per-intersection offset, so the city never flips in unison.
// Lamps are one InstancedMesh with per-instance colors (bright when on, dark
// when off) — one draw call for all 108 lamps.
//
// Traffic cars ask stateForApproach() before an intersection: it returns the
// signal for their direction and the distance to the stop line, or null when
// there is no light ahead (or the car is already committed inside the crossing).
import * as THREE from '../vendor/three.module.min.js';
import { S } from './state.js';
import { CITY } from './city.js';
import { mulberry32 } from './util.js';

const CYCLE = 20; // seconds: green 7, yellow 2, all-red 1, cross green 7, yellow 2, all-red 1
const STOP_OFFSET = 9; // stop line: car centers stop this far before the intersection center

const LIGHT_SPOTS = [
  [0, 0],
  [56, 0], [-56, 0], [0, 56], [0, -56],
  [56, 56], [56, -56], [-56, 56], [-56, -56],
];

/** Signal for one road direction at a given cycle phase. */
function phaseState(phase, axis) {
  // 'z' traffic runs north-south, 'x' traffic runs east-west; they are opposite.
  const ns = phase < 7 ? 'green' : phase < 9 ? 'yellow' : 'red';
  const ew = phase >= 10 && phase < 17 ? 'green' : phase >= 17 && phase < 19 ? 'yellow' : 'red';
  return axis === 'z' ? ns : ew;
}

export function buildTrafficLights() {
  const scene = S.scene;

  // Shared meshes: poles, arms and heads as InstancedMesh (3 draw calls).
  const poleGeo = new THREE.CylinderGeometry(0.16, 0.22, 6.2, 8);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2a2a30 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, LIGHT_SPOTS.length);
  const armGeo = new THREE.BoxGeometry(12.4, 0.22, 0.22);
  const arms = new THREE.InstancedMesh(armGeo, poleMat, LIGHT_SPOTS.length);
  const headGeo = new THREE.BoxGeometry(0.62, 2.5, 0.62);
  const headMat = new THREE.MeshLambertMaterial({ color: 0x181818 });
  const heads = new THREE.InstancedMesh(headGeo, headMat, LIGHT_SPOTS.length);
  poles.castShadow = true;
  arms.castShadow = true;

  // Lamps: one sphere per face per color — 4 faces x 3 lamps x 9 heads.
  // MeshBasicMaterial + per-instance color: bright when lit, dark when off.
  const lampGeo = new THREE.SphereGeometry(0.26, 10, 8);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const LAMP_COUNT = LIGHT_SPOTS.length * 12;
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, LAMP_COUNT);
  lamps.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  lamps.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(LAMP_COUNT * 3), 3);
  lamps.instanceColor.setUsage(THREE.DynamicDrawUsage);

  const m4 = new THREE.Matrix4();
  const rot = new THREE.Matrix4();
  const lights = LIGHT_SPOTS.map(([ix, iz], i) => {
    // Pole on the north-east corner of the intersection (just off the sidewalk),
    // arm running diagonally to a head hanging over the crossing.
    const px = ix + 10.5;
    const pz = iz + 10.5;
    const hx = ix + 2;
    const hz = iz + 2;
    m4.identity();
    m4.setPosition(px, 3.1, pz);
    poles.setMatrixAt(i, m4);
    const midX = (px + hx) / 2;
    const midZ = (pz + hz) / 2;
    rot.makeRotationY(Math.PI / 4);
    m4.copy(rot);
    m4.setPosition(midX, 6.1, midZ);
    arms.setMatrixAt(i, m4);
    m4.identity();
    m4.setPosition(hx, 4.9, hz);
    heads.setMatrixAt(i, m4);

    // Lamp positions: red top, yellow middle, green bottom, on all four faces.
    const lampSlots = [];
    const yOffsets = [0.85, 0, -0.85];
    for (const face of [0, 1, 2, 3]) {
      for (let k = 0; k < 3; k++) {
        const axis = face < 2 ? 'x' : 'z';
        const sign = face % 2 === 0 ? 1 : -1;
        const pos = { x: hx, y: 4.9 + yOffsets[k], z: hz };
        if (axis === 'x') pos.x += sign * 0.34;
        else pos.z += sign * 0.34;
        lampSlots.push({ axis, color: ['red', 'yellow', 'green'][k], pos });
      }
    }
    return { x: ix, z: iz, offset: mulberry32((ix * 131 + iz * 17 + 5) >>> 0)() * CYCLE, lampSlots };
  });
  // Write the lamp instance matrices once (they never move).
  let li = 0;
  for (const light of lights) {
    for (const slot of light.lampSlots) {
      m4.identity();
      m4.setPosition(slot.pos.x, slot.pos.y, slot.pos.z);
      lamps.setMatrixAt(li++, m4);
    }
  }
  lamps.count = li;
  scene.add(poles);
  scene.add(arms);
  scene.add(heads);
  scene.add(lamps);

  const ON = {
    red: new THREE.Color(0xff2a2a),
    yellow: new THREE.Color(0xffc020),
    green: new THREE.Color(0x2aff5a),
  };
  const OFF = new THREE.Color(0x2a2a2a);
  const tmpColor = new THREE.Color();

  function update() {
    let idx = 0;
    for (const light of lights) {
      const phase = (S.time + light.offset) % CYCLE;
      for (const slot of light.lampSlots) {
        const state = phaseState(phase, slot.axis);
        tmpColor.copy(state === slot.color ? ON[slot.color] : OFF);
        lamps.setColorAt(idx, tmpColor);
        idx++;
      }
    }
    lamps.instanceColor.needsUpdate = true;
  }

  /** Signal ('green'|'yellow'|'red') for one direction at one intersection. */
  function stateAt(ix, iz, axis) {
    const light = lights.find((l) => l.x === ix && l.z === iz);
    if (!light) return 'green';
    return phaseState((S.time + light.offset) % CYCLE, axis);
  }

  /**
   * What a traffic car approaching an intersection sees. Returns null when
   * there is no signalised intersection ahead, or the car is already inside
   * the crossing (committed). Otherwise { state, distToStop }.
   */
  function stateForApproach(x, z, axis, dir) {
    for (const light of lights) {
      if (axis === 'x') {
        if (Math.abs(z - light.z) > 6) continue;
        const ahead = dir > 0 ? light.x > x : light.x < x;
        if (!ahead) continue;
        const dist = Math.abs(light.x - x);
        if (dist > 26 || dist < STOP_OFFSET) continue;
        return { state: phaseState((S.time + light.offset) % CYCLE, 'x'), distToStop: dist - STOP_OFFSET };
      }
      if (Math.abs(x - light.x) > 6) continue;
      const ahead = dir > 0 ? light.z > z : light.z < z;
      if (!ahead) continue;
      const dist = Math.abs(light.z - z);
      if (dist > 26 || dist < STOP_OFFSET) continue;
      return { state: phaseState((S.time + light.offset) % CYCLE, 'z'), distToStop: dist - STOP_OFFSET };
    }
    return null;
  }

  function summary() {
    return lights.map((l) => {
      const phase = (S.time + l.offset) % CYCLE;
      return { x: l.x, z: l.z, ns: phaseState(phase, 'z'), ew: phaseState(phase, 'x') };
    });
  }

  return { lights, update, stateAt, stateForApproach, summary };
}
