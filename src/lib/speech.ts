"use client";

import { isMuted } from "@/lib/audio";
import type { FighterVoice } from "@/lib/voices";

/**
 * The free voice.
 *
 * ElevenLabs is metered and a free tier is ten thousand characters, which one
 * evening of demoing eats. When it runs out the app used to fall silent and
 * put the trash talk on screen as small grey text, which is the least
 * interesting possible version of a robot insulting another robot.
 *
 * So there is a second engine underneath: the browser's own speech synthesis.
 * It is worse, and it is *free, offline, unmetered and always available* —
 * which beats correct-sounding silence every time. Crucially it still carries
 * the thing that was actually asked for: each bot gets its own distinct voice,
 * picked from whatever the machine has installed and then shaped by pitch and
 * rate so two bots never sound the same even on a system with one voice.
 *
 * Everything here is best-effort. No voices, no API, a browser that refuses —
 * all resolve quietly, and the subtitle is still on screen.
 */

function synth(): SpeechSynthesis | null {
  if (typeof window === "undefined") return null;
  return window.speechSynthesis ?? null;
}

export function browserSpeechAvailable(): boolean {
  return synth() !== null;
}

/**
 * Voice lists load asynchronously in Chrome — the first call after page load
 * routinely returns an empty array, and the `voiceschanged` event fills it in
 * a moment later. Cached once populated.
 */
let cached: SpeechSynthesisVoice[] = [];

function voices(): SpeechSynthesisVoice[] {
  const s = synth();
  if (!s) return [];
  if (cached.length) return cached;
  const all = s.getVoices();
  if (all.length) cached = all;
  return cached;
}

/** Warms the voice list, so the first line does not arrive voiceless. */
export function primeSpeech(): void {
  const s = synth();
  if (!s || cached.length) return;
  voices();
  s.addEventListener?.("voiceschanged", () => voices(), { once: true });
}

/**
 * The system voice for a profile.
 *
 * Named preferences first, because a hand-picked pairing sounds better than a
 * hashed one. Failing that, index into the English voices the machine does
 * have, keyed off the profile's position in the pool — which keeps two
 * different profiles on two different voices wherever more than one exists.
 */
function pickSystemVoice(profile: FighterVoice, ordinal: number): SpeechSynthesisVoice | null {
  const all = voices();
  if (!all.length) return null;

  for (const want of profile.prefer) {
    const hit = all.find((v) => v.name === want) ?? all.find((v) => v.name.includes(want));
    if (hit) return hit;
  }

  const english = all
    .filter((v) => v.lang?.toLowerCase().startsWith("en"))
    .sort((x, y) => x.name.localeCompare(y.name));
  const pool = english.length ? english : all;
  return pool[ordinal % pool.length] ?? null;
}

/** Cancels anything the browser voice is currently saying. */
export function cancelBrowserSpeech(): void {
  try {
    synth()?.cancel();
  } catch {
    /* some browsers throw if nothing is speaking */
  }
}

/**
 * Speaks a line, resolving when it has finished (or immediately if it cannot).
 *
 * `delayMs` exists so a line can be queued behind a pre-voiced stinger that is
 * playing through the Web Audio graph — the two engines share no clock, so the
 * caller has to tell this one when the room is quiet.
 */
export function speakBrowser(
  profile: FighterVoice,
  text: string,
  { ordinal = 0, delayMs = 0 }: { ordinal?: number; delayMs?: number } = {},
): Promise<boolean> {
  const s = synth();
  const clean = text.trim();
  if (!s || clean.length < 2 || isMuted()) return Promise.resolve(false);

  return new Promise((resolve) => {
    const start = () => {
      if (isMuted()) return resolve(false);
      try {
        const utter = new SpeechSynthesisUtterance(clean);
        const voice = pickSystemVoice(profile, ordinal);
        if (voice) {
          utter.voice = voice;
          utter.lang = voice.lang;
        }
        utter.pitch = profile.pitch;
        utter.rate = profile.rate;
        utter.volume = 1;

        let settled = false;
        const done = (ok: boolean) => {
          if (settled) return;
          settled = true;
          resolve(ok);
        };
        utter.onend = () => done(true);
        utter.onerror = () => done(false);
        // Chrome drops long utterances on the floor without firing either
        // handler; a ceiling keeps a queue behind this one from deadlocking.
        setTimeout(() => done(true), 1500 + clean.length * 90);

        s.speak(utter);
      } catch {
        resolve(false);
      }
    };

    if (delayMs > 0) setTimeout(start, delayMs);
    else start();
  });
}
