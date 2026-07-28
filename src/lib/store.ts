"use client";

import { create } from "zustand";
import type { Bot } from "@/lib/bbpl/client";
import {
  resolveTrump,
  TRUMP_BY_KEY,
  type DuelResult,
  type TrumpKey,
} from "@/lib/scoring";

/**
 * Arena state machine.
 *
 *   select → reveal → choose-stat → resolve → (choose-stat | aftermath)
 *
 * A duel is best-of: each trumped stat is a round, damage and hurt feelings
 * accumulate across rounds until one bot's emotional HP hits zero.
 */

export type Phase = "select" | "reveal" | "choose-stat" | "resolve" | "aftermath";

export type AiMode = "taunt" | "analyse" | "predict" | "roast";

export interface RoundLog {
  stat: TrumpKey;
  result: DuelResult;
  winner: "a" | "b" | null;
}

/** Starting emotional HP. A bot at 0 is emotionally knocked out. */
export const MAX_FEELINGS = 100;

interface ArenaState {
  phase: Phase;
  botA: Bot | null;
  botB: Bot | null;
  /** Which side the human is playing. Affects framing of AI copy. */
  playedRounds: RoundLog[];
  activeStat: TrumpKey | null;
  lastResult: DuelResult | null;
  /** 0→1, drives screen cracks, shake, chromatic aberration. */
  damage: number;
  /** slug → remaining emotional HP. */
  feelings: Record<string, number>;
  aiMode: AiMode | null;
  aiText: string;
  aiLoading: boolean;
  aiTarget: "a" | "b" | null;
  muted: boolean;

  setBots: (a: Bot, b: Bot) => void;
  reveal: () => void;
  playStat: (key: TrumpKey) => void;
  nextRound: () => void;
  reset: () => void;
  bumpDamage: (amount: number) => void;
  hurtFeelings: (slug: string, amount: number) => void;
  setAi: (patch: Partial<Pick<ArenaState, "aiMode" | "aiText" | "aiLoading" | "aiTarget">>) => void;
  toggleMute: () => void;
}

export const useArena = create<ArenaState>((set, get) => ({
  phase: "select",
  botA: null,
  botB: null,
  playedRounds: [],
  activeStat: null,
  lastResult: null,
  damage: 0,
  feelings: {},
  aiMode: null,
  aiText: "",
  aiLoading: false,
  aiTarget: null,
  muted: false,

  setBots: (a, b) =>
    set({
      botA: a,
      botB: b,
      phase: "reveal",
      playedRounds: [],
      activeStat: null,
      lastResult: null,
      damage: 0,
      feelings: { [a.slug]: MAX_FEELINGS, [b.slug]: MAX_FEELINGS },
      aiMode: null,
      aiText: "",
      aiTarget: null,
    }),

  reveal: () => set({ phase: "choose-stat" }),

  playStat: (key) => {
    const { botA, botB, playedRounds, damage, feelings } = get();
    if (!botA || !botB) return;

    const stat = TRUMP_BY_KEY[key];
    const result = resolveTrump(stat, botA, botB);
    if (result.outcome === "unavailable") return;

    const winner: "a" | "b" | null =
      result.outcome === "a" ? "a" : result.outcome === "b" ? "b" : null;

    // Loser takes emotional damage scaled by how lopsided the stat was.
    // Normalized against the winning value so a 90%-vs-10% gap stings more
    // than 51%-vs-49%.
    const next = { ...feelings };
    if (winner) {
      const loser = winner === "a" ? botB : botA;
      const hi = Math.max(result.aValue ?? 0, result.bValue ?? 0) || 1;
      const severity = Math.min(1, result.margin / hi);
      const hit = Math.round(14 + severity * 26);
      next[loser.slug] = Math.max(0, (next[loser.slug] ?? MAX_FEELINGS) - hit);
    }

    const rounds = [...playedRounds, { stat: key, result, winner }];
    const anyKo = Object.values(next).some((v) => v <= 0);

    set({
      activeStat: key,
      lastResult: result,
      playedRounds: rounds,
      phase: "resolve",
      feelings: next,
      damage: Math.min(1, damage + (winner ? 0.18 : 0.06)),
      // Aftermath is decided on `nextRound` so the resolve beat can play out.
      aiText: "",
      aiMode: null,
    });

    if (anyKo) {
      // Let the resolve animation land, then hard-cut to aftermath.
      setTimeout(() => {
        if (get().phase === "resolve") set({ phase: "aftermath", damage: 1 });
      }, 1600);
    }
  },

  nextRound: () => {
    const { playedRounds, feelings } = get();
    const ko = Object.values(feelings).some((v) => v <= 0);
    const exhausted = playedRounds.length >= 6;
    set({
      phase: ko || exhausted ? "aftermath" : "choose-stat",
      activeStat: null,
      lastResult: null,
    });
  },

  reset: () =>
    set({
      phase: "select",
      botA: null,
      botB: null,
      playedRounds: [],
      activeStat: null,
      lastResult: null,
      damage: 0,
      feelings: {},
      aiMode: null,
      aiText: "",
      aiLoading: false,
      aiTarget: null,
    }),

  bumpDamage: (amount) =>
    set((s) => ({ damage: Math.max(0, Math.min(1, s.damage + amount)) })),

  hurtFeelings: (slug, amount) =>
    set((s) => ({
      feelings: {
        ...s.feelings,
        [slug]: Math.max(0, (s.feelings[slug] ?? MAX_FEELINGS) - amount),
      },
    })),

  setAi: (patch) => set(patch),

  toggleMute: () => set((s) => ({ muted: !s.muted })),
}));

/** Overall duel leader, used for aftermath copy. */
export function duelLeader(rounds: RoundLog[]): "a" | "b" | "tie" {
  const a = rounds.filter((r) => r.winner === "a").length;
  const b = rounds.filter((r) => r.winner === "b").length;
  return a === b ? "tie" : a > b ? "a" : "b";
}
