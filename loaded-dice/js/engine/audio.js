// 간단한 WebAudio 신시사이저 효과음 (외부 에셋 불필요)
let ctx = null;
const ac = () => (ctx ??= new (window.AudioContext || window.webkitAudioContext)());

function env(gainNode, t0, a = 0.005, d = 0.15, peak = 0.3) {
  const g = gainNode.gain;
  g.setValueAtTime(0, t0);
  g.linearRampToValueAtTime(peak, t0 + a);
  g.exponentialRampToValueAtTime(0.0001, t0 + a + d);
}
function tone(freq, { type = 'square', dur = 0.12, peak = 0.18, when = 0, slide = 0 } = {}) {
  try {
    const a = ac(); const t0 = a.currentTime + when;
    const o = a.createOscillator(); const g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    env(g, t0, 0.005, dur, peak);
    o.connect(g).connect(a.destination);
    o.start(t0); o.stop(t0 + dur + 0.05);
  } catch (e) { /* 오디오 비활성 환경 무시 */ }
}
function noise({ dur = 0.2, peak = 0.2, when = 0, freq = 1800 } = {}) {
  try {
    const a = ac(); const t0 = a.currentTime + when;
    const len = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource(); src.buffer = buf;
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq;
    const g = a.createGain(); env(g, t0, 0.003, dur, peak);
    src.connect(f).connect(g).connect(a.destination);
    src.start(t0);
  } catch (e) { /* 무시 */ }
}

export const sfx = {
  click() { tone(660, { dur: 0.05, peak: 0.08 }); },
  roll() { for (let i = 0; i < 5; i++) noise({ dur: 0.08, peak: 0.12, when: i * 0.08, freq: 1200 + Math.random() * 1500 }); },
  settle() { noise({ dur: 0.07, peak: 0.15, freq: 900 }); },
  score() { tone(523, { dur: 0.1 }); tone(784, { dur: 0.12, when: 0.08 }); },
  zero() { tone(180, { type: 'sawtooth', dur: 0.2, peak: 0.1, slide: -80 }); },
  coin() { tone(988, { dur: 0.06, peak: 0.12 }); tone(1319, { dur: 0.15, when: 0.05, peak: 0.12 }); },
  buy() { tone(880, { dur: 0.07 }); tone(1175, { dur: 0.1, when: 0.06 }); },
  deny() { tone(150, { type: 'sawtooth', dur: 0.15, peak: 0.12 }); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, { dur: 0.18, when: i * 0.11, peak: 0.15 })); },
  lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, { type: 'sawtooth', dur: 0.22, when: i * 0.14, peak: 0.1 })); },
  unlock() { noise({ dur: 0.25, peak: 0.18, freq: 500 }); tone(1047, { dur: 0.25, when: 0.15, peak: 0.14 }); },
};
