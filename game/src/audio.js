// WebAudio sound effects, all synthesized (no audio files, no network).
// The context is created lazily on the first user gesture and every sound is a
// short oscillator / filtered-noise burst. M toggles mute.
export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenTimer = 0;
    this.sirenOn = false;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenHigh = false;
  }

  /** Must be called from a user gesture (click / keydown). */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    // Engine hum: two detuned saws through a low-pass, gain follows speed.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const engineOsc2 = this.ctx.createOscillator();
    engineOsc2.type = 'sawtooth';
    engineOsc2.frequency.value = 58;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(filter);
    engineOsc2.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    engineOsc2.start();
    this._engineOsc2 = engineOsc2;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  /** Continuous engine sound; call every frame with speed 0..40. */
  engine(speed, driving) {
    if (!this.ctx || !this.engineGain) return;
    const target = driving ? 0.02 + Math.min(0.09, (speed / 40) * 0.09) : 0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
    const f = 50 + speed * 3.2;
    this.engineOsc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.08);
    if (this._engineOsc2) this._engineOsc2.frequency.setTargetAtTime(f * 1.02, this.ctx.currentTime, 0.08);
  }

  /** Police siren loop; call every frame with whether any police is active. */
  siren(active, dt) {
    if (!this.ctx) return;
    if (active && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 700;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.045;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      this.sirenTimer = 0;
      this.sirenHigh = true;
    }
    if (!active && this.sirenOsc) {
      try {
        this.sirenOsc.stop();
      } catch {
        /* already stopped */
      }
      this.sirenOsc.disconnect();
      this.sirenOsc = null;
      this.sirenGain = null;
      return;
    }
    if (this.sirenOsc) {
      this.sirenTimer += dt;
      if (this.sirenTimer > 0.45) {
        this.sirenTimer = 0;
        this.sirenHigh = !this.sirenHigh;
        this.sirenOsc.frequency.setTargetAtTime(this.sirenHigh ? 700 : 950, this.ctx.currentTime, 0.05);
      }
    }
  }

  _noiseBurst(duration, filterFreq, gainVal, type = 'lowpass') {
    if (!this.ctx) return;
    const len = Math.floor(this.ctx.sampleRate * duration);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.value = gainVal;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start();
  }

  _tone(freq, duration, type, gainVal, slideTo = null) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(slideTo, this.ctx.currentTime + duration);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  shot() {
    this._noiseBurst(0.14, 1800, 0.5, 'highpass');
    this._tone(160, 0.08, 'square', 0.18, 60);
  }

  punch() {
    this._tone(90, 0.12, 'sine', 0.4, 45);
  }

  horn() {
    this._tone(370, 0.35, 'square', 0.12);
    this._tone(466, 0.35, 'square', 0.1);
  }

  pickup() {
    this._tone(660, 0.09, 'sine', 0.25);
    setTimeout(() => this._tone(880, 0.12, 'sine', 0.25), 90);
  }

  missionDone() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this._tone(f, 0.16, 'triangle', 0.25), i * 110));
  }

  busted() {
    this._tone(220, 0.5, 'sawtooth', 0.2, 110);
  }
}
