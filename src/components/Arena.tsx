"use client";

import BroadcastLink from "@/components/BroadcastLink";
import Scorecard, { cardTotals, scoreRounds } from "@/components/Scorecard";
import Wordmark from "@/components/Wordmark";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BattleHud, { callTurn } from "@/components/BattleHud";
import BotCard from "@/components/BotCard";
import BroadcastDesk from "@/components/BroadcastDesk";
import ClashReveal from "@/components/ClashReveal";
import DamageOverlay from "@/components/DamageOverlay";
import Fighter from "@/components/Fighter";
import Momentum from "@/components/Momentum";
import SoundPrompt from "@/components/SoundPrompt";
import StatRadar from "@/components/StatRadar";
import TaleOfTape, { type TapeData } from "@/components/TaleOfTape";
import TelemetryDrawer from "@/components/TelemetryDrawer";
import TurnBanner from "@/components/TurnBanner";
import WalkIn from "@/components/WalkIn";
import type { Bot, DataSource } from "@/lib/bbpl/client";
import {
  announceMatchup,
  announceRound,
  announceWinner,
  stopAnnouncer,
} from "@/lib/announcer";
import { play, setMuted, unlockAudio } from "@/lib/audio";
import { cancelBrowserSpeech, primeSpeech } from "@/lib/speech";
import { cut } from "@/lib/broadcast";
import { playStinger, stopCommentary } from "@/lib/commentary";
import {
  bell,
  buzzer,
  crowdPop,
  fanfare,
  impact,
  levelUp,
  setCrowdLevel,
  startCrowd,
  stopCrowd,
} from "@/lib/synth";
import { commonOpponents, fightsFor, headToHead, SEASON_LABEL } from "@/lib/fights";
import {
  bestStatFor,
  DOMINANT,
  isTrumpable,
  radarAxes,
  severityOf,
  TRUMP_STATS,
} from "@/lib/scoring";
import { SIDE } from "@/lib/theme";
import {
  activeBot,
  benchBot,
  duelLeader,
  MAX_FEELINGS,
  momentum,
  scoreboard,
  useArena,
  type Format,
  type Side,
} from "@/lib/store";

/**
 * The arena.
 *
 * Two stages. **Select** is the roster; **battle** is a viewport-locked
 * three-column stage with a fixed command deck along the bottom — nothing in a
 * fight is ever below the fold, because a fight you have to scroll to play is
 * not a fight.
 *
 * The turn loop is the spine of it: initiative alternates every round, a turn
 * change gets a full-screen call, and when the machine has the move it visibly
 * deliberates before committing rather than answering instantly.
 */

/** How long the machine "thinks" before it plays. Long enough to watch. */
const THINK_MS = 1700;

export default function Arena({
  bots,
  source,
}: {
  bots: Bot[];
  source: DataSource;
}) {
  const state = useArena();
  const {
    phase,
    format,
    teams,
    turn,
    round,
    autoOpponent,
    thinking,
    lastResult,
    playedRounds,
    feelings,
    xp,
    damage,
    setTeams,
    reveal,
    beginTurn,
    playStat,
    tagIn,
    reset,
    setThinking,
    setAutoOpponent,
  } = state;

  const [picks, setPicks] = useState<Bot[]>([]);
  const [pendingFormat, setPendingFormat] = useState<Format>("1v1");
  const [subtitle, setSubtitle] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const a = activeBot(state, "a");
  const b = activeBot(state, "b");
  const needed = pendingFormat === "1v1" ? 2 : 4;

  // ── Draw / selection ────────────────────────────────────────────────────
  /**
   * Cut to the fight.
   *
   * The teams are set while the shutters are closed, and the two point clouds
   * are sampled in the same window — so the machines are in memory before the
   * screen reopens instead of assembling out of nothing on the first frame.
   * The prewarm is raced against a deadline: on a slow device the fight starts
   * slightly less prepared rather than the stinger hanging on screen.
   */
  const startWith = useCallback(
    (chosen: Bot[], fmt: Format) => {
      stopAnnouncer();
      stopCommentary();
      setSubtitle("");
      const half = chosen.length / 2;
      const ringside = [chosen[0], chosen[half]].filter(Boolean);

      void cut({
        kind: "slam",
        label: "Fight",
        sub: ringside.map((x) => x.name).join("  vs  "),
        onCovered: async () => {
          setTeams(chosen.slice(0, half), chosen.slice(half), fmt);
          const warm = import("@/components/MeshPortrait").then((m) =>
            Promise.all(ringside.map((x) => m.prewarmMesh(x.image))),
          );
          await Promise.race([
            warm,
            new Promise((r) => setTimeout(r, 900)),
          ]).catch(() => {});
        },
      });
    },
    [setTeams],
  );

  const drawRandom = useCallback(() => {
    unlockAudio();
    play("draw");
    const pool = [...bots];
    const chosen: Bot[] = [];
    for (let i = 0; i < needed && pool.length; i++) {
      chosen.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    setPicks([]);
    startWith(chosen, pendingFormat);
  }, [bots, needed, pendingFormat, startWith]);

  const rematch = useCallback(() => {
    unlockAudio();
    play("draw");
    startWith([...teams.a.bots, ...teams.b.bots], format);
  }, [teams, format, startWith]);

  function togglePick(bot: Bot) {
    unlockAudio();
    play("select");
    // Derived from current state rather than inside a setState updater:
    // starting a fight is a side effect, and React is free to call an updater
    // more than once, which fired the stinger twice.
    const chosen = picks.some((p) => p.slug === bot.slug)
      ? picks.filter((p) => p.slug !== bot.slug)
      : [...picks, bot];

    if (chosen.length === needed) {
      setPicks([]);
      startWith(chosen, pendingFormat);
      return;
    }
    setPicks(chosen);
  }

  // ── Walk-in ─────────────────────────────────────────────────────────────
  // The announcer's call is fired here rather than inside the walk-in, because
  // it must survive the walk-in being skipped: cutting the visuals short is a
  // demo convenience, cutting the voice off mid-name is a glitch.
  useEffect(() => {
    if (phase !== "reveal" || !a || !b) return;
    play("reveal");
    // Chrome populates the speech-synthesis voice list asynchronously, so the
    // fallback voice is warmed here rather than discovered mid-insult.
    primeSpeech();
    startCrowd();
    setCrowdLevel(0.35);
    void announceMatchup(a.slug, a.name, b.slug, b.name).then(setSubtitle);
  }, [phase, a, b]);

  // The room, reacting to the state of the fight rather than to the clock:
  // louder and brighter as the lead grows, the damage mounts and the rounds
  // run out.
  useEffect(() => {
    // Leaving the fight empties the building. Without this the bed kept
    // running under the roster, because the arena never unmounts on a quit —
    // it just re-renders as the selection screen.
    if (phase === "select") {
      stopCrowd(600);
      return;
    }
    const swing = Math.abs(momentum(playedRounds, teams, feelings));
    setCrowdLevel(
      Math.min(1, 0.25 + swing * 0.5 + damage * 0.3 + (playedRounds.length / 6) * 0.25),
    );
  }, [phase, playedRounds, teams, feelings, damage]);

  useEffect(() => () => stopCrowd(400), []);

  // ── The machine's turn ──────────────────────────────────────────────────
  // It plays the stat where it holds the biggest edge over the field, but only
  // after a visible pause — an instant answer reads as a bug, not an opponent.
  useEffect(() => {
    if (phase !== "choose-stat" || turn !== "b" || !autoOpponent || !a || !b) return;
    setThinking(true);
    const t = setTimeout(() => {
      const used = playedRounds.map((r) => r.stat);
      const key = bestStatFor(b, a, bots, used);
      setThinking(false);
      if (key) playStat(key);
    }, THINK_MS);
    return () => {
      clearTimeout(t);
      setThinking(false);
    };
  }, [phase, turn, autoOpponent, a, b, bots, playedRounds, playStat, setThinking]);

  // ── Round outcome ───────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "resolve" || !lastResult || !a || !b) return;
    if (lastResult.outcome === "tie") {
      play("thud");
      void announceRound(null).then(setSubtitle);
      return;
    }
    play("crack");
    const sting = setTimeout(() => play("win"), 220);
    const winner = lastResult.outcome === "a" ? a : b;
    const decisive = severityOf(lastResult) > DOMINANT;
    // The room reacts on the beat the clash lands, not on the beat it opens.
    const roar = setTimeout(() => crowdPop(decisive ? 1 : 0.55), 1180);
    void announceRound(winner.slug, { decisive }).then(setSubtitle);
    return () => {
      clearTimeout(sting);
      clearTimeout(roar);
    };
  }, [phase, lastResult, a, b]);

  // ── Final call ──────────────────────────────────────────────────────────
  // Buzzer, then the shutters close on the fight and reopen on the result,
  // then the fanfare and the announcer over the top of it.
  const calledFinal = useRef(false);
  useEffect(() => {
    if (phase !== "aftermath") {
      calledFinal.current = false;
      return;
    }
    if (calledFinal.current) return;
    calledFinal.current = true;

    const leader = duelLeader(playedRounds, teams, feelings);
    const bot = leader === "tie" ? null : activeBot({ teams }, leader);

    buzzer();
    void cut({
      kind: "slam",
      label: "Final",
      sub: bot ? `${bot.name} takes it` : "Drawn",
    }).then(() => {
      fanfare();
      if (bot) void announceWinner(bot.slug).then(setSubtitle);
    });
  }, [phase, playedRounds, teams, feelings]);

  // Combat text that deserves a sound of its own.
  const pops = useArena((s) => s.pops);
  const sounded = useRef<Set<number>>(new Set());
  useEffect(() => {
    for (const p of pops) {
      if (sounded.current.has(p.id)) continue;
      sounded.current.add(p.id);
      if (p.kind === "level") levelUp();
      if (p.kind === "ko") {
        impact(0.9);
        crowdPop(1);
      }
    }
  }, [pops]);

  // Damage level drives the CSS overlays.
  useEffect(() => {
    document.documentElement.style.setProperty("--damage", String(damage));
  }, [damage]);

  // Clear the subtitle a beat after it finishes.
  useEffect(() => {
    if (!subtitle) return;
    const t = setTimeout(() => setSubtitle(""), 7000);
    return () => clearTimeout(t);
  }, [subtitle]);

  const tape = useMemo<TapeData>(
    () => ({
      headToHead: a && b ? headToHead(a.name, b.name) : [],
      common: a && b ? commonOpponents(a.name, b.name) : [],
      aHistory: a ? fightsFor(a.name) : [],
      bHistory: b ? fightsFor(b.name) : [],
      seasonLabel: SEASON_LABEL,
    }),
    [a, b],
  );

  const axes = useMemo(() => (a && b ? radarAxes(a, b, bots) : []), [a, b, bots]);
  const score = scoreboard(playedRounds);

  // ── Selection stage ─────────────────────────────────────────────────────
  if (phase === "select" || !a || !b) {
    return (
      <main className="mx-auto max-w-[1600px] px-5 py-6">
        <TopBar source={source} />

        <div className="mb-5">
          <SoundPrompt />
        </div>

        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="display text-5xl sm:text-7xl">
              Make the <span className="text-bb-red">match</span>
            </h1>
            <p className="mt-2 max-w-xl text-sm text-bb-chrome">
              Every stat on every card is live BattleBots Pro League data.{" "}
              {pendingFormat === "1v1"
                ? "Put two machines in the ring, or let the matchmaker do it."
                : "Choose four — the first two take the red corner, the last two the blue."}
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <Choice
              label="Format"
              value={pendingFormat}
              options={[
                { value: "1v1", label: "1v1", hint: "One bot each, best of six" },
                {
                  value: "2v2",
                  label: "2v2",
                  hint: "Two bots each. A stopped bot forces its partner in; lose both corners and the fight is over.",
                },
              ]}
              onChange={(f) => {
                play("click");
                setPendingFormat(f);
                setPicks([]);
              }}
            />
            <Choice
              label="Blue corner"
              value={autoOpponent ? "ai" : "human"}
              options={[
                { value: "ai", label: "AI", hint: "The machine picks the stat on its turn. You play red." },
                {
                  value: "human",
                  label: "2 players",
                  hint: "Hotseat: red and blue both choose their own stat, taking turns at the same keyboard.",
                },
              ]}
              onChange={(v) => {
                play("click");
                setAutoOpponent(v === "ai");
              }}
            />
            <button
              onClick={drawRandom}
              className="brackets display bg-bb-red px-7 py-4 text-2xl text-white transition-transform hover:scale-[1.03] active:scale-95"
            >
              Random matchup ⚡
            </button>
          </div>
        </div>

        {/* Draft tray — which slot each pick is filling. */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {Array.from({ length: needed }, (_, i) => {
            const bot = picks[i];
            const side: Side = i < needed / 2 ? "a" : "b";
            return (
              <span
                key={i}
                className="flex min-w-[9rem] items-center gap-2 border px-3 py-1.5"
                style={{
                  borderColor: bot ? SIDE[side].color : "#2a3038",
                  background: bot ? `${SIDE[side].color}18` : "transparent",
                }}
              >
                <span
                  className="label !text-[9px]"
                  style={{ color: SIDE[side].color }}
                >
                  {side === "a" ? "Red" : "Blue"}
                </span>
                <span className="display truncate text-lg">{bot?.name ?? "—"}</span>
              </span>
            );
          })}
          {picks.length > 0 && (
            <button
              onClick={() => setPicks([])}
              className="label border border-bb-steel px-3 py-1.5 hover:bg-white/10"
            >
              Clear
            </button>
          )}
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

  // ── Battle stage ────────────────────────────────────────────────────────
  const leader = duelLeader(playedRounds, teams, feelings);
  const decision = (() => {
    const totals = cardTotals(scoreRounds(playedRounds));
    if (leader === "tie") return { method: "Draw", totals };
    // Every bot in a corner on zero morale is a stoppage, not a decision.
    const beaten = teams[leader === "a" ? "b" : "a"].bots.every(
      (bot) => (feelings[bot.slug] ?? MAX_FEELINGS) <= 0,
    );
    if (beaten) return { method: `Wins by TKO, round ${playedRounds.length}`, totals };
    const shutout = playedRounds.every((r) => r.winner === leader || !r.winner);
    return {
      method: shutout ? "Wins by unanimous decision" : "Wins by decision",
      totals,
    };
  })();

  const outcomeFor = (side: Side) => {
    if (!lastResult || phase !== "resolve") return null;
    if (lastResult.outcome === "tie") return "tie" as const;
    return lastResult.outcome === side ? ("win" as const) : ("lose" as const);
  };
  const canTag = (side: Side) =>
    phase === "choose-stat" && turn === side && (side === "a" || !autoOpponent);

  return (
    <main className="flex h-[100dvh] flex-col overflow-hidden">
      <DamageOverlay />

      {/* The walk-in. It owns the reveal phase; `reveal()` moves the fight on
          when it finishes or is skipped. */}
      {phase === "reveal" && <WalkIn a={a} b={b} onDone={reveal} />}

      {/* The round, resolved in full. Keyed on the round so each one is a
          fresh run of the beats rather than a component being reused. */}
      {phase === "resolve" && (
        <ClashReveal key={playedRounds.length} a={a} b={b} />
      )}

      {phase === "turn-intro" && (
        <TurnBanner
          key={round}
          side={turn}
          round={round}
          botName={(turn === "a" ? a : b).name}
          auto={turn === "b" && autoOpponent}
          onDone={() => {
            // Round one already has the announcer calling the matchup over it.
            if (round > 1) {
              bell();
              void callTurn(turn);
            }
            beginTurn();
          }}
        />
      )}

      <div className="shrink-0 px-4 pt-3">
        <TopBar source={source} onQuit={reset} />
      </div>
      {/* You are watching this from outside the ropes. */}
      <div aria-hidden className="ropes h-8 shrink-0 opacity-80" />

      {/* Compact score strip for narrow screens, which lose the centre column. */}
      <div className="flex shrink-0 items-center justify-center gap-4 py-1 lg:hidden">
        <span className="stencil text-3xl" style={{ color: SIDE.a.color }}>
          {score.a}
        </span>
        <span className="label !text-[9px]">Round {round} of 6</span>
        <span className="stencil text-3xl" style={{ color: SIDE.b.color }}>
          {score.b}
        </span>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 px-4 pb-2 lg:grid-cols-[1fr_15rem_1fr] lg:gap-4">
        <Fighter
          side="a"
          bot={a}
          opponent={b}
          bench={benchBot(state, "a")}
          feelings={feelings[a.slug] ?? MAX_FEELINGS}
          benchFeelings={feelings[benchBot(state, "a")?.slug ?? ""] ?? MAX_FEELINGS}
          xp={xp.a}
          damage={damage}
          onTheClock={phase === "choose-stat" && turn === "a"}
          outcome={outcomeFor("a")}
          canTag={canTag("a")}
          onTag={() => {
            play("select");
            tagIn("a", teams.a.activeIndex === 0 ? 1 : 0);
            void playStinger("tag");
          }}
        />

        {/* ── Centre column ── */}
        <div className="hidden min-h-0 flex-col gap-3 overflow-y-auto lg:flex">
          <div className="flex items-center justify-center gap-4">
            <span className="stencil text-4xl" style={{ color: SIDE.a.color }}>
              {score.a}
            </span>
            <div className="text-center">
              <div className="label !text-[9px]">
                {phase === "aftermath" ? "Final" : `Round ${round}`}
              </div>
              <div className="display text-xl">
                {format === "2v2" ? "Tag team" : "Six rounds"}
              </div>
            </div>
            <span className="stencil text-4xl" style={{ color: SIDE.b.color }}>
              {score.b}
            </span>
          </div>

          <BroadcastDesk a={a} b={b} onSubtitle={setSubtitle} />

          <Momentum
            value={momentum(playedRounds, teams, feelings)}
            rounds={playedRounds}
          />

          <Scorecard rounds={playedRounds} />

          <StatRadar axes={axes} aName={a.name} bName={b.name} />

          <button
            onClick={() => {
              play("click");
              setDrawerOpen(true);
            }}
            className="label brackets border border-bb-steel py-2 transition-colors hover:bg-white/10"
          >
            Live data feed ▸
          </button>

          <TaleOfTape a={a} b={b} data={tape} />
        </div>

        <Fighter
          side="b"
          bot={b}
          opponent={a}
          bench={benchBot(state, "b")}
          feelings={feelings[b.slug] ?? MAX_FEELINGS}
          benchFeelings={feelings[benchBot(state, "b")?.slug ?? ""] ?? MAX_FEELINGS}
          xp={xp.b}
          damage={damage}
          onTheClock={phase === "choose-stat" && turn === "b"}
          outcome={outcomeFor("b")}
          canTag={canTag("b")}
          onTag={() => {
            play("select");
            tagIn("b", teams.b.activeIndex === 0 ? 1 : 0);
            void playStinger("tag");
          }}
        />
      </div>

      {/* Machine deliberating — the scan reads right across the stage. */}
      {thinking && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-40"
          style={{
            background: `linear-gradient(90deg, transparent, ${SIDE.b.color}22, transparent)`,
            animation: "scan-across 1.7s linear",
          }}
        />
      )}

      {/* Ring announcer / commentator subtitle.
          In the flow rather than floating: as an overlay it sat on top of the
          scoreboard and the radar, which is exactly the information you want
          while the announcer is talking. The row is always present so its
          arrival never shoves the stage around. */}
      <div className="flex h-11 shrink-0 items-center justify-center px-4">
        {subtitle && (
          <p className="plate brackets max-w-4xl truncate px-4 py-1 text-center">
            <span className="label mr-2 !text-[9px] !text-bb-red">Ringside</span>
            <span className="display text-lg leading-tight">{subtitle}</span>
          </p>
        )}
      </div>

      {phase === "aftermath" ? (
        <Aftermath
          leader={leader}
          aName={a.name}
          bName={b.name}
          method={decision.method}
          totals={decision.totals}
          onRematch={rematch}
          onNew={() =>
            void cut({
              label: "Roster",
              sub: `${bots.length} competitors`,
              onCovered: reset,
            })
          }
        />
      ) : (
        <BattleHud a={a} b={b} onSubtitle={setSubtitle} />
      )}

      <TelemetryDrawer
        a={a}
        b={b}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />

      {/* Stats that cannot be played for this pairing, stated plainly. */}
      <UnavailableNote a={a} b={b} />
    </main>
  );
}

/**
 * The decision.
 *
 * Called the way a result is actually announced: the *method* first, because
 * winning on a stoppage and winning on the cards are different achievements,
 * and then the judges' totals as the receipt.
 */
function Aftermath({
  leader,
  aName,
  bName,
  method,
  totals,
  onRematch,
  onNew,
}: {
  leader: Side | "tie";
  aName: string;
  bName: string;
  method: string;
  totals: Record<Side, number>;
  onRematch: () => void;
  onNew: () => void;
}) {
  return (
    <section
      className="shrink-0 border-t-2 border-bb-amber bg-bb-panel px-5 py-3"
      style={{ boxShadow: "0 -16px 50px -26px #f5a623" }}
    >
      <div className="flex flex-wrap items-center gap-5">
        <div className="min-w-0">
          <div className="label !text-[9px] !text-bb-amber">{method}</div>
          <div className="display text-5xl leading-none">
            {leader === "tie" ? (
              "Drawn"
            ) : (
              <span style={{ color: SIDE[leader].color }}>
                {leader === "a" ? aName : bName}
              </span>
            )}
          </div>
          <div className="stencil mt-1 text-sm tabular-nums text-bb-chrome">
            Cards{" "}
            <span style={{ color: SIDE.a.color }}>{totals.a}</span>
            <span className="mx-1 text-bb-steel">–</span>
            <span style={{ color: SIDE.b.color }}>{totals.b}</span>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            onClick={onRematch}
            className="display bg-bb-red px-6 py-3 text-2xl text-white transition-transform hover:scale-105 active:scale-95"
          >
            Rematch
          </button>
          <button
            onClick={onNew}
            className="display border border-bb-steel px-6 py-3 text-2xl transition-colors hover:bg-white/10"
          >
            New fighters
          </button>
        </div>
      </div>
    </section>
  );
}

/**
 * A labelled segmented control.
 *
 * The label above it is the point. Both of the choices on this screen — the
 * format, and who is behind the blue corner — used to be either unlabelled or
 * (in the case of the opponent) not offered at all, which left "who am I
 * playing as?" to be guessed at from inside the fight. It is a pre-fight
 * decision, so it is asked before the fight, in words.
 */
function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; hint: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <div className="label mb-1 !text-[9px]">{label}</div>
      <div className="flex border border-bb-steel">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            title={opt.hint}
            aria-pressed={value === opt.value}
            className="display px-4 py-3 text-xl transition-colors"
            style={{
              background: value === opt.value ? "#e8ecf1" : "transparent",
              color: value === opt.value ? "#07080a" : "#9aa4b0",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Which voice engine is actually going to speak.
 *
 * Worth surfacing because the failure is otherwise invisible: a spent
 * ElevenLabs balance does not error, it just quietly stops sounding like a
 * person, and finding that out in front of an audience is the wrong time. The
 * fallback is not a fault — the fight still talks, in the machine's own
 * voices — so this states which one you are on rather than warning about it.
 */
function VoiceStatus() {
  const [budget, setBudget] = useState<{ available: boolean; left: number | null } | null>(
    null,
  );

  useEffect(() => {
    let live = true;
    fetch("/api/say")
      .then((r) => r.json())
      .then((d) => {
        if (live) setBudget(d);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (!budget) return null;
  const studio = budget.available;

  return (
    <span
      className="label !text-[9px]"
      title={
        studio
          ? `Studio voice on: bespoke ElevenLabs reads, ${budget.left ?? "?"} characters left. Each bot has its own voice.`
          : "ElevenLabs budget spent — the fight is speaking through the browser's own voices instead. Each bot still gets its own; the pre-voiced announcer and reactions are unaffected."
      }
    >
      <span
        className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
        style={{ background: studio ? "#33d17a" : "#f5a623" }}
      />
      {studio ? `Studio voice · ${budget.left ?? "?"}` : "System voices"}
    </span>
  );
}

function UnavailableNote({ a, b }: { a: Bot; b: Bot }) {
  const missing = TRUMP_STATS.filter((s) => !isTrumpable(s, a, b));
  if (!missing.length) return null;
  return (
    <p className="pointer-events-none fixed bottom-1 left-3 z-40 max-w-xs text-[10px] leading-tight text-bb-steel">
      Unplayable for this pairing (no career record at source):{" "}
      {missing.map((m) => m.label).join(", ")}
    </p>
  );
}

function TopBar({ source, onQuit }: { source: DataSource; onQuit?: () => void }) {
  const { muted, toggleMute } = useArena();
  return (
    <div className="flex items-center justify-between border-b border-bb-steel pb-2">
      <BroadcastLink href="/" label="Red Corner Blue Bot" className="text-xl">
        <Wordmark />
      </BroadcastLink>
      <div className="flex items-center gap-4">
        {onQuit && (
          <button
            onClick={() => void cut({ label: "Roster", onCovered: onQuit })}
            className="label hover:text-bb-bone"
          >
            Roster
          </button>
        )}
        <BroadcastLink
          href="/intel"
          label="Intel"
          sub="Power rankings · weapon meta"
          className="label hover:text-bb-bone"
        >
          Intel
        </BroadcastLink>
        <button
          onClick={() => {
            const next = !muted;
            setMuted(next);
            toggleMute();
            // The crowd is a running loop rather than a one-shot, so muting
            // has to reach in and stop it, not merely stop starting it.
            if (next) {
              stopCrowd(300);
              cancelBrowserSpeech();
            } else {
              unlockAudio();
              play("click");
              startCrowd();
            }
          }}
          className={[
            "label transition-colors",
            muted ? "!text-bb-amber hover:!text-bb-bone" : "hover:text-bb-bone",
          ].join(" ")}
          aria-label={muted ? "Unmute sound" : "Mute sound"}
          title={
            muted
              ? "The ring announcer and live commentary are silent — click for sound"
              : "Sound on"
          }
        >
          {muted ? "🔇 Sound off" : "🔊 Sound on"}
        </button>
        <VoiceStatus />
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
