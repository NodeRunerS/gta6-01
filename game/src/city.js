// Solmar City itself: an 8x8-block coastal city on a road grid, built once from a
// seeded RNG so it looks the same every load. Roads, sidewalks, ~120 buildings,
// a plaza with a fountain, a park, a beach with sea and a marina, mountains and
// drifting clouds. Returns the building colliders and a per-frame update (clouds).
import * as THREE from '../vendor/three.module.min.js';
import { S } from './state.js';
import { clamp, mulberry32, pick, rand, randInt } from './util.js';

export const CITY = {
  PITCH: 56, // block (44) + road (12)
  HALF: 224, // city spans -224..224 on both axes
  LINES: [-224, -168, -112, -56, 0, 56, 112, 168, 224], // road center lines
  BLOCKS: [-196, -140, -84, -28, 28, 84, 140, 196], // block centers
  PLAZA: { x: -28, z: -28 },
  PARK: { x: 140, z: 140 },
};

const BUILDING_COLORS = [0xc9a06a, 0x8fa3b8, 0xb98d7a, 0x9fb4c7, 0xd8c39a, 0x7e8fa3, 0xc4b49a, 0xa8b0b8, 0xe0d0b0];

export function buildCity() {
  const scene = S.scene;
  const rng = mulberry32(20261118);
  const colliders = [];

  // --- sky, fog, lights -----------------------------------------------------
  scene.background = new THREE.Color(0xffd9a8);
  scene.fog = new THREE.Fog(0xf2c98f, 260, 900);
  const hemi = new THREE.HemisphereLight(0xffe6c0, 0x5d6b52, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffc978, 1.9);
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

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(1100, 420),
    new THREE.MeshLambertMaterial({ color: 0x2f7fb8, transparent: true, opacity: 0.92 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.1, 490);
  scene.add(sea);

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
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofGeo = new THREE.BoxGeometry(1, 0.6, 1);
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x4a4a52 });
  const mats = BUILDING_COLORS.map((c) => new THREE.MeshLambertMaterial({ color: c }));
  const winMat = new THREE.MeshLambertMaterial({ color: 0x2c3e55, emissive: 0x223344 });
  let buildingCount = 0;
  for (const bx of CITY.BLOCKS) {
    for (const bz of CITY.BLOCKS) {
      if (bx === CITY.PLAZA.x && bz === CITY.PLAZA.z) continue; // plaza
      if (bx === CITY.PARK.x && bz === CITY.PARK.z) continue; // park
      const distCenter = Math.hypot(bx, bz);
      const tallness = clamp(1.35 - distCenter / 260, 0.55, 1.35);
      const n = randInt(rng, 1, 3);
      for (let i = 0; i < n; i++) {
        const w = rand(rng, 11, 19);
        const d = rand(rng, 11, 19);
        const h = rand(rng, 8, 34) * tallness + 4;
        const ox = rand(rng, -9, 9);
        const oz = rand(rng, -9, 9);
        const x = bx + ox;
        const z = bz + oz;
        if (Math.abs(x) + Math.abs(z) > 430) continue;
        const mat = pick(rng, mats);
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
        // Window band: a slightly inset dark slab on the front face.
        if (h > 14) {
          const win = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, h * 0.45, 0.3), winMat);
          win.position.set(x, h * 0.55, z + d / 2 + 0.05);
          scene.add(win);
        }
        colliders.push({ minX: x - w / 2 - 0.4, maxX: x + w / 2 + 0.4, minZ: z - d / 2 - 0.4, maxZ: z + d / 2 + 0.4 });
        buildingCount++;
      }
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
    update(dt) {
      for (const c of clouds) {
        c.position.x += dt * 1.6;
        if (c.position.x > 360) c.position.x = -360;
      }
      // Gentle sea shimmer.
      sea.position.y = 0.1 + Math.sin(S.time * 0.5) * 0.05;
    },
  };
}
