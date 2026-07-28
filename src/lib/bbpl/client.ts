import "server-only";

import { cache } from "react";
import rosterSnapshot from "@/data/snapshot/roster.json";
import robotsSnapshot from "@/data/snapshot/robots.json";
import standingsSnapshot from "@/data/snapshot/standings.json";
import { weaponFor, type WeaponInfo } from "@/lib/weapons";
import {
  RobotSchema,
  StandingsSchema,
  type Robot,
  type RosterEntry,
  type Standings,
  type StandingsTeam,
} from "./schema";

/**
 * Snapshot-first data layer.
 *
 * Measured: battlebots.com takes ~5s for a *single* request, and the full
 * roster needs 31 of them. Fetching live on render meant a 7s page load, so the
 * committed snapshot is the default source and live fetching is opt-in:
 *
 *   npm run snapshot     refresh the committed data (do this at the event)
 *   BBPL_LIVE=1          fetch live on render instead, for showing judges the
 *                        real integration working end to end
 *
 * Either way the app never blocks on a slow or dead API — live mode still falls
 * back to the snapshot per-request. A demo that dies on stage scores zero.
 *
 * Swap `BBPL_BASE` (and add `BBPL_TOKEN`) if the hackathon hands out a different
 * host or an authenticated endpoint — nothing above this file changes.
 */

const BASE = process.env.BBPL_BASE ?? "https://battlebots.com/wp-json/bbpl/v1";
const TOKEN = process.env.BBPL_TOKEN;
const LIVE = process.env.BBPL_LIVE === "1";
const GROUPS = ["A", "B", "C", "D", "E", "F"] as const;

/** Per-request budget. Better a snapshot card than a spinner on stage. */
const TIMEOUT_MS = Number(process.env.BBPL_TIMEOUT_MS ?? 3500);

export type DataSource = "live" | "snapshot";

async function getJson<T>(path: string): Promise<T | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, {
      signal: ctl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; WreckedArena/1.0)",
        ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Normalizes a display name to the slug namespace used by the stats endpoint. */
export function toStatsSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ── Standings ─────────────────────────────────────────────────────────────

export async function fetchStandings(): Promise<{
  data: Standings;
  source: DataSource;
}> {
  if (!LIVE) return { data: standingsSnapshot as Standings, source: "snapshot" };

  const groups = await Promise.all(
    GROUPS.map(async (g) => {
      const raw = await getJson<{ data: Standings }>(`/standings?group=${g}`);
      const parsed = StandingsSchema.safeParse(raw?.data);
      if (!parsed.success) return null;
      return parsed.data.groups.find((x) => x.group === g) ?? parsed.data.groups[0];
    }),
  );

  if (groups.every((g) => g !== null)) {
    return {
      data: { season: "Pro League 2026", groups: groups as Standings["groups"] },
      source: "live",
    };
  }
  return { data: standingsSnapshot as Standings, source: "snapshot" };
}

// ── The merged model the whole app renders from ───────────────────────────

export interface Bot {
  slug: string;
  name: string;
  group: string;
  rank: number;
  image: string;
  country: string | null;
  teamName: string | null;
  weapon: WeaponInfo;
  /** True for the three non-competing alternates. */
  isAlternate: boolean;
  /** Season record, always present (comes from standings). */
  season: {
    wins: number;
    losses: number;
    koWins: number;
    jdWins: number;
    totalPoints: number;
    advancesToPlayoffs: boolean;
    droppedOut: boolean;
  };
  /**
   * Career stats. `null` where battlebots.com has no record — currently
   * Calypso (unknown slug) and Death Roll (upstream 502). Cards must handle
   * this rather than rendering NaN; see `isTrumpable` in scoring.ts.
   */
  career: Robot["stats"] | null;
  seasons: string[];
}

const roster = rosterSnapshot as RosterEntry[];
const robotsSnap = robotsSnapshot as Record<string, Robot>;

/** Roster metadata is static site content, so it always comes from snapshot. */
function metaFor(name: string) {
  const slug = toStatsSlug(name);
  const entry =
    roster.find((r) => toStatsSlug(r.name) === slug) ??
    roster.find((r) => r.name.toLowerCase() === name.toLowerCase());
  return {
    image: `/bots/${slug}.webp`,
    country: entry?.country ?? null,
    teamName: entry?.teamName ?? null,
    isAlternate: entry?.badge === "ALTERNATE",
  };
}

async function fetchCareer(slug: string): Promise<Robot["stats"] | null> {
  const fallback = robotsSnap[slug]?.stats ?? null;
  if (!LIVE) return fallback;
  const raw = await getJson<{ data: Robot }>(`/robot-stats?slug=${slug}`);
  const parsed = RobotSchema.safeParse(raw?.data);
  return parsed.success ? parsed.data.stats : fallback;
}

/**
 * Deduped per request render — `/` and `/arena` both call this, and without
 * `cache()` live mode would double every fetch.
 */
export const getBots = cache(async function getBots(): Promise<{
  bots: Bot[];
  source: DataSource;
}> {
  const { data: standings, source } = await fetchStandings();

  const teams: StandingsTeam[] = standings.groups.flatMap((g) =>
    g.teams.map((t) => ({ ...t, group: g.group })),
  );

  const bots = await Promise.all(
    teams.map(async (t): Promise<Bot> => {
      const meta = metaFor(t.name);
      return {
        slug: t.slug,
        name: t.name,
        group: t.group,
        rank: t.rank,
        ...meta,
        weapon: weaponFor(t.slug),
        season: {
          wins: t.wins,
          losses: t.losses,
          koWins: t.koWins,
          jdWins: t.jdWins,
          totalPoints: t.totalPoints,
          advancesToPlayoffs: t.advancesToPlayoffs,
          droppedOut: t.droppedOut,
        },
        career: await fetchCareer(t.slug),
        seasons: robotsSnap[t.slug]?.seasons ?? [],
      };
    }),
  );

  // Dedupe: a bot can appear in more than one group payload.
  const unique = [...new Map(bots.map((b) => [b.slug, b])).values()];
  return { bots: unique, source };
});

/** When the committed snapshot was last refreshed, for the UI badge. */
export function snapshotFetchedAt(): string | null {
  return (standingsSnapshot as { fetchedAt?: string }).fetchedAt ?? null;
}

export async function getBot(slug: string): Promise<Bot | null> {
  const { bots } = await getBots();
  return bots.find((b) => b.slug === slug) ?? null;
}
