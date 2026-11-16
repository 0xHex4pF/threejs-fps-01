// Every sound is synthesized with WebAudio: no audio files, no network. A single
// noise buffer is built once and reused; each effect is a short chain of oscillators
// and filtered noise with an envelope. The context is created on the first user
// gesture, as browsers require, and M toggles the master gain.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return false;
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    const length = Math.floor(ctx.sampleRate * 0.5);
    noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let seed = 1234567;
    for (let i = 0; i < length; i += 1) {
      seed = (seed * 16807) % 2147483647;
      data[i] = (seed / 2147483647) * 2 - 1;
    }
    return true;
  }

  function noise({ duration, filterFreq, filterType = 'lowpass', gain = 0.5, when = 0 }) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + when;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + duration);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(master);
    source.start(t);
    source.stop(t + duration + 0.02);
  }

  function tone({ freq, endFreq = null, duration, type = 'sine', gain = 0.3, when = 0 }) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + duration);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(amp);
    amp.connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  return {
    unlock() {
      ensure();
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    get muted() {
      return muted;
    },
    shoot(heavy = false) {
      noise({ duration: heavy ? 0.22 : 0.12, filterFreq: heavy ? 900 : 1800, gain: heavy ? 0.7 : 0.45 });
      tone({ freq: heavy ? 120 : 160, endFreq: 55, duration: 0.09, type: 'triangle', gain: 0.35 });
    },
    enemyShoot() {
      noise({ duration: 0.09, filterFreq: 1200, gain: 0.22 });
    },
    dryFire() {
      tone({ freq: 2200, duration: 0.03, type: 'square', gain: 0.08 });
    },
    reload() {
      tone({ freq: 900, duration: 0.04, type: 'square', gain: 0.12 });
      tone({ freq: 650, duration: 0.05, type: 'square', gain: 0.12, when: 0.28 });
      tone({ freq: 1200, duration: 0.05, type: 'square', gain: 0.14, when: 0.55 });
    },
    hit() {
      tone({ freq: 2800, duration: 0.05, type: 'sine', gain: 0.22 });
    },
    kill() {
      tone({ freq: 660, duration: 0.09, type: 'sine', gain: 0.25 });
      tone({ freq: 990, duration: 0.14, type: 'sine', gain: 0.25, when: 0.08 });
    },
    hurt() {
      tone({ freq: 140, endFreq: 70, duration: 0.15, type: 'sawtooth', gain: 0.2 });
    },
    explosion() {
      noise({ duration: 0.9, filterFreq: 320, gain: 0.9 });
      tone({ freq: 90, endFreq: 28, duration: 0.7, type: 'sine', gain: 0.7 });
    },
    grenadeThrow() {
      noise({ duration: 0.08, filterFreq: 2500, filterType: 'bandpass', gain: 0.15 });
    },
    roundWin() {
      tone({ freq: 523, duration: 0.12, type: 'triangle', gain: 0.3 });
      tone({ freq: 659, duration: 0.12, type: 'triangle', gain: 0.3, when: 0.12 });
      tone({ freq: 784, duration: 0.22, type: 'triangle', gain: 0.3, when: 0.24 });
    },
    roundLose() {
      tone({ freq: 392, duration: 0.14, type: 'triangle', gain: 0.3 });
      tone({ freq: 330, duration: 0.14, type: 'triangle', gain: 0.3, when: 0.14 });
      tone({ freq: 262, duration: 0.26, type: 'triangle', gain: 0.3, when: 0.28 });
    },
    buy() {
      tone({ freq: 1320, duration: 0.07, type: 'sine', gain: 0.2 });
      tone({ freq: 1760, duration: 0.1, type: 'sine', gain: 0.2, when: 0.06 });
    },
    denied() {
      tone({ freq: 220, duration: 0.12, type: 'square', gain: 0.12 });
    },
    uplink() {
      tone({ freq: 1046, duration: 0.08, type: 'sine', gain: 0.16 });
    },
  };
}
