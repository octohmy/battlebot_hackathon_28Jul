"use client";

import manifest from "@/data/announcer.json";
import { audioContext, isMuted } from "@/lib/audio";

/**
 * Ring announcer playback.
 *
 * The bank holds three kinds of clip — bot names, factual nuggets, and reusable
 * connectives — all voiced by ElevenLabs "stadium voice". At runtime we
 * concatenate them through a Web Audio graph with short crossfades, so a few
 * hundred characters of TTS yields hundreds of distinct, bot-specific,
 * factually true call-outs, with zero network latency and full offline support.
 *
 * Every number spoken was checked against the real stats at build time by
 * `scripts/announcer.mjs`.
 */

interface Clip {
  text: string;
  file: string;
}

interface Manifest {
  voice: string;
  generatedAt: string;
  names: Record<string, Clip>;
  nuggets: Record<string, Clip>;
  connectives: Record<string, Clip>;
}

const BANK = manifest as Manifest;

const cache = new Map<string, AudioBuffer>();
/** Lets a new call cut off one already in progress. */
let generation = 0;
let activeSources: AudioBufferSourceNode[] = [];

const context = audioContext;

async function buffer(url: string): Promise<AudioBuffer | null> {
  const c = context();
  if (!c) return null;
  const hit = cache.get(url);
  if (hit) return hit;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await c.decodeAudioData(await res.arrayBuffer());
    cache.set(url, buf);
    return buf;
  } catch {
    return null;
  }
}

function pick<T>(arr: T[]): T | undefined {
  return arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined;
}

function nuggetsFor(slug: string): Clip[] {
  return Object.entries(BANK.nuggets)
    .filter(([k]) => k.startsWith(`${slug}_`))
    .map(([, v]) => v);
}

export function hasVoice(slug: string): boolean {
  return Boolean(BANK.names[slug]);
}

/** Stops anything currently being announced. */
export function stopAnnouncer(): void {
  generation++;
  for (const s of activeSources) {
    try {
      s.stop();
    } catch {
      /* already finished */
    }
  }
  activeSources = [];
}

/**
 * Plays a sequence of clips back to back.
 * Returns the spoken transcript so the UI can subtitle it.
 */
async function speak(clips: (Clip | undefined)[]): Promise<string> {
  const c = context();
  // A clip with no file is a text-only fallback (bot missing from the bank) —
  // keep its words for the subtitle but never try to fetch "".
  const list = (clips.filter(Boolean) as Clip[]).filter((l) => l.text);
  if (!c || !list.length || isMuted()) return list.map((l) => l.text).join(" ");

  stopAnnouncer();
  const gen = generation;

  if (c.state === "suspended") await c.resume().catch(() => {});

  const buffers = await Promise.all(
    list.map((l) => (l.file ? buffer(l.file) : Promise.resolve(null))),
  );
  if (gen !== generation) return "";

  // 60ms overlap keeps it sounding like one continuous call rather than
  // stitched fragments.
  const OVERLAP = 0.06;
  let at = c.currentTime + 0.05;

  for (const buf of buffers) {
    if (!buf) continue;
    const src = c.createBufferSource();
    src.buffer = buf;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.9, at + 0.03);
    gain.gain.setValueAtTime(0.9, at + Math.max(0.05, buf.duration - 0.05));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + buf.duration);
    src.connect(gain).connect(c.destination);
    src.start(at);
    activeSources.push(src);
    at += Math.max(0.1, buf.duration - OVERLAP);
  }

  return list.map((l) => l.text).join(" ");
}

const C = BANK.connectives;

/** Full pre-fight introduction for a matchup. */
export function announceMatchup(
  aSlug: string,
  aName: string,
  bSlug: string,
  bName: string,
): Promise<string> {
  return speak([
    pick([C.intro_1, C.intro_2, C.intro_3]),
    C.in_red,
    BANK.names[aSlug] ?? { text: aName, file: "" },
    pick(nuggetsFor(aSlug)),
    C.in_blue,
    BANK.names[bSlug] ?? { text: bName, file: "" },
    pick(nuggetsFor(bSlug)),
    C.fight,
  ]);
}

/** Called when a round resolves. */
export function announceRound(
  winnerSlug: string | null,
  opts: { decisive?: boolean } = {},
): Promise<string> {
  if (!winnerSlug) return speak([C.jd]);
  return speak([
    opts.decisive ? C.brutal : pick([C.crowd, C.close_1]),
    BANK.names[winnerSlug],
  ]);
}

/** Called at the end of a duel. */
export function announceWinner(winnerSlug: string): Promise<string> {
  return speak([C.ko, C.winner, BANK.names[winnerSlug], C.destruction]);
}
