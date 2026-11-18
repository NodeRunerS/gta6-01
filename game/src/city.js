// Solmar City itself: an 8x8-block coastal city on a road grid, built once from a
// seeded RNG so it looks the same every load. Roads, sidewalks, ~120 buildings,
// a plaza with a fountain, a park, a beach with sea and a marina, mountains and
// drifting clouds. Returns the building colliders and a per-frame update (clouds).
import * as THREE from '../vendor/three.module.min.js';
import { S } from './state.js';
import { clamp, mulberry32, pick, rand, randInt } from './util.js';
import {
  createBillboardMaterials,
  createFacadeSet,
  createNeonMaterials,
  createSeaTexture,
  createSkyDome,
} from './facades.js';

export const CITY = {
  PITCH: 56, // block (44) + road (12)
  HALF: 224, // city spans -224..224 on both axes
  LINES: [-224, -168, -112, -56, 0, 56, 112, 168, 224], // road center lines
  BLOCKS: [-196, -140, -84, -28, 28, 84, 140, 196], // block centers
  PLAZA: { x: -28, z: -28 },
  PARK: { x: 140, z: 140 },
};

export function buildCity() {
  const scene = S.scene;
  const rng = mulberry32(20261118);
  const colliders = [];

  // --- dusk sky, fog, lights --------------------------------------------------
  // Pink-orange sunset gradient sky dome (vertex colors, no texture fetch),
  // warm fog that blends into the horizon, golden-hour sun.
  scene.add(createSkyDome());
  scene.fog = new THREE.Fog(0xef9a72, 260, 900);
  const hemi = new THREE.HemisphereLight(0xffd0b0, 0x4a3a4a, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb36b, 1.9);
  sun.position.set(-180, 220, 120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 800;
  scene.add(sun);

  // --- ground, beach, sea ---------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1100, 1100),
    new THREE.MeshLambertMaterial({ color: 0x6f9e57 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const sand = new THREE.Mesh(
    new THREE.BoxGeometry(460, 0.4, 56),
    new THREE.MeshLambertMaterial({ color: 0xe8d29a }),
  );
  sand.position.set(0, 0.2, 252);
  sand.receiveShadow = true;
  scene.add(sand);

  // Animated sea: scrolling wave texture; the foam strip at the shoreline
  // breathes with the tide (pulsed in update()).
  const seaTex = createSeaTexture();
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(1100, 420),
    new THREE.MeshLambertMaterial({ map: seaTex, transparent: true, opacity: 0.96 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.1, 490);
  scene.add(sea);
  const foam = new THREE.Mesh(
    new THREE.PlaneGeometry(1100, 7),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 }),
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(0, 0.18, 281);
  scene.add(foam);

  // Boardwalk along the beach front.
  const boardwalk = new THREE.Mesh(
    new THREE.BoxGeometry(460, 0.5, 8),
    new THREE.MeshLambertMaterial({ color: 0x9a7b4f }),
  );
  boardwalk.position.set(0, 0.25, 236);
  boardwalk.receiveShadow = true;
  scene.add(boardwalk);

  // --- roads and sidewalks --------------------------------------------------
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x3a3d42 });
  const walkMat = new THREE.MeshLambertMaterial({ color: 0xb9b3a4 });
  const roadGeoH = new THREE.BoxGeometry(460, 0.1, 12);
  const roadGeoV = new THREE.BoxGeometry(12, 0.1, 460);
  for (const line of CITY.LINES) {
    const h = new THREE.Mesh(roadGeoH, roadMat);
    h.position.set(0, 0.05, line);
    h.receiveShadow = true;
    scene.add(h);
    const v = new THREE.Mesh(roadGeoV, roadMat);
    v.position.set(line, 0.05, 0);
    v.receiveShadow = true;
    scene.add(v);
    // Sidewalks on both sides of each road.
    for (const off of [-8, 8]) {
      const sh = new THREE.Mesh(new THREE.BoxGeometry(460, 0.16, 4), walkMat);
      sh.position.set(0, 0.08, line + off);
      sh.receiveShadow = true;
      scene.add(sh);
      const sv = new THREE.Mesh(new THREE.BoxGeometry(4, 0.16, 460), walkMat);
      sv.position.set(line + off, 0.08, 0);
      sv.receiveShadow = true;
      scene.add(sv);
    }
  }
  // Dashed center lines, one InstancedMesh for all roads.
  const dashGeo = new THREE.BoxGeometry(0.6, 0.06, 5);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5e9c8 });
  const dashCount = CITY.LINES.length * 2 * 30;
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashCount);
  const m4 = new THREE.Matrix4();
  let di = 0;
  for (const line of CITY.LINES) {
    for (let k = 0; k < 30; k++) {
      const t = -217 + k * 14.8;
      m4.makeTranslation(t, 0.12, line);
      dashes.setMatrixAt(di++, m4);
      m4.makeTranslation(line, 0.12, t);
      dashes.setMatrixAt(di++, m4);
    }
  }
  dashes.count = di;
  scene.add(dashes);

  // --- buildings ------------------------------------------------------------
  // Districts give the city its character: glass towers downtown, pastel
  // art-deco hotels on the beachfront, brick mid-rise everywhere else, and a
  // rougher industrial corner. Facades are shared canvas textures (window
  // grids, lit windows, storefronts) so ~120 buildings cost 21 materials.
  const facades = createFacadeSet();
  const neonMats = createNeonMaterials();
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofGeo = new THREE.BoxGeometry(1, 0.6, 1);
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x4a4a52 });
  const canopyMats = [
    new THREE.MeshLambertMaterial({ color: 0x2f7f7a }),
    new THREE.MeshLambertMaterial({ color: 0x8a2f2f }),
    new THREE.MeshLambertMaterial({ color: 0xc2703d }),
  ];
  const balconyMat = new THREE.MeshLambertMaterial({ color: 0xe8e0d0 });
  const acMat = new THREE.MeshLambertMaterial({ color: 0x9aa0a6 });
  const antennaMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
  const tankMat = new THREE.MeshLambertMaterial({ color: 0x8a7a5a });
  const gardenMat = new THREE.MeshLambertMaterial({ color: 0x3f7a34 });
  const poolMat = new THREE.MeshLambertMaterial({ color: 0x3fa8d8, emissive: 0x0a3a55 });
  const finMat = new THREE.MeshLambertMaterial({ color: 0xf2d8a0 });
  const signBackMat = new THREE.MeshLambertMaterial({ color: 0x14101c });
  const acSpots = [];
  const antennaSpots = [];
  const towerSpots = [];
  const gardenSpots = [];
  let buildingCount = 0;

  const districtOf = (bx, bz) => {
    if (bz >= 140) return 'beach';
    if (bx <= -140 && bz <= -84) return 'industrial';
    if (Math.hypot(bx, bz) < 95) return 'downtown';
    return 'mid';
  };

  const addRoofProps = (x, z, w, d, h, district) => {
    if (h > 12) {
      const n = randInt(rng, 1, 2);
      for (let k = 0; k < n; k++) {
        acSpots.push({ x: x + rand(rng, -w / 4, w / 4), y: h + 0.9, z: z + rand(rng, -d / 4, d / 4) });
      }
    }
    if (h > 18 && rng() < 0.3) {
      antennaSpots.push({ x: x + w * 0.32, y: h + 2.5, z: z + d * 0.32, h: rand(rng, 4, 7) });
    }
    if (h > 10 && h < 22 && rng() < 0.08 && towerSpots.length < 8) {
      towerSpots.push({ x: x + rand(rng, -w / 5, w / 5), y: h + 2.2, z: z + rand(rng, -d / 5, d / 5) });
    }
    if (h > 12 && h < 26 && rng() < 0.06 && gardenSpots.length < 6) {
      gardenSpots.push({ x, y: h + 0.75, z, w, d });
    }
  };

  for (const bx of CITY.BLOCKS) {
    for (const bz of CITY.BLOCKS) {
      if (bx === CITY.PLAZA.x && bz === CITY.PLAZA.z) continue; // plaza
      if (bx === CITY.PARK.x && bz === CITY.PARK.z) continue; // park
      const district = districtOf(bx, bz);
      const distCenter = Math.hypot(bx, bz);
      const tallness = clamp(1.35 - distCenter / 260, 0.55, 1.35);

      // Industrial corner: low warehouses, a silo and shipping containers.
      if (district === 'industrial') {
        const n = randInt(rng, 1, 2);
        for (let i = 0; i < n; i++) {
          const w = rand(rng, 22, 30);
          const d = rand(rng, 14, 20);
          const h = rand(rng, 6, 9);
          const x = bx + rand(rng, -6, 6);
          const z = bz + rand(rng, -6, 6);
          const b = new THREE.Mesh(boxGeo, facades.facadeFor('industrial', h, rng));
          b.scale.set(w, h, d);
          b.position.set(x, h / 2, z);
          b.castShadow = true;
          b.receiveShadow = true;
          scene.add(b);
          const roof = new THREE.Mesh(roofGeo, roofMat);
          roof.scale.set(w * 0.92, 1, d * 0.92);
          roof.position.set(x, h + 0.3, z);
          scene.add(roof);
          colliders.push({ minX: x - w / 2 - 0.4, maxX: x + w / 2 + 0.4, minZ: z - d / 2 - 0.4, maxZ: z + d / 2 + 0.4 });
          buildingCount++;
        }
        // Silo + containers.
        const silo = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 11, 12), tankMat);
        silo.position.set(bx + 14, 5.5, bz - 12);
        silo.castShadow = true;
        scene.add(silo);
        const siloTop = new THREE.Mesh(new THREE.ConeGeometry(2.6, 2, 12), roofMat);
        siloTop.position.set(bx + 14, 12, bz - 12);
        scene.add(siloTop);
        colliders.push({ minX: bx + 11.4, maxX: bx + 16.6, minZ: bz - 14.6, maxZ: bz - 9.4 });
        const contCols = [0x9a3a2a, 0x3a6ea8, 0x4a7a3a];
        for (let k = 0; k < 3; k++) {
          const cont = new THREE.Mesh(
            boxGeo,
            new THREE.MeshLambertMaterial({ color: contCols[k % 3] }),
          );
          cont.scale.set(6.2, 2.6, 2.6);
          cont.position.set(bx - 12 + k * 1.5, 1.3, bz + 14 - k * 7);
          cont.rotation.y = k % 2 ? 0.12 : -0.08;
          cont.castShadow = true;
          scene.add(cont);
        }
        continue;
      }

      const n = randInt(rng, 1, 3);
      for (let i = 0; i < n; i++) {
        const w = rand(rng, 11, 19);
        const d = rand(rng, 11, 19);
        const h = rand(rng, 8, 34) * tallness * (district === 'downtown' ? 1.25 : 1) + 4;
        const ox = rand(rng, -9, 9);
        const oz = rand(rng, -9, 9);
        const x = bx + ox;
        const z = bz + oz;
        if (Math.abs(x) + Math.abs(z) > 430) continue;
        const mat = facades.facadeFor(district, h, rng);
        const b = new THREE.Mesh(boxGeo, mat);
        b.scale.set(w, h, d);
        b.position.set(x, h / 2, z);
        b.castShadow = true;
        b.receiveShadow = true;
        scene.add(b);
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.scale.set(w * 0.92, 1, d * 0.92);
        roof.position.set(x, h + 0.3, z);
        scene.add(roof);

        // Stepped setback on tall towers (+ art-deco fin on beach hotels).
        if (h > 26) {
          const up = new THREE.Mesh(boxGeo, mat);
          up.scale.set(w * 0.62, h * 0.3, d * 0.62);
          up.position.set(x, h + h * 0.15, z);
          up.castShadow = true;
          scene.add(up);
          const cap = new THREE.Mesh(roofGeo, roofMat);
          cap.scale.set(w * 0.58, 1, d * 0.58);
          cap.position.set(x, h + h * 0.3 + 0.3, z);
          scene.add(cap);
        } else if (district === 'beach' && h > 14) {
          const fin = new THREE.Mesh(boxGeo, finMat);
          fin.scale.set(0.9, 6.5, 0.9);
          fin.position.set(x, h + 3.2, z + d * 0.28);
          fin.castShadow = true;
          scene.add(fin);
        }

        // Entrance canopy over the storefront (street-level depth).
        if (h < 20 && rng() < 0.55) {
          const can = new THREE.Mesh(boxGeo, pick(rng, canopyMats));
          can.scale.set(w * 0.55, 0.14, 1.7);
          can.position.set(x, 3.5, z + d / 2 + 0.75);
          can.rotation.x = -0.32;
          can.castShadow = true;
          scene.add(can);
        }
        // Balconies on beachfront hotels.
        if (district === 'beach' && h > 12) {
          const floors = Math.min(3, Math.floor(h / 7));
          for (let f = 0; f < floors; f++) {
            const bal = new THREE.Mesh(boxGeo, balconyMat);
            bal.scale.set(w * 0.3, 0.16, 1.2);
            bal.position.set(x + (f % 2 ? w * 0.22 : -w * 0.22), 5.5 + f * 3.6, z + d / 2 + 0.5);
            scene.add(bal);
          }
        }
        // Vertical neon sign on taller downtown / beach buildings.
        if (h > 16 && (district === 'downtown' || district === 'beach') && rng() < 0.45) {
          const sh = h * 0.34;
          const back = new THREE.Mesh(boxGeo, signBackMat);
          back.scale.set(1.7, sh + 0.3, 0.3);
          back.position.set(x + w * 0.18, h * 0.62, z + d / 2 + 0.18);
          scene.add(back);
          const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, sh), pick(rng, neonMats));
          sign.position.set(x + w * 0.18, h * 0.62, z + d / 2 + 0.36);
          scene.add(sign);
        }

        addRoofProps(x, z, w, d, h, district);
        colliders.push({ minX: x - w / 2 - 0.4, maxX: x + w / 2 + 0.4, minZ: z - d / 2 - 0.4, maxZ: z + d / 2 + 0.4 });
        buildingCount++;
      }
    }
  }

  // --- rooftop props (instanced: one draw call per prop kind) ----------------
  if (acSpots.length > 0) {
    const ac = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 0.8, 1.4), acMat, acSpots.length);
    acSpots.forEach((p, i) => {
      m4.makeRotationY(i % 2 ? 0.3 : -0.2);
      m4.setPosition(p.x, p.y, p.z);
      ac.setMatrixAt(i, m4);
    });
    ac.castShadow = true;
    scene.add(ac);
  }
  if (antennaSpots.length > 0) {
    const ant = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.14, 1, 5), antennaMat, antennaSpots.length);
    antennaSpots.forEach((p, i) => {
      m4.makeScale(1, p.h, 1);
      m4.setPosition(p.x, p.y, p.z);
      ant.setMatrixAt(i, m4);
    });
    scene.add(ant);
  }
  if (towerSpots.length > 0) {
    const tank = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.7, 1.7, 3.2, 10), tankMat, towerSpots.length);
    const cone = new THREE.InstancedMesh(new THREE.ConeGeometry(1.9, 1.4, 10), roofMat, towerSpots.length);
    towerSpots.forEach((p, i) => {
      m4.identity();
      m4.setPosition(p.x, p.y, p.z);
      tank.setMatrixAt(i, m4);
      m4.identity();
      m4.setPosition(p.x, p.y + 2.3, p.z);
      cone.setMatrixAt(i, m4);
    });
    tank.castShadow = true;
    scene.add(tank);
    scene.add(cone);
  }
  for (const g of gardenSpots) {
    const lawn = new THREE.Mesh(boxGeo, gardenMat);
    lawn.scale.set(g.w * 0.45, 0.35, g.d * 0.45);
    lawn.position.set(g.x - g.w * 0.12, g.y, g.z);
    scene.add(lawn);
    const pool = new THREE.Mesh(boxGeo, poolMat);
    pool.scale.set(g.w * 0.22, 0.3, g.d * 0.3);
    pool.position.set(g.x + g.w * 0.22, g.y, g.z + g.d * 0.1);
    scene.add(pool);
  }

  // --- palm trees: instanced trunks + fronds ---------------------------------
  const palmSpots = [];
  for (let x = -196; x <= 196; x += 28) palmSpots.push({ x, z: 230 });
  for (const sx of [-11, 11]) {
    for (let z = -168; z <= 168; z += 48) palmSpots.push({ x: sx, z });
  }
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.42, 7, 6);
  const palmTrunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2a });
  const trunks = new THREE.InstancedMesh(trunkGeo, palmTrunkMat, palmSpots.length);
  const frondGeo = new THREE.ConeGeometry(0.6, 3.6, 4);
  frondGeo.scale(1, 1, 0.32);
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f7a34 });
  const fronds = new THREE.InstancedMesh(frondGeo, frondMat, palmSpots.length * 6);
  const rotY = new THREE.Matrix4();
  const rotZ = new THREE.Matrix4();
  palmSpots.forEach((p, i) => {
    m4.identity();
    m4.setPosition(p.x, 3.5, p.z);
    trunks.setMatrixAt(i, m4);
    for (let f = 0; f < 6; f++) {
      const a = (f / 6) * Math.PI * 2 + i * 0.35;
      rotY.makeRotationY(a);
      rotZ.makeRotationZ(1.9);
      m4.copy(rotY).multiply(rotZ);
      m4.setPosition(p.x, 7.3, p.z);
      fronds.setMatrixAt(i * 6 + f, m4);
    }
  });
  trunks.castShadow = true;
  scene.add(trunks);
  scene.add(fronds);

  // Billboards along the beach (on the sand, facing the city — clear of roads
  // and buildings), each on two poles.
  const billMats = createBillboardMaterials();
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
  for (const [bx2, bi] of [[-168, 0], [-56, 1], [56, 2], [168, 0]]) {
    const board = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), billMats[bi]);
    board.position.set(bx2, 11, 242);
    board.rotation.y = Math.PI;
    scene.add(board);
    for (const off of [-6, 6]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 7, 6), poleMat);
      pole.position.set(bx2 + off, 3.5, 242);
      scene.add(pole);
    }
  }

  // --- plaza: paved square, fountain, benches, lamps ------------------------
  const plaza = new THREE.Mesh(
    new THREE.BoxGeometry(46, 0.3, 46),
    new THREE.MeshLambertMaterial({ color: 0xd9cfba }),
  );
  plaza.position.set(CITY.PLAZA.x, 0.15, CITY.PLAZA.z);
  plaza.receiveShadow = true;
  scene.add(plaza);
  const fountainBase = new THREE.Mesh(
    new THREE.CylinderGeometry(7, 8, 1.2, 20),
    new THREE.MeshLambertMaterial({ color: 0x9a938a }),
  );
  fountainBase.position.set(CITY.PLAZA.x, 0.6, CITY.PLAZA.z);
  fountainBase.castShadow = true;
  scene.add(fountainBase);
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(6.2, 6.2, 0.4, 20),
    new THREE.MeshLambertMaterial({ color: 0x4db2e8, emissive: 0x0a3a55 }),
  );
  water.position.set(CITY.PLAZA.x, 1.2, CITY.PLAZA.z);
  scene.add(water);
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 1.2, 3.4, 10),
    new THREE.MeshLambertMaterial({ color: 0xcfc8ba }),
  );
  pillar.position.set(CITY.PLAZA.x, 2.4, CITY.PLAZA.z);
  scene.add(pillar);
  colliders.push({ minX: CITY.PLAZA.x - 8, maxX: CITY.PLAZA.x + 8, minZ: CITY.PLAZA.z - 8, maxZ: CITY.PLAZA.z + 8 });
  for (const [lx, lz] of [[-20, -20], [20, -20], [-20, 20], [20, 20]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 6, 8), new THREE.MeshLambertMaterial({ color: 0x333333 }));
    pole.position.set(CITY.PLAZA.x + lx, 3, CITY.PLAZA.z + lz);
    scene.add(pole);
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 10, 8),
      new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffc860 }),
    );
    lamp.position.set(CITY.PLAZA.x + lx, 6.2, CITY.PLAZA.z + lz);
    scene.add(lamp);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(4, 0.8, 1.4), new THREE.MeshLambertMaterial({ color: 0x7a5a38 }));
    bench.position.set(CITY.PLAZA.x + lx * 0.6, 0.4, CITY.PLAZA.z + lz * 0.6);
    scene.add(bench);
  }

  // --- street lamps: avenues, central avenue and the beachfront boulevard --
  // Poles + glowing heads + light pools are three InstancedMeshes (3 draw
  // calls for ~79 lamps); three warm PointLights anchor the glow at the
  // plaza, downtown and the beachfront. The game is set at dusk, so the
  // lamps read clearly against the dark roads.
  const lampSpots = [];
  for (const lx of [-112, 0, 112]) {
    for (const z of [-196, -140, -84, -28, 28, 84, 140, 196]) {
      lampSpots.push({ x: lx - 8.5, z });
      lampSpots.push({ x: lx + 8.5, z });
    }
  }
  for (const x of [-196, -140, -84, -28, 28, 84, 140, 196]) {
    lampSpots.push({ x, z: -8.5 });
    lampSpots.push({ x, z: 8.5 });
  }
  for (let x = -196; x <= 196; x += 28) lampSpots.push({ x, z: 232.5 });
  const lampCount = lampSpots.length;
  const lampPoleGeo = new THREE.CylinderGeometry(0.12, 0.18, 5.2, 6);
  const lampPoleMat = new THREE.MeshLambertMaterial({ color: 0x2e2e34 });
  const lampPoles = new THREE.InstancedMesh(lampPoleGeo, lampPoleMat, lampCount);
  lampPoles.name = 'lampPoles';
  const lampHeadGeo = new THREE.SphereGeometry(0.5, 10, 8);
  const lampHeadMat = new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffc860, emissiveIntensity: 1.4 });
  const lampHeads = new THREE.InstancedMesh(lampHeadGeo, lampHeadMat, lampCount);
  lampHeads.name = 'lampHeads';
  // Warm radial pool of light on the ground (one shared canvas texture).
  const poolCanvas = document.createElement('canvas');
  poolCanvas.width = 128;
  poolCanvas.height = 128;
  const px = poolCanvas.getContext('2d');
  const grad = px.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255, 190, 90, 0.85)');
  grad.addColorStop(0.55, 'rgba(255, 170, 60, 0.28)');
  grad.addColorStop(1, 'rgba(255, 160, 50, 0)');
  px.fillStyle = grad;
  px.fillRect(0, 0, 128, 128);
  const poolTex = new THREE.CanvasTexture(poolCanvas);
  const lampPoolGeo = new THREE.CircleGeometry(5.5, 20);
  const lampPoolMat = new THREE.MeshBasicMaterial({
    map: poolTex, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const lampPools = new THREE.InstancedMesh(lampPoolGeo, lampPoolMat, lampCount);
  lampPools.name = 'lampPools';
  const poolRot = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
  lampSpots.forEach((p, i) => {
    m4.identity();
    m4.setPosition(p.x, 2.6, p.z);
    lampPoles.setMatrixAt(i, m4);
    m4.identity();
    m4.setPosition(p.x, 5.35, p.z);
    lampHeads.setMatrixAt(i, m4);
    m4.copy(poolRot);
    m4.setPosition(p.x, 0.2, p.z);
    lampPools.setMatrixAt(i, m4);
  });
  lampPoles.castShadow = false;
  scene.add(lampPoles);
  scene.add(lampHeads);
  scene.add(lampPools);
  for (const [lx, lz] of [[CITY.PLAZA.x, CITY.PLAZA.z], [0, 0], [0, 232]]) {
    const glow = new THREE.PointLight(0xffc070, 50, 38, 2);
    glow.position.set(lx, 7, lz);
    scene.add(glow);
  }

  // --- park: grass, trees, pond, paths --------------------------------------
  const park = new THREE.Mesh(
    new THREE.BoxGeometry(46, 0.3, 46),
    new THREE.MeshLambertMaterial({ color: 0x5d8a48 }),
  );
  park.position.set(CITY.PARK.x, 0.15, CITY.PARK.z);
  park.receiveShadow = true;
  scene.add(park);
  const pond = new THREE.Mesh(
    new THREE.CylinderGeometry(6, 6, 0.3, 18),
    new THREE.MeshLambertMaterial({ color: 0x3f8fc4, emissive: 0x0a2a44 }),
  );
  pond.position.set(CITY.PARK.x + 8, 0.35, CITY.PARK.z - 6);
  scene.add(pond);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2a });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f7a34 });
  const leafMat2 = new THREE.MeshLambertMaterial({ color: 0x55883f });
  const tree = (x, z, s = 1) => {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35 * s, 0.5 * s, 3 * s, 7), trunkMat);
    trunk.position.set(x, 1.5 * s, z);
    trunk.castShadow = true;
    scene.add(trunk);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(2.2 * s, 10, 8), rng() > 0.5 ? leafMat : leafMat2);
    crown.position.set(x, 4.4 * s, z);
    crown.castShadow = true;
    scene.add(crown);
  };
  for (let i = 0; i < 16; i++) {
    tree(CITY.PARK.x + rand(rng, -19, 19), CITY.PARK.z + rand(rng, -19, 19), rand(rng, 0.8, 1.4));
  }
  // A few street trees along the sidewalks.
  for (let i = 0; i < 24; i++) {
    const line = pick(rng, CITY.LINES);
    const along = rand(rng, -200, 200);
    tree(line + (rng() > 0.5 ? 10.5 : -10.5), along, rand(rng, 0.7, 1.1));
  }

  // --- beach props: umbrellas, palms, marina pier with boats ----------------
  const umbrellaMat = new THREE.MeshLambertMaterial({ color: 0xe85d3d });
  const umbrellaMat2 = new THREE.MeshLambertMaterial({ color: 0xf2c230 });
  for (let i = 0; i < 8; i++) {
    const x = rand(rng, -200, 200);
    const z = rand(rng, 236, 268);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3, 6), trunkMat);
    pole.position.set(x, 1.5, z);
    scene.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.2, 10), i % 2 ? umbrellaMat : umbrellaMat2);
    top.position.set(x, 3.4, z);
    scene.add(top);
  }
  // Marina pier at the south-east beach, with two boats.
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(8, 0.6, 60),
    new THREE.MeshLambertMaterial({ color: 0x8a6b45 }),
  );
  pier.position.set(196, 0.6, 290);
  scene.add(pier);
  const boatMat = new THREE.MeshLambertMaterial({ color: 0xf0f0f0 });
  const boatMat2 = new THREE.MeshLambertMaterial({ color: 0x3a6ea8 });
  for (const [bx, bz, bm] of [[184, 300, boatMat], [208, 310, boatMat2]]) {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(5, 2, 14), bm);
    hull.position.set(bx, 0.8, bz);
    hull.castShadow = true;
    scene.add(hull);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2, 5), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
    cab.position.set(bx, 2.6, bz - 1);
    scene.add(cab);
  }

  // --- mountains along the north edge ---------------------------------------
  const mtnMat = new THREE.MeshLambertMaterial({ color: 0x7a7568 });
  const mtnMat2 = new THREE.MeshLambertMaterial({ color: 0x8a8272 });
  for (let i = 0; i < 9; i++) {
    const x = -320 + i * 80 + rand(rng, -20, 20);
    const h = rand(rng, 60, 130);
    const mtn = new THREE.Mesh(new THREE.ConeGeometry(rand(rng, 45, 70), h, 7), i % 2 ? mtnMat : mtnMat2);
    mtn.position.set(x, h / 2 - 2, -300 - rand(rng, 0, 60));
    scene.add(mtn);
  }

  // --- clouds ----------------------------------------------------------------
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xfff6e8, transparent: true, opacity: 0.92 });
  const clouds = [];
  for (let i = 0; i < 10; i++) {
    const group = new THREE.Group();
    const n = randInt(rng, 3, 5);
    for (let j = 0; j < n; j++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(rand(rng, 8, 16), 10, 8), cloudMat);
      puff.position.set(j * rand(rng, 8, 14) - n * 6, rand(rng, -2, 2), rand(rng, -6, 6));
      puff.scale.y = 0.45;
      group.add(puff);
    }
    group.position.set(rand(rng, -320, 320), rand(rng, 95, 135), rand(rng, -320, 320));
    scene.add(group);
    clouds.push(group);
  }

  // Sun disc in the sky for the golden-hour look.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(26, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff2c0, fog: false }),
  );
  sunDisc.position.set(-320, 150, -420);
  sunDisc.lookAt(0, 60, 0);
  scene.add(sunDisc);

  return {
    colliders,
    buildingCount,
    lampCount,
    update(dt) {
      for (const c of clouds) {
        c.position.x += dt * 1.6;
        if (c.position.x > 360) c.position.x = -360;
      }
      // Gentle sea shimmer + scrolling waves + breathing shoreline foam.
      sea.position.y = 0.1 + Math.sin(S.time * 0.5) * 0.05;
      seaTex.offset.x += dt * 0.02;
      foam.material.opacity = 0.32 + 0.14 * Math.sin(S.time * 1.1);
    },
  };
}
