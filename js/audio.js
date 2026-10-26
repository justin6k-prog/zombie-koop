// Sounds werden im Code erzeugt (keine Audiodateien nötig)
class Sfx {
  constructor() {
    this.ctx = null;
    this.last = {};
  }

  // Muss nach einem Tippen aufgerufen werden (iOS-Regel)
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  // Gleiche Sounds nicht zu oft hintereinander
  throttle(key, ms) {
    const now = performance.now();
    if (this.last[key] && now - this.last[key] < ms) return false;
    this.last[key] = now;
    return true;
  }

  env(g, t, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  noiseHit(vol, dur, type, freq, q = 1, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    this.env(g, t, 0.003, vol, dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }

  tone(vol, dur, type, f0, f1, delay = 0, attack = 0.005) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    this.env(g, t, attack, vol, dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  play(name, vol = 1, opt) {
    if (!this.ctx || vol <= 0.02) return;
    const v = Math.min(1, vol);
    switch (name) {
      case 'shot': {
        const w = opt || 'pistol';
        if (!this.throttle('shot' + w, 45)) return;
        if (w === 'shotgun') { this.noiseHit(0.9 * v, 0.35, 'lowpass', 1400); this.tone(0.4 * v, 0.15, 'sine', 120, 50); }
        else if (w === 'sniper' || w === 'dmr') { this.noiseHit(0.9 * v, 0.45, 'lowpass', 2200); this.tone(0.4 * v, 0.2, 'sine', 160, 50); }
        else if (w === 'plasma') { this.tone(0.35 * v, 0.25, 'sawtooth', 1400, 180); this.noiseHit(0.3 * v, 0.1, 'highpass', 3000); }
        else if (w === 'turret') this.noiseHit(0.35 * v, 0.06, 'bandpass', 3000, 2);
        else if (w === 'smg') this.noiseHit(0.5 * v, 0.07, 'bandpass', 2400, 1.2);
        else if (w === 'lmg' || w === 'rifle') { this.noiseHit(0.6 * v, 0.11, 'bandpass', 1700, 1); this.tone(0.2 * v, 0.06, 'sine', 140, 60); }
        else this.noiseHit(0.6 * v, 0.12, 'bandpass', 2000, 1.4);
        break;
      }
      case 'flame': if (this.throttle('flame', 110)) this.noiseHit(0.35 * v, 0.2, 'lowpass', 700); break;
      case 'hit': if (this.throttle('hit', 60)) this.noiseHit(0.25 * v, 0.05, 'lowpass', 900); break;
      case 'groan':
        if (!this.throttle('groan', 120)) return;
        { const f = 70 + Math.random() * 60; this.tone(0.22 * v, 0.5 + Math.random() * 0.4, 'sawtooth', f, f * 0.6, 0, 0.08); }
        break;
      case 'boom': this.noiseHit(1 * v, 0.8, 'lowpass', 500); this.tone(0.6 * v, 0.6, 'sine', 90, 30); break;
      case 'knife': this.noiseHit(0.4 * v, 0.1, 'highpass', 2500); break;
      case 'tear': if (this.throttle('tear', 80)) { this.noiseHit(0.5 * v, 0.18, 'lowpass', 400); this.tone(0.2 * v, 0.1, 'square', 90, 60); } break;
      case 'plank': this.noiseHit(0.5 * v, 0.08, 'bandpass', 900, 3); this.noiseHit(0.4 * v, 0.06, 'bandpass', 1100, 3, 0.09); break;
      case 'door': this.noiseHit(0.7 * v, 0.9, 'lowpass', 300); this.tone(0.3 * v, 0.7, 'square', 60, 40); break;
      case 'hurt': if (this.throttle('hurt', 150)) this.tone(0.35 * v, 0.18, 'square', 220, 90); break;
      case 'down': this.tone(0.4 * v, 0.9, 'sawtooth', 300, 60); break;
      case 'buy': this.tone(0.3 * v, 0.12, 'sine', 660, 660); this.tone(0.3 * v, 0.25, 'sine', 990, 990, 0.1); break;
      case 'nomoney': this.tone(0.3 * v, 0.2, 'square', 110, 100); break;
      case 'empty': if (this.throttle('empty', 200)) this.noiseHit(0.3 * v, 0.03, 'highpass', 4000); break;
      case 'reload': this.noiseHit(0.3 * v, 0.05, 'bandpass', 1800, 4); this.noiseHit(0.3 * v, 0.06, 'bandpass', 1300, 4, 0.25); break;
      case 'swap': this.noiseHit(0.25 * v, 0.06, 'bandpass', 1500, 3); break;
      case 'round':
        [110, 165, 220].forEach((f, i) => this.tone(0.3 * v, 2.5, 'sine', f, f, i * 0.02, 0.02));
        this.tone(0.15 * v, 2.5, 'triangle', 55, 55, 0, 0.3);
        break;
      case 'roundEnd': [220, 185, 147].forEach((f, i) => this.tone(0.25 * v, 1.2, 'sine', f, f, i * 0.35, 0.02)); break;
      case 'power': this.tone(0.4 * v, 1.6, 'sawtooth', 50, 420, 0, 0.05); this.tone(0.2 * v, 2.5, 'sine', 60, 60, 1.4, 0.2); break;
      case 'powerup': [523, 659, 784, 1046].forEach((f, i) => this.tone(0.25 * v, 0.2, 'triangle', f, f, i * 0.08)); break;
      case 'part': this.tone(0.25 * v, 0.15, 'sine', 1200, 1200); this.tone(0.25 * v, 0.3, 'sine', 1800, 1800, 0.1); break;
      case 'perk': this.noiseHit(0.3 * v, 0.4, 'bandpass', 600, 2); [392, 523, 659].forEach((f, i) => this.tone(0.2 * v, 0.3, 'triangle', f, f, 0.3 + i * 0.1)); break;
      case 'upgrade': this.tone(0.4 * v, 1.2, 'sawtooth', 100, 900, 0, 0.05); this.noiseHit(0.5 * v, 0.6, 'lowpass', 600, 1, 1.1); break;
      case 'box':
        for (let i = 0; i < 12; i++) { const f = [523, 659, 784, 659][i % 4] * (i % 8 < 4 ? 1 : 1.12); this.tone(0.18 * v, 0.2, 'triangle', f, f, i * 0.24); }
        break;
      case 'abil': this.tone(0.3 * v, 0.5, 'sine', 300, 900); break;
      case 'over': [196, 165, 131, 98].forEach((f, i) => this.tone(0.35 * v, 1.0, 'sawtooth', f, f, i * 0.4, 0.05)); break;
    }
  }
}
