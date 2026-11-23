// City generation + collision. The city is a road grid over grass, a beach and
// sea to the west, a park block, seven named places and pastel buildings.
// Buildings are placed per block; named places and the park keep their blocks
// clear. Collision is circle-vs-rect push-out for people, and two axle circles
// (one over each axle) for cars, so diagonal cars don't sink into buildings.

import { WORLD, ROADS_X, ROADS_Y, ROAD_W, SIDEWALK, PLACES, COLORS } from './config.js';
import { mulberry32, int, range, pick, chance, clamp } from './random.js';

const PARK_BLOCK = { ix: 4, iy: 3 }; // block between roadsX[4..5], roadsY[3..4]

function blockHasPlace(ix, iy) {
  const cx0 = ROADS_X[ix] + ROAD_W / 2;
  const cx1 = ROADS_X[ix + 1] - ROAD_W / 2;
  const cy0 = ROADS_Y[iy] + ROAD_W / 2;
  const cy1 = ROADS_Y[iy + 1] - ROAD_W / 2;
  // Strictly inside the block's building area. Places sit on roads and
  // intersections, so none of them falls inside a block — the old 60 px
  // expansion swallowed every block next to a named place and left most of
  // the city as empty green lawns.
  for (const p of Object.values(PLACES)) {
    if (p.x > cx0 && p.x < cx1 && p.y > cy0 && p.y < cy1) return true;
  }
  return false;
}

export function generateCity(seed) {
  const rng = mulberry32(seed);
  const buildings = [];
  const trees = [];
  const park = {
    x: ROADS_X[PARK_BLOCK.ix] + ROAD_W / 2,
    y: ROADS_Y[PARK_BLOCK.iy] + ROAD_W / 2,
    w: ROADS_X[PARK_BLOCK.ix + 1] - ROADS_X[PARK_BLOCK.ix] - ROAD_W,
    h: ROADS_Y[PARK_BLOCK.iy + 1] - ROADS_Y[PARK_BLOCK.iy] - ROAD_W,
  };
  for (let i = 0; i < 26; i++) {
    trees.push({ x: park.x + 20 + rng() * (park.w - 40), y: park.y + 20 + rng() * (park.h - 40), r: 12 + rng() * 8 });
  }

  for (let ix = 0; ix < ROADS_X.length - 1; ix++) {
    for (let iy = 0; iy < ROADS_Y.length - 1; iy++) {
      if (ix === PARK_BLOCK.ix && iy === PARK_BLOCK.iy) continue;
      if (blockHasPlace(ix, iy)) continue;
      const x0 = ROADS_X[ix] + ROAD_W / 2 + SIDEWALK;
      const y0 = ROADS_Y[iy] + ROAD_W / 2 + SIDEWALK;
      const x1 = ROADS_X[ix + 1] - ROAD_W / 2 - SIDEWALK;
      const y1 = ROADS_Y[iy + 1] - ROAD_W / 2 - SIDEWALK;
      const bw = x1 - x0;
      const bh = y1 - y0;
      if (bw < 60 || bh < 60) continue;
      // One or two buildings per block, with a gap between them.
      const n = chance(rng, 0.45) ? 2 : 1;
      if (n === 1) {
        buildings.push(makeBuilding(rng, x0 + 8, y0 + 8, bw - 16, bh - 16));
      } else if (bw > bh) {
        const cut = x0 + bw * range(rng, 0.4, 0.6);
        buildings.push(makeBuilding(rng, x0 + 8, y0 + 8, cut - x0 - 16, bh - 16));
        buildings.push(makeBuilding(rng, cut + 8, y0 + 8, x1 - cut - 16, bh - 16));
      } else {
        const cut = y0 + bh * range(rng, 0.4, 0.6);
        buildings.push(makeBuilding(rng, x0 + 8, y0 + 8, bw - 16, cut - y0 - 16));
        buildings.push(makeBuilding(rng, x0 + 8, cut + 8, bw - 16, y1 - cut - 16));
      }
    }
  }

  // Named places get a small plaza building of their own, drawn by the renderer.
  const places = {};
  for (const [key, p] of Object.entries(PLACES)) places[key] = { ...p };

  // 10 parked cars along road edges.
  const parked = [];
  const parkedColors = ['#c94f42', '#4a7fb5', '#e8c33c', '#7fb069', '#b565a7', '#e07b39', '#5bc0be', '#8d99ae'];
  for (let i = 0; i < 10; i++) {
    const vertical = chance(rng, 0.5);
    const road = pick(rng, vertical ? ROADS_X : ROADS_Y);
    // 'along' stays inside the world: y for a vertical road, x for a horizontal one.
    const along = vertical ? int(rng, 500, 2500) : int(rng, 500, 3500);
    const side = chance(rng, 0.5) ? 1 : -1;
    const x = vertical ? road + side * (ROAD_W / 2 - 14) : along;
    const y = vertical ? along : road + side * (ROAD_W / 2 - 14);
    parked.push({ x, y, angle: vertical ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : side > 0 ? 0 : Math.PI, color: parkedColors[i % parkedColors.length] });
  }

  return { seed, roadsX: ROADS_X, roadsY: ROADS_Y, buildings, trees, park, places, parked };
}

function makeBuilding(rng, x, y, w, h) {
  const cols = Math.max(1, Math.floor(w / 46));
  const rows = Math.max(1, Math.floor(h / 46));
  const windows = [];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      if (chance(rng, 0.8)) windows.push({ dx: 12 + c * 46, dy: 12 + r * 46, lit: chance(rng, 0.35) });
    }
  }
  return { x, y, w, h, roof: pick(rng, COLORS.buildingRoof), wall: COLORS.buildingWall, windows };
}

// Is (x, y) on a road surface (not sidewalk)?
export function onRoad(city, x, y) {
  for (const rx of city.roadsX) {
    if (Math.abs(x - rx) <= ROAD_W / 2 && y >= city.roadsY[0] - ROAD_W / 2 && y <= city.roadsY[city.roadsY.length - 1] + ROAD_W / 2) return true;
  }
  for (const ry of city.roadsY) {
    if (Math.abs(y - ry) <= ROAD_W / 2 && x >= city.roadsX[0] - ROAD_W / 2 && x <= city.roadsX[city.roadsX.length - 1] + ROAD_W / 2) return true;
  }
  return false;
}

// Nearest point on a road centre line.
export function nearestRoadPoint(city, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const rx of city.roadsX) {
    const cy = clamp(y, city.roadsY[0], city.roadsY[city.roadsY.length - 1]);
    const d = Math.abs(x - rx) + Math.abs(y - cy);
    if (d < bestD) {
      bestD = d;
      best = { x: rx, y: cy };
    }
  }
  for (const ry of city.roadsY) {
    const cx = clamp(x, city.roadsX[0], city.roadsX[city.roadsX.length - 1]);
    const d = Math.abs(y - ry) + Math.abs(x - cx);
    if (d < bestD) {
      bestD = d;
      best = { x: cx, y: ry };
    }
  }
  return best;
}

// Circle-vs-buildings push-out. Mutates p ({x, y}) in place; returns true on hit.
export function collideBuildings(city, p, r) {
  let hit = false;
  for (const b of city.buildings) {
    const cx = clamp(p.x, b.x, b.x + b.w);
    const cy = clamp(p.y, b.y, b.y + b.h);
    const dx = p.x - cx;
    const dy = p.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 0.01) {
      const d = Math.sqrt(d2);
      p.x = cx + (dx / d) * r;
      p.y = cy + (dy / d) * r;
    } else {
      // Centre inside the rect: push out along the smallest penetration axis.
      const left = p.x - b.x;
      const right = b.x + b.w - p.x;
      const top = p.y - b.y;
      const bottom = b.y + b.h - p.y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) p.x = b.x - r;
      else if (m === right) p.x = b.x + b.w + r;
      else if (m === top) p.y = b.y - r;
      else p.y = b.y + b.h + r;
    }
  }
  return hit;
}

// Car-vs-buildings: two circles, one over each axle (radius 18, offset ±20
// along the car's angle). probe MUST carry .angle — a bare {x, y} gives NaN.
// Mutates probe in place; returns true on hit.
export function collideCar(city, probe, axle = 20, radius = 18) {
  const fx = Math.cos(probe.angle);
  const fy = Math.sin(probe.angle);
  let hit = false;
  for (const s of [axle, -axle]) {
    const p = { x: probe.x + fx * s, y: probe.y + fy * s };
    if (collideBuildings(city, p, radius)) {
      hit = true;
      // Move the car body by the same correction the axle circle got.
      probe.x += p.x - (probe.x + fx * s);
      probe.y += p.y - (probe.y + fy * s);
    }
  }
  return hit;
}

// Keep a point on land (inside the world, east of the sea).
export function clampToLand(p, margin = 10) {
  p.x = clamp(p.x, WORLD.beachX - 260 + margin, WORLD.w - margin);
  p.y = clamp(p.y, margin, WORLD.h - margin);
}
