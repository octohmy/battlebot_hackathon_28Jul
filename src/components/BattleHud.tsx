"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Bot } from "@/lib/bbpl/client";
import { commentate, playStinger, prefetchLine } from "@/lib/commentary";
import { play, unlockAudio } from "@/lib/audio";
import { isTrumpable, TRUMP_BY_KEY, TRUMP_STATS, type TrumpKey } from "@/lib/scoring";
import { SIDE } from "@/lib/theme";
import { useArena, type AiMode, type Side } from "@/lib/store";

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

const ACTIONS: {
  mode: AiMode;
  label: string;
  blurb: string;
  aimed: boolean;
  /** Which pre-voiced reaction fires the moment the text lands. */
  stinger: "burn" | "read";
  /** Safe to generate before it is asked for. */
  preparable: boolean;
}[] = [
  {
    mode: "taunt",
    label: "Trash talk",
    blurb: "Smack talk aimed at one bot",
    aimed: true,
    stinger: "burn",
    preparable: false,
  },
  {
    mode: "roast",
    label: "Roast",
    blurb: "Savage burn from its real failures",
    aimed: true,
    stinger: "burn",
    preparable: false,
  },
  {
    mode: "analyse",
    label: "Analyse",
    blurb: "Who the numbers favour, and why",
    aimed: false,
    stinger: "read",
    preparable: true,
  },
  {
    mode: "predict",
    label: "Predict",
    blurb: "A called winner with a reason",
    aimed: false,
    stinger: "read",
    preparable: true,
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
    hurtFeelings,
    awardXp,
    bumpDamage,
  } = useArena();

  const [target, setTarget] = useState<Side>("b");
  const abort = useRef<AbortController | null>(null);
  /** mode → text generated ahead of time for this exact matchup. */
  const prepared = useRef<Map<AiMode, string>>(new Map());
  /**
   * Tagged with the matchup it belongs to, so a new pairing invalidates it by
   * comparison rather than by a reset — clearing it from the effect body would
   * be a synchronous setState, and a cascading render.
   */
  const matchup = `${a.slug}:${b.slug}`;
  const [ready, setReady] = useState<{ matchup: string; modes: AiMode[] }>({
    matchup,
    modes: [],
  });
  const readyModes = ready.matchup === matchup ? ready.modes : [];

  const playerTurn = phase === "choose-stat" && (turn === "a" || !autoOpponent);

  // ── Pre-generation ──────────────────────────────────────────────────────
  // Analyse and Predict are a pure function of the matchup, so they are
  // fetched the moment the matchup exists. By the time anyone reaches for the
  // button the text is already sitting in memory.
  useEffect(() => {
    prepared.current = new Map();
    const ctl = new AbortController();

    for (const action of ACTIONS.filter((x) => x.preparable)) {
      void (async () => {
        try {
          const res = await fetch("/api/ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              a: a.slug,
              b: b.slug,
              mode: action.mode,
              stat: null,
              target: null,
            }),
            signal: ctl.signal,
          });
          if (!res.ok || !res.body) return;
          const text = await res.text();
          if (ctl.signal.aborted || text.trim().length < 12) return;
          prepared.current.set(action.mode, text.trim());
          setReady((prev) =>
            prev.matchup === matchup
              ? { matchup, modes: [...prev.modes, action.mode] }
              : { matchup, modes: [action.mode] },
          );
          // Warm the voice too, so the read starts the instant it is asked for.
          prefetchLine(text.trim().split(/(?<=[.!?])\s/)[0] ?? "");
        } catch {
          // A failed warm-up is invisible: the button just runs live instead.
        }
      })();
    }

    return () => ctl.abort();
  }, [a.slug, b.slug, matchup]);

  // ── Running an action ───────────────────────────────────────────────────
  const run = useCallback(
    async (mode: AiMode, aimed: boolean, stinger: "burn" | "read") => {
      unlockAudio();
      play("pill");
      abort.current?.abort();
      const ctl = new AbortController();
      abort.current = ctl;

      const aimedAt = aimed ? target : null;
      setAi({ aiMode: mode, aiLoading: true, aiText: "", aiTarget: aimedAt });

      // A pre-generated line only applies when nothing has been aimed and no
      // stat has been played since — otherwise it would be stale context.
      const canned =
        !aimed && !activeStat ? prepared.current.get(mode) : undefined;

      const landed = (text: string) => {
        if (!aimedAt || text.length < 20) return;
        const victim = aimedAt === "a" ? a : b;
        // Longer, more specific burns hurt more.
        const sting = Math.min(22, 8 + Math.round(text.length / 22));
        hurtFeelings(victim.slug, mode === "roast" ? sting : Math.round(sting * 0.6), aimedAt);
        awardXp(aimedAt === "a" ? "b" : "a", mode === "roast" ? 25 : 15, "burn landed");
        bumpDamage(0.06);
      };

      try {
        if (canned) {
          // Type it out so it still reads as arriving, then voice it.
          setAi({ aiText: "", aiLoading: true });
          const { stinger: said } = await commentate(stinger, async (onText) => {
            for (let i = 4; i <= canned.length; i += 3) {
              if (ctl.signal.aborted) return canned;
              const slice = canned.slice(0, i);
              setAi({ aiText: slice });
              onText(slice);
              await new Promise((r) => setTimeout(r, 8));
            }
            setAi({ aiText: canned });
            onText(canned);
            return canned;
          });
          onSubtitle(said);
          setAi({ aiLoading: false });
          landed(canned);
          return;
        }

        const { stinger: said, spoken } = await commentate(stinger, async (onText) => {
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
        });

        onSubtitle(said);
        setAi({ aiLoading: false });
        landed(spoken);
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setAi({ aiText: "Connection dropped.", aiLoading: false });
        }
      }
    },
    [a, b, activeStat, target, setAi, hurtFeelings, awardXp, bumpDamage, onSubtitle],
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
        {/* ── FIGHT: one button per stat, never duplicated ── */}
        <div>
          <div className="mb-1.5 flex items-baseline gap-2">
            <h3 className="label !text-[10px] !text-bb-bone">Fight · pick a stat</h3>
            <span className="text-[10px] text-bb-steel">
              Both cards&apos; real values, side by side. Winner takes the round.
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

                return (
                  <button
                    key={stat.key}
                    onClick={() => onPlayStat(stat.key)}
                    disabled={!enabled}
                    title={
                      usable
                        ? stat.hint
                        : "battlebots.com has no career record for one of these bots"
                    }
                    className={[
                      "group relative border px-2 py-1.5 text-left transition-all",
                      enabled
                        ? "border-bb-steel hover:border-bb-bone hover:bg-white/10 active:scale-[0.98] cursor-pointer"
                        : "border-bb-steel/40 opacity-45 cursor-not-allowed",
                      thinking && usable ? "scan-line" : "",
                    ].join(" ")}
                  >
                    <span className="label !text-[9px] !tracking-wider">
                      {stat.label}
                    </span>
                    <span className="mt-0.5 flex items-baseline justify-between gap-1">
                      <span
                        className="stencil text-lg tabular-nums"
                        style={{
                          color: leader === "a" ? SIDE.a.color : undefined,
                          opacity: leader === "b" ? 0.55 : 1,
                        }}
                      >
                        {av === null ? "—" : stat.format(av)}
                      </span>
                      <span className="text-[9px] text-bb-steel">
                        {stat.higherWins ? "HI" : "LO"}
                      </span>
                      <span
                        className="stencil text-lg tabular-nums"
                        style={{
                          color: leader === "b" ? SIDE.b.color : undefined,
                          opacity: leader === "a" ? 0.55 : 1,
                        }}
                      >
                        {bv === null ? "—" : stat.format(bv)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── RINGSIDE AI: always in the same place, always reachable ── */}
        <div className="lg:border-l lg:border-bb-steel lg:pl-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <h3 className="label !text-[10px] !text-bb-bone">Ringside AI</h3>
            <div className="flex items-center gap-1">
              <span className="label !text-[9px]">Aim</span>
              <div className="flex border border-bb-steel">
                {(["a", "b"] as const).map((side) => {
                  const bot = side === "a" ? a : b;
                  const on = target === side;
                  return (
                    <button
                      key={side}
                      onClick={() => setTarget(side)}
                      className="display max-w-[6rem] truncate px-2 py-0.5 text-xs transition-colors"
                      style={{
                        background: on ? SIDE[side].color : "transparent",
                        color: on ? "#fff" : "#9aa4b0",
                      }}
                      title={`Point the trash talk and roasts at ${bot.name}`}
                    >
                      {bot.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {ACTIONS.map((action) => (
              <button
                key={action.mode}
                onClick={() => run(action.mode, action.aimed, action.stinger)}
                disabled={aiLoading}
                title={action.blurb}
                className={[
                  "relative border px-2 py-1.5 text-left transition-all",
                  aiMode === action.mode
                    ? "border-bb-red bg-bb-red/20"
                    : "border-bb-steel hover:border-bb-chrome hover:bg-white/5",
                  aiLoading ? "cursor-wait opacity-60" : "cursor-pointer",
                ].join(" ")}
              >
                <span className="display flex items-center gap-1.5 text-lg leading-none">
                  {action.label}
                  {readyModes.includes(action.mode) && (
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400"
                      title="Pre-generated for this matchup — this one is instant"
                    />
                  )}
                </span>
                <span className="mt-0.5 block text-[9px] leading-tight text-bb-chrome">
                  {action.blurb}
                </span>
                {action.aimed && (
                  <span
                    className="absolute right-1 top-1 h-1.5 w-1.5"
                    style={{ background: SIDE[target].color }}
                    title={`Aimed at ${target === "a" ? a.name : b.name}`}
                  />
                )}
              </button>
            ))}
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
            fight logs — it is not allowed to invent a number. Roasts and trash
            talk cost the target real morale.
          </p>
        )}
      </div>
    </section>
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
