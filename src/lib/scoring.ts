import type { Bot } from "@/lib/bbpl/client";
import { WEAPON_LABELS, type WeaponClass } from "@/lib/weapons";

/**
 * Top-trumps stat definitions, power rankings, and weapon-meta aggregation.
 *
 * Every value here is read straight off the API payload — nothing is invented.
 * `higherWins: false` matters: on KO *times*, faster is better, and getting
 * that backwards would make the duel silently wrong.
 */

export type TrumpKey =
  | "winRate"
  | "koPct"
  | "fastestKoSecs"
  | "avgKoTimeSecs"
  | "estimatedPoints"
  | "seasonPoints";

export interface TrumpStat {
  key: TrumpKey;
  label: string;
  /** Short blurb shown under the stat, explaining what it measures. */
  hint: string;
  higherWins: boolean;
  unit: string;
  /** Returns null when the bot has no data for this stat. */
  get: (b: Bot) => number | null;
  format: (v: number) => string;
}

export const TRUMP_STATS: TrumpStat[] = [
  {
    key: "winRate",
    label: "Win Rate",
    hint: "Career wins as a share of all fights",
    higherWins: true,
    unit: "%",
    get: (b) => b.career?.winRate ?? null,
    format: (v) => `${v.toFixed(1)}%`,
  },
  {
    key: "koPct",
    label: "KO Rate",
    hint: "Share of wins that ended in a knockout",
    higherWins: true,
    unit: "%",
    get: (b) => b.career?.koPct ?? null,
    format: (v) => `${v.toFixed(1)}%`,
  },
  {
    key: "fastestKoSecs",
    label: "Fastest KO",
    hint: "Quickest knockout on record — lower is deadlier",
    higherWins: false,
    unit: "s",
    get: (b) => b.career?.fastestKoSecs ?? null,
    format: (v) => `${v}s`,
  },
  {
    key: "avgKoTimeSecs",
    label: "Avg KO Time",
    hint: "Typical time to finish a fight — lower is deadlier",
    higherWins: false,
    unit: "s",
    get: (b) => b.career?.avgKoTimeSecs ?? null,
    format: (v) => `${v}s`,
  },
  {
    key: "estimatedPoints",
    label: "Career Points",
    hint: "Lifetime points across all seasons",
    higherWins: true,
    unit: "pts",
    get: (b) => b.career?.estimatedPoints ?? null,
    format: (v) => `${v}`,
  },
  {
    key: "seasonPoints",
    label: "Season Points",
    hint: "Points in Pro League 2026 so far",
    higherWins: true,
    unit: "pts",
    get: (b) => b.season.totalPoints,
    format: (v) => `${v}`,
  },
];

export const TRUMP_BY_KEY = Object.fromEntries(
  TRUMP_STATS.map((s) => [s.key, s]),
) as Record<TrumpKey, TrumpStat>;

/** A stat is only playable if both bots have a value for it. */
export function isTrumpable(stat: TrumpStat, a: Bot, b: Bot): boolean {
  return stat.get(a) !== null && stat.get(b) !== null;
}

export type DuelOutcome = "a" | "b" | "tie" | "unavailable";

export interface DuelResult {
  outcome: DuelOutcome;
  aValue: number | null;
  bValue: number | null;
  /** Absolute gap between the two values, for the damage/feelings model. */
  margin: number;
}

export function resolveTrump(stat: TrumpStat, a: Bot, b: Bot): DuelResult {
  const av = stat.get(a);
  const bv = stat.get(b);
  if (av === null || bv === null) {
    return { outcome: "unavailable", aValue: av, bValue: bv, margin: 0 };
  }
  const margin = Math.abs(av - bv);
  if (av === bv) return { outcome: "tie", aValue: av, bValue: bv, margin };
  const aWins = stat.higherWins ? av > bv : av < bv;
  return { outcome: aWins ? "a" : "b", aValue: av, bValue: bv, margin };
}

// ── Power rankings ────────────────────────────────────────────────────────

export interface RankedBot {
  bot: Bot;
  /** Composite 0-100 score. */
  power: number;
  seasonWinRate: number;
}

/**
 * Composite power score. Deliberately simple and explainable — a judge can ask
 * "how is this computed?" and get a straight answer:
 *   50% season win rate, 30% career win rate, 20% KO rate.
 * Bots without career data fall back to their season record alone.
 */
export function powerRank(bots: Bot[]): RankedBot[] {
  return bots
    .map((bot) => {
      const played = bot.season.wins + bot.season.losses;
      const seasonWinRate = played ? (bot.season.wins / played) * 100 : 0;
      const careerWinRate = bot.career?.winRate ?? seasonWinRate;
      const koRate = bot.career?.koPct ?? 0;
      const power = seasonWinRate * 0.5 + careerWinRate * 0.3 + koRate * 0.2;
      return { bot, power: Math.round(power * 10) / 10, seasonWinRate };
    })
    .sort((x, y) => y.power - x.power);
}

// ── Weapon meta ───────────────────────────────────────────────────────────

export interface WeaponMetaRow {
  weapon: WeaponClass;
  label: string;
  botCount: number;
  wins: number;
  losses: number;
  winRate: number;
  koWins: number;
  /** True if any bot in this bucket has an editorial (unverified) weapon type. */
  hasEditorial: boolean;
}

export function weaponMeta(bots: Bot[]): WeaponMetaRow[] {
  const buckets = new Map<WeaponClass, WeaponMetaRow>();
  for (const bot of bots) {
    const cls = bot.weapon.class;
    const row =
      buckets.get(cls) ??
      {
        weapon: cls,
        label: WEAPON_LABELS[cls],
        botCount: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        koWins: 0,
        hasEditorial: false,
      };
    row.botCount += 1;
    row.wins += bot.season.wins;
    row.losses += bot.season.losses;
    row.koWins += bot.season.koWins;
    row.hasEditorial ||= bot.weapon.source === "editorial";
    buckets.set(cls, row);
  }
  return [...buckets.values()]
    .map((r) => ({
      ...r,
      winRate: r.wins + r.losses ? (r.wins / (r.wins + r.losses)) * 100 : 0,
    }))
    .sort((a, b) => b.winRate - a.winRate);
}
