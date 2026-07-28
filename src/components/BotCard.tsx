"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { Bot } from "@/lib/bbpl/client";
import { TRUMP_STATS, type TrumpKey } from "@/lib/scoring";
import { WEAPON_COLORS } from "@/lib/weapons";

/**
 * The top-trumps card.
 *
 * Two sizes: `compact` for the roster grid, `full` for the arena. Pointer tilt
 * is done with CSS 3D transforms driven by a rAF-throttled mousemove — cheaper
 * than a spring library and keeps the whole grid at 60fps.
 */

/**
 * WebGL only on the two arena cards. Twenty-four canvases in the roster grid
 * would be far slower than twenty-four <img>s for no visual gain.
 */
const MeshPortrait = dynamic(() => import("@/components/MeshPortrait"), {
  ssr: false,
});

const FLAGS: Record<string, string> = {
  us: "🇺🇸",
  gb: "🇬🇧",
  nz: "🇳🇿",
  au: "🇦🇺",
  br: "🇧🇷",
  in: "🇮🇳",
  ca: "🇨🇦",
};

function flagFor(country: string | null) {
  if (!country) return null;
  // Cobalt is listed "us, gb" — show both.
  return country
    .split(",")
    .map((c) => FLAGS[c.trim()])
    .filter(Boolean)
    .join(" ");
}

interface Props {
  bot: Bot;
  size?: "compact" | "full";
  /** Side tint in the arena: red (left) or blue (right). */
  side?: "a" | "b";
  selected?: boolean;
  disabled?: boolean;
  /** Highlights one stat row during a duel. */
  activeStat?: TrumpKey | null;
  /** Marks the active stat row as won/lost. */
  statOutcome?: "win" | "lose" | "tie" | null;
  onClick?: () => void;
  onStatClick?: (key: TrumpKey) => void;
  /** Remaining emotional HP, 0-100. Omit to hide the meter. */
  feelings?: number;
  /** 0-1; jitters the point cloud as the duel wears on. */
  damage?: number;
}

export default function BotCard({
  bot,
  size = "compact",
  side,
  selected,
  disabled,
  activeStat,
  statOutcome,
  onClick,
  onStatClick,
  feelings,
  damage = 0,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const raf = useRef<number | null>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  // Hold the mesh scattered for a beat, then let it assemble — the reveal is
  // the moment, so it shouldn't already be resolved on first paint.
  //
  // Tracking *which* bot has resolved (rather than a boolean we reset) means no
  // synchronous setState in the effect: swapping bots makes the derived value
  // false immediately, with no extra render pass.
  const [resolvedFor, setResolvedFor] = useState<string | null>(null);
  useEffect(() => {
    if (size !== "full") return;
    const t = setTimeout(() => setResolvedFor(bot.slug), 260);
    return () => clearTimeout(t);
  }, [size, bot.slug]);
  const meshResolved = resolvedFor === bot.slug;

  const accent =
    side === "a" ? "#e10600" : side === "b" ? "#3aa0dc" : WEAPON_COLORS[bot.weapon.class];

  function onMove(e: React.PointerEvent) {
    if (raf.current) return;
    const el = ref.current;
    if (!el) return;
    const { clientX, clientY } = e;
    raf.current = requestAnimationFrame(() => {
      raf.current = null;
      const r = el.getBoundingClientRect();
      const px = (clientX - r.left) / r.width - 0.5;
      const py = (clientY - r.top) / r.height - 0.5;
      setTilt({ x: -py * 14, y: px * 16 });
    });
  }

  const full = size === "full";

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={() => setTilt({ x: 0, y: 0 })}
      onClick={disabled ? undefined : onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick && !disabled ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && !disabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={onClick ? `Select ${bot.name}` : undefined}
      className={[
        "group relative select-none",
        onClick && !disabled ? "cursor-pointer" : "",
        disabled ? "opacity-35 saturate-0" : "",
        full ? "w-full max-w-[27rem]" : "w-full",
      ].join(" ")}
      style={{ perspective: "1200px" }}
    >
      <div
        className="relative transition-transform duration-200 ease-out will-change-transform"
        style={{
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) translateZ(0)`,
          transformStyle: "preserve-3d",
        }}
      >
        {/* Glow shelf behind the card */}
        <div
          aria-hidden
          className="absolute -inset-2 blur-2xl transition-opacity duration-300"
          style={{
            background: `radial-gradient(60% 50% at 50% 40%, ${accent}55, transparent 70%)`,
            opacity: selected ? 0.95 : 0.35,
          }}
        />

        <article
          className={[
            "scanlines relative overflow-hidden",
            "border bg-bb-panel",
            selected ? "border-transparent" : "border-bb-steel",
          ].join(" ")}
          style={{
            clipPath:
              "polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 20px 100%, 0 calc(100% - 20px))",
            boxShadow: selected
              ? `0 0 0 2px ${accent}, 0 18px 60px -12px ${accent}88`
              : "0 12px 40px -18px #000",
          }}
        >
          {/* ── Header ── */}
          <header
            className="flex items-stretch justify-between border-b border-bb-steel"
            style={{ background: `linear-gradient(90deg, ${accent}22, transparent)` }}
          >
            <div className="flex items-center gap-2 px-3 py-2">
              <span
                className="stencil grid h-7 w-7 place-items-center text-sm text-black"
                style={{ background: accent }}
              >
                {bot.group}
              </span>
              <div className="leading-none">
                <div className="label !text-[9px]">Group rank</div>
                <div className="stencil text-lg">#{bot.rank}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 text-right">
              {bot.isAlternate && (
                <span className="hazard px-1.5 py-0.5 text-[9px] font-bold text-black">
                  ALT
                </span>
              )}
              <span className="text-lg leading-none">{flagFor(bot.country)}</span>
            </div>
          </header>

          {/* ── Portrait ── */}
          <div
            className={["relative w-full overflow-hidden", full ? "h-56" : "h-40"].join(" ")}
            style={{
              background: `radial-gradient(70% 90% at 50% 100%, ${accent}33, #07080a 72%)`,
            }}
          >
            {/* Arena floor grid */}
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
            {full ? (
              <MeshPortrait
                src={bot.image}
                resolved={meshResolved}
                damage={damage}
                className="absolute inset-0"
              />
            ) : (
              <Image
                src={bot.image}
                alt={bot.name}
                fill
                sizes="280px"
                className="object-contain object-bottom p-3 drop-shadow-[0_10px_24px_rgba(0,0,0,0.85)] transition-transform duration-500 group-hover:scale-[1.06]"
              />
            )}
            {/* Huge ghost numeral */}
            <span
              aria-hidden
              className="stencil pointer-events-none absolute -bottom-4 right-2 text-[6rem] leading-none text-white/5"
            >
              {String(bot.rank).padStart(2, "0")}
            </span>
          </div>

          {/* ── Nameplate ── */}
          <div className="relative border-y border-bb-steel bg-bb-black/60 px-3 py-2">
            <h3
              className={["display truncate", full ? "text-4xl" : "text-2xl"].join(" ")}
              style={{ textShadow: `0 0 22px ${accent}66` }}
            >
              {bot.name}
            </h3>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="truncate text-[11px] text-bb-chrome">
                {bot.teamName ?? "—"}
              </span>
              <span
                className="shrink-0 border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                style={{ borderColor: `${accent}66`, color: accent }}
                title={
                  bot.weapon.source === "editorial"
                    ? "Not listed on battlebots.com — best-guess classification"
                    : "Listed on battlebots.com"
                }
              >
                {bot.weapon.label}
                {bot.weapon.source === "editorial" && "*"}
              </span>
            </div>
          </div>

          {/* ── Season record ── */}
          <div className="grid grid-cols-4 divide-x divide-bb-steel border-b border-bb-steel text-center">
            {[
              ["W", bot.season.wins],
              ["L", bot.season.losses],
              ["KO", bot.season.koWins],
              ["PTS", bot.season.totalPoints],
            ].map(([k, v]) => (
              <div key={k as string} className="py-1.5">
                <div className="label !text-[9px] !tracking-widest">{k}</div>
                <div className="stencil text-lg">{v}</div>
              </div>
            ))}
          </div>

          {/* ── Trump stats ── */}
          <ul className="divide-y divide-bb-steel/60">
            {TRUMP_STATS.map((stat) => {
              const v = stat.get(bot);
              const isActive = activeStat === stat.key;
              const playable = !!onStatClick && v !== null;
              const tone =
                isActive && statOutcome === "win"
                  ? "bg-emerald-500/15 text-emerald-300"
                  : isActive && statOutcome === "lose"
                    ? "bg-red-500/15 text-red-300"
                    : isActive
                      ? "bg-white/10"
                      : "";
              return (
                <li key={stat.key}>
                  <button
                    type="button"
                    disabled={!playable}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (playable) onStatClick(stat.key);
                    }}
                    title={stat.hint}
                    className={[
                      "flex w-full items-center justify-between gap-2 px-3 text-left transition-colors",
                      full ? "py-2" : "py-1.5",
                      playable ? "hover:bg-white/10 cursor-pointer" : "cursor-default",
                      tone,
                    ].join(" ")}
                  >
                    <span className="label !text-[10px] !tracking-wider">
                      {stat.label}
                    </span>
                    <span
                      className={[
                        "stencil tabular-nums",
                        full ? "text-xl" : "text-base",
                        v === null ? "text-bb-steel" : "",
                      ].join(" ")}
                    >
                      {v === null ? "NO DATA" : stat.format(v)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* ── Feelings meter ── */}
          {feelings !== undefined && (
            <div className="border-t border-bb-steel px-3 py-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="label !text-[9px]">Feelings</span>
                <span className="stencil text-sm">{feelings}</span>
              </div>
              <div className="h-2 w-full bg-bb-black">
                <div
                  className="h-full transition-[width] duration-700 ease-out"
                  style={{
                    width: `${feelings}%`,
                    background:
                      feelings > 60 ? "#33d17a" : feelings > 25 ? "#f5a623" : "#e10600",
                  }}
                />
              </div>
            </div>
          )}
        </article>
      </div>
    </div>
  );
}
