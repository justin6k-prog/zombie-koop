// Sounds werden im Code erzeugt (keine Audiodateien nötig).
// Schüsse bestehen aus mehreren Schichten (Knall, Körper, Bass, Mechanik) und laufen über einen Hall.
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
      const c = this.ctx = new AC();
      // Kompressor, damit laute Schüsse nicht übersteuern
      this.comp = c.createDynamicsCompressor();
      this.comp.threshold.value = -14; this.comp.ratio.value = 6; this.comp.attack.value = 0.002; this.comp.release.value = 0.15;
      this.master = c.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.comp); this.comp.connect(c.destination);
      // Hall aus abklingendem Rauschen
      this.verb = c.createConvolver();
      const len = Math.floor(c.sampleRate * 1.8), ir = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
      }
      this.verb.buffer = ir;
      this.verbIn = c.createGain(); this.verbIn.gain.value = 0.32;
      this.verbIn.connect(this.verb); this.verb.connect(this.master);
      const nlen = c.sampleRate * 2;
      this.noise = c.createBuffer(1, nlen, c.sampleRate);
      const nd = this.noise.getChannelData(0);
      for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;
      this.startAmbience();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  // Leises, unheimliches Rauschen im Hintergrund
  startAmbience() {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260;
    const g = c.createGain(); g.gain.value = 0.05;
    const lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = 0.07; lg.gain.value = 120;
    lfo.connect(lg); lg.connect(f.frequency);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(); lfo.start();
    const drone = c.createOscillator(), dg = c.createGain();
    drone.type = 'sine'; drone.frequency.value = 43; dg.gain.value = 0.025;
    drone.connect(dg); dg.connect(this.master); drone.start();
  }

  throttle(key, ms) {
    const now = performance.now();
    if (this.last[key] && now - this.last[key] < ms) return false;
    this.last[key] = now;
    return true;
  }

  // Ausgang mit Entfernungsfilter (weit weg = dumpfer) und Hall-Anteil
  out(vol, verb = 0.5) {
    const c = this.ctx;
    const g = c.createGain(); g.gain.value = vol;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900 + vol * vol * 16000;
    g.connect(f); f.connect(this.master);
    if (verb > 0) { const s = c.createGain(); s.gain.value = verb * (1.3 - vol * 0.6); f.connect(s); s.connect(this.verbIn); }
    return g;
  }

  env(g, t, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  noise1(dest, vol, dur, type, freq, q = 1, delay = 0, attack = 0.002, sweepTo = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = c.createGain();
    this.env(g, t, attack, vol, dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }

  tone1(dest, vol, dur, type, f0, f1, delay = 0, attack = 0.004) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = c.createGain();
    this.env(g, t, attack, vol, dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // Metallisches Klicken (Mechanik der Waffe)
  click(dest, vol, delay, freq = 3200) {
    this.noise1(dest, vol, 0.025, 'bandpass', freq, 6, delay, 0.001);
    this.tone1(dest, vol * 0.3, 0.05, 'square', freq * 0.7, freq * 0.6, delay);
  }

  // Schuss aus Schichten: crack = scharfer Knall, body = Mitten, boom = Bass, tail = Länge
  gun(vol, o) {
    const d = this.out(vol, o.verb || 0.6);
    const p = 0.9 + Math.random() * 0.2;
    this.noise1(d, 1.0 * o.crack, 0.012, 'highpass', 4500 * p);
    this.noise1(d, 0.9 * o.body, o.tail, 'bandpass', o.bodyF * p, 0.9, 0, 0.001, o.bodyF * 0.35);
    this.tone1(d, 0.9 * o.boom, o.tail * 1.4, 'sine', o.boomF * p, o.boomF * 0.4);
    this.noise1(d, 0.5 * o.boom, o.tail * 0.8, 'lowpass', 300, 0.7);
    if (o.mech) this.click(d, 0.25 * o.mech, 0.012, 2600);
  }

  play(name, vol = 1, opt) {
    if (!this.ctx || vol <= 0.02) return;
    const v = Math.min(1, vol);
    switch (name) {
      case 'shot': {
        const w = opt || 'pistol';
        if (!this.throttle('shot' + w, 40)) return;
        if (w === 'pistol') this.gun(v * 0.8, { crack: 0.9, body: 0.9, bodyF: 1800, boom: 0.5, boomF: 110, tail: 0.12, mech: 1 });
        else if (w === 'shotgun') {
          this.gun(v, { crack: 1, body: 1, bodyF: 900, boom: 1, boomF: 70, tail: 0.32, verb: 0.8 });
          const d = this.out(v * 0.7, 0.2);
          this.noise1(d, 0.6, 0.06, 'bandpass', 1200, 3, 0.38); this.click(d, 0.6, 0.45, 1800);
        }
        else if (w === 'smg') this.gun(v * 0.65, { crack: 0.8, body: 0.8, bodyF: 2200, boom: 0.35, boomF: 130, tail: 0.07, mech: 0.6 });
        else if (w === 'rifle') this.gun(v * 0.8, { crack: 1, body: 0.9, bodyF: 1500, boom: 0.6, boomF: 95, tail: 0.11, mech: 0.6 });
        else if (w === 'lmg') this.gun(v * 0.85, { crack: 1, body: 1, bodyF: 1300, boom: 0.7, boomF: 85, tail: 0.12, mech: 0.5 });
        else if (w === 'dmr') this.gun(v, { crack: 1, body: 1, bodyF: 1200, boom: 0.8, boomF: 80, tail: 0.25, verb: 0.9 });
        else if (w === 'sniper') {
          this.gun(v, { crack: 1, body: 1, bodyF: 1000, boom: 1, boomF: 60, tail: 0.45, verb: 1 });
          const d = this.out(v * 0.6, 0.2);
          this.click(d, 0.7, 0.6, 2200); this.noise1(d, 0.4, 0.08, 'bandpass', 1500, 4, 0.66); this.click(d, 0.7, 0.8, 2600);
        }
        else if (w === 'plasma') {
          const d = this.out(v * 0.7, 0.6);
          this.tone1(d, 0.5, 0.3, 'sawtooth', 1800, 140); this.tone1(d, 0.4, 0.25, 'square', 900, 60, 0.01);
          this.noise1(d, 0.3, 0.12, 'highpass', 5000);
        }
        else if (w === 'turret') this.gun(v * 0.5, { crack: 0.7, body: 0.6, bodyF: 2600, boom: 0.2, boomF: 150, tail: 0.06 });
        break;
      }
      case 'flame':
        if (this.throttle('flame', 90)) {
          const d = this.out(v * 0.7, 0.3);
          this.noise1(d, 0.5, 0.28, 'lowpass', 900, 0.8, 0, 0.04, 500);
          this.noise1(d, 0.25, 0.2, 'bandpass', 2400, 1, 0, 0.03);
        }
        break;
      case 'hit': {
        if (!this.throttle('hit', 45)) return;
        const d = this.out(v * 0.7, 0.15);
        this.noise1(d, 0.6, 0.09, 'bandpass', 700, 2, 0, 0.002, 220);  // nasses Klatschen
        this.tone1(d, 0.35, 0.07, 'sine', 160, 70);                      // dumpfer Einschlag
        break;
      }
      case 'gore': {
        const d = this.out(v * 0.9, 0.3);
        this.noise1(d, 0.8, 0.25, 'bandpass', 500, 1.5, 0, 0.003, 150);
        this.noise1(d, 0.5, 0.05, 'highpass', 2500, 1, 0.01);           // Knacken
        this.noise1(d, 0.4, 0.4, 'lowpass', 400, 1, 0.08, 0.02);        // Spritzen
        break;
      }
      case 'growl': {
        if (!this.throttle('growl', 140)) return;
        const c = this.ctx, d = this.out(v * 0.6, 0.5), t = c.currentTime;
        const dur = 0.6 + Math.random() * 0.8, f0 = 75 + Math.random() * 55;
        const o = c.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * (0.7 + Math.random() * 0.5), t + dur);
        const lfo = c.createOscillator(), lg = c.createGain();
        lfo.frequency.value = 5 + Math.random() * 5; lg.gain.value = f0 * 0.12;
        lfo.connect(lg); lg.connect(o.frequency);
        const g = c.createGain(); this.env(g, t, 0.08, 0.9, dur);
        // zwei Formanten = kehliger Klang
        for (const [ff, q] of [[500 + Math.random() * 300, 4], [1100 + Math.random() * 500, 6]]) {
          const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = ff; f.Q.value = q;
          o.connect(f); f.connect(g);
        }
        g.connect(d);
        o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
        this.noise1(d, 0.25, dur, 'bandpass', 900, 2, 0, 0.1);
        break;
      }
      case 'boom': {
        const d = this.out(v, 1);
        this.noise1(d, 1, 1.2, 'lowpass', 900, 0.7, 0, 0.003, 120);
        this.tone1(d, 1, 0.9, 'sine', 70, 25);
        this.noise1(d, 0.6, 0.03, 'highpass', 3000);
        break;
      }
      case 'knife': { const d = this.out(v * 0.8, 0.1); this.noise1(d, 0.5, 0.12, 'bandpass', 3000, 1.5, 0, 0.02, 1200); break; }
      case 'tear': if (this.throttle('tear', 80)) { const d = this.out(v, 0.4); this.noise1(d, 0.7, 0.2, 'lowpass', 500, 1); this.noise1(d, 0.4, 0.05, 'bandpass', 1800, 3, 0.02); this.tone1(d, 0.3, 0.12, 'triangle', 120, 60); } break;
      case 'plank': { const d = this.out(v, 0.4); for (const t of [0, 0.11]) { this.noise1(d, 0.6, 0.05, 'bandpass', 1100, 4, t); this.tone1(d, 0.3, 0.06, 'triangle', 420, 380, t); } break; }
      case 'door': { const d = this.out(v, 0.8); this.noise1(d, 0.8, 1.1, 'lowpass', 400, 1, 0, 0.05); this.tone1(d, 0.3, 0.9, 'sawtooth', 70, 45, 0, 0.05); this.click(d, 0.6, 1.0, 900); break; }
      case 'step': {
        const d = this.out(v * 0.5, 0.1);
        this.noise1(d, 0.7, 0.07, 'lowpass', 500 + Math.random() * 200, 1);
        this.noise1(d, 0.2, 0.04, 'bandpass', 2500, 2, 0.005);
        break;
      }
      case 'hurt': if (this.throttle('hurt', 200)) { const d = this.out(v, 0.2); this.tone1(d, 0.4, 0.22, 'sawtooth', 190, 120); this.noise1(d, 0.4, 0.15, 'bandpass', 700, 3); this.tone1(d, 0.5, 0.15, 'sine', 90, 50); } break;
      case 'heart': { const d = this.out(v, 0); this.tone1(d, 0.7, 0.12, 'sine', 60, 40); this.tone1(d, 0.5, 0.12, 'sine', 55, 38, 0.2); break; }
      case 'down': { const d = this.out(v, 0.5); this.tone1(d, 0.5, 1.0, 'sawtooth', 220, 60); this.noise1(d, 0.4, 0.6, 'lowpass', 600, 1, 0.05); break; }
      case 'buy': { const d = this.out(v * 0.6, 0.4); this.tone1(d, 0.4, 0.12, 'sine', 660, 660); this.tone1(d, 0.4, 0.3, 'sine', 990, 990, 0.1); break; }
      case 'nomoney': { const d = this.out(v * 0.6, 0.1); this.tone1(d, 0.4, 0.2, 'square', 110, 100); break; }
      case 'empty': if (this.throttle('empty', 200)) this.click(this.out(v * 0.8, 0.1), 0.6, 0, 3600); break;
      // Nachladen in Einzelschritten
      case 'magOut': { const d = this.out(v * 0.8, 0.15); this.click(d, 0.5, 0, 2200); this.noise1(d, 0.35, 0.12, 'bandpass', 1400, 2, 0.02); break; }
      case 'magIn': { const d = this.out(v * 0.8, 0.15); this.noise1(d, 0.3, 0.06, 'bandpass', 1200, 2); this.click(d, 0.8, 0.06, 1700); break; }
      case 'rack': { const d = this.out(v * 0.8, 0.15); this.click(d, 0.7, 0, 2800); this.noise1(d, 0.3, 0.08, 'bandpass', 2000, 3, 0.02); this.click(d, 0.8, 0.12, 2400); break; }
      case 'shell': { const d = this.out(v * 0.7, 0.1); this.click(d, 0.5, 0, 1900); this.tone1(d, 0.15, 0.08, 'sine', 2600, 2500, 0.01); break; }
      case 'pump': { const d = this.out(v * 0.8, 0.2); this.noise1(d, 0.5, 0.07, 'bandpass', 1100, 3); this.click(d, 0.7, 0.05, 1500); this.noise1(d, 0.5, 0.07, 'bandpass', 1300, 3, 0.14); this.click(d, 0.8, 0.2, 1900); break; }
      case 'brass': if (this.throttle('brass', 60)) { const d = this.out(v * 0.35, 0.1); this.tone1(d, 0.2, 0.15, 'sine', 4200 + Math.random() * 800, 4000, 0.25); this.tone1(d, 0.12, 0.1, 'sine', 3800, 3700, 0.38); } break;
      case 'swap': { const d = this.out(v * 0.7, 0.1); this.noise1(d, 0.3, 0.1, 'bandpass', 1500, 2); this.click(d, 0.5, 0.12, 2000); break; }
      case 'round': {
        const d = this.out(v * 0.8, 1);
        [110, 131, 165].forEach((f, i) => this.tone1(d, 0.25, 3, 'sine', f, f * 0.98, i * 0.03, 0.02));
        this.tone1(d, 0.2, 3, 'triangle', 55, 52, 0, 0.3);
        this.noise1(d, 0.3, 1.5, 'lowpass', 300, 1, 0.1, 0.3);
        break;
      }
      case 'roundEnd': { const d = this.out(v * 0.6, 1); [220, 185, 147].forEach((f, i) => this.tone1(d, 0.25, 1.4, 'sine', f, f, i * 0.4, 0.02)); break; }
      case 'power': { const d = this.out(v, 0.8); this.tone1(d, 0.4, 1.8, 'sawtooth', 45, 420, 0, 0.05); this.noise1(d, 0.4, 1.5, 'lowpass', 600, 1, 0, 0.1, 3000); this.tone1(d, 0.2, 3, 'sine', 60, 60, 1.6, 0.2); break; }
      case 'powerup': { const d = this.out(v * 0.7, 0.6); [523, 659, 784, 1046].forEach((f, i) => this.tone1(d, 0.25, 0.25, 'triangle', f, f, i * 0.08)); break; }
      case 'part': { const d = this.out(v * 0.6, 0.6); this.tone1(d, 0.25, 0.15, 'sine', 1200, 1200); this.tone1(d, 0.25, 0.4, 'sine', 1800, 1800, 0.1); break; }
      case 'perk': { const d = this.out(v * 0.7, 0.3); this.noise1(d, 0.4, 0.5, 'bandpass', 500, 3, 0, 0.05, 300); [392, 523, 659].forEach((f, i) => this.tone1(d, 0.2, 0.3, 'triangle', f, f, 0.5 + i * 0.1)); break; }
      case 'upgrade': { const d = this.out(v * 0.8, 0.8); this.tone1(d, 0.4, 1.3, 'sawtooth', 90, 900, 0, 0.05); this.noise1(d, 0.6, 0.7, 'lowpass', 700, 1, 1.2); break; }
      case 'box': {
        const d = this.out(v * 0.6, 0.8);
        for (let i = 0; i < 12; i++) { const f = [523, 659, 784, 659][i % 4] * (i % 8 < 4 ? 1 : 1.12); this.tone1(d, 0.18, 0.25, 'triangle', f, f, i * 0.24); }
        break;
      }
      case 'abil': { const d = this.out(v * 0.7, 0.6); this.tone1(d, 0.3, 0.5, 'sine', 300, 900); break; }
      case 'over': { const d = this.out(v, 1); [196, 165, 131, 98].forEach((f, i) => this.tone1(d, 0.35, 1.2, 'sawtooth', f, f * 0.97, i * 0.45, 0.05)); break; }
      // altes Stöhnen (2D-Ansicht) = Knurren
      case 'groan': this.play('growl', v); break;
      case 'reload': this.play('magOut', v); break;
    }
  }
}
