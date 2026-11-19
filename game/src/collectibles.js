// Gold Shells — 24 hidden collectibles across both islands. Walk or drive
// within ~2m to pick one up: +$100 and a chime. All 24 pays a $2,500 bonus.
// Collected shells persist in the save file under the same SAVE_KEY.
import * as THREE from 'three';
import { S } from './state.js';
import { dist2d } from './util.js';

export const SHELL_TOTAL = 24;
export const SHELL_REWARD = 100;
export const SHELL_BONUS = 2500;

// Beach, boardwalk, east island, west island, port, bridges, mansion island.
export const SHELL_SPOTS = [
  [232, -140], [240, -40], [230, 60], [244, 150], // Ocean Beach sand
  [210, -112], [210, 112], // boardwalk
  [96, -168], [168, 140], [84, -56], [140, 56], [84, 168], [196, 112], // east island
  [-215, 140], [-180, 185], [-120, 130], [-140, -140], [-84, -112],
  [-196, -28], [-210, -150], [-168, 100], // west island + port
  [0, -112], [0, 112], [20, 0], // bridges
  [0, 206], // mansion island
];

let meshes = [];

export function buildShells(scene) {
  S.shellSpots = SHELL_SPOTS;
  meshes = [];
  const gold = new THREE.MeshBasicMaterial({ color: 0xffd23d });
  const goldDark = new THREE.MeshBasicMaterial({ color: 0xff9e00 });
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xffd23d, transparent: true, opacity: 0.3,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  SHELL_SPOTS.forEach(([x, z], i) => {
    const g = new THREE.Group();
    // Conch: a gold cone tipped on its side + a small darker tip.
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.1, 7), gold);
    cone.rotation.z = Math.PI / 2.4;
    cone.position.y = 0.55;
    g.add(cone);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 6), goldDark);
    tip.rotation.z = -Math.PI / 2.4;
    tip.position.set(-0.45, 0.85, 0);
    g.add(tip);
    // Soft glow disc on the ground.
    const glow = new THREE.Mesh(new THREE.CircleGeometry(1.1, 16), glowMat.clone());
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.07;
    g.add(glow);
    g.position.set(x, 0, z);
    scene.add(g);
    meshes.push({ group: g, glow, phase: i * 0.7 });
  });
  S.shellMeshes = meshes;
  syncShells();
}

// Hide meshes already collected (after loading a save).
export function syncShells() {
  const done = S.shellsCollected || [];
  meshes.forEach((m, i) => { m.group.visible = !done.includes(i); });
}

// Fresh game: show every shell again.
export function resetShells() {
  S.shellsCollected = [];
  meshes.forEach((m) => { m.group.visible = true; });
}

function collectShell(i) {
  const done = S.shellsCollected || (S.shellsCollected = []);
  if (done.includes(i)) return;
  done.push(i);
  if (meshes[i]) meshes[i].group.visible = false;
  S.money += SHELL_REWARD;
  S.stats.moneyEarned += SHELL_REWARD;
  if (S.audio) S.audio.pickup();
  if (done.length >= SHELL_TOTAL) {
    S.money += SHELL_BONUS;
    S.stats.moneyEarned += SHELL_BONUS;
    if (S.hudToast) S.hudToast('🏆 SHELL HUNTER! All 24 shells — $2,500 bonus!');
  } else if (S.hudToast) {
    S.hudToast(`🐚 Gold Shell! +$100  (${done.length}/24)`);
  }
  if (S.saveGame) S.saveGame();
}

export function updateShells(dt) {
  if (!meshes.length || !S.player) return;
  for (let i = 0; i < meshes.length; i++) {
    const m = meshes[i];
    if (!m.group.visible) continue;
    // Spin and bob so they catch the eye.
    m.group.rotation.y += dt * 2.2;
    m.group.position.y = Math.sin(S.time * 2 + m.phase) * 0.12;
    m.glow.material.opacity = 0.22 + Math.sin(S.time * 3 + m.phase) * 0.1;
    if (S.mode === 'playing') {
      const p = S.player.pos;
      const [sx, sz] = SHELL_SPOTS[i];
      if (dist2d(p.x, p.z, sx, sz) < 2.2) collectShell(i);
    }
  }
}
