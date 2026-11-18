// Solmar City — the city itself: a sun-soaked coastal grid city built from
// procedural geometry and canvas textures. Roads on a 36-unit pitch, varied
// low-poly buildings, a plaza with a fountain, palms, lamps, billboards, a
// beach and water to the south, mountains to the north, drifting clouds.
import * as THREE from 'three';
import { mulberry32, buildingTexture, roadTexture, signTexture, randomPick } from './util.js';

export const CITY = {
  pitch: 36,          // distance between road centrelines
  roadHalf: 5,        // half the road width
  blocks: 8,          // blocks per side
  half: 144,          // road centrelines run from -144 to +144
  groundSize: 520,
};

const PALETTE = ['#f2e3c6', '#e8b48a', '#d9a06b', '#cfe0d8', '#e6d6c3', '#b8cdd9', '#f0c9a0', '#d8c9a8'];
const TOWER_COLORS = ['#c9d6e2', '#e3d3c0', '#b7c8d6', '#e8d9b0'];

export function buildCity(scene) {
  const rng = mulberry32(20261117);
  const buildings = [];   // collision AABBs: { minX, maxX, minZ, maxZ }
  const clouds = [];
  const lampHeads = [];

  // --- Sky, light, fog -------------------------------------------------
  scene.background = new THREE.Color(0x9fd0ee);
  scene.fog = new THREE.Fog(0xcfe0ea, 200, 520);
  const sun = new THREE.DirectionalLight(0xffe6bf, 2.4);
  sun.position.set(140, 190, 90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -190;
  sun.shadow.camera.right = 190;
  sun.shadow.camera.top = 190;
  sun.shadow.camera.bottom = -190;
  sun.shadow.camera.far = 600;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5f, 0.9));
  const ambient = new THREE.AmbientLight(0xfff2dd, 0.35);
  scene.add(ambient);

  // --- Ground, beach, water -------------------------------------------
  const grassMat = new THREE.MeshLambertMaterial({ color: 0x8fae7d });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(CITY.groundSize, CITY.groundSize), grassMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const sandMat = new THREE.MeshLambertMaterial({ color: 0xe9d6a4 });
  const beach = new THREE.Mesh(new THREE.PlaneGeometry(CITY.groundSize, 46), sandMat);
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(0, 0.02, 173);
  beach.receiveShadow = true;
  scene.add(beach);

  const waterMat = new THREE.MeshLambertMaterial({ color: 0x2f7fb8, transparent: true, opacity: 0.92 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(CITY.groundSize, 120), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.05, 256);
  scene.add(water);
  // A second, lighter water sheet that drifts slowly (animated in update).
  const shimmerMat = new THREE.MeshLambertMaterial({ color: 0x7fc4e8, transparent: true, opacity: 0.25 });
  const shimmer = new THREE.Mesh(new THREE.PlaneGeometry(CITY.groundSize, 120), shimmerMat);
  shimmer.rotation.x = -Math.PI / 2;
  shimmer.position.set(0, 0.08, 256);
  scene.add(shimmer);

  // --- Roads ------------------------------------------------------------
  const roadTex = roadTexture();
  roadTex.wrapS = THREE.RepeatWrapping;
  roadTex.wrapT = THREE.RepeatWrapping;
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  const roadLen = CITY.half * 2 + 24;
  for (let i = 0; i <= CITY.blocks; i++) {
    const c = -CITY.half + i * CITY.pitch;
    const texX = roadTex.clone();
    texX.needsUpdate = true;
    texX.repeat.set(1, roadLen / 16);
    const rx = new THREE.Mesh(new THREE.PlaneGeometry(10, roadLen), new THREE.MeshLambertMaterial({ map: texX }));
    rx.rotation.x = -Math.PI / 2;
    rx.position.set(c, 0.03, 0);
    rx.receiveShadow = true;
    scene.add(rx);
    const texZ = roadTex.clone();
    texZ.needsUpdate = true;
    texZ.repeat.set(1, roadLen / 16);
    const rz = new THREE.Mesh(new THREE.PlaneGeometry(10, roadLen), new THREE.MeshLambertMaterial({ map: texZ }));
    rz.rotation.x = -Math.PI / 2;
    rz.rotation.z = Math.PI / 2;
    rz.position.set(0, 0.03, c);
    rz.receiveShadow = true;
    scene.add(rz);
  }

  // --- Sidewalks --------------------------------------------------------
  const walkMat = new THREE.MeshLambertMaterial({ color: 0xcac2ae });
  const walkGeo = new THREE.PlaneGeometry(CITY.pitch - 10, CITY.pitch - 10);
  for (let bx = 0; bx < CITY.blocks; bx++) {
    for (let bz = 0; bz < CITY.blocks; bz++) {
      const cx = -CITY.half + CITY.pitch / 2 + bx * CITY.pitch;
      const cz = -CITY.half + CITY.pitch / 2 + bz * CITY.pitch;
      const walk = new THREE.Mesh(walkGeo, walkMat);
      walk.rotation.x = -Math.PI / 2;
      walk.position.set(cx, 0.04, cz);
      walk.receiveShadow = true;
      scene.add(walk);
    }
  }

  // --- Buildings --------------------------------------------------------
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x5a5148 });
  const acMat = new THREE.MeshLambertMaterial({ color: 0x9aa0a3 });
  const plazaBlock = { x: 0, z: 0 };   // the central plaza, no buildings
  const parkBlock = { x: 3, z: -3 };   // a park block, trees instead
  for (let bx = 0; bx < CITY.blocks; bx++) {
    for (let bz = 0; bz < CITY.blocks; bz++) {
      const cx = -CITY.half + CITY.pitch / 2 + bx * CITY.pitch;
      const cz = -CITY.half + CITY.pitch / 2 + bz * CITY.pitch;
      if (bx === plazaBlock.x + 4 && bz === plazaBlock.z + 4) continue;
      if (bx === parkBlock.x + 4 && bz === parkBlock.z + 4) continue;
      const distCentre = Math.hypot(cx, cz);
      const downtown = distCentre < 55;
      const count = downtown ? (rng() < 0.5 ? 2 : 1) : (rng() < 0.6 ? 2 : 3);
      for (let k = 0; k < count; k++) {
        const w = 9 + rng() * 9;
        const d = 9 + rng() * 9;
        const h = downtown
          ? 22 + rng() * 34
          : 7 + rng() * (distCentre < 100 ? 14 : 8);
        const ox = (rng() - 0.5) * (CITY.pitch - 12 - w);
        const oz = (rng() - 0.5) * (CITY.pitch - 12 - d);
        const x = cx + ox;
        const z = cz + oz;
        const base = downtown && h > 30 ? randomPick(rng, TOWER_COLORS) : randomPick(rng, PALETTE);
        const floors = Math.max(2, Math.round(h / 4));
        const tex = buildingTexture(base, floors, rng);
        const mat = new THREE.MeshLambertMaterial({ map: tex });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        mesh.position.set(x, h / 2, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6), roofMat);
        roof.position.set(x, h + 0.25, z);
        scene.add(roof);
        if (rng() < 0.7) {
          const ac = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1, 2.2), acMat);
          ac.position.set(x + (rng() - 0.5) * w * 0.5, h + 1, z + (rng() - 0.5) * d * 0.5);
          scene.add(ac);
        }
        buildings.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
      }
    }
  }

  // --- Central plaza: fountain, benches, palms (block centre 18, 18) ------
  const plazaX = 18, plazaZ = 18;
  const basinMat = new THREE.MeshLambertMaterial({ color: 0xb9c4c9 });
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.6, 1.1, 24), basinMat);
  basin.position.set(plazaX, 0.55, plazaZ);
  basin.castShadow = true;
  scene.add(basin);
  const poolMat = new THREE.MeshLambertMaterial({ color: 0x4fa8d8 });
  const pool = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.2, 0.3, 24), poolMat);
  pool.position.set(plazaX, 1.0, plazaZ);
  scene.add(pool);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 3.4, 12), basinMat);
  column.position.set(plazaX, 2.6, plazaZ);
  column.castShadow = true;
  scene.add(column);
  const top = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 8), poolMat);
  top.position.set(plazaX, 4.6, plazaZ);
  scene.add(top);
  const benchMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const bench = new THREE.Mesh(new THREE.BoxGeometry(3, 0.5, 1), benchMat);
    bench.position.set(plazaX + Math.cos(a) * 11, 0.5, plazaZ + Math.sin(a) * 11);
    bench.rotation.y = -a + Math.PI / 2;
    bench.castShadow = true;
    scene.add(bench);
  }

  // --- Park block: lawn, trees, paths ------------------------------------
  const parkX = -CITY.half + CITY.pitch / 2 + (parkBlock.x + 4) * CITY.pitch;
  const parkZ = -CITY.half + CITY.pitch / 2 + (parkBlock.z + 4) * CITY.pitch;
  const lawnMat = new THREE.MeshLambertMaterial({ color: 0x6fa055 });
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(CITY.pitch - 12, CITY.pitch - 12), lawnMat);
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(parkX, 0.06, parkZ);
  lawn.receiveShadow = true;
  scene.add(lawn);

  // --- Palm trees and street lamps --------------------------------------
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b48 });
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f8f4f });
  const lampPoleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
  const lampGlowMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0xffe9a0, emissiveIntensity: 0.7 });
  function makePalm(x, z, scale) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * scale, 0.34 * scale, 6 * scale, 7), trunkMat);
    trunk.position.y = 3 * scale;
    trunk.castShadow = true;
    g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.55 * scale, 3.4 * scale, 4), frondMat);
      const a = (i / 6) * Math.PI * 2;
      frond.position.set(Math.cos(a) * 1.2 * scale, 6.2 * scale, Math.sin(a) * 1.2 * scale);
      frond.rotation.z = Math.cos(a) * 1.1;
      frond.rotation.x = -Math.sin(a) * 1.1;
      frond.castShadow = true;
      g.add(frond);
    }
    g.position.set(x, 0, z);
    scene.add(g);
    return g;
  }
  function makeLamp(x, z) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.4, 6), lampPoleMat);
    pole.position.y = 2.7;
    pole.castShadow = true;
    g.add(pole);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), lampGlowMat);
    head.position.y = 5.5;
    g.add(head);
    lampHeads.push(head);
    g.position.set(x, 0, z);
    scene.add(g);
  }
  for (let i = 0; i <= CITY.blocks; i++) {
    const c = -CITY.half + i * CITY.pitch;
    for (let j = 0; j < 4; j++) {
      const t = -CITY.half + 20 + j * 72 + rng() * 20;
      if (rng() < 0.75) makePalm(c + 7.5, t, 0.9 + rng() * 0.5);
      if (rng() < 0.6) makeLamp(c - 7.5, t + 18);
      if (rng() < 0.6) makePalm(t, c + 7.5, 0.9 + rng() * 0.5);
      if (rng() < 0.5) makeLamp(t + 18, c - 7.5);
    }
  }
  // Park trees and plaza palms.
  for (let i = 0; i < 8; i++) makePalm(parkX + (rng() - 0.5) * 20, parkZ + (rng() - 0.5) * 20, 1 + rng() * 0.4);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    makePalm(plazaX + Math.cos(a) * 14, plazaZ + Math.sin(a) * 14, 1.1);
  }
  // Beach umbrellas.
  const umbrellaMat = new THREE.MeshLambertMaterial({ color: 0xe85d5d });
  const umbrellaMat2 = new THREE.MeshLambertMaterial({ color: 0x4fa8d8 });
  for (let i = 0; i < 7; i++) {
    const x = -120 + i * 40 + rng() * 12;
    const z = 168 + rng() * 8;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6), lampPoleMat);
    pole.position.set(x, 1.2, z);
    scene.add(pole);
    const topMesh = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1, 8), i % 2 ? umbrellaMat : umbrellaMat2);
    topMesh.position.set(x, 2.7, z);
    topMesh.castShadow = true;
    scene.add(topMesh);
  }

  // --- Billboards --------------------------------------------------------
  const signs = [
    { text: 'SOLMAR', sub: 'CITY OF GOLD', bg: '#1d3557', fg: '#f7c948', x: -90, z: -140, ry: 0 },
    { text: 'HOTEL', sub: 'MIRAMAR', bg: '#7a2e3a', fg: '#ffe9c9', x: 108, z: -108, ry: Math.PI / 2 },
    { text: 'TACO', sub: 'BARN', bg: '#e07b39', fg: '#fff3d6', x: 72, z: 108, ry: Math.PI },
    { text: 'NEON', sub: 'PIER', bg: '#20303a', fg: '#7fe7d2', x: -36, z: 150, ry: 0 },
  ];
  for (const s of signs) {
    const tex = signTexture(s.text, s.sub, s.bg, s.fg);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 6),
      new THREE.MeshLambertMaterial({ map: tex })
    );
    board.position.set(s.x, 12, s.z);
    board.rotation.y = s.ry;
    scene.add(board);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, 9, 0.8), lampPoleMat);
    post.position.set(s.x, 4.5, s.z);
    scene.add(post);
  }

  // --- Mountains to the north --------------------------------------------
  const mountainMat = new THREE.MeshLambertMaterial({ color: 0x7d8a7a });
  const mountainMat2 = new THREE.MeshLambertMaterial({ color: 0x6a7a72 });
  for (let i = 0; i < 7; i++) {
    const h = 70 + rng() * 60;
    const m = new THREE.Mesh(new THREE.ConeGeometry(55 + rng() * 30, h, 7), i % 2 ? mountainMat : mountainMat2);
    m.position.set(-260 + i * 85 + rng() * 20, h / 2 - 4, -235 - rng() * 40);
    scene.add(m);
  }

  // --- Clouds -------------------------------------------------------------
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
  for (let i = 0; i < 9; i++) {
    const g = new THREE.Group();
    const n = 3 + Math.floor(rng() * 3);
    for (let k = 0; k < n; k++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(6 + rng() * 7, 10, 8), cloudMat);
      s.position.set((rng() - 0.5) * 18, (rng() - 0.5) * 3, (rng() - 0.5) * 8);
      s.scale.y = 0.45;
      g.add(s);
    }
    g.position.set((rng() - 0.5) * 420, 85 + rng() * 35, (rng() - 0.5) * 420);
    scene.add(g);
    clouds.push(g);
  }

  // --- Collision: push a circle (x,z,radius) out of every building AABB.
  function resolveCollision(pos, radius) {
    let hit = false;
    for (const b of buildings) {
      if (pos.x > b.minX - radius && pos.x < b.maxX + radius && pos.z > b.minZ - radius && pos.z < b.maxZ + radius) {
        const pushLeft = pos.x - (b.minX - radius);
        const pushRight = (b.maxX + radius) - pos.x;
        const pushBack = pos.z - (b.minZ - radius);
        const pushFront = (b.maxZ + radius) - pos.z;
        const min = Math.min(pushLeft, pushRight, pushBack, pushFront);
        if (min === pushLeft) pos.x = b.minX - radius;
        else if (min === pushRight) pos.x = b.maxX + radius;
        else if (min === pushBack) pos.z = b.minZ - radius;
        else pos.z = b.maxZ + radius;
        hit = true;
      }
    }
    return hit;
  }

  function randomRoadPoint(rngFn) {
    const axis = rngFn() < 0.5 ? 'x' : 'z';
    const road = -CITY.half + Math.floor(rngFn() * (CITY.blocks + 1)) * CITY.pitch;
    const along = (rngFn() - 0.5) * CITY.half * 1.6;
    return axis === 'x' ? { x: along, z: road } : { x: road, z: along };
  }

  function update(dt, time) {
    for (const c of clouds) {
      c.position.x += dt * 1.2;
      if (c.position.x > 240) c.position.x = -240;
    }
    shimmer.position.x = Math.sin(time * 0.05) * 6;
    for (let i = 0; i < lampHeads.length; i++) {
      lampHeads[i].material.emissiveIntensity = 0.55 + Math.sin(time * 2 + i) * 0.15;
    }
  }

  return {
    buildings,
    resolveCollision,
    randomRoadPoint,
    update,
    plaza: { x: plazaX, z: plazaZ },
    beach: { x: 0, z: 170 },
    pier: { x: -36, z: 150 },
    hotel: { x: 90, z: -90 },
    bank: { x: 18, z: -18 },
    safehouse: { x: -126, z: 126 },
  };
}
