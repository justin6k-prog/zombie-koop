// Ablauf: Menü -> Lobby -> Spiel. Ein Gerät ist Host und rechnet das Spiel, die anderen schicken nur Eingaben.
const PREFIX = 'zk-';
const $ = id => document.getElementById(id);

const app = {
  mode: 'menu', isHost: false, myId: null, code: '', cls: 'soldat',
  peer: null, conns: [], hostConn: null,
  lobby: [],          // Host: [{ id, cls }]
  lobbyView: [],      // Anzeige der Lobby
  game: null, snap: null, evQueue: [], netEv: [],
  lastSeen: {}, hostSeen: 0, hostLost: false,
  dropped: {},        // Host: kurz weg gewesene Spieler, Schlüssel -> { id, cls, t }
  reconnecting: false, reconnectStart: 0, retryT: 0,
};

// Fester Schlüssel pro Gerät, damit man nach einem Abbruch seine Figur zurückbekommt
app.key = (() => {
  const make = () => Math.random().toString(36).slice(2, 10);
  try {
    let k = sessionStorage.getItem('zk-key');
    if (!k) { k = make(); sessionStorage.setItem('zk-key', k); }
    return k;
  } catch (e) { return make(); }
})();

const sfx = new Sfx();
const cv = $('cv');
const input = new Input(cv);
let renderer = null;

function show(screen) {
  for (const id of ['menu', 'lobby', 'game']) $(id).style.display = id === screen ? (id === 'game' ? 'block' : 'flex') : 'none';
  $('over').style.display = 'none';
  document.body.classList.toggle('ingame', screen === 'game');
  app.mode = screen;
}

function status(t) { $('msg').textContent = t; }

function makeCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 4; i++) c += abc[Math.floor(Math.random() * abc.length)];
  return c;
}

// ---------- Host ----------
function startHost() {
  sfx.unlock();
  app.code = makeCode();
  app.isHost = true;
  status('Verbinde mit Vermittlung …');
  app.peer = new Peer(PREFIX + app.code);
  app.peer.on('open', () => {
    app.myId = 'host';
    app.lobby = [{ id: 'host', cls: app.cls }];
    enterLobby();
  });
  app.peer.on('connection', conn => {
    conn.on('open', () => {
      app.conns.push(conn);
      app.lastSeen[conn.peer] = performance.now();
      if (!app.lobby.find(p => p.id === conn.peer)) app.lobby.push({ id: conn.peer, cls: 'soldat' });
      if (app.game) app.game.addPlayer(conn.peer, 'soldat');
      sendLobby();
    });
    conn.on('data', d => {
      app.lastSeen[conn.peer] = performance.now();
      if (d.t === 'in' && app.game) app.game.setInput(conn.peer, d.i);
      else if (d.t === 'hello') {
        conn.key = d.key;
        // alte Verbindung desselben Geräts, die der Host noch für offen hält, zuerst abräumen
        for (const c of app.conns.slice()) if (c !== conn && c.key === d.key) { c.close(); dropConn(c); }
        rejoin(conn);
        const p = app.lobby.find(x => x.id === conn.peer);
        if (p && CLASSES[d.cls] && !app.game) p.cls = d.cls;
        if (!app.game) sendLobby();
      } else if (d.t === 'cls') {
        const p = app.lobby.find(x => x.id === conn.peer);
        if (p && CLASSES[d.cls]) p.cls = d.cls;
        if (!app.game) sendLobby();
      } else if (d.t === 'ping') conn.send({ t: 'pong', ts: d.ts });
    });
    conn.on('close', () => dropConn(conn));
  });
  // Verbindung zur Vermittlung verloren (z. B. Bildschirm kurz aus): neu anmelden
  app.peer.on('disconnected', () => { try { app.peer.reconnect(); } catch (e) {} });
  app.peer.on('error', e => {
    if (e.type === 'unavailable-id') { app.peer.destroy(); startHost(); return; }
    status('Fehler: ' + e.type);
  });
}

function dropConn(conn) {
  if (!app.conns.includes(conn)) return;
  app.conns = app.conns.filter(c => c !== conn);
  const le = app.lobby.find(p => p.id === conn.peer);
  app.lobby = app.lobby.filter(p => p.id !== conn.peer);
  delete app.lastSeen[conn.peer];
  if (app.game && conn.key && app.game.players[conn.peer]) {
    // Figur 60 Sek. aufheben, falls das Gerät sich neu verbindet
    app.dropped[conn.key] = { id: conn.peer, cls: le ? le.cls : 'soldat', t: performance.now() };
  } else if (app.game) app.game.removePlayer(conn.peer);
  if (!app.game) sendLobby();
}

// Gerät kommt nach Abbruch zurück: alte Figur übernehmen
function rejoin(conn) {
  const old = app.dropped[conn.key];
  if (!old) return;
  delete app.dropped[conn.key];
  const le = app.lobby.find(p => p.id === conn.peer);
  if (le) le.cls = old.cls;
  const g = app.game;
  if (!g || !g.players[old.id]) return;
  g.removePlayer(conn.peer);
  const p = g.players[old.id];
  delete g.players[old.id];
  p.id = conn.peer;
  g.players[conn.peer] = p;
}

setInterval(() => {
  const now = performance.now();
  for (const [key, d] of Object.entries(app.dropped)) {
    if (now - d.t < 60000) continue;
    if (app.game) app.game.removePlayer(d.id);
    delete app.dropped[key];
  }
}, 5000);

function broadcast(msg) {
  for (const c of app.conns) if (c.open) c.send(msg);
}

function lobbyList() {
  return app.lobby.map((p, i) => ({ id: p.id, n: i + 1, cls: p.cls }));
}

function sendLobby() {
  app.lobbyView = lobbyList();
  broadcast({ t: 'lobby', pl: app.lobbyView, code: app.code });
  if (app.mode === 'lobby') renderLobby();
}

// Wie lange ein Gerät stumm sein darf, bevor es als weg gilt (z. B. beim ersten Laden von 3D)
const NET_TIMEOUT = 8000;
let hostTick = performance.now();
setInterval(() => {
  if (!app.isHost || !app.peer) return;
  const now = performance.now();
  // Hing der Host selbst, zählt die Pause nicht gegen die Mitspieler
  if (now - hostTick > 2000) for (const k in app.lastSeen) app.lastSeen[k] = now;
  hostTick = now;
  // Wer zu lange nichts schickt, ist weg (PeerJS meldet das nicht zuverlässig)
  for (const c of app.conns.slice()) if (now - (app.lastSeen[c.peer] || now) > NET_TIMEOUT) { c.close(); dropConn(c); }
  if (!app.game) sendLobby();
}, 1000);

// 20x pro Sekunde Spielstand an alle
setInterval(() => {
  if (!app.isHost || !app.game || !app.conns.length) { app.netEv = []; return; }
  broadcast({ t: 's', s: app.game.snapshot(), ev: app.netEv });
  app.netEv = [];
}, 50);

function startGame() {
  sfx.unlock();
  app.game = new Game();
  for (const p of app.lobby) app.game.addPlayer(p.id, p.cls);
  enterGame();
}

function backToLobby() {
  app.game = null;
  app.snap = null;
  enterLobby();
  sendLobby();
}

// ---------- Mitspieler ----------
function startJoin() {
  sfx.unlock();
  app.code = $('code').value.trim().toUpperCase();
  if (app.code.length !== 4) { status('Bitte 4-stelligen Code eingeben'); return; }
  status('Verbinde …');
  connectToHost();
}

function connectToHost() {
  if (app.peer) { try { app.peer.destroy(); } catch (e) {} }
  const peer = app.peer = new Peer();
  peer.on('open', id => {
    if (peer !== app.peer) return;
    app.myId = id;
    const conn = app.hostConn = peer.connect(PREFIX + app.code, { reliable: false, serialization: 'json' });
    const timeout = setTimeout(() => { if (!app.reconnecting) status('Keine Verbindung zum Host. Gleiches WLAN/Hotspot?'); }, 10000);
    conn.on('open', () => {
      clearTimeout(timeout);
      app.hostSeen = performance.now();
      app.hostLost = false;
      if (app.reconnecting && renderer) renderer.msg('Wieder verbunden', '#6f6', 2);
      app.reconnecting = false;
      conn.send({ t: 'hello', key: app.key, cls: app.cls });
    });
    conn.on('data', d => {
      if (conn !== app.hostConn) return;
      app.hostSeen = performance.now();
      if (d.t === 'lobby') {
        app.lobbyView = d.pl;
        if (app.mode !== 'lobby') enterLobby(); else renderLobby();
      } else if (d.t === 's') {
        if (app.mode !== 'game') enterGame();
        app.snap = d.s;
        if (d.ev.length) app.evQueue.push(...d.ev);
      } else if (d.t === 'pong') app.ping = Math.round(performance.now() - d.ts);
    });
    conn.on('close', () => { if (conn === app.hostConn) hostGone(); });
  });
  peer.on('error', e => {
    if (app.reconnecting) return;
    status(e.type === 'peer-unavailable' ? 'Code nicht gefunden' : 'Fehler: ' + e.type);
  });
}

// Verbindung weg: im Menü Fehler zeigen, sonst automatisch neu verbinden
function hostGone() {
  if (app.hostLost) return;
  app.hostLost = true;
  if (app.mode === 'menu') { status('Verbindung verloren'); return; }
  app.reconnecting = true;
  app.reconnectStart = app.retryT = performance.now();
  if (renderer) renderer.msg('Verbindung weg – verbinde neu …', '#f66', 4);
  connectToHost();
}

// Eingaben 30x pro Sekunde an den Host, dazu Lebenszeichen
setInterval(() => {
  const c = app.hostConn;
  if (!c || !c.open) return;
  if (app.mode === 'game') c.send({ t: 'in', i: input.packet() });
  else c.send({ t: 'cls', cls: app.cls });
}, 33);
let clientTick = performance.now();
setInterval(() => {
  const c = app.hostConn, now = performance.now();
  // Hing dieses Gerät selbst, zählt die Pause nicht
  if (now - clientTick > 2000 && app.hostSeen) app.hostSeen = now;
  clientTick = now;
  if (c && c.open) c.send({ t: 'ping', ts: now });
  if (app.hostSeen && !app.hostLost && now - app.hostSeen > NET_TIMEOUT) hostGone();
  if (app.reconnecting) {
    if (now - app.reconnectStart > 30000) {
      app.reconnecting = false;
      alert('Verbindung zum Host verloren');
      location.reload();
    } else if (now - app.retryT > 4000) {
      app.retryT = now;
      if (renderer) renderer.msg('Verbinde neu …', '#f66', 3);
      connectToHost();
    }
  }
}, 1000);

// ---------- Lobby ----------
function enterLobby() {
  show('lobby');
  $('lobbyCode').textContent = app.code;
  $('btnStart').style.display = app.isHost ? 'block' : 'none';
  $('waitHost').style.display = app.isHost ? 'none' : 'block';
  renderLobby();
}

function renderLobby() {
  $('lobbyPlayers').innerHTML = app.lobbyView.map(p =>
    `<div class="lp"><span class="dot" style="background:${CLASSES[p.cls].color}"></span>P${p.n} – ${CLASSES[p.cls].name}${p.id === app.myId ? ' (du)' : ''}</div>`).join('');
  for (const el of document.querySelectorAll('.cls')) el.classList.toggle('sel', el.dataset.cls === app.cls);
}

function pickClass(cls) {
  app.cls = cls;
  if (app.isHost) {
    const me = app.lobby.find(p => p.id === 'host');
    if (me) me.cls = cls;
    sendLobby();
  } else if (app.hostConn && app.hostConn.open) app.hostConn.send({ t: 'cls', cls });
  renderLobby();
}

// ---------- Ansicht 2D / 3D ----------
let renderer3d = null, threeLoading = false;
app.view = '2d';

function toggleView() {
  if (app.mode !== 'game' || !renderer) return;
  if (app.view === '3d') { setView('2d'); return; }
  if (window.THREE) { setView('3d'); return; }
  if (threeLoading) return;
  threeLoading = true;
  if (renderer) renderer.msg('Lade 3D …', '#7fd4ff', 3);
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  s.onload = () => { threeLoading = false; setView('3d'); };
  s.onerror = () => { threeLoading = false; if (renderer) renderer.msg('3D konnte nicht geladen werden', '#f66', 3); };
  document.head.appendChild(s);
}

function setView(v) {
  if (v === '3d' && !renderer3d) {
    try { renderer3d = new Renderer3D($('cv3'), renderer); }
    catch (e) { renderer.msg('3D wird nicht unterstützt', '#f66', 3); return; }
    renderer3d.resize();
  }
  app.view = v;
  $('cv3').style.display = v === '3d' ? 'block' : 'none';
  renderer.hudOnly = v === '3d';
  input.setFps(v === '3d');
}
input.onView = toggleView;

// ---------- Spiel ----------
function enterGame() {
  show('game');
  if (!renderer) { renderer = new Renderer(cv); renderer.sfx = sfx; }
  renderer.resize();
  app.overShown = false;
  keepAwake();
}

function showOver(snap) {
  if (app.overShown) return;
  app.overShown = true;
  const rows = snap.pl.slice().sort((a, b) => b.k - a.k).map(p =>
    `<tr><td><span class="dot" style="background:${CLASSES[p.c].color}"></span>P${p.n} ${CLASSES[p.c].name}</td><td>${p.k}</td><td>${p.pts}</td></tr>`).join('');
  $('overText').innerHTML = `Ihr habt bis <b>Runde ${snap.r}</b> überlebt.<table><tr><th>Spieler</th><th>Kills</th><th>Punkte</th></tr>${rows}</table>`;
  $('btnAgain').style.display = app.isHost ? 'inline-block' : 'none';
  $('overWait').style.display = app.isHost ? 'none' : 'block';
  $('over').style.display = 'flex';
}

// Eigene Bewegung sofort zeigen, statt auf den Host zu warten.
// Weicht die Vorhersage zu weit vom Host ab, wird sie sanft (oder bei großem Fehler sofort) korrigiert.
const pred = { x: 0, y: 0, ok: false, snap: null, sx: 0, sy: 0 };
let predSolids = null, predDoors = '';
function predict(dt) {
  const snap = app.snap;
  const me = snap && snap.pl.find(p => p.id === app.myId);
  if (!me) { pred.ok = false; return; }
  if (snap !== pred.snap) { pred.snap = snap; pred.sx = me.x; pred.sy = me.y; }
  if (!pred.ok || me.s === 2) { pred.x = pred.sx; pred.y = pred.sy; pred.ok = true; }
  const key = snap.doors.join('');
  if (!predSolids || key !== predDoors) {
    const m = renderer.map;
    predDoors = key;
    predSolids = m.walls.concat(m.decor, m.windows.map(w => w.rect), m.doors.filter((d, i) => !snap.doors[i]).map(d => d.rect));
  }
  if (me.s !== 2) {
    let mx = input.state.mx, my = input.state.my;
    const l = Math.hypot(mx, my);
    if (l > 1) { mx /= l; my /= l; }
    const sp = me.s === 1 ? CFG.DOWN_SPEED : CFG.PLAYER_SPEED;
    pred.x += mx * sp * dt; pred.y += my * sp * dt;
    pushOut(pred, CFG.PLAYER_R, predSolids);
    const ex = pred.sx - pred.x, ey = pred.sy - pred.y, err = Math.hypot(ex, ey);
    if (err > 100) { pred.x = pred.sx; pred.y = pred.sy; }
    else if (err > 40 || (l < 0.1 && err > 2)) { const k = Math.min(1, (l < 0.1 ? 8 : 3) * dt); pred.x += ex * k; pred.y += ey * k; }
  }
  me.x = pred.x; me.y = pred.y;
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (app.mode === 'game' && renderer) {
    input.frame();
    let evs;
    if (app.isHost && app.game) {
      app.game.setInput('host', input.packet());
      app.game.update(dt);
      app.snap = app.game.snapshot();
      evs = app.game.events;
      app.game.events = [];
      if (app.conns.length) app.netEv.push(...evs);
    } else {
      evs = app.evQueue;
      app.evQueue = [];
    }
    if (app.snap) {
      renderer.onEvents(evs, app.snap, app.myId, sfx);
      if (!app.isHost) predict(dt);
      if (renderer3d) renderer3d.onEvents(evs, app.myId, app.snap);
      if (app.view === '3d') renderer3d.draw(app.snap, app.myId, input, dt);
      renderer.draw(app.snap, app.myId, input, dt, app.isHost);
      if (!app.isHost && app.ping !== undefined) {
        const g = renderer.g;
        g.font = '11px system-ui'; g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,.5)';
        g.fillText(`Ping ${app.ping} ms`, renderer.W / 2, 14);
        g.textAlign = 'left';
      }
      if (app.snap.ph === 'over') showOver(app.snap);
    }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

async function keepAwake() {
  try { if (navigator.wakeLock) await navigator.wakeLock.request('screen'); } catch (e) {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && app.mode === 'game') keepAwake(); });
addEventListener('resize', () => { if (renderer) renderer.resize(); if (renderer3d) renderer3d.resize(); });

$('btnHost').onclick = startHost;
$('btnJoin').onclick = startJoin;
$('btnStart').onclick = startGame;
$('btnAgain').onclick = backToLobby;
$('code').addEventListener('keydown', e => { if (e.key === 'Enter') startJoin(); });
for (const el of document.querySelectorAll('.cls')) el.onclick = () => pickClass(el.dataset.cls);
