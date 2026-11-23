// Keyboard + mouse input. Keys are held state; actions (enter, punch, reload,
// pause, confirm, shoot) are one-shot flags: main.js takes them once per frame
// and hands the same snapshot to the sim, so nothing is double-consumed.

export const ACTION_ENTER = 'enter';
export const ACTION_PUNCH = 'punch';
export const ACTION_RELOAD = 'reload';
export const ACTION_PAUSE = 'pause';
export const ACTION_CONFIRM = 'confirm';
export const ACTION_SHOOT = 'shoot';

const KEY_BINDINGS = {
  KeyE: ACTION_ENTER,
  KeyF: ACTION_PUNCH,
  KeyR: ACTION_RELOAD,
  Escape: ACTION_PAUSE,
  KeyP: ACTION_PAUSE,
  Space: ACTION_CONFIRM,
  Enter: ACTION_CONFIRM,
};

export function createInput(canvas) {
  const keys = new Set();
  const queue = [];
  const mouse = { x: 0, y: 0, down: false };

  const onKeyDown = (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    const action = KEY_BINDINGS[e.code];
    if (action) {
      queue.push(action);
      if (e.code === 'Space') e.preventDefault();
    }
  };
  const onKeyUp = (e) => keys.delete(e.code);
  const onMouseMove = (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  };
  const onMouseDown = (e) => {
    onMouseMove(e);
    mouse.down = true;
    queue.push(ACTION_SHOOT);
  };
  const onMouseUp = () => {
    mouse.down = false;
  };
  const onBlur = () => keys.clear();

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  return {
    keys,
    mouse,
    // Movement snapshot for this frame (WASD + arrows).
    move() {
      return {
        up: keys.has('KeyW') || keys.has('ArrowUp'),
        down: keys.has('KeyS') || keys.has('ArrowDown'),
        left: keys.has('KeyA') || keys.has('ArrowLeft'),
        right: keys.has('KeyD') || keys.has('ArrowRight'),
        run: keys.has('ShiftLeft') || keys.has('ShiftRight'),
      };
    },
    // Take every queued one-shot action exactly once; empties the queue.
    takeActions() {
      const out = {
        enter: false,
        punch: false,
        reload: false,
        pause: false,
        confirm: false,
        shoot: false,
      };
      while (queue.length > 0) {
        const a = queue.shift();
        if (a === ACTION_ENTER) out.enter = true;
        else if (a === ACTION_PUNCH) out.punch = true;
        else if (a === ACTION_RELOAD) out.reload = true;
        else if (a === ACTION_PAUSE) out.pause = true;
        else if (a === ACTION_CONFIRM) out.confirm = true;
        else if (a === ACTION_SHOOT) out.shoot = true;
      }
      return out;
    },
  };
}
