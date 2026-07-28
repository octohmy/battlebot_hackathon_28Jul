"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import AiPanel from "@/components/AiPanel";
import BotCard from "@/components/BotCard";
import TaleOfTape, { type TapeData } from "@/components/TaleOfTape";
import type { Bot } from "@/lib/bbpl/client";
import type { DataSource } from "@/lib/bbpl/client";
import DamageOverlay from "@/components/DamageOverlay";
import {
  announceMatchup,
  announceRound,
  announceWinner,
  stopAnnouncer,
} from "@/lib/announcer";
import { play, setMuted, unlockAudio } from "@/lib/audio";
import { commonOpponents, fightsFor, headToHead, SEASON_LABEL } from "@/lib/fights";
import { isTrumpable, TRUMP_BY_KEY, TRUMP_STATS } from "@/lib/scoring";
import { duelLeader, MAX_FEELINGS, useArena } from "@/lib/store";

export default function Arena({
  bots,
  source,
}: {
  bots: Bot[];
  source: DataSource;
}) {
  const {
    phase,
    botA,
    botB,
    setBots,
    reveal,
    playStat,
    nextRound,
    reset,
    activeStat,
    lastResult,
    playedRounds,
    feelings,
    damage,
  } = useArena();

  const [picks, setPicks] = useState<Bot[]>([]);
  /** What the ring announcer is currently saying, shown as a subtitle. */
  const [subtitle, setSubtitle] = useState("");

  const drawRandom = useCallback(() => {
    unlockAudio();
    stopAnnouncer();
    setSubtitle("");
    play("draw");
    const pool = [...bots];
    const a = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    const b = pool[Math.floor(Math.random() * pool.length)];
    setPicks([]);
    setBots(a, b);
  }, [bots, setBots]);

  function togglePick(bot: Bot) {
    unlockAudio();
    play("select");
    setPicks((prev) => {
      if (prev.some((p) => p.slug === bot.slug))
        return prev.filter((p) => p.slug !== bot.slug);
      const next = [...prev, bot].slice(-2);
      if (next.length === 2) setBots(next[0], next[1]);
      return next;
    });
  }

  // The reveal beat: cards land, the announcer calls the matchup, stats unlock.
  useEffect(() => {
    if (phase !== "reveal" || !botA || !botB) return;
    play("reveal");
    void announceMatchup(botA.slug, botA.name, botB.slug, botB.name).then(setSubtitle);
    const t = setTimeout(reveal, 900);
    return () => clearTimeout(t);
  }, [phase, reveal, botA, botB]);

  // Round outcome stings.
  useEffect(() => {
    if (phase !== "resolve" || !lastResult || !botA || !botB) return;
    if (lastResult.outcome === "tie") {
      play("thud");
      void announceRound(null).then(setSubtitle);
    } else {
      play("crack");
      setTimeout(() => play("win"), 220);
      const winner = lastResult.outcome === "a" ? botA : botB;
      const hi = Math.max(lastResult.aValue ?? 0, lastResult.bValue ?? 0) || 1;
      void announceRound(winner.slug, {
        decisive: lastResult.margin / hi > 0.4,
      }).then(setSubtitle);
    }
  }, [phase, lastResult, botA, botB]);

  // Final call.
  useEffect(() => {
    if (phase !== "aftermath" || !botA || !botB) return;
    const leader = duelLeader(playedRounds);
    if (leader === "tie") return;
    void announceWinner(leader === "a" ? botA.slug : botB.slug).then(setSubtitle);
  }, [phase, botA, botB, playedRounds]);

  // Clear the subtitle a beat after it finishes.
  useEffect(() => {
    if (!subtitle) return;
    const t = setTimeout(() => setSubtitle(""), 7000);
    return () => clearTimeout(t);
  }, [subtitle]);

  // Damage level drives the CSS overlays.
  useEffect(() => {
    document.documentElement.style.setProperty("--damage", String(damage));
  }, [damage]);

  const outcomeFor = (side: "a" | "b") => {
    if (!lastResult || phase === "choose-stat") return null;
    if (lastResult.outcome === "tie") return "tie" as const;
    return lastResult.outcome === side ? ("win" as const) : ("lose" as const);
  };

  const tape = useMemo<TapeData>(
    () => ({
      headToHead: botA && botB ? headToHead(botA.name, botB.name) : [],
      common: botA && botB ? commonOpponents(botA.name, botB.name) : [],
      aHistory: botA ? fightsFor(botA.name) : [],
      bHistory: botB ? fightsFor(botB.name) : [],
      seasonLabel: SEASON_LABEL,
    }),
    [botA, botB],
  );

  const scoreboard = useMemo(() => {
    const a = playedRounds.filter((r) => r.winner === "a").length;
    const b = playedRounds.filter((r) => r.winner === "b").length;
    return { a, b };
  }, [playedRounds]);

  // ── Selection ───────────────────────────────────────────────────────────
  if (phase === "select" || !botA || !botB) {
    return (
      <main className="mx-auto max-w-[1600px] px-5 py-8">
        <TopBar source={source} />

        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="display text-6xl sm:text-7xl">
              Pick your <span className="text-bb-red">fighters</span>
            </h1>
            <p className="mt-2 max-w-xl text-sm text-bb-chrome">
              Choose two bots, or let the arena draw. Every stat on every card is
              live BattleBots Pro League data.
            </p>
          </div>
          <button
            onClick={drawRandom}
            className="brackets display bg-bb-red px-7 py-4 text-2xl text-white transition-transform hover:scale-[1.03] active:scale-95"
          >
            Draw random ⚡
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {bots.map((bot) => (
            <BotCard
              key={bot.slug}
              bot={bot}
              selected={picks.some((p) => p.slug === bot.slug)}
              onClick={() => togglePick(bot)}
            />
          ))}
        </div>
      </main>
    );
  }

  // ── Duel ────────────────────────────────────────────────────────────────
  const leader = duelLeader(playedRounds);

  return (
    <main className="relative mx-auto max-w-[1600px] px-5 py-6">
      <DamageOverlay />
      <TopBar source={source} />

      {/* Scoreboard */}
      <div className="mb-5 flex items-center justify-center gap-6">
        <span className="stencil text-5xl text-bb-red">{scoreboard.a}</span>
        <div className="text-center">
          <div className="label">Round {playedRounds.length + (phase === "aftermath" ? 0 : 1)}</div>
          <div className="display text-2xl">
            {phase === "aftermath" ? "Final" : "Best of 6"}
          </div>
        </div>
        <span className="stencil text-5xl text-bb-blue">{scoreboard.b}</span>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_auto_1fr]">
        <div className="justify-self-center">
          <BotCard
            bot={botA}
            size="full"
            side="a"
            activeStat={activeStat}
            statOutcome={outcomeFor("a")}
            feelings={feelings[botA.slug] ?? MAX_FEELINGS}
            damage={damage}
            onStatClick={phase === "choose-stat" ? playStat : undefined}
          />
        </div>

        {/* Centre column */}
        <div className="flex flex-col items-center gap-4 self-start pt-10">
          <div className="display text-6xl text-bb-chrome">VS</div>

          {phase === "choose-stat" && (
            <p className="max-w-[12rem] text-center text-xs text-bb-chrome">
              Tap a stat on either card to play it.
            </p>
          )}

          <TaleOfTape a={botA} b={botB} data={tape} />

          {phase === "resolve" && lastResult && activeStat && (
            <div className="plate brackets px-5 py-4 text-center">
              <div className="label">{TRUMP_BY_KEY[activeStat].label}</div>
              <div className="display mt-1 text-3xl">
                {lastResult.outcome === "tie" ? (
                  "Dead heat"
                ) : (
                  <span
                    className={
                      lastResult.outcome === "a" ? "text-bb-red" : "text-bb-blue"
                    }
                  >
                    {lastResult.outcome === "a" ? botA.name : botB.name}
                  </span>
                )}
              </div>
              <button
                onClick={nextRound}
                className="display mt-3 w-full bg-bb-bone px-5 py-2 text-lg text-black transition-transform hover:scale-105 active:scale-95"
              >
                Continue
              </button>
            </div>
          )}

          {phase === "aftermath" && (
            <div className="plate brackets px-6 py-5 text-center">
              <div className="label">Result</div>
              <div className="display mt-1 text-4xl">
                {leader === "tie" ? (
                  "Draw"
                ) : (
                  <span className={leader === "a" ? "text-bb-red" : "text-bb-blue"}>
                    {leader === "a" ? botA.name : botB.name}
                  </span>
                )}
              </div>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  onClick={drawRandom}
                  className="display bg-bb-red px-5 py-2 text-lg text-white transition-transform hover:scale-105 active:scale-95"
                >
                  Draw again
                </button>
                <button
                  onClick={reset}
                  className="display border border-bb-steel px-5 py-2 text-lg transition-colors hover:bg-white/10"
                >
                  Back to roster
                </button>
              </div>
            </div>
          )}

          {/* Round history */}
          {playedRounds.length > 0 && (
            <ul className="w-40 space-y-1">
              {playedRounds.map((r, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between border-l-2 pl-2 text-[10px] uppercase tracking-wider text-bb-chrome"
                  style={{
                    borderColor:
                      r.winner === "a" ? "#e10600" : r.winner === "b" ? "#3aa0dc" : "#2a3038",
                  }}
                >
                  <span>{TRUMP_BY_KEY[r.stat].label}</span>
                  <span className="stencil">
                    {r.winner === "a" ? "◀" : r.winner === "b" ? "▶" : "="}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="justify-self-center">
          <BotCard
            bot={botB}
            size="full"
            side="b"
            activeStat={activeStat}
            statOutcome={outcomeFor("b")}
            feelings={feelings[botB.slug] ?? MAX_FEELINGS}
            damage={damage}
            onStatClick={phase === "choose-stat" ? playStat : undefined}
          />
        </div>
      </div>

      <AiPanel a={botA} b={botB} stat={activeStat} />

      {/* Stats unavailable for this pairing */}
      <UnavailableNote a={botA} b={botB} />

      {/* Ring announcer subtitle */}
      {subtitle && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center p-5">
          <p className="plate brackets max-w-3xl px-6 py-3 text-center">
            <span className="label !text-[9px] !text-bb-red">Ring announcer</span>
            <span className="display mt-1 block text-2xl leading-tight">
              {subtitle}
            </span>
          </p>
        </div>
      )}
    </main>
  );
}

function UnavailableNote({ a, b }: { a: Bot; b: Bot }) {
  const missing = TRUMP_STATS.filter((s) => !isTrumpable(s, a, b));
  if (!missing.length) return null;
  return (
    <p className="mt-6 text-center text-[11px] text-bb-steel">
      Not playable for this pairing (battlebots.com has no career record):{" "}
      {missing.map((m) => m.label).join(", ")}
    </p>
  );
}

function TopBar({ source }: { source: DataSource }) {
  const { muted, toggleMute } = useArena();
  return (
    <div className="mb-6 flex items-center justify-between border-b border-bb-steel pb-3">
      <Link href="/" className="display text-2xl">
        WRECK<span className="text-bb-red">ED</span>
      </Link>
      <div className="flex items-center gap-4">
        <Link href="/intel" className="label hover:text-bb-bone">
          Intel
        </Link>
        <button
          onClick={() => {
            const next = !muted;
            setMuted(next);
            toggleMute();
            if (!next) {
              unlockAudio();
              play("click");
            }
          }}
          className="label hover:text-bb-bone"
          aria-label={muted ? "Unmute sound" : "Mute sound"}
        >
          {muted ? "Sound off" : "Sound on"}
        </button>
        <span
          className="label !text-[9px]"
          title={
            source === "live"
              ? "Fetched from battlebots.com just now"
              : "Live API unreachable — showing committed snapshot"
          }
        >
          <span
            className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
            style={{ background: source === "live" ? "#33d17a" : "#f5a623" }}
          />
          {source === "live" ? "Live API" : "Snapshot"}
        </span>
      </div>
    </div>
  );
}
