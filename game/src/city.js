// City builder for Solmar City: Streets of Gold.
// Two islands, a turquoise bay, three bridges, a mansion island, Ocean Beach,
// downtown, port, military base, mall and a Cuban/Haitian district — all
// procedural, dusk-lit, with neon, palms and street lamps.
import * as THREE from 'three';
import { S, WORLD } from './state.js';
import { mulberry32, pick, clamp } from './util.js';
import {
  glassTexture, decoTexture, brickTexture, houseTexture,
  signTexture, waterTexture, skyTexture,
} from './facades.js';

const rng = mulberry32(1986);

function box(w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.y = h / 2;
  return m;
}

function flatMat(color) {
  return new THREE.MeshLambertMaterial({ color });
}

function neonSign(scene, text, color, x, y, z, ry, w = 18) {
  const tex = signTexture(text, color);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  scene.add(m);
  return m;
}

export function buildCity(scene) {
  const mats = {
    groundWest: flatMat(0x3d4a3f),
    groundEast: flatMat(0x4a4438),
    groundMansion: flatMat(0x46543f),
    sand: flatMat(0xe8d5a0),
    road: flatMat(0x23232b),
    bridge: flatMat(0x2e2e3a),
    water: new THREE.MeshPhongMaterial({
      map: waterTexture(), color: 0x35b8d8, emissive: 0x0e5a70, emissiveIntensity: 0.7, shininess: 120, specular: 0x99ddff,
    }),
    concrete: flatMat(0x8a8a86),
    white: flatMat(0xf2ead8),
    dark: flatMat(0x1c1c22),
  };
  S._waterMat = mats.water;

  // --- Sky dome, sun, fog, lights ---
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);
  scene.fog = new THREE.Fog(0xc97a6d, 220, 780);
  scene.add(new THREE.HemisphereLight(0xffb3d9, 0x3a2a4a, 0.85));
  const sun = new THREE.DirectionalLight(0xffb36b, 1.7);
  sun.position.set(-320, 130, 90);
  scene.add(sun);
  const sunSprite = new THREE.Mesh(
    new THREE.CircleGeometry(46, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, fog: false }),
  );
  sunSprite.position.set(-620, 105, 60);
  sunSprite.lookAt(0, 60, 0);
  scene.add(sunSprite);

  // --- Water: bay + surrounding sea ---
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1100, 900), mats.water);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.5, 0);
  scene.add(water);

  // --- Land masses ---
  function land(x0, x1, z0, z1, mat, top = 0) {
    const m = box(x1 - x0, 1.2, z1 - z0, mat);
    m.position.set((x0 + x1) / 2, top - 1.2, (z0 + z1) / 2);
    scene.add(m);
    return m;
  }
  land(WORLD.west.x0, WORLD.west.x1, WORLD.west.z0, WORLD.west.z1, mats.groundWest);
  land(WORLD.east.x0, WORLD.east.x1, WORLD.east.z0, WORLD.east.z1, mats.groundEast);
  land(WORLD.mansion.x0, WORLD.mansion.x1, WORLD.mansion.z0, WORLD.mansion.z1, mats.groundMansion);
  land(WORLD.beach.x0, WORLD.beach.x1, WORLD.beach.z0, WORLD.beach.z1, mats.sand);
  land(WORLD.causeway.x0, WORLD.causeway.x1, WORLD.causeway.z0, WORLD.causeway.z1, mats.concrete);

  // --- Roads: dark asphalt strips on each island ---
  const roadGeo = new THREE.PlaneGeometry(1, 1);
  function roadStrip(x, z, w, d) {
    const m = new THREE.Mesh(roadGeo, mats.road);
    m.rotation.x = -Math.PI / 2;
    m.scale.set(w, d, 1);
    m.position.set(x, 0.03, z);
    scene.add(m);
  }
  for (const a of [...WORLD.avenuesWest, ...WORLD.avenuesEast]) roadStrip(a, 0, 10, 392);
  for (const s of WORLD.streets) {
    if (WORLD.bridgeZ.includes(s)) roadStrip(0, s, 400, 10);
    else {
      roadStrip(-140, s, 168, 10);
      roadStrip(140, s, 168, 10);
    }
  }
  roadStrip(43, 196, 34, 12); // causeway road
  roadStrip(238, 0, 12, 392); // beachfront drive

  // --- Bridges across the bay: deck, rails, neon strips, pillars ---
  const neonColors = [0xff2e88, 0x00e5ff, 0xff9e00];
  WORLD.bridgeZ.forEach((bz, i) => {
    const deck = box(124, 0.6, 16, mats.bridge);
    deck.position.set(0, 0.1, bz);
    scene.add(deck);
    for (const dz of [-7.6, 7.6]) {
      const rail = box(124, 1.1, 0.5, mats.dark);
      rail.position.set(0, 0.9, bz + dz);
      scene.add(rail);
      const strip = box(124, 0.35, 0.35, new THREE.MeshBasicMaterial({ color: neonColors[i % 3] }));
      strip.position.set(0, 1.55, bz + dz);
      scene.add(strip);
    }
    // Support pillars in the bay.
    for (const px of [-28, 0, 28]) {
      const p = box(3, 8, 3, mats.concrete);
      p.position.set(px, -4, bz);
      scene.add(p);
    }
  });

  // --- Buildings ---
  const glassTex = [glassTexture(11), glassTexture(23), glassTexture(37)];
  const decoTex = [decoTexture(51), decoTexture(67), decoTexture(83), decoTexture(99)];
  const brickTex = [brickTexture(111), brickTexture(123)];
  const houseTex = [houseTexture(131), houseTexture(147), houseTexture(163)];
  let buildingCount = 0;

  function building(x, z, w, d, h, tex, tint = 0xffffff) {
    // One material (not a 6-material array) to keep draw calls low; the
    // facade texture on the roof is barely visible from street level at dusk.
    const side = new THREE.MeshLambertMaterial({
      map: tex, color: tint, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55,
    });
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), side);
    m.position.set(x, h / 2, z);
    scene.add(m);
    buildingCount++;
    return m;
  }

  // West downtown glass towers.
  const towerSpots = [
    [-168, -140, 30, 30, 52], [-112, -140, 26, 26, 44], [-168, -84, 34, 28, 58],
    [-112, -84, 28, 30, 38], [-168, -28, 26, 26, 48], [-112, -28, 30, 26, 34],
    [-168, 28, 28, 28, 40], [-112, 28, 24, 24, 30],
  ];
  towerSpots.forEach(([x, z, w, d, h], i) => building(x, z, w, d, h, glassTex[i % 3]));
  neonSign(scene, 'SOLMAR BANK', '#00e5ff', -168, 46, -124, Math.PI, 20);
  neonSign(scene, 'SOLMAR TOWER', '#ff2e88', -112, 36, -69, Math.PI, 22);

  // West mid-rise brick blocks (x -196..-84, z -168..-56).
  for (const bx of [-168, -112]) {
    for (const bz of [-168, -112, -56]) {
      building(bx, bz, 30, 22, 12 + rng() * 6, brickTex[0]);
      building(bx + (rng() > 0.5 ? 8 : -8), bz, 16, 16, 9, brickTex[1]);
    }
  }

  // Cuban / Haitian pastel district (west, z 56..112).
  for (const bx of [-168, -112]) {
    for (let k = 0; k < 3; k++) {
      building(bx - 12 + k * 12, 78 + (k % 2) * 12, 10, 9, 4.5 + rng() * 2.5, houseTex[(k + (bx > -140 ? 1 : 0)) % 3]);
    }
  }
  // Print Works (business) — bigger pastel print shop.
  building(-140, 84, 22, 16, 8, houseTex[1]);
  neonSign(scene, 'PRINT WORKS', '#ff9e00', -140, 9.5, 75, 0, 16);

  // West mall.
  const mall = building(-112, 168, 62, 40, 13, decoTex[2]);
  mall.material = new THREE.MeshLambertMaterial({ color: 0xd8c8f0 });
  neonSign(scene, 'OCEAN MALL', '#b26bff', -112, 14.5, 147, 0, 26);

  // West port: warehouses, containers, cranes, ships.
  for (const wx of [-196, -168]) building(wx, 140, 26, 20, 8, brickTex[1]);
  building(-196, 168, 24, 18, 7, brickTex[0]);
  building(-140, 140, 22, 16, 7, brickTex[1]);
  const contColors = [0xff5e3d, 0x2ea8ff, 0xffc93d, 0x35d07f, 0xff7ab8];
  for (let i = 0; i < 14; i++) {
    const c = box(8, 2.6, 2.6, flatMat(pick(rng, contColors)));
    c.position.set(-210 + (i % 5) * 10, 1.3 + Math.floor(i / 5) * 2.7, 168 + (i % 3) * 4);
    scene.add(c);
  }
  // Animated gantry cranes over the container yard: yellow steel legs,
  // rotating jib, rising/lowering hook on a cable, blinking warning light.
  S.cranes = [];
  const craneSpots = [[-216, 128, 0], [-216, 156, 1], [-200, 184, 2]];
  craneSpots.forEach(([cx, cz, idx]) => {
    const crane = new THREE.Group();
    const legMat = flatMat(0xffc93d);
    const darkMat = flatMat(0x2a2a30);
    for (const [lx, lz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
      const leg = box(1.2, 26, 1.2, legMat);
      leg.position.set(lx, 13, lz);
      crane.add(leg);
    }
    for (const bz of [-3, 3]) {
      const brace = box(7.2, 0.8, 0.8, flatMat(0xff9e00));
      brace.position.set(0, 18, bz);
      crane.add(brace);
    }
    const top = box(10, 2, 8, legMat);
    top.position.y = 27;
    crane.add(top);
    // Rotating jib assembly (arm, counter-jib, weight, cabin, trolley).
    const jib = new THREE.Group();
    jib.position.y = 28.2;
    const arm = box(26, 1.4, 1.4, legMat);
    arm.position.set(9, 0, 0);
    jib.add(arm);
    const counter = box(7, 1.4, 1.4, legMat);
    counter.position.set(-5.5, 0, 0);
    jib.add(counter);
    const weight = box(2.5, 3, 2.5, darkMat);
    weight.position.set(-8, -1, 0);
    jib.add(weight);
    const cab = box(3, 2.4, 3, flatMat(0xf2ead8));
    cab.position.set(-1.5, -2.2, 2.5);
    jib.add(cab);
    const trolley = box(1.6, 1, 1.6, darkMat);
    trolley.position.set(20, -0.6, 0);
    jib.add(trolley);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1, 6), darkMat);
    jib.add(cable);
    const hook = box(0.9, 0.9, 0.9, flatMat(0xff5e3d));
    jib.add(hook);
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }),
    );
    light.position.set(0, 29.5, 0);
    crane.add(light);
    crane.position.set(cx, 0, cz);
    scene.add(crane);
    S.cranes.push({ jib, cable, hook, light, phase: idx * 2.1, rotating: idx === 1, hookY: 10 });
  });
  // Cargo ships in the western sea.
  for (const sz of [120, 168]) {
    const ship = new THREE.Group();
    const hull = box(34, 5, 9, flatMat(0x27364a));
    hull.position.y = 1.5;
    ship.add(hull);
    const tower = box(6, 7, 7, flatMat(0xf2ead8));
    tower.position.set(-10, 7, 0);
    ship.add(tower);
    for (let i = 0; i < 4; i++) {
      const c = box(6, 3, 7, flatMat(pick(rng, contColors)));
      c.position.set(-2 + i * 7, 5.5, 0);
      ship.add(c);
    }
    ship.position.set(-252, -0.5, sz);
    scene.add(ship);
  }
  neonSign(scene, 'SOLMAR DOCKS', '#00e5ff', -196, 10, 129, 0, 20);

  // West military base (fenced corner).
  const fenceMat = flatMat(0x5a6b4a);
  for (let i = 0; i < 12; i++) {
    const post = box(0.5, 3, 0.5, fenceMat);
    post.position.set(-224 + i * 4.7, 1.5, -140);
    scene.add(post);
  }
  const hangar = box(26, 9, 18, flatMat(0x6b7a5a));
  hangar.position.set(-196, 4.5, -168);
  scene.add(hangar);
  const watch = new THREE.Group();
  const wl = box(1, 12, 1, flatMat(0x4a5a3a));
  wl.position.y = 6;
  watch.add(wl);
  const wc = box(4, 3, 4, flatMat(0x5a6b4a));
  wc.position.y = 13;
  watch.add(wc);
  watch.position.set(-216, 0, -184);
  scene.add(watch);
  neonSign(scene, 'FORT BAXTER', '#9ad7f0', -196, 10.5, -158, 0, 16);

  // East mid-rise apartments (x 84..168, full height of the island).
  for (const bx of [112, 140, 168]) {
    for (const bz of [-168, -140, -84, -28, 28, 84, 140, 168]) {
      if (bx === 168 && bz === 140) continue;
      building(bx, bz, 22, 20, 10 + rng() * 8, pick(rng, brickTex.concat(decoTex)));
    }
  }

  // Small street shops at intersection corners, filling the blocks out.
  for (const ax of [-196, -140, -84, 84, 140]) {
    for (const sz of [-168, -112, -56, 0, 56, 112, 168]) {
      if (rng() > 0.8) continue;
      const sx = ax + 9;
      const sz2 = sz + 9;
      if (sx < -168 && sz2 < -140) continue; // military base
      if (sx > -143 && sx < -81 && sz2 > 148) continue; // mall
      if (Math.hypot(sx + 168, sz2 - 168) < 15) continue; // helipad
      if (sx < -160 && sz2 > 120) continue; // port warehouses
      if (Math.hypot(sx + 196, sz2 - 140) < 16) continue; // docks business
      if (Math.hypot(sx + 140, sz2 - 84) < 14) continue; // print works
      building(sx, sz2, 10, 8, 5 + rng() * 3, pick(rng, houseTex.concat(brickTex)));
    }
  }

  // East art-deco beachfront hotels along Ocean Drive (x 196).
  const hotelNames = [
    ['HOTEL DELUXE', '#ff2e88'], ['NEON PALMS', '#00e5ff'], ['SOLMAR ROYALE', '#ff9e00'],
    ['COLONY', '#b26bff'], ['TROPICANA', '#ff5e8a'], ['OCEAN DRIVE', '#00e5ff'],
  ];
  const hotelZ = [-140, -84, -28, 28, 84, 140];
  hotelZ.forEach((hz, i) => {
    const h = 10 + rng() * 12;
    building(196, hz, 20, 22, h, decoTex[i % 4]);
    neonSign(scene, hotelNames[i][0], hotelNames[i][1], 196, h + 2.5, hz - 11.5, 0, 18);
  });
  // Neon Nights nightclub (business) at (196, 56).
  building(196, 56, 24, 20, 12, decoTex[0]);
  neonSign(scene, 'NEON NIGHTS', '#ff2e88', 196, 14, 45, 0, 20);

  // Boardwalk + lifeguard towers + umbrellas on Ocean Beach.
  const board = new THREE.Mesh(new THREE.PlaneGeometry(10, 392), new THREE.MeshLambertMaterial({ color: 0x9a7a54 }));
  board.rotation.x = -Math.PI / 2;
  board.position.set(212, 0.05, 0);
  scene.add(board);
  for (const tz of [-84, 0, 84]) {
    const tower = new THREE.Group();
    const legs = box(3, 4, 3, flatMat(0xf2ead8));
    legs.position.y = 2;
    tower.add(legs);
    const cab = box(4, 2.4, 4, flatMat(0xff5e8a));
    cab.position.y = 5;
    tower.add(cab);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.6, 4), flatMat(0xffd166));
    roof.position.y = 7;
    roof.rotation.y = Math.PI / 4;
    tower.add(roof);
    tower.position.set(238, 0, tz);
    scene.add(tower);
  }
  for (let i = 0; i < 10; i++) {
    const ux = 228 + rng() * 18;
    const uz = -170 + i * 36 + rng() * 10;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 6), flatMat(0xf2ead8));
    pole.position.set(ux, 1.3, uz);
    scene.add(pole);
    const umb = new THREE.Mesh(
      new THREE.ConeGeometry(2.4, 1.1, 8),
      flatMat(pick(rng, [0xff5e8a, 0x00c8d8, 0xffc93d, 0x7a5cff])),
    );
    umb.position.set(ux, 3, uz);
    scene.add(umb);
  }

  // Mansion island: five luxury mansions with pools.
  const mansionSpots = [[-14, 188], [12, 188], [-14, 206], [12, 206], [0, 196]];
  mansionSpots.forEach(([mx, mz], i) => {
    building(mx, mz, 12, 10, 7 + (i % 2) * 3, houseTex[i % 3]);
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 4),
      new THREE.MeshPhongMaterial({ color: 0x2fb8e8, shininess: 140 }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(mx + (i % 2 ? -10 : 10), 0.06, mz);
    scene.add(pool);
  });

  // Helipad (west, near the mall) + marina docks (bay side, east island).
  const pad = new THREE.Mesh(new THREE.CircleGeometry(9, 24), flatMat(0x3a3a44));
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(-168, 0.06, 168);
  scene.add(pad);
  const hRing = new THREE.Mesh(new THREE.RingGeometry(7, 8, 24), new THREE.MeshBasicMaterial({ color: 0xffc93d }));
  hRing.rotation.x = -Math.PI / 2;
  hRing.position.set(-168, 0.07, 168);
  scene.add(hRing);
  for (let i = 0; i < 3; i++) {
    const dock = box(2, 0.5, 14, flatMat(0x8a6a4a));
    dock.position.set(62, 0.2, 128 + i * 14);
    scene.add(dock);
  }

  // --- Street lamps: instanced poles, heads, light pools ---
  const lampSpots = [];
  for (const a of [...WORLD.avenuesWest, ...WORLD.avenuesEast]) {
    for (let z = -168; z <= 168; z += 28) lampSpots.push([a + 6, z]);
  }
  for (const s of WORLD.streets) {
    for (const x of [-196, -56 + 14, 56 + 14, 196]) {
      if (x > -60 && x < 60) continue;
      lampSpots.push([x, s + 6]);
    }
  }
  for (const bz of WORLD.bridgeZ) {
    for (const x of [-40, 0, 40]) lampSpots.push([x, bz + 6.5]);
  }
  for (let z = -168; z <= 168; z += 28) lampSpots.push([210, z]);
  for (let x = 30; x <= 56; x += 13) lampSpots.push([x, 190]);
  const lampCount = lampSpots.length;
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 5.2, 6);
  const headGeo = new THREE.SphereGeometry(0.42, 8, 6);
  const poolGeo = new THREE.CircleGeometry(3.4, 16);
  const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x2a2a30 }), lampCount);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshBasicMaterial({ color: 0xffc46b }), lampCount);
  const pools = new THREE.InstancedMesh(
    poolGeo,
    new THREE.MeshBasicMaterial({ color: 0xffb36b, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }),
    lampCount,
  );
  const m4 = new THREE.Matrix4();
  lampSpots.forEach(([x, z], i) => {
    m4.makeTranslation(x, 2.6, z);
    poles.setMatrixAt(i, m4);
    m4.makeTranslation(x, 5.35, z);
    heads.setMatrixAt(i, m4);
    m4.makeRotationX(-Math.PI / 2);
    m4.setPosition(x, 0.08, z);
    pools.setMatrixAt(i, m4);
  });
  scene.add(poles);
  scene.add(heads);
  scene.add(pools);
  // A few real warm lights for glow at key spots.
  for (const [x, z] of [[-140, 0], [140, 0], [196, 0], [-196, 140]]) {
    const pl = new THREE.PointLight(0xffb36b, 60, 34);
    pl.position.set(x, 6, z);
    scene.add(pl);
  }

  // --- Palm trees: instanced trunks + crowns ---
  const palmSpots = [];
  for (let z = -168; z <= 168; z += 24) palmSpots.push([206, z]);
  for (let z = -168; z <= 168; z += 48) palmSpots.push([-48, z]);
  for (let z = -168; z <= 168; z += 48) palmSpots.push([48, z]);
  for (let i = 0; i < 8; i++) palmSpots.push([-20 + rng() * 40, 182 + rng() * 26]);
  for (let i = 0; i < 10; i++) palmSpots.push([226 + rng() * 20, -180 + rng() * 360]);
  const palmCount = palmSpots.length;
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.3, 5.4, 6);
  const crownGeo = new THREE.IcosahedronGeometry(2.1, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x7a5a38 }), palmCount);
  const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ color: 0x2f7a3d }), palmCount);
  palmSpots.forEach(([x, z], i) => {
    const lean = (rng() - 0.5) * 0.12;
    m4.makeRotationZ(lean);
    m4.setPosition(x, 2.7, z);
    trunks.setMatrixAt(i, m4);
    m4.makeScale(1, 0.55, 1);
    m4.setPosition(x + lean * 8, 5.9, z);
    crowns.setMatrixAt(i, m4);
    m4.makeScale(1, 1, 1);
  });
  scene.add(trunks);
  scene.add(crowns);

  S.lampCount = lampCount;
  S.palmCount = palmCount;
  S.buildingCount = buildingCount;
  S.locations = {
    gunshop: { x: -84, z: -56, name: 'AMMU-NATION' },
    safehouse: { x: 140, z: 112, name: 'Ocean Safehouse' },
    helipad: { x: -168, z: 168, name: 'Helipad' },
    marina: { x: 62, z: 140, name: 'Marina' },
    plaza: { x: 140, z: 0, name: 'Ocean Plaza' },
    businesses: [
      { id: 'club', name: 'Neon Nights', x: 196, z: 56, price: 15000, income: 400 },
      { id: 'docks', name: 'Solmar Docks', x: -196, z: 140, price: 25000, income: 700 },
      { id: 'print', name: 'Print Works', x: -140, z: 84, price: 10000, income: 250 },
    ],
  };
  return { lampCount, palmCount, buildingCount };
}

// Animate the harbour cranes: hooks rise and lower on a loop, one jib
// slowly rotates, warning lights blink. Called every frame from main.js.
export function updateCranes(time) {
  if (!S.cranes) return;
  for (const c of S.cranes) {
    const hookY = 10 + Math.sin(time * 0.45 + c.phase) * 7; // 3..17 above ground
    const topY = 28.2 - 0.6; // trolley underside, jib-local
    const len = topY - hookY;
    c.cable.scale.y = Math.max(0.5, len);
    c.cable.position.set(20, -0.6 - len / 2, 0);
    c.hook.position.set(20, -0.6 - len, 0);
    c.hookY = hookY;
    c.light.material.color.setHex(Math.sin(time * 3 + c.phase) > 0 ? 0xff2222 : 0x550000);
    if (c.rotating) c.jib.rotation.y = Math.sin(time * 0.12 + c.phase) * 0.7;
  }
}
