"use client";

import { audioContext, isMuted } from "@/lib/audio";

/**
 * Broadcast sound design, synthesised on the fly.
 *
 * The interface one-shots in `audio.ts` are sampled files (Kenney, CC0). These
 * are not: whooshes, risers, impacts, bells, buzzers and fanfares are all built
 * from oscillators and filtered noise at runtime.
 *
 * That is a deliberate trade. A stinger has to land in exact sync with a wipe
 * whose duration is set in code, and it wants to vary slightly each time so a
 * demo does not sound like a loop. Synthesising means the timing is expressed
 * in the same numbers as the animation, nothing is fetched, nothing needs
 * licensing, and the whole broadcast layer costs zero bytes.
 *
 * Everything routes through the shared AudioContext, so one unlock gesture arms
 * these too and `setMuted` silences them along with everything else.
 */

/** One second of white noise, reused by every noise-based voice. */
let noise: AudioBuffer | null = null;

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noise) return noise;
  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noise = buf;
  return buf;
}

/** Guard shared by every voice: no context, or muted, means do nothing. */
function begin(): { ctx: AudioContext; t: number } | null {
  if (isMuted()) return null;
  const ctx = audioContext();
  if (!ctx) return null;
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  return { ctx, t: ctx.currentTime };
}

/**
 * The transition whoosh: noise swept through a bandpass.
 *
 * `up` sweeps the filter upward (leaving, building), `down` sweeps it back
 * (arriving, settling) — so a cover and its reveal are audibly a pair rather
 * than the same sound twice.
 */
export function whoosh(duration = 0.42, direction: "up" | "down" = "up"): void {
  const g = begin();
  if (!g) return;
  const { ctx, t } = g;

  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;

  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 1.1;
  const [from, to] = direction === "up" ? [320, 5200] : [4600, 260];
  band.frequency.setValueAtTime(from, t);
  band.frequency.exponentialRampToValueAtTime(to, t + duration);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.32, t + duration * 0.35);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

  src.connect(band).connect(gain).connect(ctx.destination);
  src.start(t);
  src.stop(t + duration + 0.05);
}

/** Low thump plus a noise crack — the moment the wipe slams shut. */
export function impact(level = 1): void {
  const g = begin();
  if (!g) return;
  const { ctx, t } = g;

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(78, t);
  osc.frequency.exponentialRampToValueAtTime(32, t + 0.28);
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.0001, t);
  oscGain.gain.exponentialRampToValueAtTime(0.6 * level, t + 0.012);
  oscGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
  osc.connect(oscGain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.36);

  const crack = ctx.createBufferSource();
  crack.buffer = noiseBuffer(ctx);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(3800, t);
  lp.frequency.exponentialRampToValueAtTime(500, t + 0.16);
  const crackGain = ctx.createGain();
  crackGain.gain.setValueAtTime(0.34 * level, t);
  crackGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  crack.connect(lp).connect(crackGain).connect(ctx.destination);
  crack.start(t);
  crack.stop(t + 0.2);
}

/** Rising tension bed, for the beat before a fight starts. */
export function riser(duration = 0.9): void {
  const g = begin();
  if (!g) return;
  const { ctx, t } = g;

  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;

  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.setValueAtTime(200, t);
  hp.frequency.exponentialRampToValueAtTime(4200, t + duration);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.22, t + duration * 0.85);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

  // A detuned pair sliding up underneath the noise gives it pitch as well as
  // brightness, which is what makes a riser feel like it is going somewhere.
  for (const detune of [0, 7]) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(440, t + duration);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.07, t + duration * 0.8);
    og.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(og).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  src.connect(hp).connect(gain).connect(ctx.destination);
  src.start(t);
  src.stop(t + duration + 0.05);
}

/** Ring bell — round start. Two partials, struck. */
export function bell(): void {
  const g = begin();
  if (!g) return;
  const { ctx, t } = g;

  for (const [freq, level, decay] of [
    [880, 0.24, 1.1],
    [1320, 0.12, 0.85],
    [2640, 0.05, 0.5],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(level, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + decay + 0.05);
  }
}

/** Match-over buzzer. Deliberately harsh. */
export function buzzer(duration = 0.85): void {
  const g = begin();
  if (!g) return;
  const { ctx, t } = g;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.26, t + 0.02);
  gain.gain.setValueAtTime(0.26, t + duration - 0.08);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  gain.connect(ctx.destination);

  // Two slightly detuned squares beat against each other — that roughness is
  // what makes an arena buzzer sound like an arena buzzer.
  for (const freq of [172, 179]) {
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = freq;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1600;
    osc.connect(lp).connect(gain);
    osc.start(t);
    osc.stop(t + duration);
  }
}

/** Victory fanfare — a three-note brass-ish stab. */
export function fanfare(): void {
  const g = begin();
  if (!g) return;
  const { ctx, t } = g;

  // Root, fifth, octave, arriving in quick succession then held together.
  const notes: [number, number][] = [
    [392, 0],
    [587.33, 0.13],
    [783.99, 0.26],
  ];

  for (const [freq, delay] of notes) {
    const start = t + delay;
    const dur = 0.95 - delay;
    for (const detune of [-6, 6]) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      osc.detune.value = detune;

      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(900, start);
      lp.frequency.exponentialRampToValueAtTime(4200, start + 0.09);
      lp.frequency.exponentialRampToValueAtTime(1400, start + dur);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.11, start + 0.03);
      gain.gain.setValueAtTime(0.11, start + dur * 0.55);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

      osc.connect(lp).connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.05);
    }
  }
  impact(0.55);
}

/** Short ascending arpeggio — a bot levelling up. */
export function levelUp(): void {
  const g = begin();
  if (!g) return;
  const { ctx, t } = g;

  [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
    const start = t + i * 0.07;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.16, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.24);
  });
}
