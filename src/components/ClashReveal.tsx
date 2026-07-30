"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { Bot } from "@/lib/bbpl/client";
import { impact, whoosh } from "@/lib/synth";
import {
  DOMINANT,
  severityOf,
  TRUMP_BY_KEY,
  type TrumpStat,
} from "@/lib/scoring";
import { SIDE } from "@/lib/theme";
import { moraleHit, streak, useArena, xpGain, type Side } from "@/lib/store";

/**
 * The clash.
 *
 * The complaint this exists to answer is "sometimes it's not clear why one beat
 * the other". Before, a round resolved into a coloured number in a 40px-tall
 * strip at the bottom of the screen, and you were expected to infer the rule
 * from the fact that 17 had beaten 43.
 *
 * So the resolution gets the whole screen and states the case in order, one
 * beat at a time, the way a broadcast would:
 *
 *   1. **the contest** — which stat, and the rule it is judged by, in words
 *      ("lower is deadlier"), before either number is legible;
 *   2. **the numbers** — both counting up at once, so they arrive together and
 *      you watch the gap open rather than being handed a result;
 *   3. **the verdict** — "17s BEATS 43s · LOWER WINS", the margin, and how big
 *      the gap was as a word, because "26 seconds quicker" is a fact and
 *      "MAULING" is what it means;
 *   4. **the consequence** — the exact morale and XP the round moved, quoted
 *      from the same helpers that applied them.
 *
 * It is a beat, not a modal: it clears itself, and a click anywhere skips
 * straight to the end for anyone who has already read it.
 */

/** Beat marks. The whole thing is over in under three seconds. */
const T = {
  numbers: 420,
  count: 620,
  clash: 1180,
  verdict: 1520,
  out: 3100,
} as const;

/** How the gap reads once you know its size. */
function severityWord(severity: number): { word: string; color: string } {
  if (severity > DOMINANT) return { word: "Mauling", color: "#e10600" };
  if (severity > 0.15) return { word: "Clear", color: "#f5a623" };
  return { word: "Razor thin", color: "#9aa4b0" };
}

/** The margin in the unit a commentator would actually say it in. */
function marginLabel(stat: TrumpStat, margin: number): string {
  if (stat.unit === "s") return `${Math.round(margin)}s quicker`;
  if (stat.unit === "%") return `${margin.toFixed(1)} points clear`;
  return `${Math.round(margin)} points clear`;
}

/** Counts to a value once armed. Lands on the exact number, never near it. */
function useCountUp(target: number, armed: boolean, duration: number): number {
  const [value, setValue] = useState(0);
  const frame = useRef(0);

  useEffect(() => {
    if (!armed) return;
    // Reduced motion lands on the number on the first frame rather than
    // skipping the counter entirely — the value still has to appear.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    const tick = (now: number) => {
      const t = reduced ? 1 : Math.min(1, (now - start) / duration);
      // Ease out: the numbers sprint and then settle, rather than crawling in.
      setValue(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame.current = requestAnimationFrame(tick);
      else setValue(target);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, armed, duration]);

  return value;
}

export default function ClashReveal({ a, b }: { a: Bot; b: Bot }) {
  const activeStat = useArena((s) => s.activeStat);
  const lastResult = useArena((s) => s.lastResult);
  const playedRounds = useArena((s) => s.playedRounds);

  const [stage, setStage] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const marks = [T.numbers, T.clash, T.verdict, T.out];
    const timers = marks.map((ms, i) =>
      setTimeout(() => (i === marks.length - 1 ? setDismissed(true) : setStage(i + 1)), ms),
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  // The impact lands on the frame the two halves meet, not near it.
  useEffect(() => {
    if (stage === 1) whoosh(0.5, "up");
    if (stage === 2) impact(0.85);
  }, [stage]);

  const stat = activeStat ? TRUMP_BY_KEY[activeStat] : null;
  if (!stat || !lastResult || dismissed) return null;

  const { aValue, bValue, outcome, margin } = lastResult;
  const severity = severityOf(lastResult);
  const run = streak(playedRounds);
  const round = playedRounds.length;

  const showNumbers = stage >= 1;
  const settled = stage >= 2;
  const showVerdict = stage >= 3;

  const winner = outcome === "a" || outcome === "b" ? outcome : null;
  const loser: Side | null = winner ? (winner === "a" ? "b" : "a") : null;

  return (
    <div
      onClick={() => setDismissed(true)}
      className="fixed inset-0 z-[55] flex cursor-pointer flex-col items-center justify-center overflow-hidden"
      style={{ background: "rgba(7,8,10,0.9)", animation: "fade-in 160ms ease-out" }}
      role="status"
      aria-live="assertive"
    >
      {/* Light from whichever corner took it, once it is known. */}
      {settled && winner && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 transition-opacity duration-500"
          style={{
            background: `radial-gradient(60% 60% at ${winner === "a" ? "22%" : "78%"} 50%, ${SIDE[winner].color}33, transparent 70%)`,
          }}
        />
      )}

      {/* ── 1. The contest, and the rule it is judged by ── */}
      <div className="relative mb-4 text-center" style={{ animation: "rise 300ms ease-out both" }}>
        <div className="label !text-[10px]">Round {round} · the contest</div>
        <h2 className="display mt-1 text-5xl leading-none sm:text-7xl">{stat.label}</h2>
        <p className="display mt-2 text-xl text-bb-amber sm:text-2xl">
          {stat.higherWins ? "▲ Higher wins" : "▼ Lower wins"}
        </p>
        <p className="mt-1 text-xs text-bb-chrome">{stat.hint}</p>
      </div>

      {/* ── 2. The numbers, arriving together ── */}
      <div className="relative flex w-full max-w-5xl items-stretch justify-center gap-3 px-4 sm:gap-6">
        <ClashSide
          side="a"
          bot={a}
          value={aValue}
          stat={stat}
          armed={showNumbers}
          state={!settled ? "pending" : winner === "a" ? "won" : winner ? "lost" : "drew"}
        />

        {/* The collision point. */}
        <div className="flex w-16 shrink-0 flex-col items-center justify-center sm:w-24">
          <span
            key={settled ? "hit" : "vs"}
            className="display text-4xl sm:text-6xl"
            style={{
              color: settled ? "#f5a623" : "#5a5f66",
              animation: settled
                ? "clash-hit 380ms cubic-bezier(0.16,1,0.3,1) both"
                : "fade-in 200ms ease-out both",
              textShadow: settled ? "0 0 30px #f5a623" : undefined,
            }}
          >
            {settled ? (winner ? "▶◀" : "=") : "VS"}
          </span>
          {showVerdict && (
            <span
              className="label mt-1 !text-[9px] whitespace-nowrap"
              style={{ color: severityWord(severity).color, animation: "rise 260ms ease-out both" }}
            >
              {winner ? severityWord(severity).word : "Dead heat"}
            </span>
          )}
        </div>

        <ClashSide
          side="b"
          bot={b}
          value={bValue}
          stat={stat}
          armed={showNumbers}
          state={!settled ? "pending" : winner === "b" ? "won" : winner ? "lost" : "drew"}
        />
      </div>

      {/* ── 3. The verdict, spelled out ── */}
      <div className="relative mt-5 h-24 text-center">
        {showVerdict && (
          <div style={{ animation: "rise 320ms ease-out both" }}>
            <p className="display text-3xl leading-none sm:text-5xl">
              {winner === null ? (
                <span className="text-bb-chrome">Neither bot gives an inch</span>
              ) : (
                <>
                  <span style={{ color: SIDE[winner].color }}>
                    {stat.format(winner === "a" ? aValue! : bValue!)}
                  </span>{" "}
                  <span className="text-bb-bone">beats</span>{" "}
                  <span className="text-bb-steel">
                    {stat.format(winner === "a" ? bValue! : aValue!)}
                  </span>
                </>
              )}
            </p>
            <p className="mt-2 text-sm text-bb-chrome">
              {winner === null ? (
                <>Identical on {stat.label.toLowerCase()} — the round is shared.</>
              ) : (
                <>
                  <span className="display" style={{ color: SIDE[winner].color }}>
                    {(winner === "a" ? a : b).name}
                  </span>{" "}
                  is {marginLabel(stat, margin)} — and {stat.higherWins ? "higher" : "lower"}{" "}
                  wins this one.
                </>
              )}
            </p>

            {/* ── 4. What it cost ── */}
            {winner && loser && (
              <div className="mt-3 flex items-center justify-center gap-2">
                <span
                  className="stencil border px-2.5 py-1 text-sm"
                  style={{ borderColor: `${SIDE[loser].color}66`, color: SIDE[loser].color }}
                >
                  {(loser === "a" ? a : b).name} −{moraleHit(severity)} morale
                </span>
                <span className="stencil border border-bb-amber/50 px-2.5 py-1 text-sm text-bb-amber">
                  +{xpGain(severity)} XP
                </span>
                {run.count >= 2 && run.side === winner && (
                  <span
                    className="stencil border px-2.5 py-1 text-sm"
                    style={{
                      borderColor: SIDE[winner].color,
                      background: `${SIDE[winner].color}22`,
                      color: "#e8ecf1",
                    }}
                  >
                    🔥 {run.count} in a row
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <p className="label absolute bottom-5 !text-[9px] text-bb-steel">
        Click to skip
      </p>
    </div>
  );
}

/** One corner's claim: the machine, and the number it is making it with. */
function ClashSide({
  side,
  bot,
  value,
  stat,
  armed,
  state,
}: {
  side: Side;
  bot: Bot;
  value: number | null;
  stat: TrumpStat;
  armed: boolean;
  state: "pending" | "won" | "lost" | "drew";
}) {
  const accent = SIDE[side].color;
  const counted = useCountUp(value ?? 0, armed, T.count);
  // Whole-number stats count in whole numbers: a seconds reading spinning
  // through 17.4382s on its way to 17s looks like a bug, not a counter.
  const whole = Number.isInteger(value ?? 0);
  const shown =
    state === "pending" ? (whole ? Math.round(counted) : counted) : (value ?? 0);

  return (
    <div
      className="flex min-w-0 flex-1 flex-col items-center border-2 bg-bb-panel/80 px-3 py-4 transition-all duration-500"
      style={{
        borderColor: state === "won" ? accent : state === "lost" ? "#2a3038" : `${accent}66`,
        boxShadow: state === "won" ? `0 0 60px -12px ${accent}, inset 0 0 40px -20px ${accent}` : undefined,
        opacity: state === "lost" ? 0.4 : 1,
        filter: state === "lost" ? "saturate(0.2)" : undefined,
        transform: state === "won" ? "scale(1.04)" : state === "lost" ? "scale(0.96)" : "scale(1)",
        // The two halves are thrown at each other; they meet in the middle.
        animation: `clash-in-${side} 420ms cubic-bezier(0.16,1,0.3,1) both`,
      }}
    >
      <span className="label !text-[9px]" style={{ color: accent }}>
        {SIDE[side].corner}
      </span>

      <Image
        src={bot.image}
        alt=""
        width={160}
        height={110}
        className="my-2 h-[70px] w-auto object-contain sm:h-[100px]"
      />

      <span className="display max-w-full truncate text-xl leading-none sm:text-3xl">
        {bot.name}
      </span>

      <span
        className="stencil mt-2 text-5xl leading-none tabular-nums sm:text-7xl"
        style={{ color: state === "lost" ? "#9aa4b0" : accent }}
      >
        {value === null ? "—" : stat.format(shown)}
      </span>

      <span className="label mt-1 !text-[9px]">
        {state === "won" ? "Takes the round" : state === "lost" ? "Drops it" : stat.short}
      </span>
    </div>
  );
}
