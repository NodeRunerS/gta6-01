// Solmar City — shared helpers: seeded random numbers, small math utilities,
// and procedural canvas textures (building facades, asphalt, signs) generated
// at runtime, so the game ships no image files and loads nothing from the network.
import * as THREE from 'three';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function angleDifference(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function dampAngle(current, target, lambda, dt) {
  return current + angleDifference(current, target) * (1 - Math.exp(-lambda * dt));
}

export function randomPick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

export function makeCanvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// A building facade: base colour, a grid of windows (some warmly lit, some
// dark), a shopfront band at street level and a darker roofline.
export function buildingTexture(base, floors, rng) {
  return makeCanvasTexture(128, 256, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    const rows = Math.max(3, floors);
    const cols = 5;
    const cellW = w / cols;
    const cellH = (h - 34) / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const lit = rng() < 0.42;
        ctx.fillStyle = lit ? '#ffd98a' : (rng() < 0.5 ? '#2c3e50' : '#3d5a73');
        ctx.fillRect(c * cellW + 5, 8 + r * cellH + 5, cellW - 10, cellH - 10);
        if (lit) {
          ctx.fillStyle = 'rgba(255,255,255,0.25)';
          ctx.fillRect(c * cellW + 5, 8 + r * cellH + 5, cellW - 10, 4);
        }
      }
    }
    // Shopfront band.
    ctx.fillStyle = '#20242a';
    ctx.fillRect(0, h - 30, w, 30);
    ctx.fillStyle = '#ffd98a';
    ctx.fillRect(8, h - 24, w - 16, 14);
    // Roofline.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, w, 6);
  });
}

// Asphalt with a dashed centre line and pale edge lines. Tiled along a road.
export function roadTexture() {
  return makeCanvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#33363b';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < 200; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    ctx.fillStyle = '#e8e4d8';
    ctx.fillRect(4, 0, 3, h);
    ctx.fillRect(w - 7, 0, 3, h);
    ctx.fillStyle = '#f7c948';
    ctx.fillRect(w / 2 - 2, 8, 4, 34);
    ctx.fillRect(w / 2 - 2, 72, 4, 34);
  });
}

// A billboard / shop sign with big original lettering.
export function signTexture(text, sub, bg, fg) {
  return makeCanvasTexture(512, 192, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 10;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = fg;
    ctx.font = 'bold 84px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, sub ? h / 2 - 22 : h / 2);
    if (sub) {
      ctx.font = 'bold 34px Arial, sans-serif';
      ctx.fillText(sub, w / 2, h / 2 + 52);
    }
  });
}
