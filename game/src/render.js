// Rendering: canvas 2D, everything drawn with primitives. Camera follows the
// player (or their car); the city, cars, people, mission markers, HUD, minimap
// and panels are all drawn here. screenToWorld accounts for devicePixelRatio.

import { WORLD, ROADS_X, ROADS_Y, ROAD_W, SIDEWALK, PLACES, CAR, COLORS, MISSIONS } from './config.js';
import { clamp } from './random.js';

export function createCamera() {
  return { x: 0, y: 0, snap: false };
}

export function updateCamera(camera, focusX, focusY, viewW, viewH) {
  const tx = clamp(focusX - viewW / 2, 0, Math.max(0, WORLD.w - viewW));
  const ty = clamp(focusY - viewH / 2, 0, Math.max(0, WORLD.h - viewH));
  if (camera.snap) {
    camera.x = tx;
    camera.y = ty;
    camera.snap = false;
  } else {
    camera.x += (tx - camera.x) * 0.12;
    camera.y += (ty - camera.y) * 0.12;
  }
}

export function screenToWorld(camera, sx, sy, dpr) {
  return { x: camera.x + sx / dpr, y: camera.y + sy / dpr };
}

function drawBuilding(ctx, b) {
  // Shadow, wall, roof, windows.
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(b.x + 5, b.y + 6, b.w, b.h);
  ctx.fillStyle = b.wall;
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.fillStyle = b.roof;
  ctx.fillRect(b.x, b.y, b.w, 10);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  for (const w of b.windows) {
    ctx.fillStyle = w.lit ? '#ffe9a3' : '#5a6b7d';
    ctx.fillRect(b.x + w.dx, b.y + w.dy, 16, 20);
  }
}

function drawCar(ctx, car) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const L = CAR.length;
  const W = CAR.width;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(-L / 2 + 3, -W / 2 + 4, L, W);
  ctx.fillStyle = car.color;
  ctx.beginPath();
  ctx.roundRect(-L / 2, -W / 2, L, W, 8);
  ctx.fill();
  // Cabin + windshield.
  ctx.fillStyle = 'rgba(20,28,38,0.85)';
  ctx.beginPath();
  ctx.roundRect(-8, -W / 2 + 6, 20, W - 12, 5);
  ctx.fill();
  // Headlights.
  ctx.fillStyle = '#fff8c0';
  ctx.fillRect(L / 2 - 4, -W / 2 + 3, 3, 6);
  ctx.fillRect(L / 2 - 4, W / 2 - 9, 3, 6);
  if (car.kind === 'police') {
    ctx.fillStyle = '#f5f1e6';
    ctx.fillRect(-L / 2 + 8, -W / 2, 14, W);
    ctx.fillStyle = '#20242e';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PD', 0, 3);
    // Light bar.
    const t = Date.now() / 300;
    ctx.fillStyle = Math.floor(t) % 2 === 0 ? COLORS.policeLight : COLORS.policeLight2;
    ctx.fillRect(-6, -W / 2 - 2, 12, 5);
  }
  ctx.restore();
  if (car.smoke > 0) {
    ctx.fillStyle = 'rgba(120,120,120,0.6)';
    ctx.beginPath();
    ctx.arc(car.x - 10, car.y - 14, 8 + Math.sin(Date.now() / 200) * 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPed(ctx, ped, isCop) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.arc(2, 3, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = isCop ? '#20242e' : ped.color;
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, Math.PI * 2);
  ctx.fill();
  // Facing tick.
  ctx.strokeStyle = isCop ? '#3b6fe2' : '#f5f1e6';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(ped.angle) * 12, Math.sin(ped.angle) * 12);
  ctx.stroke();
  if (isCop) {
    ctx.fillStyle = '#3b6fe2';
    ctx.fillRect(-4, -13, 8, 4);
  }
  ctx.restore();
}

function drawMinimap(ctx, state, camera, viewW, viewH) {
  const mw = 208;
  const mh = 150;
  const mx = viewW - mw - 14;
  const my = 14;
  const sx = mw / WORLD.w;
  const sy = mh / WORLD.h;
  ctx.fillStyle = COLORS.hudBg;
  ctx.fillRect(mx - 4, my - 4, mw + 8, mh + 8);
  ctx.fillStyle = COLORS.grass;
  ctx.fillRect(mx, my, mw, mh);
  ctx.fillStyle = COLORS.sea;
  ctx.fillRect(mx, my, (WORLD.beachX - 260) * sx, mh);
  ctx.fillStyle = COLORS.road;
  for (const rx of ROADS_X) ctx.fillRect(mx + rx * sx - 2, my, 4, mh);
  for (const ry of ROADS_Y) ctx.fillRect(mx, my + ry * sy, mw, 4);
  // Mission target.
  const m = state.mission;
  if (m && m.target) {
    ctx.fillStyle = '#f5c518';
    ctx.beginPath();
    ctx.arc(mx + m.target.x * sx, my + m.target.y * sy, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const car of state.cars) {
    if (!car.active) continue;
    ctx.fillStyle = car.kind === 'police' ? '#3b6fe2' : '#f5f1e6';
    ctx.fillRect(mx + car.x * sx - 1.5, my + car.y * sy - 1.5, 3, 3);
  }
  const p = state.player;
  ctx.fillStyle = COLORS.player;
  ctx.beginPath();
  ctx.arc(mx + p.x * sx, my + p.y * sy, 4, 0, Math.PI * 2);
  ctx.fill();
  // Viewport frame.
  ctx.strokeStyle = 'rgba(245,241,230,0.8)';
  ctx.lineWidth = 1;
  ctx.strokeRect(mx + camera.x * sx, my + camera.y * sy, viewW * sx, viewH * sy);
}

function drawHUD(ctx, state, viewW, viewH) {
  const p = state.player;
  ctx.fillStyle = COLORS.hudBg;
  ctx.fillRect(10, 10, 250, 64);
  ctx.fillStyle = COLORS.hudText;
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`$${state.cash}`, 22, 36);
  ctx.font = '13px sans-serif';
  ctx.fillText(`Score ${state.earned}`, 120, 35);
  // Health bar.
  ctx.fillStyle = '#333';
  ctx.fillRect(22, 46, 120, 10);
  ctx.fillStyle = p.health > 40 ? '#58b368' : '#c94f42';
  ctx.fillRect(22, 46, 120 * clamp(p.health / 100, 0, 1), 10);
  ctx.fillStyle = COLORS.hudText;
  ctx.fillText(`Ammo ${p.ammo}/${p.reserve}`, 155, 55);
  // Wanted stars, top centre.
  const starW = 26;
  const total = WANTED_STARS * starW;
  const sx0 = viewW / 2 - total / 2;
  for (let i = 0; i < WANTED_STARS; i++) {
    ctx.fillStyle = i < state.wanted ? '#f5c518' : 'rgba(245,241,230,0.25)';
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('★', sx0 + i * starW + starW / 2, 38);
  }
  // Mission bar.
  if (state.mission) {
    const m = state.mission;
    const label = m.stage === 0 ? m.def.stages[0] : m.def.stages[1] ?? m.def.stages[0];
    const timer = m.def.id === 'sunset-courier' && m.stage === 1 ? ` — ${Math.max(0, Math.ceil(m.timer))}s` : '';
    ctx.fillStyle = COLORS.hudBg;
    const text = `${m.def.name}: ${label}${timer}`;
    ctx.font = '15px sans-serif';
    const w = ctx.measureText(text).width + 24;
    ctx.fillRect(viewW / 2 - w / 2, 48, w, 28);
    ctx.fillStyle = COLORS.hudText;
    ctx.textAlign = 'center';
    ctx.fillText(text, viewW / 2, 67);
  }
  // Banner.
  if (state.bannerTimer > 0 && state.banner) {
    ctx.fillStyle = 'rgba(10,14,22,0.8)';
    ctx.font = 'bold 18px sans-serif';
    const w = ctx.measureText(state.banner).width + 32;
    ctx.fillRect(viewW / 2 - w / 2, viewH - 120, w, 34);
    ctx.fillStyle = COLORS.banner;
    ctx.textAlign = 'center';
    ctx.fillText(state.banner, viewW / 2, viewH - 97);
  }
  // Message line.
  if (state.messageTimer > 0 && state.message) {
    ctx.fillStyle = COLORS.hudText;
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(state.message, viewW / 2, viewH - 76);
  }
  // Speed + hint.
  if (p.car) {
    const kmh = Math.round(Math.abs(p.car.speed) * 0.42);
    ctx.fillStyle = COLORS.hudBg;
    ctx.fillRect(viewW - 130, viewH - 54, 116, 40);
    ctx.fillStyle = COLORS.hudText;
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${kmh} KM/H`, viewW - 26, viewH - 24);
  }
  ctx.fillStyle = 'rgba(245,241,230,0.75)';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('WASD move/drive · E enter car · F punch · Click shoot · R reload · Esc pause', 12, viewH - 12);
}

const WANTED_STARS = 5;

function drawPanel(ctx, viewW, viewH, title, lines, hint) {
  ctx.fillStyle = 'rgba(8, 10, 16, 0.72)';
  ctx.fillRect(0, 0, viewW, viewH);
  ctx.fillStyle = COLORS.hudText;
  ctx.textAlign = 'center';
  ctx.font = 'bold 44px sans-serif';
  ctx.fillText(title, viewW / 2, viewH / 2 - 60);
  ctx.font = '17px sans-serif';
  let y = viewH / 2 - 10;
  for (const line of lines) {
    ctx.fillText(line, viewW / 2, y);
    y += 26;
  }
  if (hint) {
    ctx.fillStyle = COLORS.banner;
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(hint, viewW / 2, y + 22);
  }
}

export function render(ctx, state, camera, view, screen) {
  const { w: viewW, h: viewH, dpr } = view;
  const t = state.time;
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, viewW, viewH);
  ctx.fillStyle = '#0b0e14';
  ctx.fillRect(0, 0, viewW, viewH);
  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  const city = state.city;
  // Sea + beach + grass.
  ctx.fillStyle = COLORS.seaDeep;
  ctx.fillRect(camera.x - 40, camera.y - 40, viewW + 80, viewH + 80);
  ctx.fillStyle = COLORS.sea;
  ctx.fillRect(camera.x - 40, camera.y - 40, Math.max(0, WORLD.beachX - 260 - camera.x + 40), viewH + 80);
  // Waves.
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const wy = camera.y + ((i * 173 + Math.floor(t * 30)) % (viewH + 80)) - 40;
    ctx.beginPath();
    ctx.moveTo(Math.max(0, WORLD.beachX - 260 - 60), wy);
    ctx.quadraticCurveTo(40, wy + 12, 90, wy);
    ctx.stroke();
  }
  ctx.fillStyle = COLORS.sand;
  ctx.fillRect(Math.max(0, WORLD.beachX - 260), camera.y - 40, 260, viewH + 80);
  ctx.fillStyle = COLORS.grass;
  ctx.fillRect(WORLD.beachX, 0, WORLD.w - WORLD.beachX, WORLD.h);
  // Park.
  ctx.fillStyle = COLORS.park;
  ctx.fillRect(city.park.x, city.park.y, city.park.w, city.park.h);
  // Sidewalks.
  ctx.fillStyle = COLORS.sidewalk;
  for (const rx of ROADS_X) ctx.fillRect(rx - ROAD_W / 2 - SIDEWALK, 0, ROAD_W + SIDEWALK * 2, WORLD.h);
  for (const ry of ROADS_Y) ctx.fillRect(0, ry - ROAD_W / 2 - SIDEWALK, WORLD.w, ROAD_W + SIDEWALK * 2);
  // Roads.
  ctx.fillStyle = COLORS.road;
  for (const rx of ROADS_X) ctx.fillRect(rx - ROAD_W / 2, 0, ROAD_W, WORLD.h);
  for (const ry of ROADS_Y) ctx.fillRect(0, ry - ROAD_W / 2, WORLD.w, ROAD_W);
  // Centre dashes.
  ctx.strokeStyle = COLORS.roadLine;
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 30]);
  for (const rx of ROADS_X) {
    ctx.beginPath();
    ctx.moveTo(rx, 0);
    ctx.lineTo(rx, WORLD.h);
    ctx.stroke();
  }
  for (const ry of ROADS_Y) {
    ctx.beginPath();
    ctx.moveTo(0, ry);
    ctx.lineTo(WORLD.w, ry);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // Trees.
  for (const tree of city.trees) {
    ctx.fillStyle = COLORS.treeDark;
    ctx.beginPath();
    ctx.arc(tree.x + 2, tree.y + 3, tree.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.tree;
    ctx.beginPath();
    ctx.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Buildings.
  for (const b of city.buildings) drawBuilding(ctx, b);
  // Named places.
  ctx.textAlign = 'center';
  for (const [key, place] of Object.entries(city.places)) {
    ctx.fillStyle = 'rgba(10,14,22,0.55)';
    ctx.beginPath();
    ctx.arc(place.x, place.y, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f5f1e6';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(place.name, place.x, place.y + 52);
    void key;
  }
  // Mission target marker: pulsing ring + label.
  const m = state.mission;
  if (m && m.target) {
    const pulse = 1 + Math.sin(t * 5) * 0.15;
    ctx.strokeStyle = '#f5c518';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(m.target.x, m.target.y, 46 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#f5c518';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(m.target.name.toUpperCase(), m.target.x, m.target.y - 56);
  }
  // Cash pickups + drops.
  for (const pk of state.pickups) {
    if (pk.taken) continue;
    ctx.fillStyle = '#f5c518';
    ctx.beginPath();
    ctx.arc(pk.x, pk.y, 10 + Math.sin(t * 4 + pk.x) * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7a5c00';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('$', pk.x, pk.y + 4);
  }
  for (const d of state.drops) {
    if (d.taken) continue;
    ctx.fillStyle = '#58b368';
    ctx.beginPath();
    ctx.arc(d.x, d.y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f5f1e6';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('$', d.x, d.y + 4);
  }
  // Particles.
  for (const pt of state.particles) {
    ctx.globalAlpha = clamp(pt.life * 2, 0, 1);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - 2, pt.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;
  // Cars (traffic + parked + police).
  for (const car of state.cars) {
    if (!car.active || car.isPlayer) continue;
    drawCar(ctx, car);
  }
  // Peds + cops.
  for (const ped of state.peds) if (ped.active) drawPed(ctx, ped, false);
  for (const cop of state.cops) if (cop.active) drawPed(ctx, cop, true);
  // Player car, then player on foot.
  const p = state.player;
  if (p.car) drawCar(ctx, p.car);
  else {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.arc(2, 3, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7a5c00';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(p.angle) * 16, Math.sin(p.angle) * 16);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  // HUD + minimap (screen space).
  if (screen === 'play' || screen === 'paused') {
    drawMinimap(ctx, state, camera, viewW, viewH);
    drawHUD(ctx, state, viewW, viewH);
  }

  if (screen === 'title') {
    drawPanel(ctx, viewW, viewH, 'SOLMAR', [
      'Streets of Solmar — a sun-soaked open-world crime game.',
      'Steal cars, outrun the police, run jobs for Mama Luz.',
      `Cash $${state.cash} · Best haul $${state.best ?? 0}`,
    ], 'Press SPACE to start');
  } else if (screen === 'paused') {
    drawPanel(ctx, viewW, viewH, 'PAUSED', ['Take a breather, boss.'], 'Press ESC to resume');
  } else if (screen === 'over') {
    drawPanel(ctx, viewW, viewH, state.overTitle ?? 'WASTED', [state.overText ?? 'Solmar General patched you up.'], 'Press SPACE to keep playing');
  } else if (screen === 'win') {
    drawPanel(ctx, viewW, viewH, 'STORY COMPLETE', [
      'All four jobs done. Solmar is yours, boss.',
      `Total earned: $${state.earned} · Best haul $${state.best ?? 0}`,
    ], 'Press SPACE to keep playing');
  }
  ctx.restore();
}
