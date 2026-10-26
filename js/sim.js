// Spiel-Logik. Läuft nur beim Host, kein DOM – dadurch auch ohne Browser testbar.

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

// Kreis aus Rechtecken herausschieben
function pushOut(e, r, rects) {
  for (const b of rects) {
    const cx = clamp(e.x, b.x, b.x + b.w), cy = clamp(e.y, b.y, b.y + b.h);
    const dx = e.x - cx, dy = e.y - cy, d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      e.x = cx + dx / d * r; e.y = cy + dy / d * r;
    } else {
      const l = e.x - b.x, rr = b.x + b.w - e.x, t = e.y - b.y, bo = b.y + b.h - e.y, m = Math.min(l, rr, t, bo);
      if (m === l) e.x = b.x - r; else if (m === rr) e.x = b.x + b.w + r; else if (m === t) e.y = b.y - r; else e.y = b.y + b.h + r;
    }
  }
}

// Strahl gegen Rechteck: Entfernung bis zum Eintritt oder Infinity
function rayRect(x, y, dx, dy, b) {
  let t0 = 0, t1 = Infinity;
  if (Math.abs(dx) < 1e-9) { if (x < b.x || x > b.x + b.w) return Infinity; }
  else {
    let a = (b.x - x) / dx, c = (b.x + b.w - x) / dx;
    if (a > c) { const s = a; a = c; c = s; }
    if (a > t0) t0 = a;
    if (c < t1) t1 = c;
    if (t0 > t1) return Infinity;
  }
  if (Math.abs(dy) < 1e-9) { if (y < b.y || y > b.y + b.h) return Infinity; }
  else {
    let a = (b.y - y) / dy, c = (b.y + b.h - y) / dy;
    if (a > c) { const s = a; a = c; c = s; }
    if (a > t0) t0 = a;
    if (c < t1) t1 = c;
    if (t0 > t1) return Infinity;
  }
  return t0;
}

// Strahl gegen Kreis
function rayCircle(x, y, dx, dy, cx, cy, r) {
  const fx = x - cx, fy = y - cy;
  const b = fx * dx + fy * dy, c = fx * fx + fy * fy - r * r;
  const disc = b * b - c;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : (c < 0 ? 0 : Infinity);
}

// Wegfindung: Raster, Entfernungsfeld von allen Spielern aus
const CELL = 25;
class Nav {
  constructor() {
    this.cols = Math.ceil(MAP_W / CELL); this.rows = Math.ceil(MAP_H / CELL);
    this.block = new Uint8Array(this.cols * this.rows);
    this.dist = new Int32Array(this.cols * this.rows);
    this.queue = new Int32Array(this.cols * this.rows);
  }
  rebuild(solids) {
    const pad = 6;
    this.block.fill(0);
    for (const s of solids) {
      const c0 = Math.max(0, Math.floor((s.x - pad) / CELL)), c1 = Math.min(this.cols - 1, Math.floor((s.x + s.w + pad) / CELL));
      const r0 = Math.max(0, Math.floor((s.y - pad) / CELL)), r1 = Math.min(this.rows - 1, Math.floor((s.y + s.h + pad) / CELL));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.block[r * this.cols + c] = 1;
    }
  }
  cellOf(x, y) {
    return clamp(Math.floor(y / CELL), 0, this.rows - 1) * this.cols + clamp(Math.floor(x / CELL), 0, this.cols - 1);
  }
  flow(targets) {
    const { dist, queue, block, cols, rows } = this;
    dist.fill(-1);
    let head = 0, tail = 0;
    for (const t of targets) {
      const i = this.cellOf(t.x, t.y);
      if (dist[i] === -1) { dist[i] = 0; queue[tail++] = i; }
    }
    while (head < tail) {
      const i = queue[head++], c = i % cols, r = (i / cols) | 0, d = dist[i] + 1;
      if (c > 0 && !block[i - 1] && dist[i - 1] === -1) { dist[i - 1] = d; queue[tail++] = i - 1; }
      if (c < cols - 1 && !block[i + 1] && dist[i + 1] === -1) { dist[i + 1] = d; queue[tail++] = i + 1; }
      if (r > 0 && !block[i - cols] && dist[i - cols] === -1) { dist[i - cols] = d; queue[tail++] = i - cols; }
      if (r < rows - 1 && !block[i + cols] && dist[i + cols] === -1) { dist[i + cols] = d; queue[tail++] = i + cols; }
    }
  }
  // Richtung zur Nachbarzelle mit kleinster Entfernung
  dir(x, y) {
    const { dist, block, cols, rows } = this;
    const c = clamp(Math.floor(x / CELL), 0, cols - 1), r = clamp(Math.floor(y / CELL), 0, rows - 1);
    let best = -1, bd = dist[r * cols + c] === -1 ? 1e9 : dist[r * cols + c];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const i = nr * cols + nc;
      if (block[i] || dist[i] === -1) continue;
      if (dr && dc && (block[r * cols + nc] || block[nr * cols + c])) continue;
      if (dist[i] < bd) { bd = dist[i]; best = i; }
    }
    if (best < 0) return null;
    const tx = (best % cols + 0.5) * CELL, ty = (((best / cols) | 0) + 0.5) * CELL;
    const dx = tx - x, dy = ty - y, l = Math.hypot(dx, dy) || 1;
    return { x: dx / l, y: dy / l };
  }
}

class Game {
  constructor() {
    this.map = buildMap();
    this.nav = new Nav();
    this.players = {};
    this.zombies = [];
    this.turrets = [];
    this.powerups = [];
    this.events = [];
    this.round = 0;
    this.phase = 'pre'; this.phaseT = 6;
    this.toSpawn = 0; this.spawnT = 0;
    this.nextId = 1;
    this.power = false;
    this.partsHave = 0;
    const spots = this.map.partSpots.slice().sort(() => Math.random() - 0.5);
    this.parts = PART_NAMES.map((name, i) => ({ i, x: spots[i][0], y: spots[i][1], taken: false }));
    this.box = { s: 'idle', t: 0, w: null, owner: null };
    this.insta = 0; this.double = 0; this.puRound = 0;
    this.navT = 0;
    this.time = 0;
    this.rebuildSolids();
  }

  rebuildSolids() {
    const m = this.map;
    const closed = m.doors.filter(d => !d.open).map(d => d.rect);
    this.navSolids = m.walls.concat(closed, m.decor);
    this.bulletSolids = this.navSolids;
    this.nav.rebuild(this.navSolids);
    this.navT = 0;
  }

  ev(e) { this.events.push(e); }

  addPlayer(id, cls) {
    const n = Object.keys(this.players).length;
    const sp = this.map.spawn[n % this.map.spawn.length];
    const p = {
      id, num: n + 1, cls, x: sp[0], y: sp[1], a: -Math.PI / 2,
      hp: CFG.PLAYER_HP, maxHp: CFG.PLAYER_HP, state: 0, pts: 500, kills: 0, downs: 0, revives: 0,
      slots: [], cur: 0, fireT: 0, reloadT: 0, reloadDur: 0, idleFire: 0, knifeT: 0,
      perks: {}, hurtT: 9, bleedT: 0, reviveProg: 0, abilCd: 0, rageT: 0, repairT: 0, repairPts: 0,
      firing: false, prompt: null,
      inp: { mx: 0, my: 0, a: -Math.PI / 2, fire: false, use: 0, useHeld: false, abil: 0, swap: 0, reload: 0 },
      seen: { use: 0, abil: 0, swap: 0, reload: 0 },
    };
    this.giveWeapon(p, 'pistol', false);
    // Wer mitten im Spiel dazukommt, steigt in der nächsten Runde ein
    if (this.round > 0) { p.state = 2; p.hp = 0; }
    this.players[id] = p;
    return p;
  }

  removePlayer(id) { delete this.players[id]; }

  setInput(id, inp) {
    const p = this.players[id];
    if (p) Object.assign(p.inp, inp);
  }

  alivePlayers() { return Object.values(this.players).filter(p => p.state === 0); }

  // ---------- Hauptschleife ----------
  update(dt) {
    if (this.phase === 'over') return;
    this.time += dt;
    const pl = Object.values(this.players);
    if (!pl.length) return;

    if (this.phase === 'pre' || this.phase === 'break') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) this.startRound();
    } else if (this.phase === 'active') {
      this.spawnT -= dt;
      const maxAlive = Math.min(36, 24 + 6 * (pl.length - 1));
      if (this.toSpawn > 0 && this.spawnT <= 0 && this.zombies.length < maxAlive) {
        this.spawnZombie(this.pickType());
        this.toSpawn--;
        this.spawnT = Math.max(0.5, 2.0 - 0.15 * (this.round - 1));
      }
      if (this.toSpawn === 0 && this.zombies.length === 0) {
        this.phase = 'break'; this.phaseT = 8;
        this.ev({ k: 'roundEnd', r: this.round });
      }
    }

    if (this.insta > 0) this.insta -= dt;
    if (this.double > 0) this.double -= dt;

    this.navT -= dt;
    if (this.navT <= 0) {
      const alive = this.alivePlayers();
      if (alive.length) this.nav.flow(alive);
      this.navT = 0.25;
    }

    for (const p of pl) this.updatePlayer(p, dt);
    this.updateZombies(dt);
    this.updateTurrets(dt);
    this.updatePowerups(dt);
    this.updateBox(dt);

    if (!pl.some(p => p.state === 0)) {
      this.phase = 'over';
      this.ev({ k: 'over', r: this.round });
    }
  }

  // ---------- Runden ----------
  startRound() {
    this.round++;
    const np = Object.keys(this.players).length;
    const r = this.round;
    this.toSpawn = Math.round((4 + 3 * r + 0.18 * r * r) * (1 + 0.5 * (np - 1)));
    this.spawnT = 1;
    this.puRound = 0;
    this.phase = 'active';
    for (const p of Object.values(this.players)) {
      p.repairPts = 0;
      if (p.state === 2) this.respawn(p);
    }
    if (r % 5 === 0) this.spawnZombie(3);
    this.ev({ k: 'round', r });
  }

  respawn(p) {
    const sp = this.map.spawn[(p.num - 1) % this.map.spawn.length];
    p.x = sp[0]; p.y = sp[1];
    p.state = 0; p.maxHp = CFG.PLAYER_HP; p.hp = p.maxHp; p.perks = {};
    p.slots = []; this.giveWeapon(p, 'pistol', false);
  }

  zombieHp() {
    const r = this.round;
    return r < 10 ? 100 + 90 * (r - 1) : 820 * Math.pow(1.1, r - 9);
  }

  pickType() {
    const r = this.round, x = Math.random();
    const brute = r >= 4 ? Math.min(0.15, 0.03 * (r - 3)) : 0;
    const runner = r >= 3 ? Math.min(0.5, 0.07 * (r - 2)) : 0;
    if (x < brute) return 2;
    if (x < brute + runner) return 1;
    return 0;
  }

  spawnZombie(type) {
    const m = this.map;
    const alive = this.alivePlayers();
    const open = m.windows.filter(w => m.rooms[w.room].open);
    const near = open.filter(w => alive.some(p => dist2(p.x, p.y, w.x, w.y) < 1100 * 1100));
    const pool = near.length ? near : open;
    const w = pool[(Math.random() * pool.length) | 0];
    const t = ZTYPES[type];
    const jitter = (Math.random() - 0.5) * 40;
    const hp = this.zombieHp() * t.hpMul;
    const speed = type === 0 ? t.speed + Math.min(55, 6 * (this.round - 1)) + Math.random() * 10 : t.speed + Math.random() * 10;
    this.zombies.push({
      id: this.nextId++, type, x: w.spawnX + (w.horizontal ? jitter : 0), y: w.spawnY + (w.horizontal ? 0 : jitter),
      a: 0, hp, maxHp: hp, speed, attT: 0.5, tearT: 1, att: 0,
    });
  }

  // ---------- Spieler ----------
  giveWeapon(p, id, up) {
    const s = weaponStats(id, up);
    const own = p.slots.findIndex(x => x.id === id);
    const slot = { id, up, mag: s.mag, res: s.res };
    if (own >= 0) { p.slots[own] = slot; p.cur = own; }
    else if (p.slots.length < 2) { p.slots.push(slot); p.cur = p.slots.length - 1; }
    else p.slots[p.cur] = slot;
    p.reloadT = 0;
  }

  addPts(p, n) { p.pts += this.double > 0 && n > 0 ? n * 2 : n; }

  updatePlayer(p, dt) {
    const inp = p.inp;
    p.hurtT += dt;
    if (p.abilCd > 0) p.abilCd -= dt;
    if (p.rageT > 0) p.rageT -= dt;
    if (p.knifeT > 0) p.knifeT -= dt;

    if (p.state === 2) { p.prompt = null; return; }

    // Bewegung
    let mx = inp.mx || 0, my = inp.my || 0;
    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    const sp = p.state === 1 ? CFG.DOWN_SPEED : CFG.PLAYER_SPEED;
    p.x += mx * sp * dt; p.y += my * sp * dt;
    pushOut(p, CFG.PLAYER_R, this.navSolids);
    for (const w of this.map.windows) pushOut(p, CFG.PLAYER_R, [w.rect]);
    p.x = clamp(p.x, 20, MAP_W - 20); p.y = clamp(p.y, 20, MAP_H - 20);
    if (typeof inp.a === 'number' && isFinite(inp.a)) p.a = inp.a;

    if (p.state === 1) {
      p.bleedT -= dt;
      p.firing = false;
      if (p.bleedT <= 0) { p.state = 2; p.hp = 0; this.ev({ k: 'dead', id: p.id }); }
      p.prompt = null;
      return;
    }

    // Lebensregeneration
    if (p.hurtT > CFG.REGEN_DELAY && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + CFG.REGEN_RATE * dt);

    // Waffe wechseln / nachladen
    if (inp.swap !== p.seen.swap) {
      p.seen.swap = inp.swap;
      if (p.slots.length > 1) { p.cur = (p.cur + 1) % p.slots.length; p.reloadT = 0; this.ev({ k: 'swap', id: p.id }); }
    }
    const slot = p.slots[p.cur];
    const ws = weaponStats(slot.id, slot.up);
    if (p.reloadT > 0) {
      p.reloadT -= dt;
      if (p.reloadT <= 0) {
        const need = ws.mag - slot.mag, take = Math.min(need, slot.res);
        slot.mag += take; slot.res -= take;
      }
    }
    const wantReload = inp.reload !== p.seen.reload;
    p.seen.reload = inp.reload;
    if (p.reloadT <= 0 && p.rageT <= 0 && slot.mag < ws.mag && slot.res > 0 &&
        (wantReload || slot.mag === 0 || (p.idleFire > 1.5 && slot.mag < ws.mag))) {
      p.reloadDur = ws.reload * (p.perks.speed ? 0.5 : 1);
      p.reloadT = p.reloadDur;
      this.ev({ k: 'reload', id: p.id });
    }

    // Fähigkeit
    if (inp.abil !== p.seen.abil) {
      p.seen.abil = inp.abil;
      if (p.abilCd <= 0) this.useAbility(p);
    }

    // Schießen / Messer
    p.firing = !!inp.fire;
    if (p.firing) p.idleFire = 0; else p.idleFire += dt;
    p.fireT = Math.max(p.fireT - dt, p.firing ? -1 : 0);
    if (p.firing && p.knifeT <= 0) {
      const z = this.knifeTarget(p);
      if (z) {
        p.knifeT = 0.7;
        this.ev({ k: 'knife', x: p.x | 0, y: p.y | 0, a: +p.a.toFixed(2) });
        this.damageZombie(z, CFG.KNIFE_DMG, p, true, { a: p.a, w: 'knife' });
        p.fireT = Math.max(p.fireT, 0.3);
      }
    }
    const rage = p.rageT > 0;
    while (p.firing && p.fireT <= 0 && p.reloadT <= 0 && p.knifeT <= 0.4 && (slot.mag > 0 || rage)) {
      this.shoot(p, slot, ws);
      if (!rage) slot.mag--;
      p.fireT += 1 / (ws.rof * (p.perks.dtap ? 1.33 : 1) * (rage ? 1.25 : 1));
    }
    if (p.firing && slot.mag === 0 && slot.res === 0 && p.fireT <= 0 && !rage) {
      p.fireT = 0.4;
      this.ev({ k: 'empty', id: p.id });
    }

    // Teile aufsammeln
    for (const part of this.parts) {
      if (!part.taken && dist2(p.x, p.y, part.x, part.y) < 35 * 35) {
        part.taken = true; this.partsHave++;
        this.ev({ k: 'part', n: PART_NAMES[part.i], have: this.partsHave });
      }
    }
    // Power-ups aufsammeln
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const u = this.powerups[i];
      if (dist2(p.x, p.y, u.x, u.y) < 36 * 36) { this.powerups.splice(i, 1); this.applyPowerup(u.kind); }
    }

    this.interact(p, dt);
  }

  knifeTarget(p) {
    let best = null, bd = Infinity;
    for (const z of this.zombies) {
      const r = CFG.PLAYER_R + ZTYPES[z.type].r + CFG.KNIFE_RANGE;
      const d2 = dist2(p.x, p.y, z.x, z.y);
      if (d2 > r * r || d2 >= bd) continue;
      if (Math.abs(angDiff(Math.atan2(z.y - p.y, z.x - p.x), p.a)) > 1.1) continue;
      best = z; bd = d2;
    }
    return best;
  }

  dmgMul(p) { return p.cls === 'soldat' ? 1.15 : 1; }

  shoot(p, slot, ws) {
    const mul = this.dmgMul(p);
    const gx = p.x + Math.cos(p.a) * 22, gy = p.y + Math.sin(p.a) * 22;
    if (ws.cone) {
      // Flammenwerfer: alles im Kegel
      for (const z of this.zombies.slice()) {
        const d2 = dist2(gx, gy, z.x, z.y);
        if (d2 > ws.range * ws.range) continue;
        if (Math.abs(angDiff(Math.atan2(z.y - gy, z.x - gx), p.a)) > ws.cone) continue;
        if (!this.los(gx, gy, z.x, z.y)) continue;
        this.damageZombie(z, ws.dmg * mul, p, false, { a: Math.atan2(z.y - gy, z.x - gx), w: 'flame' });
      }
      this.ev({ k: 'flame', id: p.id, x: gx | 0, y: gy | 0, a: +p.a.toFixed(2), up: slot.up ? 1 : 0 });
      return;
    }
    for (let i = 0; i < ws.pellets; i++) {
      const a = p.a + (Math.random() - 0.5) * 2 * ws.spread;
      const dx = Math.cos(a), dy = Math.sin(a);
      let wallT = ws.range;
      for (const s of this.bulletSolids) {
        const t = rayRect(gx, gy, dx, dy, s);
        if (t < wallT) wallT = t;
      }
      const hits = [];
      for (const z of this.zombies) {
        const t = rayCircle(gx, gy, dx, dy, z.x, z.y, ZTYPES[z.type].r);
        if (t < wallT) hits.push([t, z]);
      }
      hits.sort((a, b) => a[0] - b[0]);
      let endT = wallT;
      const n = Math.min(hits.length, ws.pierce);
      if (ws.splash) {
        endT = hits.length ? hits[0][0] : wallT;
        this.explode(gx + dx * endT, gy + dy * endT, ws.splash, ws.dmg * mul, p);
      } else {
        for (let h = 0; h < n; h++) this.damageZombie(hits[h][1], ws.dmg * mul, p, false, { a, w: slot.id, x: gx + dx * hits[h][0], y: gy + dy * hits[h][0] });
        if (n && n === ws.pierce) endT = hits[n - 1][0];
      }
      this.ev({ k: 'shot', w: slot.id, up: slot.up ? 1 : 0, x: gx | 0, y: gy | 0, x2: (gx + dx * endT) | 0, y2: (gy + dy * endT) | 0, id: p.id });
    }
  }

  explode(x, y, r, dmg, p) {
    for (const z of this.zombies.slice()) {
      if (dist2(x, y, z.x, z.y) < (r + ZTYPES[z.type].r) ** 2) this.damageZombie(z, dmg, p, false, { a: Math.atan2(z.y - y, z.x - x), w: 'boom' });
    }
    this.ev({ k: 'boom', x: x | 0, y: y | 0, r: r | 0 });
  }

  los(x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy);
    if (l < 1) return true;
    for (const s of this.bulletSolids) if (rayRect(x1, y1, dx / l, dy / l, s) < l) return false;
    return true;
  }

  // hit: { a: Schussrichtung, w: Waffe, x/y: Einschussstelle } für Blut und Gliedmaßen
  damageZombie(z, dmg, p, knife, hit = {}) {
    if (z.hp <= 0) return;
    if (this.insta > 0) dmg = z.type === 3 ? dmg * 5 : z.hp;
    z.hp -= dmg;
    const ha = hit.a !== undefined ? hit.a : z.a + Math.PI;
    this.ev({ k: 'hit', x: (hit.x !== undefined ? hit.x : z.x) | 0, y: (hit.y !== undefined ? hit.y : z.y) | 0, a: +ha.toFixed(2), zi: z.id, d: Math.round(dmg), w: hit.w || '' });
    if (z.hp > 0) { if (p) this.addPts(p, CFG.PTS_HIT); return; }
    const i = this.zombies.indexOf(z);
    if (i >= 0) this.zombies.splice(i, 1);
    if (p) { this.addPts(p, knife ? CFG.PTS_KNIFE : CFG.PTS_KILL); p.kills++; }
    this.ev({ k: 'kill', x: z.x | 0, y: z.y | 0, t: z.type, a: +z.a.toFixed(2), ba: +ha.toFixed(2), zi: z.id, w: hit.w || '', d: Math.round(dmg) });
    if (z.type === 3) this.dropPowerup(z.x, z.y, 'ammo');
    else if (this.puRound < 4 && Math.random() < 0.03) {
      const kinds = Object.keys(POWERUPS);
      this.dropPowerup(z.x, z.y, kinds[(Math.random() * kinds.length) | 0]);
    }
  }

  damagePlayer(p, dmg) {
    if (p.state !== 0) return;
    p.hp -= dmg; p.hurtT = 0;
    this.ev({ k: 'hurt', id: p.id });
    if (p.hp <= 0) {
      p.hp = 0; p.state = 1; p.bleedT = CFG.BLEED_TIME; p.reviveProg = 0; p.downs++;
      p.perks = {}; p.maxHp = CFG.PLAYER_HP; p.reloadT = 0; p.rageT = 0;
      this.ev({ k: 'down', id: p.id });
    }
  }

  useAbility(p) {
    const c = CLASSES[p.cls];
    p.abilCd = c.cd;
    if (p.cls === 'soldat') p.rageT = c.dur;
    else if (p.cls === 'sani') {
      for (const o of Object.values(this.players)) {
        if (dist2(p.x, p.y, o.x, o.y) > 250 * 250) continue;
        if (o.state === 1) { o.state = 0; p.revives++; this.ev({ k: 'revived', id: o.id }); }
        if (o.state === 0) o.hp = o.maxHp;
      }
    } else if (p.cls === 'tech') {
      const t = { x: p.x + Math.cos(p.a) * 40, y: p.y + Math.sin(p.a) * 40, a: p.a, t: c.dur, fireT: 0, owner: p.id };
      pushOut(t, 14, this.navSolids);
      this.turrets.push(t);
    }
    this.ev({ k: 'abil', id: p.id, c: p.cls, x: p.x | 0, y: p.y | 0 });
  }

  // ---------- Interaktion (Kaufen, Reparieren, Wiederbeleben) ----------
  interact(p, dt) {
    const m = this.map, inp = p.inp, R2 = CFG.USE_RANGE * CFG.USE_RANGE;
    const pressed = inp.use !== p.seen.use;
    p.seen.use = inp.use;
    let best = null, bd = Infinity;
    const cand = (d2, o) => { if (d2 < bd) { bd = d2; best = o; } };

    for (const o of Object.values(this.players)) {
      if (o !== p && o.state === 1) {
        const d2 = dist2(p.x, p.y, o.x, o.y);
        if (d2 < 60 * 60) cand(d2 - 1e6, { kind: 'revive', o, text: 'Halten: Wiederbeleben', hold: 1 });
      }
    }
    for (const w of m.windows) {
      const d2 = dist2(p.x, p.y, w.x, w.y);
      const inside = (p.x - w.x) * w.nx + (p.y - w.y) * w.ny < 0;
      if (d2 < R2 && inside && w.planks < CFG.MAX_PLANKS) cand(d2, { kind: 'repair', w, text: 'Halten: Barrikade reparieren', hold: 1 });
    }
    for (const d of m.doors) {
      if (d.open) continue;
      const d2 = dist2(p.x, p.y, d.x, d.y);
      if (d2 < 90 * 90) cand(d2, { kind: 'door', d, cost: d.cost, text: `Tür öffnen → ${m.rooms[d.opens].name}` });
    }
    for (const b of m.wallbuys) {
      const d2 = dist2(p.x, p.y, b.x, b.y);
      if (d2 >= R2) continue;
      const own = p.slots.find(s => s.id === b.w);
      if (own) cand(d2, { kind: 'ammo', b, cost: Math.round(b.cost / 2), text: `Munition: ${weaponStats(b.w, own.up).name}` });
      else cand(d2, { kind: 'wall', b, cost: b.cost, text: `Kaufen: ${WEAPONS[b.w].name}` });
    }
    for (const k of m.perks) {
      const d2 = dist2(p.x, p.y, k.x, k.y);
      if (d2 >= R2) continue;
      const pk = PERKS[k.p];
      if (!this.power) cand(d2, { kind: 'none', text: `${pk.name} – kein Strom` });
      else if (p.perks[k.p]) cand(d2, { kind: 'none', text: `${pk.name} – schon getrunken` });
      else cand(d2, { kind: 'perk', k, cost: pk.cost, text: `${pk.name}: ${pk.info}` });
    }
    {
      const d2 = dist2(p.x, p.y, m.lever.x, m.lever.y);
      if (d2 < R2) {
        if (this.power) cand(d2, { kind: 'none', text: 'Strom ist an' });
        else if (this.partsHave < 3) cand(d2, { kind: 'none', text: `Strom-Hebel: Teile fehlen (${this.partsHave}/3)` });
        else cand(d2, { kind: 'power', text: 'Strom einschalten' });
      }
    }
    {
      const d2 = dist2(p.x, p.y, m.upgrade.x, m.upgrade.y);
      const slot = p.slots[p.cur];
      if (d2 < R2) {
        if (!this.power) cand(d2, { kind: 'none', text: 'Verstärker – kein Strom' });
        else if (slot.up) cand(d2, { kind: 'none', text: 'Waffe ist schon verbessert' });
        else cand(d2, { kind: 'upgrade', cost: CFG.UPGRADE_COST, text: `Verbessern: ${WEAPONS[slot.id].name}` });
      }
    }
    {
      const d2 = dist2(p.x, p.y, m.box.x, m.box.y);
      if (d2 < R2) {
        const b = this.box;
        if (b.s === 'idle') cand(d2, { kind: 'box', cost: CFG.BOX_COST, text: 'Wunderkiste' });
        else if (b.s === 'offer' && b.owner === p.id) cand(d2, { kind: 'take', text: `Nehmen: ${WEAPONS[b.w].name}` });
      }
    }

    p.prompt = best ? { text: best.text, cost: best.cost || 0, hold: best.hold || 0 } : null;

    // Halten: Wiederbeleben / Reparieren
    if (best && best.kind === 'revive' && inp.useHeld) {
      const speed = (p.cls === 'sani' ? 2 : 1) * (p.perks.revive ? 2 : 1);
      best.o.reviveProg += dt * speed / CFG.REVIVE_TIME;
      if (best.o.reviveProg >= 1) {
        best.o.state = 0; best.o.hp = best.o.maxHp; best.o.reviveProg = 0; p.revives++;
        this.ev({ k: 'revived', id: best.o.id });
      }
    }
    if (best && best.kind === 'repair' && inp.useHeld) {
      p.repairT -= dt;
      if (p.repairT <= 0) {
        p.repairT = p.cls === 'tech' ? 0.3 : 0.6;
        best.w.planks++;
        const pts = CFG.PTS_REPAIR * (p.cls === 'tech' ? 2 : 1);
        if (p.repairPts < CFG.REPAIR_CAP) { this.addPts(p, pts); p.repairPts += pts; }
        this.ev({ k: 'plank', x: best.w.x | 0, y: best.w.y | 0 });
      }
    } else p.repairT = Math.min(p.repairT, 0.15);

    if (!pressed || !best || best.hold) return;
    if (best.cost && p.pts < best.cost) { this.ev({ k: 'nomoney', id: p.id }); return; }
    switch (best.kind) {
      case 'door':
        p.pts -= best.cost; best.d.open = true; m.rooms[best.d.opens].open = true;
        this.rebuildSolids();
        this.ev({ k: 'door', id: best.d.id, x: best.d.x, y: best.d.y });
        break;
      case 'wall':
        p.pts -= best.cost; this.giveWeapon(p, best.b.w, false); this.ev({ k: 'buy', id: p.id });
        break;
      case 'ammo': {
        p.pts -= best.cost;
        const s = p.slots.find(x => x.id === best.b.w), ws = weaponStats(s.id, s.up);
        s.res = ws.res; this.ev({ k: 'buy', id: p.id });
        break;
      }
      case 'perk':
        p.pts -= best.cost; p.perks[best.k.p] = 1;
        if (best.k.p === 'jugg') { p.maxHp = 250; p.hp = 250; }
        this.ev({ k: 'perk', id: p.id, p: best.k.p });
        break;
      case 'power':
        this.power = true; this.ev({ k: 'power' });
        break;
      case 'upgrade': {
        p.pts -= best.cost;
        const s = p.slots[p.cur];
        this.giveWeapon(p, s.id, true);
        this.ev({ k: 'upgrade', id: p.id });
        break;
      }
      case 'box': {
        p.pts -= best.cost;
        const owned = new Set(p.slots.map(s => s.id));
        const pool = [];
        for (const [w, n] of Object.entries(BOX_POOL)) if (!owned.has(w)) for (let i = 0; i < n; i++) pool.push(w);
        this.box = { s: 'spin', t: 3, w: pool[(Math.random() * pool.length) | 0], owner: p.id };
        this.ev({ k: 'box' });
        break;
      }
      case 'take':
        this.giveWeapon(p, this.box.w, false);
        this.box = { s: 'idle', t: 0, w: null, owner: null };
        this.ev({ k: 'buy', id: p.id });
        break;
    }
  }

  updateBox(dt) {
    const b = this.box;
    if (b.s === 'idle') return;
    b.t -= dt;
    if (b.t > 0) return;
    if (b.s === 'spin') { b.s = 'offer'; b.t = 10; }
    else this.box = { s: 'idle', t: 0, w: null, owner: null };
  }

  // ---------- Zombies ----------
  updateZombies(dt) {
    const alive = this.alivePlayers();
    const m = this.map;
    const zs = this.zombies;
    for (const z of zs) {
      const t = ZTYPES[z.type];
      if (z.att > 0) z.att -= dt;
      // Ziel: nächster lebender Spieler
      let tgt = null, td = Infinity;
      for (const p of alive) {
        const d2 = dist2(z.x, z.y, p.x, p.y);
        if (d2 < td) { td = d2; tgt = p; }
      }
      // Barrikade von außen einreißen
      let tearing = false;
      for (const w of m.windows) {
        if (w.planks <= 0) continue;
        const out = (z.x - w.x) * w.nx + (z.y - w.y) * w.ny;
        if (out > 0 && dist2(z.x, z.y, w.x, w.y) < 48 * 48) {
          tearing = true;
          z.a = Math.atan2(w.y - z.y, w.x - z.x);
          z.tearT -= dt;
          if (z.tearT <= 0) {
            z.tearT = z.type === 2 || z.type === 3 ? 0.6 : 1.1;
            w.planks--; z.att = 0.3;
            this.ev({ k: 'tear', x: w.x | 0, y: w.y | 0 });
          }
          break;
        }
      }
      if (!tgt) continue;
      const d = Math.sqrt(td);
      const reach = CFG.PLAYER_R + t.r + 6;
      let dx = 0, dy = 0;
      if (!tearing) {
        if (d < 90 && this.los(z.x, z.y, tgt.x, tgt.y)) { dx = (tgt.x - z.x) / d; dy = (tgt.y - z.y) / d; }
        else { const v = this.nav.dir(z.x, z.y); if (v) { dx = v.x; dy = v.y; } }
        if (d > reach - 2) { z.x += dx * z.speed * dt; z.y += dy * z.speed * dt; }
        if (dx || dy) z.a = Math.atan2(dy, dx);
      }
      // Angriff
      z.attT -= dt;
      if (d < reach && z.attT <= 0) {
        z.attT = 1.0; z.att = 0.3;
        z.a = Math.atan2(tgt.y - z.y, tgt.x - z.x);
        this.ev({ k: 'zatt', x: z.x | 0, y: z.y | 0, t: z.type, zi: z.id });
        this.damagePlayer(tgt, t.dmg);
      }
    }
    // Abstand zwischen Zombies
    for (let i = 0; i < zs.length; i++) {
      const a = zs[i], ra = ZTYPES[a.type].r;
      for (let j = i + 1; j < zs.length; j++) {
        const b = zs[j], r = ra + ZTYPES[b.type].r;
        const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
        if (d2 >= r * r || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), push = (r - d) / 2;
        a.x -= dx / d * push; a.y -= dy / d * push;
        b.x += dx / d * push; b.y += dy / d * push;
      }
    }
    const blocking = [];
    for (const w of m.windows) if (w.planks > 0) blocking.push(w.rect);
    for (const z of zs) {
      const r = ZTYPES[z.type].r;
      pushOut(z, r, this.navSolids);
      pushOut(z, r, blocking);
      z.x = clamp(z.x, 5, MAP_W - 5); z.y = clamp(z.y, 5, MAP_H - 5);
    }
  }

  updateTurrets(dt) {
    for (let i = this.turrets.length - 1; i >= 0; i--) {
      const t = this.turrets[i];
      t.t -= dt;
      if (t.t <= 0) { this.turrets.splice(i, 1); continue; }
      t.fireT -= dt;
      let best = null, bd = 350 * 350;
      for (const z of this.zombies) {
        const d2 = dist2(t.x, t.y, z.x, z.y);
        if (d2 < bd && this.los(t.x, t.y, z.x, z.y)) { bd = d2; best = z; }
      }
      if (!best) continue;
      t.a = Math.atan2(best.y - t.y, best.x - t.x);
      if (t.fireT <= 0) {
        t.fireT = 1 / 6;
        const gx = t.x + Math.cos(t.a) * 18, gy = t.y + Math.sin(t.a) * 18;
        this.ev({ k: 'shot', w: 'turret', up: 0, x: gx | 0, y: gy | 0, x2: best.x | 0, y2: best.y | 0, id: t.owner });
        this.damageZombie(best, 45, this.players[t.owner], false, { a: t.a, w: 'turret' });
      }
    }
  }

  // ---------- Power-ups ----------
  dropPowerup(x, y, kind) {
    this.puRound++;
    this.powerups.push({ id: this.nextId++, x, y, kind, t: 25 });
  }

  updatePowerups(dt) {
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      if ((this.powerups[i].t -= dt) <= 0) this.powerups.splice(i, 1);
    }
  }

  applyPowerup(kind) {
    this.ev({ k: 'powerup', p: kind });
    if (kind === 'ammo') {
      for (const p of Object.values(this.players)) for (const s of p.slots) s.res = weaponStats(s.id, s.up).res;
    } else if (kind === 'insta') this.insta = 20;
    else if (kind === 'double') this.double = 20;
    else if (kind === 'nuke') {
      for (const z of this.zombies) this.ev({ k: 'kill', x: z.x | 0, y: z.y | 0, t: z.type, a: +z.a.toFixed(2), ba: +(Math.random() * 6.28).toFixed(2), zi: z.id, w: 'boom', d: 9999 });
      this.zombies = [];
      for (const p of Object.values(this.players)) p.pts += CFG.PTS_NUKE;
    }
  }

  // ---------- Zustand für die Anzeige / das Netzwerk ----------
  snapshot() {
    const z = [];
    for (const q of this.zombies) z.push(q.id, q.type, q.x | 0, q.y | 0, (q.a * 100) | 0, Math.max(1, Math.round(q.hp / q.maxHp * 100)), q.att > 0 ? 1 : 0);
    const pl = [];
    for (const p of Object.values(this.players)) {
      pl.push({
        id: p.id, n: p.num, c: p.cls, x: p.x | 0, y: p.y | 0, a: +p.a.toFixed(2),
        hp: Math.ceil(p.hp), mh: p.maxHp, s: p.state, pts: p.pts, k: p.kills,
        sl: p.slots.map(s => [s.id, s.up ? 1 : 0, s.mag, s.res]), cu: p.cur,
        rl: p.reloadT > 0 ? +(1 - p.reloadT / p.reloadDur).toFixed(2) : 0,
        pk: Object.keys(p.perks), cd: Math.max(0, Math.ceil(p.abilCd)), rg: p.rageT > 0 ? 1 : 0,
        bl: Math.ceil(p.bleedT), rv: +p.reviveProg.toFixed(2), pr: p.prompt, f: p.firing && p.state === 0 ? 1 : 0,
      });
    }
    return {
      r: this.round, ph: this.phase, pt: Math.ceil(this.phaseT), tl: this.toSpawn + this.zombies.length,
      pw: this.power ? 1 : 0, pa: this.partsHave,
      parts: this.parts.filter(p => !p.taken).map(p => [p.x, p.y, p.i]),
      doors: this.map.doors.map(d => d.open ? 1 : 0),
      win: this.map.windows.map(w => w.planks),
      box: [this.box.s, this.box.w, this.box.owner, +this.box.t.toFixed(1)],
      ins: this.insta > 0 ? Math.ceil(this.insta) : 0, dbl: this.double > 0 ? Math.ceil(this.double) : 0,
      pl, z,
      tu: this.turrets.map(t => [t.x | 0, t.y | 0, +t.a.toFixed(2), Math.ceil(t.t)]),
      pu: this.powerups.map(u => [u.id, u.x | 0, u.y | 0, u.kind, Math.ceil(u.t)]),
    };
  }
}
