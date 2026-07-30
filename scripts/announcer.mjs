#!/usr/bin/env node
/**
 * Builds the ring-announcer line bank.
 *
 *   node scripts/announcer.mjs --dry     cost estimate + generated text, no TTS
 *   node scripts/announcer.mjs           generate audio (spends ElevenLabs quota)
 *   node scripts/announcer.mjs --only-connectives
 *
 * Why a *bank* and not whole sentences: the ElevenLabs free tier has ~7.5k
 * characters left, and voicing every bot x every phrase would need far more.
 * Instead we voice each bot's NAME once, a few factual NUGGETS per bot, and a
 * set of reusable CONNECTIVES. The arena concatenates
 *   [connective] + [name A] + [nugget A] + [versus] + [name B] + [nugget B]
 * through Web Audio, giving hundreds of distinct, bot-specific, factually true
 * call-outs from a few hundred characters — and it works offline with zero
 * latency during the demo.
 *
 * Nugget text is written by the LLM from the bot's real stat block and is
 * spot-checkable in the manifest.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "audio", "announcer");
const DRY = process.argv.includes("--dry");
const ONLY_CONNECTIVES = process.argv.includes("--only-connectives");

// .env.local is not auto-loaded in a bare node script.
for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const OR_KEY = process.env.OPENROUTER_API_KEY;
const EL_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE = process.env.ELEVENLABS_VOICE_ID;
const MODEL = process.env.OPENROUTER_MODEL ?? "google/gemini-3.5-flash-lite";

const standings = JSON.parse(readFileSync(join(ROOT, "src/data/snapshot/standings.json"), "utf8"));
const robots = JSON.parse(readFileSync(join(ROOT, "src/data/snapshot/robots.json"), "utf8"));
const roster = JSON.parse(readFileSync(join(ROOT, "src/data/snapshot/roster.json"), "utf8"));
const matches = JSON.parse(readFileSync(join(ROOT, "src/data/snapshot/matches_wc7.json"), "utf8"));

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const altSlugs = new Set(roster.filter((r) => r.badge === "ALTERNATE").map((r) => slugify(r.name)));

const bots = [...new Map(standings.groups.flatMap((g) => g.teams).map((t) => [t.slug, t])).values()]
  .filter((t) => !altSlugs.has(t.slug));

/** Reusable glue, voiced once and reused across every matchup. */
const CONNECTIVES = {
  intro_1: "Ladies and gentlemen, welcome to the BattleBox!",
  intro_2: "Our next match is about to begin!",
  intro_3: "This is the one you have been waiting for!",
  in_red: "In the red corner,",
  in_blue: "And in the blue corner,",
  versus: "versus",
  fight: "Three! Two! One! Activate!",
  ko: "Knockout! It is all over!",
  jd: "We are going to the judges!",
  upset: "What an upset!",
  brutal: "Oh, that is brutal!",
  crowd: "Listen to this crowd!",
  winner: "Your winner!",
  close_1: "What a fight!",
  destruction: "That is total destruction!",
};

function statBlock(t) {
  const c = robots[t.slug]?.stats;
  const hist = matches.filter((m) => slugify(m.bot) === t.slug);
  const lines = [
    `Name: ${t.name}`,
    `Pro League 2026: group ${t.group}, rank ${t.rank}, ${t.wins} wins ${t.losses} losses, ${t.koWins} by knockout, ${t.totalPoints} points`,
  ];
  if (c) {
    // Label these unambiguously. An earlier version merged the two KO figures
    // and the model reported "knocked out 16 opponents" using koAgainst — the
    // number of times the bot was itself knocked out. Keep them far apart.
    lines.push(
      `Career wins: ${c.wins}. Career losses: ${c.losses}. Total fights: ${c.total}. Win rate: ${c.winRate}%`,
      `Knockout victories it DELIVERED: ${c.koWins}`,
      `Times it was itself KNOCKED OUT by an opponent: ${c.koAgainst}`,
    );
    if (c.fastestKoSecs) lines.push(`Its fastest knockout win: ${c.fastestKoSecs} seconds`);
    if (c.koPct) lines.push(`Share of its wins that came by knockout: ${c.koPct}%`);
  } else {
    lines.push("Career stats: NOT AVAILABLE — do not invent any.");
  }
  if (hist.length) {
    lines.push(
      "Prior season (World Championship VII):",
      ...hist.map(
        (m) =>
          `  ${m.result === "WIN" ? "beat" : "lost to"} ${m.opponent}${
            m.method === "KO" ? ` by KO${m.timeSecs ? ` in ${m.timeSecs}s` : ""}` : " on a decision"
          }`,
      ),
    );
  }
  return lines.join("\n");
}

const SYSTEM = `You write single-clause lines for a live BattleBots ring announcer.
Each line states ONE real fact about the robot, phrased for a booming stadium voice.

HARD RULES:
- Use ONLY the numbers given. Never invent a statistic, opponent, or nickname.
- Write numbers as WORDS ("three and oh", "seventeen seconds") so text-to-speech reads them naturally.
- Do NOT include the robot's name — it is spoken separately and would be said twice.
- Each line must stand alone as a clause that can follow the robot's name.
- Under 11 words each. No markdown, no numbering, no quotes.

Output exactly 2 lines.`;

async function nuggetsFor(t) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OR_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.7,
      max_tokens: 120,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: statBlock(t) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  return (json.choices?.[0]?.message?.content ?? "")
    .split("\n")
    .map((l) => l.replace(/^[-*\d.\s]+/, "").replace(/^["']|["']$/g, "").trim())
    .filter((l) => l.length > 4)
    .slice(0, 2);
}

// ── Numeric fact-check ────────────────────────────────────────────────────
//
// These lines get baked into audio, so a wrong number is expensive to discover
// late. Every number a nugget mentions must appear in that bot's real stat set;
// anything else is rejected and the line is regenerated.

const UNITS = ["zero","one","two","three","four","five","six","seven","eight","nine",
  "ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen",
  "eighteen","nineteen"];
const TENS = { twenty:20, thirty:30, forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90 };

/** Pulls every number out of a spoken-form line, digits or words. */
function numbersIn(text) {
  const found = new Set();
  for (const m of text.matchAll(/\d+(?:\.\d+)?/g)) found.add(parseFloat(m[0]));

  const words = text.toLowerCase().replace(/[^a-z\s-]/g, " ").split(/[\s-]+/);
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (TENS[w] !== undefined) {
      const next = UNITS.indexOf(words[i + 1] ?? "");
      if (next > 0 && next < 10) { found.add(TENS[w] + next); i++; }
      else found.add(TENS[w]);
    } else {
      const u = UNITS.indexOf(w);
      if (u >= 0) found.add(u);
    }
  }
  return found;
}

/** Every figure the bot may legitimately be described with. */
function allowedNumbers(t) {
  const c = robots[t.slug]?.stats;
  const ok = new Set([t.wins, t.losses, t.koWins, t.jdWins, t.totalPoints, t.rank]);
  if (c) {
    for (const v of [c.wins, c.losses, c.total, c.winRate, c.koWins, c.jdWins,
                     c.koPct, c.koAgainst, c.avgKoTimeSecs, c.fastestKoSecs,
                     c.avgKoAgainstSecs, c.estimatedPoints]) {
      if (v !== null && v !== undefined) {
        ok.add(v);
        ok.add(Math.round(v));
        // "seventy seven point eight" also surfaces its integer parts.
        if (!Number.isInteger(v)) { ok.add(Math.trunc(v)); ok.add(Math.round((v % 1) * 10)); }
      }
    }
  }
  for (const m of matches.filter((m) => slugify(m.bot) === t.slug)) {
    if (m.timeSecs) { ok.add(m.timeSecs); ok.add(Math.floor(m.timeSecs / 60)); ok.add(m.timeSecs % 60); }
  }
  // 2026 (the season) and small ordinals used as filler are always fine.
  for (const v of [0, 1, 2, 20, 26, 2026]) ok.add(v);
  return ok;
}

function checkNugget(t, line) {
  const allowed = allowedNumbers(t);
  const bad = [...numbersIn(line)].filter((n) => !allowed.has(n));
  return { ok: bad.length === 0, bad };
}

async function quota() {
  const res = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
    headers: { "xi-api-key": EL_KEY },
  });
  if (!res.ok) return null;
  const d = await res.json();
  return { used: d.character_count, limit: d.character_limit, left: d.character_limit - d.character_count };
}

async function tts(text, outPath) {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_64`,
    {
      method: "POST",
      headers: { "xi-api-key": EL_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: { stability: 0.4, similarity_boost: 0.75, style: 0.55, speed: 1.05 },
      }),
    },
  );
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
  writeFileSync(outPath, Buffer.from(await res.arrayBuffer()));
}

// ── Build the script ──────────────────────────────────────────────────────

mkdirSync(join(OUT, "names"), { recursive: true });
mkdirSync(join(OUT, "nuggets"), { recursive: true });
mkdirSync(join(OUT, "connectives"), { recursive: true });

const q = await quota();
if (q) console.log(`ElevenLabs quota: ${q.used}/${q.limit} used, ${q.left} left\n`);

/**
 * Seeded from the existing manifest, not from empty.
 *
 * A partial run (`--only-connectives`) only produces jobs for the clips it
 * touches, so starting from a blank manifest and writing it at the end deleted
 * every bot name and nugget from the bank while leaving their mp3s orphaned on
 * disk. Partial runs must merge.
 */
const manifest = { voice: VOICE, generatedAt: new Date().toISOString(), names: {}, nuggets: {}, connectives: {} };
try {
  const manifestPath = join(ROOT, "src/data/announcer.json");
  if (existsSync(manifestPath)) {
    const old = JSON.parse(readFileSync(manifestPath, "utf8"));
    for (const kind of ["names", "nuggets", "connectives"]) {
      Object.assign(manifest[kind], old[kind] ?? {});
    }
  }
} catch {
  /* No usable manifest — start clean. */
}

const jobs = [];

for (const [key, text] of Object.entries(CONNECTIVES)) {
  jobs.push({ kind: "connectives", key, text, file: `connectives/${key}.mp3` });
}

if (!ONLY_CONNECTIVES) {
  for (const t of bots) {
    jobs.push({ kind: "names", key: t.slug, text: t.name, file: `names/${t.slug}.mp3` });
  }
  console.log("Generating nuggets (every number is checked against real stats)...\n");
  let rejected = 0;
  for (const t of bots) {
    let accepted = [];
    // Up to 3 attempts; keep only lines whose numbers all check out.
    for (let attempt = 0; attempt < 3 && accepted.length < 2; attempt++) {
      let lines = [];
      try {
        lines = await nuggetsFor(t);
      } catch (e) {
        console.log(`  ${t.name.padEnd(14)} API FAILED: ${e.message}`);
        break;
      }
      for (const line of lines) {
        if (accepted.length >= 2) break;
        const { ok, bad } = checkNugget(t, line);
        if (ok) accepted.push(line);
        else {
          rejected++;
          console.log(`  ${t.name.padEnd(14)} REJECTED (${bad.join(",")} not in stats): "${line}"`);
        }
      }
    }
    accepted.forEach((text, i) => {
      jobs.push({ kind: "nuggets", key: `${t.slug}_${i}`, text, file: `nuggets/${t.slug}_${i}.mp3` });
    });
    console.log(`  ${t.name.padEnd(14)} ${accepted.map((l) => `"${l}"`).join(" / ") || "(none passed)"}`);
  }
  console.log(`\n${rejected} line(s) rejected by the fact-checker.`);
}

const chars = jobs.reduce((n, j) => n + j.text.length, 0);
console.log(`\n${jobs.length} clips, ${chars} characters total`);
if (q) console.log(`After generation: ${q.left - chars} characters would remain`);

if (DRY) {
  console.log("\n--dry: no audio generated.");
  writeFileSync(join(OUT, "preview.json"), JSON.stringify(jobs, null, 2));
  process.exit(0);
}

if (q && chars > q.left) {
  console.error(`\nABORT: needs ${chars} chars but only ${q.left} left. Trim the bank first.`);
  process.exit(1);
}

console.log("\nSynthesising...");

// What each existing clip actually says, from the last manifest. Caching on
// filename alone was a trap: edit a line's wording and the script would keep
// the old audio while the manifest — and therefore the on-screen subtitle —
// claimed the new words. Anything whose text has changed is re-synthesised.
let previous = {};
try {
  const manifestPath = join(ROOT, "src/data/announcer.json");
  if (existsSync(manifestPath)) {
    const old = JSON.parse(readFileSync(manifestPath, "utf8"));
    for (const kind of ["names", "nuggets", "connectives"]) {
      for (const [key, clip] of Object.entries(old[kind] ?? {})) {
        previous[`${kind}/${key}`] = clip.text;
      }
    }
  }
} catch {
  /* No usable manifest — treat everything as new. */
}

let done = 0;
for (const j of jobs) {
  const out = join(OUT, j.file);
  const stale = previous[`${j.kind}/${j.key}`] !== j.text;
  if (stale && existsSync(out)) {
    console.log(`  (reworded) ${j.file}`);
  }
  if (existsSync(out) && !stale) {
    manifest[j.kind][j.key] = { text: j.text, file: `/audio/announcer/${j.file}` };
    console.log(`  (cached) ${j.file}`);
    continue;
  }
  try {
    await tts(j.text, out);
    manifest[j.kind][j.key] = { text: j.text, file: `/audio/announcer/${j.file}` };
    done++;
    console.log(`  ${String(done).padStart(3)} ${j.file}  "${j.text.slice(0, 50)}"`);
  } catch (e) {
    console.log(`  FAILED ${j.file}: ${e.message}`);
  }
}

writeFileSync(join(ROOT, "src/data/announcer.json"), JSON.stringify(manifest, null, 2));
const after = await quota();
if (after) console.log(`\nQuota now: ${after.used}/${after.limit} (${after.left} left)`);
console.log(`Manifest: src/data/announcer.json`);
