// Story missions, the courier side jobs, the waypoint marker, dialogue, and the
// WASTED / BUSTED flow. Five chained missions, each with steps, a cash reward
// and a giver who talks to the player.
import * as THREE from '../vendor/three.module.min.js';
import { S } from './state.js';
import { CITY } from './city.js';
import { clamp, moneyFmt, rand, randInt } from './util.js';
import { Enemy } from './people.js';

const MISSIONS = [
  {
    name: 'Wheels Up',
    giver: 'Mara Solis',
    reward: 500,
    brief: [
      'Mara Solis: "Jack, you\'re new in Solmar. First rule — nobody walks. Steal a car."',
      '"Any parked car will do. Press E next to one. Then bring it to the docks."',
    ],
    steps: [
      { type: 'car', text: 'Steal a car — press E next to a parked car' },
      { type: 'goto', pos: { x: 168, z: -168 }, text: 'Drive to the docks' },
    ],
  },
  {
    name: 'The Courier',
    giver: 'Eddie',
    reward: 800,
    timed: 100,
    brief: [
      'Eddie: "Mara says you can drive. Prove it. Pick up the package at Palm Park."',
      '"Deliver it to Solmar Plaza. You have 100 seconds — the client hates waiting."',
    ],
    steps: [
      { type: 'goto', pos: { x: 140, z: 140 }, text: 'Pick up the package at Palm Park' },
      { type: 'goto', pos: { x: -28, z: -28 }, text: 'Deliver the package to Solmar Plaza' },
    ],
  },
  {
    name: 'Heat on the Strip',
    giver: 'Mara Solis',
    reward: 1200,
    brief: [
      'Mara Solis: "The Broker\'s rivals tipped off the cops. Two stars, and they want you."',
      '"Survive the heat for 30 seconds, then slip to the safehouse on the north-west corner."',
    ],
    steps: [
      { type: 'survive', seconds: 30, text: 'Survive the heat — 30 seconds' },
      { type: 'goto', pos: { x: -196, z: 196 }, text: 'Reach the safehouse' },
    ],
  },
  {
    name: "The Broker's Cut",
    giver: 'The Broker',
    reward: 2000,
    brief: [
      'The Broker: "Three cash drops around the city. My couriers got cold feet."',
      '"Collect all three. My men at the second drop will not be happy to see you."',
    ],
    steps: [
      { type: 'collect', positions: [{ x: -140, z: -112 }, { x: 84, z: 112 }, { x: 168, z: -28 }], text: 'Collect the 3 cash drops' },
    ],
  },
  {
    name: 'Golden Getaway',
    giver: 'Mara Solis',
    reward: 3000,
    brief: [
      'Mara Solis: "Last job. A cherry-red sports car is parked at the beachfront."',
      '"Take it and bring it to the marina. The cops will be all over you — make it count."',
    ],
    steps: [
      { type: 'stealSports', pos: { x: 28, z: 227.5 }, text: 'Steal the sports car at the beachfront' },
      { type: 'goto', pos: { x: 196, z: 224 }, text: 'Drive to the marina' },
    ],
  },
];

export class Missions {
  constructor() {
    this.defs = MISSIONS;
    this.current = null; // { def, stepIndex, timer, collected:Set, drops:[meshes], enemiesSpawned }
    this.nextStartAt = 0;
    this.sideJob = null; // { phase:'pickup'|'deliver', pickup, deliver, reward }
    this.sideCooldown = 0;
    this._buildMarker();
    S.missions = this;
  }

  _buildMarker() {
    const group = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.4, 46, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23d, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.y = 23;
    group.add(beam);
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.6),
      new THREE.MeshBasicMaterial({ color: 0xffd23d }),
    );
    diamond.position.y = 10;
    group.add(diamond);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3.4, 28),
      new THREE.MeshBasicMaterial({ color: 0xffd23d, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.25;
    group.add(ring);
    group.visible = false;
    S.scene.add(group);
    this.marker = group;
    this.markerDiamond = diamond;
  }

  _setMarker(x, z, visible = true) {
    this.marker.position.set(x, 0, z);
    this.marker.visible = visible;
  }

  _hideMarker() {
    this.marker.visible = false;
  }

  startMission(index) {
    const def = this.defs[index];
    if (!def) return;
    this.current = { def, stepIndex: 0, timer: 0, collected: new Set(), drops: [], enemiesSpawned: false, failed: false };
    S.missionIndex = index;
    if (S.hud) {
      S.hud.showDialogue(def.giver, def.brief);
      S.hud.showToast(`Mission ${index + 1}/5: ${def.name} — ${moneyFmt(def.reward)}`);
    }
    if (def.name === 'Heat on the Strip' && S.police) S.police.addWanted(2);
    this._enterStep();
  }

  _enterStep() {
    const c = this.current;
    if (!c) return;
    const step = c.def.steps[c.stepIndex];
    if (!step) {
      this._completeMission();
      return;
    }
    c.timer = step.seconds ?? step.timed ?? 0;
    if (S.hud) S.hud.setObjective(step.text);
    if (step.type === 'goto' || step.type === 'stealSports') {
      this._setMarker(step.pos.x, step.pos.z);
    } else if (step.type === 'collect') {
      // Show glowing cash stacks at each drop and mark the nearest one.
      for (const pos of step.positions) {
        const stack = new THREE.Mesh(
          new THREE.BoxGeometry(1.6, 0.9, 1.2),
          new THREE.MeshLambertMaterial({ color: 0x2a9a4a, emissive: 0x0a4418 }),
        );
        stack.position.set(pos.x, 0.6, pos.z);
        S.scene.add(stack);
        c.drops.push({ pos, mesh: stack });
      }
      this._updateCollectMarker();
    } else if (step.type === 'car' || step.type === 'survive') {
      this._hideMarker();
    }
  }

  _updateCollectMarker() {
    const c = this.current;
    if (!c) return;
    const step = c.def.steps[c.stepIndex];
    let best = null;
    let bestD = Infinity;
    step.positions.forEach((pos, i) => {
      if (c.collected.has(i)) return;
      const d = Math.hypot(pos.x - S.player.pos.x, pos.z - S.player.pos.z);
      if (d < bestD) {
        bestD = d;
        best = pos;
      }
    });
    if (best) this._setMarker(best.x, best.z);
    else this._hideMarker();
  }

  _advanceStep() {
    const c = this.current;
    if (!c) return;
    c.stepIndex++;
    if (S.sounds) S.sounds.pickup();
    this._enterStep();
  }

  _completeMission() {
    const c = this.current;
    if (!c) return;
    const def = c.def;
    S.money += def.reward;
    S.completedMissions.push(def.name);
    S.missionIndex = S.completedMissions.length;
    if (S.hud) {
      S.hud.showToast(`Mission complete: ${def.name}  +${moneyFmt(def.reward)}`);
      S.hud.setObjective('');
    }
    if (S.sounds) S.sounds.missionDone();
    for (const d of c.drops) S.scene.remove(d.mesh);
    this.current = null;
    this._hideMarker();
    if (S.completedMissions.length >= this.defs.length) {
      if (S.hud) S.hud.showDialogue('Mara Solis', ['"That\'s all five. Solmar is yours now, Jack. Spend it well."']);
      return;
    }
    this.nextStartAt = S.time + 4;
  }

  _failMission(reason) {
    const c = this.current;
    if (!c) return;
    if (S.hud) S.hud.showToast(`${reason} — mission failed, try again`);
    for (const d of c.drops) S.scene.remove(d.mesh);
    const index = this.defs.indexOf(c.def);
    this.current = null;
    this._hideMarker();
    this.nextStartAt = S.time + 2;
    S.missionIndex = index;
    // Retry the same mission shortly.
    this._retryIndex = index;
  }

  update(dt) {
    // Auto-start the next mission a few seconds after the previous one.
    if (!this.current && this.nextStartAt > 0 && S.time >= this.nextStartAt && S.mode === 'playing') {
      this.nextStartAt = 0;
      const idx = this._retryIndex ?? S.completedMissions.length;
      this._retryIndex = undefined;
      this.startMission(idx);
    }
    // Courier side jobs between missions.
    if (!this.current && this.nextStartAt === 0 && S.completedMissions.length >= 1 && S.mode === 'playing') {
      this._updateCourier(dt);
    }
    if (!this.current || S.mode !== 'playing') return;
    const c = this.current;
    const step = c.def.steps[c.stepIndex];
    if (!step) return;
    const p = S.player;
    const distTo = (pos) => Math.hypot(pos.x - p.pos.x, pos.z - p.pos.z);

    if (step.type === 'car') {
      if (p.driving) this._advanceStep();
    } else if (step.type === 'goto') {
      if (distTo(step.pos) < 6) this._advanceStep();
      else if (S.hud) S.hud.setObjective(`${step.text} — ${Math.round(distTo(step.pos))}m`);
    } else if (step.type === 'survive') {
      c.timer -= dt;
      if (S.hud) S.hud.setObjective(`${step.text} — ${Math.max(0, Math.ceil(c.timer))}s`);
      if (c.timer <= 0) this._advanceStep();
    } else if (step.type === 'collect') {
      // Spawn the gunmen once the player nears the second drop.
      if (!c.enemiesSpawned && distTo(step.positions[1]) < 30) {
        c.enemiesSpawned = true;
        new Enemy(step.positions[1].x + 4, step.positions[1].z + 4);
        new Enemy(step.positions[1].x - 4, step.positions[1].z - 4);
        if (S.hud) S.hud.showToast('Ambush! The Broker\'s rivals are here.');
      }
      step.positions.forEach((pos, i) => {
        if (c.collected.has(i)) return;
        if (distTo(pos) < 4) {
          c.collected.add(i);
          const drop = c.drops[i];
          if (drop) {
            S.scene.remove(drop.mesh);
            drop.mesh = null;
          }
          if (S.sounds) S.sounds.pickup();
          if (S.hud) S.hud.showToast(`Cash drop ${c.collected.size}/3 collected`);
          this._updateCollectMarker();
        }
      });
      if (c.collected.size === step.positions.length) this._advanceStep();
    } else if (step.type === 'stealSports') {
      if (p.driving && p.car && p.car.type === 'sports') {
        if (S.police) S.police.addWanted(3);
        this._advanceStep();
      }
    }
    // Timed missions (The Courier): running out of time fails the mission.
    if (c.def.timed) {
      c.timer = (c.timer || c.def.timed) - dt;
      if (S.hud) S.hud.setObjective(`${step.text} — ${Math.max(0, Math.ceil(c.timer))}s left`);
      if (c.timer <= 0) this._failMission('Out of time');
    }
    // Marker animation.
    if (this.marker.visible) {
      this.markerDiamond.rotation.y += dt * 2.4;
      this.markerDiamond.position.y = 10 + Math.sin(S.time * 2.2) * 0.8;
    }
  }

  _updateCourier(dt) {
    if (this.sideJob) {
      const p = S.player;
      const target = this.sideJob.phase === 'pickup' ? this.sideJob.pickup : this.sideJob.deliver;
      const d = Math.hypot(target.x - p.pos.x, target.z - p.pos.z);
      if (S.hud) S.hud.setObjective(this.sideJob.phase === 'pickup' ? `Courier: pick up the parcel — ${Math.round(d)}m` : `Courier: deliver the parcel — ${Math.round(d)}m`);
      if (d < 6) {
        if (this.sideJob.phase === 'pickup') {
          this.sideJob.phase = 'deliver';
          this._setMarker(this.sideJob.deliver.x, this.sideJob.deliver.z);
          if (S.sounds) S.sounds.pickup();
          if (S.hud) S.hud.showToast('Parcel picked up — deliver it!');
        } else {
          S.money += this.sideJob.reward;
          if (S.hud) {
            S.hud.showToast(`Courier done  +${moneyFmt(this.sideJob.reward)}`);
            S.hud.setObjective('');
          }
          if (S.sounds) S.sounds.missionDone();
          this.sideJob = null;
          this.sideCooldown = 25;
          this._hideMarker();
        }
      }
      return;
    }
    this.sideCooldown -= dt;
    if (this.sideCooldown > 0) return;
    // Offer a new courier job at two random road intersections.
    const rnd = () => {
      const line = CITY.LINES[Math.floor(Math.random() * CITY.LINES.length)];
      const other = CITY.LINES[Math.floor(Math.random() * CITY.LINES.length)];
      return { x: line, z: other };
    };
    const pickup = rnd();
    let deliver = rnd();
    while (Math.hypot(deliver.x - pickup.x, deliver.z - pickup.z) < 120) deliver = rnd();
    this.sideJob = { phase: 'pickup', pickup, deliver, reward: randInt(Math.random, 150, 300) };
    this._setMarker(pickup.x, pickup.z);
    if (S.hud) S.hud.showToast(`Courier job available — ${moneyFmt(this.sideJob.reward)}`);
  }

  /** Player died: lose some cash, respawn at the plaza, restart the mission. */
  onWasted() {
    if (S.mode !== 'playing') return;
    S.mode = 'wasted';
    S.money = Math.max(0, S.money - 200);
    if (S.sounds) S.sounds.busted();
    if (S.hud) S.hud.showOverlay('wasted');
  }

  /** Player arrested: bail money, respawn, restart the mission. */
  onBusted() {
    if (S.mode !== 'playing') return;
    S.mode = 'busted';
    S.money = Math.max(0, S.money - 300);
    if (S.police) S.police.clearWanted();
    if (S.sounds) S.sounds.busted();
    if (S.hud) S.hud.showOverlay('busted');
  }

  /** Respawn after WASTED / BUSTED: plaza, full health, mission restarts. */
  respawn() {
    const p = S.player;
    if (p.driving) p.exitCar();
    p.pos.x = -28;
    p.pos.z = -60;
    p.pos.y = 0;
    p.vy = 0;
    S.health = 100;
    S.mode = 'playing';
    if (S.hud) S.hud.showOverlay(null);
    // Restart the current mission from its first step.
    if (this.current) {
      const index = this.defs.indexOf(this.current.def);
      for (const d of this.current.drops) S.scene.remove(d.mesh);
      this.current = null;
      this._hideMarker();
      this._retryIndex = index;
      this.nextStartAt = S.time + 1.5;
    }
  }
}
