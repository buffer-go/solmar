// localStorage save: cash, score, mission progress, story flag and position,
// plus the best haul. A save is small, versioned, and never blocks the game
// when storage is unavailable.

const KEY = 'solmar-save-v1';

export function saveGame(state) {
  try {
    const p = state.player;
    const data = {
      v: 1,
      cash: state.cash,
      earned: state.earned,
      best: Math.max(state.best ?? 0, state.earned),
      missionIndex: state.missionIndex,
      storyDone: state.storyDone,
      x: Math.round(p.x),
      y: Math.round(p.y),
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    state.best = data.best;
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function applySave(state, data) {
  if (!data) return;
  state.cash = data.cash ?? state.cash;
  state.earned = data.earned ?? state.earned;
  state.best = data.best ?? 0;
  state.missionIndex = data.missionIndex ?? 0;
  state.storyDone = !!data.storyDone;
  if (typeof data.x === 'number' && typeof data.y === 'number') {
    state.player.x = data.x;
    state.player.y = data.y;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
