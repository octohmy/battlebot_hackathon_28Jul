"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useMemo } from "react";
import type { Bot } from "@/lib/bbpl/client";
import { SIDE } from "@/lib/theme";
import { voicesFor } from "@/lib/voices";
import {
  level,
  levelProgress,
  MAX_FEELINGS,
  moraleState,
  useArena,
  type Pop,
  type Side,
} from "@/lib/store";

/**
 * One corner of the BattleBox: the machine in the ring, its morale, its XP,
 * and (in tag-team) the partner waiting to come in.
 *
 * The morale meter is the emotional-damage model made legible. It is
 * segmented rather than continuous on purpose — you can see "four bars gone"
 * across the room on a projector, where a smooth bar just looks slightly
 * shorter than it was.
 */

const MeshPortrait = dynamic(() => import("@/components/MeshPortrait"), {
  ssr: false,
  loading: () => null,
});

const SEGMENTS = 20;

/** Floating combat text. Expires itself so nothing has to sweep the list. */
function PopLayer({ side }: { side: Side }) {
  // Select the array itself and narrow it here. Filtering inside the selector
  // would hand zustand a fresh array on every snapshot read, which reads as a
  // perpetual state change and spins the render loop.
  const all = useArena((s) => s.pops);
  const dismissPop = useArena((s) => s.dismissPop);
  const pops = useMemo(() => all.filter((p) => p.side === side), [all, side]);

  useEffect(() => {
    if (!pops.length) return;
    const timers = pops.map((p) =>
      setTimeout(() => dismissPop(p.id), p.kind === "ko" ? 2200 : 1500),
    );
    return () => timers.forEach(clearTimeout);
  }, [pops, dismissPop]);

  const tone: Record<Pop["kind"], string> = {
    damage: "text-bb-red",
    xp: "text-bb-amber",
    heal: "text-emerald-400",
    ko: "text-bb-red",
    level: "text-bb-amber",
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 top-1/3 z-30 flex flex-col items-center gap-1">
      {pops.map((p) => (
        <span
          key={p.id}
          className={[
            "float-up display whitespace-nowrap drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]",
            p.kind === "ko" ? "text-4xl" : "text-2xl",
            tone[p.kind],
          ].join(" ")}
        >
          {p.text}
        </span>
      ))}
    </div>
  );
}

function Meter({
  value,
  max,
  color,
  segments = SEGMENTS,
}: {
  value: number;
  max: number;
  color: string;
  segments?: number;
}) {
  const filled = Math.round((value / max) * segments);
  return (
    <div className="flex h-2.5 gap-[2px]" aria-hidden>
      {Array.from({ length: segments }, (_, i) => (
        <span
          key={i}
          className="flex-1 transition-colors duration-500"
          style={{
            background: i < filled ? color : "#1a1e24",
            boxShadow: i < filled ? `0 0 6px ${color}66` : undefined,
          }}
        />
      ))}
    </div>
  );
}

export default function Fighter({
  side,
  bot,
  opponent,
  bench,
  feelings,
  benchFeelings,
  xp,
  damage,
  onTheClock,
  outcome,
  canTag,
  onTag,
}: {
  side: Side;
  bot: Bot;
  /** The other corner, needed only to work out who sounds like whom. */
  opponent: Bot;
  bench: Bot | null;
  feelings: number;
  benchFeelings: number;
  xp: number;
  damage: number;
  /** This side chooses the stat this round. */
  onTheClock: boolean;
  outcome: "win" | "lose" | "tie" | null;
  canTag: boolean;
  onTag: () => void;
}) {
  const accent = SIDE[side].color;
  const morale = moraleState(feelings);
  const lvl = level(xp);
  const stopped = feelings <= 0;
  /** Blows landed on this corner. Bumping it knocks the point cloud sideways. */
  const hits = useArena((s) => s.hits[side]);
  // Named on the card, because "these two sound different" is only obvious
  // once you can see that it was meant.
  const voice = useMemo(
    () =>
      side === "a"
        ? voicesFor(bot.slug, opponent.slug).a
        : voicesFor(opponent.slug, bot.slug).b,
    [side, bot.slug, opponent.slug],
  );

  return (
    <div
      className={[
        "relative flex h-full min-h-0 flex-col transition-all duration-300",
        onTheClock ? "scale-[1.015]" : "scale-100",
      ].join(" ")}
    >
      <PopLayer side={side} />

      {/* Spotlight behind the corner that is on the clock. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-6 -z-10 blur-3xl transition-opacity duration-500"
        style={{
          background: `radial-gradient(55% 45% at 50% 45%, ${accent}, transparent 70%)`,
          opacity: onTheClock ? 0.35 : 0.1,
        }}
      />

      <article
        className={[
          "scanlines relative flex min-h-0 flex-1 flex-col overflow-hidden border bg-bb-panel transition-shadow duration-300",
          stopped ? "saturate-0" : "",
        ].join(" ")}
        style={{
          borderColor: onTheClock ? accent : "#2a3038",
          clipPath:
            "polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 18px 100%, 0 calc(100% - 18px))",
          boxShadow: onTheClock
            ? `0 0 0 1px ${accent}, 0 12px 50px -18px ${accent}`
            : "0 12px 40px -22px #000",
        }}
      >
        {/* ── Nameplate ── */}
        <header
          className="flex items-center justify-between gap-2 border-b border-bb-steel px-3 py-1.5"
          style={{ background: `linear-gradient(90deg, ${accent}26, transparent)` }}
        >
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="label !text-[9px]" style={{ color: accent }}>
              {SIDE[side].corner}
            </span>
            <h2 className="display truncate text-2xl leading-none xl:text-3xl">
              {bot.name}
            </h2>
          </div>
          <span className="flex shrink-0 items-center gap-1.5">
            <span
              className="label !text-[8px] !tracking-normal"
              style={{ color: accent }}
              title={`This machine speaks in the "${voice.name}" voice — ${voice.character.toLowerCase()}. Each bot gets its own.`}
            >
              🔊 {voice.name}
            </span>
            <span
              className="stencil border px-1.5 text-sm leading-tight"
              style={{ borderColor: `${accent}66`, color: accent }}
              title={`${xp} XP earned this duel`}
            >
              LV {lvl}
            </span>
          </span>
        </header>

        {/* ── Portrait ── */}
        <div
          className="relative min-h-0 flex-1"
          style={{
            background: `radial-gradient(70% 90% at 50% 100%, ${accent}2e, #07080a 72%)`,
          }}
        >
          <div
            aria-hidden
            className="absolute inset-0 opacity-25"
            style={{
              backgroundImage:
                "linear-gradient(#ffffff18 1px, transparent 1px), linear-gradient(90deg, #ffffff18 1px, transparent 1px)",
              backgroundSize: "26px 26px",
              maskImage: "linear-gradient(to top, #000 0%, transparent 75%)",
              WebkitMaskImage: "linear-gradient(to top, #000 0%, transparent 75%)",
            }}
          />

          <MeshPortrait
            key={bot.slug}
            src={bot.image}
            accent={accent}
            damage={damage}
            hit={hits}
            // The blow arrives from the other corner: red is on the left, so
            // it gets knocked left, and blue gets knocked right.
            hitFrom={side === "a" ? -1 : 1}
            showHint
            className="absolute inset-0"
          />

          {/* Round outcome stamp */}
          {outcome && outcome !== "tie" && (
            <span
              className={[
                "stamp display pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 border-4 px-4 py-1 text-4xl",
                outcome === "win"
                  ? "border-emerald-400 text-emerald-400"
                  : "border-bb-red text-bb-red",
              ].join(" ")}
            >
              {outcome === "win" ? "TAKES IT" : "DROPS IT"}
            </span>
          )}

          {stopped && (
            <span className="hazard display absolute inset-x-0 bottom-0 z-20 py-1 text-center text-xl tracking-[0.3em] text-black">
              T.K.O.
            </span>
          )}
        </div>

        {/* ── Meters ── */}
        <div className="border-t border-bb-steel px-3 py-2">
          <div className="mb-1 flex items-baseline justify-between">
            <span
              className="label !text-[9px]"
              title="Morale falls when this bot loses a round, and again when the AI lands a roast on it. At zero the corner throws the towel in."
            >
              Morale
            </span>
            <span className="flex items-baseline gap-1.5">
              <span
                className="label !text-[9px] !tracking-normal"
                style={{ color: morale.color }}
              >
                {morale.label}
              </span>
              <span className="stencil text-base tabular-nums">
                {feelings}
                <span className="text-bb-steel">/{MAX_FEELINGS}</span>
              </span>
            </span>
          </div>
          <Meter value={feelings} max={MAX_FEELINGS} color={morale.color} />

          <div className="mt-1.5 mb-1 flex items-baseline justify-between">
            <span className="label !text-[9px]" title="Earned by winning stats and landing burns.">
              XP
            </span>
            <span className="stencil text-[11px] tabular-nums text-bb-chrome">
              {xp} · next LV {lvl * 100 - xp}
            </span>
          </div>
          <div className="h-1.5 w-full bg-[#1a1e24]">
            <div
              className="h-full bg-bb-amber transition-[width] duration-700 ease-out"
              style={{ width: `${levelProgress(xp) * 100}%` }}
            />
          </div>
        </div>

        {/* ── Live season line ── */}
        <div className="grid grid-cols-4 divide-x divide-bb-steel border-t border-bb-steel text-center">
          {[
            ["W", bot.season.wins],
            ["L", bot.season.losses],
            ["KO", bot.season.koWins],
            ["PTS", bot.season.totalPoints],
          ].map(([k, v]) => (
            <div key={k as string} className="py-1">
              <div className="label !text-[8px] !tracking-widest">{k}</div>
              <div className="stencil text-base leading-none">{v}</div>
            </div>
          ))}
        </div>
      </article>

      {/* ── Tag partner ── */}
      {bench && (
        <div
          className="mt-2 flex items-center gap-2 border border-bb-steel bg-bb-panel px-2 py-1.5"
          style={{ borderColor: `${accent}44` }}
        >
          <Image
            src={bench.image}
            alt=""
            width={40}
            height={28}
            className={[
              "h-7 w-10 object-contain",
              benchFeelings <= 0 ? "opacity-30 saturate-0" : "",
            ].join(" ")}
          />
          <div className="min-w-0 flex-1">
            <div className="display truncate text-sm leading-none">{bench.name}</div>
            <div className="mt-1 h-1 w-full bg-[#1a1e24]">
              <div
                className="h-full transition-[width] duration-500"
                style={{
                  width: `${benchFeelings}%`,
                  background: moraleState(benchFeelings).color,
                }}
              />
            </div>
          </div>
          <button
            onClick={onTag}
            disabled={!canTag || benchFeelings <= 0}
            className="label shrink-0 border px-2 py-1 !text-[9px] transition-colors disabled:cursor-not-allowed disabled:opacity-35"
            style={{ borderColor: `${accent}66`, color: accent }}
            title={
              benchFeelings <= 0
                ? "This bot has been stopped"
                : canTag
                  ? "Swap this bot into the ring"
                  : "You can only tag between rounds, on your own turn"
            }
          >
            Tag in
          </button>
        </div>
      )}
    </div>
  );
}
