// Ich-Perspektive (3D) mit three.js. Zeigt dieselbe Spielwelt wie die 2D-Ansicht.
// Koordinaten: Welt-x -> 3D-x, Welt-y -> 3D-z, Höhe = 3D-y.
const WALL_H = 120, EYE = 56, GRAV = 900;

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

const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerpAng = (a, b, k) => a + angDiff(b, a) * k;

// Rückstoß je Waffe: kick = nach hinten, rise = hochreißen, cam = Kamera, shake = Wackeln
const RECOIL = {
  pistol: { kick: 3, rise: 0.22, cam: 0.014, shake: 0.4 }, shotgun: { kick: 8, rise: 0.5, cam: 0.05, shake: 2 },
  smg: { kick: 1.5, rise: 0.07, cam: 0.006, shake: 0.5 }, rifle: { kick: 2.6, rise: 0.11, cam: 0.01, shake: 0.7 },
  dmr: { kick: 5, rise: 0.28, cam: 0.03, shake: 1.2 }, lmg: { kick: 2.4, rise: 0.09, cam: 0.009, shake: 0.9 },
  flame: { kick: 0.4, rise: 0.01, cam: 0, shake: 0.3 }, plasma: { kick: 3, rise: 0.16, cam: 0.012, shake: 0.6 },
  sniper: { kick: 9, rise: 0.55, cam: 0.065, shake: 2.2 },
};

class Renderer3D {
  constructor(canvas, r2d) {
    this.r2d = r2d;
    this.sfx = r2d.sfx;
    this.map = r2d.map;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.pr = Math.min(devicePixelRatio || 1, 1.5);
    this.gl.setPixelRatio(this.pr);
    this.fpsAvg = 60; this.qualT = 3;
    this.scene = new THREE.Scene();
    this.fogCol = new THREE.Color(0x0b0e0d);
    this.scene.background = this.fogCol;
    this.scene.fog = new THREE.FogExp2(this.fogCol, 0.0017);
    this.cam = new THREE.PerspectiveCamera(72, 1, 0.5, 3000);
    this.scene.add(this.cam);
    this.smooth = {};
    this.zMeshes = new Map();
    this.pMeshes = new Map();
    this.corpses = [];
    this.gibs = [];
    this.stumps = [];
    this.time = 0;
    this.decalT = 0;
    this.yaw = 0; this.lastYaw = 0; this.yawVel = 0;
    this.bob = 0; this.lastStep = 0;
    this.lastPos = null; this.speed = 0;
    this.camKick = 0; this.kick = 0; this.rise = 0; this.shakeA = 0;
    this.flickerT = 6; this.flicker = 1;
    this.reload = { rl: 0, done: {} };
    this.heartT = 0;

    this.ambient = new THREE.AmbientLight(0xa0a8b8, 0.42);
    this.hemi = new THREE.HemisphereLight(0x6a7aa8, 0x2a1e16, 0.3);
    this.scene.add(this.ambient, this.hemi);
    // Taschenlampe + schwaches Licht um den Spieler
    this.flash = new THREE.SpotLight(0xfff0d0, 1.5, 1100, 0.62, 0.5, 1);
    this.flash.position.set(4, -4, 0);
    this.flash.target.position.set(0, -10, -100);
    this.near = new THREE.PointLight(0xffe2c0, 0.3, 240, 1.2);
    this.muzzle = new THREE.PointLight(0xffc060, 0, 450, 1.5);
    this.muzzle.position.set(6, -6, -30);
    this.cam.add(this.flash, this.flash.target, this.near, this.muzzle);

    this.makeMaterials();
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

  // ---------- Materialien und Texturen ----------
  makeMaterials() {
    const L = (color, emissive = 0) => new THREE.MeshLambertMaterial({ color, emissive });
    this.M = {
      metal: L(0x2c2e33, 0x0d0d10), metal2: L(0x4a4d53, 0x101012), poly: L(0x1c1c1e, 0x080808),
      wood: L(0x6b4423, 0x1a0e06), olive: L(0x4a5232, 0x0e1008), red: L(0x8a1c1c, 0x200404), brass: L(0xc8a040, 0x302000),
      lens: new THREE.MeshBasicMaterial({ color: 0x223a55 }), glowG: new THREE.MeshBasicMaterial({ color: 0x7dff9a }),
      glowO: new THREE.MeshBasicMaterial({ color: 0xffa040 }), upAccent: new THREE.MeshBasicMaterial({ color: 0xc080ff }),
      upMetal: L(0x3c2a5a, 0x1c0c34), plasmaBody: L(0x24322a, 0x08100a), skin: L(0xb08060, 0x1a1008), glove: L(0x262626, 0x0a0a0a),
      gore: L(0x6a0a0a, 0x200000), bone: L(0xd8d0b8, 0x202018),
    };
    // Zombie-Haut: fleckig mit Blut
    this.zSkin = canvasTex(64, 64, (g, w, h) => {
      g.fillStyle = '#66704e'; g.fillRect(0, 0, w, h);
      speckle(g, 0, 0, w, h, 200, ['#5e6847', '#717c58', '#555e40', '#4a5238', '#6b6a4a'], 0.8, 2.5);
      speckle(g, 0, 0, w, h, 8, ['rgba(80,6,6,.8)', 'rgba(50,4,4,.85)'], 1.2, 3.5);
      g.strokeStyle = 'rgba(60,5,5,.7)'; g.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) { const x = Math.random() * w; g.beginPath(); g.moveTo(x, Math.random() * 20); g.lineTo(x + rnd(-6, 6), 30 + Math.random() * 30); g.stroke(); }
    });
    // Gesicht vorne: dunkle Augenhöhlen, blutiger Mund
    this.zFace = canvasTex(64, 64, (g, w, h) => {
      g.drawImage(this.zSkin.image, 0, 0);
      g.fillStyle = '#1a1410'; g.fillRect(12, 18, 14, 10); g.fillRect(38, 18, 14, 10);
      g.fillStyle = '#3a0606'; g.fillRect(16, 42, 32, 10);
      g.fillStyle = '#d8d0b0'; for (let x = 18; x < 46; x += 5) g.fillRect(x, 42, 3, 4);
      g.fillStyle = 'rgba(120,10,10,.9)'; g.fillRect(20, 52, 6, 12); g.fillRect(34, 52, 4, 9);
    });
    // zerrissene Kleidung je Zombie-Typ
    this.zCloth = ZTYPES.map(t => canvasTex(64, 64, (g, w, h) => {
      g.fillStyle = t.color; g.fillRect(0, 0, w, h);
      speckle(g, 0, 0, w, h, 120, ['rgba(0,0,0,.25)', 'rgba(255,255,255,.08)'], 1, 3);
      speckle(g, 0, 0, w, h, 6, ['rgba(80,6,6,.8)', 'rgba(50,4,4,.85)'], 2, 6);
      g.fillStyle = '#66704e'; for (let i = 0; i < 4; i++) g.fillRect(Math.random() * 50, Math.random() * 50, 8 + Math.random() * 8, 5);
    }));
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
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, 100, w, 28);
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
    this.solidMeshes = [];
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
    { const r = box(1930, 990, 310, 220, 8, 0xc7c2b5); r.position.y = 150; }

    // Wandwaffen: Schild + echtes Waffenmodell an der Wand
    for (const b of m.wallbuys) {
      const off = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[b.side];
      const lbl = this.label(`${WEAPONS[b.w].name}  ${b.cost}`, '#ece6d2', 'rgba(30,25,20,.85)');
      lbl.position.set(b.x + off[0] * 20, 82, b.y + off[1] * 20);
      S.add(lbl);
      const gun = this.buildWeapon(b.w, false);
      gun.scale.setScalar(0.9);
      gun.position.set(b.x + off[0] * 24, 58, b.y + off[1] * 24);
      gun.rotation.y = Math.atan2(off[0], off[1]) + Math.PI / 2;
      S.add(gun);
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
    this.leverMesh = box(m.lever.x - 40, m.lever.y - 15, 80, 30, 70, 0x2c3036);
    this.leverLbl = this.label('Strom', '#aaa'); this.leverLbl.position.set(m.lever.x, 95, m.lever.y); S.add(this.leverLbl);
    this.upMesh = box(m.upgrade.x - 34, m.upgrade.y - 24, 68, 48, 80, 0x3a3540);
    const ul = this.label(`Verstärker  ${CFG.UPGRADE_COST}`, '#d7b4ff'); ul.position.set(m.upgrade.x, 105, m.upgrade.y); S.add(ul);
    this.boxMesh = box(m.box.x - 30, m.box.y - 16, 60, 32, 30, 0x6b4a2a, 0x0a1a22);
    const bl = this.label(`Wunderkiste  ${CFG.BOX_COST}`, '#7fe0ff'); bl.position.set(m.box.x, 60, m.box.y); S.add(bl);
    this.boxWeapon = this.label('', '#ffd34d');
    this.boxWeapon.position.set(m.box.x, 85, m.box.y);
    S.add(this.boxWeapon);
    this.boxGun = new THREE.Group(); this.boxGun.position.set(m.box.x, 45, m.box.y); S.add(this.boxGun);
    this.boxGunId = null;

    this.lampMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
    for (const [x, y] of m.lamps) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(6, 8, 6), this.lampMat);
      l.position.set(x, WALL_H + 10, y);
      S.add(l);
    }

    this.partMeshes = [0, 1, 2].map(() => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffd34d }));
      S.add(mesh); mesh.visible = false; return mesh;
    });
    this.puMeshes = [];
    this.turretMeshes = [];
  }

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

  setLabelOnce(sp, text, small) {
    if (sp.userData.text === text) return;
    sp.userData.text = text;
    this.setLabel(sp, text);
    if (small) sp.scale.set(60, 7.5, 1);
  }

  // ---------- Waffenmodelle (Lauf zeigt nach -z, Griff bei 0) ----------
  buildWeapon(id, up) {
    const M = this.M, g = new THREE.Group();
    const metal = up ? M.upMetal : M.metal;
    const B = (w, h, d, m, x, y, z, rx = 0, parent = g) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z); mesh.rotation.x = rx; parent.add(mesh); return mesh;
    };
    const C = (r, l, m, x, y, z, parent = g, seg = 8) => {
      const geo = new THREE.CylinderGeometry(r, r, l, seg); geo.rotateX(Math.PI / 2);
      const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); parent.add(mesh); return mesh;
    };
    const grp = (x, y, z) => { const o = new THREE.Group(); o.position.set(x, y, z); g.add(o); return o; };
    const u = g.userData = { muzzle: new THREE.Object3D(), eject: new THREE.Object3D(), left: new THREE.Vector3(0, -1, -14), scale: 0.5 };
    g.add(u.muzzle, u.eject);

    if (id === 'pistol') {
      u.slide = B(2.6, 2.8, 17, metal, 0, 3.2, -6.5);
      B(2.4, 1.8, 13, M.poly, 0, 1.2, -5.5);
      C(0.55, 1.2, M.metal2, 0, 3.4, -15.5);
      B(2.5, 8.5, 3.6, M.poly, 0, -3.5, 0.8, -0.22);
      B(0.5, 0.4, 4, M.poly, 0, -0.6, -3.6);
      B(0.6, 0.7, 0.6, M.metal2, 0, 4.9, -14); B(1.6, 0.7, 0.6, M.metal2, 0, 4.9, 1);
      u.mag = grp(0, 0, 0); B(2, 7.5, 2.8, M.metal2, 0, -4, 0.9, -0.22, u.mag);
      u.muzzle.position.set(0, 3.4, -16.5); u.eject.position.set(1.4, 3.6, -4);
      u.left.set(-0.8, -2.5, 0.5); u.scale = 0.6;
    } else if (id === 'shotgun') {
      C(0.95, 58, metal, 0, 3.2, -30); C(0.8, 44, M.metal2, 0, 1.4, -23);
      u.pump = B(3.4, 3.4, 13, M.wood, 0, 1.4, -20);
      B(3.2, 5.5, 15, metal, 0, 2, -2);
      B(2.8, 7, 3.2, M.wood, 0, -3.5, 2.5, -0.35);
      B(3, 5.5, 20, M.wood, 0, 0.6, 15, 0.12);
      B(0.5, 0.8, 0.5, M.metal2, 0, 4.3, -58);
      u.shellMesh = C(0.8, 3, M.red, 0, -2, -4); u.shellMesh.visible = false;
      u.muzzle.position.set(0, 3.2, -59.5); u.eject.position.set(1.8, 3, -2);
      u.left.set(0, -0.5, -20); u.scale = 0.45;
    } else if (id === 'smg') {
      B(3.2, 4.6, 20, M.poly, 0, 2, -4);
      C(0.7, 9, metal, 0, 2.6, -18.5);
      u.mag = grp(0, 0, 0); B(2.2, 12, 2.8, metal, 0, -5.5, -6.5, 0.08, u.mag);
      B(2.6, 7, 3.2, M.poly, 0, -3, 1.5, -0.25);
      B(0.8, 0.8, 13, M.metal2, 0, 2.4, 10); B(0.8, 4, 0.8, M.metal2, 0, 0.6, 16.5);
      B(1.4, 0.6, 12, M.metal2, 0, 4.6, -4); B(1, 1.6, 1, M.metal2, 0, 5.4, -13);
      u.slide = B(0.8, 0.8, 2.5, M.metal2, 1.9, 3, -2);
      u.muzzle.position.set(0, 2.6, -23.2); u.eject.position.set(1.7, 3, -3);
      u.left.set(0, -3, -6.5); u.scale = 0.62;
    } else if (id === 'rifle') {
      B(3.2, 4.6, 24, metal, 0, 2, -2); B(3.2, 1.2, 22, M.metal2, 0, 4.7, -2);
      B(3.8, 4, 16, M.wood, 0, 1.8, -20);
      C(0.6, 16, metal, 0, 2.6, -36); C(0.5, 14, M.metal2, 0, 4.2, -22);
      B(0.6, 2.4, 0.6, M.metal2, 0, 4.4, -41);
      u.mag = grp(0, 0, 0); B(2.4, 7, 3.6, metal, 0, -3.5, -6.5, 0.2, u.mag); B(2.4, 7, 3.6, metal, 0, -9.6, -4.2, 0.55, u.mag);
      B(2.4, 7, 3, M.poly, 0, -3, 2, -0.3);
      B(3, 5.5, 20, M.wood, 0, 0.5, 18, 0.1);
      u.slide = B(0.8, 1, 2.5, M.metal2, 1.9, 3.4, -6);
      u.muzzle.position.set(0, 2.6, -44.5); u.eject.position.set(1.8, 3.5, -2);
      u.left.set(0, -0.5, -20); u.scale = 0.48;
    } else if (id === 'dmr') {
      B(3.2, 4.6, 24, M.metal2, 0, 2, -2);
      B(3.6, 4, 18, M.poly, 0, 2, -21);
      C(0.65, 22, metal, 0, 2.6, -40);
      C(1.5, 14, M.poly, 0, 7.4, -4); C(1.3, 0.3, M.lens, 0, 7.4, -11.2); C(1.3, 0.3, M.lens, 0, 7.4, 3.2);
      B(1, 2, 1, metal, 0, 5.4, -8); B(1, 2, 1, metal, 0, 5.4, 0);
      u.mag = grp(0, 0, 0); B(2.4, 9, 3.4, metal, 0, -4.5, -6, 0.1, u.mag);
      B(2.4, 7, 3, M.poly, 0, -3, 2, -0.3);
      B(3, 6, 20, M.poly, 0, 0.5, 18, 0.08);
      u.bolt = B(1.2, 1.2, 3, M.metal2, 1.8, 3.5, 2);
      u.muzzle.position.set(0, 2.6, -51.5); u.eject.position.set(1.8, 3.5, -2);
      u.left.set(0, 0, -20); u.scale = 0.45;
    } else if (id === 'lmg') {
      B(4, 6, 26, M.olive, 0, 2, -2);
      B(4.2, 4.6, 18, M.metal2, 0, 2, -22);
      for (let i = 0; i < 5; i++) B(4.4, 1.4, 1.4, M.poly, 0, 2.6, -15 - i * 3.2);
      C(0.8, 20, metal, 0, 2.6, -38);
      B(1, 3, 10, metal, 0, 6.5, -6);
      u.mag = grp(0, 0, 0); B(6, 7, 7, M.olive, 1.2, -4.5, -5, 0, u.mag); B(1, 1, 5, M.brass, 2.5, 0.5, -5, 0, u.mag);
      B(0.6, 0.6, 12, M.metal2, -1.2, -0.6, -36); B(0.6, 0.6, 12, M.metal2, 1.2, -0.6, -36);
      B(2.6, 7, 3, M.poly, 0, -3, 2, -0.3);
      B(3.4, 6, 18, M.poly, 0, 0.5, 17);
      u.slide = B(1, 1.2, 3, M.metal2, 2.4, 3.5, -8);
      u.muzzle.position.set(0, 2.6, -48.5); u.eject.position.set(2.2, 2, -2);
      u.left.set(0, -0.5, -22); u.scale = 0.45;
    } else if (id === 'flame') {
      C(2, 34, M.metal2, 0, 2, -12); C(1.3, 8, metal, 0, 2, -33);
      u.pilot = new THREE.Mesh(new THREE.SphereGeometry(0.7, 6, 5), M.glowO); u.pilot.position.set(0, 0.4, -36.5); g.add(u.pilot);
      u.mag = grp(0, 0, 0); C(3.2, 18, M.red, 0, -4.5, -6, u.mag); C(1.2, 2, M.metal2, 0, -4.5, -16, u.mag);
      B(2.6, 7, 3, M.poly, 0, -3, 6, -0.3);
      B(2.4, 6, 2.6, M.poly, 0, -2, -18);
      B(0.6, 0.6, 10, metal, 1.6, -0.5, -6);
      u.muzzle.position.set(0, 2, -37.5); u.eject.position.set(0, 0, 0);
      u.left.set(0, -2, -18); u.scale = 0.55;
    } else if (id === 'plasma') {
      B(4, 5.5, 26, M.plasmaBody, 0, 2, -6);
      C(1.2, 18, metal, 0, 2, -18);
      for (const z of [-12, -16, -20]) { const t = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.5, 6, 12), M.glowG); t.position.set(0, 2, z); g.add(t); }
      u.mag = grp(0, 0, 0); B(2.6, 6, 4, M.glowG, 0, -3, -4, 0, u.mag);
      B(2.6, 7, 3, M.poly, 0, -3, 4, -0.3);
      B(3, 5, 10, M.plasmaBody, 0, 1, 11);
      u.muzzle.position.set(0, 2, -28); u.eject.position.set(0, 0, 0);
      u.left.set(0, -1, -14); u.scale = 0.55;
    } else if (id === 'sniper') {
      C(0.7, 46, metal, 0, 2.8, -36);
      B(3, 4.2, 18, metal, 0, 2, 0);
      C(1.9, 20, M.poly, 0, 7.4, -2); C(1.7, 0.3, M.lens, 0, 7.4, -12.2); C(1.5, 0.3, M.lens, 0, 7.4, 8.2);
      B(1, 2.2, 1, metal, 0, 5.4, -7); B(1, 2.2, 1, metal, 0, 5.4, 3);
      u.bolt = grp(0, 0, 0); B(1, 1, 4, M.metal2, 2.4, 3.2, 4, 0, u.bolt);
      { const k = new THREE.Mesh(new THREE.SphereGeometry(0.9, 6, 5), M.metal2); k.position.set(3.2, 3.2, 6); u.bolt.add(k); }
      u.mag = grp(0, 0, 0); B(2.2, 4, 5, metal, 0, -1, -2, 0, u.mag);
      B(3.2, 6.5, 30, M.wood, 0, 0, 18, 0.06); B(2.8, 2, 10, M.wood, 0, 3.6, 14);
      B(2.4, 7, 3, M.wood, 0, -3, 4, -0.3);
      u.muzzle.position.set(0, 2.8, -59.5); u.eject.position.set(1.8, 3.5, 2);
      u.left.set(0, 0, -18); u.scale = 0.42;
    }
    if (up) {
      // verbesserte Waffe: leuchtende Streifen
      B(0.3, 0.6, 14, M.upAccent, 1.9, 2.4, -6); B(0.3, 0.6, 14, M.upAccent, -1.9, 2.4, -6);
    }
    for (const k of ['mag', 'slide', 'pump', 'bolt']) if (u[k]) u[k].userData.base = u[k].position.clone();
    return g;
  }

  // ---------- Figuren mit abnehmbaren Körperteilen ----------
  makeZombie(type) {
    const t = ZTYPES[type];
    const skin = new THREE.MeshLambertMaterial({ map: this.zSkin, color: type === 3 ? 0xa080b0 : type === 1 ? 0xc09080 : 0xd8d8d8 });
    const face = new THREE.MeshLambertMaterial({ map: this.zFace, color: skin.color });
    const cloth = new THREE.MeshLambertMaterial({ map: this.zCloth[type] });
    const pants = new THREE.MeshLambertMaterial({ color: 0x2f3328 });
    return this.makeBody(skin, face, cloth, pants, type === 3 || type === 1 ? 0xff3b2f : 0xe8e070, t.r / 14 * (type === 3 ? 1.05 : 1));
  }

  makeBody(skin, face, cloth, pants, eyeColor, scale) {
    const root = new THREE.Group(), body = new THREE.Group();
    root.add(body);
    const part = (name, x, y, z) => { const o = new THREE.Group(); o.position.set(x, y, z); o.name = name; body.add(o); return o; };
    const mesh = (parent, w, h, d, mat, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m;
    };
    const legL = part('legL', 0, 27, -5), legR = part('legR', 0, 27, 5);
    mesh(legL, 7, 27, 7, pants, 0, -13.5, 0); mesh(legR, 7, 27, 7, pants, 0, -13.5, 0);
    const torso = part('torso', 0, 27, 0);
    mesh(torso, 11, 27, 19, cloth, 0, 13.5, 0);
    const head = part('head', 1, 54, 0);
    const hm = new THREE.Mesh(new THREE.BoxGeometry(12, 12, 12), [face, skin, skin, skin, skin, skin]);
    hm.position.set(0, 6, 0); head.add(hm);
    if (eyeColor) for (const z of [-3, 3]) mesh(head, 1, 2, 2, new THREE.MeshBasicMaterial({ color: eyeColor }), 6.2, 8, z);
    const armL = part('armL', 0, 50, -12), armR = part('armR', 0, 50, 12);
    for (const a of [armL, armR]) { mesh(a, 10, 6, 6, cloth, 5, 0, 0); mesh(a, 13, 5, 5, skin, 15.5, 0, 0); }
    root.scale.setScalar(scale);
    root.userData = { body, legL, legR, torso, head, armL, armR, lost: {}, phase: Math.random() * 6, flinch: 0, lean: 0 };
    return root;
  }

  playerMesh(cls, wid, up) {
    const c = CLASSES[cls];
    const helmet = cls === 'soldat' ? 0x4a6b35 : cls === 'tech' ? 0xe8c020 : 0xf2f2f2;
    const L = col => new THREE.MeshLambertMaterial({ color: col });
    const g = this.makeBody(this.M.skin, L(helmet), L(new THREE.Color(c.color).getHex()), L(0x2b2b30), null, 1);
    const gun = this.buildWeapon(wid, up);
    gun.scale.setScalar(0.5);
    gun.rotation.y = -Math.PI / 2;
    gun.position.set(16, 46, 7);
    g.add(gun);
    g.userData.gunId = wid + up;
    const tag = this.label('', '#fff');
    tag.position.set(0, 84, 0);
    g.add(tag);
    g.userData.tag = tag;
    return g;
  }

  // Laufen, Schlurfen, Angreifen, Zucken
  animateBody(mesh, speed, dt, opt) {
    const u = mesh.userData;
    const amp = Math.min(1, speed / 60);
    u.phase += dt * (opt.runner ? 13 : opt.player ? 10 : 6) * (0.4 + amp);
    const sw = Math.sin(u.phase);
    u.flinch = Math.max(0, u.flinch - dt * 5);
    const limp = opt.zombie && !opt.runner ? 0.55 : 1;
    u.legL.rotation.z = sw * 0.6 * amp;
    u.legR.rotation.z = -sw * 0.6 * amp * limp;
    const lean = opt.runner ? -0.38 : opt.zombie ? -0.14 : -0.04;
    u.lean += (lean * (opt.player ? amp : 1) - u.lean) * Math.min(1, dt * 5);
    u.body.rotation.z = u.lean + u.flinch * 0.45 + (opt.att ? -0.25 : 0);
    u.body.rotation.x = opt.zombie ? Math.sin(u.phase * 0.5) * 0.09 : 0;
    u.body.position.y = -Math.abs(Math.cos(u.phase)) * 1.5 * amp;
    if (opt.zombie) {
      if (opt.runner) {
        u.armL.rotation.z = -1.0 + sw * 0.9; u.armR.rotation.z = -1.0 - sw * 0.9;
      } else {
        const reach = opt.att ? 0.5 : 0.08;
        u.armL.rotation.z = reach + Math.sin(u.phase + 1) * 0.12; u.armR.rotation.z = reach - Math.sin(u.phase) * 0.12;
        u.armL.rotation.y = 0.15; u.armR.rotation.y = -0.15;
      }
      u.head.rotation.x = Math.sin(this.time * 1.3 + u.phase * 0.1) * 0.3;
      u.head.rotation.z = -0.2 + u.flinch * 0.5;
    } else {
      // Spieler halten die Waffe
      u.armL.rotation.y = 0.5; u.armR.rotation.y = 0.2;
    }
  }

  // Körperteil abtrennen und fliegen lassen
  detach(mesh, name, dirA, power) {
    const u = mesh.userData;
    if (u.lost[name]) return;
    u.lost[name] = true;
    const p = u[name];
    const pos = new THREE.Vector3();
    p.getWorldPosition(pos);
    this.scene.attach(p);
    const sp = (150 + Math.random() * 200) * power;
    const a = dirA + rnd(-0.8, 0.8);
    this.gibs.push({ o: p, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: rnd(120, 300) * power,
      rx: rnd(-12, 12), ry: rnd(-12, 12), rz: rnd(-12, 12), t: 0, bleed: 1.2 });
    // Stumpf blutet nach
    this.stumps.push({ obj: u.body, name, x: pos.x, y: pos.y, z: pos.z, t: 1.4, a: dirA });
    for (let i = 0; i < 26; i++) this.blood(pos.x, pos.y, pos.z, a + rnd(-1, 1), rnd(80, 320), rnd(40, 260));
    if (this.gibs.length > 40) { const old = this.gibs.shift(); this.scene.remove(old.o); }
  }

  // ---------- Waffe in der Hand ----------
  buildViewmodel() {
    this.vm = new THREE.Group();
    this.vmGunHolder = new THREE.Group();
    this.vm.add(this.vmGunHolder);
    this.cam.add(this.vm);
    // Unterarme mit Ärmeln
    this.armMat = new THREE.MeshLambertMaterial({ color: 0x3d5a2c, emissive: 0x060806 });
    const geo = new THREE.BoxGeometry(2.4, 2.4, 34); geo.translate(0, 0, 17);
    this.armR = new THREE.Mesh(geo, this.armMat); this.armL = new THREE.Mesh(geo, this.armMat);
    const hgeo = new THREE.BoxGeometry(2.4, 2.8, 3.4);
    this.handR = new THREE.Mesh(hgeo, this.M.glove); this.handL = new THREE.Mesh(hgeo, this.M.glove);
    this.vmGunHolder.rotation.set(0.02, 0.06, 0);
    this.vm.add(this.armR, this.armL, this.handR, this.handL);
    // Mündungsfeuer
    const star = canvasTex(64, 64, (g) => {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(0.25, 'rgba(255,200,90,.9)'); gr.addColorStop(1, 'rgba(255,120,0,0)');
      g.fillStyle = gr;
      g.beginPath();
      for (let i = 0; i < 16; i++) { const r = i % 2 ? 9 : 32, a = i / 16 * TAU; g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
      g.fill();
    });
    this.flashMat = new THREE.SpriteMaterial({ map: star, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    this.vmFlash = new THREE.Sprite(this.flashMat);
    this.vmFlash.visible = false;
    this.vmFlashLife = 0;
    this.vmId = null;
    // Hülsen
    this.shells = [];
    const sgeo = new THREE.CylinderGeometry(0.35, 0.35, 1.6, 6);
    for (let i = 0; i < 24; i++) {
      const s = new THREE.Mesh(sgeo, this.M.brass); s.visible = false; s.userData = { t: 0 };
      this.scene.add(s); this.shells.push(s);
    }
    this.shellI = 0;
  }

  setViewWeapon(sl, cls) {
    const key = sl[0] + sl[1];
    if (key === this.vmId) return;
    this.vmId = key;
    if (this.vmGun) this.vmGunHolder.remove(this.vmGun);
    this.vmGun = this.buildWeapon(sl[0], !!sl[1]);
    const u = this.vmGun.userData;
    this.vmGun.scale.setScalar(u.scale);
    this.vmGunHolder.add(this.vmGun);
    u.muzzle.add(this.vmFlash);
    this.armMat.color.set(CLASSES[cls].color).multiplyScalar(0.22);
  }

  // Unterarm von der Hand zum Ellbogen ausrichten
  placeArm(arm, hand, hx, hy, hz, ex, ey, ez) {
    hand.position.set(hx, hy, hz);
    arm.position.set(hx, hy, hz);
    const d = new THREE.Vector3(ex - hx, ey - hy, ez - hz).normalize();
    arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
    hand.quaternion.copy(arm.quaternion);
  }

  updateViewmodel(me, dt, moving) {
    const sl = me.sl[me.cu];
    this.setViewWeapon(sl, me.c);
    const gun = this.vmGun, u = gun.userData, wid = sl[0];
    const R = RECOIL[wid] || RECOIL.pistol;

    // Rückstoß abklingen lassen (gefedert)
    this.kick += (0 - this.kick) * Math.min(1, dt * 14);
    this.rise += (0 - this.rise) * Math.min(1, dt * 9);
    this.camKick += (0 - this.camKick) * Math.min(1, dt * 6);
    this.shakeA = Math.max(0, this.shakeA - dt * 8);

    // Nachladen
    const rl = me.rl;
    const re = this.reload;
    if (rl <= 0 || rl < re.rl - 0.3) re.done = {};
    re.rl = rl;
    let tilt = 0, magY = 0, magVis = true, slideZ = 0, pumpZ = 0, boltZ = 0, leftDrop = 0;
    if (rl > 0) {
      tilt = smoothstep(0, 0.15, rl) * (1 - smoothstep(0.85, 1, rl));
      const once = (k, at, snd) => { if (rl >= at && !re.done[k]) { re.done[k] = 1; this.sfx.play(snd, 0.9); } };
      if (wid === 'shotgun') {
        const n = 6, i = Math.floor(clamp((rl - 0.12) / 0.7, 0, 0.999) * n), f = ((rl - 0.12) / 0.7 * n) % 1;
        if (rl > 0.12 && rl < 0.82) {
          u.shellMesh.visible = true;
          u.shellMesh.position.set(0, -6 + smoothstep(0, 0.6, f) * 4, -4 + smoothstep(0.3, 0.8, f) * 3);
          once('s' + i, 0.12 + (i + 0.55) / n * 0.7, 'shell');
          leftDrop = 1;
        } else u.shellMesh.visible = false;
        if (rl > 0.86) { pumpZ = Math.sin(smoothstep(0.86, 0.98, rl) * Math.PI) * 6; once('pump', 0.88, 'pump'); }
      } else {
        once('out', 0.2, 'magOut'); once('in', 0.62, 'magIn');
        if (wid === 'sniper' || wid === 'dmr') { boltZ = Math.sin(smoothstep(0.75, 0.92, rl) * Math.PI) * 4; once('rack', 0.8, 'rack'); }
        else if (wid !== 'flame' && wid !== 'plasma') { slideZ = Math.sin(smoothstep(0.74, 0.9, rl) * Math.PI) * 3.5; once('rack', 0.78, 'rack'); }
        if (rl < 0.15) magY = 0;
        else if (rl < 0.38) { magY = -smoothstep(0.15, 0.38, rl) * 30; magVis = rl < 0.33; }
        else if (rl < 0.48) { magVis = false; }
        else if (rl < 0.68) magY = -(1 - smoothstep(0.48, 0.68, rl)) * 14;
        leftDrop = rl > 0.3 && rl < 0.7 ? Math.sin(smoothstep(0.3, 0.7, rl) * Math.PI) : 0;
      }
    } else if (u.shellMesh) u.shellMesh.visible = false;
    if (u.mag) { u.mag.position.y = u.mag.userData.base.y + magY / u.scale * 0.5; u.mag.visible = magVis; }
    if (u.slide) u.slide.position.z = u.slide.userData.base.z + slideZ + (this.kick > 0.5 && wid === 'pistol' ? 2.5 : 0);
    if (u.pump) u.pump.position.z = u.pump.userData.base.z + pumpZ;
    if (u.bolt) u.bolt.position.z = u.bolt.userData.base.z + boltZ;
    if (u.pilot) u.pilot.scale.setScalar(0.8 + Math.random() * 0.5);

    // Wackeln beim Gehen, Nachziehen beim Drehen, Atmen
    const amp = Math.min(1, this.speed / CFG.PLAYER_SPEED);
    const bx = Math.sin(this.bob) * 0.9 * amp, by = -Math.abs(Math.cos(this.bob)) * 0.8 * amp + Math.sin(this.time * 1.6) * 0.15;
    this.swayY = (this.swayY || 0) + (clamp(-this.yawVel * 0.03, -0.18, 0.18) - (this.swayY || 0)) * Math.min(1, dt * 8);
    const sh = this.shakeA;
    this.vm.position.set(7.5 + bx + rnd(-sh, sh) * 0.15 - tilt * 1.5, -8.2 + by - tilt * 1.2 - (me.s === 1 ? 6 : 0), -13 + this.kick * R.kick * 0.5);
    this.vm.rotation.set(this.rise - tilt * 0.15, this.swayY - tilt * 0.3 + rnd(-sh, sh) * 0.01, tilt * 0.75 + Math.sin(this.bob) * 0.02 * amp);
    // Hände an der Waffe, Ellbogen Richtung Kamera
    const s = u.scale;
    // Arme laufen steil nach unten aus dem Bild
    this.placeArm(this.armR, this.handR, 0, -2 * s, 1.5 * s, 2, -40, 10);
    const lx = u.left.x * s - leftDrop * 1.5, ly = u.left.y * s - leftDrop * 4, lz = u.left.z * s + leftDrop * 6;
    this.placeArm(this.armL, this.handL, lx, ly, lz, lx - 3, -40, lz + 10);

    // Mündungsfeuer
    this.vmFlashLife -= dt;
    this.vmFlash.visible = this.vmFlashLife > 0 && wid !== 'flame';
    this.vm.visible = me.s !== 2;
  }

  // eigener Schuss: Rückstoß, Feuer, Hülse
  ownShot(wid) {
    if (!this.vmGun) return;
    const R = RECOIL[wid] || RECOIL.pistol;
    this.kick = 1; this.rise += R.rise; this.camKick += R.cam; this.shakeA = Math.max(this.shakeA, R.shake);
    this.flashLife = 0.05;
    this.vmFlashLife = 0.045;
    const sc = 3 + Math.random() * 3;
    this.vmFlash.scale.set(sc / this.vmGun.userData.scale, sc / this.vmGun.userData.scale, 1);
    this.flashMat.rotation = Math.random() * TAU;
    if (wid === 'flame' || wid === 'plasma' || wid === 'turret') return;
    // Hülse auswerfen (Schrotflinte erst beim Pumpen)
    const s = this.shells[this.shellI++ % this.shells.length];
    const p = new THREE.Vector3();
    this.vmGun.userData.eject.getWorldPosition(p);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.cam.quaternion);
    s.position.copy(p);
    s.material = wid === 'shotgun' ? this.M.red : this.M.brass;
    s.visible = true;
    Object.assign(s.userData, { t: 3, vx: right.x * rnd(60, 110), vy: rnd(70, 130), vz: right.z * rnd(60, 110), r: rnd(-15, 15) });
    this.sfx.play('brass', 0.7);
  }

  // ---------- Partikel (wenige Zeichenaufrufe dank Punktwolken) ----------
  buildFx() {
    this.tracers = [];
    for (let i = 0; i < 40; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0 }));
      line.visible = false; line.userData.life = 0;
      this.scene.add(line); this.tracers.push(line);
    }
    const dot = canvasTex(32, 32, (g) => {
      const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    });
    const mk = (n, size, blending) => {
      const pos = new Float32Array(n * 3).fill(-9999), col = new Float32Array(n * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size, map: dot, vertexColors: true, transparent: true, depthWrite: false, blending, sizeAttenuation: true }));
      pts.frustumCulled = false;
      this.scene.add(pts);
      return { pts, pos, col, n, vel: new Float32Array(n * 3), life: new Float32Array(n), i: 0, decal: new Uint8Array(n) };
    };
    this.bloodP = mk(1800, 3.2, THREE.NormalBlending);
    this.glowP = mk(500, 7, THREE.AdditiveBlending);
    this.flashLife = 0;
  }

  emit(sys, x, h, y, vx, vh, vy, life, r, g, b, decal) {
    const i = sys.i++ % sys.n, k = i * 3;
    sys.pos[k] = x; sys.pos[k + 1] = h; sys.pos[k + 2] = y;
    sys.vel[k] = vx; sys.vel[k + 1] = vh; sys.vel[k + 2] = vy;
    sys.col[k] = r; sys.col[k + 1] = g; sys.col[k + 2] = b;
    sys.life[i] = life; sys.decal[i] = decal ? 1 : 0;
  }

  // Blutstropfen in Richtung a (Weltwinkel), landen als Fleck auf dem Boden
  blood(x, h, y, a, speed, up) {
    const d = 0.25 + Math.random() * 0.3;
    this.emit(this.bloodP, x, h, y, Math.cos(a) * speed, up, Math.sin(a) * speed, 2, d, 0.01, 0.01, true);
  }

  spray(x, y, h, a, dmg, big) {
    const n = Math.min(60, 10 + dmg / 6) * (big ? 1.6 : 1);
    for (let i = 0; i < n; i++) {
      const back = Math.random() < 0.25;   // Eintrittswunde spritzt zurück
      const aa = (back ? a + Math.PI : a) + rnd(-0.55, 0.55);
      this.blood(x, h + rnd(-3, 3), y, aa, back ? rnd(40, 140) : rnd(120, 420), rnd(-20, 200));
    }
    // feiner Nebel
    for (let i = 0; i < 6; i++) this.emit(this.glowP, x, h, y, Math.cos(a) * rnd(20, 80), rnd(0, 40), Math.sin(a) * rnd(20, 80), 0.35, 0.35, 0.02, 0.02, false);
  }

  updateParticles(sys, dt, grav) {
    const { pos, vel, life, col } = sys;
    let landed = false;
    for (let i = 0; i < sys.n; i++) {
      if (life[i] <= 0) continue;
      const k = i * 3;
      life[i] -= dt;
      vel[k + 1] -= grav * dt;
      pos[k] += vel[k] * dt; pos[k + 1] += vel[k + 1] * dt; pos[k + 2] += vel[k + 2] * dt;
      if (pos[k + 1] <= 0.5 || life[i] <= 0) {
        if (sys.decal[i] && pos[k + 1] <= 0.5) { this.drip(pos[k], pos[k + 2]); landed = true; }
        life[i] = 0; pos[k + 1] = -9999;
      } else if (!grav) {
        const f = Math.max(0, 1 - dt * 3);
        vel[k] *= f; vel[k + 2] *= f;
      }
    }
    sys.pts.geometry.attributes.position.needsUpdate = true;
    sys.pts.geometry.attributes.color.needsUpdate = true;
    if (landed) this.decalDirty = true;
  }

  // Tropfen auf die Boden-Textur malen
  drip(x, y) {
    const g = this.r2d.dg;
    g.fillStyle = `rgba(${70 + (Math.random() * 50) | 0},3,3,.7)`;
    g.beginPath(); g.arc(x / 2, y / 2, rnd(0.8, 2.6), 0, TAU); g.fill();
  }

  onEvents(evs, myId, snap) {
    for (const e of evs) {
      if (e.k === 'shot') {
        const mine = e.id === myId;
        const tr = this.tracers.find(t => !t.visible) || this.tracers[0];
        const pos = tr.geometry.attributes.position;
        if (mine && this.vmGun) {
          const p = new THREE.Vector3(); this.vmGun.userData.muzzle.getWorldPosition(p);
          pos.setXYZ(0, p.x, p.y, p.z);
        } else pos.setXYZ(0, e.x, 47, e.y);
        pos.setXYZ(1, e.x2, 42 + Math.random() * 10, e.y2);
        pos.needsUpdate = true;
        tr.geometry.computeBoundingSphere();
        tr.material.color.setHex(e.w === 'plasma' ? 0x78ff8c : e.up ? 0xc88cff : 0xffe6a0);
        tr.visible = true; tr.userData.life = e.w === 'plasma' ? 0.15 : 0.06;
        if (mine) this.ownShot(e.w);
        else for (let i = 0; i < 4; i++) this.emit(this.glowP, e.x, 47, e.y, rnd(-30, 30), rnd(-30, 30), rnd(-30, 30), 0.06, 1, 0.75, 0.3, false);
        // Funken, wenn die Kugel eine Wand trifft
        for (let i = 0; i < 3; i++) this.emit(this.glowP, e.x2, 45, e.y2, rnd(-120, 120), rnd(0, 150), rnd(-120, 120), 0.2, 1, 0.8, 0.4, false);
      } else if (e.k === 'hit') {
        const z = this.zMeshes.get(e.zi);
        const sc = z ? z.scale.x : 1;
        const h = rnd(30, 60) * sc;
        this.spray(e.x, e.y, h, e.a, e.d, false);
        if (z) {
          z.userData.flinch = Math.min(1, z.userData.flinch + 0.6);
          // harter Treffer reißt manchmal einen Arm ab
          if (e.d >= 100 && Math.random() < 0.22) this.detach(z, Math.random() < 0.5 ? 'armL' : 'armR', e.a, 0.8);
        }
      } else if (e.k === 'kill') {
        this.killZombie(e);
      } else if (e.k === 'flame') {
        for (let i = 0; i < 5; i++) {
          const a = e.a + rnd(-0.3, 0.3), sp = rnd(300, 460);
          const up = e.up ? [0.7, 0.45, 1] : [1, 0.5 + Math.random() * 0.25, 0.1];
          this.emit(this.glowP, e.x, EYE - 16, e.y, Math.cos(a) * sp, rnd(-10, 40), Math.sin(a) * sp, 0.45, up[0], up[1], up[2], false);
        }
        if (e.id === myId) this.ownShot('flame');
      } else if (e.k === 'boom') {
        for (let i = 0; i < 40; i++) {
          const a = rnd(0, TAU), sp = rnd(80, 320);
          this.emit(this.glowP, e.x, rnd(10, 60), e.y, Math.cos(a) * sp, rnd(0, 160), Math.sin(a) * sp, 0.5, 0.5, 1, 0.55, false);
        }
        this.flashLife = 0.12;
      } else if (e.k === 'tear' || e.k === 'plank') {
        for (let i = 0; i < 8; i++) this.emit(this.bloodP, e.x, rnd(20, 80), e.y, rnd(-100, 100), rnd(0, 120), rnd(-100, 100), 1, 0.45, 0.32, 0.18, false);
      } else if (e.k === 'zatt') {
        const z = this.zMeshes.get(e.zi);
        if (z) z.userData.attT = 0.4;
        this.sfx.play('growl', this.volAt(e.x, e.y, snap, myId));
      }
    }
  }

  volAt(x, y, snap, myId) {
    const me = snap && snap.pl.find(p => p.id === myId);
    return me ? Math.max(0, 1 - Math.hypot(x - me.x, y - me.y) / 900) : 0.5;
  }

  // Zombie stirbt: umfallen, Blutfontäne, Körperteile fliegen
  killZombie(e) {
    const mesh = this.zMeshes.get(e.zi);
    const big = e.w === 'boom' || e.w === 'plasma' || e.d >= 300;
    const strong = big || e.w === 'shotgun' || e.w === 'sniper' || e.w === 'dmr' || e.d >= 120;
    const sc = mesh ? mesh.scale.x : 1;
    this.spray(e.x, e.y, 45 * sc, e.ba, 200, true);
    this.sfx.play('gore', 0.8);
    if (!mesh) return;
    this.zMeshes.delete(e.zi);
    const u = mesh.userData;
    // umfallen in Schussrichtung
    mesh.rotation.y = -e.ba;
    u.att = 0;
    const power = big ? 2.2 : strong ? 1.2 : 0.8;
    const roll = Math.random();
    if (big) { for (const n of ['head', 'armL', 'armR', 'legL', 'legR']) if (Math.random() < 0.8) this.detach(mesh, n, e.ba, power); }
    else {
      if (roll < (strong ? 0.5 : 0.22)) this.detach(mesh, 'head', e.ba, power);
      if (Math.random() < (strong ? 0.45 : 0.18)) this.detach(mesh, Math.random() < 0.5 ? 'armL' : 'armR', e.ba, power);
      if (Math.random() < (strong ? 0.3 : 0.1)) this.detach(mesh, Math.random() < 0.5 ? 'legL' : 'legR', e.ba, power);
    }
    this.corpses.push({ mesh, t: 0, slide: (strong ? 120 : 50) * (big ? 2 : 1), a: e.ba, fall: -Math.PI / 2 * (0.95 + Math.random() * 0.1) });
    if (this.corpses.length > 22) { const c = this.corpses.shift(); this.scene.remove(c.mesh); }
  }

  // Wird das Bild zu langsam, Auflösung schrittweise senken
  adaptQuality(dt) {
    if (dt > 0) this.fpsAvg = this.fpsAvg * 0.95 + Math.min(120, 1 / dt) * 0.05;
    this.qualT -= dt;
    if (this.qualT > 0) return;
    this.qualT = 2;
    if (this.fpsAvg < 42 && this.pr > 0.75) {
      this.pr = Math.max(0.75, this.pr - 0.25);
      this.gl.setPixelRatio(this.pr);
      this.resize();
    }
  }

  // ---------- Zeichnen ----------
  draw(snap, myId, input, dt) {
    this.time += dt;
    const me = snap.pl.find(p => p.id === myId);
    // Positionen kommen schon geglättet an (Host direkt, Mitspieler zwischengerechnet)
    const k = 1;
    this.adaptQuality(dt);
    const sm = (key, x, y, a) => {
      let s = this.smooth[key];
      if (!s || Math.abs(s.x - x) + Math.abs(s.y - y) > 160) s = this.smooth[key] = { x, y, a: a || 0, vx: 0 };
      const ox = s.x, oy = s.y;
      s.x += (x - s.x) * k; s.y += (y - s.y) * k;
      if (a !== undefined) s.a = lerpAng(s.a, a, Math.min(1, dt * 10));
      s.speed = (s.speed || 0) * 0.85 + Math.hypot(s.x - ox, s.y - oy) / Math.max(dt, 0.001) * 0.15;
      s.seen = this.time;
      return s;
    };

    // Kamera = eigene Augen, mit Kopfwippen beim Gehen
    if (me) {
      const yaw = me.s === 0 ? input.state.a : me.a;
      this.yawVel = angDiff(yaw, this.lastYaw) / Math.max(dt, 0.001);
      this.lastYaw = yaw;
      this.yaw = yaw;
      if (this.lastPos) {
        const v = Math.hypot(me.x - this.lastPos.x, me.y - this.lastPos.y) / Math.max(dt, 0.001);
        this.speed += (Math.min(v, 260) - this.speed) * Math.min(1, dt * 10);
      }
      this.lastPos = { x: me.x, y: me.y };
      const amp = Math.min(1, this.speed / CFG.PLAYER_SPEED);
      this.bob += dt * (this.speed * 0.058);
      // Schritte hörbar
      const step = Math.floor(this.bob / Math.PI);
      if (step !== this.lastStep && amp > 0.25 && me.s === 0) { this.lastStep = step; this.sfx.play('step', 0.5 + amp * 0.3); }
      const eye = me.s === 1 ? 18 : me.s === 2 ? 300 : EYE + Math.sin(this.bob * 2) * 1.6 * amp - Math.abs(Math.sin(this.bob)) * 0.6 * amp;
      this.cam.position.set(me.x, eye, me.y);
      const pitch = me.s === 2 ? -1.2 : -0.05 + this.camKick;
      const side = input.state.mx * -Math.sin(yaw) + input.state.my * Math.cos(yaw); // seitliche Bewegung
      this.cam.up.set(0, 1, 0);
      this.cam.lookAt(me.x + Math.cos(yaw) * 100, eye + Math.tan(pitch) * 100, me.y + Math.sin(yaw) * 100);
      this.cam.rotateZ(-side * 0.035 * amp + Math.sin(this.bob) * 0.006 * amp + rnd(-1, 1) * this.shakeA * 0.002);
      this.updateViewmodel(me, dt);

      // Herzschlag bei wenig Leben
      this.heartT -= dt;
      if (me.s === 0 && me.hp / me.mh < 0.35 && this.heartT <= 0) { this.heartT = 0.9; this.sfx.play('heart', 0.8); }
    }

    // Taschenlampe flackert ab und zu
    this.flickerT -= dt;
    if (this.flickerT < 0) { this.flicker = Math.random() < 0.5 ? 0.15 : 0.6; if (this.flickerT < -0.25) { this.flickerT = rnd(8, 20); this.flicker = 1; } }
    this.flash.intensity = 1.5 * (this.flickerT < 0 ? this.flicker * (Math.random() < 0.5 ? 1 : 0.4) : 1);
    this.flashLife -= dt;
    this.muzzle.intensity = this.flashLife > 0 ? 2.8 : 0;

    // Strom: Licht an
    const power = !!snap.pw;
    if (power !== this.power) {
      this.power = power;
      this.ambient.intensity = power ? 0.7 : 0.4;
      this.hemi.intensity = power ? 0.5 : 0.3;
      this.scene.fog.density = power ? 0.001 : 0.0017;
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

    this.doors.forEach(([mesh, lbls], i) => { mesh.visible = !snap.doors[i]; for (const l of lbls) l.visible = mesh.visible; });
    this.windows.forEach((planks, i) => planks.forEach((p, j) => { p.visible = j < snap.win[i]; }));

    // Wunderkiste mit schwebender Waffe
    const [bs, bw, , bt] = snap.box;
    let bwText = '', gid = null;
    if (bs === 'spin') { const keys = Object.keys(BOX_POOL); gid = keys[Math.floor(this.time * 8) % keys.length]; }
    else if (bs === 'offer') { gid = bw; bwText = WEAPONS[bw].name; }
    this.setLabelOnce(this.boxWeapon, bwText);
    if (gid !== this.boxGunId) {
      this.boxGunId = gid;
      while (this.boxGun.children.length) this.boxGun.remove(this.boxGun.children[0]);
      if (gid) { const w = this.buildWeapon(gid, false); this.boxGun.add(w); }
    }
    this.boxGun.position.y = bs === 'spin' ? 30 + (3 - bt) * 10 : 62;
    this.boxGun.rotation.y = this.time * (bs === 'spin' ? 3 : 1);
    this.boxMesh.material.emissive.setHex(bs === 'idle' ? 0x0a2a38 : 0x40ffff);

    this.partMeshes.forEach((mesh, i) => {
      const p = snap.parts[i];
      mesh.visible = !!p;
      if (p) { mesh.position.set(p[0], 18 + Math.sin(this.time * 3 + i) * 4, p[1]); mesh.rotation.y = this.time * 2; }
    });
    while (this.puMeshes.length < snap.pu.length) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(16, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      this.scene.add(m); this.puMeshes.push(m);
    }
    this.puMeshes.forEach((m, i) => {
      const u = snap.pu[i];
      m.visible = !!u && !(u[4] < 6 && Math.floor(this.time * 6) % 2);
      if (u) { m.position.set(u[1], 24 + Math.sin(this.time * 4) * 4, u[2]); m.rotation.y = this.time * 2; m.rotation.x = 0.5; m.material.color.set(POWERUPS[u[3]].color); }
    });
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
      if (!mesh) { mesh = this.makeZombie(type); this.scene.add(mesh); this.zMeshes.set(id, mesh); }
      seen.add(id);
      const s = sm('z' + id, zs[i + 2], zs[i + 3], zs[i + 4] / 100);
      mesh.position.set(s.x, 0, s.y);
      mesh.rotation.y = -s.a;
      const u = mesh.userData;
      u.attT = Math.max(0, (u.attT || 0) - dt);
      this.animateBody(mesh, s.speed, dt, { zombie: true, runner: type === 1, att: zs[i + 6] || u.attT > 0 });
    }
    for (const [id, mesh] of this.zMeshes) if (!seen.has(id)) { this.scene.remove(mesh); this.zMeshes.delete(id); }

    // Leichen fallen um und versinken später
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i], u = c.mesh.userData;
      c.t += dt;
      const f = smoothstep(0, 0.45, c.t);
      u.body.rotation.z = c.fall * f;
      u.body.rotation.x = 0;
      u.body.position.y = -f * 4;
      if (c.t < 0.4) { c.mesh.position.x += Math.cos(c.a) * c.slide * dt; c.mesh.position.z += Math.sin(c.a) * c.slide * dt; }
      if (c.t > 14) c.mesh.position.y = -(c.t - 14) * 12;
      if (c.t > 16) { this.scene.remove(c.mesh); this.corpses.splice(i, 1); }
    }
    // fliegende Körperteile
    for (let i = this.gibs.length - 1; i >= 0; i--) {
      const g = this.gibs[i], o = g.o;
      g.t += dt;
      if (o.position.y > 3 || g.vy > 0) {
        g.vy -= GRAV * dt;
        o.position.x += g.vx * dt; o.position.y += g.vy * dt; o.position.z += g.vz * dt;
        o.rotation.x += g.rx * dt; o.rotation.y += g.ry * dt; o.rotation.z += g.rz * dt;
        if (o.position.y < 3) {
          o.position.y = 3;
          if (Math.abs(g.vy) > 120) { g.vy = -g.vy * 0.3; g.vx *= 0.5; g.vz *= 0.5; g.rx *= 0.5; g.rz *= 0.5; this.drip(o.position.x, o.position.z); this.r2d.splat(o.position.x, o.position.z, 10); this.decalDirty = true; }
          else { g.vy = 0; g.vx = g.vz = 0; o.rotation.x = Math.round(o.rotation.x / (Math.PI / 2)) * (Math.PI / 2); o.rotation.z = Math.PI / 2; }
        }
        if (g.bleed > 0 && Math.random() < 0.6) this.blood(o.position.x, o.position.y, o.position.z, rnd(0, TAU), rnd(5, 40), rnd(-30, 30));
      }
      g.bleed -= dt;
      if (g.t > 16) o.position.y -= dt * 12;
      if (g.t > 18) { this.scene.remove(o); this.gibs.splice(i, 1); }
    }
    // Stümpfe spritzen
    for (let i = this.stumps.length - 1; i >= 0; i--) {
      const s = this.stumps[i];
      s.t -= dt;
      if (s.t <= 0) { this.stumps.splice(i, 1); continue; }
      for (let j = 0; j < 3; j++) this.blood(s.x, s.y, s.z, s.a + rnd(-1.2, 1.2), rnd(30, 160) * s.t, rnd(60, 200) * s.t);
    }

    // Mitspieler
    const pseen = new Set();
    for (const p of snap.pl) {
      if (p.id === myId || p.s === 2) continue;
      const sl = p.sl[p.cu] || ['pistol', 0];
      let mesh = this.pMeshes.get(p.id);
      if (!mesh || mesh.userData.cls !== p.c || mesh.userData.gunId !== sl[0] + sl[1]) {
        if (mesh) this.scene.remove(mesh);
        mesh = this.playerMesh(p.c, sl[0], !!sl[1]); mesh.userData.cls = p.c;
        this.scene.add(mesh); this.pMeshes.set(p.id, mesh);
      }
      pseen.add(p.id);
      const s = sm('p' + p.id, p.x, p.y, p.a);
      mesh.position.set(s.x, p.s === 1 ? 8 : 0, s.y);
      mesh.rotation.y = -s.a;
      mesh.rotation.z = p.s === 1 ? -1.4 : 0;
      this.setLabelOnce(mesh.userData.tag, p.s === 1 ? `P${p.n} am Boden ${p.bl}s` : `P${p.n}`, true);
      this.animateBody(mesh, s.speed, dt, { player: true });
    }
    for (const [id, mesh] of this.pMeshes) if (!pseen.has(id)) { this.scene.remove(mesh); this.pMeshes.delete(id); }

    // Effekte
    for (const t of this.tracers) {
      if (!t.visible) continue;
      t.userData.life -= dt;
      t.material.opacity = Math.max(0, t.userData.life / 0.06) * 0.8;
      if (t.userData.life <= 0) t.visible = false;
    }
    this.updateParticles(this.bloodP, dt, GRAV);
    this.updateParticles(this.glowP, dt, 0);
    for (const s of this.shells) {
      const u = s.userData;
      if (!s.visible) continue;
      u.t -= dt;
      u.vy -= GRAV * dt;
      s.position.x += u.vx * dt; s.position.y += u.vy * dt; s.position.z += u.vz * dt;
      s.rotation.x += u.r * dt; s.rotation.z += u.r * 0.7 * dt;
      if (s.position.y < 0.5) { s.position.y = 0.5; u.vy = Math.abs(u.vy) > 40 ? -u.vy * 0.35 : 0; u.vx *= 0.6; u.vz *= 0.6; u.r *= 0.6; }
      if (u.t <= 0) s.visible = false;
    }

    this.decalT -= dt;
    if (this.decalDirty && this.decalT <= 0) { this.decalTex.needsUpdate = true; this.decalDirty = false; this.decalT = 1; }

    for (const key in this.smooth) if (this.time - this.smooth[key].seen > 1) delete this.smooth[key];
    this.gl.render(this.scene, this.cam);
  }
}
