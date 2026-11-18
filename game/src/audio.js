// Solmar City — sound: everything is synthesized with WebAudio, no audio
// files. Engine hum, two-tone police siren, gunshots, crashes, pickups,
// mission jingles and a quiet synth groove for the city ambience.
export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
    this.sirenHigh = false;
    this.musicTimer = null;
    this.musicStep = 0;
  }

  // Must be called from a user gesture (button click / key press).
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
    } catch (err) {
      this.ctx = null;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
    return this.muted;
  }

  _noiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  _blip(freq, duration, type, volume, slideTo) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + duration);
    gain.gain.setValueAtTime(volume || 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  _noiseBurst(duration, volume, filterFreq) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(duration);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq || 1200;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume || 0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }

  // --- One-shots ---------------------------------------------------------
  playShot() {
    this._noiseBurst(0.14, 0.5, 2600);
    this._blip(160, 0.1, 'square', 0.18, 60);
  }

  playPunch() {
    this._noiseBurst(0.09, 0.35, 700);
  }

  playCrash(strength) {
    this._noiseBurst(0.35, 0.25 + 0.35 * Math.min(1, strength || 0.5), 500);
    this._blip(70, 0.3, 'sine', 0.3, 35);
  }

  playHorn() {
    this._blip(370, 0.35, 'sawtooth', 0.12);
    this._blip(466, 0.35, 'sawtooth', 0.1);
  }

  playPickup() {
    this._blip(660, 0.12, 'sine', 0.22);
    setTimeout(() => this._blip(990, 0.18, 'sine', 0.22), 90);
  }

  playClick() {
    this._blip(880, 0.06, 'sine', 0.15);
  }

  playJingle() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => setTimeout(() => this._blip(n, 0.22, 'triangle', 0.22), i * 110));
  }

  playFail() {
    const notes = [392, 330, 262];
    notes.forEach((n, i) => setTimeout(() => this._blip(n, 0.3, 'sawtooth', 0.14), i * 160));
  }

  playSirenBlip() {
    this._blip(880, 0.2, 'sine', 0.1, 660);
  }

  // --- Engine loop -------------------------------------------------------
  startEngine() {
    if (!this.ctx || this.engineOsc) return;
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
  }

  setEngine(speedRatio, on) {
    if (!this.engineOsc || !this.ctx) return;
    const t = this.ctx.currentTime;
    const target = on ? 0.05 + 0.075 * Math.min(1, speedRatio) : 0.0;
    this.engineGain.gain.setTargetAtTime(this.muted ? 0 : target, t, 0.08);
    this.engineOsc.frequency.setTargetAtTime(52 + 130 * Math.min(1, speedRatio), t, 0.1);
    this.engineFilter.frequency.setTargetAtTime(380 + 900 * Math.min(1, speedRatio), t, 0.1);
  }

  stopEngine() {
    if (!this.engineOsc) return;
    try { this.engineOsc.stop(); } catch (err) { /* already stopped */ }
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
  }

  // --- Police siren ------------------------------------------------------
  startSiren() {
    if (!this.ctx || this.sirenOsc) return;
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 720;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0.0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this.sirenHigh = false;
    this.sirenTimer = 0;
  }

  updateSiren(dt, active) {
    if (!this.sirenOsc || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.sirenGain.gain.setTargetAtTime(active && !this.muted ? 0.045 : 0.0, t, 0.1);
    if (!active) return;
    this.sirenTimer += dt;
    if (this.sirenTimer > 0.45) {
      this.sirenTimer = 0;
      this.sirenHigh = !this.sirenHigh;
      this.sirenOsc.frequency.setTargetAtTime(this.sirenHigh ? 950 : 700, t, 0.05);
    }
  }

  stopSiren() {
    if (!this.sirenOsc) return;
    try { this.sirenOsc.stop(); } catch (err) { /* already stopped */ }
    this.sirenOsc = null;
    this.sirenGain = null;
  }

  // --- Ambient music: a quiet 100 BPM synth groove ----------------------
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const bassLine = [55, 0, 55, 65.4, 0, 55, 0, 82.4, 55, 0, 55, 65.4, 49, 0, 58.3, 73.4];
    const stepMs = 150; // 16th notes at 100 BPM
    this.musicStep = 0;
    this.musicTimer = setInterval(() => {
      if (this.muted || !this.ctx) return;
      const step = this.musicStep % 16;
      const bass = bassLine[step];
      if (bass) this._blip(bass, 0.22, 'triangle', 0.16);
      if (step % 4 === 0) this._blip(120, 0.12, 'sine', 0.22, 45); // kick
      if (step % 4 === 2) this._noiseBurst(0.04, 0.05, 6000);     // hat
      this.musicStep++;
    }, stepMs);
  }

  stopMusic() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
}
