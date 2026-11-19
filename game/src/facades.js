// Procedural facade textures for Solmar City: canvas-painted building faces
// (glass towers, art-deco pastels, brick, pastel houses), neon signs, water
// and the dusk sky. All textures are generated at load time — no image files,
// no network requests.
import * as THREE from 'three';
import { mulberry32, pick } from './util.js';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function windowCell(ctx, x, y, w, h, rng, litChance) {
  const lit = rng() < litChance;
  if (lit) {
    ctx.fillStyle = pick(rng, ['#ffd27a', '#ffe9a8', '#ffb46b', '#9fd8ff', '#ff9ecf']);
  } else {
    ctx.fillStyle = 'rgba(10,16,28,0.92)';
  }
  ctx.fillRect(x, y, w, h);
}

// Downtown glass tower: dark blue glass with a lit window grid and floor bands.
export function glassTexture(seed) {
  const rng = mulberry32(seed);
  const [c, ctx] = makeCanvas(128, 256);
  ctx.fillStyle = pick(rng, ['#1c2f4d', '#22384f', '#182638', '#2a3a55', '#1a2c44']);
  ctx.fillRect(0, 0, 128, 256);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  for (let y = 0; y < 256; y += 18) ctx.fillRect(0, y, 128, 2);
  for (let y = 10; y < 250; y += 18) {
    for (let x = 7; x < 122; x += 15) windowCell(ctx, x, y, 9, 10, rng, 0.4);
  }
  return toTexture(c);
}

// Art-deco pastel hotel: pastel face, stepped bands, awning windows, neon strip.
export function decoTexture(seed) {
  const rng = mulberry32(seed);
  const [c, ctx] = makeCanvas(128, 256);
  ctx.fillStyle = pick(rng, ['#ffb3c8', '#a8e6d5', '#ffe08a', '#c9b6f2', '#ffb98a', '#9ad7f0']);
  ctx.fillRect(0, 0, 128, 256);
  ctx.fillStyle = 'rgba(255,255,255,0.32)';
  for (let y = 22; y < 256; y += 34) ctx.fillRect(0, y, 128, 5);
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  for (let y = 30; y < 256; y += 34) ctx.fillRect(0, y, 128, 2);
  for (let y = 40; y < 248; y += 34) {
    for (let x = 12; x < 118; x += 27) {
      ctx.fillStyle = rng() < 0.42 ? '#ffe9a8' : '#20283a';
      ctx.fillRect(x, y, 16, 18);
      ctx.fillStyle = pick(rng, ['#ff5e8a', '#00c8d8', '#ff8a3d', '#7a5cff']);
      ctx.fillRect(x - 2, y - 6, 20, 5);
    }
  }
  const neon = pick(rng, ['#ff2e88', '#00e5ff', '#ff9e00', '#b26bff']);
  ctx.fillStyle = neon;
  ctx.fillRect(0, 10, 128, 6);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(0, 11, 128, 2);
  return toTexture(c);
}

// Brick mid-rise with mortar lines and dark windows.
export function brickTexture(seed) {
  const rng = mulberry32(seed);
  const [c, ctx] = makeCanvas(128, 128);
  ctx.fillStyle = pick(rng, ['#8a4a3a', '#7a4034', '#96503e', '#83443a']);
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  for (let y = 0; y < 128; y += 8) ctx.fillRect(0, y, 128, 1);
  for (let y = 12; y < 124; y += 26) {
    for (let x = 10; x < 118; x += 28) windowCell(ctx, x, y, 16, 16, rng, 0.38);
  }
  return toTexture(c);
}

// Small pastel house: flat color face, door, shuttered windows.
export function houseTexture(seed) {
  const rng = mulberry32(seed);
  const [c, ctx] = makeCanvas(128, 128);
  ctx.fillStyle = pick(rng, ['#ffd166', '#ff8fa3', '#7ee0c2', '#f9a8d4', '#a5d8ff', '#ffb703']);
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillRect(0, 0, 128, 10);
  ctx.fillStyle = '#3a2a1a';
  ctx.fillRect(54, 78, 20, 50);
  for (const x of [16, 92]) {
    ctx.fillStyle = rng() < 0.5 ? '#ffe9a8' : '#22304a';
    ctx.fillRect(x, 34, 20, 24);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 2, 32, 24, 3);
  }
  return toTexture(c);
}

// Glowing neon sign: text with a strong colored halo on a dark plate.
// Drawn twice so the core burns bright even in full daylight.
export function signTexture(text, color, bg) {
  const [c, ctx] = makeCanvas(256, 64);
  ctx.fillStyle = bg || '#12081c';
  ctx.fillRect(0, 0, 256, 64);
  ctx.font = 'bold italic 34px Impact, "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = 30;
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 34);
  ctx.fillText(text, 128, 34);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 128, 34);
  return toTexture(c);
}

// Soft radial glow sprite texture (white core fading to transparent),
// tinted per use via material color. Used for neon halos and lamp glows.
export function glowTexture() {
  const [c, ctx] = makeCanvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.28)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return toTexture(c);
}

// Animated water: turquoise with soft wave streaks; the offset is scrolled
// in the main loop.
export function waterTexture() {
  const rng = mulberry32(7);
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#2aa8c8';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 260; i++) {
    ctx.strokeStyle = `rgba(255,255,255,${0.05 + rng() * 0.16})`;
    ctx.lineWidth = 1 + rng() * 2;
    const x = rng() * 256;
    const y = rng() * 256;
    const len = 12 + rng() * 40;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y + (rng() - 0.5) * 8);
    ctx.stroke();
  }
  const t = toTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(10, 8);
  return t;
}

// Bright daytime sky dome: deep blue up top, pale blue at the horizon.
export function skyTexture() {
  const [c, ctx] = makeCanvas(16, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#1a5fb4');
  g.addColorStop(0.4, '#3f8fd8');
  g.addColorStop(0.7, '#7ab8e8');
  g.addColorStop(0.88, '#bfe3f7');
  g.addColorStop(1, '#dff2fb');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 256);
  return toTexture(c);
}
