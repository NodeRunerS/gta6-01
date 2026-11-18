// The player: on-foot movement (WASD, Shift run, Space jump, mouse-orbit camera),
// driving (W/S throttle, A/D steer, Space handbrake, E enter/exit car), and
// combat (F punch, mouse pistol with R reload). Health, wanted and damage live here.
import * as THREE from '../vendor/three.module.min.js';
import { S } from './state.js';
import { circleVsBox, clamp, mulberry32 } from './util.js';
import { makePersonMesh, animateWalk } from './people.js';

export class Player {
  constructor(x, z) {
    // Rex: blue shirt, dark jacket, jeans, dark flat hair.
    this.group = makePersonMesh(0x3a6ac2, 0xd9a986, {
      hairStyle: 'flat',
      hairColor: 0x1a1a1a,
      pants: 0x2e3a4a,
      jacket: 0x1e3a5f,
      scale: 1.02,
    });
    this.parts = this.group.userData.parts;
    this.walkPhase = 0;
    this.group.position.set(x, 0, z);
    this.pos = { x, y: 0, z };
    this.vel = { x: 0, z: 0 };
    this.vy = 0;
    this.onGround = true;
    this.heading = 0; // facing, radians (0 = +X)
    this.camYaw = Math.PI / 2;
    this.camPitch = 0.32;
    this.driving = false;
    this.car = null;
    this.shotsFiredAt = -999;
    this.damageCooldown = 0;
    this.reloadTimer = 0;
    this.punchTimer = 0;
    this.enterTimer = 0; // brief animation when stealing a car
    S.scene.add(this.group);
    S.player = this;
  }

  get speed() {
    if (this.driving && this.car) return Math.abs(this.car.speed);
    return Math.hypot(this.vel.x, this.vel.z);
  }

  damage(n, _cause) {
    if (this.damageCooldown > 0 || S.mode !== 'playing') return;
    this.damageCooldown = 0.5;
    S.health = Math.max(0, S.health - n);
    if (S.hud) S.hud.flashDamage();
    if (S.health <= 0) {
      if (S.missions) S.missions.onWasted();
      else if (window.__game) window.__game.wasted();
    }
  }

  /** Nearest stealable parked car within reach, or null. */
  nearestParkedCar() {
    let best = null;
    let bestD = 4.6;
    for (const c of S.cars) {
      if (!c.parked) continue;
      const d = Math.hypot(c.pos.x - this.pos.x, c.pos.z - this.pos.z);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  enterCar(car) {
    this.driving = true;
    this.car = car;
    car.parked = false;
    car.speed = 0;
    this.group.visible = false;
    this.enterTimer = 0.4;
    this.pos.x = car.pos.x;
    this.pos.z = car.pos.z;
    this.heading = car.heading;
    if (S.police) S.police.addWanted(1);
    if (S.hud) S.hud.showToast('Car stolen! The cops noticed.');
    if (S.sounds) S.sounds.horn();
  }

  exitCar() {
    if (!this.car) return;
    const car = this.car;
    this.driving = false;
    this.car = null;
    // Step out on the driver's side.
    const sx = car.pos.x + Math.sin(car.heading) * 2.2;
    const sz = car.pos.z + Math.cos(car.heading) * 2.2;
    this.pos.x = clamp(sx, -222, 222);
    this.pos.z = clamp(sz, -222, 222);
    this.pos.y = 0;
    this.group.visible = true;
    this.group.position.set(this.pos.x, 0, this.pos.z);
  }

  shoot() {
    if (this.reloadTimer > 0 || S.mode !== 'playing') return;
    if (S.ammo <= 0) {
      if (S.sounds) S.sounds.punch();
      this.startReload();
      return;
    }
    S.ammo -= 1;
    this.shotsFiredAt = S.time;
    if (S.sounds) S.sounds.shot();
    if (S.police) S.police.addWanted(0); // shooting near police is handled by proximity below
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, 0), S.camera);
    ray.far = 90;
    const targets = [];
    for (const e of S.enemies) if (!e.dead) targets.push(e.group);
    for (const w of S.pedestrians) if (w.state !== 'down') targets.push(w.group);
    const hits = ray.intersectObjects(targets, true);
    if (hits.length > 0) {
      let obj = hits[0].object;
      while (obj && !obj.userData.person) obj = obj.parent;
      const person = obj ? obj.userData.person : null;
      if (person) {
        if (person.takeDamage) {
          person.takeDamage(34);
        } else {
          person.knockDown();
          if (S.police) S.police.addWanted(1);
        }
      }
    }
    // Firing a gun in the city draws heat when police are near.
    if (S.police && S.police.units.length > 0) S.police.addWanted(1);
  }

  punch() {
    if (this.punchTimer > 0 || S.mode !== 'playing') return;
    this.punchTimer = 0.45;
    if (S.sounds) S.sounds.punch();
    const fx = Math.cos(this.heading);
    const fz = -Math.sin(this.heading);
    for (const e of [...S.enemies]) {
      const dx = e.pos.x - this.pos.x;
      const dz = e.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 2.6 && (dx * fx + dz * fz) / (d || 1) > 0.3) {
        e.takeDamage(30);
        e.pos.x += (dx / (d || 1)) * 1.2;
        e.pos.z += (dz / (d || 1)) * 1.2;
      }
    }
    for (const w of S.pedestrians) {
      if (w.state === 'down') continue;
      const dx = w.pos.x - this.pos.x;
      const dz = w.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 2.4 && (dx * fx + dz * fz) / (d || 1) > 0.3) {
        w.knockDown();
        if (S.police) S.police.addWanted(1);
      }
    }
  }

  startReload() {
    if (this.reloadTimer > 0 || S.ammoReserve <= 0) return;
    this.reloadTimer = 1.2;
    if (S.hud) S.hud.showToast('Reloading…');
  }

  update(dt) {
    this.damageCooldown = Math.max(0, this.damageCooldown - dt);
    this.punchTimer = Math.max(0, this.punchTimer - dt);
    this.enterTimer = Math.max(0, this.enterTimer - dt);
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const need = 12 - S.ammo;
        const take = Math.min(need, S.ammoReserve);
        S.ammo += take;
        S.ammoReserve -= take;
      }
    }
    const k = S.keys;

    if (this.driving && this.car) {
      const throttle = (k['KeyW'] || k['ArrowUp'] ? 1 : 0) + (k['KeyS'] || k['ArrowDown'] ? -1 : 0);
      const steer = (k['KeyA'] || k['ArrowLeft'] ? 1 : 0) + (k['KeyD'] || k['ArrowRight'] ? -1 : 0);
      const handbrake = !!k['Space'];
      this.car.drive(dt, throttle, steer, handbrake);
      // Collisions with buildings.
      for (const box of S.colliders) {
        if (circleVsBox(this.car.pos, this.car.radius, box)) this.car.speed *= 0.45;
      }
      // Collisions with other cars: push apart, damp speed.
      for (const other of S.cars) {
        if (other === this.car) continue;
        const dx = this.car.pos.x - other.pos.x;
        const dz = this.car.pos.z - other.pos.z;
        const d = Math.hypot(dx, dz);
        const min = this.car.radius + other.radius - 0.4;
        if (d < min && d > 0.01) {
          const push = (min - d) / 2;
          const nx = dx / d;
          const nz = dz / d;
          this.car.pos.x += nx * push;
          this.car.pos.z += nz * push;
          if (!other.parked && !other.traffic) {
            other.pos.x -= nx * push;
            other.pos.z -= nz * push;
          }
          this.car.speed *= 0.75;
          if (Math.abs(this.car.speed) > 6 && S.police) S.police.addWanted(0);
        }
      }
      this.car.pos.x = clamp(this.car.pos.x, -228, 228);
      this.car.pos.z = clamp(this.car.pos.z, -228, 228);
      this.pos.x = this.car.pos.x;
      this.pos.z = this.car.pos.z;
      this.heading = this.car.heading;
      if (S.sounds) S.sounds.engine(Math.abs(this.car.speed), true);
      return;
    }

    // --- on foot ---
    const run = k['ShiftLeft'] || k['ShiftRight'];
    const speed = run ? 11 : 6;
    // Camera-relative movement.
    const fwdX = Math.cos(this.camYaw);
    const fwdZ = -Math.sin(this.camYaw);
    const rightX = -fwdZ;
    const rightZ = fwdX;
    let mx = 0;
    let mz = 0;
    if (k['KeyW'] || k['ArrowUp']) {
      mx += fwdX;
      mz += fwdZ;
    }
    if (k['KeyS'] || k['ArrowDown']) {
      mx -= fwdX;
      mz -= fwdZ;
    }
    if (k['KeyD'] || k['ArrowRight']) {
      mx += rightX;
      mz += rightZ;
    }
    if (k['KeyA'] || k['ArrowLeft']) {
      mx -= rightX;
      mz -= rightZ;
    }
    const mLen = Math.hypot(mx, mz);
    if (mLen > 0.01) {
      mx /= mLen;
      mz /= mLen;
      this.vel.x = mx * speed;
      this.vel.z = mz * speed;
      this.heading = Math.atan2(-mz, mx);
    } else {
      this.vel.x *= Math.max(0, 1 - dt * 10);
      this.vel.z *= Math.max(0, 1 - dt * 10);
    }
    // Jump.
    if (k['Space'] && this.onGround) {
      this.vy = 8.5;
      this.onGround = false;
    }
    if (!this.onGround) {
      this.vy -= 24 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= 0) {
        this.pos.y = 0;
        this.vy = 0;
        this.onGround = true;
      }
    }
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.x = clamp(this.pos.x, -222, 222);
    this.pos.z = clamp(this.pos.z, -222, 222);
    for (const box of S.colliders) circleVsBox(this.pos, 0.6, box);
    // Bumping into a parked car hurts no one, just blocks.
    for (const c of S.cars) {
      if (c.parked || c.traffic) circleVsBox(this.pos, 0.6, { minX: c.pos.x - c.length / 2, maxX: c.pos.x + c.length / 2, minZ: c.pos.z - c.width / 2, maxZ: c.pos.z + c.width / 2 });
    }
    // Run over by a moving car?
    for (const c of S.cars) {
      if (c.parked || c === this.car) continue;
      const d = Math.hypot(c.pos.x - this.pos.x, c.pos.z - this.pos.z);
      if (d < 2.4 && Math.abs(c.speed) > 5) this.damage(12, 'run over');
    }
    this.group.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.group.rotation.y = -this.heading;
    // Walk cycle: swing arms and legs with speed, small bob.
    const moving = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && moving > 0.5) this.walkPhase += dt * moving * 1.35;
    animateWalk(this.parts, this.walkPhase, this.onGround ? Math.min(1, moving / 6) : 0);
    this.group.position.y = this.pos.y + (this.onGround ? Math.abs(Math.sin(this.walkPhase)) * 0.05 * (moving / 6) : 0);
    if (S.sounds) S.sounds.engine(0, false);
  }
}
