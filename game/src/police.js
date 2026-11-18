// The wanted system and the police: stars 0-5, police cars that spawn on a road
// near the player, navigate the road grid toward them (Manhattan turns at
// intersections), then chase directly, ram and arrest when they are cornered
// and slow. Stars decay when the player stays clean and out of sight.
import * as THREE from '../vendor/three.module.min.js';
import { S } from './state.js';
import { CITY } from './city.js';
import { angleToward, circleVsBox, clamp, rand } from './util.js';
import { Car } from './vehicles.js';

/** Heading for driving along an axis in a direction. */
function headingFor(axis, dir) {
  if (axis === 'x') return dir > 0 ? 0 : Math.PI;
  return dir > 0 ? -Math.PI / 2 : Math.PI / 2;
}

export class Police {
  constructor() {
    this.units = []; // active police Cars
    this.arrestTimer = 0;
    this.decayTimer = 0;
    this.flashTimer = 0;
    this.ramCooldown = 0;
    // One shared strobe light: it rides on the nearest unit and alternates
    // red/blue, throwing the flash onto nearby cars, walls and road.
    this.strobeLight = new THREE.PointLight(0xff2222, 0, 30, 1.8);
    this.strobeLight.position.set(0, 3.5, 0);
    S.scene.add(this.strobeLight);
  }

  /** Raise the wanted level (clamped 0..5). */
  addWanted(n) {
    if (n <= 0) return;
    S.wanted = clamp(S.wanted + n, 0, 5);
    S.lastCrimeAt = S.time;
    this.decayTimer = 0;
    if (S.hud) S.hud.showToast(`Wanted level ${'★'.repeat(S.wanted)}`);
  }

  clearWanted() {
    S.wanted = 0;
    this.arrestTimer = 0;
    this._despawnAll();
  }

  _despawnAll() {
    for (const u of this.units) {
      const i = S.cars.indexOf(u);
      if (i >= 0) S.cars.splice(i, 1);
      u.dispose();
    }
    this.units = [];
  }

  /** Spawn a unit on a road near the player, already heading toward them. */
  _spawnUnit() {
    const p = S.player.pos;
    const axis = Math.random() > 0.5 ? 'x' : 'z';
    const cross = axis === 'x' ? p.z : p.x;
    const near = CITY.LINES.filter((l) => Math.abs(l - cross) <= 140);
    const line = near.length > 0 ? near[Math.floor(Math.random() * near.length)] : CITY.LINES[Math.floor(Math.random() * CITY.LINES.length)];
    const alongPlayer = axis === 'x' ? p.x : p.z;
    let along = alongPlayer + (Math.random() > 0.5 ? 1 : -1) * (70 + Math.random() * 60);
    along = clamp(along, -215, 215);
    const dir = along < alongPlayer ? 1 : -1;
    const lane = dir > 0 ? 3 : -3;
    const x = axis === 'x' ? along : line + lane;
    const z = axis === 'x' ? line + lane : along;
    const car = new Car('sedan', x, z, headingFor(axis, dir), { police: true, seed: 900 + this.units.length });
    car.def = { ...car.def, maxSpeed: 36, accel: 18 };
    car.roadAxis = axis;
    car.roadLine = line;
    car.roadDir = dir;
    car.mode = 'road';
    car.lastTurnKey = '';
    this.units.push(car);
    S.cars.push(car);
    if (S.sounds) S.sounds.horn();
  }

  /** Steer a car directly toward a point (used for the chase and road-seeking). */
  _steerToward(u, tx, tz, dt, throttle = 1) {
    const dx = tx - u.pos.x;
    const dz = tz - u.pos.z;
    const wantHeading = Math.atan2(-dz, dx);
    let d = (wantHeading - u.heading) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    u.drive(dt, throttle, clamp(d * 1.6, -1, 1), false);
  }

  /** At an intersection, pick the road that gets closest to the player. */
  _chooseTurn(u, crossingLine, p) {
    const axis = u.roadAxis;
    const ix = axis === 'x' ? crossingLine : u.roadLine;
    const iz = axis === 'x' ? u.roadLine : crossingLine;
    const dir = u.roadDir;
    const cands = [
      { axis, dir, px: ix + (axis === 'x' ? dir * 56 : 0), pz: iz + (axis === 'z' ? dir * 56 : 0) },
      { axis, dir: -dir, px: ix - (axis === 'x' ? dir * 56 : 0), pz: iz - (axis === 'z' ? dir * 56 : 0) },
    ];
    for (const nd of [1, -1]) {
      const nAxis = axis === 'x' ? 'z' : 'x';
      cands.push({ axis: nAxis, dir: nd, px: ix + (nAxis === 'x' ? nd * 56 : 0), pz: iz + (nAxis === 'z' ? nd * 56 : 0) });
    }
    let best = null;
    let bestD = Infinity;
    for (const c of cands) {
      // Candidate positions are road points; the outermost roads are at ±224.
      if (c.px < -224 || c.px > 224 || c.pz < -224 || c.pz > 224) continue;
      const d = Math.abs(c.px - p.x) + Math.abs(c.pz - p.z);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    if (!best) return;
    u.roadAxis = best.axis;
    u.roadDir = best.dir;
    u.roadLine = best.axis === 'x' ? iz : ix;
    // Snap onto the new road through the intersection.
    if (best.axis === 'x') {
      u.pos.x = ix;
      u.pos.z = u.roadLine + (best.dir > 0 ? 3 : -3);
    } else {
      u.pos.z = iz;
      u.pos.x = u.roadLine + (best.dir > 0 ? 3 : -3);
    }
    u.heading = headingFor(best.axis, best.dir);
    u.syncMesh(0);
  }

  _updateRoadUnit(u, dt, p) {
    const targetSpeed = 30;
    const throttle = u.speed < targetSpeed ? 1 : 0;
    u.drive(dt, throttle, 0, false);
    // Stay glued to the lane.
    if (u.roadAxis === 'x') u.pos.z = u.roadLine + (u.roadDir > 0 ? 3 : -3);
    else u.pos.x = u.roadLine + (u.roadDir > 0 ? 3 : -3);
    // Intersection: choose the next road.
    const along = u.roadAxis === 'x' ? u.pos.x : u.pos.z;
    const nearest = CITY.LINES.reduce((best, l) => (Math.abs(l - along) < Math.abs(best - along) ? l : best), CITY.LINES[0]);
    const key = `${u.roadAxis}:${nearest}`;
    if (Math.abs(along - nearest) < 2.5 && u.lastTurnKey !== key) {
      u.lastTurnKey = key;
      this._chooseTurn(u, nearest, p);
    }
    // Safety: never leave the city.
    u.pos.x = clamp(u.pos.x, -226, 226);
    u.pos.z = clamp(u.pos.z, -226, 226);
  }

  _updateSeekUnit(u, dt, p) {
    // Drive toward the nearest road, then join it.
    const nearestX = CITY.LINES.reduce((best, l) => (Math.abs(l - u.pos.x) < Math.abs(best - u.pos.x) ? l : best), CITY.LINES[0]);
    const nearestZ = CITY.LINES.reduce((best, l) => (Math.abs(l - u.pos.z) < Math.abs(best - u.pos.z) ? l : best), CITY.LINES[0]);
    const dx = Math.abs(nearestX - u.pos.x);
    const dz = Math.abs(nearestZ - u.pos.z);
    let tx;
    let tz;
    let axis;
    let line;
    if (dx <= dz) {
      tx = nearestX;
      tz = u.pos.z;
      axis = 'z';
      line = nearestX;
    } else {
      tx = u.pos.x;
      tz = nearestZ;
      axis = 'x';
      line = nearestZ;
    }
    this._steerToward(u, tx, tz, dt, 1);
    u.pos.x = clamp(u.pos.x, -228, 228);
    u.pos.z = clamp(u.pos.z, -228, 228);
    for (const box of S.colliders) {
      if (circleVsBox(u.pos, u.radius, box)) u.speed *= 0.4;
    }
    const dRoad = Math.hypot(tx - u.pos.x, tz - u.pos.z);
    if (dRoad < 4) {
      u.mode = 'road';
      u.roadAxis = axis;
      u.roadLine = line;
      const alongPlayer = axis === 'x' ? p.x : p.z;
      const along = axis === 'x' ? u.pos.x : u.pos.z;
      u.roadDir = along < alongPlayer ? 1 : -1;
      u.heading = headingFor(axis, u.roadDir);
    }
  }

  update(dt) {
    if (S.mode !== 'playing') {
      if (S.sounds) S.sounds.siren(false, dt);
      return;
    }
    const p = S.player;
    if (!p) return;

    // Keep the number of units in step with the wanted level (max 4).
    const want = Math.min(S.wanted, 4);
    while (this.units.length < want) this._spawnUnit();
    while (this.units.length > want) {
      const u = this.units.pop();
      const i = S.cars.indexOf(u);
      if (i >= 0) S.cars.splice(i, 1);
      u.dispose();
    }

    // Wanted decay: clean for a while and out of sight, stars fall one by one.
    if (S.wanted > 0 && S.time - S.lastCrimeAt > 20) {
      const nearest = this.units.reduce((m, u) => Math.min(m, Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z)), Infinity);
      if (nearest > 45) {
        this.decayTimer += dt;
        if (this.decayTimer > 12) {
          this.decayTimer = 0;
          S.wanted = Math.max(0, S.wanted - 1);
          if (S.hud) S.hud.showToast(`Heat falling — ${S.wanted} star${S.wanted === 1 ? '' : 's'}`);
        }
      } else {
        this.decayTimer = 0;
      }
    }

    // Flash the light bars and run the siren while any unit is active:
    // lens emissive pulses red/blue in opposition, and the shared strobe
    // light rides the nearest unit so the flash lands on nearby surfaces.
    this.flashTimer += dt;
    const flash = Math.sin(this.flashTimer * 10) > 0;
    for (const u of this.units) {
      const ud = u.group.userData;
      if (ud.lightRedMat) ud.lightRedMat.emissiveIntensity = flash ? 4 : 0.25;
      if (ud.lightBlueMat) ud.lightBlueMat.emissiveIntensity = flash ? 0.25 : 4;
    }
    if (this.units.length > 0) {
      let nearest = this.units[0];
      let best = Infinity;
      for (const u of this.units) {
        const d = Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z);
        if (d < best) {
          best = d;
          nearest = u;
        }
      }
      this.strobeLight.position.set(nearest.pos.x, 3.5, nearest.pos.z);
      this.strobeLight.color.set(flash ? 0xff2222 : 0x2266ff);
      this.strobeLight.intensity = 60;
    } else {
      this.strobeLight.intensity = 0;
    }
    if (S.sounds) S.sounds.siren(this.units.length > 0, dt);

    // Chase behaviour.
    const playerSpeed = p.driving ? Math.abs(p.car.speed) : Math.hypot(p.vel.x, p.vel.z);
    let arresting = false;
    this.ramCooldown = Math.max(0, this.ramCooldown - dt);
    for (const u of this.units) {
      const dx = p.pos.x - u.pos.x;
      const dz = p.pos.z - u.pos.z;
      const dist = Math.hypot(dx, dz);

      if (dist < 25) u.mode = 'chase';
      else if (u.mode === 'chase' && dist > 55) u.mode = 'seek';

      if (u.mode === 'road') this._updateRoadUnit(u, dt, p.pos);
      else if (u.mode === 'seek') this._updateSeekUnit(u, dt, p.pos);
      else {
        // Direct chase: steer at the player, buildings push back.
        this._steerToward(u, p.pos.x, p.pos.z, dt, dist > 6 ? 1 : 0.4);
        for (const box of S.colliders) {
          if (circleVsBox(u.pos, u.radius, box)) u.speed *= 0.4;
        }
        u.pos.x = clamp(u.pos.x, -228, 228);
        u.pos.z = clamp(u.pos.z, -228, 228);
      }

      // Ram: shove the player's car (or hurt them on foot) on contact.
      if (dist < u.radius + 2.2 && this.ramCooldown <= 0) {
        this.ramCooldown = 0.8;
        const nx = dx / (dist || 1);
        const nz = dz / (dist || 1);
        if (p.driving && p.car) {
          p.car.pos.x += nx * 2.2;
          p.car.pos.z += nz * 2.2;
          p.car.speed *= 0.7;
          p.damage(4, 'ram');
        } else {
          p.damage(8, 'ram');
          p.pos.x += nx * 1.5;
          p.pos.z += nz * 1.5;
        }
        if (S.sounds) S.sounds.punch();
      }

      // Arrest: cornered and slow.
      if (dist < 5 && playerSpeed < 1.5) arresting = true;
    }
    if (arresting && S.wanted > 0) {
      this.arrestTimer += dt;
      if (S.hud) S.hud.showToast(`Police closing in… ${(3 - this.arrestTimer).toFixed(0)}s — MOVE!`);
      if (this.arrestTimer > 3) {
        this.arrestTimer = 0;
        if (S.missions) S.missions.onBusted();
        else if (window.__game) window.__game.busted();
      }
    } else {
      this.arrestTimer = Math.max(0, this.arrestTimer - dt * 2);
    }
  }
}
