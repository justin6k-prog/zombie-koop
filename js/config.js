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
