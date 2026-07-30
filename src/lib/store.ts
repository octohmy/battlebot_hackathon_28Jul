"use client";

import { create } from "zustand";
import type { Bot } from "@/lib/bbpl/client";
import {
  resolveTrump,
  severityOf,
  TRUMP_BY_KEY,
  type DuelResult,
  type TrumpKey,
} from "@/lib/scoring";

/**
 * Arena state machine.
 *
 *   select → reveal → turn-intro → choose-stat → resolve → …  → aftermath
 *                        ↑______________________________|
 *
 * A duel is a series of rounds. Initiative alternates: on your turn you pick
 * which stat to fight over, which is what makes the turn order worth
 * dramatising — the choice actually belongs to somebody.
 *
 * Two formats. 1v1 is a straight card duel. 2v2 is tag-team: each side fields
 * two bots, only the active one fights, and a bot whose morale hits zero is
 * stopped and forces its partner in. A side loses when both its bots are out.
 */

export type Phase =
  | "select"
  | "reveal"
  | "turn-intro"
  | "choose-stat"
  | "resolve"
  | "aftermath";

export type Side = "a" | "b";
export type Format = "1v1" | "2v2";

export type AiMode = "taunt" | "analyse" | "predict" | "roast";

export interface RoundLog {
  stat: TrumpKey;
  result: DuelResult;
  winner: Side | null;
  /** Who chose the stat — the whole point of the turn order. */
  chosenBy: Side;
  aBot: string;
  bBot: string;
}

/** Starting morale. A bot at 0 is emotionally knocked out. */
export const MAX_FEELINGS = 100;
/** XP needed per level. */
export const XP_PER_LEVEL = 100;
/** Rounds in a duel before it goes to the judges. */
export const MAX_ROUNDS = 6;

/**
 * What a round is worth, as a pure function of how lopsided it was.
 *
 * Exported rather than inlined into `playStat` because the clash reveal quotes
 * these figures back at the player *as* the round resolves ("that cost 32
 * morale"). A screen that explains the consequence has to be reading the same
 * arithmetic that applied it, or it is just a plausible-looking caption.
 */
export const moraleHit = (severity: number) => Math.round(14 + severity * 26);
export const xpGain = (severity: number) => Math.round(35 + severity * 45);

/**
 * What a landed burn costs its target.
 *
 * Deliberately *not* scaled by length: the AI was told to be short, and paying
 * by the word would quietly reward the rambling four-sentence version we just
 * spent a prompt getting rid of. Instead a burn that cites a real number —
 * the only thing this app can do that a generic insult generator cannot — hits
 * harder. Receipts do damage.
 */
export function burnDamage(text: string, roast: boolean): { amount: number; cited: boolean } {
  const cited = /\d/.test(text);
  return { amount: (roast ? 18 : 10) + (cited ? 6 : 0), cited };
}

/**
 * A transient bit of feedback — floating damage numbers, XP pops, KO stamps.
 * The HUD renders these and they expire on their own.
 */
export interface Pop {
  id: number;
  side: Side;
  text: string;
  kind: "damage" | "xp" | "heal" | "ko" | "level";
}

export interface Team {
  bots: Bot[];
  activeIndex: number;
}

interface ArenaState {
  phase: Phase;
  format: Format;
  teams: Record<Side, Team>;
  /** Whose move it is to choose a stat. */
  turn: Side;
  /** Side B is played by the machine unless this is off. */
  autoOpponent: boolean;
  /** True while the machine is visibly "deciding". */
  thinking: boolean;
  round: number;
  playedRounds: RoundLog[];
  activeStat: TrumpKey | null;
  lastResult: DuelResult | null;
  /** 0→1, drives screen cracks, shake, chromatic aberration. */
  damage: number;
  /** slug → remaining morale. */
  feelings: Record<string, number>;
  /** Cumulative XP per side. */
  xp: Record<Side, number>;
  pops: Pop[];
  aiMode: AiMode | null;
  aiText: string;
  aiLoading: boolean;
  aiTarget: Side | null;
  /**
   * Physical blows landed on each corner, as a monotonic counter.
   *
   * A counter rather than a flag because the portrait needs to distinguish
   * "hit again" from "still hit" — two roasts in a row must be two shoves.
   */
  hits: Record<Side, number>;
  /** The commentary box: a pre-fight call, and a live read of the fight. */
  desk: { call: string; read: string; readLabel: string; loading: boolean };
  muted: boolean;
  /** Set once the user has been told to turn the sound on. */
  soundPrompted: boolean;

  setTeams: (a: Bot[], b: Bot[], format: Format) => void;
  reveal: () => void;
  beginTurn: () => void;
  playStat: (key: TrumpKey) => void;
  nextRound: () => void;
  tagIn: (side: Side, index: number) => void;
  reset: () => void;
  setThinking: (v: boolean) => void;
  bumpDamage: (amount: number) => void;
  hurtFeelings: (slug: string, amount: number, side: Side, label?: string) => void;
  awardXp: (side: Side, amount: number, label?: string) => void;
  pop: (side: Side, text: string, kind: Pop["kind"]) => void;
  dismissPop: (id: number) => void;
  setAi: (
    patch: Partial<Pick<ArenaState, "aiMode" | "aiText" | "aiLoading" | "aiTarget">>,
  ) => void;
  /** Knock a corner's machine sideways. */
  shove: (side: Side) => void;
  setDesk: (patch: Partial<ArenaState["desk"]>) => void;
  toggleMute: () => void;
  markSoundPrompted: () => void;
  setAutoOpponent: (v: boolean) => void;
}

const emptyTeam = (): Team => ({ bots: [], activeIndex: 0 });

const emptyDesk = (): ArenaState["desk"] => ({
  call: "",
  read: "",
  readLabel: "",
  loading: false,
});

let popId = 0;

export const useArena = create<ArenaState>((set, get) => ({
  phase: "select",
  format: "1v1",
  teams: { a: emptyTeam(), b: emptyTeam() },
  turn: "a",
  autoOpponent: true,
  thinking: false,
  round: 1,
  playedRounds: [],
  activeStat: null,
  lastResult: null,
  damage: 0,
  feelings: {},
  xp: { a: 0, b: 0 },
  pops: [],
  aiMode: null,
  aiText: "",
  aiLoading: false,
  aiTarget: null,
  hits: { a: 0, b: 0 },
  desk: emptyDesk(),
  muted: false,
  soundPrompted: false,

  setTeams: (a, b, format) =>
    set({
      teams: { a: { bots: a, activeIndex: 0 }, b: { bots: b, activeIndex: 0 } },
      format,
      phase: "reveal",
      turn: "a",
      round: 1,
      thinking: false,
      playedRounds: [],
      activeStat: null,
      lastResult: null,
      damage: 0,
      feelings: Object.fromEntries(
        [...a, ...b].map((bot) => [bot.slug, MAX_FEELINGS]),
      ),
      xp: { a: 0, b: 0 },
      pops: [],
      aiMode: null,
      aiText: "",
      aiTarget: null,
      hits: { a: 0, b: 0 },
      desk: emptyDesk(),
    }),

  reveal: () => set({ phase: "turn-intro" }),

  beginTurn: () => set({ phase: "choose-stat" }),

  playStat: (key) => {
    const state = get();
    const a = activeBot(state, "a");
    const b = activeBot(state, "b");
    if (!a || !b) return;

    const stat = TRUMP_BY_KEY[key];
    const result = resolveTrump(stat, a, b);
    if (result.outcome === "unavailable") return;

    const winner: Side | null =
      result.outcome === "a" ? "a" : result.outcome === "b" ? "b" : null;

    const feelings = { ...state.feelings };
    const xp = { ...state.xp };
    const pops = [...state.pops];

    if (winner) {
      const loserSide: Side = winner === "a" ? "b" : "a";
      const loser = winner === "a" ? b : a;

      // Morale damage scales with how lopsided the stat was, normalised
      // against the winning value so 90-vs-10 stings more than 51-vs-49.
      const severity = severityOf(result);
      const hit = moraleHit(severity);
      feelings[loser.slug] = Math.max(0, (feelings[loser.slug] ?? MAX_FEELINGS) - hit);

      const gained = xpGain(severity);
      xp[winner] += gained;

      pops.push(
        { id: ++popId, side: loserSide, text: `-${hit} MORALE`, kind: "damage" },
        { id: ++popId, side: winner, text: `+${gained} XP`, kind: "xp" },
      );
      if (feelings[loser.slug] === 0) {
        pops.push({ id: ++popId, side: loserSide, text: "T.K.O.", kind: "ko" });
        xp[winner] += 100;
      }
    }

    const rounds = [
      ...state.playedRounds,
      { stat: key, result, winner, chosenBy: state.turn, aBot: a.slug, bBot: b.slug },
    ];

    set({
      activeStat: key,
      lastResult: result,
      playedRounds: rounds,
      phase: "resolve",
      feelings,
      xp,
      pops,
      thinking: false,
      damage: Math.min(1, state.damage + (winner ? 0.16 : 0.05)),
      // Aftermath is decided on `nextRound` so the resolve beat can play out.
      aiText: "",
      aiMode: null,
    });
  },

  nextRound: () => {
    const state = get();
    const next = { ...state.feelings };
    const teams = { a: { ...state.teams.a }, b: { ...state.teams.b } };
    const pops = [...state.pops];

    // A stopped bot forces its partner in. With nobody left, the corner is done.
    let eliminated: Side | null = null;
    for (const side of ["a", "b"] as Side[]) {
      const team = teams[side];
      const active = team.bots[team.activeIndex];
      if (!active || (next[active.slug] ?? MAX_FEELINGS) > 0) continue;
      const reserve = team.bots.findIndex(
        (bot, i) => i !== team.activeIndex && (next[bot.slug] ?? MAX_FEELINGS) > 0,
      );
      if (reserve >= 0) {
        team.activeIndex = reserve;
        pops.push({
          id: ++popId,
          side,
          text: `${team.bots[reserve].name} TAGS IN`,
          kind: "heal",
        });
      } else {
        eliminated = side;
      }
    }

    const exhausted = state.playedRounds.length >= MAX_ROUNDS;
    const over = eliminated !== null || exhausted;

    set({
      teams,
      pops,
      phase: over ? "aftermath" : "turn-intro",
      // Initiative passes.
      turn: state.turn === "a" ? "b" : "a",
      round: state.round + 1,
      activeStat: null,
      lastResult: null,
      thinking: false,
      damage: over ? Math.max(state.damage, 0.85) : state.damage,
    });
  },

  tagIn: (side, index) => {
    const state = get();
    const team = state.teams[side];
    const bot = team.bots[index];
    if (!bot || index === team.activeIndex) return;
    if ((state.feelings[bot.slug] ?? MAX_FEELINGS) <= 0) return;
    set({
      teams: { ...state.teams, [side]: { ...team, activeIndex: index } },
      pops: [
        ...state.pops,
        { id: ++popId, side, text: `${bot.name} TAGS IN`, kind: "heal" },
      ],
    });
  },

  reset: () =>
    set({
      phase: "select",
      teams: { a: emptyTeam(), b: emptyTeam() },
      turn: "a",
      round: 1,
      thinking: false,
      playedRounds: [],
      activeStat: null,
      lastResult: null,
      damage: 0,
      feelings: {},
      xp: { a: 0, b: 0 },
      pops: [],
      aiMode: null,
      aiText: "",
      aiLoading: false,
      aiTarget: null,
      hits: { a: 0, b: 0 },
      desk: emptyDesk(),
    }),

  setThinking: (v) => set({ thinking: v }),

  bumpDamage: (amount) =>
    set((s) => ({ damage: Math.max(0, Math.min(1, s.damage + amount)) })),

  hurtFeelings: (slug, amount, side, label) =>
    set((s) => {
      const before = s.feelings[slug] ?? MAX_FEELINGS;
      const after = Math.max(0, before - amount);
      const dealt = before - after;
      if (!dealt) return {};
      return {
        feelings: { ...s.feelings, [slug]: after },
        pops: [
          ...s.pops,
          {
            id: ++popId,
            side,
            text: label ? `-${dealt} MORALE · ${label}` : `-${dealt} MORALE`,
            kind: "damage" as const,
          },
        ],
      };
    }),

  awardXp: (side, amount, label) =>
    set((s) => {
      const before = Math.floor(s.xp[side] / XP_PER_LEVEL);
      const total = s.xp[side] + amount;
      const after = Math.floor(total / XP_PER_LEVEL);
      const pops: Pop[] = [
        ...s.pops,
        {
          id: ++popId,
          side,
          text: label ? `+${amount} XP · ${label}` : `+${amount} XP`,
          kind: "xp",
        },
      ];
      if (after > before) {
        pops.push({ id: ++popId, side, text: `LEVEL ${after + 1}`, kind: "level" });
      }
      return { xp: { ...s.xp, [side]: total }, pops };
    }),

  pop: (side, text, kind) =>
    set((s) => ({ pops: [...s.pops, { id: ++popId, side, text, kind }] })),

  dismissPop: (id) => set((s) => ({ pops: s.pops.filter((p) => p.id !== id) })),

  setAi: (patch) => set(patch),

  shove: (side) => set((s) => ({ hits: { ...s.hits, [side]: s.hits[side] + 1 } })),

  setDesk: (patch) => set((s) => ({ desk: { ...s.desk, ...patch } })),

  toggleMute: () => set((s) => ({ muted: !s.muted })),

  markSoundPrompted: () => set({ soundPrompted: true }),

  setAutoOpponent: (v) => set({ autoOpponent: v }),
}));

// ── Selectors ─────────────────────────────────────────────────────────────

interface TeamsHolder {
  teams: Record<Side, Team>;
}

/** The bot currently in the ring for a side. */
export function activeBot(s: TeamsHolder, side: Side): Bot | null {
  const team = s.teams[side];
  return team.bots[team.activeIndex] ?? null;
}

/** The benched partner in 2v2, if there is one. */
export function benchBot(s: TeamsHolder, side: Side): Bot | null {
  const team = s.teams[side];
  return team.bots.find((_, i) => i !== team.activeIndex) ?? null;
}

export function level(xp: number): number {
  return Math.floor(xp / XP_PER_LEVEL) + 1;
}

export function levelProgress(xp: number): number {
  return (xp % XP_PER_LEVEL) / XP_PER_LEVEL;
}

/** Rounds won per side. */
export function scoreboard(rounds: RoundLog[]): Record<Side, number> {
  return {
    a: rounds.filter((r) => r.winner === "a").length,
    b: rounds.filter((r) => r.winner === "b").length,
  };
}

/**
 * The current run of consecutive rounds won, and by whom.
 *
 * Drawn rounds break a streak rather than extending it — a round nobody won is
 * not momentum.
 */
export function streak(rounds: RoundLog[]): { side: Side | null; count: number } {
  const side = rounds[rounds.length - 1]?.winner ?? null;
  if (!side) return { side: null, count: 0 };
  let count = 0;
  for (let i = rounds.length - 1; i >= 0 && rounds[i].winner === side; i--) count++;
  return { side, count };
}

/**
 * Momentum, -1 (blue owns the fight) → +1 (red does).
 *
 * Rounds won say who is ahead; morale says who is *holding up*, and the two
 * come apart all the time — a bot can be level on the cards and visibly going.
 * Blending them is the only reading on screen that answers "who is actually
 * winning this" in one glance, which the pip counters never quite do.
 */
export function momentum(
  rounds: RoundLog[],
  teams: Record<Side, Team>,
  feelings: Record<string, number>,
): number {
  const s = scoreboard(rounds);
  const morale = (side: Side) => {
    const bots = teams[side].bots;
    if (!bots.length) return MAX_FEELINGS;
    return (
      bots.reduce((n, bot) => n + (feelings[bot.slug] ?? MAX_FEELINGS), 0) / bots.length
    );
  };
  const cards = (s.a - s.b) / MAX_ROUNDS;
  const heart = (morale("a") - morale("b")) / MAX_FEELINGS;
  return Math.max(-1, Math.min(1, cards * 0.6 + heart * 0.8));
}

/**
 * Who wins the duel. A side that has lost every bot to morale damage loses
 * outright; otherwise it is decided on rounds won.
 */
export function duelLeader(
  rounds: RoundLog[],
  teams?: Record<Side, Team>,
  feelings?: Record<string, number>,
): Side | "tie" {
  if (teams && feelings) {
    const alive = (side: Side) =>
      teams[side].bots.some((bot) => (feelings[bot.slug] ?? MAX_FEELINGS) > 0);
    const aAlive = alive("a");
    const bAlive = alive("b");
    if (aAlive && !bAlive) return "a";
    if (bAlive && !aAlive) return "b";
  }
  const s = scoreboard(rounds);
  return s.a === s.b ? "tie" : s.a > s.b ? "a" : "b";
}

/**
 * Morale band, used for the HUD label and AI framing.
 *
 * Named the way a commentator would call it, not the way a health bar would:
 * a fighter is not at "40%", it is rattled. "On the ropes" is the one that
 * matters — it is the point where the crowd knows before the scorecard does.
 */
export function moraleState(v: number): { label: string; color: string } {
  if (v > 75) return { label: "Bouncing", color: "#33d17a" };
  if (v > 50) return { label: "Composed", color: "#8bc34a" };
  if (v > 30) return { label: "Rattled", color: "#f5a623" };
  if (v > 0) return { label: "On the ropes", color: "#e10600" };
  return { label: "Stopped", color: "#5a5f66" };
}
