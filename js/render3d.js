// Ich-Perspektive (3D) mit three.js. Zeigt dieselbe Spielwelt wie die 2D-Ansicht.
// Koordinaten: Welt-x -> 3D-x, Welt-y -> 3D-z, Höhe = 3D-y.
const WALL_H = 120, EYE = 56;

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return t;
}

// Textur-Koordinaten einer Box an ihre Größe anpassen, damit Muster nicht verzerrt
function scaleBoxUV(geo, w, h, d, unit) {
  const uv = geo.attributes.uv;
  const faces = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const k = f * 4 + i;
    uv.setXY(k, uv.getX(k) * faces[f][0] / unit, uv.getY(k) * faces[f][1] / unit);
  }
}

class Renderer3D {
  constructor(canvas, r2d) {
    this.r2d = r2d;
    this.map = r2d.map;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.gl.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070a);
    this.scene.fog = new THREE.FogExp2(0x05070a, 0.0024);
    this.cam = new THREE.PerspectiveCamera(72, 1, 1, 3000);
    this.scene.add(this.cam);
    this.smooth = {};
    this.zMeshes = new Map();
    this.pMeshes = new Map();
    this.time = 0;
    this.kick = 0;
    this.decalT = 0;
    this.yaw = 0;

    this.ambient = new THREE.AmbientLight(0x8890a0, 0.22);
    this.hemi = new THREE.HemisphereLight(0x9fb4ff, 0x302820, 0.0);
    this.scene.add(this.ambient, this.hemi);
    // Taschenlampe
    this.flash = new THREE.SpotLight(0xfff2d0, 1.6, 900, 0.55, 0.45, 1);
    this.flash.position.set(0, -5, 0);
    this.flash.target.position.set(0, -12, -100);
    this.cam.add(this.flash, this.flash.target);
    // Mündungsfeuer (immer vorhanden, nur Helligkeit ändert sich)
    this.muzzle = new THREE.PointLight(0xffcc66, 0, 400, 1.5);
    this.muzzle.position.set(6, -6, -30);
    this.cam.add(this.muzzle);

    this.buildWorld();
    this.buildViewmodel();
    this.buildFx();
    this.resize();
  }

  resize() {
    const W = innerWidth, H = innerHeight;
    this.gl.setSize(W, H, false);
    this.cam.aspect = W / H;
    this.cam.fov = W / H > 1.6 ? 68 : 75;
    this.cam.updateProjectionMatrix();
  }

  // ---------- Welt aufbauen ----------
  buildWorld() {
    const m = this.map, S = this.scene;
    // Boden: die gezeichnete 2D-Karte als Textur
    const fc = document.createElement('canvas');
    fc.width = 2048; fc.height = Math.round(2048 * MAP_H / MAP_W);
    fc.getContext('2d').drawImage(this.r2d.floor, 0, 0, fc.width, fc.height);
    const ft = new THREE.CanvasTexture(fc);
    ft.minFilter = THREE.LinearFilter; ft.generateMipmaps = false;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(MAP_W, MAP_H), new THREE.MeshLambertMaterial({ map: ft }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(MAP_W / 2, 0, MAP_H / 2);
    S.add(floor);
    // Blut-Ebene
    this.decalTex = new THREE.CanvasTexture(this.r2d.decals);
    this.decalTex.minFilter = THREE.LinearFilter; this.decalTex.generateMipmaps = false;
    const dec = new THREE.Mesh(new THREE.PlaneGeometry(MAP_W, MAP_H),
      new THREE.MeshLambertMaterial({ map: this.decalTex, transparent: true, depthWrite: false }));
    dec.rotation.x = -Math.PI / 2;
    dec.position.set(MAP_W / 2, 0.6, MAP_H / 2);
    S.add(dec);

    // Wände
    const brick = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#5a554d'; g.fillRect(0, 0, w, h);
      for (let row = 0; row < 8; row++) for (let col = -1; col < 4; col++) {
        const x = col * 40 + (row % 2 ? 20 : 0), y = row * 16;
        const v = 70 + Math.random() * 30;
        g.fillStyle = `rgb(${v + 12},${v + 4},${v - 6})`;
        g.fillRect(x + 1, y + 1, 38, 14);
      }
      g.fillStyle = 'rgba(0,0,0,.15)'; g.fillRect(0, 100, w, 28);
    });
    brick.wrapS = brick.wrapT = THREE.RepeatWrapping;
    const wallMat = new THREE.MeshLambertMaterial({ map: brick });
    for (const w of m.walls) {
      const geo = new THREE.BoxGeometry(w.w, WALL_H, w.h);
      scaleBoxUV(geo, w.w, WALL_H, w.h, 80);
      const mesh = new THREE.Mesh(geo, wallMat);
      mesh.position.set(w.x + w.w / 2, WALL_H / 2, w.y + w.h / 2);
      S.add(mesh);
    }
    // Fenster: Sturz oben + Bretter
    const plankMat = [new THREE.MeshLambertMaterial({ color: 0x8a6a40 }), new THREE.MeshLambertMaterial({ color: 0x6e5230 })];
    this.windows = m.windows.map(w => {
      const r = w.rect;
      const lint = new THREE.Mesh(new THREE.BoxGeometry(r.w, 30, r.h), wallMat);
      lint.position.set(r.x + r.w / 2, WALL_H - 15, r.y + r.h / 2);
      const sill = new THREE.Mesh(new THREE.BoxGeometry(r.w, 12, r.h), wallMat);
      sill.position.set(r.x + r.w / 2, 6, r.y + r.h / 2);
      S.add(lint, sill);
      const planks = [];
      for (let i = 0; i < CFG.MAX_PLANKS; i++) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(w.horizontal ? 84 : 5, 9, w.horizontal ? 5 : 84), plankMat[i % 2]);
        p.position.set(w.x, 22 + i * 14, w.y);
        p.rotation[w.horizontal ? 'z' : 'x'] = i % 2 ? 0.12 : -0.12;
        S.add(p); planks.push(p);
      }
      return planks;
    });
    // Türen (Rolltore)
    const shutter = canvasTex(64, 64, (g, w, h) => {
      g.fillStyle = '#6a7179'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 8) { g.fillStyle = '#7f8790'; g.fillRect(0, y, w, 5); }
      g.fillStyle = '#d4b020'; g.fillRect(0, 28, w, 8);
    });
    shutter.wrapS = shutter.wrapT = THREE.RepeatWrapping;
    const doorMat = new THREE.MeshLambertMaterial({ map: shutter });
    this.doors = m.doors.map(d => {
      const r = d.rect;
      const geo = new THREE.BoxGeometry(r.w, WALL_H, r.h);
      scaleBoxUV(geo, r.w, WALL_H, r.h, 60);
      const mesh = new THREE.Mesh(geo, doorMat);
      mesh.position.set(r.x + r.w / 2, WALL_H / 2, r.y + r.h / 2);
      // Schild auf beiden Seiten der Tür, damit es nicht in der Wand steckt
      const lbls = [-1, 1].map(side => {
        const lbl = this.label(`Tür → ${m.rooms[d.opens].name}  ${d.cost}`, '#ffd34d');
        lbl.position.set(d.x + (d.horizontal ? 0 : side * 30), 95, d.y + (d.horizontal ? side * 30 : 0));
        S.add(lbl);
        return lbl;
      });
      S.add(mesh);
      return [mesh, lbls];
    });

    // Hindernisse
    const box = (x, y, w, d, h, color, emissive) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color, emissive: emissive || 0 }));
      mesh.position.set(x + w / 2, h / 2, y + d / 2);
      S.add(mesh);
      return mesh;
    };
    for (const d of m.decor) {
      if (d.kind === 'car' || d.kind === 'car2') {
        const col = d.kind === 'car' ? 0x7a2b25 : 0x2f4f6e;
        box(d.x, d.y, d.w, d.h, 30, col).position.y = 20;
        const hor = d.w > d.h;
        const top = box(d.x + (hor ? d.w * 0.22 : 6), d.y + (hor ? 6 : d.h * 0.22), hor ? d.w * 0.5 : d.w - 12, hor ? d.h - 12 : d.h * 0.5, 22, 0x1d2a33);
        top.position.y = 46;
        for (const [wx, wy] of [[0.15, 0], [0.85, 0], [0.15, 1], [0.85, 1]]) {
          const wh = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 8, 10), new THREE.MeshLambertMaterial({ color: 0x111111 }));
          wh.rotation[hor ? 'x' : 'z'] = Math.PI / 2;
          wh.position.set(hor ? d.x + d.w * wx : d.x + d.w * wy, 9, hor ? d.y + d.h * wy : d.y + d.h * wx);
          S.add(wh);
        }
      } else if (d.kind === 'pump') {
        box(d.x, d.y, d.w, d.h, 80, 0xb8312b);
        box(d.x + 4, d.y + 10, d.w - 8, 20, 30, 0xeeeeee).position.y = 62;
      } else if (d.kind === 'bed') {
        box(d.x, d.y, d.w, d.h, 26, 0xe9ecef).position.y = 18;
        box(d.x, d.y, d.w, d.h, 6, 0x8a9196).position.y = 4;
      } else if (d.kind === 'crate') {
        box(d.x, d.y, d.w, d.h, d.w, 0x6b5636);
      }
    }
    // Dach über der Tankinsel
    { const r = box(1930, 990, 310, 220, 8, 0xc7c2b5); r.position.y = 150; }

    // Wandwaffen
    for (const b of m.wallbuys) {
      const off = { n: [0, -11], s: [0, 11], e: [11, 0], w: [-11, 0] }[b.side];
      const lbl = this.label(`${WEAPONS[b.w].name}  ${b.cost}`, '#ece6d2', 'rgba(30,25,20,.85)');
      lbl.position.set(b.x + off[0] * 1.8, 62, b.y + off[1] * 1.8);
      S.add(lbl);
    }
    // Perk-Automaten
    this.perkMeshes = m.perks.map(k => {
      const pk = PERKS[k.p];
      const mesh = box(k.x - 22, k.y - 16, 44, 32, 90, 0x444444);
      const lbl = this.label(`${pk.name}  ${pk.cost}`, pk.color);
      lbl.position.set(k.x, 110, k.y);
      S.add(lbl);
      return { mesh, color: new THREE.Color(pk.color) };
    });
    // Strom-Hebel, Verstärker, Wunderkiste
    this.leverMesh = box(m.lever.x - 40, m.lever.y - 15, 80, 30, 70, 0x2c3036);
    this.leverLbl = this.label('Strom', '#aaa'); this.leverLbl.position.set(m.lever.x, 95, m.lever.y); S.add(this.leverLbl);
    this.upMesh = box(m.upgrade.x - 34, m.upgrade.y - 24, 68, 48, 80, 0x3a3540);
    const ul = this.label(`Verstärker  ${CFG.UPGRADE_COST}`, '#d7b4ff'); ul.position.set(m.upgrade.x, 105, m.upgrade.y); S.add(ul);
    this.boxMesh = box(m.box.x - 30, m.box.y - 16, 60, 32, 30, 0x6b4a2a, 0x0a1a22);
    const bl = this.label(`Wunderkiste  ${CFG.BOX_COST}`, '#7fe0ff'); bl.position.set(m.box.x, 60, m.box.y); S.add(bl);
    this.boxWeapon = this.label('', '#ffd34d');
    this.boxWeapon.position.set(m.box.x, 85, m.box.y);
    S.add(this.boxWeapon);
    this.boxWeaponText = '';

    // Lampen (leuchten erst mit Strom)
    this.lampMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
    for (const [x, y] of m.lamps) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(6, 8, 6), this.lampMat);
      l.position.set(x, WALL_H + 10, y);
      S.add(l);
    }

    // Teile, Power-ups, Geschütztürme (Pools)
    this.partMeshes = [0, 1, 2].map(() => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffd34d }));
      S.add(mesh); mesh.visible = false; return mesh;
    });
    this.puMeshes = [];
    this.turretMeshes = [];
  }

  // Schild mit Text, das sich immer zur Kamera dreht
  label(text, color, bg = 'rgba(0,0,0,.65)') {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 64;
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sp.userData = { c, tex, color, bg };
    this.setLabel(sp, text);
    return sp;
  }

  setLabel(sp, text) {
    const { c, tex, color, bg } = sp.userData;
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    if (text) {
      g.font = `bold 34px ${FONT}`;
      const w = Math.min(c.width, g.measureText(text).width + 30);
      g.fillStyle = bg; roundRect(g, (c.width - w) / 2, 6, w, 52, 12); g.fill();
      g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, c.width / 2, 33);
    }
    tex.needsUpdate = true;
    sp.scale.set(96, 12, 1);
  }

  // ---------- Figuren ----------
  makeHumanoid(bodyColor, headColor, eyeColor, legColor) {
    const g = new THREE.Group();
    const mat = c => new THREE.MeshLambertMaterial({ color: c });
    const legs = [-5, 5].map(z => {
      const l = new THREE.Mesh(new THREE.BoxGeometry(7, 26, 7), mat(legColor));
      l.geometry.translate(0, -13, 0);
      l.position.set(0, 26, z); g.add(l); return l;
    });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(12, 26, 20), mat(bodyColor));
    torso.position.set(0, 39, 0);
    const head = new THREE.Mesh(new THREE.BoxGeometry(13, 13, 13), mat(headColor));
    head.position.set(1, 59, 0);
    g.add(torso, head);
    if (eyeColor) {
      for (const z of [-3, 3]) {
        const e = new THREE.Mesh(new THREE.BoxGeometry(2, 2.5, 2.5), new THREE.MeshBasicMaterial({ color: eyeColor }));
        e.position.set(7.6, 61, z); g.add(e);
      }
    }
    const arms = [-12, 12].map(z => {
      const a = new THREE.Mesh(new THREE.BoxGeometry(22, 5, 5), mat(headColor));
      a.geometry.translate(11, 0, 0);
      a.position.set(0, 47, z); g.add(a); return a;
    });
    g.userData = { legs, arms, torso, head };
    return g;
  }

  zombieMesh(type) {
    const t = ZTYPES[type];
    const head = type === 3 ? 0x7d5a80 : type === 1 ? 0xa58070 : 0x8a9a6a;
    const eye = type === 3 || type === 1 ? 0xff3b2f : 0xe8e070;
    const g = this.makeHumanoid(new THREE.Color(t.color).getHex(), head, eye, 0x2f3328);
    g.scale.setScalar(t.r / 14 * (type === 3 ? 1.05 : 1));
    return g;
  }

  playerMesh(cls) {
    const c = CLASSES[cls];
    const helmet = cls === 'soldat' ? 0x4a6b35 : cls === 'tech' ? 0xe8c020 : 0xf2f2f2;
    const g = this.makeHumanoid(new THREE.Color(c.color).getHex(), 0xd9a982, null, 0x2b2b30);
    g.userData.head.material = new THREE.MeshLambertMaterial({ color: helmet });
    const gun = new THREE.Mesh(new THREE.BoxGeometry(26, 5, 5), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    gun.position.set(22, 47, 6);
    g.add(gun);
    const tag = this.label('', '#fff');
    tag.position.set(0, 82, 0);
    tag.scale.set(60, 7.5, 1);
    g.add(tag);
    g.userData.tag = tag;
    return g;
  }

  // ---------- Waffe in der Hand ----------
  buildViewmodel() {
    this.vm = new THREE.Group();
    // leichtes Eigenleuchten, damit die Waffe auch im Dunkeln sichtbar ist
    this.vmGun = new THREE.Mesh(new THREE.BoxGeometry(5, 6, 30), new THREE.MeshLambertMaterial({ color: 0x2a2a2a, emissive: 0x1c1c1c }));
    this.vmGun.position.set(0, 0, -6);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(4, 10, 5), new THREE.MeshLambertMaterial({ color: 0x1a1a1a, emissive: 0x141414 }));
    grip.position.set(0, -6, 4);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(6, 6, 8), new THREE.MeshLambertMaterial({ color: 0xd9a982, emissive: 0x3a2618 }));
    hand.position.set(0, -7, 6);
    this.vm.add(this.vmGun, grip, hand);
    this.vm.position.set(10, -10, -22);
    this.cam.add(this.vm);
    this.vmFlash = new THREE.Mesh(new THREE.SphereGeometry(3.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffdd88, transparent: true, opacity: 0 }));
    this.vm.add(this.vmFlash);
    this.vmId = null;
  }

  updateViewmodel(me, dt) {
    const sl = me.sl[me.cu];
    const key = sl[0] + sl[1];
    if (key !== this.vmId) {
      this.vmId = key;
      const len = { pistol: 14, shotgun: 30, smg: 22, rifle: 32, dmr: 36, lmg: 34, flame: 30, plasma: 26, sniper: 40 }[sl[0]] || 20;
      this.vmGun.scale.z = len / 30;
      this.vmGun.position.z = -len / 2 + 6;
      this.vmFlash.position.set(0, 1, -len + 4);
      const col = sl[1] ? 0x7a4ac0 : sl[0] === 'plasma' ? 0x3a8a4a : sl[0] === 'flame' ? 0x8a3a20 : 0x2a2a2a;
      this.vmGun.material.color.setHex(col);
      this.vmGun.material.emissive.setHex(sl[1] ? 0x301050 : 0x1c1c1c);
    }
    this.kick = Math.max(0, this.kick - dt * 8);
    const bob = me.s === 0 ? Math.sin(this.time * 9) * 0.6 : 0;
    const reload = me.rl > 0 ? Math.sin(me.rl * Math.PI) : 0;
    this.vm.position.set(10, -10 + bob - reload * 8, -22 + this.kick * 5);
    this.vm.rotation.x = this.kick * 0.25 - reload * 0.8;
    this.vmFlash.material.opacity = this.kick > 0.6 ? 1 : 0;
    this.vm.visible = me.s === 0;
  }

  // ---------- Effekte ----------
  buildFx() {
    this.tracers = [];
    for (let i = 0; i < 40; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0 }));
      line.visible = false; line.userData.life = 0;
      this.scene.add(line); this.tracers.push(line);
    }
    this.sprites = [];
    const dot = canvasTex(32, 32, (g) => {
      const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    });
    for (let i = 0; i < 150; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, transparent: true, depthWrite: false }));
      sp.visible = false; sp.userData = { life: 0 };
      this.scene.add(sp); this.sprites.push(sp);
    }
    this.spriteI = 0;
    this.flashLife = 0;
  }

  spark(x, y, h, vx, vy, vh, life, size, color, glow) {
    const sp = this.sprites[this.spriteI++ % this.sprites.length];
    sp.visible = true;
    sp.position.set(x, h, y);
    sp.material.color.set(color);
    sp.material.blending = glow ? THREE.AdditiveBlending : THREE.NormalBlending;
    sp.scale.set(size, size, 1);
    Object.assign(sp.userData, { vx, vy, vh, life, max: life, size, grow: glow ? size * 2 : 0 });
  }

  onEvents(evs, myId) {
    for (const e of evs) {
      if (e.k === 'shot') {
        const tr = this.tracers.find(t => !t.visible) || this.tracers[0];
        const mine = e.id === myId;
        const pos = tr.geometry.attributes.position;
        // eigene Schüsse starten unten rechts (an der Waffe)
        const sx = mine ? e.x + Math.cos(this.yaw + 0.5) * 8 : e.x, sy = mine ? e.y + Math.sin(this.yaw + 0.5) * 8 : e.y;
        pos.setXYZ(0, sx, mine ? EYE - 12 : 47, sy);
        pos.setXYZ(1, e.x2, 45, e.y2);
        pos.needsUpdate = true;
        tr.geometry.computeBoundingSphere();
        tr.material.color.setHex(e.w === 'plasma' ? 0x78ff8c : e.up ? 0xc88cff : 0xffe6a0);
        tr.visible = true; tr.userData.life = e.w === 'plasma' ? 0.15 : 0.07;
        if (mine) { this.kick = 1; this.flashLife = 0.05; }
      } else if (e.k === 'hit') {
        for (let i = 0; i < 3; i++) this.spark(e.x, e.y, rnd(35, 55), rnd(-60, 60), rnd(-60, 60), rnd(0, 60), 0.3, 3, 0x8a0808, false);
      } else if (e.k === 'kill') {
        for (let i = 0; i < 8; i++) this.spark(e.x, e.y, rnd(20, 55), rnd(-120, 120), rnd(-120, 120), rnd(20, 120), 0.5, 4, 0x7a0606, false);
        this.decalDirty = true;
      } else if (e.k === 'flame') {
        for (let i = 0; i < 3; i++) {
          const a = e.a + rnd(-0.3, 0.3), sp = rnd(320, 460);
          this.spark(e.x, e.y, EYE - 14, Math.cos(a) * sp, Math.sin(a) * sp, rnd(-10, 30), 0.4, 10, e.up ? 0xaa78ff : 0xff8c28, true);
        }
        if (e.id === myId) { this.kick = 0.4; this.flashLife = 0.05; }
      } else if (e.k === 'boom') {
        for (let i = 0; i < 20; i++) {
          const a = rnd(0, TAU), sp = rnd(80, 280);
          this.spark(e.x, e.y, rnd(10, 60), Math.cos(a) * sp, Math.sin(a) * sp, rnd(0, 150), 0.5, 18, 0x8cff96, true);
        }
      } else if (e.k === 'tear' || e.k === 'plank') {
        for (let i = 0; i < 5; i++) this.spark(e.x, e.y, rnd(20, 80), rnd(-100, 100), rnd(-100, 100), rnd(0, 80), 0.5, 4, 0x78552d, false);
      }
    }
  }

  // ---------- Zeichnen ----------
  draw(snap, myId, input, dt) {
    this.time += dt;
    const me = snap.pl.find(p => p.id === myId);
    const k = 1 - Math.exp(-dt * 18);
    const sm = (key, x, y) => {
      let s = this.smooth[key];
      if (!s || Math.abs(s.x - x) + Math.abs(s.y - y) > 160) s = this.smooth[key] = { x, y };
      s.x += (x - s.x) * k; s.y += (y - s.y) * k; s.seen = this.time;
      return s;
    };

    // Kamera = eigene Augen
    if (me) {
      const s = me.id === 'host' ? { x: me.x, y: me.y } : sm('p' + me.id, me.x, me.y);
      this.yaw = me.s === 0 ? input.state.a : me.a;
      const eye = me.s === 1 ? 18 : me.s === 2 ? 300 : EYE;
      this.cam.position.set(s.x, eye, s.y);
      const pitch = me.s === 2 ? -1.2 : -0.06;
      this.cam.lookAt(s.x + Math.cos(this.yaw) * 100, eye + Math.tan(pitch) * 100, s.y + Math.sin(this.yaw) * 100);
      this.updateViewmodel(me, dt);
    }

    // Strom: Licht an
    const power = !!snap.pw;
    if (power !== this.power) {
      this.power = power;
      this.ambient.intensity = power ? 0.55 : 0.22;
      this.hemi.intensity = power ? 0.45 : 0;
      this.scene.fog.density = power ? 0.0011 : 0.0024;
      this.lampMat.color.setHex(power ? 0xfff2c0 : 0x333333);
      for (const p of this.perkMeshes) {
        p.mesh.material.color.copy(power ? p.color : new THREE.Color(0x444444));
        p.mesh.material.emissive.copy(power ? p.color.clone().multiplyScalar(0.4) : new THREE.Color(0));
      }
      this.upMesh.material.color.setHex(power ? 0x5b2d8a : 0x3a3540);
      this.upMesh.material.emissive.setHex(power ? 0x3a1060 : 0);
      this.leverMesh.material.emissive.setHex(power ? 0x103040 : 0);
    }
    this.setLabelOnce(this.leverLbl, power ? 'Strom ist an' : `Strom-Hebel  ${snap.pa}/3 Teile`);

    // Türen, Fenster
    this.doors.forEach(([mesh, lbls], i) => { mesh.visible = !snap.doors[i]; for (const l of lbls) l.visible = mesh.visible; });
    this.windows.forEach((planks, i) => planks.forEach((p, j) => { p.visible = j < snap.win[i]; }));

    // Wunderkiste
    const [bs, bw, , bt] = snap.box;
    let bwText = '';
    if (bs === 'spin') { const keys = Object.keys(BOX_POOL); bwText = WEAPONS[keys[Math.floor(this.time * 10) % keys.length]].name; }
    else if (bs === 'offer') bwText = WEAPONS[bw].name;
    this.setLabelOnce(this.boxWeapon, bwText);
    this.boxWeapon.position.y = bs === 'spin' ? 50 + (3 - bt) * 12 : 86;
    this.boxMesh.material.emissive.setHex(bs === 'idle' ? 0x0a2a38 : 0x40ffff);

    // Teile
    this.partMeshes.forEach((mesh, i) => {
      const p = snap.parts[i];
      mesh.visible = !!p;
      if (p) { mesh.position.set(p[0], 18 + Math.sin(this.time * 3 + i) * 4, p[1]); mesh.rotation.y = this.time * 2; }
    });
    // Power-ups
    while (this.puMeshes.length < snap.pu.length) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(16, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      this.scene.add(m); this.puMeshes.push(m);
    }
    this.puMeshes.forEach((m, i) => {
      const u = snap.pu[i];
      m.visible = !!u && !(u[4] < 6 && Math.floor(this.time * 6) % 2);
      if (u) { m.position.set(u[1], 24 + Math.sin(this.time * 4) * 4, u[2]); m.rotation.y = this.time * 2; m.rotation.x = 0.5; m.material.color.set(POWERUPS[u[3]].color); }
    });
    // Geschütztürme
    while (this.turretMeshes.length < snap.tu.length) {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(12, 14, 24, 10), new THREE.MeshLambertMaterial({ color: 0x6a5a3a }));
      base.position.y = 12;
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(26, 5, 5), new THREE.MeshLambertMaterial({ color: 0x333333 }));
      barrel.geometry.translate(13, 0, 0); barrel.position.y = 28;
      g.add(base, barrel); g.userData.barrel = barrel;
      this.scene.add(g); this.turretMeshes.push(g);
    }
    this.turretMeshes.forEach((g, i) => {
      const t = snap.tu[i];
      g.visible = !!t;
      if (t) { g.position.set(t[0], 0, t[1]); g.userData.barrel.rotation.y = -t[2]; }
    });

    // Zombies
    const seen = new Set();
    const zs = snap.z;
    for (let i = 0; i < zs.length; i += 7) {
      const id = zs[i], type = zs[i + 1];
      let mesh = this.zMeshes.get(id);
      if (!mesh) { mesh = this.zombieMesh(type); this.scene.add(mesh); this.zMeshes.set(id, mesh); }
      seen.add(id);
      const s = sm('z' + id, zs[i + 2], zs[i + 3]);
      mesh.position.set(s.x, 0, s.y);
      mesh.rotation.y = -zs[i + 4] / 100;
      this.animate(mesh, type === 1 ? 14 : 7, id, zs[i + 6]);
    }
    for (const [id, mesh] of this.zMeshes) if (!seen.has(id)) { this.scene.remove(mesh); this.zMeshes.delete(id); }

    // Mitspieler
    const pseen = new Set();
    for (const p of snap.pl) {
      if (p.id === myId || p.s === 2) continue;
      let mesh = this.pMeshes.get(p.id);
      if (!mesh || mesh.userData.cls !== p.c) {
        if (mesh) this.scene.remove(mesh);
        mesh = this.playerMesh(p.c); mesh.userData.cls = p.c;
        this.scene.add(mesh); this.pMeshes.set(p.id, mesh);
      }
      pseen.add(p.id);
      const s = sm('p' + p.id, p.x, p.y);
      mesh.position.set(s.x, 0, s.y);
      mesh.rotation.y = -p.a;
      mesh.rotation.z = p.s === 1 ? -1.4 : 0;
      mesh.position.y = p.s === 1 ? 8 : 0;
      this.setLabelOnce(mesh.userData.tag, p.s === 1 ? `P${p.n} am Boden ${p.bl}s` : `P${p.n}`);
      this.animate(mesh, 9, p.n, 0);
    }
    for (const [id, mesh] of this.pMeshes) if (!pseen.has(id)) { this.scene.remove(mesh); this.pMeshes.delete(id); }

    // Effekte
    for (const t of this.tracers) {
      if (!t.visible) continue;
      t.userData.life -= dt;
      t.material.opacity = Math.max(0, t.userData.life / 0.07);
      if (t.userData.life <= 0) t.visible = false;
    }
    for (const sp of this.sprites) {
      const u = sp.userData;
      if (!sp.visible) continue;
      u.life -= dt;
      if (u.life <= 0) { sp.visible = false; continue; }
      sp.position.x += u.vx * dt; sp.position.z += u.vy * dt; sp.position.y = Math.max(1, sp.position.y + u.vh * dt);
      u.vh -= 300 * dt;
      const s = u.size + u.grow * (1 - u.life / u.max);
      sp.scale.set(s, s, 1);
      sp.material.opacity = u.life / u.max;
    }
    this.flashLife -= dt;
    this.muzzle.intensity = this.flashLife > 0 ? 2.5 : 0;

    // Blut auf dem Boden ab und zu aktualisieren
    this.decalT -= dt;
    if (this.decalDirty && this.decalT <= 0) { this.decalTex.needsUpdate = true; this.decalDirty = false; this.decalT = 0.4; }

    for (const key in this.smooth) if (this.time - this.smooth[key].seen > 1) delete this.smooth[key];
    this.gl.render(this.scene, this.cam);
  }

  setLabelOnce(sp, text) {
    if (sp.userData.text === text) return;
    sp.userData.text = text;
    this.setLabel(sp, text);
    if (sp.parent && sp.parent.type === 'Group') sp.scale.set(60, 7.5, 1);
  }

  // Lauf- und Angriffsbewegung
  animate(mesh, speed, seed, attacking) {
    const u = mesh.userData, sw = Math.sin(this.time * speed + seed) * 0.5;
    u.legs[0].rotation.z = sw; u.legs[1].rotation.z = -sw;
    const reach = attacking ? 0.45 : 0;
    u.arms[0].rotation.z = reach + sw * 0.15; u.arms[1].rotation.z = reach - sw * 0.15;
  }
}
