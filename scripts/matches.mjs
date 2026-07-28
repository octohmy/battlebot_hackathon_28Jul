#!/usr/bin/env node
/**
 * Scrapes fight-by-fight match history via the Bright Data Scraping Browser.
 *
 *   npm run matches
 *
 * battlebots.com/match-schedule/ renders nothing useful server-side: a plain
 * fetch of the HTML contains zero bot names (verified). The schedule is a Google
 * Sheet embedded in a cross-origin iframe, drawn client-side. So this needs a
 * real browser that executes JavaScript and can reach into that frame — which is
 * exactly what the Bright Data Scraping Browser provides, and it is the approach
 * Bright Data demonstrated at the hack night.
 *
 * Output: src/data/snapshot/matches_wc7.json — 100 matches, each recorded from
 * both bots' rows. The script asserts that every pairing reconciles between the
 * two, so a layout change upstream fails loudly instead of writing bad data.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src/data/snapshot/matches_wc7.json");
const URL = "https://battlebots.com/match-schedule/";

for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
}

const WS = process.env.BRIGHTDATA_BROWSER_WS;
if (!WS) {
  console.error("BRIGHTDATA_BROWSER_WS is not set in .env.local");
  process.exit(1);
}

console.log("Connecting to Bright Data Scraping Browser...");
const browser = await puppeteer.connect({ browserWSEndpoint: WS });
const page = await browser.newPage();

console.log(`Loading ${URL} ...`);
await page.goto(URL, { waitUntil: "networkidle2", timeout: 120_000 });
// The embedded sheet paints after the parent settles.
await new Promise((r) => setTimeout(r, 7000));

/** The schedule grid lives in the first Google Sheets iframe. */
const frame = page
  .frames()
  .find((f) => f.url().includes("docs.google.com/spreadsheets"));

if (!frame) {
  console.error("Could not find the embedded schedule frame. Layout may have changed.");
  await browser.close().catch(() => {});
  process.exit(1);
}

const grid = await frame.evaluate(() =>
  [...document.querySelectorAll("tr")].map((r) =>
    [...r.querySelectorAll("td")].map((c) => c.innerText.trim()),
  ),
);
await browser.close().catch(() => {});

console.log(`Extracted ${grid.length} rows from the embedded sheet.\n`);

// ── Parse ─────────────────────────────────────────────────────────────────
//
// Layout is two rows per bot: an upper row listing that bot's four opponents,
// and a lower row holding the bot's name plus its four results.
//
// The two rows do NOT share column indices — the rendered table collapses empty
// cells via colspan in the results row but not the opponents row, so opponents
// land at 4/6/8/10 while results land at 2/3/4/5. Zipping the two *ordered*
// lists by position is therefore the only stable join. (The CSV export of the
// same sheet does align by index; this does not.)

/** A "3 - 1" style win-loss record, which is not an opponent name. */
const isRecord = (s) => /^\d+\s*-\s*\d+$/.test(s);

const matches = [];
for (let i = 0; i < grid.length; i++) {
  const row = grid[i];

  const results = row.map((c) => c.trim()).filter((c) => c.startsWith("EP "));
  if (!results.length) continue;

  // Bot name is the first non-empty cell that isn't itself a result or record.
  const name = row
    .map((c) => c.trim())
    .find((c) => c && !c.startsWith("EP ") && !isRecord(c));
  if (!name || name === "ROBOTS") continue;

  const opponents = (grid[i - 1] ?? [])
    .map((c) => c.trim())
    .filter((c) => c && !isRecord(c) && c !== name);

  results.forEach((cell, k) => {
    const opponent = opponents[k];
    const m = cell.match(/EP (\d+)\s*-\s*(WIN|LOSS)\s*(KO|JD)?\s*([\d:]+)?/);
    if (!m || !opponent) return;

    const [, episode, result, method, time] = m;
    let timeSecs = null;
    if (time?.includes(":")) {
      const [mm, ss] = time.split(":");
      timeSecs = Number(mm) * 60 + Number(ss);
    }
    matches.push({
      bot: name,
      opponent,
      episode: Number(episode),
      result,
      method: method || "JD",
      timeSecs,
    });
  });
}

// ── Verify ────────────────────────────────────────────────────────────────
// Each match should appear twice — once from each bot's row.

const pairs = new Map();
for (const m of matches) {
  const key = [m.bot, m.opponent].sort().join("|") + `|${m.episode}`;
  pairs.set(key, (pairs.get(key) ?? 0) + 1);
}
const confirmed = [...pairs.values()].filter((n) => n === 2).length;
const selfRefs = matches.filter((m) => m.bot === m.opponent).length;

console.log(`${matches.length} match records, ${pairs.size} unique pairings`);
console.log(`  mutually confirmed: ${confirmed}/${pairs.size}`);
console.log(`  self-references:    ${selfRefs}`);

// A minimum record count is load-bearing: an earlier version only checked the
// confirmation *ratio*, and a zero-record parse sailed through (0 < 0 is false)
// and wiped the snapshot.
const MIN_RECORDS = 150;

if (matches.length < MIN_RECORDS) {
  console.error(
    `\nOnly ${matches.length} records (expected >= ${MIN_RECORDS}) — refusing to overwrite the snapshot.`,
  );
  process.exit(1);
}
if (selfRefs > 0 || confirmed < pairs.size * 0.9) {
  console.error("\nParse looks wrong — refusing to overwrite the snapshot.");
  process.exit(1);
}

// Report drift against what is already committed.
try {
  const prev = JSON.parse(readFileSync(OUT, "utf8"));
  if (prev.length !== matches.length) {
    console.log(`\n  note: record count changed ${prev.length} -> ${matches.length}`);
  } else {
    console.log("\n  identical record count to the committed snapshot");
  }
} catch {
  /* first run */
}

writeFileSync(OUT, JSON.stringify(matches, null, 1));
console.log(`\nWrote ${OUT}`);
