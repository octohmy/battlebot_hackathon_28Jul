import matchesRaw from "@/data/snapshot/matches_wc7.json";

/**
 * Fight-level history, scraped from the World Championship VII match schedule
 * (a published Google Sheet embedded on battlebots.com/match-schedule/).
 *
 * This is the grounding layer that makes the AI trash talk *true* rather than
 * generic: it knows that Bloodsport lost to Copperhead by KO in 35 seconds, and
 * can say so.
 *
 * Caveat worth stating out loud to judges: this is WC VII (2023), a different
 * season from the Pro League 2026 cards. 16 of the 25 Pro League competitors
 * appear in it. Anything sourced from here is labelled as prior-season history,
 * never presented as this season's record.
 *
 * Parse integrity: every one of the 100 matches appears twice (once per bot)
 * with mirrored results, and all 100 pairs reconcile.
 */

export interface Fight {
  bot: string;
  opponent: string;
  episode: number;
  result: "WIN" | "LOSS";
  /** KO = knockout, JD = judges' decision. */
  method: "KO" | "JD";
  /** Fight length in seconds; only recorded for knockouts. */
  timeSecs: number | null;
}

const FIGHTS = matchesRaw as Fight[];

export const SEASON_LABEL = "World Championship VII";

function norm(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const BY_BOT = new Map<string, Fight[]>();
for (const f of FIGHTS) {
  const k = norm(f.bot);
  BY_BOT.set(k, [...(BY_BOT.get(k) ?? []), f]);
}

/** All prior-season fights for a bot, oldest first. */
export function fightsFor(botName: string): Fight[] {
  return [...(BY_BOT.get(norm(botName)) ?? [])].sort((a, b) => a.episode - b.episode);
}

export function hasHistory(botName: string): boolean {
  return BY_BOT.has(norm(botName));
}

/** Any direct meetings between two bots. */
export function headToHead(a: string, b: string): Fight[] {
  return fightsFor(a).filter((f) => norm(f.opponent) === norm(b));
}

export interface FightSummary {
  wins: number;
  losses: number;
  koWins: number;
  koLosses: number;
  /** Fastest knockout this bot delivered, in seconds. */
  fastestKo: number | null;
  /** Quickest this bot was knocked out, in seconds. */
  worstKo: number | null;
  beat: string[];
  lostTo: string[];
}

export function summarize(botName: string): FightSummary | null {
  const fs = fightsFor(botName);
  if (!fs.length) return null;

  const wins = fs.filter((f) => f.result === "WIN");
  const losses = fs.filter((f) => f.result === "LOSS");
  const koWinTimes = wins.filter((f) => f.method === "KO" && f.timeSecs).map((f) => f.timeSecs!);
  const koLossTimes = losses.filter((f) => f.method === "KO" && f.timeSecs).map((f) => f.timeSecs!);

  return {
    wins: wins.length,
    losses: losses.length,
    koWins: wins.filter((f) => f.method === "KO").length,
    koLosses: losses.filter((f) => f.method === "KO").length,
    fastestKo: koWinTimes.length ? Math.min(...koWinTimes) : null,
    worstKo: koLossTimes.length ? Math.min(...koLossTimes) : null,
    beat: wins.map((f) => f.opponent),
    lostTo: losses.map((f) => f.opponent),
  };
}

function mmss(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Renders a bot's fight history as plain lines for an LLM prompt. Kept terse —
 * this goes into every AI call and the model only needs the facts.
 */
export function historyLines(botName: string): string[] {
  return fightsFor(botName).map((f) => {
    const how =
      f.method === "KO"
        ? `by KO${f.timeSecs ? ` in ${mmss(f.timeSecs)}` : ""}`
        : "by judges' decision";
    return `Ep ${f.episode}: ${f.result === "WIN" ? "beat" : "lost to"} ${f.opponent} ${how}`;
  });
}

/** Bots that share an opponent, for "common opponent" framing. */
export function commonOpponents(a: string, b: string): string[] {
  const bOpps = new Set(fightsFor(b).map((f) => norm(f.opponent)));
  return [
    ...new Set(
      fightsFor(a)
        .filter((f) => bOpps.has(norm(f.opponent)))
        .map((f) => f.opponent),
    ),
  ];
}
