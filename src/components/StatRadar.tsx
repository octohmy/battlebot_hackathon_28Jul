"use client";

import { useId, useState } from "react";
import type { RadarAxis } from "@/lib/scoring";
import { INK, SIDE } from "@/lib/theme";

/**
 * Six-axis comparison of the two bots in the ring.
 *
 * The axes are **field-normalised**, not raw: each one is scaled against the
 * minimum and maximum across all 24 competitors, and flipped where lower is
 * better (KO times), so "further out" always means "better" and the six axes
 * are commensurable. A radar built on raw values would be meaningless here —
 * one axis is a percentage, another is a count of points in the hundreds.
 *
 * Raw figures are still what the reader gets: they are on every hover, and the
 * axis labels name the real stat. Axes where either bot has no data at source
 * are drawn hollow rather than as a zero, because those are different claims.
 */

/** Geometry leaves room around the ring for the axis labels to sit outside. */
const R = 60;
const CX = 118;
const CY = 82;
const VIEW_W = 236;
const VIEW_H = 172;
const RINGS = [0.25, 0.5, 0.75, 1];

function pointAt(index: number, count: number, value: number) {
  const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
  return {
    x: CX + Math.cos(angle) * R * value,
    y: CY + Math.sin(angle) * R * value,
    angle,
  };
}

export default function StatRadar({
  axes,
  aName,
  bName,
}: {
  axes: RadarAxis[];
  aName: string;
  bName: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const clipId = useId();

  const polygon = (get: (ax: RadarAxis) => number) =>
    axes
      .map((ax, i) => {
        const p = pointAt(i, axes.length, ax.available ? Math.max(0.04, get(ax)) : 0.04);
        return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      })
      .join(" ");

  const shown = active !== null ? axes[active] : null;

  return (
    <figure className="m-0">
      <figcaption className="label !text-[9px] mb-1 text-center">
        Form vs the field
      </figcaption>

      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="w-full max-w-[13rem]"
        role="img"
        aria-label={`Radar comparing ${aName} and ${bName} across six stats, each scaled against the whole field`}
      >
        <defs>
          <clipPath id={clipId}>
            <circle cx={CX} cy={CY} r={R + 1} />
          </clipPath>
        </defs>

        {/* Recessive grid */}
        {RINGS.map((r) => (
          <circle
            key={r}
            cx={CX}
            cy={CY}
            r={R * r}
            fill="none"
            stroke={INK.grid}
            strokeWidth={r === 1 ? 1 : 0.5}
            opacity={r === 1 ? 0.9 : 0.55}
          />
        ))}
        {axes.map((ax, i) => {
          const p = pointAt(i, axes.length, 1);
          return (
            <line
              key={ax.key}
              x1={CX}
              y1={CY}
              x2={p.x}
              y2={p.y}
              stroke={INK.grid}
              strokeWidth={0.5}
              opacity={0.55}
            />
          );
        })}

        <g clipPath={`url(#${clipId})`}>
          <polygon
            points={polygon((ax) => ax.a)}
            fill={SIDE.a.color}
            fillOpacity={0.16}
            stroke={SIDE.a.color}
            strokeWidth={2}
            strokeLinejoin="round"
          />
          <polygon
            points={polygon((ax) => ax.b)}
            fill={SIDE.b.color}
            fillOpacity={0.16}
            stroke={SIDE.b.color}
            strokeWidth={2}
            strokeLinejoin="round"
          />
        </g>

        {/* Vertices. A 2px surface ring keeps them readable where they overlap. */}
        {axes.map((ax, i) =>
          (["a", "b"] as const).map((side) => {
            const v = side === "a" ? ax.a : ax.b;
            if (!ax.available) return null;
            const p = pointAt(i, axes.length, Math.max(0.04, v));
            return (
              <circle
                key={`${ax.key}-${side}`}
                cx={p.x}
                cy={p.y}
                r={active === i ? 4 : 3}
                fill={SIDE[side].color}
                stroke={INK.surface}
                strokeWidth={2}
              />
            );
          }),
        )}

        {/* Axis labels, in ink not series colour. */}
        {axes.map((ax, i) => {
          const p = pointAt(i, axes.length, 1.28);
          const anchor =
            Math.abs(p.x - CX) < 6 ? "middle" : p.x > CX ? "start" : "end";
          return (
            <text
              key={`l-${ax.key}`}
              x={p.x}
              y={p.y + 3}
              textAnchor={anchor}
              className="stencil"
              fontSize={9}
              letterSpacing={0.6}
              fill={active === i ? INK.primary : ax.available ? INK.secondary : INK.muted}
              style={{ textTransform: "uppercase" }}
            >
              {ax.available ? ax.short : `${ax.short} —`}
            </text>
          );
        })}

        {/* Generous invisible hit wedges — the marks are far too small to aim at. */}
        {axes.map((ax, i) => {
          const p = pointAt(i, axes.length, 1);
          return (
            <circle
              key={`hit-${ax.key}`}
              cx={CX + (p.x - CX) * 0.6}
              cy={CY + (p.y - CY) * 0.6}
              r={22}
              fill="transparent"
              className="cursor-help"
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive((cur) => (cur === i ? null : cur))}
            />
          );
        })}
      </svg>

      {/* Legend — identity is never colour alone, so each swatch is named. */}
      <div className="mt-1 flex items-center justify-center gap-3 text-[10px]">
        {(["a", "b"] as const).map((side) => (
          <span key={side} className="flex items-center gap-1.5 text-bb-chrome">
            <span
              className="inline-block h-2 w-2"
              style={{ background: SIDE[side].color }}
            />
            <span className="max-w-[5.5rem] truncate">
              {side === "a" ? aName : bName}
            </span>
          </span>
        ))}
      </div>

      {/* Readout for the hovered axis, showing the real numbers. */}
      <p className="mt-1 h-8 text-center text-[10px] leading-tight text-bb-chrome">
        {shown ? (
          shown.available ? (
            <>
              <span className="label !text-[9px]">{shown.label}</span>
              <br />
              <span style={{ color: SIDE.a.color }}>
                {shown.aRaw !== null ? shown.format(shown.aRaw) : "—"}
              </span>
              <span className="mx-1 text-bb-steel">vs</span>
              <span style={{ color: SIDE.b.color }}>
                {shown.bRaw !== null ? shown.format(shown.bRaw) : "—"}
              </span>
            </>
          ) : (
            <>
              <span className="label !text-[9px]">{shown.label}</span>
              <br />
              No career record at source
            </>
          )
        ) : (
          <span className="text-bb-steel">
            Scaled against all 24 competitors · hover an axis
          </span>
        )}
      </p>
    </figure>
  );
}
