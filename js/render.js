// Grafik: alles wird im Code gezeichnet (Boden, Figuren, Licht, Effekte, Anzeige)
const TAU = Math.PI * 2;
const FONT = '"Trebuchet MS", system-ui, sans-serif';
const TITLE_FONT = 'Creepster, Impact, sans-serif';

function rnd(a, b) { return a + Math.random() * (b - a); }

// Zufällige Flecken/Körnung auf eine Fläche
function speckle(g, x, y, w, h, n, colors, rmin, rmax) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[(Math.random() * colors.length) | 0];
    g.beginPath();
    g.arc(x + Math.random() * w, y + Math.random() * h, rnd(rmin, rmax), 0, TAU);
    g.fill();
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.map = buildMap();
    this.floor = this.makeFloor();
    this.decals = document.createElement('canvas');
    this.decals.width = MAP_W / 2; this.decals.height = MAP_H / 2;
    this.dg = this.decals.getContext('2d');
    this.dark = document.createElement('canvas');
    this.kg = this.dark.getContext('2d');
    this.particles = [];
    this.tracers = [];
    this.lights = [];     // kurze Lichtblitze
    this.msgs = [];       // Meldungen oben in der Mitte
    this.smooth = {};     // geglättete Positionen
    this.cam = { x: 1300, y: 1100 };
    this.shake = 0;
    this.hurtFlash = 0;
    this.time = 0;
    this.groanT = 2;
    this.resize();
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.W = innerWidth; this.H = innerHeight;
    this.cv.width = this.W * dpr; this.cv.height = this.H * dpr;
    this.dark.width = Math.ceil(this.W / 2); this.dark.height = Math.ceil(this.H / 2);
    this.zoom = Math.min(this.W / 760, this.H / 420);
  }

  // ---------- Boden einmal vorzeichnen ----------
  makeFloor() {
    const c = document.createElement('canvas');
    c.width = MAP_W; c.height = MAP_H;
    const g = c.getContext('2d');
    const m = this.map;

    // Draußen: Erde und Gras
    g.fillStyle = '#2b3122'; g.fillRect(0, 0, MAP_W, MAP_H);
    speckle(g, 0, 0, MAP_W, MAP_H, 9000, ['#323a27', '#262c1e', '#38402a', '#2f2a20'], 2, 9);
    speckle(g, 0, 0, MAP_W, MAP_H, 400, ['#1e2318', '#3d3a2c'], 10, 26);

    for (const k in m.rooms) {
      const r = m.rooms[k];
      g.save();
      g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
      if (r.floor === 'street') {
        g.fillStyle = '#34363a'; g.fillRect(r.x, r.y, r.w, r.h);
        speckle(g, r.x, r.y, r.w, r.h, 4000, ['#2e3034', '#3a3c40', '#303236'], 1, 3);
        // Gehwege
        g.fillStyle = '#55555a';
        g.fillRect(r.x, r.y, r.w, 70); g.fillRect(r.x, r.y + r.h - 70, r.w, 70);
        g.strokeStyle = '#47474c'; g.lineWidth = 2;
        for (let x = r.x; x < r.x + r.w; x += 50) {
          g.beginPath(); g.moveTo(x, r.y); g.lineTo(x, r.y + 70); g.moveTo(x, r.y + r.h - 70); g.lineTo(x, r.y + r.h); g.stroke();
        }
        g.fillStyle = '#6a6a70'; g.fillRect(r.x, r.y + 68, r.w, 6); g.fillRect(r.x, r.y + r.h - 74, r.w, 6);
        // Mittellinie
        g.fillStyle = '#c9a830';
        for (let x = r.x + 20; x < r.x + r.w; x += 80) g.fillRect(x, r.y + r.h / 2 - 3, 44, 6);
        // Gullis, Risse
        g.strokeStyle = '#26282b'; g.lineWidth = 2;
        for (let i = 0; i < 14; i++) {
          let x = rnd(r.x, r.x + r.w), y = rnd(r.y + 80, r.y + r.h - 80);
          g.beginPath(); g.moveTo(x, y);
          for (let j = 0; j < 5; j++) { x += rnd(-25, 25); y += rnd(-25, 25); g.lineTo(x, y); }
          g.stroke();
        }
      } else if (r.floor === 'gas') {
        g.fillStyle = '#7b786f'; g.fillRect(r.x, r.y, r.w, r.h);
        speckle(g, r.x, r.y, r.w, r.h, 2500, ['#75726a', '#827f76', '#6e6b63'], 1, 3);
        g.strokeStyle = '#5f5c55'; g.lineWidth = 2;
        for (let x = r.x; x <= r.x + r.w; x += 100) { g.beginPath(); g.moveTo(x, r.y); g.lineTo(x, r.y + r.h); g.stroke(); }
        for (let y = r.y; y <= r.y + r.h; y += 100) { g.beginPath(); g.moveTo(r.x, y); g.lineTo(r.x + r.w, y); g.stroke(); }
        speckle(g, r.x, r.y, r.w, r.h, 14, ['rgba(20,20,20,.35)', 'rgba(30,25,20,.3)'], 15, 40);
        // Tankinsel
        g.fillStyle = '#c7c2b5'; roundRect(g, 1950, 1010, 270, 180, 12); g.fill();
        g.fillStyle = '#d6b23a';
        for (let x = 1955; x < 2215; x += 26) g.fillRect(x, 1012, 12, 8);
      } else if (r.floor === 'hosp') {
        for (let y = r.y; y < r.y + r.h; y += 40) for (let x = r.x; x < r.x + r.w; x += 40) {
          g.fillStyle = ((x + y) / 40) % 2 ? '#b9c7c1' : '#c6d3cd';
          g.fillRect(x, y, 40, 40);
        }
        speckle(g, r.x, r.y, r.w, r.h, 1500, ['rgba(80,90,85,.12)', 'rgba(120,110,90,.15)'], 1, 4);
        speckle(g, r.x, r.y, r.w, r.h, 12, ['rgba(110,20,20,.35)', 'rgba(90,10,10,.3)'], 8, 26);
        g.fillStyle = 'rgba(60,140,110,.35)'; g.fillRect(r.x, 1090, r.w, 20);
      } else if (r.floor === 'bunker') {
        g.fillStyle = '#3c4148'; g.fillRect(r.x, r.y, r.w, r.h);
        for (let y = r.y; y < r.y + r.h; y += 60) for (let x = r.x; x < r.x + r.w; x += 60) {
          g.fillStyle = Math.random() < 0.5 ? '#414750' : '#393e45';
          g.fillRect(x + 2, y + 2, 56, 56);
          g.fillStyle = '#2b2f35';
          for (const [dx, dy] of [[6, 6], [54, 6], [6, 54], [54, 54]]) { g.beginPath(); g.arc(x + dx, y + dy, 2.5, 0, TAU); g.fill(); }
        }
        // Warnstreifen an der Tür
        g.save(); g.beginPath(); g.rect(1230, 740, 140, 50); g.clip();
        for (let x = 1200; x < 1400; x += 24) {
          g.fillStyle = '#d4b020'; g.beginPath(); g.moveTo(x, 790); g.lineTo(x + 12, 790); g.lineTo(x + 62, 740); g.lineTo(x + 50, 740); g.fill();
        }
        g.restore();
      }
      g.restore();
    }

    // Türschwellen
    for (const d of m.doors) { g.fillStyle = '#2a2a2a'; g.fillRect(d.rect.x, d.rect.y, d.rect.w, d.rect.h); }

    // Hindernisse
    for (const d of m.decor) this.drawDecor(g, d);

    // Wände mit Schatten
    g.fillStyle = 'rgba(0,0,0,.35)';
    for (const w of m.walls) g.fillRect(w.x + 6, w.y + 8, w.w, w.h);
    for (const w of m.walls) {
      g.fillStyle = '#4a4640'; g.fillRect(w.x, w.y, w.w, w.h);
      g.fillStyle = '#5d5850'; g.fillRect(w.x + 3, w.y + 3, w.w - 6, w.h - 6);
      g.strokeStyle = '#3a3631'; g.lineWidth = 1;
      if (w.w > w.h) for (let x = w.x + 20; x < w.x + w.w; x += 40) { g.beginPath(); g.moveTo(x, w.y + 3); g.lineTo(x, w.y + w.h - 3); g.stroke(); }
      else for (let y = w.y + 20; y < w.y + w.h; y += 40) { g.beginPath(); g.moveTo(w.x + 3, y); g.lineTo(w.x + w.w - 3, y); g.stroke(); }
    }

    // Wandwaffen (Kreide-Umriss an der Wand)
    for (const b of m.wallbuys) {
      const off = { n: [0, -24], s: [0, 24], e: [24, 0], w: [-24, 0] }[b.side];
      const x = b.x + off[0], y = b.y + off[1];
      g.save(); g.translate(x, y);
      if (b.side === 'e' || b.side === 'w') g.rotate(Math.PI / 2);
      g.fillStyle = 'rgba(30,25,20,.7)'; g.fillRect(-46, -14, 92, 28);
      g.strokeStyle = 'rgba(235,230,210,.85)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(-34, 2); g.lineTo(26, 2); g.lineTo(34, -2); g.lineTo(26, -6); g.lineTo(-20, -6); g.lineTo(-34, -2); g.closePath(); g.stroke();
      g.beginPath(); g.moveTo(-14, 2); g.lineTo(-18, 10); g.stroke();
      g.fillStyle = 'rgba(235,230,210,.9)'; g.font = `bold 10px ${FONT}`; g.textAlign = 'center';
      g.fillText(b.cost, 0, 12);
      g.restore();
    }
    return c;
  }

  drawDecor(g, d) {
    g.fillStyle = 'rgba(0,0,0,.35)'; roundRect(g, d.x + 5, d.y + 7, d.w, d.h, 8); g.fill();
    if (d.kind === 'car' || d.kind === 'car2') {
      const hor = d.w > d.h;
      g.fillStyle = d.kind === 'car' ? '#7a2b25' : '#2f4f6e'; roundRect(g, d.x, d.y, d.w, d.h, 12); g.fill();
      g.fillStyle = 'rgba(160,200,220,.55)';
      if (hor) { g.fillRect(d.x + d.w * 0.25, d.y + 8, d.w * 0.15, d.h - 16); g.fillRect(d.x + d.w * 0.62, d.y + 8, d.w * 0.12, d.h - 16); }
      else { g.fillRect(d.x + 8, d.y + d.h * 0.25, d.w - 16, d.h * 0.15); g.fillRect(d.x + 8, d.y + d.h * 0.62, d.w - 16, d.h * 0.12); }
      g.fillStyle = 'rgba(0,0,0,.25)';
      if (hor) g.fillRect(d.x + d.w * 0.42, d.y + 6, d.w * 0.18, d.h - 12); else g.fillRect(d.x + 6, d.y + d.h * 0.42, d.w - 12, d.h * 0.18);
      g.fillStyle = '#e8e0a0';
      if (hor) { g.fillRect(d.x + d.w - 5, d.y + 6, 4, 10); g.fillRect(d.x + d.w - 5, d.y + d.h - 16, 4, 10); }
      else { g.fillRect(d.x + 6, d.y + 1, 10, 4); g.fillRect(d.x + d.w - 16, d.y + 1, 10, 4); }
    } else if (d.kind === 'pump') {
      g.fillStyle = '#b8312b'; roundRect(g, d.x, d.y, d.w, d.h, 6); g.fill();
      g.fillStyle = '#e8e8e8'; g.fillRect(d.x + 6, d.y + 10, d.w - 12, 26);
      g.fillStyle = '#222'; g.fillRect(d.x + 9, d.y + 14, d.w - 18, 8);
      g.fillStyle = '#333'; g.fillRect(d.x + 14, d.y + 60, 12, 40);
    } else if (d.kind === 'bed') {
      g.fillStyle = '#8a9196'; roundRect(g, d.x, d.y, d.w, d.h, 4); g.fill();
      g.fillStyle = '#e9ecef'; roundRect(g, d.x + 3, d.y + 3, d.w - 6, d.h - 6, 4); g.fill();
      g.fillStyle = '#ffffff';
      if (d.h > d.w) roundRect(g, d.x + 8, d.y + 6, d.w - 16, 18, 6); else roundRect(g, d.x + 6, d.y + 8, 18, d.h - 16, 6);
      g.fill();
      g.fillStyle = 'rgba(120,15,15,.5)'; g.beginPath(); g.arc(d.x + d.w * 0.6, d.y + d.h * 0.6, 10, 0, TAU); g.fill();
    } else if (d.kind === 'crate') {
      g.fillStyle = '#6b5636'; g.fillRect(d.x, d.y, d.w, d.h);
      g.strokeStyle = '#4a3a22'; g.lineWidth = 4; g.strokeRect(d.x + 2, d.y + 2, d.w - 4, d.h - 4);
      g.beginPath(); g.moveTo(d.x + 4, d.y + 4); g.lineTo(d.x + d.w - 4, d.y + d.h - 4); g.stroke();
      g.fillStyle = '#2d3a1f'; g.font = `bold 11px ${FONT}`; g.textAlign = 'center'; g.fillText('MUNITION', d.x + d.w / 2, d.y + d.h / 2 - 6);
    }
  }

  // ---------- Effekte aus Ereignissen ----------
  onEvents(evs, snap, myId, sfx) {
    const me = snap && snap.pl.find(p => p.id === myId);
    const vol = (x, y) => me ? Math.max(0, 1 - Math.hypot(x - me.x, y - me.y) / 1000) : 0.5;
    const num = id => { const p = snap && snap.pl.find(q => q.id === id); return p ? 'P' + p.n : 'Jemand'; };
    for (const e of evs) {
      switch (e.k) {
        case 'shot': {
          const col = e.w === 'plasma' ? '120,255,140' : e.up ? '200,140,255' : '255,230,150';
          this.tracers.push({ x: e.x, y: e.y, x2: e.x2, y2: e.y2, life: e.w === 'plasma' ? 0.15 : 0.07, max: 0.07, col, wide: e.w === 'sniper' || e.w === 'plasma' || e.w === 'dmr' });
          this.lights.push({ x: e.x, y: e.y, r: 140, life: 0.05, max: 0.05 });
          this.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.05, max: 0.05, r: 9, col: '255,220,120', glow: 1 });
          sfx.play('shot', vol(e.x, e.y), e.w);
          break;
        }
        case 'flame':
          for (let i = 0; i < 3; i++) {
            const a = e.a + rnd(-0.35, 0.35), sp = rnd(320, 480);
            this.particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.4, max: 0.4, r: rnd(3, 6), grow: 28, col: e.up ? '170,120,255' : '255,140,40', glow: 1, drag: 2, soft: 1 });
          }
          this.lights.push({ x: e.x + Math.cos(e.a) * 80, y: e.y + Math.sin(e.a) * 80, r: 220, life: 0.08, max: 0.08 });
          sfx.play('flame', vol(e.x, e.y));
          break;
        case 'hit':
          // Blut spritzt in Schussrichtung
          for (let i = 0; i < 6; i++) {
            const a = (e.a || 0) + rnd(-0.5, 0.5), sp = rnd(60, 220);
            this.particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.35, max: 0.35, r: rnd(1.5, 3), col: '150,10,10', drag: 4 });
          }
          if (!this.hudOnly && e.d > 0) this.splat(e.x + Math.cos(e.a || 0) * 18, e.y + Math.sin(e.a || 0) * 18, 5);
          sfx.play('hit', vol(e.x, e.y));
          break;
        case 'kill':
          this.splat(e.x, e.y, ZTYPES[e.t].r * 1.6);
          this.corpse(e.x, e.y, e.t, e.a);
          for (let i = 0; i < 10; i++) this.particles.push({ x: e.x, y: e.y, vx: rnd(-160, 160), vy: rnd(-160, 160), life: 0.5, max: 0.5, r: rnd(2, 4), col: '130,8,8', drag: 4 });
          sfx.play('groan', vol(e.x, e.y) * 0.9);
          break;
        case 'boom':
          for (let i = 0; i < 24; i++) {
            const a = rnd(0, TAU), sp = rnd(80, 300);
            this.particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5, max: 0.5, r: rnd(5, 10), grow: 30, col: '140,255,150', glow: 1, drag: 4 });
          }
          this.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.3, max: 0.3, r: e.r * 0.5, grow: e.r * 3, col: '200,255,200', glow: 1, ring: 1 });
          this.lights.push({ x: e.x, y: e.y, r: 380, life: 0.25, max: 0.25 });
          if (me && Math.hypot(e.x - me.x, e.y - me.y) < 500) this.shake = Math.max(this.shake, 6);
          sfx.play('boom', vol(e.x, e.y));
          break;
        case 'knife':
          this.particles.push({ x: e.x + Math.cos(e.a) * 26, y: e.y + Math.sin(e.a) * 26, vx: 0, vy: 0, life: 0.15, max: 0.15, r: 22, col: '230,230,230', arc: e.a });
          sfx.play('knife', vol(e.x, e.y));
          break;
        case 'tear':
          this.chips(e.x, e.y); sfx.play('tear', vol(e.x, e.y));
          break;
        case 'plank':
          this.chips(e.x, e.y); sfx.play('plank', vol(e.x, e.y));
          break;
        case 'door':
          for (let i = 0; i < 30; i++) this.particles.push({ x: e.x + rnd(-50, 50), y: e.y + rnd(-50, 50), vx: rnd(-60, 60), vy: rnd(-60, 60), life: 1.2, max: 1.2, r: rnd(6, 14), grow: 20, col: '120,115,105', drag: 1.5, soft: 1 });
          sfx.play('door', vol(e.x, e.y) + 0.3);
          break;
        case 'round':
          this.msg(`Runde ${e.r}`, '#d33', 3, true); sfx.play('round', 0.9);
          break;
        case 'roundEnd': sfx.play('roundEnd', 0.7); break;
        case 'powerup':
          this.msg(POWERUPS[e.p].name + '!', POWERUPS[e.p].color, 2.5, true); sfx.play('powerup', 1);
          if (e.p === 'nuke') { this.lights.push({ x: this.cam.x, y: this.cam.y, r: 2000, life: 0.6, max: 0.6 }); this.shake = 10; sfx.play('boom', 1); }
          break;
        case 'part': this.msg(`${e.n} gefunden (${e.have}/3)`, '#ffd34d', 2.5); sfx.play('part', 1); break;
        case 'power': this.msg('Strom ist an!', '#7fd4ff', 3, true); sfx.play('power', 1); break;
        case 'perk': if (e.id === myId) { this.msg(PERKS[e.p].name, PERKS[e.p].color, 2); sfx.play('perk', 1); } break;
        case 'buy': if (e.id === myId) sfx.play('buy', 1); break;
        case 'nomoney': if (e.id === myId) { this.msg('Nicht genug Punkte', '#f66', 1.2); sfx.play('nomoney', 1); } break;
        case 'upgrade': if (e.id === myId) this.msg('Waffe verbessert!', '#c9f', 2); sfx.play('upgrade', 0.8); break;
        case 'box': sfx.play('box', 0.8); break;
        case 'hurt':
          if (e.id === myId) { this.shake = Math.max(this.shake, 5); this.hurtFlash = 0.4; sfx.play('hurt', 1); }
          break;
        case 'down': this.msg(e.id === myId ? 'Du bist am Boden!' : `${num(e.id)} ist am Boden!`, '#f55', 2.5); sfx.play('down', 1); break;
        case 'revived': this.msg(`${num(e.id)} ist wieder da`, '#6f6', 2); break;
        case 'dead': this.msg(`${num(e.id)} ist gefallen – zurück nächste Runde`, '#f55', 3); break;
        case 'abil':
          sfx.play('abil', vol(e.x, e.y));
          if (e.c === 'sani') this.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.6, max: 0.6, r: 30, grow: 420, col: '90,255,140', ring: 1, glow: 1 });
          if (e.c === 'soldat') this.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.4, max: 0.4, r: 20, grow: 160, col: '255,80,60', ring: 1, glow: 1 });
          if (e.id === myId) this.msg(CLASSES[e.c].abil + '!', CLASSES[e.c].color, 1.5);
          break;
        // in 3D kommen die Nachladegeräusche Schritt für Schritt aus der Animation
        case 'reload': if (e.id === myId && !this.hudOnly) sfx.play('reload', 0.8); break;
        case 'zatt': if (!this.hudOnly) sfx.play('growl', vol(e.x, e.y)); break;
        case 'swap': if (e.id === myId) sfx.play('swap', 0.8); break;
        case 'empty': if (e.id === myId) sfx.play('empty', 0.8); break;
        case 'over': sfx.play('over', 1); break;
        case 'loot':
          if (e.id === myId) {
            const it = e.it;
            this.msg(`+ ${it.k === 'armor' ? it.nm : CONSUMABLES[it.k].name}`, it.k === 'armor' ? RARITY[it.r].color : CONSUMABLES[it.k].color, 2);
            sfx.play('part', 0.8);
          }
          break;
        case 'full': if (e.id === myId) { this.msg('Rucksack voll', '#f88', 1.5); sfx.play('nomoney', 0.6); } break;
        case 'skillpts': this.msg(`+${e.n} Fähigkeitspunkte! (🎒 oben)`, '#ffd34d', 4, true); sfx.play('powerup', 1); break;
        case 'skill': if (e.id === myId) sfx.play('upgrade', 0.5); break;
        case 'equip': if (e.id === myId) sfx.play('swap', 1); break;
        case 'use':
          sfx.play({ medkit: 'perk', grenade: 'knife', adrenaline: 'heart', ammobox: 'magIn' }[e.it] || 'buy', vol(e.x, e.y));
          if (e.id === myId) this.msg(CONSUMABLES[e.it].name, CONSUMABLES[e.it].color, 1.2);
          break;
      }
    }
  }

  msg(text, color, dur, big) {
    this.msgs = this.msgs.filter(m => m.text !== text);
    this.msgs.push({ text, color, life: dur, max: dur, big });
    if (this.msgs.length > 4) this.msgs.shift();
  }

  chips(x, y) {
    for (let i = 0; i < 6; i++) this.particles.push({ x, y, vx: rnd(-120, 120), vy: rnd(-120, 120), life: 0.5, max: 0.5, r: rnd(2, 4), col: '120,85,45', drag: 3, sq: 1 });
  }

  // Blut bleibt dauerhaft auf dem Boden
  splat(x, y, r) {
    const g = this.dg;
    g.save(); g.scale(0.5, 0.5);
    g.fillStyle = `rgba(${90 + (Math.random() * 40) | 0},5,5,.55)`;
    g.beginPath(); g.arc(x, y, r * 0.7, 0, TAU); g.fill();
    for (let i = 0; i < 7; i++) {
      const a = rnd(0, TAU), d = rnd(r * 0.5, r * 1.6);
      g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, rnd(2, r * 0.35), 0, TAU); g.fill();
    }
    g.restore();
  }

  corpse(x, y, t, a) {
    const g = this.dg, z = ZTYPES[t];
    g.save(); g.scale(0.5, 0.5); g.translate(x, y); g.rotate(a + Math.PI + rnd(-0.5, 0.5));
    g.globalAlpha = 0.55;
    g.fillStyle = '#2a2f22';
    g.beginPath(); g.ellipse(0, 0, z.r * 1.3, z.r * 0.9, 0, 0, TAU); g.fill();
    g.beginPath(); g.arc(z.r * 1.2, 0, z.r * 0.55, 0, TAU); g.fill();
    g.restore();
  }

  // ---------- Hauptzeichnung ----------
  draw(snap, myId, input, dt, isHost) {
    this.time += dt;
    const g = this.g, W = this.W, H = this.H, z = this.zoom;
    const me = snap.pl.find(p => p.id === myId);

    // Positionen glätten
    const k = isHost ? 1 : 1 - Math.exp(-dt * 18);
    const sm = (key, x, y) => {
      let s = this.smooth[key];
      if (!s || Math.abs(s.x - x) + Math.abs(s.y - y) > 160) s = this.smooth[key] = { x, y, seen: 0 };
      s.x += (x - s.x) * k; s.y += (y - s.y) * k; s.seen = this.time;
      return s;
    };

    // 3D-Ansicht: hier nur die Anzeigen über das 3D-Bild legen
    if (this.hudOnly) {
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      this.updateFx(dt);
      this.drawHud(g, snap, me, input);
      return;
    }

    // Kamera folgt der eigenen Figur, leicht in Blickrichtung
    if (me) {
      const s = sm('p' + me.id, me.x, me.y);
      const aim = me.s === 0 ? input.state.a : me.a;
      const tx = s.x + Math.cos(aim) * 60, ty = s.y + Math.sin(aim) * 60;
      this.cam.x += (tx - this.cam.x) * Math.min(1, dt * 6);
      this.cam.y += (ty - this.cam.y) * Math.min(1, dt * 6);
    }
    this.shake = Math.max(0, this.shake - dt * 20);
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    const ox = W / 2 - this.cam.x * z + sx, oy = H / 2 - this.cam.y * z + sy;
    this.toScreen = (x, y) => ({ x: x * z + ox, y: y * z + oy });

    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#0b0d0a'; g.fillRect(0, 0, W, H);
    g.save();
    g.translate(ox, oy); g.scale(z, z);

    // sichtbarer Ausschnitt
    const vx = -ox / z, vy = -oy / z, vw = W / z, vh = H / z;
    const cx0 = Math.max(0, vx | 0), cy0 = Math.max(0, vy | 0);
    const cw = Math.min(MAP_W - cx0, vw + 2), ch = Math.min(MAP_H - cy0, vh + 2);
    if (cw > 0 && ch > 0) {
      g.drawImage(this.floor, cx0, cy0, cw, ch, cx0, cy0, cw, ch);
      g.drawImage(this.decals, cx0 / 2, cy0 / 2, cw / 2, ch / 2, cx0, cy0, cw, ch);
    }

    this.drawWorldObjects(g, snap, myId);

    // Power-ups
    for (const [id, x, y, kind, t] of snap.pu) {
      if (t < 6 && Math.floor(this.time * 6) % 2) continue;
      const b = Math.sin(this.time * 4 + id) * 4;
      const c = POWERUPS[kind].color;
      g.save(); g.translate(x, y + b);
      g.shadowColor = c; g.shadowBlur = 20;
      g.fillStyle = c; g.beginPath(); g.arc(0, 0, 15, 0, TAU); g.fill();
      g.shadowBlur = 0;
      g.fillStyle = '#111'; g.font = `bold 15px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText({ ammo: '▮', insta: '☠', double: '×2', nuke: '✸' }[kind], 0, 1);
      g.restore();
    }

    // Zombies
    const zs = snap.z;
    for (let i = 0; i < zs.length; i += 7) {
      const s = sm('z' + zs[i], zs[i + 2], zs[i + 3]);
      this.drawZombie(g, s.x, s.y, zs[i + 4] / 100, zs[i + 1], zs[i + 5], zs[i + 6], zs[i]);
    }

    // Geschütztürme
    for (const [x, y, a, t] of snap.tu) this.drawTurret(g, x, y, a, t);

    // Spieler
    for (const p of snap.pl) {
      if (p.s === 2) continue;
      const s = sm('p' + p.id, p.x, p.y);
      const a = p.id === myId && p.s === 0 ? input.state.a : p.a;
      this.drawPlayer(g, s.x, s.y, a, p, p.id === myId);
    }

    // Schüsse
    for (const t of this.tracers) {
      const al = t.life / t.max;
      g.strokeStyle = `rgba(${t.col},${al * 0.9})`;
      g.lineWidth = t.wide ? 4 : 2;
      g.beginPath(); g.moveTo(t.x, t.y); g.lineTo(t.x2, t.y2); g.stroke();
    }

    // Partikel
    for (const p of this.particles) {
      const al = Math.max(0, p.life / p.max);
      if (p.glow) g.globalCompositeOperation = 'lighter';
      if (p.ring) {
        g.strokeStyle = `rgba(${p.col},${al})`; g.lineWidth = 6 * al + 1;
        g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.stroke();
      } else if (p.arc !== undefined) {
        g.strokeStyle = `rgba(${p.col},${al})`; g.lineWidth = 3;
        g.beginPath(); g.arc(p.x - Math.cos(p.arc) * 20, p.y - Math.sin(p.arc) * 20, p.r, p.arc - 1, p.arc + 1); g.stroke();
      } else if (p.sq) {
        g.fillStyle = `rgba(${p.col},${al})`; g.fillRect(p.x - p.r, p.y - p.r / 2, p.r * 2, p.r);
      } else {
        g.fillStyle = `rgba(${p.col},${al * (p.soft ? (p.glow ? 0.55 : 0.35) : 1)})`;
        g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill();
      }
      g.globalCompositeOperation = 'source-over';
    }

    g.restore();

    this.drawLighting(snap, myId, ox, oy, z);
    this.updateFx(dt);

    // Zombie-Stöhnen in der Nähe
    this.groanT -= dt;
    if (this.groanT <= 0 && me && zs.length) {
      this.groanT = rnd(1.5, 4);
      let best = Infinity;
      for (let i = 0; i < zs.length; i += 7) best = Math.min(best, Math.hypot(zs[i + 2] - me.x, zs[i + 3] - me.y));
      if (this.sfx) this.sfx.play('groan', Math.max(0, 1 - best / 700) * 0.7);
    }

    if (me) {
      const ps = this.toScreen(me.x, me.y);
      input.playerScreen = ps;
    }
    this.drawHud(g, snap, me, input);
  }

  drawWorldObjects(g, snap, myId) {
    const m = this.map, power = snap.pw, t = this.time;

    // Fenster mit Brettern
    m.windows.forEach((w, i) => {
      const n = snap.win[i], r = w.rect;
      g.fillStyle = '#1a1612'; g.fillRect(r.x, r.y, r.w, r.h);
      g.save(); g.translate(w.x, w.y);
      if (!w.horizontal) g.rotate(Math.PI / 2);
      for (let j = 0; j < n; j++) {
        const off = -r.w / 2 * 0 + (j - 2) * 5;
        g.save(); g.rotate((j % 2 ? 0.12 : -0.12));
        g.fillStyle = j % 2 ? '#8a6a40' : '#7a5c36';
        g.fillRect(-40, off - 3, 80, 7);
        g.fillStyle = '#3a2a18'; g.fillRect(-34, off - 1, 3, 3); g.fillRect(31, off - 1, 3, 3);
        g.restore();
      }
      g.restore();
    });

    // Geschlossene Türen
    m.doors.forEach((d, i) => {
      if (snap.doors[i]) return;
      const r = d.rect;
      g.fillStyle = '#5b6168'; g.fillRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
      g.fillStyle = '#7a828b';
      if (d.horizontal) for (let x = r.x; x < r.x + r.w; x += 10) g.fillRect(x, r.y + 2, 6, r.h - 4);
      else for (let y = r.y; y < r.y + r.h; y += 10) g.fillRect(r.x + 2, y, r.w - 4, 6);
      g.fillStyle = '#d4b020'; g.fillRect(d.horizontal ? r.x : r.x + r.w / 2 - 3, d.horizontal ? r.y + r.h / 2 - 3 : r.y, d.horizontal ? r.w : 6, d.horizontal ? 6 : r.h);
      g.save(); g.translate(d.x, d.y);
      g.fillStyle = 'rgba(0,0,0,.75)'; roundRect(g, -30, -11, 60, 22, 6); g.fill();
      g.fillStyle = '#ffd34d'; g.font = `bold 13px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(d.cost, 0, 1);
      g.restore();
    });

    // Perk-Automaten
    for (const k of m.perks) {
      const pk = PERKS[k.p];
      g.save(); g.translate(k.x, k.y);
      if (power) { g.shadowColor = pk.color; g.shadowBlur = 25 + Math.sin(t * 3) * 8; }
      g.fillStyle = power ? pk.color : '#555';
      roundRect(g, -22, -16, 44, 32, 5); g.fill();
      g.shadowBlur = 0;
      g.fillStyle = power ? 'rgba(255,255,255,.85)' : '#777'; g.fillRect(-16, -10, 32, 10);
      g.fillStyle = '#111'; g.font = `bold 8px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(pk.name.toUpperCase(), 0, -5);
      g.fillStyle = power ? '#fff' : '#999'; g.font = `bold 9px ${FONT}`;
      g.fillText(pk.cost, 0, 8);
      g.restore();
    }

    // Strom-Hebel mit 3 Steckplätzen
    {
      const L = m.lever;
      g.save(); g.translate(L.x, L.y);
      g.fillStyle = '#2c3036'; roundRect(g, -40, -22, 80, 44, 6); g.fill();
      g.strokeStyle = power ? '#7fd4ff' : '#555'; g.lineWidth = 2; g.stroke();
      for (let i = 0; i < 3; i++) {
        g.fillStyle = i < snap.pa ? '#ffd34d' : '#151719';
        g.fillRect(-32 + i * 14, -14, 10, 10);
      }
      g.fillStyle = '#888'; g.fillRect(14, -14, 6, 28);
      g.fillStyle = power ? '#4f4' : '#d33';
      g.beginPath(); g.arc(17, power ? -14 : 14, 6, 0, TAU); g.fill();
      g.fillStyle = power ? '#7fd4ff' : '#aaa'; g.font = `bold 8px ${FONT}`; g.textAlign = 'center';
      g.fillText('STROM', -12, 14);
      g.restore();
    }

    // Verstärker (Waffen-Verbesserung)
    {
      const U = m.upgrade;
      g.save(); g.translate(U.x, U.y);
      if (power) { g.shadowColor = '#b46cff'; g.shadowBlur = 30 + Math.sin(t * 5) * 10; }
      g.fillStyle = power ? '#5b2d8a' : '#3a3540';
      roundRect(g, -34, -24, 68, 48, 8); g.fill();
      g.shadowBlur = 0;
      g.fillStyle = power ? '#d7b4ff' : '#666';
      for (let i = 0; i < 4; i++) g.fillRect(-26 + i * 14, -18, 8, 6);
      g.strokeStyle = power ? '#e8d0ff' : '#555'; g.lineWidth = 3;
      g.beginPath(); g.arc(0, 6, 11, 0, TAU); g.stroke();
      g.fillStyle = power ? '#fff' : '#888'; g.font = `bold 8px ${FONT}`; g.textAlign = 'center';
      g.fillText(CFG.UPGRADE_COST, 0, 9);
      g.restore();
    }

    // Wunderkiste
    {
      const B = m.box, [bs, bw, , bt] = snap.box;
      g.save(); g.translate(B.x, B.y);
      g.shadowColor = '#5cf'; g.shadowBlur = 18 + Math.sin(t * 2) * 6;
      g.fillStyle = '#6b4a2a'; g.fillRect(-30, -16, 60, 32);
      g.shadowBlur = 0;
      g.strokeStyle = '#3d2a16'; g.lineWidth = 3; g.strokeRect(-30, -16, 60, 32);
      g.fillStyle = '#c9a24a'; g.fillRect(-30, -2, 60, 4);
      g.fillStyle = bs === 'idle' ? '#7fe0ff' : '#fff'; g.font = `bold 18px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('?', 0, -1);
      if (bs !== 'idle') {
        const keys = Object.keys(BOX_POOL);
        const name = bs === 'spin' ? WEAPONS[keys[Math.floor(t * 10) % keys.length]].name : WEAPONS[bw].name;
        const lift = bs === 'spin' ? (3 - bt) * 10 : 30;
        g.fillStyle = 'rgba(0,0,0,.7)'; roundRect(g, -70, -46 - lift, 140, 22, 6); g.fill();
        g.fillStyle = bs === 'offer' ? '#ffd34d' : '#fff'; g.font = `bold 12px ${FONT}`;
        g.fillText(name, 0, -35 - lift);
      }
      g.fillStyle = '#fff'; g.font = `bold 9px ${FONT}`; g.fillText(CFG.BOX_COST, 0, 24);
      g.restore();
    }

    // Beutel (Farbe = Seltenheit bzw. Gegenstand)
    for (const [id, x, y, k, r] of snap.lt || []) {
      const c = r >= 0 ? RARITY[r].color : CONSUMABLES[k].color, b = Math.sin(t * 3 + id) * 2;
      g.save(); g.translate(x, y + b);
      if (r >= 1) { g.shadowColor = c; g.shadowBlur = 18; }
      g.fillStyle = '#5a4630'; g.beginPath(); g.ellipse(0, 2, 11, 9, 0, 0, TAU); g.fill();
      g.shadowBlur = 0;
      g.strokeStyle = c; g.lineWidth = 3; g.stroke();
      g.fillStyle = c; g.font = `bold 11px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(r >= 0 ? '⛨' : CONSUMABLES[k].icon, 0, 2);
      g.restore();
    }
    for (const [x, y] of snap.gr || []) {
      g.fillStyle = '#3a4228'; g.beginPath(); g.arc(x, y, 6, 0, TAU); g.fill();
      g.fillStyle = Math.floor(t * 8) % 2 ? '#f33' : '#600'; g.beginPath(); g.arc(x, y, 2.5, 0, TAU); g.fill();
    }

    // Teile zum Aufsammeln
    for (const [x, y, i] of snap.parts) {
      const b = Math.sin(t * 3 + i) * 3;
      g.save(); g.translate(x, y + b);
      g.shadowColor = '#ffd34d'; g.shadowBlur = 16;
      g.fillStyle = '#ffd34d'; g.strokeStyle = '#ffd34d'; g.lineWidth = 3;
      if (i === 0) { g.beginPath(); g.arc(0, 0, 9, 0, TAU); g.stroke(); g.fillRect(-2, -14, 4, 14); }
      else if (i === 1) { g.fillRect(-5, -10, 10, 20); g.fillStyle = '#c33'; g.fillRect(-5, -2, 10, 4); }
      else { g.beginPath(); for (let a = 0; a < 12; a += 0.4) g.lineTo(Math.cos(a) * (3 + a), Math.sin(a) * (3 + a)); g.stroke(); }
      g.restore();
      if (Math.random() < 0.05) this.particles.push({ x: x + rnd(-10, 10), y: y + rnd(-10, 10), vx: 0, vy: -30, life: 0.6, max: 0.6, r: 2, col: '255,220,100', glow: 1 });
    }
  }

  drawZombie(g, x, y, a, type, hp, att, id) {
    const t = ZTYPES[type], r = t.r;
    const walk = Math.sin(this.time * (type === 1 ? 14 : 7) + id);
    g.save(); g.translate(x, y);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(3, 5, r * 1.1, r * 0.9, 0, 0, TAU); g.fill();
    g.rotate(a);
    // Arme nach vorne
    const reach = att ? r * 1.5 : r * 1.0;
    g.fillStyle = type === 3 ? '#4a3550' : '#5d6e45';
    g.fillRect(r * 0.2, -r * 0.85 + walk * 2, reach, r * 0.35);
    g.fillRect(r * 0.2, r * 0.5 - walk * 2, reach, r * 0.35);
    // Körper
    g.fillStyle = t.color;
    g.beginPath(); g.ellipse(0, 0, r * 0.8, r, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(-r * 0.25, 0, r * 0.4, r * 0.7, 0, 0, TAU); g.fill();
    // Kopf
    g.fillStyle = type === 3 ? '#7d5a80' : type === 1 ? '#a58070' : '#8a9a6a';
    g.beginPath(); g.arc(r * 0.25, 0, r * 0.55, 0, TAU); g.fill();
    // Augen
    const eye = type === 3 || type === 1 ? '#ff3b2f' : '#e8e070';
    g.fillStyle = eye;
    if (type === 3) { g.shadowColor = eye; g.shadowBlur = 10; }
    g.fillRect(r * 0.5, -r * 0.25, r * 0.15, r * 0.14);
    g.fillRect(r * 0.5, r * 0.11, r * 0.15, r * 0.14);
    g.shadowBlur = 0;
    if (type === 3) {
      g.fillStyle = '#c8b8a0';
      for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(-r * 0.3, i * r * 0.4); g.lineTo(-r * 1.1, i * r * 0.6); g.lineTo(-r * 0.3, i * r * 0.4 + 6); g.fill(); }
    }
    g.restore();
    if ((type >= 2) && hp < 100) {
      g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x - r, y - r - 12, r * 2, 5);
      g.fillStyle = type === 3 ? '#c4f' : '#e44'; g.fillRect(x - r, y - r - 12, r * 2 * hp / 100, 5);
    }
  }

  drawPlayer(g, x, y, a, p, isMe) {
    const cl = CLASSES[p.c], R = CFG.PLAYER_R;
    g.save(); g.translate(x, y);
    if (p.s === 1) {
      // am Boden
      const pulse = 0.5 + Math.sin(this.time * 6) * 0.5;
      g.strokeStyle = `rgba(255,60,60,${0.4 + pulse * 0.5})`; g.lineWidth = 3;
      g.beginPath(); g.arc(0, 0, 30, 0, TAU); g.stroke();
      if (p.rv > 0) {
        g.strokeStyle = '#6f6'; g.lineWidth = 5;
        g.beginPath(); g.arc(0, 0, 30, -Math.PI / 2, -Math.PI / 2 + TAU * p.rv); g.stroke();
      }
      g.rotate(a + 1.2);
      g.fillStyle = cl.color; g.beginPath(); g.ellipse(0, 0, R * 1.2, R * 0.75, 0, 0, TAU); g.fill();
      g.fillStyle = '#c99'; g.beginPath(); g.arc(R * 1.1, 0, R * 0.5, 0, TAU); g.fill();
      g.restore();
      g.fillStyle = '#fff'; g.font = `bold 12px ${FONT}`; g.textAlign = 'center';
      g.fillText(`P${p.n} · ${p.bl}s`, x, y - 38);
      return;
    }
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(3, 5, R * 1.1, R * 0.9, 0, 0, TAU); g.fill();
    if (p.rg) {
      g.shadowColor = '#f43'; g.shadowBlur = 20;
    }
    g.rotate(a);
    // Waffe
    const sl = p.sl[p.cu];
    const wid = sl ? sl[0] : 'pistol', up = sl && sl[1];
    const len = { pistol: 14, shotgun: 24, smg: 20, rifle: 26, dmr: 30, lmg: 28, flame: 24, plasma: 22, sniper: 34 }[wid] || 18;
    g.fillStyle = up ? '#a070e0' : wid === 'plasma' ? '#3a8a4a' : wid === 'flame' ? '#8a3a20' : '#222';
    g.fillRect(R * 0.4, 2, len, 6);
    g.fillStyle = '#333'; g.fillRect(R * 0.4, 1, 8, 8);
    // Arme
    g.fillStyle = '#d9a982';
    g.beginPath(); g.arc(R * 0.6, 5, 4, 0, TAU); g.fill();
    g.beginPath(); g.arc(R * 0.9 + 4, 6, 4, 0, TAU); g.fill();
    // Körper
    g.fillStyle = cl.color;
    g.beginPath(); g.ellipse(0, 0, R * 0.75, R, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 2; g.stroke();
    g.shadowBlur = 0;
    if (p.c === 'sani') { g.fillStyle = '#d22'; g.fillRect(-7, -2, 8, 4); g.fillRect(-5, -4, 4, 8); }
    if (p.c === 'tech') { g.fillStyle = '#5a4a30'; g.fillRect(-R * 0.75, -R * 0.9, 5, R * 1.8); }
    if (p.c === 'soldat') { g.fillStyle = '#3d5a2c'; g.fillRect(-9, -R * 0.6, 6, R * 1.2); }
    // Kopf / Helm
    g.fillStyle = p.c === 'soldat' ? '#4a6b35' : p.c === 'tech' ? '#e8c020' : '#f2f2f2';
    g.beginPath(); g.arc(0, 0, R * 0.52, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 1.5; g.stroke();
    g.restore();
    // Name
    g.fillStyle = isMe ? '#ffd34d' : '#fff'; g.font = `bold 11px ${FONT}`; g.textAlign = 'center';
    g.fillText('P' + p.n, x, y - R - 10);
    if (p.rl > 0) {
      g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x - 16, y + R + 6, 32, 4);
      g.fillStyle = '#fff'; g.fillRect(x - 16, y + R + 6, 32 * p.rl, 4);
    }
  }

  drawTurret(g, x, y, a, t) {
    g.save(); g.translate(x, y);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.arc(3, 4, 15, 0, TAU); g.fill();
    g.fillStyle = '#6a5a3a'; g.beginPath(); g.arc(0, 0, 14, 0, TAU); g.fill();
    g.rotate(a);
    g.fillStyle = '#333'; g.fillRect(0, -3, 22, 6);
    g.fillStyle = '#e69138'; g.beginPath(); g.arc(0, 0, 8, 0, TAU); g.fill();
    g.restore();
    g.fillStyle = '#fff'; g.font = `bold 9px ${FONT}`; g.textAlign = 'center';
    g.fillText(t + 's', x, y - 20);
  }

  // ---------- Licht und Dunkelheit ----------
  drawLighting(snap, myId, ox, oy, z) {
    const k = this.kg, s = 0.5;
    const w = this.dark.width, h = this.dark.height;
    const power = snap.pw;
    k.globalCompositeOperation = 'source-over';
    k.clearRect(0, 0, w, h);
    k.fillStyle = power ? 'rgba(4,6,12,.35)' : 'rgba(3,4,10,.78)';
    k.fillRect(0, 0, w, h);
    k.globalCompositeOperation = 'destination-out';
    const light = (x, y, r, strength = 1) => {
      const sx = (x * z + ox) * s, sy = (y * z + oy) * s, sr = r * z * s;
      if (sx + sr < 0 || sy + sr < 0 || sx - sr > w || sy - sr > h) return;
      const gr = k.createRadialGradient(sx, sy, 0, sx, sy, sr);
      gr.addColorStop(0, `rgba(0,0,0,${strength})`);
      gr.addColorStop(0.6, `rgba(0,0,0,${strength * 0.6})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      k.fillStyle = gr;
      k.beginPath(); k.arc(sx, sy, sr, 0, TAU); k.fill();
    };
    for (const p of snap.pl) {
      if (p.s === 2) continue;
      const sp = this.smooth['p' + p.id] || p;
      light(sp.x, sp.y, 150, 0.9);
      if (p.s === 0) {
        // Taschenlampe in Blickrichtung
        const a = p.id === myId && this.lastAim !== undefined ? this.lastAim : p.a;
        const sx = (sp.x * z + ox) * s, sy = (sp.y * z + oy) * s, sr = 420 * z * s;
        const gr = k.createRadialGradient(sx, sy, 10, sx, sy, sr);
        gr.addColorStop(0, 'rgba(0,0,0,.95)'); gr.addColorStop(0.7, 'rgba(0,0,0,.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        k.fillStyle = gr;
        k.beginPath(); k.moveTo(sx, sy); k.arc(sx, sy, sr, a - 0.5, a + 0.5); k.closePath(); k.fill();
      }
    }
    if (power) {
      for (const [x, y] of this.map.lamps) light(x, y, 360, 0.75);
      for (const pk of this.map.perks) light(pk.x, pk.y, 120, 0.8);
      light(this.map.upgrade.x, this.map.upgrade.y, 140, 0.8);
    }
    light(this.map.box.x, this.map.box.y, 90, 0.6);
    for (const [x, y] of snap.parts) light(x, y, 60, 0.6);
    for (const u of snap.pu) light(u[1], u[2], 80, 0.7);
    for (const l of this.lights) light(l.x, l.y, l.r, l.life / l.max);
    for (const p of this.particles) if (p.glow && p.r > 5) light(p.x, p.y, p.r * 3, 0.5 * p.life / p.max);
    k.globalCompositeOperation = 'source-over';

    const g = this.g;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.drawImage(this.dark, 0, 0, this.W, this.H);
  }

  updateFx(dt) {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.drag) { p.vx *= Math.max(0, 1 - p.drag * dt); p.vy *= Math.max(0, 1 - p.drag * dt); }
      if (p.grow) p.r += p.grow * dt;
    }
    this.particles = this.particles.filter(p => p.life > 0);
    if (this.particles.length > 400) this.particles.splice(0, this.particles.length - 400);
    for (const t of this.tracers) t.life -= dt;
    this.tracers = this.tracers.filter(t => t.life > 0);
    for (const l of this.lights) l.life -= dt;
    this.lights = this.lights.filter(l => l.life > 0);
    for (const m of this.msgs) m.life -= dt;
    this.msgs = this.msgs.filter(m => m.life > 0);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    for (const k in this.smooth) if (this.time - this.smooth[k].seen > 1) delete this.smooth[k];
  }

  // ---------- Zusatzanzeigen in 3D: Fadenkreuz, Feuerknopf, Übersichtskarte ----------
  drawFpsHud(g, snap, me, input, touch) {
    const W = this.W, H = this.H;
    // Fadenkreuz
    if (me && me.s === 0) {
      const gap = input.state.fire ? 9 : 6;
      g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 2;
      g.beginPath();
      g.moveTo(W / 2 - gap - 8, H / 2); g.lineTo(W / 2 - gap, H / 2);
      g.moveTo(W / 2 + gap, H / 2); g.lineTo(W / 2 + gap + 8, H / 2);
      g.moveTo(W / 2, H / 2 - gap - 8); g.lineTo(W / 2, H / 2 - gap);
      g.moveTo(W / 2, H / 2 + gap); g.lineTo(W / 2, H / 2 + gap + 8);
      g.stroke();
    }
    // Feuerknopf (nur Touch)
    if (touch && me && me.s === 0) {
      const fb = { x: W - 120, y: H - 95, r: 46 };
      input.buttons.fire = fb;
      g.fillStyle = input.state.fire ? 'rgba(230,60,40,.85)' : 'rgba(200,40,30,.55)';
      g.beginPath(); g.arc(fb.x, fb.y, fb.r, 0, TAU); g.fill();
      g.strokeStyle = '#f88'; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#fff'; g.font = `bold 14px ${FONT}`; g.textAlign = 'center';
      g.fillText('FEUER', fb.x, fb.y + 5);
    } else input.buttons.fire = null;
    // Übersichtskarte: Ausschnitt um den Spieler, Blick nach oben
    if (me) {
      // links unter der Spielerliste
      const R = Math.min(62, H * 0.16), cx = 10 + R, cy = 14 + 26 * snap.pl.length + 34 + R;
      const scale = 0.12, a = (me.s === 0 ? input.state.a : me.a);
      g.save();
      g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.clip();
      g.fillStyle = '#000'; g.fillRect(cx - R, cy - R, R * 2, R * 2);
      g.translate(cx, cy); g.rotate(-a - Math.PI / 2); g.scale(scale, scale); g.translate(-me.x, -me.y);
      g.globalAlpha = 0.85;
      g.drawImage(this.floor, 0, 0);
      g.globalAlpha = 1;
      this.map.doors.forEach((d, i) => { if (!snap.doors[i]) { g.fillStyle = '#7a828b'; g.fillRect(d.rect.x, d.rect.y, d.rect.w, d.rect.h); } });
      const zs = snap.z;
      g.fillStyle = '#f33';
      for (let i = 0; i < zs.length; i += 7) { g.beginPath(); g.arc(zs[i + 2], zs[i + 3], 22, 0, TAU); g.fill(); }
      g.fillStyle = '#ffd34d';
      for (const [x, y] of snap.parts) { g.beginPath(); g.arc(x, y, 20, 0, TAU); g.fill(); }
      for (const p of snap.pl) {
        if (p.s === 2 || p.id === me.id) continue;
        g.fillStyle = CLASSES[p.c].color; g.beginPath(); g.arc(p.x, p.y, 28, 0, TAU); g.fill();
      }
      g.restore();
      g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 2;
      g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
      g.fillStyle = '#fff';
      g.beginPath(); g.moveTo(cx, cy - 7); g.lineTo(cx - 5, cy + 5); g.lineTo(cx + 5, cy + 5); g.closePath(); g.fill();
    }
  }

  // ---------- Anzeige (HUD) ----------
  drawHud(g, snap, me, input) {
    const W = this.W, H = this.H, touch = input.touchUsed;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.textBaseline = 'alphabetic';
    this.lastAim = input.state.a;

    // dunkle Ränder für die Horror-Optik (nur 3D)
    if (this.hudOnly) {
      if (!this.vignette || this.vignette.w !== W || this.vignette.h !== H) {
        const gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.55);
        gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.7, 'rgba(10,0,0,.35)'); gr.addColorStop(1, 'rgba(5,0,0,.8)');
        this.vignette = { w: W, h: H, gr };
      }
      g.fillStyle = this.vignette.gr; g.fillRect(0, 0, W, H);
    }

    // Roter Rand bei wenig Leben / Treffer
    if (me && me.s === 0) {
      const low = 1 - me.hp / me.mh;
      const al = Math.max(this.hurtFlash, low > 0.4 ? (low - 0.4) * 1.2 : 0);
      if (al > 0) {
        const gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
        gr.addColorStop(0, 'rgba(160,0,0,0)'); gr.addColorStop(1, `rgba(160,0,0,${Math.min(0.7, al)})`);
        g.fillStyle = gr; g.fillRect(0, 0, W, H);
      }
    }
    if (me && me.s === 1) { g.fillStyle = 'rgba(80,0,0,.35)'; g.fillRect(0, 0, W, H); }

    // Spielerliste oben links
    let y = 14;
    for (const p of snap.pl) {
      const cl = CLASSES[p.c];
      g.fillStyle = 'rgba(0,0,0,.5)'; roundRect(g, 8, y - 2, 230, 22, 6); g.fill();
      g.fillStyle = cl.color; g.beginPath(); g.arc(20, y + 9, 6, 0, TAU); g.fill();
      g.fillStyle = p.id === (me && me.id) ? '#ffd34d' : '#fff';
      g.font = `bold 12px ${FONT}`; g.textAlign = 'left';
      const st = p.s === 1 ? ` · UNTEN ${p.bl}s` : p.s === 2 ? ' · tot' : '';
      g.fillText(`P${p.n} ${cl.name}${st}`, 32, y + 13);
      g.textAlign = 'right'; g.fillStyle = '#ffd34d';
      g.fillText(p.pts, 232, y + 13);
      y += 26;
    }
    // Aktive Power-ups
    g.textAlign = 'left'; g.font = `bold 12px ${FONT}`;
    if (snap.ins) { g.fillStyle = POWERUPS.insta.color; g.fillText(`☠ Sofort-Kill ${snap.ins}s`, 12, y + 12); y += 18; }
    if (snap.dbl) { g.fillStyle = POWERUPS.double.color; g.fillText(`×2 Doppelte Punkte ${snap.dbl}s`, 12, y + 12); y += 18; }
    if (!snap.pw) { g.fillStyle = '#ffd34d'; g.fillText(`Strom-Teile: ${snap.pa}/3`, 12, y + 12); }

    // Rundenzahl unten links
    if (snap.r > 0) {
      g.font = `64px ${TITLE_FONT}`; g.textAlign = 'left';
      g.fillStyle = 'rgba(0,0,0,.6)'; g.fillText(snap.r, 22, H - 18);
      g.fillStyle = '#b81d1d'; g.fillText(snap.r, 18, H - 22);
    }
    if (snap.ph === 'pre' || snap.ph === 'break') {
      g.font = `bold 15px ${FONT}`; g.textAlign = 'center'; g.fillStyle = '#ddd';
      g.fillText(snap.ph === 'pre' ? `Spiel startet in ${snap.pt}` : `Nächste Runde in ${snap.pt}`, W / 2, 70);
    }

    // Waffe oben rechts (antippen = wechseln)
    if (me && me.s !== 2) {
      const sl = me.sl[me.cu];
      const ws = weaponStats(sl[0], sl[1]);
      const bw = 200, bx = W - bw - 8, by = 8, bh = me.sl.length > 1 ? 62 : 48;
      g.fillStyle = 'rgba(0,0,0,.55)'; roundRect(g, bx, by, bw, bh, 8); g.fill();
      g.textAlign = 'right'; g.fillStyle = sl[1] ? '#d7b4ff' : '#fff'; g.font = `bold 13px ${FONT}`;
      g.fillText(ws.name, bx + bw - 10, by + 18);
      g.font = `bold 20px ${FONT}`; g.fillStyle = sl[2] === 0 ? '#f55' : '#fff';
      g.fillText(me.rg ? '∞' : `${sl[2]} / ${sl[3]}`, bx + bw - 10, by + 41);
      if (me.rl > 0) { g.fillStyle = '#fff'; g.fillRect(bx + 10, by + 34, 70 * me.rl, 4); g.font = `11px ${FONT}`; g.textAlign = 'left'; g.fillText('Lädt…', bx + 10, by + 28); }
      if (me.sl.length > 1) {
        const o = me.sl[(me.cu + 1) % me.sl.length];
        g.textAlign = 'right'; g.font = `11px ${FONT}`; g.fillStyle = '#aaa';
        g.fillText((touch ? '⇄ ' : '[Tab] ') + weaponStats(o[0], o[1]).name, bx + bw - 10, by + 56);
      }
      input.buttons.weapon = { x: bx, y: by, w: bw, h: bh };
      // Perks
      me.pk.forEach((k, i) => {
        g.fillStyle = PERKS[k].color; g.beginPath(); g.arc(bx + bw - 14 - i * 26, by + bh + 16, 10, 0, TAU); g.fill();
        g.fillStyle = '#fff'; g.font = `bold 10px ${FONT}`; g.textAlign = 'center'; g.fillText(PERKS[k].name[0], bx + bw - 14 - i * 26, by + bh + 20);
      });
      // Lebensbalken
      if (me.s === 0) {
        g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(W / 2 - 80, H - 16, 160, 8);
        g.fillStyle = me.hp / me.mh < 0.35 ? '#e33' : '#5c5'; g.fillRect(W / 2 - 80, H - 16, 160 * me.hp / me.mh, 8);
        g.font = `bold 11px ${FONT}`; g.textAlign = 'left'; g.fillStyle = '#9cf';
        if (me.ar) g.fillText(`⛨ ${me.ar}`, W / 2 + 86, H - 8);
        if (me.adr) { g.fillStyle = '#ffd23a'; g.fillText(`⚡ ${me.adr}s`, W / 2 + 130, H - 8); }
      }
    } else input.buttons.weapon = null;

    // Meldungen
    let my = H * 0.24;
    for (const m of this.msgs) {
      const al = Math.min(1, m.life / 0.4, (m.max - m.life) / 0.15 + 0.2);
      g.globalAlpha = al; g.textAlign = 'center';
      g.font = m.big ? `${Math.min(52, W / 12)}px ${TITLE_FONT}` : `bold 17px ${FONT}`;
      g.fillStyle = 'rgba(0,0,0,.7)'; g.fillText(m.text, W / 2 + 2, my + 2);
      g.fillStyle = m.color; g.fillText(m.text, W / 2, my);
      my += m.big ? 52 : 26;
      g.globalAlpha = 1;
    }

    // Knöpfe und Hinweis zum Benutzen
    const pr = me && me.pr;
    // rechts am Rand, unterhalb der Waffenanzeige
    const top = 8 + (me && me.sl.length > 1 ? 62 : 48) + (me && me.pk.length ? 34 : 10);
    const abilB = { x: W - 44, y: Math.max(top + 32, H * 0.34), r: 28 };
    const useB = { x: W - 48, y: abilB.y + 80, r: 34 };
    input.buttons.use = pr ? useB : null;
    input.buttons.abil = me && me.s === 0 ? abilB : null;
    if (pr) {
      const txt = pr.cost ? `${pr.text}  [${pr.cost}]` : pr.text;
      g.font = `bold 15px ${FONT}`; g.textAlign = 'center';
      const tw = g.measureText(txt).width + 24;
      g.fillStyle = 'rgba(0,0,0,.65)'; roundRect(g, W / 2 - tw / 2, H - 70, tw, 30, 8); g.fill();
      g.fillStyle = pr.cost && me.pts < pr.cost ? '#f77' : '#fff';
      g.fillText(txt, W / 2, H - 50);
      if (!touch) { g.font = `12px ${FONT}`; g.fillStyle = '#aaa'; g.fillText(pr.hold ? 'E halten' : 'E drücken', W / 2, H - 78); }
      g.fillStyle = input.state.useHeld ? 'rgba(255,211,77,.8)' : 'rgba(255,211,77,.45)';
      g.beginPath(); g.arc(useB.x, useB.y, useB.r, 0, TAU); g.fill();
      g.strokeStyle = '#ffd34d'; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#111'; g.font = `bold 13px ${FONT}`; g.fillText(pr.hold ? 'HALTEN' : 'NUTZEN', useB.x, useB.y + 5);
    }
    if (me && me.s === 0) {
      const cl = CLASSES[me.c], ready = me.cd <= 0;
      g.fillStyle = ready ? cl.color : 'rgba(80,80,80,.6)';
      g.globalAlpha = ready ? 0.85 : 0.6;
      g.beginPath(); g.arc(abilB.x, abilB.y, abilB.r, 0, TAU); g.fill();
      g.globalAlpha = 1;
      g.fillStyle = ready ? '#111' : '#fff'; g.font = `bold 10px ${FONT}`; g.textAlign = 'center';
      g.fillText(ready ? cl.abil.toUpperCase() : me.cd + 's', abilB.x, abilB.y + 4);
      if (!touch) { g.fillStyle = '#aaa'; g.fillText('Q', abilB.x, abilB.y + abilB.r + 12); }
    }

    // Umschalten 2D / 3D
    const vb = { x: W / 2 - 34, y: 22, w: 68, h: 28 };
    input.buttons.view = vb;
    g.fillStyle = 'rgba(0,0,0,.55)'; roundRect(g, vb.x, vb.y, vb.w, vb.h, 8); g.fill();
    g.strokeStyle = '#7fd4ff'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = '#7fd4ff'; g.font = `bold 13px ${FONT}`; g.textAlign = 'center';
    g.fillText(this.hudOnly ? '2D' : '3D', W / 2, vb.y + 19);
    if (!touch) { g.font = `10px ${FONT}`; g.fillStyle = '#888'; g.fillText('V', W / 2, vb.y + vb.h + 11); }

    // Rucksack (Inventar + Fähigkeiten); Punkt zeigt freie Fähigkeitspunkte
    const bb = { x: W / 2 + 42, y: 22, w: 44, h: 28 };
    input.buttons.bag = bb;
    g.fillStyle = 'rgba(0,0,0,.55)'; roundRect(g, bb.x, bb.y, bb.w, bb.h, 8); g.fill();
    g.strokeStyle = '#ffd34d'; g.lineWidth = 1.5; g.stroke();
    g.font = `16px ${FONT}`; g.textAlign = 'center'; g.fillStyle = '#fff';
    g.fillText('🎒', bb.x + bb.w / 2, bb.y + 20);
    if (me && me.spt) {
      g.fillStyle = '#e33'; g.beginPath(); g.arc(bb.x + bb.w - 2, bb.y + 2, 9, 0, TAU); g.fill();
      g.fillStyle = '#fff'; g.font = `bold 11px ${FONT}`; g.fillText(me.spt, bb.x + bb.w - 2, bb.y + 6);
    }
    if (!touch) { g.font = `10px ${FONT}`; g.fillStyle = '#888'; g.fillText('I / K', bb.x + bb.w / 2, bb.y + bb.h + 11); }
    // Schnellknöpfe Verbandskasten / Granate
    const quick = [['qmed', 'medkit', 'H'], ['qgren', 'grenade', 'G']];
    let qx = W - 44 - 66;
    for (const [btn, k, key] of quick) {
      const n = me && me.s === 0 ? me.inv.filter(x => x.k === k).reduce((a, x) => a + x.n, 0) : 0;
      if (!n) { input.buttons[btn] = null; continue; }
      const qb = { x: qx, y: (input.buttons.abil ? input.buttons.abil.y : H * 0.34), r: 22 };
      input.buttons[btn] = qb;
      const c = CONSUMABLES[k];
      g.fillStyle = 'rgba(0,0,0,.6)'; g.beginPath(); g.arc(qb.x, qb.y, qb.r, 0, TAU); g.fill();
      g.strokeStyle = c.color; g.lineWidth = 2; g.stroke();
      g.fillStyle = c.color; g.font = `bold 15px ${FONT}`; g.textAlign = 'center'; g.fillText(c.icon, qb.x, qb.y + 5);
      g.fillStyle = '#fff'; g.font = `bold 10px ${FONT}`; g.fillText(n, qb.x + 14, qb.y + 18);
      if (!touch) { g.fillStyle = '#888'; g.fillText(key, qb.x, qb.y - 26); }
      qx -= 54;
    }

    if (this.hudOnly) this.drawFpsHud(g, snap, me, input, touch);
    else input.buttons.fire = null;

    // Joysticks
    for (const st of [input.move, input.aim]) {
      if (!st) continue;
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 3;
      g.beginPath(); g.arc(st.ox, st.oy, input.R, 0, TAU); g.stroke();
      const dx = st.x - st.ox, dy = st.y - st.oy, l = Math.hypot(dx, dy), f = l > input.R ? input.R / l : 1;
      g.fillStyle = st === input.aim && input.state.fire ? 'rgba(255,90,60,.6)' : 'rgba(255,255,255,.45)';
      g.beginPath(); g.arc(st.ox + dx * f, st.oy + dy * f, 24, 0, TAU); g.fill();
    }
    if (touch && this.hudOnly && !input.move && !input.look && snap.r <= 1 && snap.ph !== 'active') {
      g.fillStyle = 'rgba(255,255,255,.5)'; g.font = `bold 13px ${FONT}`; g.textAlign = 'center';
      g.fillText('Links: laufen', W * 0.25, H - 40);
      g.fillText('Rechts wischen: umsehen · Roter Knopf: schießen', W * 0.68, H - 40);
    } else if (touch && !this.hudOnly && !input.move && !input.aim && snap.r <= 1 && snap.ph !== 'active') {
      g.fillStyle = 'rgba(255,255,255,.5)'; g.font = `bold 13px ${FONT}`; g.textAlign = 'center';
      g.fillText('Links: laufen', W * 0.25, H - 40);
      g.fillText('Rechts ziehen: zielen + schießen', W * 0.75, H - 40);
    }
  }
}
