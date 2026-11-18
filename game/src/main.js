// Solmar City — main: renderer, third-person camera, input, game states
// (menu / playing / paused / wasted / busted), car enter/exit, combat
// wiring, save/load, the game loop, and screenshot staging (?shot=cover,
// foot, chase, mission) so the maker can capture real gameplay.
import * as THREE from 'three';
import { buildCity, CITY } from './city.js';
import { SoundEngine } from './audio.js';
import { TrafficManager, DriveCar, DustPool, SkidMarks, makeCarMesh } from './vehicles.js';
import { PedestrianManager } from './people.js';
import { Player } from './player.js';
import { PoliceSystem } from './police.js';
import { MissionManager } from './missions.js';
import { HUD } from './hud.js';
import { clamp, dampAngle } from './util.js';

const SAVE_KEY = 'solmar-save-v1';

export class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
    this.camera.position.set(40, 25, 60);

    this.city = buildCity(this.scene);
    this.audio = new SoundEngine();
    this.hud = new HUD();
    this.dust = new DustPool(this.scene);
    this.skids = new SkidMarks(this.scene);
    this.traffic = new TrafficManager(this.scene, this.city);
    this.peds = new PedestrianManager(this.scene, this.city);
    this.player = new Player(this.scene, this.city, 18, 30);
    this.police = new PoliceSystem(this.scene, this.city);
    this.missions = new MissionManager(this.scene, this.city, {
      toast: (t, s) => this.hud.toast(t, s),
      objective: (t) => this.hud.setObjective(t),
      cash: (n) => { this.cash += n; this.saveGame(); },
      jingle: () => this.audio.playJingle(),
      fail: () => this.audio.playFail(),
      pickup: () => this.audio.playPickup(),
      storyDone: () => this.onStoryDone(),
      wanted: (n) => this.police.setWanted(Math.max(this.police.wanted, n)),
    });

    // Mark everything shootable so the pistol raycast can find it.
    for (const ped of this.peds.peds) ped.mesh.userData.shoot = { kind: 'ped', ref: ped };
    for (const car of this.traffic.cars) car.mesh.userData.shoot = { kind: 'car', ref: car };
    for (const car of this.traffic.parked) car.mesh.userData.shoot = { kind: 'car', ref: car };

    this.state = 'menu'; // menu | playing | paused | wasted | busted
    this.cash = 250;
    this.timeMin = 990; // 16:30, golden hour
    this.driving = null; // DriveCar when Rex is behind the wheel
    this.headlightsOn = true;
    this.headlightSpots = [];
    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.camDist = 9;
    this.lastDragAt = 0;
    this.menuAngle = 0;
    this.elapsed = 0;
    this.frames = 0;
    this.autoDrive = false;
    this.readyFlag = false;
    this.shake = 0;
    this.saveData = this.loadSave();

    this.keys = {};
    this.mouse = { down: false, x: 0, y: 0, moved: 0 };
    this.bindInput();
    this.bindMenus();
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.tick());
    window.addEventListener('resize', () => this.onResize());
    this.onResize();
  }

  // --- Persistence -------------------------------------------------------
  loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: this.cash,
        missionIndex: this.missions.index,
        stepIndex: this.missions.stepIndex,
        playerX: this.player.pos.x,
        playerZ: this.player.pos.z,
        health: this.player.health,
        timeMin: this.timeMin,
      }));
    } catch (err) { /* storage unavailable: the game still plays */ }
  }

  // --- Input ---------------------------------------------------------------
  bindInput() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys[e.code] = true;
      if (this.state === 'paused' && (e.code === 'KeyP' || e.code === 'Escape')) {
        document.getElementById('pause').classList.add('hidden');
        this.state = 'playing';
        return;
      }
      if (this.state !== 'playing') return;
      if (e.code === 'KeyE') this.toggleCar();
      if (e.code === 'KeyF') this.punch();
      if (e.code === 'KeyR') this.player.startReload();
      if (e.code === 'Digit1') this.player.weapon = 'fists';
      if (e.code === 'Digit2') this.player.weapon = 'pistol';
      if (e.code === 'KeyM') {
        const muted = this.audio.toggleMute();
        this.hud.toast(muted ? 'Sound muted (M to unmute)' : 'Sound on', 2);
      }
      if (e.code === 'KeyL') this.toggleHeadlights();
      if (e.code === 'KeyH' && this.driving) this.audio.playHorn();
      if (e.code === 'KeyP' || e.code === 'Escape') this.pauseGame();
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    this.canvas.addEventListener('mousedown', (e) => {
      this.mouse.down = true;
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.moved = 0;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.mouse.down) return;
      const dx = e.movementX || 0;
      const dy = e.movementY || 0;
      this.mouse.moved += Math.abs(dx) + Math.abs(dy);
      this.camYaw -= dx * 0.005;
      this.camPitch = clamp(this.camPitch + dy * 0.004, -0.05, 1.15);
      this.lastDragAt = this.elapsed;
    });
    window.addEventListener('mouseup', (e) => {
      if (!this.mouse.down) return;
      this.mouse.down = false;
      if (this.state === 'playing' && !this.driving && this.mouse.moved < 6) this.shoot();
    });
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.camDist = clamp(this.camDist + Math.sign(e.deltaY) * 1.2, 5, 16);
    }, { passive: false });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  bindMenus() {
    const show = (id, on) => document.getElementById(id).classList.toggle('hidden', !on);
    document.getElementById('btn-start').addEventListener('click', () => {
      this.audio.init();
      this.audio.playClick();
      this.startGame(false);
      show('menu', false);
    });
    const contBtn = document.getElementById('btn-continue');
    if (this.saveData) {
      contBtn.classList.remove('hidden');
      contBtn.addEventListener('click', () => {
        this.audio.init();
        this.audio.playClick();
        this.startGame(true);
        show('menu', false);
      });
    }
    document.getElementById('btn-resume').addEventListener('click', () => {
      this.audio.playClick();
      this.state = 'playing';
      show('pause', false);
    });
    document.getElementById('btn-save-quit').addEventListener('click', () => {
      this.audio.playClick();
      this.saveGame();
      this.state = 'menu';
      show('pause', false);
      show('menu', true);
    });
    document.getElementById('btn-restart').addEventListener('click', () => {
      this.audio.playClick();
      this.newGame();
      show('pause', false);
    });
    document.getElementById('btn-respawn').addEventListener('click', () => {
      this.audio.playClick();
      this.respawn();
      show('end', false);
    });
    document.getElementById('btn-sidejob').addEventListener('click', () => {
      this.audio.playClick();
      this.missions.startSideJob(this.worldView());
      show('pause', false);
      this.state = 'playing';
    });
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // --- Game flow -----------------------------------------------------------
  newGame() {
    this.cash = 250;
    this.timeMin = 990;
    this.police.clearWanted();
    this.missions.reset();
    this.exitCar(true);
    this.player.reset(18, 30, 100);
    this.missions.start();
    this.state = 'playing';
    this.audio.startMusic();
    this.hud.showBanner('SOLMAR CITY', 'Chapter 1 — Wheels Up', 4);
  }

  startGame(fromSave) {
    if (fromSave && this.saveData) {
      const s = this.saveData;
      this.cash = s.cash || 250;
      this.timeMin = s.timeMin || 990;
      this.player.reset(s.playerX ?? 18, s.playerZ ?? 30, s.health ?? 100);
      this.missions.reset();
      this.missions.index = Math.min(s.missionIndex || 0, 4);
      this.missions.active = true;
      this.missions.beginMission();
      this.missions.stepIndex = Math.min(s.stepIndex || 0, this.missions.currentMission().steps.length - 1);
      this.missions.refreshObjective();
      this.missions.updateBeacon();
    } else {
      this.newGame();
      return;
    }
    this.state = 'playing';
    this.audio.startMusic();
  }

  pauseGame() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.saveGame();
    document.getElementById('pause').classList.remove('hidden');
  }

  onStoryDone() {
    this.hud.showBanner('STORY COMPLETE', 'The Big Score is yours. Solmar is yours — free roam, side jobs, and the streets are open.', 6);
    this.hud.toast('Story complete! Press P for side jobs.', 6);
    this.saveGame();
  }

  respawn() {
    const lost = Math.floor(this.cash * 0.2);
    this.cash -= lost;
    this.exitCar(true);
    this.player.reset(18, 30, 100);
    this.police.clearWanted();
    this.state = 'playing';
    this.hud.toast(`You lost $${lost}. Back on your feet at the plaza.`, 4);
    this.saveGame();
  }

  endGame(kind) {
    this.state = kind; // 'wasted' or 'busted'
    this.audio.playFail();
    this.audio.stopEngine();
    const title = kind === 'wasted' ? 'WASTED' : 'BUSTED';
    document.getElementById('end-title').textContent = title;
    document.getElementById('end-sub').textContent = kind === 'wasted'
      ? 'Rex is down. The city keeps moving without you.'
      : 'The Solmar PD caught up with you. The city keeps moving without you.';
    document.getElementById('end').classList.remove('hidden');
  }

  // --- Cars ------------------------------------------------------------------
  toggleCar() {
    if (this.driving) {
      this.exitCar(false);
      return;
    }
    const near = this.traffic.nearestCar(this.player.pos.x, this.player.pos.z, 4.2);
    if (!near) {
      this.hud.setHint('No car close enough — walk up to one and press E');
      setTimeout(() => this.hud.setHint(''), 2000);
      return;
    }
    let mesh, pos, heading, maxSpeed;
    if (near.kind === 'traffic') {
      const car = near.ref;
      mesh = car.mesh;
      pos = car.pos;
      heading = car.heading;
      maxSpeed = 32;
      // The driver bails and the theft is noticed.
      this.traffic.cars.splice(this.traffic.cars.indexOf(car), 1);
      this.police.addWanted(1, 'car theft');
      this.hud.toast('Car stolen! The owner is calling the cops.', 3);
    } else {
      const car = near.ref;
      mesh = car.mesh;
      pos = car.pos;
      heading = car.heading;
      maxSpeed = 30;
      car.taken = true;
      this.police.addWanted(1, 'car theft');
      this.hud.toast('Car stolen! The owner is calling the cops.', 3);
    }
    this.driving = new DriveCar(mesh, pos.x, pos.z, heading);
    this.driving.maxSpeed = maxSpeed;
    this.driving.isPlayer = true;
    this.player.mesh.visible = false;
    this.audio.startEngine();
    this.attachHeadlights(mesh);
    this.hud.setHint('W/S drive • A/D steer • Space handbrake • E get out • H horn • L lights');
    setTimeout(() => this.hud.setHint(''), 4000);
  }

  exitCar(silent) {
    if (!this.driving) return;
    const car = this.driving;
    this.detachHeadlights();
    this.audio.stopEngine();
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    const px = car.pos.x - fz * 2.4;
    const pz = car.pos.z + fx * 2.4;
    this.player.reset(px, pz, this.player.health);
    this.player.mesh.visible = true;
    // Leave the car parked where it stopped.
    this.traffic.parked.push({ mesh: car.mesh, pos: car.pos.clone(), heading: car.heading, taken: false });
    car.mesh.userData.shoot = { kind: 'car', ref: car };
    this.driving = null;
    if (!silent) this.hud.setHint('On foot — WASD move • Shift run • Space jump • Click shoot • F punch • E steal car');
  }

  attachHeadlights(mesh) {
    this.detachHeadlights();
    for (const sx of [-0.6, 0.6]) {
      const spot = new THREE.SpotLight(0xfff2c0, this.headlightsOn ? 60 : 0, 34, 0.5, 0.45, 1.4);
      spot.position.set(sx, 0.7, 2.1);
      const target = new THREE.Object3D();
      target.position.set(sx * 1.4, 0, 16);
      mesh.add(target);
      spot.target = target;
      mesh.add(spot);
      this.headlightSpots.push(spot);
    }
    // A soft glow cone on the road ahead, faked with a translucent plane.
    const coneGeo = new THREE.PlaneGeometry(4, 8);
    const coneMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.rotation.x = -Math.PI / 2;
    cone.position.set(0, 0.12, 6);
    mesh.add(cone);
    this.headlightSpots.push(cone);
  }

  detachHeadlights() {
    for (const s of this.headlightSpots) {
      if (s.parent) s.parent.remove(s);
      if (s.isSpotLight) s.dispose();
    }
    this.headlightSpots = [];
  }

  toggleHeadlights() {
    this.headlightsOn = !this.headlightsOn;
    for (const s of this.headlightSpots) {
      if (s.isSpotLight) s.intensity = this.headlightsOn ? 60 : 0;
      else s.material.opacity = this.headlightsOn ? 0.05 : 0;
    }
    this.hud.toast(this.headlightsOn ? 'Headlights on' : 'Headlights off', 1.5);
  }

  // --- Combat ------------------------------------------------------------------
  shootables() {
    const list = [];
    for (const ped of this.peds.peds) {
      if (ped.state !== 'down') list.push(ped.mesh);
    }
    for (const g of this.missions.guards) {
      if (g.alive) list.push(g.mesh);
    }
    for (const car of this.traffic.cars) list.push(car.mesh);
    for (const car of this.traffic.parked) {
      if (!car.taken) list.push(car.mesh);
    }
    for (const c of this.police.cruisers) list.push(c.mesh);
    return list;
  }

  shoot() {
    if (this.player.weapon !== 'pistol') return;
    const result = this.player.fire(this.camera, this.shootables());
    if (!result.fired) return;
    this.audio.playShot();
    this.peds.scare(this.player.pos.x, this.player.pos.z, 26);
    if (!result.hit) return;
    const hit = result.hit;
    if (hit.kind === 'ped') {
      this.peds.knockDown(hit.ref);
      this.police.addWanted(1, 'assault');
      this.hud.toast('You hit a pedestrian! The cops are coming.', 3);
    } else if (hit.kind === 'enemy') {
      const died = this.missions.damageGuard(hit.ref, 25);
      if (died) {
        this.hud.toast('Guard down!', 2);
        this.audio.playPickup();
      }
    } else if (hit.kind === 'car') {
      this.dust.spawn(hit.point.x, hit.point.y, hit.point.z, true);
      this.police.addWanted(1, 'shooting');
    } else if (hit.kind === 'police') {
      const cruiser = hit.ref;
      cruiser.health -= 30;
      this.dust.spawn(hit.point.x, hit.point.y, hit.point.z, true);
      if (cruiser.health <= 0) {
        for (let i = 0; i < 6; i++) this.dust.spawn(cruiser.pos.x, 1, cruiser.pos.z, true);
        this.scene.remove(cruiser.mesh);
        this.police.cruisers.splice(this.police.cruisers.indexOf(cruiser), 1);
        this.police.addWanted(1, 'destroyed a cruiser');
        this.audio.playCrash(1);
        this.hud.toast('Cruiser destroyed!', 3);
      }
    }
  }

  punch() {
    if (this.driving || this.player.weapon !== 'fists') return;
    const hit = this.player.punch(this.shootables());
    this.audio.playPunch();
    if (hit && hit.kind === 'ped') {
      this.peds.knockDown(hit.ref);
      this.police.addWanted(1, 'assault');
      this.hud.toast('You knocked someone out!', 2);
    } else if (hit && hit.kind === 'enemy') {
      if (this.missions.damageGuard(hit.ref, 25)) this.hud.toast('Guard down!', 2);
    }
  }

  // --- World view for the mission system -----------------------------------------
  worldView() {
    return {
      playerPos: this.driving ? this.driving.pos : this.player.pos,
      driving: !!this.driving,
      wanted: this.police.wanted,
      onGuardShot: (guard) => this.onGuardShot(guard),
    };
  }

  onGuardShot(guard) {
    if (this.state !== 'playing') return;
    const dist = Math.hypot(this.player.pos.x - guard.mesh.position.x, this.player.pos.z - guard.mesh.position.z);
    if (dist > 46) return;
    this.player.health -= 6;
    this.hud.flashDamage();
    this.audio.playShot();
    if (this.player.health <= 0) this.endGame('wasted');
  }

  // --- Screenshot staging ---------------------------------------------------------
  applyShot(shot) {
    this.audio.init();
    this.startGame(false);
    document.getElementById('menu').classList.add('hidden');
    this.autoDrive = true;
    // Park the police cruisers where the chase camera can see them: in a
    // flanking formation ahead and beside the player, not behind the camera.
    const cruisersBehind = (n, flank) => {
      for (let i = 0; i < n; i++) this.police._spawnCruiser(this.driving.pos);
      const fx = Math.sin(this.driving.heading);
      const fz = Math.cos(this.driving.heading);
      const bx = -fx;
      const bz = -fz;
      this.police.cruisers.forEach((c, i) => {
        let ax, az;
        if (flank) {
          // Beside the player, in the next lane: the chase camera sees them
          // for the whole shot instead of watching them U-turn away.
          const ahead = [3, 8, 0, 12][i % 4];
          const side = [-4, 4, -4, 4][i % 4];
          ax = this.driving.pos.x + fx * ahead - fz * side;
          az = this.driving.pos.z + fz * ahead + fx * side;
        } else {
          // Right behind the player: the chase camera sees the cruisers
          // between itself and the player's car.
          ax = this.driving.pos.x + bx * (8 + i * 3.5) + (i % 2 ? 3 : -3);
          az = this.driving.pos.z + bz * (8 + i * 3.5);
        }
        c.pos.set(ax, 0, az);
        c.heading = this.driving.heading;
        c.speed = flank ? 26 : 24;
      });
    };
    if (shot === 'cover') {
      // Golden-hour chase: Rex driving down the main avenue, two stars,
      // cruisers behind, the pier beacon ahead. Camera behind the car
      // (car heading PI, so the chase yaw is 0).
      this.camDist = 9.5;
      this.toggleCarAt(0, 60, Math.PI);
      this.driving.maxSpeed = 22;
      this.driving.speed = 18;
      this.police.setWanted(2);
      cruisersBehind(2, false);
      this.camYaw = 0;
    } else if (shot === 'foot') {
      this.autoDrive = false;
      this.camDist = 8;
      // Rex on foot near Hotel Miramar, the Courier beacon ahead of him.
      this.player.reset(66, -64, 100);
      this.missions.index = 1;
      this.missions.active = true;
      this.missions.beginMission();
      this.camYaw = Math.PI * 1.45;
    } else if (shot === 'chase') {
      this.camDist = 9.5;
      this.toggleCarAt(36, 20, Math.PI);
      this.driving.maxSpeed = 24;
      this.driving.speed = 22;
      this.police.setWanted(4);
      cruisersBehind(4, false);
      this.camYaw = 0;
    } else if (shot === 'mission') {
      this.camDist = 9;
      this.toggleCarAt(36, -36, Math.PI / 2);
      this.missions.index = 4;
      this.missions.active = true;
      this.missions.beginMission();
      this.police.setWanted(1);
      cruisersBehind(1);
      this.camYaw = -Math.PI / 2;
    }
    this.state = 'playing';
  }

  // Put Rex straight into a fresh car at a spot (used by screenshot staging).
  toggleCarAt(x, z, heading) {
    const mesh = makeCarMesh(0xc0392b, 'sport');
    this.scene.add(mesh);
    this.driving = new DriveCar(mesh, x, z, heading);
    this.driving.isPlayer = true;
    this.driving.maxSpeed = 38;
    this.player.mesh.visible = false;
    this.audio.startEngine();
    this.attachHeadlights(mesh);
  }

  // --- The loop --------------------------------------------------------------------
  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += dt;
    this.frames++;
    this.timeMin += dt * 0.5;
    if (this.state === 'menu') {
      // Slow cinematic orbit over the plaza behind the title screen.
      this.menuAngle += dt * 0.05;
      this.camera.position.set(18 + Math.cos(this.menuAngle) * 46, 20, 18 + Math.sin(this.menuAngle) * 46);
      this.camera.lookAt(18, 2, 18);
      this.city.update(dt, this.elapsed);
      this.traffic.update(dt, null);
      this.renderer.render(this.scene, this.camera);
      return;
    }
    if (this.state !== 'playing') {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    const input = {
      up: this.keys.KeyW || this.keys.ArrowUp,
      down: this.keys.KeyS || this.keys.ArrowDown,
      left: this.keys.KeyA || this.keys.ArrowLeft,
      right: this.keys.KeyD || this.keys.ArrowRight,
      run: this.keys.ShiftLeft || this.keys.ShiftRight,
      jump: this.keys.Space,
    };
    // --- Update the world ---
    this.city.update(dt, this.elapsed);
    this.traffic.update(dt, this.driving);
    this.dust.update(dt);
    const playerCarPos = this.driving ? this.driving.pos : null;
    const playerSpeed = this.driving ? Math.abs(this.driving.speed) : this.player.speed;
    this.peds.update(dt, playerCarPos || this.player.pos, playerSpeed);
    if (this.driving) {
      const driveInput = {
        forward: input.up || this.autoDrive,
        back: input.down,
        left: input.left,
        right: input.right,
      };
      const before = this.driving.speed;
      this.driving.update(dt, driveInput, this.city, this.traffic, this.dust, this.skids, (impact) => {
        this.audio.playCrash(Math.min(1, impact / 24));
        this.shake = Math.min(0.5, impact * 0.02);
      });
      // Running over pedestrians while driving.
      const hit = this.peds.checkCarHit(this.driving.pos.x, this.driving.pos.z, 2.2);
      if (hit) {
        this.peds.knockDown(hit);
        this.police.addWanted(1, 'hit a pedestrian');
        this.audio.playCrash(0.4);
        this.hud.toast('You hit a pedestrian!', 3);
      }
      this.audio.setEngine(Math.abs(this.driving.speed) / this.driving.maxSpeed, true);
      if (this.driving.health <= 0) {
        for (let i = 0; i < 8; i++) this.dust.spawn(this.driving.pos.x, 1, this.driving.pos.z, true);
        this.audio.playCrash(1);
        this.hud.toast('Your car is wrecked!', 3);
        this.exitCar(true);
        this.player.health = Math.max(20, this.player.health - 25);
      }
      // Space is the handbrake while driving.
      if (input.jump) this.driving.speed *= Math.max(0, 1 - dt * 3);
    } else {
      this.player.update(dt, input, this.camYaw);
      this.audio.setEngine(0, false);
    }
    // Police.
    const policeResult = this.police.update(dt, this.player, this.driving, this.audio);
    if (policeResult.busted) {
      this.endGame('busted');
      this.renderer.render(this.scene, this.camera);
      return;
    }
    if (this.player.health <= 0 && !this.driving) {
      this.endGame('wasted');
      this.renderer.render(this.scene, this.camera);
      return;
    }
    // Missions.
    this.missions.update(dt, this.worldView());
    // --- Camera ---
    const target = this.driving ? this.driving.pos : this.player.pos;
    if (this.driving && this.elapsed - this.lastDragAt > 2.5) {
      // Ease the chase camera behind the car when the player is not steering it.
      this.camYaw = dampAngle(this.camYaw, this.driving.heading + Math.PI, 1.2, dt);
    }
    const camTarget = new THREE.Vector3(target.x, target.y + (this.driving ? 1.8 : 1.6), target.z);
    const dist = this.driving ? this.camDist + 3 : this.camDist;
    const cx = camTarget.x + Math.sin(this.camYaw) * Math.cos(this.camPitch) * dist;
    const cz = camTarget.z + Math.cos(this.camYaw) * Math.cos(this.camPitch) * dist;
    const cy = camTarget.y + Math.sin(this.camPitch) * dist;
    const desired = new THREE.Vector3(cx, Math.max(cy, 1.2), cz);
    this.camera.position.lerp(desired, 1 - Math.exp(-8 * dt));
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
    }
    this.camera.lookAt(camTarget);
    // --- HUD ---
    this.hud.update({
      wanted: this.police.wanted,
      cash: this.cash,
      timeMin: this.timeMin,
      health: this.player.health,
      weapon: this.player.weapon,
      ammo: this.player.ammo,
      reloading: this.player.reloading,
      speed: this.driving ? this.driving.speed : 0,
      driving: !!this.driving,
      playing: this.state === 'playing',
      playerX: target.x,
      playerZ: target.z,
      playerHeading: this.driving ? this.driving.heading : this.player.heading,
      marker: this.missions.markerPos() || (this.missions.sideJob ? this.missions.sideJob.target : null),
      traffic: this.traffic.cars.map((c) => ({ pos: c.pos })),
      police: this.police.cruisers.map((c) => ({ pos: c.pos })),
    });
    this.renderer.render(this.scene, this.camera);
    if (!this.readyFlag && (this.elapsed > 2 || this.frames > 90)) {
      this.readyFlag = true;
      window.__solmarReady = true;
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  try {
    const game = new Game();
    window.__solmar = game;
    const params = new URLSearchParams(window.location.search);
    const shot = params.get('shot');
    if (shot) game.applyShot(shot);
  } catch (err) {
    const fallback = document.getElementById('fallback');
    if (fallback) {
      fallback.classList.remove('hidden');
      fallback.textContent = 'Could not start Solmar City: ' + err.message;
    }
    console.error(err);
  }
});
