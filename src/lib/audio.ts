"use client";

/**
 * Tiny Web Audio SFX layer.
 *
 * Deliberately not Howler: we only need fire-and-forget one-shots, and decoding
 * ten ~5KB buffers once beats pulling in a library. Everything degrades to
 * silence — a missing or un-decodable file must never break the demo.
 *
 * Sounds are Kenney "Interface Sounds" (CC0, public domain, no attribution
 * required). Theme music is optional and loaded separately.
 */

export type Sfx =
  | "hover"
  | "click"
  | "select"
  | "pill"
  | "draw"
  | "win"
  | "lose"
  | "crack"
  | "reveal"
  | "thud";

const FILES: Record<Sfx, string> = {
  hover: "/audio/sfx/hover.ogg",
  click: "/audio/sfx/click.ogg",
  select: "/audio/sfx/select.ogg",
  pill: "/audio/sfx/pill.ogg",
  draw: "/audio/sfx/draw.ogg",
  win: "/audio/sfx/win.ogg",
  lose: "/audio/sfx/lose.ogg",
  crack: "/audio/sfx/crack.ogg",
  reveal: "/audio/sfx/reveal.ogg",
  thud: "/audio/sfx/thud.ogg",
};

/** Per-sound gain, so nothing jumps out on a laptop speaker. */
const GAIN: Partial<Record<Sfx, number>> = {
  hover: 0.18,
  click: 0.35,
  select: 0.4,
  pill: 0.3,
  draw: 0.5,
  win: 0.55,
  lose: 0.5,
  crack: 0.6,
  reveal: 0.45,
  thud: 0.45,
};

let ctx: AudioContext | null = null;
const buffers = new Map<Sfx, AudioBuffer>();
let muted = false;
let unlocked = false;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

/**
 * The one AudioContext for the whole app. The announcer and the live
 * commentary share it so a single unlock gesture arms everything and mute
 * means the same thing everywhere.
 */
export function audioContext(): AudioContext | null {
  return context();
}

async function load(name: Sfx): Promise<AudioBuffer | null> {
  const c = context();
  if (!c) return null;
  const cached = buffers.get(name);
  if (cached) return cached;
  try {
    const res = await fetch(FILES[name]);
    if (!res.ok) return null;
    const buf = await c.decodeAudioData(await res.arrayBuffer());
    buffers.set(name, buf);
    return buf;
  } catch {
    return null;
  }
}

/**
 * Browsers block audio until a user gesture. Call this from the first click,
 * then warm the buffers so the first real sound isn't late.
 */
export function unlockAudio(): void {
  if (unlocked) return;
  unlocked = true;
  const c = context();
  if (c?.state === "suspended") void c.resume();
  void Promise.all((Object.keys(FILES) as Sfx[]).map(load));
}

export function setMuted(value: boolean): void {
  muted = value;
}

export function isMuted(): boolean {
  return muted;
}

/** Sounds fired repeatedly get a little random detune so they don't grate. */
const JITTER: Partial<Record<Sfx, number>> = {
  hover: 0.08,
  click: 0.06,
  select: 0.06,
  pill: 0.05,
};

/**
 * Fire a one-shot. `rate` detunes it; when omitted, sounds in JITTER get a
 * small random variation.
 *
 * The randomness lives here rather than at the call site because React's purity
 * lint (rightly) rejects Math.random() in component bodies.
 */
export function play(name: Sfx, rate?: number): void {
  if (muted) return;
  const c = context();
  if (!c) return;

  void (async () => {
    const buf = await load(name);
    if (!buf || muted) return;
    if (c.state === "suspended") await c.resume().catch(() => {});
    const src = c.createBufferSource();
    src.buffer = buf;
    const jitter = JITTER[name] ?? 0;
    src.playbackRate.value =
      rate ?? (jitter ? 1 - jitter / 2 + Math.random() * jitter : 1);
    const gain = c.createGain();
    gain.gain.value = GAIN[name] ?? 0.4;
    src.connect(gain).connect(c.destination);
    src.start();
  })();
}

// ── Theme music ───────────────────────────────────────────────────────────

let theme: HTMLAudioElement | null = null;

/**
 * Fades the theme in. Returns false if the file is missing or unplayable, so
 * the caller can hide any music UI rather than showing a dead control.
 */
export async function startTheme(src = "/audio/theme.mp3", target = 0.35) {
  if (typeof window === "undefined" || muted) return false;
  try {
    if (!theme) {
      theme = new Audio(src);
      theme.loop = true;
      theme.volume = 0;
    }
    await theme.play();
    const step = target / 40;
    const id = setInterval(() => {
      if (!theme || theme.volume >= target - step) return clearInterval(id);
      theme.volume = Math.min(target, theme.volume + step);
    }, 50);
    return true;
  } catch {
    return false;
  }
}

export function fadeOutTheme(ms = 1200): void {
  if (!theme) return;
  const el = theme;
  const step = el.volume / (ms / 50);
  const id = setInterval(() => {
    if (el.volume <= step) {
      el.pause();
      el.volume = 0;
      clearInterval(id);
      return;
    }
    el.volume -= step;
  }, 50);
}

export function themeAvailable(): boolean {
  return theme !== null && !theme.error;
}
