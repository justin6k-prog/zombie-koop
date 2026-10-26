// Inventar und Fähigkeitenbaum (Fenster über dem Spiel). Das Spiel läuft dabei weiter.
const invUI = { open: false, tab: 'inv', sel: null, key: '' };

function toggleInv(tab) {
  if (app.mode !== 'game') return;
  if (invUI.open && (!tab || tab === invUI.tab)) { closeInv(); return; }
  invUI.open = true;
  if (typeof tab === 'string') invUI.tab = tab;
  invUI.sel = null; invUI.key = '';
  $('inv').style.display = 'flex';
  input.setFps(input.fps);   // gehaltene Joysticks loslassen
  if (document.pointerLockElement) document.exitPointerLock();
}

function closeInv() { invUI.open = false; $('inv').style.display = 'none'; }

const itemColor = it => it.k === 'armor' ? RARITY[it.r].color : CONSUMABLES[it.k].color;
const itemName = it => it.k === 'armor' ? it.nm : CONSUMABLES[it.k].name;

function itemInfo(it) {
  if (it.k !== 'armor') return [CONSUMABLES[it.k].info];
  const l = [`${ARMOR_SLOTS[it.s]} · ${RARITY[it.r].name}`, `Rüstung ${it.a}`];
  if (it.b) l.push(ARMOR_BONUS[it.b].fmt(it.bv));
  return l;
}

function itemCard(it, attrs, selected) {
  const icon = it.k === 'armor' ? { head: '⛑', body: '🦺', legs: '👖', feet: '🥾' }[it.s] : CONSUMABLES[it.k].icon;
  const sub = it.k === 'armor' ? `Rüstung ${it.a}` : `×${it.n}`;
  return `<div class="card${selected ? ' sel' : ''}" ${attrs} style="--c:${itemColor(it)}">
    <span class="ic">${icon}</span><b>${itemName(it)}</b><small>${sub}</small></div>`;
}

// jedes Bild aufgerufen, zeichnet aber nur neu, wenn sich etwas geändert hat
function updateInv(me) {
  if (!invUI.open || !me) return;
  const key = JSON.stringify([invUI.tab, invUI.sel, me.inv, me.eq, me.sk, me.spt, me.ns, me.s, me.hp === me.mh]);
  if (key === invUI.key) return;
  invUI.key = key;
  $('invTabSk').textContent = 'Fähigkeiten' + (me.spt ? ` (${me.spt} Punkte)` : '');
  $('invTabInv').classList.toggle('on', invUI.tab === 'inv');
  $('invTabSk').classList.toggle('on', invUI.tab === 'skills');
  $('invBody').innerHTML = invUI.tab === 'inv' ? invHtml(me) : skillHtml(me);
}

function invHtml(me) {
  const sel = invUI.sel || {};
  let eq = '';
  for (const s in ARMOR_SLOTS) {
    const it = me.eq[s];
    eq += it ? itemCard(it, `data-a="eq" data-v="${s}"`, sel.eq === s)
      : `<div class="card empty${sel.eq === s ? ' sel' : ''}" data-a="eq" data-v="${s}"><span class="ic">·</span><b>${ARMOR_SLOTS[s]}</b><small>leer</small></div>`;
  }
  let bag = '';
  for (let i = 0; i < me.ns; i++) {
    const it = me.inv[i];
    bag += it ? itemCard(it, `data-a="bag" data-v="${i}"`, sel.bag === i) : '<div class="card empty"></div>';
  }
  const red = Math.round((1 - 100 / (100 + me.ar)) * 100);
  return `<div class="invwrap">
    <div class="eqcol"><div class="h">Ausrüstung</div><div class="eqgrid">${eq}</div>
      <div class="stats">Rüstung <b>${me.ar}</b> (−${red} % Schaden)<br>Leben <b>${me.mh}</b> · Tempo <b>${me.sp}</b></div></div>
    <div class="bagcol"><div class="h">Rucksack ${me.inv.length}/${me.ns}</div><div class="grid">${bag}</div></div>
  </div>${invDetail(me)}`;
}

function invDetail(me) {
  const sel = invUI.sel;
  if (!sel) return '<div class="detail hint">Tippe auf einen Gegenstand. Beute sammelst du durch Drüberlaufen.</div>';
  const dead = me.s !== 0;
  if (sel.eq) {
    const it = me.eq[sel.eq];
    if (!it) return `<div class="detail hint">${ARMOR_SLOTS[sel.eq]}: noch nichts angelegt. Lege Rüstung aus dem Rucksack an.</div>`;
    const full = me.inv.length >= me.ns;
    return `<div class="detail"><div><b style="color:${itemColor(it)}">${it.nm}</b><br><small>${itemInfo(it).join(' · ')}</small></div>
      <div class="btns"><button data-a="unequip" ${full || dead ? 'disabled' : ''}>${full ? 'Rucksack voll' : 'Ablegen'}</button></div></div>`;
  }
  const it = me.inv[sel.bag];
  if (!it) return '<div class="detail hint">Tippe auf einen Gegenstand.</div>';
  let btns = '';
  if (it.k === 'armor') {
    const cur = me.eq[it.s], diff = it.a - (cur ? cur.a : 0);
    btns = `<button data-a="equip" ${dead ? 'disabled' : ''}>Anlegen (${diff >= 0 ? '+' : ''}${diff} Rüstung)</button>`;
  } else {
    const full = it.k === 'medkit' && me.hp >= me.mh;
    btns = `<button data-a="use" ${full || dead ? 'disabled' : ''}>${full ? 'Leben ist voll' : 'Benutzen'}</button>`;
  }
  btns += `<button data-a="drop" class="alt" ${dead ? 'disabled' : ''}>Wegwerfen</button>`;
  return `<div class="detail"><div><b style="color:${itemColor(it)}">${itemName(it)}</b><br><small>${itemInfo(it).join(' · ')}</small></div>
    <div class="btns">${btns}</div></div>`;
}

function branchPoints(sk, br) {
  let n = 0;
  for (const id in sk) if (SKILL_BY_ID[id] && SKILL_BY_ID[id].br === br) n += sk[id];
  return n;
}

function skillHtml(me) {
  let cols = '';
  for (const br in BRANCHES) {
    const B = BRANCHES[br], spent = branchPoints(me.sk, br);
    let tiers = '';
    for (let t = 1; t <= 5; t++) {
      const open = spent >= (t - 1) * 2;
      let nodes = '';
      for (const n of SKILLS.filter(x => x.br === br && x.t === t)) {
        const r = me.sk[n.id] || 0;
        const st = r >= n.max ? 'max' : canLearn(me.sk, me.spt, n.id) ? 'can' : r > 0 ? 'has' : open ? 'open' : 'lock';
        nodes += `<div class="node ${st}${invUI.sel && invUI.sel.sk === n.id ? ' sel' : ''}${t === 5 ? ' ult' : ''}" data-a="sk" data-v="${n.id}">
          <b>${n.name}</b><small>${r}/${n.max}</small></div>`;
      }
      tiers += `<div class="tier${open ? '' : ' locked'}">${nodes}</div>`;
    }
    cols += `<div class="br" style="--c:${B.color}"><div class="brh">${B.name} <small>${spent}</small></div>${tiers}</div>`;
  }
  let det = '<div class="detail hint">Tippe auf eine Fähigkeit. Höhere Stufen werden frei, wenn du im Zweig genug Punkte verteilt hast.</div>';
  const sel = invUI.sel && invUI.sel.sk && SKILL_BY_ID[invUI.sel.sk];
  if (sel) {
    const r = me.sk[sel.id] || 0, ok = canLearn(me.sk, me.spt, sel.id);
    const need = (sel.t - 1) * 2, spent = branchPoints(me.sk, sel.br);
    const why = r >= sel.max ? 'Höchster Rang erreicht' : spent < need ? `Braucht ${need} Punkte in ${BRANCHES[sel.br].name} (${spent})` : me.spt <= 0 ? 'Keine Punkte' : '';
    det = `<div class="detail"><div><b style="color:${BRANCHES[sel.br].color}">${sel.name}</b> <small>Rang ${r}/${sel.max} · Stufe ${sel.t}</small><br><small>${sel.desc}</small></div>
      <div class="btns"><button data-a="learn" ${ok ? '' : 'disabled'}>${ok ? 'Lernen (1 Punkt)' : why}</button></div></div>`;
  }
  return `<div class="skhead">Fähigkeitspunkte: <b>${me.spt}</b> · nach jeder 5. Runde +${SKILL_POINTS_PER_5}</div><div class="tree">${cols}</div>${det}`;
}

$('invBody').addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (!el || el.disabled) return;
  const a = el.dataset.a, v = el.dataset.v, sel = invUI.sel || {};
  if (a === 'bag') invUI.sel = { bag: +v };
  else if (a === 'eq') invUI.sel = { eq: v };
  else if (a === 'sk') invUI.sel = { sk: v };
  else if (a === 'use') { input.cmd({ op: 'use', i: sel.bag }); invUI.sel = null; }
  else if (a === 'equip') { input.cmd({ op: 'equip', i: sel.bag }); invUI.sel = null; }
  else if (a === 'drop') { input.cmd({ op: 'drop', i: sel.bag }); invUI.sel = null; }
  else if (a === 'unequip') { input.cmd({ op: 'unequip', s: sel.eq }); invUI.sel = null; }
  else if (a === 'learn') { input.cmd({ op: 'skill', id: sel.sk }); sfx.play('buy', 0.7); }
  invUI.key = '';
});
$('invTabInv').onclick = () => { invUI.tab = 'inv'; invUI.sel = null; invUI.key = ''; };
$('invTabSk').onclick = () => { invUI.tab = 'skills'; invUI.sel = null; invUI.key = ''; };
$('invClose').onclick = closeInv;
