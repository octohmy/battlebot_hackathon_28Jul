import type { Bot } from "@/lib/bbpl/client";
import { SEASON_LABEL, summarize } from "@/lib/fights";

/**
 * Everything we actually know about a bot, flattened into labelled readouts.
 *
 * The cards only have room for six trump stats, but the payload behind them is
 * much deeper — twelve career fields, seven season fields, the season list, and
 * a scraped fight log. This is the panel that puts the rest of it on screen, so
 * the depth of the real data is visible rather than implied.
 *
 * Every row carries its own provenance so nothing on screen is unattributed.
 */

export type Origin = "season" | "career" | "fights" | "roster";

export interface Readout {
  label: string;
  value: string;
  /** Present when the figure is missing at source, not zero. */
  missing?: boolean;
  origin: Origin;
  /** Higher is better; used to tint the side that leads. */
  better?: "high" | "low";
  /** Numeric form, for head-to-head comparison. Null when unavailable. */
  n: number | null;
}

const num = (v: number | null | undefined): v is number =>
  v !== null && v !== undefined;

export const ORIGIN_LABELS: Record<Origin, string> = {
  season: "Pro League 2026 standings API",
  career: "robot-stats API (all seasons)",
  fights: `${SEASON_LABEL} fight log (Bright Data scrape)`,
  roster: "Pro League roster page",
};

export const ORIGIN_COLORS: Record<Origin, string> = {
  season: "#2f8fc9",
  career: "#f5a623",
  fights: "#33d17a",
  roster: "#9aa4b0",
};

/** The full readout set for one bot, in display order. */
export function telemetry(bot: Bot): Readout[] {
  const c = bot.career;
  const f = summarize(bot.name);
  const played = bot.season.wins + bot.season.losses;

  const rows: Readout[] = [
    {
      label: "Group",
      value: `${bot.group} · #${bot.rank}`,
      origin: "season",
      n: null,
    },
    {
      label: "Season record",
      value: `${bot.season.wins}W-${bot.season.losses}L`,
      origin: "season",
      better: "high",
      n: played ? bot.season.wins / played : 0,
    },
    {
      label: "Season KO wins",
      value: `${bot.season.koWins}`,
      origin: "season",
      better: "high",
      n: bot.season.koWins,
    },
    {
      label: "Season JD wins",
      value: `${bot.season.jdWins}`,
      origin: "season",
      better: "high",
      n: bot.season.jdWins,
    },
    {
      label: "Season points",
      value: `${bot.season.totalPoints}`,
      origin: "season",
      better: "high",
      n: bot.season.totalPoints,
    },
    {
      label: "Playoffs",
      value: bot.season.droppedOut
        ? "Dropped out"
        : bot.season.advancesToPlayoffs
          ? "Qualified"
          : "In contention",
      origin: "season",
      n: null,
    },
  ];

  if (c) {
    rows.push(
      {
        label: "Career fights",
        value: `${c.total}`,
        origin: "career",
        better: "high",
        n: c.total,
      },
      {
        label: "Career record",
        value: `${c.wins}W-${c.losses}L`,
        origin: "career",
        better: "high",
        n: c.winRate,
      },
      {
        label: "Career win rate",
        value: `${c.winRate}%`,
        origin: "career",
        better: "high",
        n: c.winRate,
      },
      {
        label: "KOs delivered",
        value: `${c.koWins}`,
        origin: "career",
        better: "high",
        n: c.koWins,
      },
      {
        label: "Times KO'd",
        value: `${c.koAgainst}`,
        origin: "career",
        better: "low",
        n: c.koAgainst,
      },
      {
        label: "Judges' wins",
        value: `${c.jdWins}`,
        origin: "career",
        better: "high",
        n: c.jdWins,
      },
      {
        label: "Glass jaw",
        value: num(c.avgKoAgainstSecs)
          ? `${c.avgKoAgainstSecs}s to fold`
          : "Never KO'd",
        origin: "career",
        better: "high",
        n: num(c.avgKoAgainstSecs) ? c.avgKoAgainstSecs : Number.MAX_SAFE_INTEGER,
      },
      {
        label: "Career points",
        value: `${c.estimatedPoints}`,
        origin: "career",
        better: "high",
        n: c.estimatedPoints,
      },
    );
  } else {
    rows.push({
      label: "Career record",
      value: "NO DATA",
      missing: true,
      origin: "career",
      n: null,
    });
  }

  rows.push({
    label: "Seasons on record",
    value: bot.seasons.length ? `${bot.seasons.length}` : "NO DATA",
    missing: !bot.seasons.length,
    origin: "career",
    better: "high",
    n: bot.seasons.length || null,
  });

  if (f) {
    rows.push(
      {
        label: `${SEASON_LABEL} run`,
        value: `${f.wins}W-${f.losses}L`,
        origin: "fights",
        better: "high",
        n: f.wins - f.losses,
      },
      {
        label: "Prior-season KOs",
        value: `${f.koWins} for, ${f.koLosses} against`,
        origin: "fights",
        better: "high",
        n: f.koWins - f.koLosses,
      },
    );
    if (f.fastestKo !== null) {
      rows.push({
        label: "Quickest finish",
        value: `${f.fastestKo}s`,
        origin: "fights",
        better: "low",
        n: f.fastestKo,
      });
    }
  } else {
    rows.push({
      label: `${SEASON_LABEL} run`,
      value: "Not in the log",
      missing: true,
      origin: "fights",
      n: null,
    });
  }

  rows.push(
    { label: "Team", value: bot.teamName ?? "NO DATA", missing: !bot.teamName, origin: "roster", n: null },
    {
      label: "Weapon",
      value: `${bot.weapon.label}${bot.weapon.source === "editorial" ? " *" : ""}`,
      origin: "roster",
      n: null,
    },
  );

  return rows;
}

/**
 * Pairs two bots' readouts by label so the panel can render a single
 * head-to-head column and mark which side leads each line.
 */
export interface TelemetryRow {
  label: string;
  origin: Origin;
  a: Readout | null;
  b: Readout | null;
  leader: "a" | "b" | null;
}

export function compareTelemetry(a: Bot, b: Bot): TelemetryRow[] {
  const left = telemetry(a);
  const right = telemetry(b);
  const labels = [...new Set([...left, ...right].map((r) => r.label))];

  return labels.map((label) => {
    const ra = left.find((r) => r.label === label) ?? null;
    const rb = right.find((r) => r.label === label) ?? null;
    const better = ra?.better ?? rb?.better;

    let leader: "a" | "b" | null = null;
    if (better && ra?.n !== null && ra?.n !== undefined && rb?.n !== null && rb?.n !== undefined) {
      if (ra.n !== rb.n) {
        const aLeads = better === "high" ? ra.n > rb.n : ra.n < rb.n;
        leader = aLeads ? "a" : "b";
      }
    }

    return { label, origin: (ra ?? rb)!.origin, a: ra, b: rb, leader };
  });
}

/** One-line summary of how much real data is on screen, for the HUD. */
export function dataDepth(bots: Bot[]): { fields: number; fights: number } {
  let fields = 0;
  let fights = 0;
  for (const bot of bots) {
    fields += telemetry(bot).filter((r) => !r.missing).length;
    fights += summarize(bot.name) ? summarize(bot.name)!.wins + summarize(bot.name)!.losses : 0;
  }
  return { fields, fights };
}
