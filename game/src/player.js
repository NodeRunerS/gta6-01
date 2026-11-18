// Solmar City — the player on foot: Rex Dalton, a low-poly third-person
// character with camera-relative movement, sprint, jump, punching and a
// pistol with hitscan shooting, muzzle flash and tracers.
import * as THREE from 'three';
import { clamp, dampAngle } from './util.js';
import { makePersonMesh } from './people.js';

export class Player {
  constructor(scene, city, x, z) {
    this.scene = scene;
    this.city = city;
    // Rex: navy jacket, jeans, cap — easy to spot in a crowd.
    this.mesh = makePersonMesh(0x1d3557, 0x2c3e50, 0xf1c27d);
    const u = this.mesh.userData;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), new THREE.MeshLambertMaterial({ color: 0xc0392b }));
    cap.position.y = 1.9;
    this.mesh.add(cap);
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = 0;
    this.speed = 0;
    this.velY = 0;
    this.grounded = true;
    this.health = 100;
    this.weapon = 'pistol';
    this.ammo = 12;
    this.reloading = false;
    this.reloadTimer = 0;
    this.shotCooldown = 0;
    this.walkPhase = 0;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 90;
    // Muzzle flash light + tracer line, reused every shot.
    this.flash = new THREE.PointLight(0xffd27a, 0, 14);
    this.scene.add(this.flash);
    const tracerGeo = new THREE.BufferGeometry();
    tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.tracer = new THREE.Line(tracerGeo, new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0 }));
    this.scene.add(this.tracer);
    this.tracerLife = 0;
  }

  reset(x, z, health) {
    this.pos.set(x, 0, z);
    this.heading = 0;
    this.speed = 0;
    this.velY = 0;
    this.health = health == null ? 100 : health;
    this.ammo = 12;
    this.reloading = false;
    this.mesh.position.copy(this.pos);
  }

  update(dt, input, camYaw) {
    this.shotCooldown = Math.max(0, this.shotCooldown - dt);
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.reloading = false;
        this.ammo = 12;
      }
    }
    // Camera-relative wish direction.
    let ix = 0, iz = 0;
    if (input.up) { ix -= Math.sin(camYaw); iz -= Math.cos(camYaw); }
    if (input.down) { ix += Math.sin(camYaw); iz += Math.cos(camYaw); }
    if (input.left) { ix -= Math.cos(camYaw); iz += Math.sin(camYaw); }
    if (input.right) { ix += Math.cos(camYaw); iz -= Math.sin(camYaw); }
    const len = Math.hypot(ix, iz);
    const targetSpeed = len > 0 ? (input.run ? 8 : 4.4) : 0;
    if (len > 0) {
      ix /= len; iz /= len;
      this.heading = dampAngle(this.heading, Math.atan2(ix, iz), 12, dt);
    }
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 10);
    // Move one axis at a time so Rex slides along building walls instead
    // of stopping dead when he clips a corner.
    if (len > 0) {
      this.pos.x += Math.sin(this.heading) * this.speed * dt;
      this.pos.x = clamp(this.pos.x, -170, 170);
      this.city.resolveCollision(this.pos, 0.7);
      this.pos.z += Math.cos(this.heading) * this.speed * dt;
      this.pos.z = clamp(this.pos.z, -170, 198);
      this.city.resolveCollision(this.pos, 0.7);
    }
    // Jump and gravity.
    if (input.jump && this.grounded) {
      this.velY = 5.2;
      this.grounded = false;
    }
    if (!this.grounded) {
      this.velY -= 14 * dt;
      this.pos.y += this.velY * dt;
      if (this.pos.y <= 0) {
        this.pos.y = 0;
        this.velY = 0;
        this.grounded = true;
      }
    }
    // Walk cycle.
    this.walkPhase += dt * (4 + this.speed * 1.4);
    const swing = Math.sin(this.walkPhase) * clamp(this.speed / 8, 0, 1) * 0.7;
    const u = this.mesh.userData;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    u.armL.rotation.x = -swing * 0.8;
    u.armR.rotation.x = swing * 0.8;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    // Muzzle flash + tracer fade.
    this.flash.intensity = Math.max(0, this.flash.intensity - dt * 60);
    if (this.tracerLife > 0) {
      this.tracerLife -= dt;
      this.tracer.material.opacity = Math.max(0, this.tracerLife / 0.08);
    }
  }

  startReload() {
    if (this.weapon !== 'pistol' || this.reloading || this.ammo === 12) return false;
    this.reloading = true;
    this.reloadTimer = 1.1;
    return true;
  }

  // Hitscan shot from the camera centre. `shootables` are meshes whose
  // userData.shoot is { kind, ref }. Returns the hit or null.
  fire(camera, shootables) {
    if (this.weapon !== 'pistol' || this.shotCooldown > 0 || this.reloading) return { fired: false };
    if (this.ammo <= 0) {
      this.startReload();
      return { fired: false, dry: true };
    }
    this.ammo--;
    this.shotCooldown = 0.22;
    this.raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    const hits = this.raycaster.intersectObjects(shootables, true);
    const muzzle = this.pos.clone();
    muzzle.y += 1.35;
    muzzle.x += Math.sin(this.heading) * 0.5;
    muzzle.z += Math.cos(this.heading) * 0.5;
    this.flash.position.copy(muzzle);
    this.flash.intensity = 14;
    const positions = this.tracer.geometry.attributes.position;
    positions.setXYZ(0, muzzle.x, muzzle.y, muzzle.z);
    let end = null;
    let hit = null;
    if (hits.length > 0) {
      end = hits[0].point;
      let obj = hits[0].object;
      while (obj && !obj.userData.shoot) obj = obj.parent;
      if (obj && obj.userData.shoot) hit = { ...obj.userData.shoot, point: end, distance: hits[0].distance };
    } else {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      end = muzzle.clone().add(dir.multiplyScalar(80));
    }
    positions.setXYZ(1, end.x, end.y, end.z);
    positions.needsUpdate = true;
    this.tracer.material.opacity = 0.9;
    this.tracerLife = 0.08;
    return { fired: true, hit };
  }

  // A punch: anything shootable within 2.2 m in front of Rex.
  punch(shootables) {
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    let best = null;
    let bestD = 2.4;
    for (const obj of shootables) {
      const s = obj.userData.shoot;
      if (!s || (s.kind !== 'ped' && s.kind !== 'enemy')) continue;
      const p = obj.position;
      const dx = p.x - this.pos.x;
      const dz = p.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < bestD && (dx * fx + dz * fz) > 0) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }
}
