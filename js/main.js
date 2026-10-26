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
};

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
      else if (d.t === 'cls') {
        const p = app.lobby.find(x => x.id === conn.peer);
        if (p && CLASSES[d.cls]) p.cls = d.cls;
        if (!app.game) sendLobby();
      } else if (d.t === 'ping') conn.send({ t: 'pong', ts: d.ts });
    });
    conn.on('close', () => dropConn(conn));
  });
  app.peer.on('error', e => {
    if (e.type === 'unavailable-id') { app.peer.destroy(); startHost(); return; }
    status('Fehler: ' + e.type);
  });
}

function dropConn(conn) {
  app.conns = app.conns.filter(c => c !== conn);
  app.lobby = app.lobby.filter(p => p.id !== conn.peer);
  delete app.lastSeen[conn.peer];
  if (app.game) app.game.removePlayer(conn.peer);
  if (!app.game) sendLobby();
}

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

setInterval(() => {
  if (!app.isHost || !app.peer) return;
  // Wer 3 Sek. nichts schickt, ist weg (PeerJS meldet das nicht zuverlässig)
  const now = performance.now();
  for (const c of app.conns.slice()) if (now - (app.lastSeen[c.peer] || now) > 3000) { c.close(); dropConn(c); }
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
  app.peer = new Peer();
  app.peer.on('open', id => {
    app.myId = id;
    const conn = app.hostConn = app.peer.connect(PREFIX + app.code, { reliable: false, serialization: 'json' });
    const timeout = setTimeout(() => status('Keine Verbindung zum Host. Gleiches WLAN/Hotspot?'), 10000);
    conn.on('open', () => {
      clearTimeout(timeout);
      app.hostSeen = performance.now();
      conn.send({ t: 'cls', cls: app.cls });
    });
    conn.on('data', d => {
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
    conn.on('close', hostGone);
  });
  app.peer.on('error', e => status(e.type === 'peer-unavailable' ? 'Code nicht gefunden' : 'Fehler: ' + e.type));
}

function hostGone() {
  if (app.hostLost) return;
  app.hostLost = true;
  alert('Verbindung zum Host verloren');
  location.reload();
}

// Eingaben 30x pro Sekunde an den Host, dazu Lebenszeichen
setInterval(() => {
  const c = app.hostConn;
  if (!c || !c.open) return;
  if (app.mode === 'game') c.send({ t: 'in', i: input.packet() });
  else c.send({ t: 'cls', cls: app.cls });
}, 33);
setInterval(() => {
  const c = app.hostConn;
  if (c && c.open) c.send({ t: 'ping', ts: performance.now() });
  if (app.hostSeen && !app.hostLost && performance.now() - app.hostSeen > 4000) hostGone();
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
      if (renderer3d) renderer3d.onEvents(evs, app.myId);
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
