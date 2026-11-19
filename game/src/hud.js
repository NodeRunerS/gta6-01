// Retro-style HUD: top-right clock / money / health / armor / weapon / stars,
// bottom-left circular radar minimap, objective line, toasts and prompts.
import { S } from './state.js';
import { fmtMoney, fmtClock, clamp } from './util.js';
import { MISSIONS } from './missions.js';
import { nearestVehicle } from './player.js';

let minimap = null;
let toastTimer = null;

export function initHud() {
  minimap = document.getElementById('minimap');
}

export function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

export function flashDamage() {
  const el = document.getElementById('damage-flash');
  if (!el) return;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 180);
}

function drawMinimap() {
  if (!minimap) return;
  const ctx = minimap.getContext('2d');
  const W = minimap.width;
  const H = minimap.height;
  const p = S.player;
  ctx.clearRect(0, 0, W, H);
  // Clip to a circle.
  ctx.save();
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2);
  ctx.clip();
  // Water background (dark turquoise).
  ctx.fillStyle = '#1e7fa8';
  ctx.fillRect(0, 0, W, H);
  const sx = (x) => ((x + 260) / 520) * W;
  const sz = (z) => ((z + 220) / 440) * H;
  // Land masses: west, east, beach, mansion island.
  ctx.fillStyle = '#20241f';
  ctx.fillRect(sx(-224), sz(-196), sx(-56) - sx(-224), sz(196) - sz(-196));
  ctx.fillRect(sx(56), sz(-196), sx(224) - sx(56), sz(196) - sz(-196));
  ctx.fillStyle = '#c8b078';
  ctx.fillRect(sx(224), sz(-196), sx(252) - sx(224), sz(196) - sz(-196));
  ctx.fillStyle = '#2a3324';
  ctx.fillRect(sx(-26), sz(178), sx(26) - sx(-26), sz(214) - sz(178));
  // Roads.
  ctx.strokeStyle = '#c8c8c8';
  ctx.lineWidth = 1.4;
  for (const a of [-196, -140, -84, 84, 140, 196]) {
    ctx.beginPath();
    ctx.moveTo(sx(a), sz(-196));
    ctx.lineTo(sx(a), sz(196));
    ctx.stroke();
  }
  for (const s of [-168, -112, -56, 0, 56, 112, 168]) {
    const bridge = [-112, 0, 112].includes(s);
    ctx.beginPath();
    ctx.moveTo(sx(bridge ? -196 : -224), sz(s));
    ctx.lineTo(sx(bridge ? 196 : -56), sz(s));
    ctx.stroke();
    if (!bridge) {
      ctx.beginPath();
      ctx.moveTo(sx(56), sz(s));
      ctx.lineTo(sx(224), sz(s));
      ctx.stroke();
    }
  }
  // Bridges in neon pink.
  ctx.strokeStyle = '#ff2e88';
  ctx.lineWidth = 2;
  for (const bz of [-112, 0, 112]) {
    ctx.beginPath();
    ctx.moveTo(sx(-56), sz(bz));
    ctx.lineTo(sx(56), sz(bz));
    ctx.stroke();
  }
  // Blips.
  const blip = (x, z, color, r = 3) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(sx(x), sz(z), r, 0, Math.PI * 2);
    ctx.fill();
  };
  if (S.locations) {
    for (const b of S.locations.businesses) {
      blip(b.x, b.z, S.ownedBusinesses.includes(b.id) ? '#35d07f' : '#9ad7f0');
    }
    blip(S.locations.gunshop.x, S.locations.gunshop.z, '#ff2222');
    blip(S.locations.safehouse.x, S.locations.safehouse.z, S.safehouseOwned ? '#35d07f' : '#ffffff');
    blip(S.locations.helipad.x, S.locations.helipad.z, '#ffffff', 2.5);
    blip(S.locations.marina.x, S.locations.marina.z, '#00e5ff', 2.5);
  }
  // Uncollected Gold Shells as small gold dots.
  if (S.shellSpots) {
    for (let i = 0; i < S.shellSpots.length; i++) {
      if (!(S.shellsCollected || []).includes(i)) {
        blip(S.shellSpots[i][0], S.shellSpots[i][1], '#ffd23d', 2);
      }
    }
  }
  // Mission marker.
  if (S.mission) {
    const step = S.mission.def.steps[S.mission.step];
    if (step) {
      const pulse = 3 + Math.sin(S.time * 4) * 1.2;
      blip(step.pos.x, step.pos.z, '#ffc93d', pulse);
    }
  } else if (S.missionIndex < MISSIONS.length) {
    const def = MISSIONS[S.missionIndex];
    blip(def.start.x, def.start.z, '#ff2e88', 3.5);
  }
  // Courier.
  if (S.courier) blip(S.courier.target.x, S.courier.target.z, '#00e5ff', 3.5);
  // Police.
  for (const u of S.police) blip(u.pos.x, u.pos.z, '#ff2222', 2.5);
  if (S.policeHeli) blip(S.policeHeli.pos.x, S.policeHeli.pos.z, '#ff2222', 3);
  // Player arrow.
  if (p) {
    ctx.save();
    ctx.translate(sx(p.pos.x), sz(p.pos.z));
    ctx.rotate(Math.atan2(Math.sin(p.heading), Math.cos(p.heading)));
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  // Ring.
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, W / 2 - 1.5, 0, Math.PI * 2);
  ctx.stroke();
}

export function updateHud() {
  const p = S.player;
  if (!p) return;
  const $ = (id) => document.getElementById(id);
  $('clock').textContent = fmtClock(S.clockMin);
  const money = $('money');
  money.textContent = fmtMoney(S.money);
  money.className = S.money >= 10000 ? 'money rich' : 'money';
  const shellsEl = $('shells');
  if (shellsEl) shellsEl.textContent = `🐚 Shells ${S.shellsCollected.length}/24`;
  $('health-fill').style.width = clamp(p.health, 0, 100) + '%';
  $('armor-fill').style.width = clamp(p.armor, 0, 100) + '%';
  if (p.vehicle) {
    $('weapon').textContent = p.vehicle.kind === 'heli'
      ? '🚁 HELI'
      : p.vehicle.kind === 'boat'
        ? '🚤 BOAT'
        : '🚗 ' + (p.vehicle.def.name || 'CAR').toUpperCase();
  } else {
    $('weapon').textContent = `🔫 PISTOL ${p.ammo}`;
  }
  const stars = $('stars');
  stars.textContent = '★'.repeat(p.wanted) + '☆'.repeat(6 - p.wanted);
  stars.className = p.wanted > 0 ? 'stars hot' : 'stars';
  $('objective').textContent = S.objectiveText || '';
  // Speed + radio.
  const speed = $('speed');
  if (p.vehicle) {
    speed.textContent = Math.round(Math.abs(p.vehicle.speed) * 2.2) + ' mph';
    speed.classList.remove('hidden');
  } else {
    speed.classList.add('hidden');
  }
  const radio = $('radio');
  if (S.radio.on && S.audio) {
    const st = S.audio.stationInfo();
    radio.textContent = `♪ ${st.name} — ${st.track}  [V]`;
    radio.classList.remove('hidden');
  } else {
    radio.classList.add('hidden');
  }
  // Interaction prompt — or, when a car/boat/heli is close, the entry prompt.
  const prompt = $('prompt');
  if (S.mode === 'playing' && !p.vehicle) {
    const it = window.__game && window.__game.nearestInteraction ? window.__game.nearestInteraction() : null;
    if (it) {
      prompt.textContent = it.label;
      prompt.classList.remove('hidden');
    } else {
      const v = nearestVehicle(4.5);
      if (v) {
        prompt.textContent = v.kind === 'boat' ? 'E — TEKNEYE BİN'
          : v.kind === 'heli' ? 'E — HELİKOPTERE BİN' : 'E — ARACA BİN';
        prompt.classList.remove('hidden');
      } else {
        prompt.classList.add('hidden');
      }
    }
  } else {
    prompt.classList.add('hidden');
  }
  // Crosshair: faint while holding the pistol on foot, bold while aiming.
  const ch = $('crosshair');
  if (ch) {
    if (S.mode === 'playing' && !p.vehicle && p.weapon === 'pistol') {
      ch.classList.remove('hidden');
      ch.classList.toggle('aim', !!S.aiming);
    } else {
      ch.classList.add('hidden');
    }
  }
  drawMinimap();
}
