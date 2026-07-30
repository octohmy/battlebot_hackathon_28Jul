"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useRef, useState } from "react";
import type { Bot } from "@/lib/bbpl/client";
import { TRUMP_STATS } from "@/lib/scoring";
import { WEAPON_COLORS } from "@/lib/weapons";

/**
 * The roster card.
 *
 * Read-only by design: picking a *stat* is a move you make in the arena's
 * command deck, not on a card. An earlier version put a button on every stat
 * row of both cards, which meant six real moves rendered as twelve buttons,
 * with nothing to tell you that "Win Rate" on the left and "Win Rate" on the
 * right were the same click.
 *
 * Pointer tilt is CSS 3D driven by a rAF-throttled mousemove — cheaper than a
 * spring library and keeps the whole grid at 60fps.
 */

/**
 * WebGL only on the cards you have actually picked. Twenty-four live canvases
 * would be far slower than twenty-four <img>s; two or four is free, and it
 * makes selecting a bot feel like waking it up.
 */
const MeshPortrait = dynamic(() => import("@/components/MeshPortrait"), {
  ssr: false,
  loading: () => null,
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

export default function BotCard({
  bot,
  selected,
  disabled,
  onClick,
}: {
  bot: Bot;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const raf = useRef<number | null>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const accent = WEAPON_COLORS[bot.weapon.class];

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
      aria-pressed={onClick ? Boolean(selected) : undefined}
      aria-label={onClick ? `Select ${bot.name}` : undefined}
      className={[
        "group relative w-full select-none",
        onClick && !disabled ? "cursor-pointer" : "",
        disabled ? "opacity-35 saturate-0" : "",
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
            "scanlines relative overflow-hidden border bg-bb-panel",
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
            className="relative h-40 w-full overflow-hidden"
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
            {selected ? (
              <MeshPortrait
                src={bot.image}
                accent={accent}
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
              className="display truncate text-2xl"
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
              return (
                <li
                  key={stat.key}
                  title={stat.hint}
                  className="flex items-center justify-between gap-2 px-3 py-1.5"
                >
                  <span className="label !text-[10px] !tracking-wider">
                    {stat.label}
                  </span>
                  <span
                    className={[
                      "stencil text-base tabular-nums",
                      v === null ? "text-bb-steel" : "",
                    ].join(" ")}
                  >
                    {v === null ? "NO DATA" : stat.format(v)}
                  </span>
                </li>
              );
            })}
          </ul>
        </article>
      </div>
    </div>
  );
}
