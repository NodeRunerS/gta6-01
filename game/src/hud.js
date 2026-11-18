// Solmar City — the HUD: wanted stars, cash, health, weapon and ammo,
// speed, mission objective, toast messages, a damage vignette and a live
// 2D minimap (roads, beach, player arrow, traffic, police, mission beacon).
import { CITY } from './city.js';

export class HUD {
  constructor() {
    this.el = {
      stars: document.getElementById('stars'),
      cash: document.getElementById('cash'),
      clock: document.getElementById('clock'),
      healthFill: document.getElementById('health-fill'),
      healthText: document.getElementById('health-text'),
      weapon: document.getElementById('weapon'),
      ammo: document.getElementById('ammo'),
      speed: document.getElementById('speed'),
      speedLabel: document.getElementById('speed-label'),
      objective: document.getElementById('objective'),
      objectiveText: document.getElementById('objective-text'),
      toasts: document.getElementById('toasts'),
      crosshair: document.getElementById('crosshair'),
      damage: document.getElementById('damage'),
      hint: document.getElementById('hint'),
      banner: document.getElementById('banner'),
      bannerTitle: document.getElementById('banner-title'),
      bannerSub: document.getElementById('banner-sub'),
    };
    this.map = document.getElementById('minimap');
    this.mapCtx = this.map.getContext('2d');
    this.bannerTimer = null;
    this.lastWanted = -1;
  }

  setObjective(text) {
    this.el.objectiveText.textContent = text;
  }

  showBanner(title, sub, seconds) {
    this.el.bannerTitle.textContent = title;
    this.el.bannerSub.textContent = sub || '';
    this.el.banner.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => this.el.banner.classList.remove('show'), (seconds || 3) * 1000);
  }

  toast(text, seconds) {
    const div = document.createElement('div');
    div.className = 'toast';
    div.textContent = text;
    this.el.toasts.appendChild(div);
    while (this.el.toasts.children.length > 4) this.el.toasts.removeChild(this.el.toasts.firstChild);
    setTimeout(() => {
      div.classList.add('fade');
      setTimeout(() => div.remove(), 600);
    }, (seconds || 4) * 1000);
  }

  flashDamage() {
    this.el.damage.classList.add('hit');
    setTimeout(() => this.el.damage.classList.remove('hit'), 180);
  }

  setHint(text) {
    this.el.hint.textContent = text || '';
  }

  update(state) {
    // Wanted stars.
    if (state.wanted !== this.lastWanted) {
      this.lastWanted = state.wanted;
      let stars = '';
      for (let i = 0; i < 5; i++) stars += i < state.wanted ? '★' : '☆';
      this.el.stars.textContent = stars;
      this.el.stars.classList.toggle('hot', state.wanted > 0);
    }
    this.el.cash.textContent = '$' + state.cash.toLocaleString('en-US');
    const hh = String(Math.floor(state.timeMin / 60) % 24).padStart(2, '0');
    const mm = String(Math.floor(state.timeMin % 60)).padStart(2, '0');
    this.el.clock.textContent = `${hh}:${mm}`;
    const hp = Math.max(0, Math.round(state.health));
    this.el.healthFill.style.width = hp + '%';
    this.el.healthFill.classList.toggle('low', hp <= 30);
    this.el.healthText.textContent = hp;
    this.el.weapon.textContent = state.weapon === 'pistol' ? 'PISTOL' : 'FISTS';
    this.el.ammo.textContent = state.weapon === 'pistol' ? (state.reloading ? 'RELOADING…' : `${state.ammo} / ∞`) : '—';
    const kmh = Math.round(Math.abs(state.speed) * 3.6);
    this.el.speed.textContent = state.driving ? kmh : '';
    this.el.speedLabel.textContent = state.driving ? 'km/h' : '';
    this.el.crosshair.style.display = !state.driving && state.weapon === 'pistol' && state.playing ? 'block' : 'none';
    this.drawMinimap(state);
  }

  drawMinimap(state) {
    const ctx = this.mapCtx;
    const S = this.map.width;
    const half = CITY.half + 24;
    const toMap = (x, z) => [((x + half) / (half * 2)) * S, ((z + half) / (half * 2)) * S];
    ctx.clearRect(0, 0, S, S);
    // Land, beach, water.
    ctx.fillStyle = '#5d7a4a';
    ctx.fillRect(0, 0, S, S);
    const [, beachY] = toMap(0, 150);
    ctx.fillStyle = '#e9d6a4';
    ctx.fillRect(0, beachY, S, S - beachY);
    const [, waterY] = toMap(0, 196);
    ctx.fillStyle = '#2f7fb8';
    ctx.fillRect(0, waterY, S, S - waterY);
    // Roads.
    ctx.strokeStyle = '#3a3d42';
    ctx.lineWidth = 5;
    for (let i = 0; i <= CITY.blocks; i++) {
      const c = -CITY.half + i * CITY.pitch;
      const [x] = toMap(c, 0);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S); ctx.stroke();
      const [, y] = toMap(0, c);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke();
    }
    // Plaza.
    const [px, py] = toMap(18, 18);
    ctx.fillStyle = '#c9b98a';
    ctx.fillRect(px - 6, py - 6, 12, 12);
    // Mission beacon.
    if (state.marker) {
      const [mx, my] = toMap(state.marker.x, state.marker.z);
      const pulse = 5 + Math.sin(performance.now() * 0.006) * 2;
      ctx.fillStyle = '#f7c948';
      ctx.beginPath();
      ctx.arc(mx, my, pulse + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.arc(mx, my, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Traffic dots.
    ctx.fillStyle = '#ffffff';
    for (const car of state.traffic || []) {
      const [cx, cy] = toMap(car.pos.x, car.pos.z);
      ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    }
    // Police dots (flashing blue/red).
    const policeOn = Math.floor(performance.now() / 300) % 2 === 0;
    ctx.fillStyle = policeOn ? '#3a6cff' : '#ff3a3a';
    for (const c of state.police || []) {
      const [cx, cy] = toMap(c.pos.x, c.pos.z);
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow.
    const [ux, uy] = toMap(state.playerX, state.playerZ);
    ctx.save();
    ctx.translate(ux, uy);
    ctx.rotate(state.playerHeading);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // North tick.
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 11px Arial';
    ctx.fillText('N', S - 14, 14);
  }
}
