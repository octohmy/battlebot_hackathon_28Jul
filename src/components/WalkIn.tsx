"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { Bot } from "@/lib/bbpl/client";
import { headToHead, SEASON_LABEL } from "@/lib/fights";
import { speakLine } from "@/lib/commentary";
import { bell, crowdPop, riser, whoosh } from "@/lib/synth";
import { isTrumpable, TRUMP_STATS } from "@/lib/scoring";
import { SIDE } from "@/lib/theme";
import { useArena, type Side } from "@/lib/store";

/**
 * The walk-in.
 *
 * A fight used to begin with a 1.4-second flash and then you were simply in
 * it, which wastes the one moment where the audience has no idea who either of
 * these machines is and is willing to be told. Boxing does not do that. It
 * walks them in, one at a time, reads the tape, and takes a view.
 *
 * Five beats, ~8 seconds, over the top of the ring announcer's own call — which
 * already names both machines with real numbers, so the sequence is built to
 * land its cards roughly where that voice arrives:
 *
 *   1. tonight's main event
 *   2. the red corner, walking in from the left
 *   3. the blue corner, from the right
 *   4. the tape — six stats head to head, plus any history between them
 *   5. the call — the bookmaker's line, spoken, then the bell
 *
 * Click anywhere to skip the lot. On a demo stage the second run of a fight
 * should not cost you eight seconds you have already spent.
 */

const BEATS = [0, 1150, 2900, 4650, 6600, 8300] as const;

export default function WalkIn({
  a,
  b,
  onDone,
}: {
  a: Bot;
  b: Bot;
  onDone: () => void;
}) {
  const call = useArena((s) => s.desk.call);
  const [beat, setBeat] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const timers = BEATS.map((ms, i) =>
      setTimeout(() => {
        if (i === BEATS.length - 1) {
          setDone(true);
          onDone();
        } else {
          setBeat(i);
        }
      }, ms),
    );
    return () => timers.forEach(clearTimeout);
  }, [onDone]);

  // Sound per beat. The announcer's own call is fired by the arena; these are
  // the room and the furniture around it.
  useEffect(() => {
    if (beat === 0) riser(1.1);
    if (beat === 1 || beat === 2) whoosh(0.45, beat === 1 ? "up" : "down");
    if (beat === 3) crowdPop(0.7);
    if (beat === 4) bell();
  }, [beat]);

  // The call is read aloud as the last beat — a pre-fight prediction, spoken
  // where a pre-fight prediction belongs.
  useEffect(() => {
    if (beat !== 4 || !call) return;
    void speakLine(call);
  }, [beat, call]);

  if (done) return null;

  const skip = () => {
    setDone(true);
    onDone();
  };

  const h2h = headToHead(a.name, b.name);

  return (
    <div
      onClick={skip}
      className="fixed inset-0 z-[58] flex cursor-pointer flex-col items-center justify-center overflow-hidden bg-bb-black"
      role="status"
      aria-label={`${a.name} versus ${b.name}, walking in`}
    >
      {/* Two corners' light, thrown from opposite ends of the room. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-700"
        style={{
          background: `radial-gradient(50% 60% at 0% 50%, ${SIDE.a.color}2e, transparent 70%), radial-gradient(50% 60% at 100% 50%, ${SIDE.b.color}2e, transparent 70%)`,
          opacity: beat >= 1 ? 1 : 0.25,
        }}
      />
      <div
        aria-hidden
        className="hazard pointer-events-none absolute inset-x-0 top-0 h-2 opacity-70"
      />
      <div
        aria-hidden
        className="hazard pointer-events-none absolute inset-x-0 bottom-0 h-2 opacity-70"
      />

      {/* ── 1. Main event ── */}
      <div
        className="relative mb-6 text-center"
        style={{ animation: "rise 500ms ease-out both" }}
      >
        <div className="label !text-[10px] !text-bb-amber">
          {SEASON_LABEL} · BattleBots Pro League
        </div>
        <h2 className="display mt-1 text-4xl leading-none sm:text-6xl">
          Tonight&apos;s main event
        </h2>
      </div>

      {/* ── 2 & 3. The two corners, walking in ── */}
      <div className="relative flex w-full max-w-6xl items-stretch justify-center gap-4 px-5">
        <Corner side="a" bot={a} shown={beat >= 1} />
        <div className="flex w-14 shrink-0 items-center justify-center sm:w-20">
          <span
            className="display text-3xl text-bb-steel sm:text-5xl"
            style={{ animation: "fade-in 400ms 300ms ease-out both" }}
          >
            VS
          </span>
        </div>
        <Corner side="b" bot={b} shown={beat >= 2} />
      </div>

      {/* ── 4. The tape ── */}
      <div className="relative mt-5 h-[7.5rem] w-full max-w-3xl px-5">
        {beat >= 3 && (
          <div style={{ animation: "rise 400ms ease-out both" }}>
            <div className="mb-1 flex items-center justify-center gap-2">
              <span className="h-px flex-1 bg-bb-steel" />
              <span className="label !text-[9px]">Tale of the tape</span>
              <span className="h-px flex-1 bg-bb-steel" />
            </div>

            <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 sm:grid-cols-6">
              {TRUMP_STATS.map((stat) => {
                const av = stat.get(a);
                const bv = stat.get(b);
                const usable = isTrumpable(stat, a, b);
                const leader =
                  !usable || av === null || bv === null || av === bv
                    ? null
                    : (stat.higherWins ? av > bv : av < bv)
                      ? "a"
                      : "b";
                return (
                  <div key={stat.key} className="text-center">
                    <div className="label !text-[7px] !tracking-wider">{stat.short}</div>
                    <div className="flex items-baseline justify-center gap-1">
                      <span
                        className="stencil text-sm tabular-nums"
                        style={{
                          color: leader === "a" ? SIDE.a.color : "#5a5f66",
                        }}
                      >
                        {av === null ? "—" : stat.format(av)}
                      </span>
                      <span className="text-[8px] text-bb-steel">/</span>
                      <span
                        className="stencil text-sm tabular-nums"
                        style={{
                          color: leader === "b" ? SIDE.b.color : "#5a5f66",
                        }}
                      >
                        {bv === null ? "—" : stat.format(bv)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="mt-2 text-center text-[11px] text-bb-chrome">
              {h2h.length ? (
                <>
                  They have met before:{" "}
                  <span className="text-bb-bone">
                    {h2h
                      .map(
                        (f) =>
                          `ep ${f.episode}, ${f.result === "WIN" ? a.name : b.name} by ${
                            f.method === "KO"
                              ? `KO${f.timeSecs ? ` in ${f.timeSecs}s` : ""}`
                              : "decision"
                          }`,
                      )
                      .join("; ")}
                  </span>
                  .
                </>
              ) : (
                <>These two have never met.</>
              )}
            </p>
          </div>
        )}
      </div>

      {/* ── 5. The call ── */}
      <div className="relative mt-3 h-16 w-full max-w-2xl px-5 text-center">
        {beat >= 4 && (
          <div style={{ animation: "rise 380ms ease-out both" }}>
            <span className="label !text-[9px] !text-bb-amber">The call</span>
            <p className="mt-1 text-sm leading-snug text-bb-bone">
              {call || "No line on this one — fight it out."}
            </p>
          </div>
        )}
      </div>

      <p className="label absolute bottom-5 !text-[9px] text-bb-steel">Click to skip</p>
    </div>
  );
}

/** One machine walking in, from its own side of the room. */
function Corner({ side, bot, shown }: { side: Side; bot: Bot; shown: boolean }) {
  const accent = SIDE[side].color;
  return (
    <div
      className="flex min-w-0 flex-1 flex-col items-center border-2 bg-bb-panel/70 px-3 py-3 transition-opacity duration-300"
      style={{
        borderColor: shown ? accent : "#2a3038",
        opacity: shown ? 1 : 0.12,
        boxShadow: shown ? `0 0 70px -18px ${accent}` : undefined,
        animation: shown ? `clash-in-${side} 520ms cubic-bezier(0.16,1,0.3,1) both` : undefined,
      }}
    >
      <span className="label !text-[9px]" style={{ color: accent }}>
        {SIDE[side].corner}
      </span>

      <Image
        src={bot.image}
        alt=""
        width={220}
        height={140}
        className="my-2 h-[80px] w-auto object-contain sm:h-[130px]"
        priority
      />

      <span className="display max-w-full truncate text-2xl leading-none sm:text-4xl">
        {bot.name}
      </span>
      <span className="label mt-1 max-w-full truncate !text-[8px]">
        {bot.teamName ?? "Team unknown"} · {bot.weapon.label}
      </span>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="stencil text-2xl tabular-nums" style={{ color: accent }}>
          {bot.season.wins}–{bot.season.losses}
        </span>
        <span className="label !text-[8px]">this season</span>
        <span className="stencil text-lg tabular-nums text-bb-chrome">
          {bot.season.koWins} KO
        </span>
      </div>
    </div>
  );
}
