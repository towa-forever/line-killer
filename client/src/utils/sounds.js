const getCtx = () => {
  if (typeof window === 'undefined') return null;
  if (!window._audioCtx) window._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return window._audioCtx;
};

function beep(freq, duration, type = 'sine', vol = 0.3, delay = 0) {
  const ctx = getCtx(); if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = type; osc.frequency.value = freq;
    const t = ctx.currentTime + delay;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.start(t); osc.stop(t + duration);
  } catch(e) {}
}

export const sounds = {
  send: (theme = 'default') => {
    if (theme === 'mute') return;
    if (theme === 'pop') { beep(880, 0.08, 'sine', 0.2); beep(1100, 0.06, 'sine', 0.15, 0.06); }
    else if (theme === 'soft') { beep(440, 0.15, 'sine', 0.1); }
    else { beep(660, 0.07, 'triangle', 0.25); beep(880, 0.07, 'triangle', 0.2, 0.08); }
  },
  receive: (theme = 'default') => {
    if (theme === 'mute') return;
    if (theme === 'pop') { beep(700, 0.1, 'sine', 0.2); }
    else if (theme === 'soft') { beep(330, 0.2, 'sine', 0.08); beep(440, 0.15, 'sine', 0.06, 0.1); }
    else { beep(520, 0.08, 'triangle', 0.2); beep(660, 0.1, 'triangle', 0.18, 0.09); }
  },
  call: (theme = 'default') => {
    if (theme === 'mute') return;
    [0, 0.4, 0.8].forEach(d => beep(440, 0.3, 'square', 0.15, d));
  },
  friend: () => { beep(523, 0.1, 'sine', 0.2); beep(659, 0.1, 'sine', 0.2, 0.12); beep(784, 0.2, 'sine', 0.2, 0.24); },
};
