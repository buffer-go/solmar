// Screenshot scenes: deterministic autopilot runs staged with real simulation
// (a few seconds of the actual game running), never hand-drawn frames.
// ?shot=<name>&seed=N stages a scene, paints twice, sets window.__shotReady.
// Scenes are tuned so the frame shows a complete open world: chase (cover),
// street, mission, title.

import { PLACES, POLICE } from './config.js';
import { makeCar, startMission, setBanner } from './world.js';
import { nearestRoadPoint } from './city.js';
import { angleDiff } from './random.js';

function blankInput() {
  return {
    move: { up: false, down: false, left: false, right: false, run: false },
    enter: false, punch: false, reload: false, shoot: false, aimWorld: null,
  };
}

// Manhattan waypoints along road CENTRE lines from (x0, y0) to (x1, y1): snap
// both ends to the nearest road, then turn once (or twice, via the nearest
// cross road) at an intersection. Every leg runs on a centre line — a leg at
// an arbitrary y (e.g. the car's own y) puts the car on the road's edge,
// where its axle circles clip the nearest building and wedge it. Legs are
// densified to a point every ~180 px so the driver follows the road instead
// of beelining across a block.
export function roadPath(city, x0, y0, x1, y1) {
  const a = nearestRoadPoint(city, x0, y0);
  const b = nearestRoadPoint(city, x1, y1);
  const nearestOf = (v, list) => {
    let best = list[0];
    for (const x of list) if (Math.abs(x - v) < Math.abs(best - v)) best = x;
    return best;
  };
  const aOnV = city.roadsX.includes(a.x);
  const bOnH = city.roadsY.includes(b.y);
  const corners = [{ x: a.x, y: a.y }];
  if (aOnV && bOnH) {
    corners.push({ x: a.x, y: b.y });
  } else if (!aOnV && !bOnH) {
    corners.push({ x: b.x, y: a.y });
  } else if (aOnV) {
    // a on a vertical road, b on a vertical road: via the nearest cross road.
    const midY = nearestOf(a.y, city.roadsY);
    corners.push({ x: a.x, y: midY }, { x: b.x, y: midY });
  } else {
    const midX = nearestOf(a.x, city.roadsX);
    corners.push({ x: midX, y: a.y }, { x: midX, y: b.y });
  }
  corners.push({ x: b.x, y: b.y });
  const out = [];
  for (let i = 0; i < corners.length - 1; i++) {
    const p = corners[i];
    const q = corners[i + 1];
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    const steps = Math.max(1, Math.ceil(len / 180));
    for (let s = 0; s < steps; s++) {
      out.push({ x: p.x + ((q.x - p.x) * s) / steps, y: p.y + ((q.y - p.y) * s) / steps });
    }
  }
  out.push({ x: b.x, y: b.y });
  return out;
}

// Driver for the player's car: leg following along the dense waypoint list.
// The target point is always ON the current leg (the car's projection onto
// the leg, plus a lookahead along it), so the car never beelines across a
// block to a far waypoint — that is what wedged it against building corners.
// At a leg's end the target moves onto the next leg and the car turns the
// corner; speed is capped near a sharp corner so the turn fits the
// intersection. A short reverse is only the last-resort recovery when
// aligned but not moving for 2 s.
export function makeCarDriver(state, waypoints) {
  let i = 0;
  let slowSteps = 0;
  let reverseSteps = 0;
  return function (dt) {
    const input = blankInput();
    const car = state.player.car;
    if (!car) return input;
    if (i >= waypoints.length - 1) return input;
    const a = waypoints[i];
    const b = waypoints[i + 1];
    // Project the car onto the current leg (axis-aligned), clamp to it.
    const vertical = Math.abs(b.x - a.x) < Math.abs(b.y - a.y);
    const proj = vertical
      ? { x: a.x, y: Math.min(Math.max(car.y, Math.min(a.y, b.y)), Math.max(a.y, b.y)) }
      : { x: Math.min(Math.max(car.x, Math.min(a.x, b.x)), Math.max(a.x, b.x)), y: a.y };
    const legLen = Math.hypot(b.x - a.x, b.y - a.y);
    const along = vertical ? (proj.y - a.y) / (b.y - a.y || 1) : (proj.x - a.x) / (b.x - a.x || 1);
    // Advance to the next leg once the car is near this one's end.
    if (along > 0.92) {
      i += 1;
      return input;
    }
    // Lookahead along the leg, 120 px ahead of the projection.
    const dirX = legLen > 0 ? (b.x - a.x) / legLen : 0;
    const dirY = legLen > 0 ? (b.y - a.y) / legLen : 0;
    const remain = legLen * (1 - along);
    const ahead = Math.min(120, remain);
    const target = { x: proj.x + dirX * ahead, y: proj.y + dirY * ahead };
    const desired = Math.atan2(target.y - car.y, target.x - car.x);
    const diff = angleDiff(car.angle, desired);
    const absDiff = Math.abs(diff);
    if (reverseSteps > 0) {
      reverseSteps -= 1;
      input.move.down = true;
      input.move.left = diff > 0;
      input.move.right = diff < 0;
      return input;
    }
    if (Math.abs(car.speed) < 30 && absDiff < 1.0) slowSteps += 1;
    else slowSteps = 0;
    if (slowSteps > 120) {
      slowSteps = 0;
      reverseSteps = 40;
      input.move.down = true;
      return input;
    }
    // Speed by heading error, and capped near a sharp corner.
    let targetSpeed = absDiff > 2.5 ? 40 : absDiff > 1.4 ? 50 : absDiff > 0.8 ? 80 : absDiff > 0.4 ? 200 : 540;
    if (remain < 200 && i + 2 < waypoints.length) {
      const c = waypoints[i + 2];
      const turn = Math.abs(angleDiff(Math.atan2(b.y - a.y, b.x - a.x), Math.atan2(c.y - b.y, c.x - b.x)));
      if (turn > 0.5) targetSpeed = Math.min(targetSpeed, 60);
    }
    if (car.speed < targetSpeed) input.move.up = true;
    else if (car.speed > targetSpeed + 40) input.move.down = true;
    input.move.left = diff < -0.08;
    input.move.right = diff > 0.08;
    return input;
  };
}

// Driver for the player on foot: walks a waypoint loop, wrapping around.
export function makeWalkDriver(state, waypoints) {
  let i = 0;
  return function (dt) {
    const input = blankInput();
    const p = state.player;
    if (i >= waypoints.length) i = 0;
    const wp = waypoints[i];
    if (Math.hypot(wp.x - p.x, wp.y - p.y) < 40) {
      i += 1;
      return input;
    }
    const dx = wp.x - p.x;
    const dy = wp.y - p.y;
    input.move.up = dy < -10;
    input.move.down = dy > 10;
    input.move.left = dx < -10;
    input.move.right = dx > 10;
    return input;
  };
}

function putPoliceCar(state, x, y, angle, speed) {
  const car = makeCar('police', x, y, angle, '#20242e');
  car.speed = speed;
  car.health = 100;
  car.active = true;
  car.smoke = 0;
  car.stuck = 0;
  state.cars.push(car);
  return car;
}

function putPlayerInCar(state, x, y, angle, speed) {
  const car = makeCar('player', x, y, angle, '#f5c518');
  car.speed = speed;
  car.isPlayer = true;
  state.cars.push(car);
  state.player.car = car;
  state.player.x = x;
  state.player.y = y;
  state.player.angle = angle;
  return car;
}

// Stage a scene. Returns { seconds, driver } — driver(state, dt) yields the
// input for each fixed step; null driver means "no input".
export function stageShot(state, name) {
  const p = state.player;
  if (name === 'chase') {
    // Cover: staged pursuit on a straight road. Player car heads north at 430;
    // two police cars staged 100 / 180 px behind, wanted 3, 2.5 s of real sim
    // — close enough that both stay in frame on the player's tail.
    putPlayerInCar(state, 1760, 2300, -Math.PI / 2, 430);
    putPoliceCar(state, 1760, 2400, -Math.PI / 2, 500);
    putPoliceCar(state, 1740, 2480, -Math.PI / 2, 500);
    state.wanted = 3;
    startMission(state, 0);
    setBanner(state, 'Mama Luz: Hot Wheels — bring it to Garage Marina.', 4);
    const driver = makeCarDriver(state, roadPath(state.city, 1760, 2300, 1760, 360));
    return { seconds: 2.5, driver };
  }
  if (name === 'street') {
    // On foot downtown, walking a road loop; the loop is crowded on purpose
    // (6 peds + 2 traffic cars) so the frame reads as a living street.
    p.x = 1360;
    p.y = 1160;
    p.angle = 0;
    const loop = [
      { x: 1760, y: 1160 },
      { x: 1760, y: 1560 },
      { x: 1360, y: 1560 },
      { x: 1360, y: 1160 },
    ];
    const spots = [
      { x: 1450, y: 1160 }, { x: 1620, y: 1160 }, { x: 1760, y: 1300 },
      { x: 1760, y: 1480 }, { x: 1500, y: 1560 }, { x: 1360, y: 1380 },
    ];
    for (let i = 0; i < 6; i++) {
      const s = spots[i];
      state.peds.push({ x: s.x, y: s.y, angle: 0, speed: 55, color: '#e07b39', health: 20, flee: 0, walkPhase: i, active: true });
    }
    for (const [x, y, angle] of [[1560, 1160, 0], [1760, 1420, Math.PI / 2]]) {
      const car = makeCar('traffic', x, y, angle, '#4a7fb5');
      car.speed = 130;
      state.cars.push(car);
    }
    startMission(state, 0);
    const driver = makeWalkDriver(state, loop);
    return { seconds: 14, driver };
  }
  if (name === 'mission') {
    // Courier stage 1: drive from the port to the hotel, 55 s on the clock,
    // 1 star, a police car nearby. 14 s of sim: the car is still en route to
    // the hotel (delivery takes ~16 s), so the frame shows it driving with
    // the mission live — a longer run lets the police wreck the car.
    putPlayerInCar(state, 3300, 2300, -Math.PI / 2, 200);
    startMission(state, 1);
    state.mission.stage = 1;
    state.mission.timer = 55;
    state.mission.target = PLACES.hotel;
    state.wanted = 1;
    putPoliceCar(state, 3200, 2150, -Math.PI / 2, 420);
    setBanner(state, 'Sunset Courier — deliver to Hotel Mirada, 55 s!', 4);
    const driver = makeCarDriver(state, roadPath(state.city, 3300, 2300, PLACES.hotel.x, PLACES.hotel.y));
    return { seconds: 14, driver };
  }
  // title: no staging — the living city runs under the title panel.
  return { seconds: 6, driver: null };
}

export const SHOT_NAMES = ['chase', 'street', 'mission', 'title'];
export const SHOT_SECONDS = { chase: 2.5, street: 14, mission: 14, title: 6 };
export const POLICE_CHASE = POLICE;
