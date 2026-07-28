import type { Bot } from "@/lib/bbpl/client";
import {
  commonOpponents,
  hasHistory,
  headToHead,
  historyLines,
  SEASON_LABEL,
} from "@/lib/fights";
import { TRUMP_BY_KEY, type TrumpKey } from "@/lib/scoring";

/**
 * Grounded prompt construction.
 *
 * The whole point of this app is that the AI output is *checkable*. Every
 * prompt gets the two bots' real stat blocks plus their real fight history, and
 * is told in strong terms not to invent anything. Weapon types that we guessed
 * rather than scraped are flagged so the model hedges on them.
 */

export type AiMode = "taunt" | "analyse" | "predict" | "roast";

function statBlock(bot: Bot): string {
  const c = bot.career;
  const lines = [
    `Name: ${bot.name}`,
    `Team: ${bot.teamName ?? "unknown"}`,
    `Weapon: ${bot.weapon.label}${
      bot.weapon.source === "editorial" ? " (UNVERIFIED — do not state as fact)" : ""
    }`,
    `Pro League 2026 group ${bot.group}, rank ${bot.rank}`,
    `This season: ${bot.season.wins}W-${bot.season.losses}L, ${bot.season.koWins} by KO, ${bot.season.totalPoints} pts`,
  ];

  if (c) {
    lines.push(
      `Career: ${c.wins}W-${c.losses}L across ${c.total} fights (${c.winRate}% win rate)`,
      `Career KOs: ${c.koWins} wins by KO${c.koPct !== null ? ` (${c.koPct}% of wins)` : ""}, knocked out ${c.koAgainst} times`,
    );
    if (c.fastestKoSecs !== null) lines.push(`Fastest KO delivered: ${c.fastestKoSecs}s`);
    if (c.avgKoTimeSecs !== null) lines.push(`Average time to finish: ${c.avgKoTimeSecs}s`);
  } else {
    lines.push("Career stats: NOT AVAILABLE — do not invent any.");
  }

  if (hasHistory(bot.name)) {
    lines.push(`${SEASON_LABEL} fight log:`);
    lines.push(...historyLines(bot.name).map((l) => `  - ${l}`));
  } else {
    lines.push(`No ${SEASON_LABEL} fight log on record.`);
  }

  return lines.join("\n");
}

const GROUND_RULES = `
HARD RULES:
- Use ONLY the numbers and fights given below. Never invent a statistic, an
  opponent, a match, or a nickname.
- If you cite a number, cite it exactly as given.
- Fight logs are from ${SEASON_LABEL}, a PREVIOUS season. Refer to them as past
  form, never as this season's results.
- Anything marked UNVERIFIED must be hedged ("reportedly", "said to be") or omitted.
- No markdown, no bullet points, no preamble. Plain prose only.
`.trim();

interface Ctx {
  a: Bot;
  b: Bot;
  mode: AiMode;
  /** The stat just played, if any. */
  stat?: TrumpKey | null;
  /** Which bot the copy should be aimed at. */
  target?: "a" | "b" | null;
}

const VOICE: Record<AiMode, string> = {
  taunt:
    "You are the trash-talking hype man for one robot, addressing the other robot directly in the second person. Cocky, punchy, playground-brutal but never crude. 2 sentences, max 45 words.",
  analyse:
    "You are a dry, expert fight analyst. Explain who the numbers favour and why, naming the specific stats that decide it. Neutral and precise. 3 sentences, max 70 words.",
  predict:
    "You are a bookmaker. Call a winner outright, give a rough confidence, and name the single stat that swings it. Commit to a pick — no fence-sitting. 3 sentences, max 60 words.",
  roast:
    "You are a savage insult comic roasting one robot to its face, using its real failures as ammunition. Merciless and funny, punching at the machine not its builders. Keep it clean. 2 sentences, max 45 words.",
};

export function buildMessages({ a, b, mode, stat, target }: Ctx) {
  const h2h = headToHead(a.name, b.name);
  const common = commonOpponents(a.name, b.name);

  const context = [
    `=== ROBOT A ===\n${statBlock(a)}`,
    `=== ROBOT B ===\n${statBlock(b)}`,
    h2h.length
      ? `=== HEAD TO HEAD (${SEASON_LABEL}) ===\n${h2h
          .map(
            (f) =>
              `Ep ${f.episode}: ${a.name} ${f.result === "WIN" ? "beat" : "lost to"} ${b.name} ${
                f.method === "KO" ? `by KO${f.timeSecs ? ` in ${f.timeSecs}s` : ""}` : "on a judges' decision"
              }`,
          )
          .join("\n")}`
      : "=== HEAD TO HEAD ===\nThese two have never met. Do not claim otherwise.",
    common.length
      ? `=== COMMON OPPONENTS ===\n${common.join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const focus = stat
    ? `The stat just played was "${TRUMP_BY_KEY[stat].label}" (${TRUMP_BY_KEY[stat].hint}). Centre the line on it.`
    : "";

  const aim =
    target === "a"
      ? `Aim this at ${a.name}.`
      : target === "b"
        ? `Aim this at ${b.name}.`
        : `The matchup is ${a.name} vs ${b.name}.`;

  return [
    {
      role: "system" as const,
      content: `${VOICE[mode]}\n\n${GROUND_RULES}`,
    },
    {
      role: "user" as const,
      content: `${context}\n\n${aim} ${focus}`.trim(),
    },
  ];
}

/**
 * Short commentator nuggets for the announcer line bank. Generated once per bot
 * at build time, then spoken via ElevenLabs.
 */
export function buildNuggetMessages(bot: Bot) {
  return [
    {
      role: "system" as const,
      content: `You write single-clause lines for a live BattleBots ring announcer.
Each line is a bare fact about the robot, phrased for a booming stadium voice.
Write numbers as words ("three and oh", "seventeen seconds") so text-to-speech
reads them naturally.

${GROUND_RULES}

Output exactly 3 lines, one per line, no numbering, no quotes. Each under 12 words.`,
    },
    { role: "user" as const, content: statBlock(bot) },
  ];
}
