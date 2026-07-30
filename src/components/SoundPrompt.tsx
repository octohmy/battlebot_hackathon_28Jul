"use client";

import { play, setMuted, unlockAudio } from "@/lib/audio";
import { useArena } from "@/lib/store";

/**
 * The "turn your sound on" call to action.
 *
 * Half of what this app does is audible — the ElevenLabs ring announcer calls
 * the matchup by name, and the commentator reacts live to whatever the AI just
 * said. On mute you are looking at a card game with the best part missing, so
 * this asks up front rather than hiding a speaker icon in a corner.
 *
 * It doubles as the unlock gesture: browsers will not start audio without a
 * click, so the button that says "yes, sound" is also the click that arms the
 * whole audio graph.
 */
export default function SoundPrompt({ compact = false }: { compact?: boolean }) {
  const { soundPrompted, markSoundPrompted, muted, toggleMute } = useArena();

  if (soundPrompted) return null;

  const enable = () => {
    unlockAudio();
    setMuted(false);
    if (muted) toggleMute();
    markSoundPrompted();
    play("reveal");
  };

  const decline = () => {
    setMuted(true);
    if (!muted) toggleMute();
    markSoundPrompted();
  };

  return (
    <div
      className={[
        "plate brackets flex flex-wrap items-center gap-x-4 gap-y-2",
        compact ? "px-4 py-2" : "px-5 py-3",
      ].join(" ")}
      style={{ borderColor: "#f5a623" }}
    >
      <span className="label shrink-0 bg-bb-amber px-2 py-1 !text-[10px] !tracking-widest !text-black">
        SOUND
      </span>
      <p className={compact ? "text-[12px] leading-snug" : "text-sm leading-snug"}>
        <span className="display text-bb-bone">Best with the sound on.</span>{" "}
        <span className="text-bb-chrome">
          The ring announcer and the live commentary are voiced — on mute you
          only get the subtitles.
        </span>
      </p>
      <div className="ml-auto flex shrink-0 gap-2">
        <button
          onClick={enable}
          className="display bg-bb-amber px-4 py-1.5 text-lg text-black transition-transform hover:scale-105 active:scale-95"
        >
          🔊 Turn sound on
        </button>
        <button
          onClick={decline}
          className="label border border-bb-steel px-3 py-1.5 transition-colors hover:bg-white/10"
        >
          No thanks
        </button>
      </div>
    </div>
  );
}
