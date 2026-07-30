"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { Bot } from "@/lib/bbpl/client";
import { WEAPON_COLORS } from "@/lib/weapons";

/**
 * The front-page centrepiece: the top-ranked machines, one at a time, rebuilt
 * as a rotating point cloud.
 *
 * The handover reuses the cloud's own assembly animation rather than a
 * crossfade — the outgoing bot scatters into a shell of points, the incoming
 * one condenses out of it. It is the same `uProgress` uniform the arena reveal
 * uses, so there is no second code path to keep working.
 */

const MeshPortrait = dynamic(() => import("@/components/MeshPortrait"), {
  ssr: false,
  loading: () => null,
});

/** How long each bot holds before it comes apart. */
const HOLD_MS = 7000;
/** How long the points stay scattered mid-handover. */
const SCATTER_MS = 850;

export default function HeroMesh({
  bots,
  power,
}: {
  bots: Bot[];
  /** slug → composite power score, shown alongside the name. */
  power: Record<string, number>;
}) {
  const [index, setIndex] = useState(0);
  const [resolved, setResolved] = useState(true);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || bots.length < 2) return;
    let swap: ReturnType<typeof setTimeout>;
    const cycle = setInterval(() => {
      setResolved(false);
      swap = setTimeout(() => {
        setIndex((i) => (i + 1) % bots.length);
        setResolved(true);
      }, SCATTER_MS);
    }, HOLD_MS);
    return () => {
      clearInterval(cycle);
      clearTimeout(swap);
    };
  }, [bots.length, paused]);

  const bot = bots[index];
  if (!bot) return null;
  const accent = WEAPON_COLORS[bot.weapon.class];

  return (
    <div
      className="relative aspect-square w-full max-w-[34rem]"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      {/* Floor glow under the machine */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 blur-3xl transition-colors duration-1000"
        style={{
          background: `radial-gradient(45% 40% at 50% 60%, ${accent}66, transparent 70%)`,
        }}
      />

      <MeshPortrait
        src={bot.image}
        accent={accent}
        resolved={resolved}
        height={2.6}
        distance={3.6}
        showHint
        className="absolute inset-0"
      />

      {/* Nameplate */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3">
        <div>
          <div className="label !text-[9px]">Now in the box</div>
          <div
            className="display text-4xl leading-none transition-colors duration-500 sm:text-5xl"
            style={{ textShadow: `0 0 30px ${accent}88` }}
          >
            {bot.name}
          </div>
          <div className="mt-1 text-[11px] text-bb-chrome">
            {bot.weapon.label}
            {bot.weapon.source === "editorial" && "*"} · Group {bot.group} · #
            {bot.rank}
          </div>
        </div>
        <div className="text-right">
          <div className="label !text-[9px]">Power</div>
          <div className="stencil text-4xl" style={{ color: accent }}>
            {power[bot.slug] ?? "—"}
          </div>
        </div>
      </div>

      {/* Which of the featured bots is up */}
      <div className="absolute right-0 top-0 flex flex-col gap-1">
        {bots.map((b, i) => (
          <button
            key={b.slug}
            onClick={() => {
              setResolved(false);
              setTimeout(() => {
                setIndex(i);
                setResolved(true);
              }, 260);
            }}
            aria-label={`Show ${b.name}`}
            className="h-1.5 w-6 transition-all"
            style={{
              background: i === index ? accent : "#2a3038",
              transform: i === index ? "scaleX(1.25)" : undefined,
              transformOrigin: "right",
            }}
          />
        ))}
      </div>
    </div>
  );
}
