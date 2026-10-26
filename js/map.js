// Karte: Hauptstraße (Start), Tankstelle, Krankenhaus, Bunker
const MAP_W = 2600, MAP_H = 1700, WALL_T = 24;

function buildMap() {
  const walls = [], windows = [], doors = [];
  const T = WALL_T;

  // Wandlinie mit Lücken (Fenster/Türen). gap: { a, b, win: {room, out} } oder { a, b, door: {opens, cost} }
  function line(horizontal, pos, from, to, gaps) {
    let cur = from - T / 2;
    const end = to + T / 2;
    const seg = (a, b) => {
      if (b - a <= 0) return null;
      return horizontal ? { x: a, y: pos - T / 2, w: b - a, h: T } : { x: pos - T / 2, y: a, w: T, h: b - a };
    };
    for (const g of gaps) {
      const s = seg(cur, g.a);
      if (s) walls.push(s);
      const rect = seg(g.a, g.b);
      const mid = (g.a + g.b) / 2;
      const cx = horizontal ? mid : pos, cy = horizontal ? pos : mid;
      if (g.win) {
        const nx = horizontal ? 0 : g.win.out, ny = horizontal ? g.win.out : 0;
        windows.push({ id: windows.length, rect, x: cx, y: cy, nx, ny, room: g.win.room, horizontal,
          planks: CFG.MAX_PLANKS, spawnX: cx + nx * 70, spawnY: cy + ny * 70 });
      } else {
        doors.push({ id: doors.length, rect, x: cx, y: cy, opens: g.door.opens, cost: g.door.cost, open: false, horizontal });
      }
      cur = g.b;
    }
    const s = seg(cur, end);
    if (s) walls.push(s);
  }
  const H = (y, x1, x2, g = []) => line(true, y, x1, x2, g);
  const V = (x, y1, y2, g = []) => line(false, x, y1, y2, g);
  const win = (a, room, out) => ({ a, b: a + 70, win: { room, out } });

  // Hauptstraße / Bunker
  H(800, 900, 1700, [{ a: 1250, b: 1350, door: { opens: 'bunker', cost: 1500 } }]);
  H(200, 1000, 1600, [win(1410, 'bunker', -1)]);
  V(1000, 200, 800, [win(600, 'bunker', -1)]);
  V(1600, 200, 800, [win(340, 'bunker', 1)]);
  H(1400, 900, 1700, [win(1040, 'street', 1), win(1480, 'street', 1)]);
  // Krankenhaus und Tankstelle an der Straße
  V(900, 700, 1500, [{ a: 1050, b: 1150, door: { opens: 'hosp', cost: 1000 } }]);
  V(1700, 800, 1400, [{ a: 1050, b: 1150, door: { opens: 'gas', cost: 750 } }]);
  // Tankstelle
  H(800, 1700, 2400, [win(1940, 'gas', -1)]);
  H(1400, 1700, 2400, [win(2140, 'gas', 1)]);
  V(2400, 800, 1400, [win(1065, 'gas', 1)]);
  // Krankenhaus
  H(700, 200, 900, [win(440, 'hosp', -1)]);
  H(1500, 200, 900, [win(590, 'hosp', 1)]);
  V(200, 700, 1500, [win(1065, 'hosp', -1)]);

  const rooms = {
    street: { name: 'Hauptstraße', x: 900, y: 800, w: 800, h: 600, open: true, floor: 'street' },
    gas:    { name: 'Tankstelle',  x: 1700, y: 800, w: 700, h: 600, open: false, floor: 'gas' },
    hosp:   { name: 'Krankenhaus', x: 200, y: 700, w: 700, h: 800, open: false, floor: 'hosp' },
    bunker: { name: 'Bunker',      x: 1000, y: 200, w: 600, h: 600, open: false, floor: 'bunker' },
  };

  // Hindernisse (blockieren Laufen und Kugeln)
  const decor = [
    { kind: 'car',   x: 1380, y: 1170, w: 130, h: 60 },
    { kind: 'car2',  x: 1010, y: 900, w: 60, h: 120 },
    { kind: 'pump',  x: 1980, y: 1040, w: 40, h: 120 },
    { kind: 'pump',  x: 2160, y: 1040, w: 40, h: 120 },
    { kind: 'bed',   x: 300, y: 850, w: 60, h: 110 },
    { kind: 'bed',   x: 500, y: 850, w: 60, h: 110 },
    { kind: 'bed',   x: 700, y: 850, w: 60, h: 110 },
    { kind: 'bed',   x: 480, y: 1250, w: 110, h: 60 },
    { kind: 'crate', x: 1120, y: 420, w: 60, h: 60 },
    { kind: 'crate', x: 1450, y: 520, w: 80, h: 60 },
  ];

  // Stationen. side = an welcher Wand sie hängen (für die Zeichnung)
  const wallbuys = [
    { w: 'shotgun', cost: 500,  x: 955,  y: 838,  side: 'n' },
    { w: 'smg',     cost: 1000, x: 1630, y: 1362, side: 's' },
    { w: 'rifle',   cost: 1200, x: 2362, y: 1250, side: 'e' },
    { w: 'dmr',     cost: 1500, x: 238,  y: 1350, side: 'w' },
  ];
  const perks = [
    { p: 'jugg',   x: 270,  y: 745,  side: 'n' },
    { p: 'revive', x: 840,  y: 1455, side: 's' },
    { p: 'speed',  x: 2340, y: 845,  side: 'n' },
    { p: 'dtap',   x: 1760, y: 1355, side: 's' },
  ];
  const lever = { x: 1300, y: 245 };
  const upgrade = { x: 1065, y: 270 };
  const box = { x: 1530, y: 735 };

  const partSpots = [
    [1000, 1320], [1600, 880], [1330, 1340],
    [1880, 1320], [2300, 900], [2090, 1110],
    [300, 1440], [800, 790], [420, 1150],
    [1200, 520], [1350, 660],
  ];

  const lamps = [
    [1100, 1000], [1500, 1000], [1300, 1300],
    [1900, 950], [2250, 1250],
    [400, 900], [650, 1300],
    [1150, 350], [1450, 450],
  ];

  const spawn = [[1250, 1080], [1330, 1080], [1290, 1130], [1250, 1130]];

  return { walls, windows, doors, rooms, decor, wallbuys, perks, lever, upgrade, box, partSpots, lamps, spawn };
}

// Raum, in dem ein Punkt liegt (oder null = draußen)
function roomAt(map, x, y) {
  for (const k in map.rooms) {
    const r = map.rooms[k];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return k;
  }
  return null;
}
