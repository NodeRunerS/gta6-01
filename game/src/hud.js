// The HUD: DOM readouts (money, health, ammo, stars, speed, clock, objective),
// a live top-down minimap on a 2D canvas, toasts, mission dialogue, the damage
// flash, and the start / pause / WASTED / BUSTED screens.
import { S } from './state.js';
import { CITY } from './city.js';
import { clockFmt, moneyFmt } from './util.js';

export class HUD {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      hud: $('hud'),
      minimap: $('minimap'),
      money: $('money'),
      healthFill: $('health-fill'),
      healthText: $('health-text'),
      ammo: $('ammo'),
      stars: $('stars'),
      speed: $('speed'),
      clock: $('clock'),
      objective: $('objective'),
      missionLabel: $('mission-label'),
      toast: $('toast'),
      dialogue: $('dialogue'),
      dialogueSpeaker: $('dialogue-speaker'),
      dialogueText: $('dialogue-text'),
      flash: $('damage-flash'),
      start: $('screen-start'),
      pause: $('screen-pause'),
      wasted: $('screen-wasted'),
      busted: $('screen-busted'),
    };
    this.mapCtx = this.el.minimap.getContext('2d');
    this.toastTimer = 0;
    this.dialogueTimer = 0;
    this.onNewGame = null;
    this.onContinue = null;
    this.onResume = null;
    this.onRespawn = null;
    this._wireButtons();
  }

  _wireButtons() {
    const bind = (id, fn) => {
      const b = document.getElementById(id);
      if (b) b.addEventListener('click', () => fn && fn());
    };
    bind('btn-new', () => this.onNewGame && this.onNewGame());
    bind('btn-continue', () => this.onContinue && this.onContinue());
    bind('btn-resume', () => this.onResume && this.onResume());
    bind('btn-respawn-wasted', () => this.onRespawn && this.onRespawn());
    bind('btn-respawn-busted', () => this.onRespawn && this.onRespawn());
    this.el.dialogue.addEventListener('click', () => this._hideDialogue());
  }

  showToast(text, ms = 3500) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('show');
    this.toastTimer = ms / 1000;
  }

  showDialogue(speaker, lines) {
    this.el.dialogueSpeaker.textContent = speaker;
    this.el.dialogueText.textContent = lines.join(' ');
    this.el.dialogue.classList.add('show');
    this.dialogueTimer = 8;
  }

  _hideDialogue() {
    this.el.dialogue.classList.remove('show');
    this.dialogueTimer = 0;
  }

  setObjective(text) {
    this.el.objective.textContent = text;
  }

  flashDamage() {
    this.el.flash.classList.remove('flash');
    void this.el.flash.offsetWidth; // restart the animation
    this.el.flash.classList.add('flash');
  }

  /** Show one overlay screen, or null to hide them all. */
  showOverlay(name) {
    for (const key of ['start', 'pause', 'wasted', 'busted']) {
      this.el[key].classList.toggle('show', key === name);
    }
    this.el.hud.classList.toggle('hidden', name === 'start');
  }

  update(dt) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.classList.remove('show');
    }
    if (this.dialogueTimer > 0) {
      this.dialogueTimer -= dt;
      if (this.dialogueTimer <= 0) this._hideDialogue();
    }
    if (S.mode !== 'playing') return;
    this.el.money.textContent = moneyFmt(S.money);
    this.el.healthFill.style.width = `${Math.max(0, S.health)}%`;
    this.el.healthText.textContent = `${Math.ceil(S.health)} HP`;
    this.el.ammo.textContent = S.weapon === 'pistol' ? `🔫 ${S.ammo} / ${S.ammoReserve}` : '👊 Fists';
    this.el.stars.textContent = '★'.repeat(S.wanted) + '☆'.repeat(5 - S.wanted);
    this.el.stars.classList.toggle('hot', S.wanted > 0);
    const kmh = S.player ? Math.round(S.player.speed * 3.6) : 0;
    this.el.speed.textContent = S.player && S.player.driving ? `${kmh} km/h` : '';
    this.el.clock.textContent = clockFmt(S.gameMinutes);
    const m = S.missions;
    this.el.missionLabel.textContent = m && m.current ? `Mission ${S.completedMissions.length + 1}/5: ${m.current.def.name}` : S.completedMissions.length >= 5 ? 'All missions done — free roam' : 'Solmar City';
    this._drawMinimap();
  }

  _drawMinimap() {
    const ctx = this.mapCtx;
    const W = 180;
    const scale = W / 470;
    const toMap = (x, z) => [90 + x * scale, 90 + z * scale];
    ctx.clearRect(0, 0, W, W);
    // GTA-style dark map: charcoal land, deep blue sea, pale sand.
    ctx.fillStyle = '#0e3a5e';
    ctx.fillRect(0, 90 + 224 * scale, W, W - (90 + 224 * scale));
    ctx.fillStyle = '#8a7a52';
    ctx.fillRect(0, 90 + 224 * scale - 8, W, 8);
    // Land.
    ctx.fillStyle = '#20241f';
    ctx.fillRect(0, 0, W, 90 + 224 * scale);
    // Roads: light grey on dark, GTA-style.
    ctx.strokeStyle = '#9aa0a8';
    ctx.lineWidth = 12 * scale;
    for (const line of CITY.LINES) {
      const [x1, y1] = toMap(line, -230);
      const [x2, y2] = toMap(line, 230);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      const [x3, y3] = toMap(-230, line);
      const [x4, y4] = toMap(230, line);
      ctx.beginPath();
      ctx.moveTo(x3, y3);
      ctx.lineTo(x4, y4);
      ctx.stroke();
    }
    // Park and plaza.
    ctx.fillStyle = '#2c4a28';
    const [px, py] = toMap(CITY.PARK.x - 23, CITY.PARK.z - 23);
    ctx.fillRect(px, py, 46 * scale, 46 * scale);
    ctx.fillStyle = '#555a60';
    const [qx, qy] = toMap(CITY.PLAZA.x - 23, CITY.PLAZA.z - 23);
    ctx.fillRect(qx, qy, 46 * scale, 46 * scale);
    // Safehouse blip (green) at the plaza.
    const [sx, sy] = toMap(CITY.PLAZA.x, CITY.PLAZA.z);
    ctx.fillStyle = '#3ddc5f';
    ctx.beginPath();
    ctx.arc(sx, sy, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Mission / courier marker (yellow).
    const missions = S.missions;
    if (missions && missions.marker.visible) {
      const [mx, my] = toMap(missions.marker.position.x, missions.marker.position.z);
      ctx.fillStyle = '#ffd23d';
      ctx.beginPath();
      ctx.arc(mx, my, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#7a5a00';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // Traffic cars.
    ctx.fillStyle = '#ffffff';
    for (const c of S.cars) {
      if (c.police) continue;
      const [cx, cy] = toMap(c.pos.x, c.pos.z);
      ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    }
    // Enemies (dark red).
    ctx.fillStyle = '#a02020';
    for (const e of S.enemies) {
      if (e.dead) continue;
      const [ex, ey] = toMap(e.pos.x, e.pos.z);
      ctx.beginPath();
      ctx.arc(ex, ey, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Police (bright red with white ring).
    for (const u of S.police ? S.police.units : []) {
      const [ux, uy] = toMap(u.pos.x, u.pos.z);
      ctx.fillStyle = '#ff2a2a';
      ctx.beginPath();
      ctx.arc(ux, uy, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // Player arrow (GTA blue with white outline).
    const p = S.player;
    if (p) {
      const [px2, py2] = toMap(p.pos.x, p.pos.z);
      ctx.save();
      ctx.translate(px2, py2);
      ctx.rotate(-p.heading - Math.PI / 2 + Math.PI);
      ctx.fillStyle = '#2f9bff';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5, 6);
      ctx.lineTo(-5, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      // View direction line.
      ctx.strokeStyle = 'rgba(47,155,255,0.5)';
      ctx.beginPath();
      ctx.moveTo(px2, py2);
      ctx.lineTo(px2 + Math.cos(p.heading) * 10, py2 - Math.sin(p.heading) * 10);
      ctx.stroke();
    }
  }
}
