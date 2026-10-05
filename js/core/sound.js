// UI sounds synthesised with the Web Audio API — no audio files to download.
let ctx = null;
let masterGain = null;
let enabled = true;
try { enabled = localStorage.getItem('mf.sound') !== '0'; } catch {}

export const soundEnabled = () => enabled;
export function setSound(on) {
  enabled = !!on;
  try { localStorage.setItem('mf.sound', enabled ? '1' : '0'); } catch {}
  if (enabled) unlock();
}
export function unlock() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}
export const audioReady = () => !!ctx && ctx.state === 'running';

function master() {
  if (!masterGain) {
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    masterGain.connect(comp).connect(ctx.destination);
  }
  return masterGain;
}
function tone(f, { at = 0, dur = 0.12, type = 'sine', vol = 0.18, to = null, attack = 0.005 } = {}) {
  const c = unlock();
  if (!c) return;
  const t0 = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master());
  o.start(t0);
  o.stop(t0 + dur + 0.03);
}
function noise({ at = 0, dur = 0.05, vol = 0.08, freq = 2000, q = 1 } = {}) {
  const c = unlock();
  if (!c) return;
  const t0 = c.currentTime + at;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master());
  src.start(t0);
}

const SOUNDS = {
  tap: () => { noise({ dur: 0.025, vol: 0.1, freq: 3400, q: 2 }); tone(1500, { dur: 0.035, vol: 0.04, type: 'triangle' }); },
  pop: () => tone(420, { dur: 0.12, to: 980, vol: 0.18 }),
  add: () => { tone(520, { dur: 0.09, to: 900, vol: 0.17 }); tone(1180, { at: 0.07, dur: 0.14, vol: 0.11, type: 'triangle' }); },
  remove: () => tone(600, { dur: 0.13, to: 260, vol: 0.13, type: 'triangle' }),
  toggle: () => tone(880, { dur: 0.05, vol: 0.06, type: 'square' }),
  swoosh: () => noise({ dur: 0.22, vol: 0.05, freq: 900, q: 0.6 }),
  open: () => { noise({ dur: 0.16, vol: 0.04, freq: 1200, q: 0.7 }); tone(300, { dur: 0.16, to: 520, vol: 0.06 }); },
  success: () => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, { at: i * 0.09, dur: 0.3, vol: 0.13, type: 'triangle' }));
    tone(1568, { at: 0.36, dur: 0.6, vol: 0.06 });
  },
  error: () => { tone(220, { dur: 0.16, vol: 0.12, type: 'sawtooth' }); tone(175, { at: 0.12, dur: 0.22, vol: 0.1, type: 'sawtooth' }); },
  ready: () => [880, 1108.73, 1318.51].forEach((f, i) => tone(f, { at: i * 0.14, dur: 0.5, vol: 0.14 })),
  bell: () => { tone(1320, { dur: 1, vol: 0.16 }); tone(2640, { dur: 0.5, vol: 0.05 }); },
  // New order: loud, unmistakable double ding-dong (kitchen can hear it)
  alert: () => {
    [[1046.5, 0], [783.99, 0.18], [1046.5, 0.52], [783.99, 0.7]].forEach(([f, at]) => {
      tone(f, { at, dur: 0.34, vol: 0.24, type: 'triangle' });
      tone(f * 2, { at, dur: 0.2, vol: 0.05 });
    });
  },
  soft: () => { tone(660, { dur: 0.18, vol: 0.1 }); tone(990, { at: 0.12, dur: 0.26, vol: 0.08 }); },
  print: () => { for (let i = 0; i < 7; i++) noise({ at: i * 0.045, dur: 0.03, vol: 0.05, freq: 1800 + i * 140, q: 3 }); },
};

export function sfx(name) {
  if (!enabled) return;
  try { SOUNDS[name]?.(); } catch {}
}
export function haptic(pattern = 8) {
  try { if (enabled && navigator.vibrate) navigator.vibrate(pattern); } catch {}
}
