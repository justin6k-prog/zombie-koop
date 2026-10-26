// Spieldaten: Waffen, Klassen, Zombies, Perks, Power-ups
const CFG = {
  PLAYER_SPEED: 190, DOWN_SPEED: 35, PLAYER_R: 16, PLAYER_HP: 100,
  REGEN_DELAY: 2.5, REGEN_RATE: 60,
  BLEED_TIME: 30, REVIVE_TIME: 3,
  USE_RANGE: 70, KNIFE_DMG: 150, KNIFE_RANGE: 34,
  BOX_COST: 950, UPGRADE_COST: 5000,
  PTS_HIT: 10, PTS_KILL: 60, PTS_KNIFE: 130, PTS_REPAIR: 10, PTS_NUKE: 400,
  REPAIR_CAP: 500, MAX_PLANKS: 5,
};

const WEAPONS = {
  pistol:  { name: 'P9 Pistole',      dmg: 35,  rof: 4,   mag: 8,   res: 80,  reload: 1.2, spread: 0.03, pellets: 1, range: 700,  pierce: 1 },
  shotgun: { name: 'Schrotflinte',    dmg: 30,  rof: 1.3, mag: 6,   res: 42,  reload: 2.4, spread: 0.22, pellets: 7, range: 380,  pierce: 1 },
  smg:     { name: 'Maschinenpistole', dmg: 26, rof: 11,  mag: 32,  res: 192, reload: 2.0, spread: 0.09, pellets: 1, range: 600,  pierce: 1 },
  rifle:   { name: 'Sturmgewehr',     dmg: 45,  rof: 8,   mag: 30,  res: 180, reload: 2.2, spread: 0.05, pellets: 1, range: 800,  pierce: 1 },
  dmr:     { name: 'Präzisionsgewehr', dmg: 160, rof: 2.2, mag: 10, res: 60,  reload: 2.6, spread: 0.01, pellets: 1, range: 1000, pierce: 3 },
  lmg:     { name: 'Maschinengewehr', dmg: 55,  rof: 10,  mag: 100, res: 400, reload: 4.0, spread: 0.07, pellets: 1, range: 800,  pierce: 2 },
  flame:   { name: 'Flammenwerfer',   dmg: 22,  rof: 15,  mag: 120, res: 360, reload: 3.0, spread: 0,    pellets: 1, range: 220,  pierce: 99, cone: 0.4 },
  plasma:  { name: 'Plasmawerfer',    dmg: 300, rof: 3.5, mag: 20,  res: 160, reload: 2.8, spread: 0.02, pellets: 1, range: 800,  pierce: 1, splash: 90 },
  sniper:  { name: 'Scharfschützengewehr', dmg: 600, rof: 1, mag: 5, res: 40, reload: 3.0, spread: 0, pellets: 1, range: 1400, pierce: 6 },
};
// Wunderkiste: Waffe -> Gewicht
const BOX_POOL = { shotgun: 2, smg: 2, rifle: 2, dmr: 2, lmg: 2, flame: 2, sniper: 2, plasma: 1 };

// Werte einer Waffe, ggf. verbessert
function weaponStats(id, up) {
  const w = WEAPONS[id];
  if (!up) return w;
  return Object.assign({}, w, {
    name: '★ ' + w.name, dmg: w.dmg * 2, mag: Math.round(w.mag * 1.5), res: w.res * 2,
    splash: w.splash ? w.splash * 1.35 : 0,
  });
}

const CLASSES = {
  soldat: { name: 'Soldat',    color: '#6aa84f', abil: 'Raserei',  cd: 45, dur: 8,  info: '+15 % Schaden · Raserei: 8 Sek. Dauerfeuer ohne Nachladen' },
  sani:   { name: 'Sani',      color: '#e6e6e6', abil: 'Heilfeld', cd: 40, dur: 0,  info: 'Belebt doppelt so schnell · Heilfeld: heilt und belebt alle in der Nähe' },
  tech:   { name: 'Techniker', color: '#e69138', abil: 'Geschütz', cd: 60, dur: 30, info: 'Repariert schneller, doppelte Punkte · Geschütz: 30 Sek. Geschützturm' },
};

const ZTYPES = [
  { id: 'walker', r: 14, hpMul: 1,   speed: 55,  dmg: 40,  color: '#6b7f4e' },
  { id: 'runner', r: 12, hpMul: 0.7, speed: 150, dmg: 30,  color: '#8a5a4a' },
  { id: 'brute',  r: 20, hpMul: 3,   speed: 48,  dmg: 70,  color: '#4f5a3c' },
  { id: 'boss',   r: 26, hpMul: 25,  speed: 60,  dmg: 100, color: '#5a3d5c' },
];

const PERKS = {
  jugg:   { name: 'Panzerbrause', cost: 2500, color: '#d64545', info: 'Mehr Leben' },
  speed:  { name: 'Turbo-Cola',   cost: 3000, color: '#45b04a', info: 'Schneller nachladen' },
  dtap:   { name: 'Doppel-Shot',  cost: 2000, color: '#d4a017', info: 'Schneller schießen' },
  revive: { name: 'Engelstrank',  cost: 1500, color: '#3d8ee0', info: 'Schneller wiederbeleben' },
};

const POWERUPS = {
  ammo:   { name: 'Volle Munition',   color: '#e0c040' },
  insta:  { name: 'Sofort-Kill',      color: '#f05050' },
  double: { name: 'Doppelte Punkte',  color: '#50d0f0' },
  nuke:   { name: 'Bombe',            color: '#ff9030' },
};

const PART_NAMES = ['Kurbel', 'Sicherung', 'Kabel'];

// ---------- Beute, Inventar, Rüstung ----------
const RARITY = [
  { name: 'Gewöhnlich', color: '#b0b0b0' },
  { name: 'Selten',     color: '#4a9eff' },
  { name: 'Episch',     color: '#b45cff' },
  { name: 'Legendär',   color: '#ffb02e' },
];
const CONSUMABLES = {
  medkit:     { name: 'Verbandskasten', info: 'Heilt dich voll', icon: '✚', color: '#e04848', max: 3, w: 3 },
  grenade:    { name: 'Granate',        info: 'In Blickrichtung werfen, explodiert nach kurzer Zeit', icon: '●', color: '#7a8a48', max: 4, w: 3 },
  adrenaline: { name: 'Adrenalin',      info: '12 Sek. schneller laufen und schießen', icon: '⚡', color: '#ffd23a', max: 2, w: 1.5 },
  ammobox:    { name: 'Munitionskiste', info: 'Füllt die Munition aller Waffen', icon: '▮', color: '#c9a040', max: 2, w: 1.5 },
};
const ARMOR_SLOTS = { head: 'Kopf', body: 'Körper', legs: 'Beine', feet: 'Füße' };
const ARMOR_NAMES = {
  head: ['Mütze', 'Schutzhelm', 'Taktischer Helm', 'Kampfhelm „Wächter“'],
  body: ['Jacke', 'Schutzweste', 'Plattenträger', 'Panzer „Bollwerk“'],
  legs: ['Arbeitshose', 'Knieschutz-Hose', 'Panzerhose', 'Beinschienen „Fels“'],
  feet: ['Turnschuhe', 'Kampfstiefel', 'Stahlkappen', 'Stiefel „Sturm“'],
};
const ARMOR_BASE = { head: 8, body: 16, legs: 10, feet: 6 };
// Zusatzwerte ab „Selten“, Wert je Seltenheitsstufe
const ARMOR_BONUS = {
  hp:     { per: 10,   fmt: v => `+${Math.round(v)} Leben` },
  speed:  { per: 0.03, fmt: v => `+${Math.round(v * 100)} % Tempo` },
  reload: { per: 0.05, fmt: v => `+${Math.round(v * 100)} % schneller nachladen` },
  dmg:    { per: 0.04, fmt: v => `+${Math.round(v * 100)} % Schaden` },
  regen:  { per: 0.15, fmt: v => `+${Math.round(v * 100)} % Heilung` },
};
const BASE_SLOTS = 8;

// ---------- Fähigkeitenbaum ----------
// Stufe t ist frei, wenn im Zweig schon (t-1)*2 Punkte stecken. fx = Wirkung pro Rang.
const BRANCHES = {
  fire: { name: 'Feuerkraft', color: '#e05050' },
  surv: { name: 'Überleben',  color: '#50c060' },
  tact: { name: 'Taktik',     color: '#4a9eff' },
  team: { name: 'Team',       color: '#ffb02e' },
};
const SKILLS = [
  { id: 'f_dmg',    br: 'fire', t: 1, max: 3, name: 'Scharfschütze',     fx: { dmg: 0.05 },   desc: '+5 % Schaden je Rang' },
  { id: 'f_reload', br: 'fire', t: 1, max: 3, name: 'Schnelle Hände',    fx: { reload: 0.08 }, desc: '+8 % schneller nachladen je Rang' },
  { id: 'f_mag',    br: 'fire', t: 2, max: 2, name: 'Großes Magazin',    fx: { mag: 0.15 },   desc: '+15 % Magazingröße je Rang' },
  { id: 'f_knife',  br: 'fire', t: 2, max: 2, name: 'Messerkämpfer',     fx: { knife: 0.5 },  desc: '+50 % Messerschaden je Rang' },
  { id: 'f_crit',   br: 'fire', t: 3, max: 3, name: 'Kopfschuss',        fx: { crit: 0.05 },  desc: '+5 % Chance auf doppelten Schaden je Rang' },
  { id: 'f_pierce', br: 'fire', t: 3, max: 1, name: 'Durchschlag',       fx: { pierce: 1 },   desc: 'Kugeln durchschlagen einen Zombie mehr' },
  { id: 'f_boom',   br: 'fire', t: 4, max: 2, name: 'Explosivmunition',  fx: { boom: 0.04 },  desc: '+4 % Chance, dass ein Treffer explodiert, je Rang' },
  { id: 'f_dmg2',   br: 'fire', t: 4, max: 3, name: 'Feuersturm',        fx: { dmg: 0.06 },   desc: '+6 % Schaden je Rang' },
  { id: 'f_ult',    br: 'fire', t: 5, max: 1, name: 'Todesbringer',      fx: { dmg: 0.15, crit: 0.1 }, desc: 'ULTIMATE: +15 % Schaden, +10 % doppelter Schaden' },
  { id: 's_hp',     br: 'surv', t: 1, max: 3, name: 'Zäh',               fx: { hp: 15 },      desc: '+15 Leben je Rang' },
  { id: 's_regen',  br: 'surv', t: 1, max: 3, name: 'Schnelle Heilung',  fx: { regen: 0.2 },  desc: '+20 % Heilung je Rang' },
  { id: 's_armor',  br: 'surv', t: 2, max: 3, name: 'Abgehärtet',        fx: { armor: 8 },    desc: '+8 Rüstung je Rang' },
  { id: 's_bleed',  br: 'surv', t: 2, max: 2, name: 'Zäher Wille',       fx: { bleed: 10 },   desc: '+10 Sek. am Boden, bevor du stirbst, je Rang' },
  { id: 's_low',    br: 'surv', t: 3, max: 2, name: 'Letzte Reserve',    fx: { lowdr: 0.15 }, desc: '-15 % Schaden bei wenig Leben je Rang' },
  { id: 's_hp2',    br: 'surv', t: 3, max: 2, name: 'Bärenkraft',        fx: { hp: 25 },      desc: '+25 Leben je Rang' },
  { id: 's_second', br: 'surv', t: 4, max: 1, name: 'Zweite Chance',     fx: { second: 1 },   desc: 'Einmal pro Runde stehst du nach 4 Sek. von selbst auf' },
  { id: 's_armor2', br: 'surv', t: 4, max: 2, name: 'Panzerhaut',        fx: { armor: 15 },   desc: '+15 Rüstung je Rang' },
  { id: 's_ult',    br: 'surv', t: 5, max: 1, name: 'Unzerstörbar',      fx: { hp: 50, armor: 20 }, desc: 'ULTIMATE: +50 Leben, +20 Rüstung' },
  { id: 't_speed',  br: 'tact', t: 1, max: 3, name: 'Flink',             fx: { speed: 0.04 }, desc: '+4 % Tempo je Rang' },
  { id: 't_pts',    br: 'tact', t: 1, max: 3, name: 'Kopfgeld',          fx: { pts: 0.08 },   desc: '+8 % Punkte je Rang' },
  { id: 't_loot',   br: 'tact', t: 2, max: 2, name: 'Plünderer',         fx: { loot: 0.4 },   desc: '+40 % Beute-Chance je Rang' },
  { id: 't_slots',  br: 'tact', t: 2, max: 2, name: 'Großer Rucksack',   fx: { slots: 3 },    desc: '+3 Inventarplätze je Rang' },
  { id: 't_cost',   br: 'tact', t: 3, max: 2, name: 'Feilschen',         fx: { cost: 0.08 },  desc: 'Alles 8 % billiger je Rang' },
  { id: 't_use',    br: 'tact', t: 3, max: 2, name: 'Handwerker',        fx: { use: 0.3 },    desc: '+30 % schneller reparieren je Rang' },
  { id: 't_gren',   br: 'tact', t: 4, max: 2, name: 'Sprengmeister',     fx: { gren: 0.4 },   desc: '+40 % Granatenschaden je Rang' },
  { id: 't_rare',   br: 'tact', t: 4, max: 2, name: 'Schatzsucher',      fx: { rare: 1 },     desc: 'Bessere Beute je Rang' },
  { id: 't_ult',    br: 'tact', t: 5, max: 1, name: 'Glückspilz',        fx: { loot: 0.6, rare: 1, pts: 0.15 }, desc: 'ULTIMATE: viel mehr und bessere Beute, +15 % Punkte' },
  { id: 'm_revive', br: 'team', t: 1, max: 3, name: 'Retter',            fx: { revive: 0.25 }, desc: '+25 % schneller wiederbeleben je Rang' },
  { id: 'm_cd',     br: 'team', t: 1, max: 3, name: 'Training',          fx: { cd: 0.08 },    desc: 'Fähigkeit lädt 8 % schneller je Rang' },
  { id: 'm_aura',   br: 'team', t: 2, max: 2, name: 'Feldsanitäter',     fx: { aura: 3 },     desc: 'Mitspieler in der Nähe heilen +3 Leben/Sek. je Rang' },
  { id: 'm_ammo',   br: 'team', t: 2, max: 1, name: 'Munitionsträger',   fx: { ammo: 0.25 },  desc: '+25 % Reservemunition' },
  { id: 'm_lead',   br: 'team', t: 3, max: 2, name: 'Anführer',          fx: { lead: 0.05 },  desc: 'Mitspieler in der Nähe +5 % Schaden je Rang' },
  { id: 'm_angel',  br: 'team', t: 3, max: 1, name: 'Schutzengel',       fx: { revive: 0.5 }, desc: '+50 % schneller wiederbeleben' },
  { id: 'm_cd2',    br: 'team', t: 4, max: 2, name: 'Erfahrung',         fx: { cd: 0.1 },     desc: 'Fähigkeit lädt 10 % schneller je Rang' },
  { id: 'm_aura2',  br: 'team', t: 4, max: 2, name: 'Lazarett',          fx: { aura: 4 },     desc: 'Mitspieler in der Nähe heilen +4 Leben/Sek. je Rang' },
  { id: 'm_ult',    br: 'team', t: 5, max: 1, name: 'Legende',           fx: { lead: 0.1, cd: 0.15, aura: 5 }, desc: 'ULTIMATE: stärkere Aura, Fähigkeit lädt schneller' },
];
const SKILL_BY_ID = Object.fromEntries(SKILLS.map(s => [s.id, s]));
const SKILL_POINTS_PER_5 = 3;

// Gesamtwerte eines Spielers aus Fähigkeiten und Rüstung
function playerStats(skills, equip) {
  const s = { dmg: 0, reload: 0, mag: 0, crit: 0, pierce: 0, knife: 0, boom: 0, hp: 0, regen: 0, armor: 0, lowdr: 0, bleed: 0,
    second: 0, pts: 0, speed: 0, use: 0, cost: 0, loot: 0, slots: 0, gren: 0, rare: 0, revive: 0, aura: 0, cd: 0, lead: 0, ammo: 0 };
  for (const id in skills) { const n = SKILL_BY_ID[id]; if (n) for (const k in n.fx) s[k] += n.fx[k] * skills[id]; }
  for (const slot in equip) { const it = equip[slot]; if (!it) continue; s.armor += it.a; if (it.b) s[it.b] += it.bv; }
  return s;
}

// Darf dieser Rang gelernt werden?
function canLearn(skills, spt, id) {
  const n = SKILL_BY_ID[id];
  if (!n || spt <= 0 || (skills[id] || 0) >= n.max) return false;
  let inBranch = 0;
  for (const k in skills) if (SKILL_BY_ID[k] && SKILL_BY_ID[k].br === n.br) inBranch += skills[k];
  return inBranch >= (n.t - 1) * 2;
}
