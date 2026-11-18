// Procedural WebAudio for Solmar City: engine hum, gunshots, sirens and a
// two-station synthwave radio built on a 16th-note lookahead sequencer.
// No audio files, no network requests — everything is synthesized.
import { S } from './state.js';

const STATIONS = [
  {
    name: 'SOLMAR FM',
    track: 'Midnight Drive — Neon Palms',
    bpm: 96,
    root: 45, // A2
    chords: [[0, 3, 7, 10], [-4, 0, 3, 7], [-2, 2, 5, 8], [-5, -1, 2, 5]],
    bassLine: [0, 0, 7, 0, 12, 0, 7, 10],
  },
  {
    name: 'WAVE 98',
    track: 'Sunset Boulevard — The Vectors',
    bpm: 112,
    root: 48, // C3
    chords: [[0, 4, 7, 11], [-4, 0, 3, 7], [5, 9, 12, 16], [-2, 2, 5, 9]],
    bassLine: [0, 0, 5, 7, 0, 12, 7, 5],
  },
];

const NOTE = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.radioBus = null;
    this.engineGain = null;
    this.engineA = null;
    this.engineB = null;
    this.sirenGain = null;
    this.sirenOsc = null;
    this.sirenLfo = null;
    this.radioTimer = null;
    this.step = 0;
    this.nextTime = 0;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(ctx.destination);
    this.radioBus = ctx.createGain();
    this.radioBus.gain.value = 0.22;
    this.radioBus.connect(this.master);

    // Engine: two detuned saws through a lowpass, gain driven by speed.
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineA = ctx.createOscillator();
    this.engineA.type = 'sawtooth';
    this.engineA.frequency.value = 55;
    this.engineB = ctx.createOscillator();
    this.engineB.type = 'sawtooth';
    this.engineB.frequency.value = 55.5;
    this.engineA.connect(filter);
    this.engineB.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineA.start();
    this.engineB.start();

    // Siren: triangle whose pitch wobbles on a square LFO.
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 800;
    this.sirenLfo = ctx.createOscillator();
    this.sirenLfo.type = 'square';
    this.sirenLfo.frequency.value = 1.6;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 130;
    this.sirenLfo.connect(lfoGain);
    lfoGain.connect(this.sirenOsc.frequency);
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this.sirenLfo.start();
  }

  setEngine(speed01, on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.06 : 0, t, 0.1);
    this.engineA.frequency.setTargetAtTime(50 + speed01 * 130, t, 0.1);
    this.engineB.frequency.setTargetAtTime(50.5 + speed01 * 132, t, 0.1);
  }

  setSiren(on) {
    if (!this.ctx) return;
    this.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, this.ctx.currentTime, 0.2);
  }

  blip(freq, dur, type, vol) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type || 'square';
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  gunshot() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = 0.16;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2400;
    const g = this.ctx.createGain();
    g.gain.value = 0.5;
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
  }

  explosion() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = 0.7;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500;
    const g = this.ctx.createGain();
    g.gain.value = 0.8;
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
    this.blip(48, 0.6, 'sine', 0.4);
  }

  pickup() {
    this.blip(880, 0.09, 'sine', 0.15);
    setTimeout(() => this.blip(1318, 0.12, 'sine', 0.15), 90);
  }

  // --- Synthwave radio: 16th-note lookahead sequencer ---
  radioStart() {
    if (!this.ctx || this.radioTimer) return;
    S.radio.on = true;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.05;
    this.radioTimer = setInterval(() => this.radioTick(), 40);
  }

  radioStop() {
    S.radio.on = false;
    if (this.radioTimer) {
      clearInterval(this.radioTimer);
      this.radioTimer = null;
    }
  }

  radioSwitch() {
    S.radio.station = (S.radio.station + 1) % STATIONS.length;
    this.step = 0;
    this.nextTime = this.ctx ? this.ctx.currentTime + 0.05 : 0;
    return STATIONS[S.radio.station];
  }

  stationInfo() {
    return STATIONS[S.radio.station];
  }

  radioTick() {
    if (!this.ctx || !S.radio.on) return;
    const st = STATIONS[S.radio.station];
    const spb = 60 / st.bpm / 4; // one 16th note
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      const t = this.nextTime;
      const s16 = this.step % 16;
      const bar = Math.floor(this.step / 16);
      const chord = st.chords[bar % st.chords.length];
      // Kick on the quarters.
      if (s16 % 4 === 0) this.drumKick(t);
      // Hat on the off-8ths.
      if (s16 % 4 === 2) this.drumHat(t);
      // Bass: 8th-note line rooted on the chord.
      if (s16 % 2 === 0) {
        const n = st.root + chord[0] + st.bassLine[(this.step / 2) % 8];
        this.tone(NOTE(n), t, spb * 1.8, 'sawtooth', 0.16, 300);
      }
      // Arp: 16ths cycling the chord tones two octaves up.
      const arp = [chord[0] + 24, chord[1] + 24, chord[2] + 24, chord[3] + 24];
      this.tone(NOTE(st.root + arp[this.step % 4]), t, spb * 0.9, 'square', 0.05, 2400);
      // Pad at the top of each bar.
      if (s16 === 0) {
        for (const iv of chord) this.tone(NOTE(st.root + 12 + iv), t, spb * 16, 'sawtooth', 0.035, 900);
      }
      this.step++;
      this.nextTime += spb;
    }
  }

  tone(freq, t, dur, type, vol, cutoff) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff || 1200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f);
    f.connect(g);
    g.connect(this.radioBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  drumKick(t) {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    o.connect(g);
    g.connect(this.radioBus);
    o.start(t);
    o.stop(t + 0.15);
  }

  drumHat(t) {
    const len = 0.04;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.value = 0.1;
    src.connect(f);
    f.connect(g);
    g.connect(this.radioBus);
    src.start(t);
  }
}
