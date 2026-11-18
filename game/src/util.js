// Small shared helpers: math, deterministic random, and circle-vs-AABB collision.
// No imports; every other module pulls what it needs from here.
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const TAU = Math.PI * 2;

/** Deterministic RNG (mulberry32) so the city looks the same every load. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rand = (rng, lo, hi) => lo + rng() * (hi - lo);
export const randInt = (rng, lo, hi) => Math.floor(rand(rng, lo, hi + 1));
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

/** Shortest signed angle from a to b, in (-PI, PI]. */
export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

/** Move angle `a` toward `b` by at most `step` radians. */
export function angleToward(a, b, step) {
  const d = angleDelta(a, b);
  if (Math.abs(d) <= step) return b;
  return a + Math.sign(d) * step;
}

/**
 * Push a circle (x, z, radius) out of an axis-aligned box {minX, maxX, minZ, maxZ}.
 * Returns true when a push happened. Mutates the given position object.
 */
export function circleVsBox(p, r, box) {
  const cx = clamp(p.x, box.minX, box.maxX);
  const cz = clamp(p.z, box.minZ, box.maxZ);
  const dx = p.x - cx;
  const dz = p.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    p.x = cx + (dx / d) * r;
    p.z = cz + (dz / d) * r;
  } else {
    // Circle center inside the box: push out along the smallest penetration axis.
    const pl = p.x - box.minX;
    const pr = box.maxX - p.x;
    const pt = p.z - box.minZ;
    const pb = box.maxZ - p.z;
    const m = Math.min(pl, pr, pt, pb);
    if (m === pl) p.x = box.minX - r;
    else if (m === pr) p.x = box.maxX + r;
    else if (m === pt) p.z = box.minZ - r;
    else p.z = box.maxZ + r;
  }
  return true;
}

/** Format dollars as "$1,250". */
export const moneyFmt = (n) => '$' + Math.round(n).toLocaleString('en-US');

/** Format game minutes since midnight as "08:15". */
export function clockFmt(minutes) {
  const m = Math.floor(minutes) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
