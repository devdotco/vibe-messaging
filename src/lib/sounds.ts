// All sounds generated via Web Audio API — no external files

let ctx: AudioContext | null = null;
function getCtx() {
  if (typeof window === 'undefined') return null;
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

export function playMessageSound() {
  const c = getCtx(); if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.connect(g); g.connect(c.destination);
  o.type = 'sine';
  o.frequency.setValueAtTime(880, c.currentTime);
  o.frequency.exponentialRampToValueAtTime(660, c.currentTime + 0.1);
  g.gain.setValueAtTime(0.15, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.3);
  o.start(c.currentTime);
  o.stop(c.currentTime + 0.3);
}

export function playMentionSound() {
  const c = getCtx(); if (!c) return;
  // Two-tone alert
  [0, 0.15].forEach((delay, i) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.connect(g); g.connect(c.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(i === 0 ? 880 : 1100, c.currentTime + delay);
    g.gain.setValueAtTime(0.2, c.currentTime + delay);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + 0.25);
    o.start(c.currentTime + delay);
    o.stop(c.currentTime + delay + 0.25);
  });
}
