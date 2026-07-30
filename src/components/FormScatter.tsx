"use client";

import { useState } from "react";
import type { Bot } from "@/lib/bbpl/client";
import { INK } from "@/lib/theme";

/**
 * Career win rate against career KO rate, sized by how many fights the record
 * rests on.
 *
 * Two measures on two axes — never two scales on one axis. The bubble area
 * carries sample size, which is the honest caveat this dataset needs: a 100%
 * win rate over three fights and one over forty are not the same claim, and on
 * a bar chart they would look identical.
 *
 * One hue throughout, because there is one series here. The only colour break
 * is emphasis on the current top three, which is a state, not a category.
 */

interface Point {
  bot: Bot;
  winRate: number;
  koPct: number;
  fights: number;
  top: boolean;
}

const W = 560;
const H = 320;
// Top padding clears the largest bubble radius plus its direct label.
const PAD = { top: 30, right: 16, bottom: 34, left: 42 };

export default function FormScatter({
  bots,
  highlight,
}: {
  bots: Bot[];
  /** Slugs to emphasise — the top of the power rankings. */
  highlight: string[];
}) {
  const [hover, setHover] = useState<Point | null>(null);

  const points: Point[] = bots
    .filter((b) => b.career && b.career.koPct !== null)
    .map((b) => ({
      bot: b,
      winRate: b.career!.winRate,
      koPct: b.career!.koPct!,
      fights: b.career!.total,
      top: highlight.includes(b.slug),
    }));

  const excluded = bots.length - points.length;
  const maxFights = Math.max(...points.map((p) => p.fights), 1);

  const x = (v: number) => PAD.left + (v / 100) * (W - PAD.left - PAD.right);
  const y = (v: number) => H - PAD.bottom - (v / 100) * (H - PAD.top - PAD.bottom);
  // Area, not radius, scales with the count — radius would quadruple the read.
  const r = (f: number) => 4 + Math.sqrt(f / maxFights) * 12;

  const ticks = [0, 25, 50, 75, 100];

  return (
    <figure className="m-0">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full min-w-[34rem]"
          role="img"
          aria-label="Scatter plot of career win rate against career knockout rate for every competitor with a career record"
        >
          {/* Recessive grid */}
          {ticks.map((t) => (
            <g key={`gx-${t}`}>
              <line
                x1={x(t)}
                y1={PAD.top}
                x2={x(t)}
                y2={H - PAD.bottom}
                stroke={INK.grid}
                strokeWidth={0.5}
                opacity={0.6}
              />
              <text
                x={x(t)}
                y={H - PAD.bottom + 14}
                textAnchor="middle"
                fontSize={9}
                fill={INK.secondary}
                className="stencil"
              >
                {t}%
              </text>
            </g>
          ))}
          {ticks.map((t) => (
            <g key={`gy-${t}`}>
              <line
                x1={PAD.left}
                y1={y(t)}
                x2={W - PAD.right}
                y2={y(t)}
                stroke={INK.grid}
                strokeWidth={0.5}
                opacity={0.6}
              />
              <text
                x={PAD.left - 6}
                y={y(t) + 3}
                textAnchor="end"
                fontSize={9}
                fill={INK.secondary}
                className="stencil"
              >
                {t}%
              </text>
            </g>
          ))}

          {/* Axis titles */}
          <text
            x={(W + PAD.left) / 2}
            y={H - 4}
            textAnchor="middle"
            fontSize={9}
            fill={INK.secondary}
            className="label"
            letterSpacing={1.4}
          >
            CAREER WIN RATE
          </text>
          <text
            x={-(H - PAD.bottom + PAD.top) / 2}
            y={11}
            transform="rotate(-90)"
            textAnchor="middle"
            fontSize={9}
            fill={INK.secondary}
            className="label"
            letterSpacing={1.4}
          >
            KO RATE
          </text>

          {points.map((p) => {
            const on = hover?.bot.slug === p.bot.slug;
            return (
              <g key={p.bot.slug}>
                <circle
                  cx={x(p.winRate)}
                  cy={y(p.koPct)}
                  r={r(p.fights)}
                  fill={p.top ? "#e10600" : "#2f8fc9"}
                  fillOpacity={on ? 0.65 : p.top ? 0.4 : 0.22}
                  stroke={p.top ? "#e10600" : "#2f8fc9"}
                  strokeWidth={2}
                  // A surface ring keeps overlapping bubbles legible.
                  paintOrder="stroke"
                />
                {/* Hit target, always at least a comfortable click. */}
                <circle
                  cx={x(p.winRate)}
                  cy={y(p.koPct)}
                  r={Math.max(14, r(p.fights))}
                  fill="transparent"
                  className="cursor-help"
                  onPointerEnter={() => setHover(p)}
                  onPointerLeave={() =>
                    setHover((cur) => (cur?.bot.slug === p.bot.slug ? null : cur))
                  }
                />
              </g>
            );
          })}

          {/* Direct labels for the emphasised few, plus whatever is hovered. */}
          {points
            .filter((p) => p.top || hover?.bot.slug === p.bot.slug)
            .map((p, i) => {
              // The emphasised bots cluster in the same corner, so alternate
              // labels above and below the mark rather than stacking them.
              const below = i % 2 === 1;
              const dy = below ? r(p.fights) + 12 : -r(p.fights) - 6;
              return (
                <text
                  key={`t-${p.bot.slug}`}
                  x={x(p.winRate)}
                  y={y(p.koPct) + dy}
                  textAnchor="middle"
                  fontSize={10}
                  fill={INK.primary}
                  className="display"
                  style={{ paintOrder: "stroke", stroke: INK.surface, strokeWidth: 3 }}
                >
                  {p.bot.name}
                </text>
              );
            })}
        </svg>
      </div>

      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-bb-chrome">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-bb-red" />
          Top three by power
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: "#2f8fc9" }}
          />
          Everyone else
        </span>
        <span className="text-bb-steel">Bubble area = career fights on record</span>
        {excluded > 0 && (
          <span className="text-bb-steel">
            {excluded} bot{excluded === 1 ? "" : "s"} omitted — no career record
            at source
          </span>
        )}
      </figcaption>

      {/* Readout rather than a floating tooltip: it never clips at the edge. */}
      <p className="mt-1 h-5 text-[12px]">
        {hover ? (
          <>
            <span className="display text-bb-bone">{hover.bot.name}</span>{" "}
            <span className="stencil text-bb-chrome tabular-nums">
              {hover.winRate}% win · {hover.koPct}% KO · {hover.fights} fights
            </span>
          </>
        ) : (
          <span className="text-bb-steel">Hover a machine for its figures.</span>
        )}
      </p>
    </figure>
  );
}
