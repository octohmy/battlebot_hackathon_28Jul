"use client";

import { SIDE } from "@/lib/theme";
import { streak, type RoundLog, type Side } from "@/lib/store";

/**
 * Momentum: one bar that answers "who is actually winning this".
 *
 * The pip counters say who is *ahead*, which is not the same question. A bot
 * can be level at 2–2 and visibly going — three morale bars left, having been
 * hammered on both rounds it lost. This blends the cards with the morale so
 * that shows up as the bar sitting in one corner's half.
 *
 * A tug-of-war rather than two meters, because the thing worth seeing is the
 * *lead*, and a lead is one position, not two lengths.
 */
export default function Momentum({
  value,
  rounds,
}: {
  /** -1 (blue owns it) → +1 (red does). */
  value: number;
  rounds: RoundLog[];
}) {
  // 0% is blue's end, 100% is red's — so the marker travels toward whichever
  // corner the fight is going.
  const pos = 50 - value * 50;
  const run = streak(rounds);
  const leader: Side | null = Math.abs(value) < 0.05 ? null : value > 0 ? "a" : "b";

  return (
    <div className="border border-bb-steel bg-bb-black/40 px-2 py-1.5">
      <div className="mb-1 flex items-baseline justify-between">
        <span
          className="label !text-[9px]"
          title="Rounds won blended with how much morale each corner has left"
        >
          Momentum
        </span>
        {run.count >= 2 && run.side && (
          <span className="label !text-[9px]" style={{ color: SIDE[run.side].color }}>
            🔥 {run.count} straight
          </span>
        )}
      </div>

      <div
        className="relative h-3 overflow-hidden"
        style={{
          background: `linear-gradient(90deg, ${SIDE.b.color}55, #101317 45%, #101317 55%, ${SIDE.a.color}55)`,
        }}
        role="meter"
        aria-valuemin={-1}
        aria-valuemax={1}
        aria-valuenow={Number(value.toFixed(2))}
        aria-label="Momentum, red corner versus blue corner"
      >
        {/* Centre line: level. */}
        <span aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-bb-steel" />
        {/* The lead, filled from the centre toward whoever holds it. */}
        <span
          aria-hidden
          className="absolute inset-y-0 transition-[left,right] duration-700 ease-out"
          style={{
            left: value > 0 ? `${pos}%` : "50%",
            right: value > 0 ? "50%" : `${100 - pos}%`,
            background: leader ? SIDE[leader].color : "transparent",
            opacity: 0.75,
          }}
        />
        <span
          aria-hidden
          className="absolute inset-y-0 w-1 bg-bb-bone transition-[left] duration-700 ease-out"
          style={{ left: `calc(${pos}% - 2px)`, boxShadow: "0 0 8px #e8ecf1" }}
        />
      </div>

      <div className="mt-0.5 flex justify-between">
        <span className="label !text-[8px]" style={{ color: SIDE.b.color }}>
          Blue
        </span>
        <span className="label !text-[8px]" style={{ color: SIDE.a.color }}>
          Red
        </span>
      </div>
    </div>
  );
}
