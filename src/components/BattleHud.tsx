"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { Bot } from "@/lib/bbpl/client";
import { commentate, playStinger } from "@/lib/commentary";
import { play, unlockAudio } from "@/lib/audio";
import { crowdPop, impact } from "@/lib/synth";
import { isTrumpable, TRUMP_BY_KEY, TRUMP_STATS, type TrumpKey } from "@/lib/scoring";
import { SIDE } from "@/lib/theme";
import { voicesFor } from "@/lib/voices";
import { burnDamage, useArena, type AiMode, type Side } from "@/lib/store";

/**
 * The command deck.
 *
 * Everything you can *do* in a fight lives in this one fixed panel at the
 * bottom of the screen, and nothing in it ever moves. That is a deliberate fix
 * for two earlier problems: the stat buttons were duplicated on both cards (six
 * stats rendered twice, but playing "Win Rate" from either card was the same
 * move), and the AI controls sat below the fold so you had to scroll away from
 * the fight to reach them.
 *
 * Now the six stats are a single row of head-to-head buttons — each one shows
 * both values and who leads before you commit — and the four AI actions sit
 * beside them permanently, each labelled with what it actually does.
 *
 * Analyse and Predict are **pre-generated** in the background as soon as a
 * matchup starts: they depend only on the two bots, not on anything the player
 * does, so there is no reason to make anyone wait for them. A ready dot on the
 * button says so.
 */

/**
 * The arsenal — weapons only.
 *
 * Analyse and Predict used to sit here too, which quietly taught everyone that
 * this panel was "the AI buttons" rather than "the things that hurt". They are
 * commentary, not ordnance, and they have moved to the broadcast desk where
 * they arrive on their own. What is left is the two moves that are genuinely
 * fired at a machine and genuinely take morale off it, each wearing its damage
 * on its face in the same units as the meter it drains.
 */
const WEAPONS: {
  mode: Extract<AiMode, "taunt" | "roast">;
  label: string;
  blurb: string;
  /** Sigil, so the two are told apart at a glance rather than by reading. */
  icon: string;
  /** Damage, in the units of the morale meter. */
  cost: string;
}[] = [
  {
    mode: "taunt",
    label: "Trash talk",
    blurb: "Cheap shot, straight to its face",
    icon: "🗯",
    cost: "−10 morale",
  },
  {
    mode: "roast",
    label: "Roast",
    blurb: "Its worst numbers, read back to it",
    icon: "💀",
    cost: "−18 morale",
  },
];

export default function BattleHud({
  a,
  b,
  onSubtitle,
}: {
  a: Bot;
  b: Bot;
  onSubtitle: (text: string) => void;
}) {
  const {
    phase,
    turn,
    round,
    autoOpponent,
    thinking,
    activeStat,
    aiText,
    aiMode,
    aiLoading,
    aiTarget,
    muted,
    setAi,
    playStat,
    nextRound,
    shove,
    hurtFeelings,
    awardXp,
    bumpDamage,
  } = useArena();

  const [target, setTarget] = useState<Side>("b");
  const abort = useRef<AbortController | null>(null);

  /** Who each machine sounds like. Stable for a given pairing. */
  const voices = useMemo(() => voicesFor(a.slug, b.slug), [a.slug, b.slug]);

  const playerTurn = phase === "choose-stat" && (turn === "a" || !autoOpponent);

  /**
   * The corner the person at the keyboard is playing.
   *
   * Against the machine that is always red. In hotseat both corners are human,
   * so "you" is whoever is on the clock — which is what makes "you lead" on a
   * stat button a true statement for both players rather than for one of them.
   */
  const mine: Side = autoOpponent ? "a" : turn;
  /** Who is behind each corner, said plainly. */
  const seat = (side: Side) =>
    mine === side ? "You" : autoOpponent ? "AI" : side === "a" ? "Red player" : "Blue player";

  // ── Running an action ───────────────────────────────────────────────────
  const fire = useCallback(
    async (mode: "taunt" | "roast") => {
      unlockAudio();
      play("pill");
      abort.current?.abort();
      const ctl = new AbortController();
      abort.current = ctl;

      const aimedAt = target;
      // Trash talk is spoken *by* the other corner, at this one — so the voice
      // is the aggressor's, not the target's. Getting that backwards would
      // have each machine narrating the insults being thrown at it.
      const speaker = voices[aimedAt === "a" ? "b" : "a"];
      setAi({ aiMode: mode, aiLoading: true, aiText: "", aiTarget: aimedAt });

      /**
       * The blow, once the words exist.
       *
       * Order matters: the shove goes in first so the machine is already
       * moving when the morale number floats off it.
       */
      const landed = (text: string) => {
        if (text.length < 20) return;
        const victim = aimedAt === "a" ? a : b;
        const { amount, cited } = burnDamage(text, mode === "roast");
        shove(aimedAt);
        impact(cited ? 0.8 : 0.55);
        crowdPop(cited ? 1 : 0.6);
        hurtFeelings(victim.slug, amount, aimedAt, cited ? "receipts" : undefined);
        awardXp(
          aimedAt === "a" ? "b" : "a",
          cited ? 30 : 15,
          cited ? "burn + receipts" : "burn landed",
        );
        bumpDamage(0.06);
      };

      try {
        const { stinger: said, spoken } = await commentate(
          "burn",
          async (onText) => {
          const res = await fetch("/api/ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              a: a.slug,
              b: b.slug,
              mode,
              stat: activeStat,
              target: aimedAt,
            }),
            signal: ctl.signal,
          });

          if (!res.ok || !res.body) {
            const msg =
              res.status === 429
                ? "Easy — too many requests. Give it a second."
                : "The AI is down. The numbers on the cards are still real.";
            setAi({ aiText: msg, aiLoading: false });
            return "";
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let acc = "";
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            acc += decoder.decode(value, { stream: true });
            setAi({ aiText: acc });
            onText(acc);
          }
            return acc;
          },
          speaker,
        );

        onSubtitle(said);
        setAi({ aiLoading: false });
        landed(spoken);
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setAi({ aiText: "Connection dropped.", aiLoading: false });
        }
      }
    },
    [
      a,
      b,
      activeStat,
      target,
      voices,
      setAi,
      shove,
      hurtFeelings,
      awardXp,
      bumpDamage,
      onSubtitle,
    ],
  );

  const onPlayStat = (key: TrumpKey) => {
    unlockAudio();
    play("select");
    playStat(key);
  };

  const accent = SIDE[turn].color;

  return (
    <section
      className="relative shrink-0 border-t-2 bg-bb-panel/95 backdrop-blur"
      style={{ borderColor: accent, boxShadow: `0 -14px 40px -24px ${accent}` }}
    >
      {/* ── State line: whose move, and what to do about it ── */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-1.5"
        style={{ background: `linear-gradient(90deg, ${accent}26, transparent 60%)` }}
      >
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="stencil text-lg" style={{ color: accent }}>
            {turn === "a" ? "◀" : "▶"}
          </span>
          <span className="display truncate text-xl">
            {phase === "resolve"
              ? "Round result"
              : phase === "aftermath"
                ? "Final"
                : // Before the turn actually opens, nobody is choosing yet —
                  // saying otherwise reads as a stuck opponent.
                  phase === "reveal" || phase === "turn-intro"
                  ? "Get ready…"
                  : playerTurn
                    ? `${SIDE[turn].corner} — choose a stat`
                    : `${SIDE[turn].corner} is choosing…`}
          </span>
          <span className="label !text-[9px]">Round {round} of 6</span>
        </div>

        {muted && (
          <span className="label !text-[9px] !text-bb-amber">
            Sound is off — live commentary is silent
          </span>
        )}
      </div>

      <div className="grid gap-3 px-4 pb-3 pt-2 lg:grid-cols-[1fr_22rem]">
        {/* ── TOP TRUMPS: one button per stat, never duplicated ── */}
        <div>
          <div className="mb-1 flex items-baseline gap-2">
            <h3 className="label !text-[10px] !text-bb-bone">Top trumps · play a stat</h3>
            <span className="text-[10px] text-bb-steel">
              Play the one you lead on. Winner takes the round.
            </span>
          </div>

          {/* Whose column is whose. Without this the two numbers in each button
              are just two numbers, and the colour coding is something you have
              to already know. */}
          <div className="mb-1 flex items-baseline justify-between gap-2 border-b border-bb-steel/60 pb-1">
            <span className="display flex min-w-0 items-baseline gap-1.5 truncate text-sm">
              <span style={{ color: SIDE.a.color }}>◀ {a.name}</span>
              <span className="label !text-[8px]">{seat("a")}</span>
            </span>
            <span className="label !text-[8px] shrink-0">Rule</span>
            <span className="display flex min-w-0 items-baseline justify-end gap-1.5 truncate text-sm">
              <span className="label !text-[8px]">{seat("b")}</span>
              <span style={{ color: SIDE.b.color }}>{b.name} ▶</span>
            </span>
          </div>

          {phase === "resolve" || phase === "aftermath" ? (
            <ResultPanel a={a} b={b} onContinue={nextRound} />
          ) : (
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {TRUMP_STATS.map((stat) => {
                const av = stat.get(a);
                const bv = stat.get(b);
                const usable = isTrumpable(stat, a, b);
                const enabled = usable && playerTurn && !thinking;
                const leader =
                  !usable || av === null || bv === null || av === bv
                    ? null
                    : (stat.higherWins ? av > bv : av < bv)
                      ? "a"
                      : "b";
                // Called from the chooser's point of view: "you lead" is the
                // only reading of this button that is actually a decision.
                const verdict = !usable
                  ? "No data"
                  : leader === null
                    ? "Dead heat"
                    : leader === mine
                      ? "You lead"
                      : "You trail";

                return (
                  <button
                    key={stat.key}
                    onClick={() => onPlayStat(stat.key)}
                    disabled={!enabled}
                    title={
                      usable
                        ? `${stat.hint}. ${stat.higherWins ? "Higher wins" : "Lower wins"}.`
                        : "battlebots.com has no career record for one of these bots"
                    }
                    className={[
                      "group relative border px-2 py-1 text-left transition-all",
                      enabled
                        ? "cursor-pointer border-bb-steel hover:border-bb-bone hover:bg-white/10 active:scale-[0.98]"
                        : "cursor-not-allowed border-bb-steel/40 opacity-45",
                      thinking && usable ? "scan-line" : "",
                    ].join(" ")}
                    style={
                      enabled && leader === mine
                        ? { borderColor: `${SIDE[mine].color}99` }
                        : undefined
                    }
                  >
                    <span className="flex items-baseline justify-between gap-1">
                      <span className="label !text-[9px] !tracking-wider">{stat.label}</span>
                      <span
                        className="label !text-[8px] !tracking-normal"
                        title={
                          stat.higherWins
                            ? "The bigger number takes this round"
                            : "The smaller number takes this round — faster is deadlier"
                        }
                      >
                        {stat.higherWins ? "▲ HIGH" : "▼ LOW"}
                      </span>
                    </span>

                    <span className="mt-0.5 flex items-baseline justify-between gap-1">
                      <span
                        className="stencil text-lg tabular-nums"
                        style={{
                          color: leader === "a" ? SIDE.a.color : undefined,
                          opacity: leader === "b" ? 0.5 : 1,
                        }}
                      >
                        {av === null ? "—" : stat.format(av)}
                        {leader === "a" && <span className="ml-0.5 text-[10px]">▲</span>}
                      </span>
                      <span className="text-[9px] text-bb-steel">vs</span>
                      <span
                        className="stencil text-lg tabular-nums"
                        style={{
                          color: leader === "b" ? SIDE.b.color : undefined,
                          opacity: leader === "a" ? 0.5 : 1,
                        }}
                      >
                        {leader === "b" && <span className="mr-0.5 text-[10px]">▲</span>}
                        {bv === null ? "—" : stat.format(bv)}
                      </span>
                    </span>

                    <span
                      className="label mt-0.5 block !text-[8px] !tracking-normal"
                      style={{
                        color:
                          leader === null || !usable
                            ? "#5a5f66"
                            : leader === mine
                              ? SIDE[mine].color
                              : "#5a5f66",
                      }}
                    >
                      {verdict}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── ARSENAL: always in the same place, always reachable ── */}
        <div className="lg:border-l lg:border-bb-steel lg:pl-3">
          <div className="mb-1.5 flex items-baseline gap-2">
            <h3 className="label !text-[10px] !text-bb-bone">Arsenal</h3>
            <span className="text-[10px] text-bb-steel">
              AI weapons. Burns take real morale off the bot you fire at.
            </span>
          </div>

          <TargetLock
            a={a}
            b={b}
            target={target}
            mine={mine}
            onSwap={() => {
              play("click");
              setTarget(target === "a" ? "b" : "a");
            }}
          />

          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            {WEAPONS.map((weapon) => {
              const firing = aiLoading && aiMode === weapon.mode;
              return (
                <button
                  key={weapon.mode}
                  onClick={() => fire(weapon.mode)}
                  disabled={aiLoading}
                  title={`${weapon.blurb} — fired at ${(target === "a" ? a : b).name}`}
                  className={[
                    "relative border px-2 py-2 text-left transition-all",
                    aiMode === weapon.mode
                      ? "border-bb-red bg-bb-red/20"
                      : "border-bb-steel hover:border-bb-chrome hover:bg-white/5",
                    aiLoading ? "cursor-wait opacity-60" : "cursor-pointer",
                    firing ? "arming" : "",
                  ].join(" ")}
                >
                  <span className="display flex items-center gap-1.5 text-xl leading-none">
                    <span aria-hidden className="text-base">
                      {weapon.icon}
                    </span>
                    {weapon.label}
                  </span>

                  {/* Damage on the face of the button, in the meter's units. */}
                  <span
                    className="label mt-1 block !text-[8px] !tracking-normal"
                    style={{ color: SIDE[target].color }}
                  >
                    {weapon.cost} → {(target === "a" ? a : b).name}
                  </span>

                  <span className="mt-0.5 block text-[9px] leading-tight text-bb-chrome">
                    {weapon.blurb}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Output ── */}
      <div className="min-h-[3.25rem] border-t border-bb-steel px-4 py-2">
        {aiText || aiLoading ? (
          <blockquote
            className="border-l-2 pl-3 text-[13px] leading-snug"
            style={{
              borderColor:
                aiTarget === "a"
                  ? SIDE.a.color
                  : aiTarget === "b"
                    ? SIDE.b.color
                    : "#2a3038",
            }}
          >
            {aiText}
            {aiLoading && (
              <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-bb-red" />
            )}
          </blockquote>
        ) : (
          <p className="text-[11px] leading-snug text-bb-steel">
            Grounded in both bots&apos; real stat blocks and their prior-season
            fight logs — it is not allowed to invent a number. Burns cost the
            target real morale, and{" "}
            <span className="text-bb-amber">a burn that cites a real stat hits for 6 more</span>{" "}
            — receipts do damage.
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * Where the weapons are pointed.
 *
 * This was two buttons side by side with a bot name on each, under the word
 * "Aim" — which read, to everyone who met it, as *choose which bot you are
 * playing as*. That switch does not exist during a fight, so pressing it and
 * watching nothing change was baffling in exactly the way a control should
 * never be.
 *
 * It is now a single reticle naming the one machine in the crosshairs, with an
 * explicit swap that says where it will point instead — and it calls out
 * friendly fire, because aiming a roast at your own bot is a legal move and a
 * funny one, but never an accident worth having by mistake.
 */
function TargetLock({
  a,
  b,
  target,
  mine,
  onSwap,
}: {
  a: Bot;
  b: Bot;
  target: Side;
  /** The corner the player is fighting from. */
  mine: Side;
  onSwap: () => void;
}) {
  const bot = target === "a" ? a : b;
  const other = target === "a" ? b : a;
  const own = target === mine;
  const accent = own ? "#f5a623" : SIDE[target].color;

  return (
    <div
      className="flex items-center gap-2 border px-2 py-1"
      style={{ borderColor: accent, background: `${accent}14` }}
    >
      <span aria-hidden className="text-xs">
        🎯
      </span>
      <span className="label !text-[8px] shrink-0">Firing at</span>
      <span className="min-w-0 flex-1 truncate">
        <span className="display text-base" style={{ color: accent }}>
          {bot.name}
        </span>
        <span className="label ml-1.5 !text-[8px]">
          {own ? "your own bot — friendly fire" : SIDE[target].corner}
        </span>
      </span>
      <button
        onClick={onSwap}
        className="label shrink-0 border border-bb-steel px-1.5 py-0.5 !text-[8px] transition-colors hover:bg-white/10"
        title={`Point the weapons at ${other.name} instead`}
      >
        ⇄ {other.name}
      </button>
    </div>
  );
}

/** Round outcome and the only button that moves the game on. */
function ResultPanel({
  a,
  b,
  onContinue,
}: {
  a: Bot;
  b: Bot;
  onContinue: () => void;
}) {
  const { activeStat, lastResult, phase, playedRounds } = useArena();
  if (!activeStat || !lastResult) {
    return <p className="text-sm text-bb-chrome">Waiting on the judges…</p>;
  }
  const stat = TRUMP_BY_KEY[activeStat];
  const winner = lastResult.outcome;

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="min-w-0">
        <div className="label !text-[9px]">{stat.label}</div>
        <div className="display text-3xl leading-none">
          {winner === "tie" ? (
            "Dead heat"
          ) : (
            <span style={{ color: winner === "a" ? SIDE.a.color : SIDE.b.color }}>
              {winner === "a" ? a.name : b.name} takes it
            </span>
          )}
        </div>
        <div className="stencil mt-1 text-sm text-bb-chrome tabular-nums">
          {lastResult.aValue !== null ? stat.format(lastResult.aValue) : "—"}
          <span className="mx-2 text-bb-steel">vs</span>
          {lastResult.bValue !== null ? stat.format(lastResult.bValue) : "—"}
        </div>
      </div>

      {phase === "resolve" && (
        <button
          onClick={onContinue}
          autoFocus
          className="brackets display ml-auto bg-bb-bone px-6 py-2.5 text-2xl text-black transition-transform hover:scale-105 active:scale-95"
        >
          Continue ▸
        </button>
      )}

      {phase === "aftermath" && (
        <div className="ml-auto text-right">
          <div className="label !text-[9px]">Rounds</div>
          <div className="stencil text-2xl">
            <span style={{ color: SIDE.a.color }}>
              {playedRounds.filter((r) => r.winner === "a").length}
            </span>
            <span className="mx-1 text-bb-steel">–</span>
            <span style={{ color: SIDE.b.color }}>
              {playedRounds.filter((r) => r.winner === "b").length}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Fires the pre-voiced turn call. Exported for the arena's turn effect. */
export function callTurn(side: Side): Promise<string> {
  return playStinger(side === "a" ? "turnRed" : "turnBlue");
}
