// Steuerung: zwei Touch-Joysticks + Knöpfe, am PC WASD + Maus
class Input {
  constructor(canvas) {
    this.cv = canvas;
    this.move = null;   // { id, ox, oy, x, y }
    this.aim = null;
    this.buttons = {};  // name -> { x, y, r } bzw. { x, y, w, h }
    this.held = {};     // Touch-ID -> Knopfname
    this.state = { mx: 0, my: 0, a: -Math.PI / 2, fire: false, use: 0, useHeld: false, abil: 0, swap: 0, reload: 0 };
    this.keys = {};
    this.mouse = null;
    this.mouseDown = false;
    this.playerScreen = { x: 0, y: 0 };
    this.touchUsed = false;
    this.R = 60;

    const o = { passive: false };
    canvas.addEventListener('touchstart', e => this.touchStart(e), o);
    canvas.addEventListener('touchmove', e => this.touchMove(e), o);
    canvas.addEventListener('touchend', e => this.touchEnd(e), o);
    canvas.addEventListener('touchcancel', e => this.touchEnd(e), o);
    addEventListener('keydown', e => this.key(e, true));
    addEventListener('keyup', e => this.key(e, false));
    canvas.addEventListener('mousemove', e => { this.mouse = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener('mousedown', e => {
      this.mouse = { x: e.clientX, y: e.clientY };
      const b = this.hitButton(e.clientX, e.clientY);
      if (b) this.pressButton(b);
      else if (e.button === 0) this.mouseDown = true;
    });
    addEventListener('mouseup', () => { this.mouseDown = false; this.state.useHeld = !!this.keys.e; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', () => this.state.swap++, { passive: true });
  }

  hitButton(x, y) {
    for (const [name, b] of Object.entries(this.buttons)) {
      if (!b || b.hidden) continue;
      if (b.r ? Math.hypot(x - b.x, y - b.y) < b.r + 10 : (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)) return name;
    }
    return null;
  }

  pressButton(name) {
    const s = this.state;
    if (name === 'use') { s.use++; s.useHeld = true; }
    else if (name === 'abil') s.abil++;
    else if (name === 'weapon') s.swap++;
    else if (name === 'reload') s.reload++;
  }

  touchStart(e) {
    e.preventDefault();
    this.touchUsed = true;
    for (const t of e.changedTouches) {
      const b = this.hitButton(t.clientX, t.clientY);
      if (b) { this.held[t.identifier] = b; this.pressButton(b); continue; }
      const st = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY };
      if (t.clientX < innerWidth / 2) { if (!this.move) this.move = st; }
      else if (!this.aim) this.aim = st;
    }
    this.update();
  }

  touchMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      for (const st of [this.move, this.aim]) {
        if (st && st.id === t.identifier) { st.x = t.clientX; st.y = t.clientY; }
      }
    }
    this.update();
  }

  touchEnd(e) {
    for (const t of e.changedTouches) {
      if (this.held[t.identifier] === 'use') this.state.useHeld = false;
      delete this.held[t.identifier];
      if (this.move && this.move.id === t.identifier) this.move = null;
      if (this.aim && this.aim.id === t.identifier) this.aim = null;
    }
    this.update();
  }

  key(e, down) {
    const k = e.key.toLowerCase();
    if (down && !this.keys[k]) {
      if (k === 'e' || k === 'f') this.state.use++;
      if (k === 'q') this.state.abil++;
      if (k === '1' || k === '2' || k === 'tab') this.state.swap++;
      if (k === 'r') this.state.reload++;
    }
    this.keys[k] = down;
    if (k === 'tab') e.preventDefault();
    this.state.useHeld = !!(this.keys.e || this.keys.f);
    this.update();
  }

  stickVec(st) {
    let dx = st.x - st.ox, dy = st.y - st.oy;
    const len = Math.hypot(dx, dy);
    if (len > this.R) {
      // Joystick wandert mit, wenn man weiter zieht
      st.ox = st.x - dx / len * this.R; st.oy = st.y - dy / len * this.R;
      dx = dx / len * this.R; dy = dy / len * this.R;
    }
    return { x: dx / this.R, y: dy / this.R, len: Math.min(1, len / this.R) };
  }

  update() {
    const s = this.state;
    if (this.move) {
      const v = this.stickVec(this.move);
      const dead = v.len < 0.12;
      s.mx = dead ? 0 : v.x; s.my = dead ? 0 : v.y;
    } else {
      const k = this.keys;
      let dx = (k.d || k.arrowright ? 1 : 0) - (k.a || k.arrowleft ? 1 : 0);
      let dy = (k.s || k.arrowdown ? 1 : 0) - (k.w || k.arrowup ? 1 : 0);
      const l = Math.hypot(dx, dy) || 1;
      s.mx = dx / l; s.my = dy / l;
    }
    if (this.aim) {
      const v = this.stickVec(this.aim);
      if (v.len > 0.15) s.a = Math.atan2(v.y, v.x);
      s.fire = v.len > 0.35;
    } else if (!this.touchUsed) {
      s.fire = this.mouseDown;
    } else s.fire = false;
  }

  // Jedes Bild: Mausrichtung relativ zur eigenen Figur
  frame() {
    if (!this.aim && this.mouse && !this.touchUsed) {
      this.state.a = Math.atan2(this.mouse.y - this.playerScreen.y, this.mouse.x - this.playerScreen.x);
    }
    this.update();
  }

  packet() {
    const s = this.state;
    return { mx: +s.mx.toFixed(2), my: +s.my.toFixed(2), a: +s.a.toFixed(3), fire: s.fire, use: s.use, useHeld: s.useHeld, abil: s.abil, swap: s.swap, reload: s.reload };
  }
}
