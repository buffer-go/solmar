// SOLMAR simulation: player on foot / driving, traffic AI, pedestrians, police
// + wanted, combat, cash pickups, particles, the four Mama Luz missions,
// wasted / busted, score. Pure logic — no canvas, no audio, no DOM — so it can
// be smoke-tested from Node.

import {
  WORLD, ROADS_X, ROADS_Y, ROAD_W, PLACES, START_CASH, START_POS, PLAYER,
  CAR, TRAFFIC_COUNT, PED_COUNT, PICKUP_COUNT, PICKUP_VALUE, PICKUP_RESPAWN,
  PARTICLE_MAX, POLICE, WANTED, GUN, MISSIONS,
} from './config.js';
import { generateCity, onRoad, nearestRoadPoint, collideBuildings, collideCar, clampToLand } from './city.js';
import { mulberry32, int, range, pick, chance, clamp, dist2, angleTo, angleDiff } from './random.js';

export const EVENT_PICKUP = 1;
export const EVENT_SHOT = 2;
export const EVENT_HIT = 4;
export const EVENT_BUSTED = 8;
export const EVENT_WASTED = 16;
export const EVENT_MISSION = 32;
export const EVENT_WANTED_UP = 64;
export const EVENT_CRIME = 128;
export const EVENT_ENTER_CAR = 256;
export const EVENT_COIN = 512;

const TRAFFIC_COLORS = ['#c94f42', '#4a7fb5', '#e8c33c', '#7fb069', '#b565a7', '#e07b39', '#5bc0be', '#8d99ae', '#d9d9d9', '#3d5a80'];
const PED_COLORS = ['#e07b39', '#7fb069', '#b565a7', '#4a7fb5', '#c94f42', '#8d99ae', '#e8c33c', '#5bc0be'];

export function makeCar(kind, x, y, angle, color) {
  return {
    kind, x, y, angle, speed: 0, health: CAR.health, color,
    active: true, smoke: 0, stuck: 0, ramTimer: 0, hitTimer: 0,
    road: null, dir: 1, stolen: false, isPlayer: false,
  };
}

function randomRoadPoint(rng, city) {
  const vertical = chance(rng, 0.5);
  if (vertical) {
    return { x: pick(rng, city.roadsX) + (chance(rng, 0.5) ? 24 : -24), y: int(rng, 400, 2300) };
  }
  return { x: int(rng, 600, 3300), y: pick(rng, city.roadsY) + (chance(rng, 0.5) ? 24 : -24) };
}

export function createWorld(seed) {
  const rng = mulberry32(seed * 7919 + 13);
  const city = generateCity(seed);
  const state = {
    seed,
    city,
    time: 0,
    player: {
      x: START_POS.x, y: START_POS.y, angle: -Math.PI / 2, health: PLAYER.health,
      car: null, ammo: GUN.mag, reserve: GUN.reserve, aimX: 0, aimY: 0,
    },
    cars: [],
    peds: [],
    cops: [],
    pickups: [],
    drops: [],
    particles: [],
    wanted: 0,
    wantedTimer: 0,
    quietTimer: 0,
    cash: START_CASH,
    earned: 0,
    best: 0,
    missionIndex: 0,
    mission: null,
    storyDone: false,
    events: 0,
    banner: '',
    bannerTimer: 0,
    message: '',
    messageTimer: 0,
    respawnTimer: 0,
    bustHold: 0,
    shotFlash: 0,
  };
  state.city = city;

  for (let i = 0; i < TRAFFIC_COUNT; i++) {
    const p = randomRoadPoint(rng, city);
    const vertical = chance(rng, 0.5);
    const car = makeCar('traffic', p.x, p.y, vertical ? (chance(rng, 0.5) ? Math.PI / 2 : -Math.PI / 2) : chance(rng, 0.5) ? 0 : Math.PI, pick(rng, TRAFFIC_COLORS));
    car.road = vertical ? 'x' : 'y';
    car.dir = chance(rng, 0.5) ? 1 : -1;
    car.speed = range(rng, 110, 170);
    state.cars.push(car);
  }
  for (const parked of city.parked) {
    const car = makeCar('parked', parked.x, parked.y, parked.angle, parked.color);
    state.cars.push(car);
  }
  for (let i = 0; i < PED_COUNT; i++) {
    const p = randomRoadPoint(rng, city);
    state.peds.push(makePed(rng, p.x, p.y));
  }
  for (let i = 0; i < PICKUP_COUNT; i++) {
    const p = randomRoadPoint(rng, city);
    state.pickups.push({ x: p.x, y: p.y, value: PICKUP_VALUE, timer: 0, taken: false });
  }
  return state;
}

function makePed(rng, x, y) {
  const vertical = chance(rng, 0.5);
  return {
    x, y, angle: vertical ? (chance(rng, 0.5) ? Math.PI / 2 : -Math.PI / 2) : chance(rng, 0.5) ? 0 : Math.PI,
    speed: range(rng, 45, 75), color: pick(rng, PED_COLORS), health: 20,
    flee: 0, walkPhase: rng() * Math.PI * 2, active: true,
  };
}

function addWanted(state, n, why) {
  if (state.wanted >= WANTED.max) return;
  state.wanted = Math.min(WANTED.max, state.wanted + n);
  state.wantedTimer = 0;
  state.quietTimer = 0;
  state.events |= EVENT_WANTED_UP | EVENT_CRIME;
  if (why) setMessage(state, why);
}

export function setBanner(state, text, seconds = 3) {
  state.banner = text;
  state.bannerTimer = seconds;
}

export function setMessage(state, text, seconds = 2.5) {
  state.message = text;
  state.messageTimer = seconds;
}

export function startMission(state, index) {
  const def = MISSIONS[index];
  if (!def) return;
  state.missionIndex = index; // set here: a mission that completes must not restart itself
  state.mission = { def, stage: 0, timer: def.timeLimit ?? 0, target: null, drops: 0, collected: 0 };
  if (def.id === 'sunset-courier') state.mission.target = PLACES.port;
  if (def.id === 'the-big-one') state.mission.target = null;
  setBanner(state, `${def.giver}: ${def.name} — ${def.brief}`, 4);
  setMessage(state, `Mission: ${def.stages[0]}`);
}

function completeMission(state) {
  const m = state.mission;
  if (!m) return;
  state.cash += m.def.reward;
  state.earned += m.def.reward;
  state.events |= EVENT_MISSION;
  setBanner(state, `Mission complete: ${m.def.name} — $${m.def.reward}`, 4);
  state.mission = null;
  state.missionIndex += 1; // increment on completion, never on start
  if (state.missionIndex >= MISSIONS.length) {
    state.storyDone = true;
    setBanner(state, 'Story complete — Solmar is yours, boss.', 6);
  } else {
    startMission(state, state.missionIndex);
  }
}

function failMission(state, why) {
  if (!state.mission) return;
  setBanner(state, `Mission failed: ${why}`, 3);
  state.mission = null;
  // Retry the same mission from the start.
  startMission(state, state.missionIndex);
}

function spawnParticles(state, x, y, color, n, speed = 120) {
  for (let i = 0; i < n; i++) {
    if (state.particles.length >= PARTICLE_MAX) return;
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.4 + Math.random() * 0.8);
    state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.4, color });
  }
}

function nearestCar(state, x, y, maxD) {
  let best = null;
  let bestD = maxD * maxD;
  for (const car of state.cars) {
    if (!car.active) continue;
    const d = dist2(x, y, car.x, car.y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

function enterCar(state) {
  const p = state.player;
  const car = nearestCar(state, p.x, p.y, 78);
  if (!car) return;
  if (car.kind === 'traffic' || car.kind === 'parked') {
    if (!car.stolen) {
      car.stolen = true;
      addWanted(state, 1, 'Grand theft auto! +1 star');
    }
  }
  p.car = car;
  car.isPlayer = true;
  car.speed = 0;
  state.events |= EVENT_ENTER_CAR;
  spawnParticles(state, car.x, car.y, '#f5c518', 6, 60);
}

function exitCar(state) {
  const p = state.player;
  const car = p.car;
  if (!car) return;
  car.isPlayer = false;
  car.speed = 0;
  const side = { x: p.x + Math.cos(car.angle + Math.PI / 2) * 44, y: p.y + Math.sin(car.angle + Math.PI / 2) * 44 };
  p.x = side.x;
  p.y = side.y;
  p.angle = car.angle;
  p.car = null;
  clampToLand(p);
}

function damagePlayer(state, n) {
  const p = state.player;
  p.health -= n;
  state.events |= EVENT_HIT;
  if (p.health <= 0) {
    state.events |= EVENT_WASTED;
    const lost = Math.floor(state.cash * 0.15);
    state.cash -= lost;
    setBanner(state, `WASTED — you wake up at Solmar General. Lost $${lost}.`, 4);
    p.health = PLAYER.health;
    p.x = PLACES.hospital.x;
    p.y = PLACES.hospital.y + 80;
    p.angle = Math.PI / 2;
    if (p.car) {
      p.car.isPlayer = false;
      p.car = null;
    }
    state.wanted = 0;
    state.cops = [];
    state.bustHold = 0;
  }
}

function bustPlayer(state) {
  const p = state.player;
  state.events |= EVENT_BUSTED;
  const lost = Math.floor(state.cash * 0.1);
  state.cash -= lost;
  setBanner(state, `BUSTED — the cops take $${lost}. You walk out of the station.`, 4);
  p.health = PLAYER.health;
  p.x = PLACES.station.x;
  p.y = PLACES.station.y + 80;
  p.angle = -Math.PI / 2;
  if (p.car) {
    p.car.isPlayer = false;
    p.car = null;
  }
  state.wanted = 0;
  state.cops = [];
  state.bustHold = 0;
}

// --- traffic AI -------------------------------------------------------------
function stepTraffic(state, car, dt) {
  const p = state.player;
  const dPlayer = Math.sqrt(dist2(car.x, car.y, p.x, p.y));
  if (dPlayer > 1600) {
    // Respawn near the player, on a road.
    const rng = Math.random;
    const pt = nearestRoadPoint(state.city, p.x + (rng() - 0.5) * 900, p.y + (rng() - 0.5) * 900);
    car.x = pt.x;
    car.y = pt.y;
    car.speed = 120;
    return;
  }
  // Slow for the car ahead within ~90.
  let targetSpeed = 150;
  for (const other of state.cars) {
    if (other === car || !other.active) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const ahead = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
    const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
    if (ahead > 0 && ahead < 90 && side < 40) targetSpeed = 40;
  }
  car.speed += clamp(targetSpeed - car.speed, -260 * dt, 200 * dt);
  // Steer along the road: snap angle toward the road direction, turn at intersections.
  const onX = Math.abs(Math.sin(car.angle)) < 0.7;
  const roadCoord = onX ? car.y : car.x;
  const roads = onX ? state.city.roadsY : state.city.roadsX;
  let nearest = roads[0];
  for (const r of roads) if (Math.abs(r - roadCoord) < Math.abs(nearest - roadCoord)) nearest = r;
  const desired = onX ? (Math.cos(car.angle) >= 0 ? 0 : Math.PI) : Math.sin(car.angle) >= 0 ? Math.PI / 2 : -Math.PI / 2;
  // At an intersection, sometimes turn onto the crossing road.
  const atX = state.city.roadsX.some((rx) => Math.abs(car.x - rx) < 14);
  const atY = state.city.roadsY.some((ry) => Math.abs(car.y - ry) < 14);
  if (atX && atY && Math.random() < dt * 0.25) {
    car.angle = desired + (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
  } else {
    car.angle += clamp(angleDiff(car.angle, desired), -2.2 * dt, 2.2 * dt);
  }
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  // Keep on the road: nudge back toward the centre line.
  const pt = nearestRoadPoint(state.city, car.x, car.y);
  const dx = pt.x - car.x;
  const dy = pt.y - car.y;
  const d = Math.hypot(dx, dy);
  if (d > 60) {
    car.x += (dx / d) * 60 * dt;
    car.y += (dy / d) * 60 * dt;
  }
  clampToLand(car, 40);
}

// --- pedestrians ------------------------------------------------------------
function stepPed(state, ped, dt) {
  if (!ped.active) return;
  const p = state.player;
  const pc = p.car;
  const threatX = pc ? pc.x : p.x;
  const threatY = pc ? pc.y : p.y;
  const threatSpeed = pc ? Math.abs(pc.speed) : 0;
  const d = Math.sqrt(dist2(ped.x, ped.y, threatX, threatY));
  if ((threatSpeed > 260 && d < 140) || state.shotFlash > 0) ped.flee = 1.6;
  if (ped.flee > 0) {
    ped.flee -= dt;
    const a = angleTo(threatX, threatY, ped.x, ped.y);
    ped.angle = a;
    ped.x += Math.cos(a) * 170 * dt;
    ped.y += Math.sin(a) * 170 * dt;
  } else {
    ped.walkPhase += dt * 6;
    ped.x += Math.cos(ped.angle) * ped.speed * dt;
    ped.y += Math.sin(ped.angle) * ped.speed * dt;
    if (!onRoad(state.city, ped.x, ped.y) && Math.random() < dt * 0.5) {
      ped.angle += (Math.random() < 0.5 ? 1 : -1) * Math.PI * (0.5 + Math.random() * 0.5);
    }
  }
  collideBuildings(state.city, ped, 12);
  clampToLand(ped, 30);
  if (ped.health <= 0) ped.active = false;
}

// --- police -----------------------------------------------------------------
function stepPolice(state, dt) {
  const p = state.player;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;
  const want = Math.min(state.wanted, POLICE.maxCars);
  // Count existing police cars (staged ones count too).
  let policeCars = state.cars.filter((c) => c.kind === 'police' && c.active);
  while (policeCars.length < want) {
    const a = Math.random() * Math.PI * 2;
    const car = makeCar('police', px + Math.cos(a) * POLICE.spawnDist, py + Math.sin(a) * POLICE.spawnDist, angleTo(px, py, px + Math.cos(a) * POLICE.spawnDist, py + Math.sin(a) * POLICE.spawnDist), POLICE.police);
    car.speed = POLICE.chaseSpeed;
    state.cars.push(car);
    policeCars.push(car);
  }
  while (policeCars.length > want) {
    const car = policeCars.pop();
    car.active = false;
  }
  for (const car of policeCars) {
    if (!car.active) continue;
    const target = angleTo(car.x, car.y, px, py);
    car.angle += clamp(angleDiff(car.angle, target), -3.2 * dt, 3.2 * dt);
    car.speed += clamp(POLICE.chaseSpeed - car.speed, -700 * dt, 500 * dt);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    const probe = { x: car.x, y: car.y, angle: car.angle };
    if (collideCar(state.city, probe)) {
      car.x = probe.x;
      car.y = probe.y;
    }
    clampToLand(car, 40);
    car.ramTimer -= dt;
    // Ram the player's car: one hit per car per cooldown, police bounces back.
    if (p.car && car.ramTimer <= 0) {
      const d = Math.sqrt(dist2(car.x, car.y, p.car.x, p.car.y));
      if (d < 70) {
        car.ramTimer = POLICE.ramCooldown;
        car.speed *= -0.4;
        // Push the police car out of the player's car so the two never sit
        // on top of each other mid-ram (the old code only reversed speed,
        // which left them overlapping for frames at a time).
        if (d > 0.01) {
          const push = 70 - d;
          car.x += ((car.x - p.car.x) / d) * push;
          car.y += ((car.y - p.car.y) / d) * push;
        }
        p.car.health -= POLICE.ramDamage;
        state.events |= EVENT_HIT;
        spawnParticles(state, p.car.x, p.car.y, '#e8d44d', 8, 140);
        if (p.car.health <= 0) {
          p.car.smoke = 1;
          p.car.health = 0;
          p.car.speed = 0;
          setMessage(state, 'Your car is wrecked — get out (E).');
        }
      }
    }
  }

  // Foot cops when the player is on foot and wanted.
  if (!p.car && state.wanted > 0) {
    while (state.cops.length < Math.min(state.wanted, 3)) {
      const a = Math.random() * Math.PI * 2;
      state.cops.push({
        x: p.x + Math.cos(a) * 500, y: p.y + Math.sin(a) * 500,
        angle: 0, speed: POLICE.footSpeed, health: POLICE.copHealth, hold: 0, active: true,
      });
    }
    for (const cop of state.cops) {
      if (!cop.active) continue;
      const d = Math.sqrt(dist2(cop.x, cop.y, p.x, p.y));
      cop.angle = angleTo(cop.x, cop.y, p.x, p.y);
      if (d > 34) {
        cop.x += Math.cos(cop.angle) * cop.speed * dt;
        cop.y += Math.sin(cop.angle) * cop.speed * dt;
        cop.hold = 0;
      } else {
        cop.hold += dt;
        if (cop.hold >= POLICE.footHoldTime) {
          bustPlayer(state);
          return;
        }
      }
      collideBuildings(state.city, cop, 12);
    }
  } else {
    state.cops = state.cops.filter((c) => c.active && c.health > 0);
    if (state.wanted === 0) state.cops = [];
  }
}

// --- combat -----------------------------------------------------------------
function nearestTarget(state, x, y, angle, maxD, maxArc) {
  let best = null;
  let bestD = maxD;
  const consider = (tx, ty, obj) => {
    const d = Math.sqrt(dist2(x, y, tx, ty));
    if (d > bestD) return;
    if (Math.abs(angleDiff(angle, angleTo(x, y, tx, ty))) > maxArc) return;
    bestD = d;
    best = obj;
  };
  for (const ped of state.peds) if (ped.active) consider(ped.x, ped.y, { type: 'ped', obj: ped });
  for (const cop of state.cops) if (cop.active) consider(cop.x, cop.y, { type: 'cop', obj: cop });
  return best;
}

function doPunch(state) {
  const p = state.player;
  const t = nearestTarget(state, p.x, p.y, p.angle, PLAYER.punchRange, 0.9);
  if (!t) return;
  t.obj.health -= PLAYER.punchDamage;
  state.events |= EVENT_HIT;
  spawnParticles(state, t.obj.x, t.obj.y, '#f5f1e6', 5, 90);
  if (t.type === 'ped') {
    addWanted(state, 1, 'Assault! +1 star');
    if (t.obj.health <= 0) t.obj.active = false;
  } else if (t.type === 'cop') {
    if (t.obj.health <= 0) {
      t.obj.active = false;
      addWanted(state, 2, 'You dropped a cop! +2 stars');
    }
  }
}

function doShoot(state, wx, wy) {
  const p = state.player;
  if (p.ammo <= 0) {
    setMessage(state, 'Out of ammo — press R to reload.');
    return;
  }
  p.ammo -= 1;
  state.events |= EVENT_SHOT;
  state.shotFlash = 0.6;
  const angle = angleTo(p.x, p.y, wx, wy);
  const t = nearestTarget(state, p.x, p.y, angle, GUN.range, 0.12);
  spawnParticles(state, p.x + Math.cos(angle) * 26, p.y + Math.sin(angle) * 26, '#e8d44d', 4, 160);
  if (!t) return;
  t.obj.health -= GUN.damage;
  spawnParticles(state, t.obj.x, t.obj.y, '#c94f42', 8, 130);
  if (t.type === 'ped') {
    addWanted(state, 1, 'Shooting in public! +1 star');
    if (t.obj.health <= 0) t.obj.active = false;
  } else if (t.type === 'cop') {
    if (t.obj.health <= 0) {
      t.obj.active = false;
      addWanted(state, 2, 'You dropped a cop! +2 stars');
    }
  }
}

// --- missions ---------------------------------------------------------------
function stepMission(state, dt) {
  const m = state.mission;
  if (!m) return;
  const p = state.player;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;
  const near = (place, r = 90) => Math.sqrt(dist2(px, py, place.x, place.y)) < r;

  if (m.def.id === 'hot-wheels') {
    if (m.stage === 0) {
      if (p.car) {
        m.stage = 1;
        m.target = PLACES.garage;
        setMessage(state, 'Now drive it to Garage Marina.');
      }
    } else if (near(PLACES.garage, 110)) {
      completeMission(state);
    }
  } else if (m.def.id === 'sunset-courier') {
    if (m.stage === 0) {
      m.target = PLACES.port;
      if (near(PLACES.port, 110)) {
        m.stage = 1;
        m.timer = m.def.timeLimit;
        m.target = PLACES.hotel;
        setMessage(state, 'Package picked up — 75 seconds to Hotel Mirada!');
      }
    } else {
      m.timer -= dt;
      if (m.timer <= 0) {
        failMission(state, 'the delivery was too slow');
        return;
      }
      if (near(PLACES.hotel, 110)) completeMission(state);
    }
  } else if (m.def.id === 'lose-the-heat') {
    if (m.stage === 0) {
      if (state.wanted >= 3) {
        m.stage = 1;
        setMessage(state, 'Now lose every star.');
      }
    } else if (state.wanted === 0) {
      completeMission(state);
    }
  } else if (m.def.id === 'the-big-one') {
    if (m.stage === 0) {
      if (state.wanted >= 2 && m.drops === 0) {
        // Spawn the four drops at road points away from the player.
        for (let i = 0; i < m.def.drops; i++) {
          const pt = randomRoadPoint(Math.random, state.city);
          state.drops.push({ x: pt.x, y: pt.y, value: 150, taken: false });
        }
        m.drops = m.def.drops;
        setMessage(state, 'Four drops are out — grab them all!');
      }
      if (m.drops > 0) {
        for (const d of state.drops) {
          if (!d.taken && Math.sqrt(dist2(px, py, d.x, d.y)) < 60) {
            d.taken = true;
            m.collected += 1;
            state.cash += d.value;
            state.earned += d.value;
            state.events |= EVENT_COIN;
            spawnParticles(state, d.x, d.y, '#f5c518', 10, 120);
            setMessage(state, `Drop ${m.collected} of ${m.def.drops} — $${d.value}`);
          }
        }
        if (m.collected >= m.def.drops) {
          m.stage = 1;
          m.target = PLACES.hideout;
          setMessage(state, 'All drops collected — get back to the Hideout.');
        }
      }
    } else if (near(PLACES.hideout, 110)) {
      completeMission(state);
    }
  }
}

// --- main step --------------------------------------------------------------
export function stepWorld(state, input, dt) {
  state.events = 0;
  state.time += dt;
  if (state.bannerTimer > 0) state.bannerTimer -= dt;
  if (state.messageTimer > 0) state.messageTimer -= dt;
  if (state.shotFlash > 0) state.shotFlash -= dt;
  const p = state.player;

  // Aim (mouse world position) is always tracked for the pistol.
  if (input.aimWorld) {
    p.aimX = input.aimWorld.x;
    p.aimY = input.aimWorld.y;
  }

  if (input.enter) {
    if (p.car) exitCar(state);
    else enterCar(state);
  }
  if (input.reload) {
    const need = GUN.mag - p.ammo;
    const take = Math.min(need, p.reserve);
    if (take > 0) {
      p.ammo += take;
      p.reserve -= take;
      setMessage(state, 'Reloaded.');
    }
  }
  if (input.punch && !p.car) doPunch(state);
  if (input.shoot && !p.car) doShoot(state, p.aimX, p.aimY);

  if (p.car) {
    const car = p.car;
    // Arcade driving: speed scalar + angle.
    if (input.move.up) car.speed += CAR.accel * dt;
    else if (input.move.down) car.speed -= CAR.accel * 0.7 * dt;
    else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 320 * dt);
    car.speed = clamp(car.speed, -CAR.reverseMax, CAR.maxSpeed);
    const steer = (input.move.left ? -1 : 0) + (input.move.right ? 1 : 0);
    // Steering stays effective at crawl speed (a 0.15 floor): with a purely
    // speed-proportional rate the turning radius is a constant ~215 px at any
    // speed, so a U-turn never fits an intersection. The floor keeps the
    // radius tight when slow; a stopped car does not rotate.
    const steerScale = car.speed === 0 ? 0 : Math.max(Math.abs(car.speed) / CAR.maxSpeed, 0.15) * (car.speed < 0 ? -1 : 1);
    car.angle += steer * CAR.steer * steerScale * dt;
    const before = { x: car.x, y: car.y };
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    const probe = { x: car.x, y: car.y, angle: car.angle };
    if (collideCar(state.city, probe)) {
      car.x = probe.x;
      car.y = probe.y;
      if (Math.abs(car.speed) > CAR.wallDamageSpeed) {
        car.hitTimer -= dt;
        if (car.hitTimer <= 0) {
          car.hitTimer = CAR.wallDamageCooldown;
          car.health -= CAR.wallDamage;
          state.events |= EVENT_HIT;
        }
      }
      car.speed *= CAR.wallSpeedCut;
    }
    void before;
    clampToLand(car, 40);
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    if (car.health <= 0) {
      car.health = 0;
      car.speed = 0;
      car.smoke = 1;
    }
    if (car.smoke > 0 && Math.random() < dt * 8) {
      spawnParticles(state, car.x, car.y - 10, '#888888', 1, 40);
    }
  } else {
    // On foot.
    const speed = input.move.run ? PLAYER.run : PLAYER.walk;
    let mx = (input.move.right ? 1 : 0) - (input.move.left ? 1 : 0);
    let my = (input.move.down ? 1 : 0) - (input.move.up ? 1 : 0);
    const len = Math.hypot(mx, my);
    if (len > 0) {
      mx /= len;
      my /= len;
      p.angle = Math.atan2(my, mx);
      p.x += mx * speed * dt;
      p.y += my * speed * dt;
      collideBuildings(state.city, p, PLAYER.radius);
      clampToLand(p);
    }
  }

  for (const car of state.cars) {
    if (!car.active || car.isPlayer) continue;
    if (car.kind === 'traffic') stepTraffic(state, car, dt);
    else if (car.kind === 'police') { /* police move in stepPolice */ }
  }
  stepPolice(state, dt);
  for (const ped of state.peds) stepPed(state, ped, dt);

  // Cash pickups.
  for (const pk of state.pickups) {
    if (pk.taken) {
      pk.timer -= dt;
      if (pk.timer <= 0) {
        const pt = randomRoadPoint(Math.random, state.city);
        pk.x = pt.x;
        pk.y = pt.y;
        pk.taken = false;
      }
      continue;
    }
    if (Math.sqrt(dist2(p.x, p.y, pk.x, pk.y)) < 40) {
      pk.taken = true;
      pk.timer = PICKUP_RESPAWN;
      state.cash += pk.value;
      state.earned += pk.value;
      state.events |= EVENT_PICKUP | EVENT_COIN;
      spawnParticles(state, pk.x, pk.y, '#f5c518', 10, 120);
    }
  }

  // Particles.
  for (const pt of state.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.life -= dt;
  }
  state.particles = state.particles.filter((pt) => pt.life > 0);

  // Wanted decay: 1 star per 14 s quiet, no police near.
  if (state.wanted > 0) {
    const nearPolice = state.cars.some((c) => c.kind === 'police' && c.active && Math.sqrt(dist2(p.x, p.y, c.x, c.y)) < WANTED.quietRadius);
    if (!nearPolice && state.cops.length === 0) {
      state.quietTimer += dt;
      if (state.quietTimer >= WANTED.decaySeconds) {
        state.quietTimer = 0;
        state.wanted -= 1;
      }
    } else {
      state.quietTimer = 0;
    }
  }

  stepMission(state, dt);

  // Respawn peds that died, far from the player, to keep the streets alive.
  if (state.peds.filter((pd) => pd.active).length < 10 && Math.random() < dt * 0.2) {
    const pt = randomRoadPoint(Math.random, state.city);
    state.peds.push(makePed(Math.random, pt.x, pt.y));
  }

  return state.events;
}
