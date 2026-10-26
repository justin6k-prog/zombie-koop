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
    this.fps = false;       // Ich-Perspektive
    this.look = null;       // Touch zum Umsehen { id, lx }
    this.fireTouch = null;  // Feuerknopf, kann gleichzeitig zum Umsehen gezogen werden
    this.sens = 0.0085;
    this.onView = null;
    this.onBag = null;
    this.cmds = [];         // Befehle, bis der Host sie bestätigt hat
    this.cmdN = 0;
    addEventListener('mousemove', e => {
      if (this.fps && document.pointerLockElement === canvas) this.state.a += e.movementX * 0.0025;
    });

    const o = { passive: false };
    canvas.addEventListener('touchstart', e => this.touchStart(e), o);
    canvas.addEventListener('touchmove', e => this.touchMove(e), o);
    canvas.addEventListener('touchend', e => this.touchEnd(e), o);
    canvas.addEventListener('touchcancel', e => this.touchEnd(e), o);
    addEventListener('keydown', e => this.key(e, true));
    addEventListener('keyup', e => this.key(e, false));
    canvas.addEventListener('mousemove', e => { this.mouse = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener('mousedown', e => {
      if (this.fps && document.pointerLockElement === canvas) { if (e.button === 0) this.mouseDown = true; return; }
      this.mouse = { x: e.clientX, y: e.clientY };
      const b = this.hitButton(e.clientX, e.clientY);
      if (b) this.pressButton(b);
      else if (this.fps && document.pointerLockElement !== canvas) {
        try { canvas.requestPointerLock(); } catch (err) {}
      } else if (e.button === 0) this.mouseDown = true;
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
    else if (name === 'view' && this.onView) this.onView();
    else if (name === 'bag' && this.onBag) this.onBag();
    else if (name === 'qmed') this.cmd({ op: 'quick', k: 'medkit' });
    else if (name === 'qgren') this.cmd({ op: 'quick', k: 'grenade' });
  }

  // Inventar-/Fähigkeiten-Befehl; wird wiederholt mitgeschickt, bis der Host ihn bestätigt
  cmd(c) { c.n = ++this.cmdN; this.cmds.push(c); }
  ack(n) { if (this.cmds.length && this.cmds[0].n <= n) this.cmds = this.cmds.filter(c => c.n > n); }

  setFps(on) {
    this.fps = on;
    this.move = this.aim = this.look = this.fireTouch = null;
    this.state.fire = false;
    this.mouseDown = false;
    if (!on && document.pointerLockElement) document.exitPointerLock();
  }

  touchStart(e) {
    e.preventDefault();
    this.touchUsed = true;
    for (const t of e.changedTouches) {
      const b = this.hitButton(t.clientX, t.clientY);
      if (b === 'fire') { this.fireTouch = { id: t.identifier, lx: t.clientX }; this.held[t.identifier] = b; continue; }
      if (b) { this.held[t.identifier] = b; this.pressButton(b); continue; }
      const st = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY };
      if (t.clientX < innerWidth / 2) { if (!this.move) this.move = st; }
      else if (this.fps) { if (!this.look) this.look = { id: t.identifier, lx: t.clientX }; }
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
      for (const lk of [this.look, this.fireTouch]) {
        if (lk && lk.id === t.identifier) { this.state.a += (t.clientX - lk.lx) * this.sens; lk.lx = t.clientX; }
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
      if (this.look && this.look.id === t.identifier) this.look = null;
      if (this.fireTouch && this.fireTouch.id === t.identifier) this.fireTouch = null;
    }
    this.update();
  }

  key(e, down) {
    // Tippen im Code-Feld ist keine Spielsteuerung
    if (e.target && e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (down && !this.keys[k]) {
      if (k === 'e' || k === 'f') this.state.use++;
      if (k === 'q') this.state.abil++;
      if (k === '1' || k === '2' || k === 'tab') this.state.swap++;
      if (k === 'r') this.state.reload++;
      if (k === 'v' && this.onView) this.onView();
      if ((k === 'i' || k === 'b' || k === 'k') && this.onBag) this.onBag(k === 'k' ? 'skills' : 'inv');
      if (k === 'h') this.cmd({ op: 'quick', k: 'medkit' });
      if (k === 'g') this.cmd({ op: 'quick', k: 'grenade' });
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
    // Ich-Perspektive: Bewegung relativ zur Blickrichtung
    if (this.fps) {
      const fwd = -s.my, side = s.mx, a = s.a;
      s.mx = Math.cos(a) * fwd - Math.sin(a) * side;
      s.my = Math.sin(a) * fwd + Math.cos(a) * side;
      s.fire = this.touchUsed ? !!this.fireTouch : this.mouseDown;
      return;
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
    if (!this.fps && !this.aim && this.mouse && !this.touchUsed) {
      this.state.a = Math.atan2(this.mouse.y - this.playerScreen.y, this.mouse.x - this.playerScreen.x);
    }
    this.update();
  }

  packet() {
    const s = this.state;
    const p = { mx: +s.mx.toFixed(2), my: +s.my.toFixed(2), a: +s.a.toFixed(3), fire: s.fire, use: s.use, useHeld: s.useHeld, abil: s.abil, swap: s.swap, reload: s.reload };
    if (this.cmds.length) p.cm = this.cmds;
    return p;
  }
}
