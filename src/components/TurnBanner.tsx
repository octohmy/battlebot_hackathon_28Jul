"use client";

import { useEffect, useState } from "react";
import { SIDE } from "@/lib/theme";
import type { Side } from "@/lib/store";

/**
 * The turn change, made impossible to miss.
 *
 * Initiative alternates every round and the whole game hangs on it, so it gets
 * a full takeover: a coloured wipe travelling toward whichever corner is on the
 * clock, chevrons running the same way, and the corner named in type you can
 * read from the back of the room.
 *
 * It is `pointer-events-none` throughout — it is a beat, not a modal, and it
 * must never eat a click from someone who already knows whose turn it is.
 */
export default function TurnBanner({
  side,
  round,
  botName,
  auto,
  onDone,
}: {
  side: Side;
  round: number;
  botName: string;
  /** True when the machine is taking this turn rather than the player. */
  auto: boolean;
  onDone: () => void;
}) {
  const [leaving, setLeaving] = useState(false);
  const accent = SIDE[side].color;
  /** Blue sits on the right, so its wipe travels the other way. */
  const toward = side === "a" ? -1 : 1;

  useEffect(() => {
    const out = setTimeout(() => setLeaving(true), 1150);
    const done = setTimeout(onDone, 1500);
    return () => {
      clearTimeout(out);
      clearTimeout(done);
    };
  }, [onDone]);

  return (
    <div
      aria-live="polite"
      className={[
        "pointer-events-none fixed inset-0 z-[60] flex items-center justify-center",
        leaving ? "animate-[banner-out_350ms_ease-in_forwards]" : "",
      ].join(" ")}
    >
      {/* Darken the scene just enough to lift the type off it. */}
      <div
        className="absolute inset-0 animate-[fade-in_200ms_ease-out]"
        style={{ background: "rgba(7,8,10,0.55)" }}
      />

      {/* The wipe */}
      <div
        className="absolute inset-x-0 h-32 overflow-hidden"
        style={{
          background: `linear-gradient(${toward > 0 ? "90deg" : "270deg"}, transparent, ${accent}dd 35%, ${accent}dd 65%, transparent)`,
          animation: "wipe-in 420ms cubic-bezier(0.16,1,0.3,1) both",
          ["--wipe-from" as string]: `${toward * -110}%`,
        }}
      >
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "repeating-linear-gradient(-45deg, #00000066 0 10px, transparent 10px 20px)",
          }}
        />
      </div>

      {/* Chevrons running toward the corner that is up */}
      <div
        className="absolute inset-x-0 flex justify-center gap-3"
        style={{ transform: "translateY(-4.5rem)" }}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="display text-3xl"
            style={{
              color: accent,
              opacity: 0,
              animation: `chev 900ms ease-out ${i * 70}ms infinite`,
              transform: toward > 0 ? undefined : "scaleX(-1)",
            }}
          >
            ▶
          </span>
        ))}
      </div>

      <div className="relative text-center">
        <div
          className="label !text-xs"
          style={{ animation: "rise 400ms 120ms ease-out both" }}
        >
          Round {round}
        </div>
        <div
          className="display text-6xl leading-none sm:text-8xl"
          style={{
            textShadow: `0 0 40px ${accent}, 0 4px 0 #07080a`,
            animation: "rise 400ms 180ms ease-out both",
          }}
        >
          {SIDE[side].corner}
        </div>
        <div
          className="display mt-1 text-2xl sm:text-3xl"
          style={{ color: accent, animation: "rise 400ms 260ms ease-out both" }}
        >
          {auto ? `${botName} is choosing…` : "Choose your stat"}
        </div>
      </div>
    </div>
  );
}
