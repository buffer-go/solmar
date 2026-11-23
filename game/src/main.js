// Boot + game loop. Fixed-step simulation (1/60 s, MAX_FRAME 0.25 s), five
// screens (title / play / paused / over / win), autosave every 5 s, ?seed=N
// determinism and ?shot=<name>&seed=N staged screenshot scenes (paint twice,
// then window.__shotReady).

import { createWorld, startMission, stepWorld, EVENT_PICKUP, EVENT_SHOT, EVENT_MISSION, EVENT_BUSTED, EVENT_WASTED, EVENT_COIN } from './world.js';
import { createInput } from './input.js';
import { createCamera, updateCamera, render, screenToWorld } from './render.js';
import { createAudio } from './audio.js';
import { saveGame, loadGame, applySave } from './save.js';
import { stageShot, SHOT_NAMES } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;
const AUTOSAVE_SECONDS = 5;

const params = new URLSearchParams(window.location.search);
const seed = Number(params.get('seed') ?? 7) || 7;
const shotName = params.get('shot');

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let viewW = 1280;
let viewH = 800;
let dpr = 1;

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  viewW = window.innerWidth;
  viewH = window.innerHeight;
  canvas.width = Math.round(viewW * dpr);
  canvas.height = Math.round(viewH * dpr);
  canvas.style.width = `${viewW}px`;
  canvas.style.height = `${viewH}px`;
}
window.addEventListener('resize', resize);
resize();

const state = createWorld(seed);
const input = createInput(canvas);
const camera = createCamera();
const audio = createAudio();
camera.snap = true;

// Debug/testing handle: lets a playtest (or a player poking at the console)
// read the live state. Read-only in practice; gameplay never consults it.
window.__game = { state, camera, get screen() { return screen; } };

let screen = 'title';
let saveTimer = AUTOSAVE_SECONDS;
let lastEvents = 0;

function currentView() {
  return { w: viewW, h: viewH, dpr };
}

function paint() {
  updateCamera(camera, state.player.x, state.player.y, viewW, viewH);
  render(ctx, state, camera, currentView(), screen);
}

function playSoundFor(events) {
  if (events & EVENT_MISSION) audio.play('mission');
  else if (events & EVENT_BUSTED) audio.play('busted');
  else if (events & EVENT_PICKUP) audio.play('pickup');
  else if (events & EVENT_COIN) audio.play('pickup');
  else if (events & EVENT_SHOT) audio.play('shot');
}

function frameInput() {
  const actions = input.takeActions();
  const move = input.move();
  const aim = screenToWorld(camera, input.mouse.x, input.mouse.y, dpr);
  return { move, ...actions, aimWorld: aim };
}

// --- screenshot mode --------------------------------------------------------
if (shotName && SHOT_NAMES.includes(shotName)) {
  screen = shotName === 'title' ? 'title' : 'play';
  const shot = stageShot(state, shotName);
  camera.snap = true;
  const steps = Math.round(shot.seconds / STEP);
  for (let i = 0; i < steps; i++) {
    const simInput = shot.driver ? shot.driver(state, STEP) : { move: { up: false, down: false, left: false, right: false, run: false }, enter: false, punch: false, reload: false, shoot: false, aimWorld: null };
    stepWorld(state, simInput, STEP);
  }
  updateCamera(camera, state.player.x, state.player.y, viewW, viewH);
  render(ctx, state, camera, currentView(), screen);
  render(ctx, state, camera, currentView(), screen);
  window.__shotReady = true;
} else {
  // --- normal play ----------------------------------------------------------
  const saved = loadGame();
  if (saved) applySave(state, saved);
  camera.x = state.player.x - viewW / 2;
  camera.y = state.player.y - viewH / 2;

  let last = performance.now();
  let acc = 0;

  function loop(now) {
    requestAnimationFrame(loop);
    let frame = (now - last) / 1000;
    last = now;
    if (frame > MAX_FRAME) frame = MAX_FRAME;
    acc += frame;

    const actions = input.takeActions();
    if (actions.confirm) audio.ensure();
    if (actions.pause && (screen === 'play' || screen === 'paused')) {
      screen = screen === 'play' ? 'paused' : 'play';
    }

    if (screen === 'title' && actions.confirm) {
      screen = 'play';
      audio.ensure();
      if (!state.mission && !state.storyDone) startMission(state, state.missionIndex);
      saveTimer = AUTOSAVE_SECONDS;
    } else if ((screen === 'over' || screen === 'win') && actions.confirm) {
      screen = 'play';
    }

    if (screen === 'play') {
      while (acc >= STEP) {
        acc -= STEP;
        const simInput = frameInput();
        lastEvents = stepWorld(state, simInput, STEP);
        playSoundFor(lastEvents);
        if (lastEvents & EVENT_WASTED) {
          screen = 'over';
          state.overTitle = 'WASTED';
          state.overText = 'Solmar General patched you up. The city keeps moving.';
        } else if (lastEvents & EVENT_BUSTED) {
          screen = 'over';
          state.overTitle = 'BUSTED';
          state.overText = 'The cops let you walk. The city keeps moving.';
        }
        if (state.storyDone) screen = 'win';
      }
      saveTimer -= frame;
      if (saveTimer <= 0) {
        saveTimer = AUTOSAVE_SECONDS;
        saveGame(state);
      }
      audio.update(state, frame);
    } else {
      acc = 0;
    }
    paint();
  }
  requestAnimationFrame(loop);
}
