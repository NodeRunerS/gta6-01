// Solmar City — missions and story: five story jobs for Rex, handed out by
// Mara Solis, Eddie and the Broker, with dialogue, a glowing objective
// beacon, timers, crates to collect, armed bank guards, and repeatable side
// jobs once the story is done.
import * as THREE from 'three';

const MISSIONS = [
  {
    id: 'wheels-up',
    title: 'Wheels Up',
    giver: 'Mara Solis',
    briefing: 'Rex, welcome back to Solmar. The Broker is in town and he pays in gold. First, you need wheels.',
    dialogue: 'Borrow a car — any car. Press E near one to take it. Then meet me at the Neon Pier.',
    reward: 500,
    steps: [
      { type: 'steal', text: 'Steal a car (press E near one)', radius: 0 },
      { type: 'drive', target: 'pier', text: 'Drive to the Neon Pier', radius: 6 },
    ],
  },
  {
    id: 'the-courier',
    title: 'The Courier',
    giver: 'Mara Solis',
    briefing: 'A package is waiting at Hotel Miramar. Take it to the Neon Pier. Fast — and quiet.',
    dialogue: 'Pick up the package at the hotel, then deliver it to the pier. You have 90 seconds.',
    reward: 800,
    steps: [
      { type: 'goto', target: 'hotel', text: 'Pick up the package at Hotel Miramar', radius: 5 },
      { type: 'drive', target: 'pier', text: 'Deliver the package to the Neon Pier (90s)', radius: 6, timer: 90 },
    ],
  },
  {
    id: 'heat-wave',
    title: 'Heat Wave',
    giver: 'Eddie',
    briefing: 'Cops are crawling all over the east side. Shake the heat, then get to the safehouse on the west side.',
    dialogue: 'Lose the cops first — stay out of sight until the stars fade. Then drive to the safehouse.',
    reward: 1000,
    steps: [
      { type: 'escape', text: 'Lose your wanted level', radius: 0 },
      { type: 'drive', target: 'safehouse', text: 'Reach the safehouse', radius: 6 },
    ],
  },
  {
    id: 'supply-run',
    title: 'Supply Run',
    giver: 'Eddie',
    briefing: 'The Broker needs three crates stashed around the city. Grab them all and bring the job home.',
    dialogue: 'Three crates, three corners of the city. Follow the beacon, grab each one.',
    reward: 1200,
    steps: [
      { type: 'collect', target: 'crate1', text: 'Collect crate 1 of 3', radius: 3 },
      { type: 'collect', target: 'crate2', text: 'Collect crate 2 of 3', radius: 3 },
      { type: 'collect', target: 'crate3', text: 'Collect crate 3 of 3', radius: 3 },
    ],
  },
  {
    id: 'the-big-score',
    title: 'The Big Score',
    giver: 'The Broker',
    briefing: 'The Solmar National Bank. Grab the cash, deal with the guards, and bring it home. This is the one, Rex.',
    dialogue: 'Get to the bank, grab the cash — hold your ground for 3 seconds — then lose the heat and reach the safehouse.',
    reward: 3000,
    steps: [
      { type: 'goto', target: 'bank', text: 'Get to Solmar National Bank', radius: 6 },
      { type: 'grab', target: 'bank', text: 'Grab the cash (stay in the vault)', radius: 5, hold: 3 },
      { type: 'escape', text: 'Lose the cops', radius: 0 },
      { type: 'drive', target: 'safehouse', text: 'Escape to the safehouse', radius: 6 },
    ],
  },
];

const CRATE_SPOTS = {
  crate1: { x: -126, z: -126 },
  crate2: { x: 126, z: -54 },
  crate3: { x: 54, z: 126 },
};

export class MissionManager {
  constructor(scene, city, hooks) {
    this.scene = scene;
    this.city = city;
    this.hooks = hooks; // { toast, objective, cash, jingle, fail, storyDone, wanted }
    this.index = 0;
    this.stepIndex = 0;
    this.active = false;
    this.stepTimer = 0;
    this.holdTimer = 0;
    this.sideJob = null;
    this.guards = [];
    this.crates = [];
    // Objective beacon: a light pillar, a spinning diamond and a ground ring.
    this.beacon = new THREE.Group();
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(2.4, 2.4, 34, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xf7c948, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
    );
    pillar.position.y = 17;
    this.beacon.add(pillar);
    this.diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.1),
      new THREE.MeshLambertMaterial({ color: 0xf7c948, emissive: 0xb8860b, emissiveIntensity: 0.9 })
    );
    this.diamond.position.y = 5;
    this.beacon.add(this.diamond);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 3, 24),
      new THREE.MeshBasicMaterial({ color: 0xf7c948, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.12;
    this.beacon.add(ring);
    this.beacon.visible = false;
    scene.add(this.beacon);
  }

  reset() {
    this.index = 0;
    this.stepIndex = 0;
    this.active = false;
    this.sideJob = null;
    this.clearGuards();
    this.clearCrates();
    this.beacon.visible = false;
  }

  start() {
    this.active = true;
    this.index = 0;
    this.stepIndex = 0;
    this.beginMission();
  }

  currentMission() {
    return MISSIONS[this.index] || null;
  }

  currentStep() {
    const m = this.currentMission();
    return m ? m.steps[this.stepIndex] : null;
  }

  targetPos(name) {
    if (CRATE_SPOTS[name]) return CRATE_SPOTS[name];
    return this.city[name] || { x: 0, z: 0 };
  }

  markerPos() {
    const step = this.currentStep();
    if (!step || !step.target) return null;
    return this.targetPos(step.target);
  }

  beginMission() {
    const m = this.currentMission();
    if (!m) {
      this.active = false;
      this.hooks.storyDone();
      return;
    }
    this.stepIndex = 0;
    this.stepTimer = 0;
    this.holdTimer = 0;
    this.hooks.toast(`${m.giver}: ${m.briefing}`, 7);
    this.hooks.toast(m.dialogue, 7);
    if (m.id === 'heat-wave') this.hooks.wanted(2);
    if (m.id === 'the-big-score') {
      this.hooks.wanted(0);
      this.spawnGuards();
    }
    if (this.currentStep().type === 'collect') this.spawnCrates();
    this.refreshObjective();
    this.updateBeacon();
  }

  refreshObjective() {
    const m = this.currentMission();
    const s = this.currentStep();
    if (m && s) this.hooks.objective(`${m.title} — ${s.text}`);
    else if (this.sideJob) this.hooks.objective(`Side Job — ${this.sideJob.text}`);
    else this.hooks.objective('Free roam — explore Solmar City');
  }

  updateBeacon() {
    const pos = this.markerPos();
    if (pos && this.active) {
      this.beacon.visible = true;
      this.beacon.position.set(pos.x, 0, pos.z);
    } else if (this.sideJob) {
      this.beacon.visible = true;
      this.beacon.position.set(this.sideJob.target.x, 0, this.sideJob.target.z);
    } else {
      this.beacon.visible = false;
    }
  }

  spawnGuards() {
    this.clearGuards();
    const bank = this.city.bank;
    const spots = [{ x: bank.x - 6, z: bank.z - 4 }, { x: bank.x + 6, z: bank.z + 4 }];
    for (const s of spots) {
      const mesh = new THREE.Group();
      const suit = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.76, 0.36), suit);
      torso.position.y = 1.12;
      torso.castShadow = true;
      mesh.add(torso);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), new THREE.MeshLambertMaterial({ color: 0xe0ac69 }));
      head.position.y = 1.68;
      mesh.add(head);
      const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.72, 0.26), suit);
      legs.position.y = 0.36;
      mesh.add(legs);
      const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.7), new THREE.MeshLambertMaterial({ color: 0x111111 }));
      gun.position.set(0.3, 1.2, 0.4);
      mesh.add(gun);
      mesh.position.set(s.x, 0, s.z);
      mesh.userData.shoot = { kind: 'enemy', ref: null };
      this.scene.add(mesh);
      const guard = { mesh, health: 30, alive: true, shootTimer: 1 + Math.random(), x: s.x, z: s.z };
      mesh.userData.shoot.ref = guard;
      this.guards.push(guard);
    }
  }

  clearGuards() {
    for (const g of this.guards) this.scene.remove(g.mesh);
    this.guards = [];
  }

  spawnCrates() {
    this.clearCrates();
    for (const name of ['crate1', 'crate2', 'crate3']) {
      const p = CRATE_SPOTS[name];
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 1.4, 1.4),
        new THREE.MeshLambertMaterial({ color: 0xe67e22, emissive: 0x7a3c00, emissiveIntensity: 0.5 })
      );
      mesh.position.set(p.x, 0.7, p.z);
      mesh.castShadow = true;
      mesh.userData.crateName = name;
      this.scene.add(mesh);
      this.crates.push({ name, mesh, taken: false });
    }
  }

  clearCrates() {
    for (const c of this.crates) this.scene.remove(c.mesh);
    this.crates = [];
  }

  // A guard was shot: returns true when it dies.
  damageGuard(guard, amount) {
    if (!guard.alive) return false;
    guard.health -= amount;
    if (guard.health <= 0) {
      guard.alive = false;
      guard.mesh.rotation.x = -Math.PI / 2;
      guard.mesh.position.y = 0.3;
      return true;
    }
    return false;
  }

  guardsAlive() {
    return this.guards.filter((g) => g.alive).length;
  }

  completeStep(world) {
    const m = this.currentMission();
    this.stepIndex++;
    this.stepTimer = 0;
    this.holdTimer = 0;
    if (this.stepIndex >= m.steps.length) {
      this.hooks.cash(m.reward);
      this.hooks.jingle();
      this.hooks.toast(`Mission complete: ${m.title} — $${m.reward}`, 5);
      this.clearCrates();
      this.index++;
      if (this.index >= MISSIONS.length) {
        this.active = false;
        this.beacon.visible = false;
        this.hooks.storyDone();
        this.refreshObjective();
        return;
      }
      this.beginMission();
      return;
    }
    const s = this.currentStep();
    if (s.type === 'collect') this.spawnCrates();
    this.refreshObjective();
    this.updateBeacon();
  }

  startSideJob(world) {
    const rng = Math.random;
    const a = this.city.randomRoadPoint(rng);
    let b = this.city.randomRoadPoint(rng);
    while (Math.hypot(b.x - a.x, b.z - a.z) < 80) b = this.city.randomRoadPoint(rng);
    this.sideJob = {
      pickup: a, target: b,
      text: 'Pick up the package, then deliver it',
      stage: 'pickup', timer: 75, reward: 300 + Math.floor(rng() * 4) * 100,
    };
    this.beacon.visible = true;
    this.beacon.position.set(a.x, 0, a.z);
    this.hooks.toast('Side Job: a package needs a courier. Follow the beacon.', 5);
    this.refreshObjective();
  }

  update(dt, world) {
    // Beacon animation.
    if (this.beacon.visible) {
      this.diamond.rotation.y += dt * 2;
      this.diamond.position.y = 5 + Math.sin(performance.now() * 0.002) * 0.5;
    }
    for (const c of this.crates) {
      if (!c.taken) c.mesh.rotation.y += dt * 0.8;
    }
    // Guards shoot at Rex when close.
    for (const g of this.guards) {
      if (!g.alive) continue;
      const dx = world.playerPos.x - g.mesh.position.x;
      const dz = world.playerPos.z - g.mesh.position.z;
      const d = Math.hypot(dx, dz);
      g.mesh.rotation.y = Math.atan2(dx, dz);
      g.shootTimer -= dt;
      if (d < 42 && g.shootTimer <= 0) {
        g.shootTimer = 1.7;
        if (Math.random() < 0.55) world.onGuardShot(g, d);
      }
    }
    // Side job.
    if (this.sideJob) {
      this.sideJob.timer -= dt;
      if (this.sideJob.timer <= 0) {
        this.hooks.toast('Side Job failed — the package went cold.', 4);
        this.hooks.fail();
        this.sideJob = null;
        this.beacon.visible = false;
        this.refreshObjective();
        return;
      }
      const target = this.sideJob.stage === 'pickup' ? this.sideJob.pickup : this.sideJob.target;
      const d = Math.hypot(world.playerPos.x - target.x, world.playerPos.z - target.z);
      if (d <= 5) {
        if (this.sideJob.stage === 'pickup') {
          this.sideJob.stage = 'deliver';
          this.sideJob.text = 'Deliver the package';
          this.beacon.position.set(this.sideJob.target.x, 0, this.sideJob.target.z);
          this.hooks.toast('Package collected. Deliver it!', 4);
          this.refreshObjective();
        } else {
          this.hooks.cash(this.sideJob.reward);
          this.hooks.jingle();
          this.hooks.toast(`Side Job complete — $${this.sideJob.reward}`, 4);
          this.sideJob = null;
          this.beacon.visible = false;
          this.refreshObjective();
        }
      }
      return;
    }
    if (!this.active) return;
    const step = this.currentStep();
    if (!step) return;
    const px = world.playerPos.x;
    const pz = world.playerPos.z;
    if (step.timer) {
      this.stepTimer += dt;
      if (this.stepTimer > step.timer) {
        this.hooks.toast('Too slow — the job fell through.', 4);
        this.hooks.fail();
        this.stepTimer = 0;
        this.beginMissionStepRetry();
        return;
      }
    }
    switch (step.type) {
      case 'steal':
        if (world.driving) this.completeStep(world);
        break;
      case 'goto':
      case 'drive': {
        if (step.type === 'drive' && !world.driving) break;
        const t = this.targetPos(step.target);
        if (Math.hypot(px - t.x, pz - t.z) <= step.radius) this.completeStep(world);
        break;
      }
      case 'collect': {
        const t = this.targetPos(step.target);
        if (Math.hypot(px - t.x, pz - t.z) <= step.radius) {
          const crate = this.crates.find((c) => c.name === step.target);
          if (crate && !crate.taken) {
            crate.taken = true;
            this.scene.remove(crate.mesh);
            this.hooks.toast(`Crate secured (${this.stepIndex + 1} of 3)`, 3);
            this.hooks.pickup();
          }
          this.completeStep(world);
        }
        break;
      }
      case 'grab': {
        const t = this.targetPos(step.target);
        if (Math.hypot(px - t.x, pz - t.z) <= step.radius) {
          this.holdTimer += dt;
          if (this.holdTimer >= (step.hold || 3)) {
            this.hooks.wanted(3);
            this.hooks.toast('Cash grabbed! The alarm is ringing — run!', 4);
            this.completeStep(world);
          }
        } else {
          this.holdTimer = 0;
        }
        break;
      }
      case 'escape':
        if (world.wanted === 0) this.completeStep(world);
        break;
      default:
        break;
    }
  }

  beginMissionStepRetry() {
    // Restart the current mission from its first step.
    this.stepIndex = 0;
    this.stepTimer = 0;
    this.holdTimer = 0;
    this.refreshObjective();
    this.updateBeacon();
  }
}
