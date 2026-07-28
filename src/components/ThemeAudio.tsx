"use client";

import { useEffect, useState } from "react";
import { fadeOutTheme, startTheme, unlockAudio } from "@/lib/audio";

/**
 * Theme music, faded in on the first user gesture and out on navigation away.
 *
 * Entirely optional: if `public/audio/theme.mp3` is absent the control hides
 * itself and nothing else changes. Browsers block autoplay until a gesture, so
 * we arm on the first pointer/key event rather than on mount.
 */
export default function ThemeAudio() {
  const [playing, setPlaying] = useState(false);
  const [available, setAvailable] = useState(false);

  // Probe for the file so we don't render a dead control.
  useEffect(() => {
    let live = true;
    fetch("/audio/theme.mp3", { method: "HEAD" })
      .then((r) => {
        // A stub file (the broken 9-byte download) is not music.
        const len = Number(r.headers.get("content-length") ?? 0);
        if (live) setAvailable(r.ok && len > 10_000);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!available) return;
    const arm = async () => {
      unlockAudio();
      const ok = await startTheme();
      setPlaying(ok);
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
    };
    window.addEventListener("pointerdown", arm, { once: true });
    window.addEventListener("keydown", arm, { once: true });
    return () => {
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
    };
  }, [available]);

  useEffect(() => () => fadeOutTheme(600), []);

  if (!available) return null;

  return (
    <button
      onClick={() => {
        if (playing) {
          fadeOutTheme();
          setPlaying(false);
        } else {
          void startTheme().then(setPlaying);
        }
      }}
      className="label fixed bottom-5 right-5 z-40 border border-bb-steel px-3 py-2 transition-colors hover:bg-white/10"
      aria-label={playing ? "Pause theme music" : "Play theme music"}
    >
      {playing ? "♪ Theme on" : "♪ Theme off"}
    </button>
  );
}
