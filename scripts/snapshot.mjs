#!/usr/bin/env node
/**
 * Refreshes the committed API snapshot.
 *
 *   npm run snapshot
 *
 * battlebots.com takes ~5s per request, so pulling all 31 endpoints live on
 * every page render is not viable — the app serves this snapshot instead and
 * this script is how it gets refreshed. Run it whenever you want fresh data
 * (and at the hackathon once the official API is handed out).
 *
 * Override the host with BBPL_BASE, add auth with BBPL_TOKEN.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE = process.env.BBPL_BASE ?? "https://battlebots.com/wp-json/bbpl/v1";
const TOKEN = process.env.BBPL_TOKEN;
const GROUPS = ["A", "B", "C", "D", "E", "F"];
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "snapshot");

const headers = {
  "User-Agent": "Mozilla/5.0 (compatible; RedCornerBlueBot/1.0)",
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

async function getJson(path, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`${BASE}${path}`, { headers });
      if (res.ok) return await res.json();
      // 400 is a permanent "unknown slug" — no point retrying.
      if (res.status === 400) return null;
    } catch {
      /* network blip — retry */
    }
    await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
  return null;
}

console.log(`Pulling from ${BASE}\n`);

// ── Standings ─────────────────────────────────────────────────────────────
const groups = [];
for (const g of GROUPS) {
  const raw = await getJson(`/standings?group=${g}`);
  const grp = raw?.data?.groups?.find((x) => x.group === g) ?? raw?.data?.groups?.[0];
  if (!grp) {
    console.error(`  group ${g}: FAILED — keeping existing snapshot, aborting.`);
    process.exit(1);
  }
  groups.push(grp);
  console.log(`  group ${g}: ${grp.teams.length} teams`);
}

const teams = [...new Map(groups.flatMap((g) => g.teams).map((t) => [t.slug, t])).values()];
console.log(`\n${teams.length} unique bots\n`);

// ── Career stats ──────────────────────────────────────────────────────────
const robots = {};
const missing = [];
for (const t of teams) {
  const raw = await getJson(`/robot-stats?slug=${t.slug}`);
  if (raw?.data) {
    robots[t.slug] = raw.data;
    console.log(`  ${t.slug.padEnd(16)} ok`);
  } else {
    missing.push(t.slug);
    console.log(`  ${t.slug.padEnd(16)} NO CAREER DATA`);
  }
}

const fetchedAt = new Date().toISOString();
writeFileSync(
  join(OUT, "standings.json"),
  JSON.stringify({ season: "Pro League 2026", fetchedAt, groups }, null, 2),
);
writeFileSync(join(OUT, "robots.json"), JSON.stringify(robots, null, 2));

console.log(
  `\nWrote ${Object.keys(robots).length}/${teams.length} career records at ${fetchedAt}`,
);
if (missing.length) console.log(`Missing (upstream): ${missing.join(", ")}`);
