// Working traffic lights for Solmar City: poles with diagonal arms and heads
// on all four faces, a 28 s cycle with per-intersection offsets, and a query
// traffic cars use to stop at red. Lamps are a single InstancedMesh.
import * as THREE from 'three';
import { S } from './state.js';

// green 9, yellow 3, all-red 2, cross green 9, yellow 3, all-red 2
const CYCLE = 28;

const SPOTS = [
  [-140, 0], [-140, -112], [-140, 112], [-84, -56], [-84, 56],
  [140, 0], [140, -112], [140, 112], [84, -56], [84, 56],
];

export function buildTrafficLights(scene) {
  const lights = SPOTS.map(([x, z], i) => ({
    x, z, offset: (i * 5.3) % CYCLE, ns: 'green', ew: 'red',
  }));
  const n = lights.length;

  // Poles + arms + heads as instanced meshes (3 draw calls for structure).
  const poleGeo = new THREE.CylinderGeometry(0.14, 0.18, 6.4, 6);
  const armGeo = new THREE.BoxGeometry(7.5, 0.28, 0.28);
  const headGeo = new THREE.BoxGeometry(0.9, 2.1, 0.9);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x222226 });
  const headMat = new THREE.MeshLambertMaterial({ color: 0x14141a });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, n * 2);
  const arms = new THREE.InstancedMesh(armGeo, poleMat, n * 2);
  const heads = new THREE.InstancedMesh(headGeo, headMat, n * 4);
  const m4 = new THREE.Matrix4();
  lights.forEach((L, i) => {
    // Two poles per intersection: NE and SW corners.
    const corners = [[L.x + 7, L.z + 7], [L.x - 7, L.z - 7]];
    corners.forEach(([px, pz], k) => {
      m4.makeTranslation(px, 3.2, pz);
      poles.setMatrixAt(i * 2 + k, m4);
      m4.makeRotationY(k === 0 ? Math.PI / 4 : -Math.PI * 3 / 4);
      m4.setPosition(px - (k === 0 ? 2.4 : -2.4), 6.1, pz - (k === 0 ? 2.4 : -2.4));
      arms.setMatrixAt(i * 2 + k, m4);
    });
    // Four heads, one per face, hanging over the crossing.
    const headPos = [
      [L.x + 4.5, L.z, 0], [L.x - 4.5, L.z, Math.PI],
      [L.x, L.z + 4.5, Math.PI / 2], [L.x, L.z - 4.5, -Math.PI / 2],
    ];
    headPos.forEach(([hx, hz, ry], k) => {
      m4.makeRotationY(ry);
      m4.setPosition(hx, 5.4, hz);
      heads.setMatrixAt(i * 4 + k, m4);
    });
  });
  scene.add(poles);
  scene.add(arms);
  scene.add(heads);

  // 120 lamp spheres (3 per head x 4 heads x 10 lights) — one InstancedMesh,
  // plus a big saturated halo sphere per lamp so the lit colour dazzles
  // in daylight.
  const lampGeo = new THREE.SphereGeometry(0.34, 8, 6);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const lampCount = n * 4 * 3;
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, lampCount);
  scene.add(lamps);
  const haloGeo = new THREE.SphereGeometry(0.9, 10, 8);
  const haloMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.65,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const halos = new THREE.InstancedMesh(haloGeo, haloMat, lampCount);
  scene.add(halos);
  S._trafficHaloOpacity = 0.65;

  const DARK = new THREE.Color(0x1a0505);
  const RED = new THREE.Color(0xff1a1a);
  const YELLOW = new THREE.Color(0xffd200);
  const GREEN = new THREE.Color(0x00ff55);

  // Phase of the 28 s cycle for a given absolute time and offset.
  function phaseAt(t, offset) {
    const p = (((t + offset) % CYCLE) + CYCLE) % CYCLE;
    if (p < 9) return ['green', 'red'];
    if (p < 12) return ['yellow', 'red'];
    if (p < 14) return ['red', 'red'];
    if (p < 23) return ['red', 'green'];
    if (p < 26) return ['red', 'yellow'];
    return ['red', 'red'];
  }

  function update(t) {
    lights.forEach((L, i) => {
      const [ns, ew] = phaseAt(t, L.offset);
      L.ns = ns;
      L.ew = ew;
      // Heads 0/1 face NS traffic, heads 2/3 face EW traffic.
      const states = [ns, ns, ew, ew];
      states.forEach((st, k) => {
        const base = i * 12 + k * 3;
        // Lamp order in a head: top red, middle yellow, bottom green.
        const cols = [
          st === 'red' ? RED : DARK,
          st === 'yellow' ? YELLOW : DARK,
          st === 'green' ? GREEN : DARK,
        ];
        cols.forEach((c, j) => {
          const idx = base + j;
          const hx = [L.x + 4.5, L.x - 4.5, L.x, L.x][k];
          const hz = [L.z, L.z, L.z + 4.5, L.z - 4.5][k];
          m4.makeTranslation(hx, 5.95 - j * 0.62, hz);
          lamps.setMatrixAt(idx, m4);
          lamps.setColorAt(idx, c);
          halos.setMatrixAt(idx, m4);
          halos.setColorAt(idx, c);
        });
      });
    });
    lamps.instanceMatrix.needsUpdate = true;
    if (lamps.instanceColor) lamps.instanceColor.needsUpdate = true;
    halos.instanceMatrix.needsUpdate = true;
    if (halos.instanceColor) halos.instanceColor.needsUpdate = true;
  }

  // For a car at (x,z) moving along `axis` ('x' or 'z') in direction `dir`:
  // returns { state, dist } to the stop line, or null when no light applies.
  function stateForApproach(x, z, axis, dir) {
    let best = null;
    for (const L of lights) {
      if (axis === 'x') {
        if (Math.abs(z - L.z) > 5) continue;
        const d = (L.x - x) * dir;
        if (d < 0 || d > 30) continue;
        if (!best || d < best.dist) best = { state: L.ew, dist: d - 9 };
      } else {
        if (Math.abs(x - L.x) > 5) continue;
        const d = (L.z - z) * dir;
        if (d < 0 || d > 30) continue;
        if (!best || d < best.dist) best = { state: L.ns, dist: d - 9 };
      }
    }
    return best;
  }

  const api = { lights, update, stateForApproach, count: n };
  S.trafficLights = api;
  return api;
}
