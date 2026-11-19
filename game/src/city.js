// City builder for Solmar City: Streets of Gold.
// Two islands, a turquoise bay, three bridges, a mansion island, Ocean Beach,
// downtown, port, military base, mall and a Cuban/Haitian district — all
// procedural, bright daytime sky with drifting clouds, neon, palms and
// street lamps.
import * as THREE from 'three';
import { S, WORLD, isLand } from './state.js';
import { mulberry32, pick, clamp } from './util.js';
import {
  glassTexture, decoTexture, brickTexture, houseTexture,
  signTexture, waterTexture, skyTexture, glowTexture,
} from './facades.js';

const rng = mulberry32(1986);
// Shared radial glow sprite (white core → transparent), tinted per use.
let glowTex = null;
function getGlowTex() {
  if (!glowTex) glowTex = glowTexture();
  return glowTex;
}

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
  // Dazzling coloured halo behind the sign so the neon burns in daylight.
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 1.9, (w / 4) * 2.6),
    new THREE.MeshBasicMaterial({
      map: getGlowTex(), color: new THREE.Color(color), transparent: true,
      opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  const nx = Math.sin(ry);
  const nz = Math.cos(ry);
  halo.position.set(x - nx * 0.15, y, z - nz * 0.15);
  halo.rotation.y = ry;
  scene.add(halo);
  if (!S._neonHalos) S._neonHalos = 0;
  S._neonHalos++;
  return m;
}

export function buildCity(scene) {
  const mats = {
    groundWest: flatMat(0x6f9a55),
    groundEast: flatMat(0x7ba05c),
    groundMansion: flatMat(0x6f9a5e),
    sand: flatMat(0xe8d5a0),
    road: flatMat(0x4b4b53),
    bridge: flatMat(0x565660),
    water: new THREE.MeshPhongMaterial({
      map: waterTexture(), color: 0x35b8d8, emissive: 0x0e5a70, emissiveIntensity: 0.7, shininess: 120, specular: 0x99ddff,
    }),
    concrete: flatMat(0x8a8a86),
    white: flatMat(0xf2ead8),
    dark: flatMat(0x1c1c22),
  };
  S._waterMat = mats.water;

  // --- Sky dome, sun, fog, lights: bright daytime blue sky ---
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);
  scene.fog = new THREE.Fog(0xa8d8f0, 220, 780);
  scene.add(new THREE.HemisphereLight(0x9fd4ff, 0x6a8a5a, 0.95));
  const sun = new THREE.DirectionalLight(0xfff1cf, 1.9);
  sun.position.set(-320, 220, 90);
  scene.add(sun);
  const sunSprite = new THREE.Mesh(
    new THREE.CircleGeometry(46, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff6c8, fog: false }),
  );
  sunSprite.position.set(-620, 180, 60);
  sunSprite.lookAt(0, 60, 0);
  scene.add(sunSprite);

  // --- Drifting daytime clouds: white puffs high above the city ---
  S.clouds = [];
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, fog: false });
  const cloudGeo = new THREE.SphereGeometry(1, 10, 8);
  for (let i = 0; i < 16; i++) {
    const cloud = new THREE.Group();
    const puffs = 3 + Math.floor(rng() * 3);
    for (let k = 0; k < puffs; k++) {
      const puff = new THREE.Mesh(cloudGeo, cloudMat);
      const s = 7 + rng() * 9;
      puff.scale.set(s, s * 0.42, s * 0.7);
      puff.position.set((k - puffs / 2) * 8 + rng() * 4, rng() * 3, rng() * 6 - 3);
      cloud.add(puff);
    }
    cloud.position.set(-420 + rng() * 840, 130 + rng() * 70, -380 + rng() * 760);
    scene.add(cloud);
    S.clouds.push({ group: cloud, speed: 1.5 + rng() * 2 });
  }

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

  // --- Lane markings: dashed yellow centre lines on every road ---
  const dashGeo = new THREE.PlaneGeometry(0.4, 2.4);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xffd23d });
  const dashSpots = [];
  for (const a of [...WORLD.avenuesWest, ...WORLD.avenuesEast]) {
    for (let z = -184; z <= 184; z += 9) dashSpots.push([a, z, 0]);
  }
  for (const s of WORLD.streets) {
    for (let x = -188; x <= -64; x += 9) dashSpots.push([x, s, 1]);
    for (let x = 64; x <= 188; x += 9) dashSpots.push([x, s, 1]);
  }
  for (const bz of WORLD.bridgeZ) {
    for (let x = -52; x <= 52; x += 9) dashSpots.push([x, bz, 1]);
  }
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashSpots.length);
  const dm = new THREE.Matrix4();
  dashSpots.forEach(([x, z, rot], i) => {
    dm.makeRotationX(-Math.PI / 2);
    if (rot) dm.multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
    dm.setPosition(x, 0.045, z);
    dashes.setMatrixAt(i, dm);
  });
  scene.add(dashes);

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

  // Footprints lamps/palms must stay out of (roads are added below too).
  const buildingRects = [];

  function building(x, z, w, d, h, tex, tint = 0xffffff) {
    buildingRects.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
    // Lit windows glow warm in daylight: high emissive so the facades shine.
    const side = new THREE.MeshLambertMaterial({
      map: tex, color: tint, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.75,
    });
    if (!S._glowMats) S._glowMats = [];
    S._glowMats.push(side);
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
    // Solid stacked containers: block walking/driving through them too.
    buildingRects.push({ x0: c.position.x - 4, x1: c.position.x + 4, z0: c.position.z - 1.3, z1: c.position.z + 1.3 });
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
    // Dazzling halo around the warning light, blinking with it.
    const lightHalo = new THREE.Mesh(
      new THREE.SphereGeometry(1.6, 8, 6),
      new THREE.MeshBasicMaterial({
        color: 0xff2222, transparent: true, opacity: 0.7,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    lightHalo.position.set(0, 29.5, 0);
    crane.add(lightHalo);
    crane.position.set(cx, 0, cz);
    scene.add(crane);
    S.cranes.push({ jib, cable, hook, light, lightHalo, phase: idx * 2.1, rotating: idx === 1, hookY: 10 });
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
  // Solid hangar: block walking/driving through it.
  buildingRects.push({ x0: -209, x1: -183, z0: -177, z1: -159 });
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

  // ROADSIDE RULE: every lamp/palm must stand at least 1.5u clear of any
  // drivable lane (avenues, streets, bridge decks, causeway road, beachfront
  // drive) and outside every building. Candidate spots are checked against
  // all road rects + building footprints and nudged (or dropped) on clash.
  const obstacles = [];
  for (const a of [...WORLD.avenuesWest, ...WORLD.avenuesEast]) {
    obstacles.push({ x0: a - 5, x1: a + 5, z0: -196, z1: 196 });
  }
  for (const s of WORLD.streets) {
    obstacles.push({ x0: -224, x1: -56, z0: s - 5, z1: s + 5 });
    obstacles.push({ x0: 56, x1: 224, z0: s - 5, z1: s + 5 });
    if (WORLD.bridgeZ.includes(s)) obstacles.push({ x0: -56, x1: 56, z0: s - 5, z1: s + 5 });
  }
  for (const bz of WORLD.bridgeZ) obstacles.push({ x0: -62, x1: 62, z0: bz - 5, z1: bz + 5 });
  obstacles.push({ x0: 232, x1: 244, z0: -196, z1: 196 }); // beachfront drive
  obstacles.push({ x0: 26, x1: 60, z0: 190, z1: 202 }); // causeway road
  obstacles.push({ x0: 207, x1: 217, z0: -196, z1: 196 }); // boardwalk
  for (const r of buildingRects) obstacles.push(r);
  function clearSpot(x, z, margin = 1.5) {
    if (!isLand(x, z)) return false;
    for (const r of obstacles) {
      if (x > r.x0 - margin && x < r.x1 + margin && z > r.z0 - margin && z < r.z1 + margin) return false;
    }
    return true;
  }
  function findSpot(x, z, margin = 1.5) {
    const tries = [
      [x, z], [x + 3, z], [x - 3, z], [x, z + 3], [x, z - 3],
      [x + 6, z], [x - 6, z], [x, z + 12], [x, z - 12],
    ];
    for (const [tx, tz] of tries) {
      if (clearSpot(tx, tz, margin)) return [tx, tz];
    }
    return null;
  }

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
    tower.position.set(248, 0, tz);
    scene.add(tower);
  }
  for (let i = 0; i < 10; i++) {
    // Umbrellas on the sand between boardwalk and drive, never on the road.
    const spot = findSpot(222 + rng() * 6, -170 + i * 36 + rng() * 10);
    if (!spot) continue;
    const [ux, uz] = spot;
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
  // Lamp spots are [x, z, baseY]: baseY 0 on the ground, 1.45 when the pole
  // is mounted on top of a bridge rail.
  const lampSpots = [];
  function placeLamp(x, z) {
    const s = findSpot(x, z);
    if (s) lampSpots.push([s[0], s[1], 0]);
    return s;
  }
  // Avenue lamps: 2.5u off the road edge, mid-block (never on a cross street).
  for (const a of [...WORLD.avenuesWest, ...WORLD.avenuesEast]) {
    for (let z = -154; z <= 182; z += 28) placeLamp(a + 7.5, z);
  }
  // Street lamps: at avenue corners (2u off the avenue, 2.5u off the street).
  for (const s of WORLD.streets) {
    for (const x of [-77, 77]) placeLamp(x, s + 7.5);
  }
  // Bridge lamps: mounted on the rail, off the deck and above the lane edge.
  for (const bz of WORLD.bridgeZ) {
    for (const x of [-40, 0, 40]) lampSpots.push([x, bz + 7.6, 1.45]);
  }
  // Beachfront lamps: on the sand strip between boardwalk and drive.
  for (let z = -154; z <= 182; z += 28) placeLamp(219, z);
  // Causeway lamps: on the widened concrete shoulders, alternating sides.
  lampSpots.push([30, 187.5, 0], [43, 204.5, 0], [56, 187.5, 0]);
  const lampCount = lampSpots.length;
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 5.2, 6);
  const headGeo = new THREE.SphereGeometry(0.46, 8, 6);
  const haloGeo = new THREE.SphereGeometry(1.05, 10, 8);
  const poolGeo = new THREE.CircleGeometry(4.8, 16);
  const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x2a2a30 }), lampCount);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshBasicMaterial({ color: 0xffd28a }), lampCount);
  // Big warm glow halo around every lamp head so it dazzles in daylight.
  const lampHalos = new THREE.InstancedMesh(
    haloGeo,
    new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
    lampCount,
  );
  const pools = new THREE.InstancedMesh(
    poolGeo,
    new THREE.MeshBasicMaterial({ color: 0xffb36b, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false }),
    lampCount,
  );
  const m4 = new THREE.Matrix4();
  lampSpots.forEach(([x, z, baseY = 0], i) => {
    m4.makeTranslation(x, baseY + 2.6, z);
    poles.setMatrixAt(i, m4);
    m4.makeTranslation(x, baseY + 5.35, z);
    heads.setMatrixAt(i, m4);
    lampHalos.setMatrixAt(i, m4);
    m4.makeRotationX(-Math.PI / 2);
    m4.setPosition(x, baseY > 0 ? 0.45 : 0.08, z);
    pools.setMatrixAt(i, m4);
  });
  scene.add(poles);
  scene.add(heads);
  scene.add(lampHalos);
  scene.add(pools);
  S._lampHaloCount = lampCount;
  // A few real warm lights for glow at key spots.
  for (const [x, z] of [[-140, 0], [140, 0], [196, 0], [-196, 140]]) {
    const pl = new THREE.PointLight(0xffb36b, 60, 34);
    pl.position.set(x, 6, z);
    scene.add(pl);
  }

  // --- Palm trees: instanced trunks + crowns (dense rows, all roadside) ---
  const palmSpots = [];
  function placePalm(x, z) {
    const s = findSpot(x, z);
    if (s) palmSpots.push(s);
    return s;
  }
  // Beach row: sand between boardwalk and drive, mid-block z.
  for (let z = -156; z <= 180; z += 24) placePalm(220, z);
  // Bay-side rows: on land at the shoreline, never in the water.
  for (let z = -144; z <= 168; z += 48) {
    placePalm(-62, z);
    placePalm(62, z);
  }
  for (let i = 0; i < 8; i++) placePalm(-20 + rng() * 40, 182 + rng() * 26);
  for (let i = 0; i < 10; i++) placePalm(220 + rng() * 6, -180 + rng() * 360);
  // Both sides of every main avenue, mid-block so none stands on a street.
  for (const a of [...WORLD.avenuesWest, ...WORLD.avenuesEast]) {
    for (let z = -140; z <= 196; z += 56) {
      placePalm(a - 7.5, z);
      placePalm(a + 7.5, z);
    }
  }
  for (let i = 0; i < 12; i++) placePalm(-176 + rng() * 24, -40 + rng() * 80);
  for (let i = 0; i < 8; i++) placePalm(-20 + rng() * 40, 182 + rng() * 26);
  for (let i = 0; i < 6; i++) placePalm(246 + rng() * 5, -180 + rng() * 360);
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
  S.lampSpots = lampSpots;
  S.palmSpots = palmSpots;
  S.palmCount = palmCount;
  S.buildingCount = buildingCount;
  // Solid footprints (buildings + hangar + containers) for collision:
  // the player and cars are blocked by these, never walk/drive through.
  S.buildingRects = buildingRects;
  S.locations = {
    gunshop: { x: -84, z: -56, name: 'AMMU-NATION' },
    safehouse: { x: 140, z: 112, name: 'Ocean Safehouse' },
    helipad: { x: -168, z: 168, name: 'Helipad' },
    marina: { x: 62, z: 140, name: 'Marina' },
    plaza: { x: 140, z: 0, name: 'Ocean Plaza' },
    businesses: [
      // Door-side positions (just outside the building walls) so the
      // player can always reach the buy prompt from the street.
      { id: 'club', name: 'Neon Nights', x: 181, z: 56, price: 15000, income: 400 },
      { id: 'docks', name: 'Solmar Docks', x: -180, z: 140, price: 25000, income: 700 },
      { id: 'print', name: 'Print Works', x: -140, z: 72, price: 10000, income: 250 },
    ],
  };
  // Findable beacons: tall glowing columns over the marina boats and the
  // helipad, so the player can spot the boat and the heli from anywhere.
  function beacon(x, z, color) {
    const g = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 40, 8, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.y = 20;
    g.add(beam);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3, 3.8, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.1;
    g.add(ring);
    g.position.set(x, 0, z);
    scene.add(g);
    return { group: g, beam, ring, phase: Math.random() * 6 };
  }
  S._beacons = [beacon(56, 140, 0x00e5ff), beacon(-168, 168, 0xffc93d)];
  return { lampCount, palmCount, buildingCount };
}

// Pulse the marina + helipad beacons so they stay visible. Called every
// frame from main.js.
export function updateBeacons(time) {
  if (!S._beacons) return;
  for (const b of S._beacons) {
    const s = Math.sin(time * 2.5 + b.phase);
    b.beam.material.opacity = 0.22 + 0.14 * (0.6 + 0.4 * s);
    const rs = 1 + s * 0.12;
    b.ring.scale.set(rs, rs, 1);
  }
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
    if (c.lightHalo) {
      const on = Math.sin(time * 3 + c.phase) > 0;
      c.lightHalo.material.opacity = on ? 0.75 : 0.05;
      c.lightHalo.material.color.setHex(on ? 0xff2222 : 0x550000);
    }
    if (c.rotating) c.jib.rotation.y = Math.sin(time * 0.12 + c.phase) * 0.7;
  }
}

// A few lit windows flicker gently so the facades feel alive: every half
// second a handful of building materials get a new warmth. Cheap — only a
// few materials change per tick, no new textures or draw calls.
let _flickerT = 0;
export function updateWindowFlicker(time) {
  if (!S._glowMats || S._glowMats.length === 0) return;
  if (time - _flickerT < 0.5) return;
  _flickerT = time;
  for (let k = 0; k < 5; k++) {
    const m = S._glowMats[Math.floor(Math.random() * S._glowMats.length)];
    m.emissiveIntensity = 0.55 + Math.random() * 0.4;
  }
}

// Drift the daytime clouds across the sky, wrapping around the map.
// Called every frame from main.js.
export function updateClouds(dt) {
  if (!S.clouds) return;
  for (const c of S.clouds) {
    c.group.position.x += c.speed * dt;
    if (c.group.position.x > 460) c.group.position.x = -460;
  }
}
