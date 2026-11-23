// WebAudio synth: engine hum that follows speed, a two-tone siren while the
// heat is on, and one-shot blips for pickup / shot / punch / mission / busted.
// Everything is synthesised — no audio files. Starts on the first gesture;
// silent (and safe) when there is no AudioContext, e.g. headless.

export function createAudio() {
  const audio = {
    ctx: null,
    engine: null,
    engineGain: null,
    siren: null,
    sirenGain: null,
    sirenTimer: 0,
    sirenHigh: false,
    started: false,
  };
  audio.ensure = function () {
    if (audio.ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      audio.ctx = new AC();
      audio.engine = audio.ctx.createOscillator();
      audio.engine.type = 'sawtooth';
      audio.engine.frequency.value = 55;
      audio.engineGain = audio.ctx.createGain();
      audio.engineGain.gain.value = 0;
      audio.engine.connect(audio.engineGain);
      audio.engineGain.connect(audio.ctx.destination);
      audio.engine.start();
      audio.siren = audio.ctx.createOscillator();
      audio.siren.type = 'square';
      audio.siren.frequency.value = 720;
      audio.sirenGain = audio.ctx.createGain();
      audio.sirenGain.gain.value = 0;
      audio.siren.connect(audio.sirenGain);
      audio.sirenGain.connect(audio.ctx.destination);
      audio.siren.start();
      audio.started = true;
      return true;
    } catch {
      return false;
    }
  };
  audio.blip = function (freq, dur, type = 'sine', vol = 0.12, slideTo = null) {
    if (!audio.ctx) return;
    try {
      const t = audio.ctx.currentTime;
      const osc = audio.ctx.createOscillator();
      const gain = audio.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain);
      gain.connect(audio.ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch {
      // Audio is decoration; never break the game.
    }
  };
  audio.play = function (name) {
    if (!audio.ensure()) return;
    if (name === 'pickup') {
      audio.blip(880, 0.09);
      setTimeout(() => audio.blip(1318, 0.12), 70);
    } else if (name === 'shot') {
      audio.blip(220, 0.12, 'square', 0.16, 60);
    } else if (name === 'punch') {
      audio.blip(140, 0.1, 'triangle', 0.18, 70);
    } else if (name === 'mission') {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => audio.blip(f, 0.14), i * 90));
    } else if (name === 'busted') {
      audio.blip(392, 0.25, 'sawtooth', 0.14, 196);
      setTimeout(() => audio.blip(196, 0.4, 'sawtooth', 0.14, 98), 220);
    }
  };
  audio.update = function (state, dt) {
    if (!audio.ctx) return;
    const p = state.player;
    const speed = p.car ? Math.abs(p.car.speed) : 0;
    const target = p.car ? 0.02 + (speed / 560) * 0.05 : 0;
    audio.engineGain.gain.value += (target - audio.engineGain.gain.value) * Math.min(1, dt * 8);
    audio.engine.frequency.value = 50 + (speed / 560) * 110;
    if (state.wanted >= 2) {
      audio.sirenGain.gain.value = 0.03;
      audio.sirenTimer -= dt;
      if (audio.sirenTimer <= 0) {
        audio.sirenTimer = 0.42;
        audio.sirenHigh = !audio.sirenHigh;
        audio.siren.frequency.value = audio.sirenHigh ? 880 : 660;
      }
    } else {
      audio.sirenGain.gain.value = 0;
    }
  };
  return audio;
}
