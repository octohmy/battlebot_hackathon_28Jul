#!/usr/bin/env node
/**
 * Builds the commentary stinger bank.
 *
 *   node scripts/stingers.mjs --dry     cost estimate only
 *   node scripts/stingers.mjs           generate audio (spends ElevenLabs quota)
 *
 * These are the *instant* half of the live commentary. Generating a bespoke
 * ElevenLabs line for every AI utterance takes a second or two round trip,
 * which is far too long for a reaction — the joke has landed and gone. So the
 * commentator's reaction ("Oh! He did NOT just say that!") is pre-voiced and
 * fires the moment the text arrives, and the bespoke read of the actual line
 * is fetched underneath it and played when it is ready.
 *
 * Deliberately generic: these lines must be true of *any* matchup, because
 * unlike the announcer nuggets they carry no numbers to fact-check.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "audio", "stingers");
const DRY = process.argv.includes("--dry");

for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const EL_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE = process.env.ELEVENLABS_VOICE_ID;

/**
 * Grouped by the moment they fire on. The arena picks one at random from the
 * relevant group, avoiding the one it played last.
 */
const STINGERS = {
  burn: [
    "Oh! He did not just say that!",
    "Ohhh, that is going to leave a mark!",
    "No way! No way!",
    "That is just disrespectful!",
    "Right in the circuits!",
  ],
  read: [
    "The numbers do not lie.",
    "Let us break this down.",
    "Bold call!",
  ],
  turnRed: ["Red square, you are up!"],
  turnBlue: ["Blue square, your move!"],
  bigHit: ["Listen to this crowd!", "That is going to sting in the morning!"],
  tag: ["Tag! Fresh machine in the box!"],
  level: ["This one is levelling up!"],
};

async function quota() {
  const res = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
    headers: { "xi-api-key": EL_KEY },
  });
  if (!res.ok) return null;
  const d = await res.json();
  return {
    used: d.character_count,
    limit: d.character_limit,
    left: d.character_limit - d.character_count,
  };
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
        // Higher style than the announcer bank: these are reactions, not reads.
        voice_settings: { stability: 0.32, similarity_boost: 0.75, style: 0.7, speed: 1.08 },
      }),
    },
  );
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
  writeFileSync(outPath, Buffer.from(await res.arrayBuffer()));
}

mkdirSync(OUT, { recursive: true });

const jobs = [];
for (const [group, lines] of Object.entries(STINGERS)) {
  lines.forEach((text, i) => {
    jobs.push({ group, key: `${group}_${i}`, text, file: `stingers/${group}_${i}.mp3` });
  });
}

const chars = jobs.reduce((n, j) => n + j.text.length, 0);
const q = await quota();
if (q) console.log(`ElevenLabs quota: ${q.used}/${q.limit} used, ${q.left} left`);
console.log(`${jobs.length} stingers, ${chars} characters`);
if (q) console.log(`After generation: ${q.left - chars} would remain`);

if (DRY) {
  console.log("\n--dry: no audio generated.");
  for (const j of jobs) console.log(`  [${j.group}] "${j.text}"`);
  process.exit(0);
}

if (q && chars > q.left) {
  console.error(`\nABORT: needs ${chars} chars, only ${q.left} left.`);
  process.exit(1);
}

const manifest = { voice: VOICE, generatedAt: new Date().toISOString(), groups: {} };

console.log("\nSynthesising...");
for (const j of jobs) {
  const out = join(OUT, `${j.key}.mp3`);
  manifest.groups[j.group] ??= [];
  if (existsSync(out)) {
    manifest.groups[j.group].push({ text: j.text, file: `/audio/stingers/${j.key}.mp3` });
    console.log(`  (cached) ${j.key}`);
    continue;
  }
  try {
    await tts(j.text, out);
    manifest.groups[j.group].push({ text: j.text, file: `/audio/stingers/${j.key}.mp3` });
    console.log(`  ${j.key}  "${j.text}"`);
  } catch (e) {
    console.log(`  FAILED ${j.key}: ${e.message}`);
  }
}

writeFileSync(join(ROOT, "src/data/stingers.json"), JSON.stringify(manifest, null, 2));
const after = await quota();
if (after) console.log(`\nQuota now: ${after.used}/${after.limit} (${after.left} left)`);
console.log("Manifest: src/data/stingers.json");
