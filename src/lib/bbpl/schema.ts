import { z } from "zod";

/**
 * Schemas mirror the live BattleBots Pro League API exactly:
 *   GET /wp-json/bbpl/v1/standings?group=A..F
 *   GET /wp-json/bbpl/v1/robot-stats?slug=<slug>
 *
 * Everything is validated on the way in, so a shape change at the event
 * surfaces as a clear error instead of `undefined` leaking into a card.
 */

export const StandingsTeamSchema = z.object({
  rank: z.number(),
  name: z.string(),
  slug: z.string(),
  group: z.string(),
  totalPoints: z.number(),
  wins: z.number(),
  losses: z.number(),
  koWins: z.number(),
  jdWins: z.number(),
  advancesToPlayoffs: z.boolean(),
  tiebreaker: z.string().nullable(),
  droppedOut: z.boolean(),
});

export const StandingsGroupSchema = z.object({
  group: z.string(),
  teams: z.array(StandingsTeamSchema),
});

export const StandingsSchema = z.object({
  season: z.string(),
  groups: z.array(StandingsGroupSchema),
});

/**
 * Deep career stats. Absent entirely for a few bots — see `client.ts`.
 *
 * The KO-derived fields are nullable because the API returns null when the
 * underlying count is zero: Golden Fury has never been knocked out, so it has
 * no `avgKoAgainstSecs`. Typing these as plain numbers made validation fail for
 * that bot and silently drop it to the snapshot, so nullability is load-bearing.
 */
export const RobotStatsSchema = z.object({
  wins: z.number(),
  losses: z.number(),
  total: z.number(),
  winRate: z.number(),
  koWins: z.number(),
  jdWins: z.number(),
  koPct: z.number().nullable(),
  koAgainst: z.number(),
  avgKoTimeSecs: z.number().nullable(),
  fastestKoSecs: z.number().nullable(),
  avgKoAgainstSecs: z.number().nullable(),
  estimatedPoints: z.number(),
});

export const RobotSchema = z.object({
  slug: z.string(),
  name: z.string(),
  seasons: z.array(z.string()),
  stats: RobotStatsSchema,
});

export type StandingsTeam = z.infer<typeof StandingsTeamSchema>;
export type StandingsGroup = z.infer<typeof StandingsGroupSchema>;
export type Standings = z.infer<typeof StandingsSchema>;
export type RobotStats = z.infer<typeof RobotStatsSchema>;
export type Robot = z.infer<typeof RobotSchema>;

/** Roster metadata scraped from the Pro League page (images, team, country). */
export const RosterEntrySchema = z.object({
  name: z.string(),
  pageSlug: z.string(),
  image: z.string(),
  country: z.string().nullable(),
  teamName: z.string().nullable(),
  teamPhoto: z.string().nullable(),
  badge: z.string().nullable(),
});
export type RosterEntry = z.infer<typeof RosterEntrySchema>;
