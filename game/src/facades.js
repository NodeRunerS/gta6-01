// Procedural facade textures for Solmar City: canvas-painted building fronts
// (window grids with lit/unlit windows, floor lines, ground-floor storefronts
// with awnings and signs), neon signs and billboards. Everything is generated
// at load time from fixed seeds — no external assets. Materials are shared
// across buildings so the texture set stays small (21 facade materials).
import * as THREE from '../vendor/three.module.min.js';
import { mulberry32, rand, randInt, pick } from './util.js';

const W = 256;
const H = 512;
const GROUND_H = 100; // bottom band: sign + awning + storefront

const SIGN_WORDS = {
  glass: ['HOTEL', 'CASINO', 'CLUB', 'NEON', 'BAR'],
  brick: ['CAFE', 'PIZZA', 'TACOS', 'BAR', 'SHOP'],
  stucco: ['HOTEL', 'MOTEL', 'CAFE', 'SURF', 'BAR'],
  industrial: ['AUTO', 'PARTS', '24H', 'STORAGE'],
};
const SIGN_COLORS = ['#ff4fd8', '#35f0ff', '#ffe14d', '#ff8a3d', '#4dff88', '#ff5a5a'];

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function speckle(ctx, rng, w, h, n, color, aMax) {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = rand(rng, 0.04, aMax);
    ctx.fillRect(rand(rng, 0, w), rand(rng, 0, h), rand(rng, 1, 4), rand(rng, 1, 4));
  }
  ctx.globalAlpha = 1;
}

/**
 * Paint one facade variant. Returns { map, emissiveMap } canvases.
 * style: 'glass' | 'brick' | 'stucco' | 'industrial'; floors: window rows.
 */
function paintFacade(style, base, floors, seed) {
  const rng = mulberry32(seed);
  const color = makeCanvas(W, H);
  // Emissive map at half resolution (glow blobs don't need full res) and
  // drawn through a 0.5 scale so the same coordinates work.
  const emis = makeCanvas(W / 2, H / 2);
  const c = color.getContext('2d');
  const e = emis.getContext('2d');
  e.scale(0.5, 0.5);
  e.fillStyle = '#000';
  e.fillRect(0, 0, W, H);

  // --- base wall ------------------------------------------------------------
  c.fillStyle = base;
  c.fillRect(0, 0, W, H);
  if (style === 'glass') {
    const g = c.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, 'rgba(255,255,255,0.14)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.02)');
    g.addColorStop(0.6, 'rgba(0,0,0,0.10)');
    g.addColorStop(1, 'rgba(255,255,255,0.08)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  } else if (style === 'brick') {
    // Brick courses.
    c.strokeStyle = 'rgba(0,0,0,0.28)';
    c.lineWidth = 1;
    for (let y = 0; y < H; y += 9) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(W, y);
      c.stroke();
    }
    c.strokeStyle = 'rgba(0,0,0,0.16)';
    for (let y = 4; y < H; y += 18) {
      for (let x = (y % 36 === 4 ? 0 : 16); x < W; x += 32) {
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x, y + 9);
        c.stroke();
      }
    }
  } else if (style === 'industrial') {
    // Corrugated vertical ribs + rust streaks.
    for (let x = 0; x < W; x += 8) {
      c.fillStyle = x % 16 === 0 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.12)';
      c.fillRect(x, 0, 4, H);
    }
    for (let i = 0; i < 10; i++) {
      c.fillStyle = 'rgba(90,50,20,0.25)';
      const x = rand(rng, 0, W);
      c.fillRect(x, rand(rng, 0, H * 0.5), rand(rng, 2, 5), rand(rng, 40, 160));
    }
  } else {
    // Stucco: soft vertical shading + pale trim lines.
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(255,255,255,0.16)');
    g.addColorStop(1, 'rgba(0,0,0,0.10)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }
  speckle(c, rng, W, H, 260, '#000000', 0.12);
  speckle(c, rng, W, H, 160, '#ffffff', 0.10);

  // --- window grid ----------------------------------------------------------
  const upperH = H - GROUND_H;
  const floorH = upperH / floors;
  const cols = style === 'glass' ? 6 : style === 'brick' ? 5 : style === 'stucco' ? 4 : 2;
  const margin = 14;
  const cellW = (W - margin * 2) / cols;
  const litColor = '#ffd27a';
  for (let f = 0; f < floors; f++) {
    const yTop = f * floorH;
    const yMid = yTop + floorH * 0.5;
    // Floor separator line.
    c.fillStyle = style === 'stucco' ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.30)';
    c.fillRect(0, yTop + floorH - 2, W, 2);
    for (let col = 0; col < cols; col++) {
      const cx = margin + col * cellW;
      const ww = style === 'glass' ? cellW - 6 : cellW * 0.58;
      const wh = style === 'glass' ? floorH * 0.82 : floorH * 0.56;
      const wx = cx + (cellW - ww) / 2;
      const wy = yMid - wh / 2;
      const lit = rng() < 0.34;
      const warm = rng() < 0.75;
      if (style === 'glass') {
        // Floor-to-ceiling glass strip with mullions.
        c.fillStyle = lit ? (warm ? '#ffd27a' : '#cfe8ff') : '#16242f';
        c.fillRect(wx, wy, ww, wh);
        c.fillStyle = 'rgba(255,255,255,0.25)';
        c.fillRect(wx, wy, ww, 3);
        c.fillStyle = 'rgba(0,0,0,0.35)';
        c.fillRect(wx + ww / 2 - 1, wy, 2, wh);
        if (lit) {
          e.fillStyle = warm ? '#ffbe55' : '#9fd4ff';
          e.fillRect(wx, wy, ww, wh);
        }
      } else {
        // Framed window; stucco gets shutters, brick gets a stone lintel.
        if (style === 'stucco') {
          c.fillStyle = '#f8f2e4';
          c.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
          c.fillStyle = pick(rng, ['#2f7f7a', '#b85c4a', '#4a6a8a']);
          c.fillRect(wx - 9, wy, 6, wh);
          c.fillRect(wx + ww + 3, wy, 6, wh);
        } else if (style === 'brick') {
          c.fillStyle = '#d8cbb2';
          c.fillRect(wx - 2, wy - 5, ww + 4, 4);
        }
        const arch = style === 'stucco' && f === 0;
        c.fillStyle = lit ? (warm ? '#ffd27a' : '#cfe8ff') : '#1f2c3a';
        if (arch) {
          c.beginPath();
          c.moveTo(wx, wy + wh);
          c.lineTo(wx, wy + 8);
          c.arc(wx + ww / 2, wy + 8, ww / 2, Math.PI, 0);
          c.lineTo(wx + ww, wy + wh);
          c.closePath();
          c.fill();
        } else {
          c.fillRect(wx, wy, ww, wh);
        }
        // Curtain / blind on some lit windows.
        if (lit && rng() < 0.4) {
          c.fillStyle = 'rgba(40,30,40,0.45)';
          c.fillRect(wx, wy, ww, wh * 0.45);
        }
        if (lit) {
          e.fillStyle = warm ? '#ffbe55' : '#9fd4ff';
          if (arch) {
            e.beginPath();
            e.moveTo(wx, wy + wh);
            e.lineTo(wx, wy + 8);
            e.arc(wx + ww / 2, wy + 8, ww / 2, Math.PI, 0);
            e.lineTo(wx + ww, wy + wh);
            e.closePath();
            e.fill();
          } else {
            e.fillRect(wx, wy, ww, wh);
          }
        }
      }
    }
  }

  // --- ground floor: sign band, awning, storefront --------------------------
  const gy = H - GROUND_H;
  const word = pick(rng, SIGN_WORDS[style]);
  const signColor = pick(rng, SIGN_COLORS);
  // Sign band.
  c.fillStyle = '#14101c';
  c.fillRect(0, gy, W, 26);
  c.font = 'bold 20px sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = signColor;
  c.fillText(word, W / 2, gy + 14);
  e.fillStyle = signColor;
  e.font = 'bold 20px sans-serif';
  e.textAlign = 'center';
  e.textBaseline = 'middle';
  e.fillText(word, W / 2, gy + 14);
  // Awning: alternating stripes.
  const stripe = style === 'stucco' ? '#e86a5a' : style === 'brick' ? '#2f7f7a' : '#c22a4a';
  for (let x = 0; x < W; x += 16) {
    c.fillStyle = (x / 16) % 2 === 0 ? stripe : '#f2ead8';
    c.beginPath();
    c.moveTo(x, gy + 26);
    c.lineTo(x + 16, gy + 26);
    c.lineTo(x + 12, gy + 46);
    c.lineTo(x + 4, gy + 46);
    c.closePath();
    c.fill();
  }
  // Storefront glass + door.
  if (style === 'industrial') {
    c.fillStyle = '#3a3f45';
    c.fillRect(20, gy + 48, W - 40, 52);
    c.fillStyle = '#565b62';
    for (let x = 30; x < W - 30; x += 12) c.fillRect(x, gy + 48, 2, 52);
    e.fillStyle = '#3a2c18';
    e.fillRect(20, gy + 48, W - 40, 52);
  } else {
    const g2 = c.createLinearGradient(0, gy + 48, 0, H);
    g2.addColorStop(0, '#ffe9b0');
    g2.addColorStop(1, '#cfe8f0');
    c.fillStyle = g2;
    c.fillRect(10, gy + 48, W - 20, 52);
    c.fillStyle = 'rgba(20,30,40,0.85)';
    for (let x = 10; x < W - 10; x += 34) c.fillRect(x, gy + 48, 3, 52);
    // Door.
    c.fillStyle = '#2a1c22';
    c.fillRect(W / 2 - 13, gy + 62, 26, 38);
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.fillRect(W / 2 - 13, gy + 62, 26, 4);
    e.fillStyle = '#ffdf9e';
    e.fillRect(10, gy + 48, W - 20, 52);
    e.fillStyle = '#000';
    e.fillRect(W / 2 - 13, gy + 62, 26, 38);
  }

  return { color, emis };
}

function toTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  // anisotropy left at 1: anisotropic filtering is very expensive in
  // software rasterizers and mipmaps already handle glancing angles.
  return t;
}

/** Build the shared facade material set. */
export function createFacadeSet() {
  const defs = [
    { style: 'glass', base: '#33414f', bands: ['tall', 'mid'] },
    { style: 'brick', base: '#7d4536', bands: ['short', 'mid', 'tall'] },
    { style: 'brick', base: '#9a6a4a', bands: ['short', 'mid'] },
    { style: 'stucco', base: '#eec39a', bands: ['short', 'mid'] },
    { style: 'stucco', base: '#e7b39a', bands: ['short', 'mid', 'tall'] },
    { style: 'stucco', base: '#cfe0d2', bands: ['short', 'mid'] },
    { style: 'industrial', base: '#6e6a63', bands: ['short'] },
  ];
  const floorsFor = { short: 3, mid: 6, tall: 10 };
  // materials[style][band] = [material, ...]
  const materials = { glass: {}, brick: {}, stucco: {}, industrial: {} };
  let seed = 1000;
  for (const d of defs) {
    for (const band of d.bands) {
      const { color, emis } = paintFacade(d.style, d.base, floorsFor[band], (seed += 7));
      const mat = new THREE.MeshLambertMaterial({
        map: toTexture(color),
        emissiveMap: toTexture(emis),
        emissive: new THREE.Color(0xffb45e),
        emissiveIntensity: 0.85,
      });
      (materials[d.style][band] ??= []).push(mat);
    }
  }
  return {
    /** Pick a shared facade material for a district + building height. */
    facadeFor(district, h, rng) {
      const band = h < 14 ? 'short' : h < 25 ? 'mid' : 'tall';
      const style = district === 'downtown' ? 'glass' : district === 'beach' ? 'stucco' : district === 'industrial' ? 'industrial' : 'brick';
      const list = materials[style][band] ?? materials[style].short ?? materials.brick.short;
      return pick(rng, list);
    },
  };
}

// --- neon signs ---------------------------------------------------------------

const NEON_WORDS = [
  { word: 'HOTEL', color: '#ff4fd8' },
  { word: 'CASINO', color: '#ffe14d' },
  { word: 'NEON', color: '#35f0ff' },
  { word: 'BAR', color: '#ff8a3d' },
  { word: 'MOTEL', color: '#4dff88' },
  { word: 'TACOS', color: '#ff5a5a' },
  { word: 'PIZZA', color: '#ffb03d' },
  { word: 'CLUB', color: '#c07dff' },
];

export function createNeonMaterials() {
  return NEON_WORDS.map((n, i) => {
    const rng = mulberry32(5000 + i * 31);
    const c = makeCanvas(128, 256);
    const x = c.getContext('2d');
    x.fillStyle = '#0a0a14';
    x.fillRect(0, 0, 128, 256);
    x.strokeStyle = n.color;
    x.lineWidth = 4;
    x.strokeRect(6, 6, 116, 244);
    x.shadowColor = n.color;
    x.shadowBlur = 18;
    x.fillStyle = n.color;
    x.font = 'bold 30px sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    const letters = n.word.split('');
    const step = 220 / Math.max(letters.length, 1);
    letters.forEach((ch, k) => x.fillText(ch, 64, 30 + step * k + step / 2));
    // A couple of dead-bulb speckles for character.
    x.shadowBlur = 0;
    x.fillStyle = 'rgba(0,0,0,0.5)';
    for (let k = 0; k < 8; k++) x.fillRect(rand(rng, 10, 118), rand(rng, 10, 246), 3, 3);
    const t = toTexture(c);
    return new THREE.MeshBasicMaterial({ map: t });
  });
}

// --- billboards ---------------------------------------------------------------

const BILLBOARDS = [
  { title: 'SOLMAR', sub: 'STREETS OF GOLD', sky: ['#ff7e5f', '#7a2d63'], fg: '#ffd23d' },
  { title: 'PALM', sub: 'HOTEL • BEACHFRONT', sky: ['#ffb347', '#ff6a4d'], fg: '#fff2c0' },
  { title: 'NEON', sub: 'NIGHTS • DOWNTOWN', sky: ['#2a1a4a', '#ff4fd8'], fg: '#35f0ff' },
];

export function createBillboardMaterials() {
  return BILLBOARDS.map((b, i) => {
    const rng = mulberry32(9000 + i * 47);
    const c = makeCanvas(512, 256);
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, b.sky[1]);
    g.addColorStop(1, b.sky[0]);
    x.fillStyle = g;
    x.fillRect(0, 0, 512, 256);
    // Sun.
    x.fillStyle = 'rgba(255,240,190,0.95)';
    x.beginPath();
    x.arc(400, 70, 42, 0, Math.PI * 2);
    x.fill();
    // Palm silhouettes.
    x.fillStyle = 'rgba(20,10,20,0.85)';
    for (const px of [60, 120, 460]) {
      x.fillRect(px - 4, 120, 8, 136);
      for (let f = 0; f < 5; f++) {
        const a = -Math.PI / 2 + (f - 2) * 0.5;
        x.beginPath();
        x.moveTo(px, 120);
        x.lineTo(px + Math.cos(a) * 52, 120 + Math.sin(a) * 34);
        x.lineTo(px + Math.cos(a) * 46, 120 + Math.sin(a) * 44);
        x.closePath();
        x.fill();
      }
    }
    // Skyline.
    x.fillStyle = 'rgba(20,10,25,0.7)';
    let bx = 150;
    while (bx < 380) {
      const bw = rand(rng, 24, 44);
      const bh = rand(rng, 50, 120);
      x.fillRect(bx, 256 - bh, bw, bh);
      bx += bw + 6;
    }
    x.textAlign = 'center';
    x.fillStyle = b.fg;
    x.font = '900 64px sans-serif';
    x.fillText(b.title, 256, 108);
    x.font = 'bold 26px sans-serif';
    x.fillStyle = '#ffffff';
    x.fillText(b.sub, 256, 150);
    return new THREE.MeshBasicMaterial({ map: toTexture(c), side: THREE.DoubleSide });
  });
}

// --- dusk sky dome -----------------------------------------------------------
// Vertex-colored gradient sphere (no texture fetch — cheap even in software
// rasterizers). Purple zenith -> magenta -> orange horizon.
export function createSkyDome() {
  const geo = new THREE.SphereGeometry(850, 24, 14);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const top = new THREE.Color(0x1e1445);
  const mid = new THREE.Color(0x9a3a6e);
  const hor = new THREE.Color(0xffb347);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp(pos.getY(i) / 850, 0, 1);
    if (t < 0.35) c.copy(hor).lerp(mid, t / 0.35);
    else c.copy(mid).lerp(top, (t - 0.35) / 0.65);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false });
  const dome = new THREE.Mesh(geo, mat);
  return dome;
}

// --- animated sea --------------------------------------------------------------

export function createSeaTexture() {
  const c = makeCanvas(256, 256);
  const x = c.getContext('2d');
  const rng = mulberry32(777);
  x.fillStyle = '#2f7fb8';
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 60; i++) {
    const y = rand(rng, 0, 256);
    x.strokeStyle = rng() > 0.5 ? 'rgba(120,200,240,0.35)' : 'rgba(255,255,255,0.22)';
    x.lineWidth = rand(rng, 1, 3);
    x.beginPath();
    x.moveTo(rand(rng, 0, 60), y);
    x.bezierCurveTo(80, y + rand(rng, -4, 4), 170, y + rand(rng, -4, 4), 256, y + rand(rng, -6, 6));
    x.stroke();
  }
  const t = toTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(7, 3);
  return t;
}
