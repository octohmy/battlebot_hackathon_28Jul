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
  /** Abbreviation for tight spots — radar axes, narrow columns. */
  short: string;
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
    short: "WIN%",
    hint: "Career wins as a share of all fights",
    higherWins: true,
    unit: "%",
    get: (b) => b.career?.winRate ?? null,
    format: (v) => `${v.toFixed(1)}%`,
  },
  {
    key: "koPct",
    label: "KO Rate",
    short: "KO%",
    hint: "Share of wins that ended in a knockout",
    higherWins: true,
    unit: "%",
    get: (b) => b.career?.koPct ?? null,
    format: (v) => `${v.toFixed(1)}%`,
  },
  {
    key: "fastestKoSecs",
    label: "Fastest KO",
    short: "FASTEST",
    hint: "Quickest knockout on record — lower is deadlier",
    higherWins: false,
    unit: "s",
    get: (b) => b.career?.fastestKoSecs ?? null,
    format: (v) => `${v}s`,
  },
  {
    key: "avgKoTimeSecs",
    label: "Avg KO Time",
    short: "AVG KO",
    hint: "Typical time to finish a fight — lower is deadlier",
    higherWins: false,
    unit: "s",
    get: (b) => b.career?.avgKoTimeSecs ?? null,
    format: (v) => `${v}s`,
  },
  {
    key: "estimatedPoints",
    label: "Career Points",
    short: "CAREER",
    hint: "Lifetime points across all seasons",
    higherWins: true,
    unit: "pts",
    get: (b) => b.career?.estimatedPoints ?? null,
    format: (v) => `${v}`,
  },
  {
    key: "seasonPoints",
    label: "Season Points",
    short: "SEASON",
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

/**
 * Where a bot sits on one stat relative to the whole field, 0→1 with 1 always
 * meaning "better". Orientation matters: on KO *times* lower is deadlier, so
 * the scale is flipped. Returns null when the bot has no value.
 */
export function statPercentile(
  stat: TrumpStat,
  bot: Bot,
  field: Bot[],
): number | null {
  const v = stat.get(bot);
  if (v === null) return null;
  const values = field.map(stat.get).filter((x): x is number => x !== null);
  if (!values.length) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (hi === lo) return 1;
  const t = (v - lo) / (hi - lo);
  return stat.higherWins ? t : 1 - t;
}

export interface RadarAxis {
  key: TrumpKey;
  label: string;
  short: string;
  /** Raw values, for the tooltip. */
  aRaw: number | null;
  bRaw: number | null;
  format: (v: number) => string;
  /** Field-normalised 0→1, higher always better. */
  a: number;
  b: number;
  available: boolean;
}

/** Six-axis comparison of two bots against the rest of the field. */
export function radarAxes(a: Bot, b: Bot, field: Bot[]): RadarAxis[] {
  return TRUMP_STATS.map((stat) => {
    const pa = statPercentile(stat, a, field);
    const pb = statPercentile(stat, b, field);
    return {
      key: stat.key,
      label: stat.label,
      short: stat.short,
      aRaw: stat.get(a),
      bRaw: stat.get(b),
      format: stat.format,
      a: pa ?? 0,
      b: pb ?? 0,
      available: pa !== null && pb !== null,
    };
  });
}

/**
 * The stat a side should play: the biggest field-normalised edge it holds,
 * among stats both bots have and that have not been used yet. Falls back to
 * the least-bad option if it is behind everywhere, because passing is not a
 * legal move.
 */
export function bestStatFor(
  chooser: Bot,
  opponent: Bot,
  field: Bot[],
  used: TrumpKey[] = [],
): TrumpKey | null {
  const candidates = TRUMP_STATS.filter(
    (s) => isTrumpable(s, chooser, opponent) && !used.includes(s.key),
  );
  const pool = candidates.length
    ? candidates
    : TRUMP_STATS.filter((s) => isTrumpable(s, chooser, opponent));
  if (!pool.length) return null;

  let best = pool[0];
  let bestEdge = -Infinity;
  for (const stat of pool) {
    const mine = statPercentile(stat, chooser, field) ?? 0;
    const theirs = statPercentile(stat, opponent, field) ?? 0;
    const edge = mine - theirs;
    if (edge > bestEdge) {
      bestEdge = edge;
      best = stat;
    }
  }
  return best.key;
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
  /**
   * The three weighted contributions that sum to `power`. Exposed so the UI
   * can show the score being built rather than asserting it.
   */
  parts: { season: number; career: number; ko: number };
  /** True when career data is missing and the season record stood in for it. */
  careerImputed: boolean;
}

/** Weights of the composite, in one place so the UI can label them. */
export const POWER_WEIGHTS = [
  { key: "season", label: "Season win rate", weight: 0.5, color: "#e10600" },
  { key: "career", label: "Career win rate", weight: 0.3, color: "#2f8fc9" },
  { key: "ko", label: "Career KO rate", weight: 0.2, color: "#c78410" },
] as const;

/**
 * Composite power score. Deliberately simple and explainable — a judge can ask
 * "how is this computed?" and get a straight answer:
 *   50% season win rate, 30% career win rate, 20% KO rate.
 * Bots without career data fall back to their season record alone, and say so.
 */
export function powerRank(bots: Bot[]): RankedBot[] {
  return bots
    .map((bot) => {
      const played = bot.season.wins + bot.season.losses;
      const seasonWinRate = played ? (bot.season.wins / played) * 100 : 0;
      const careerWinRate = bot.career?.winRate ?? seasonWinRate;
      const koRate = bot.career?.koPct ?? 0;
      const parts = {
        season: seasonWinRate * 0.5,
        career: careerWinRate * 0.3,
        ko: koRate * 0.2,
      };
      const power = parts.season + parts.career + parts.ko;
      return {
        bot,
        power: Math.round(power * 10) / 10,
        seasonWinRate,
        parts,
        careerImputed: !bot.career,
      };
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
