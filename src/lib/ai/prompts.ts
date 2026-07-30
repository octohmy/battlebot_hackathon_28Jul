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

/**
 * The state of the fight in progress.
 *
 * Structured numbers rather than a sentence from the browser, deliberately.
 * The route already looks both bots up server-side so a caller cannot inject
 * fake stats into the prompt; accepting free text describing the fight would
 * hand that back. These are five integers, clamped, and the sentence around
 * them is written here.
 */
export interface Situation {
  round: number;
  aWins: number;
  bWins: number;
  aMorale: number;
  bMorale: number;
}

/** Morale in the words a commentator would use. Mirrors the HUD's bands. */
function band(v: number): string {
  if (v > 75) return "bouncing";
  if (v > 50) return "composed";
  if (v > 30) return "rattled";
  if (v > 0) return "on the ropes";
  return "stopped";
}

function situationBlock(a: Bot, b: Bot, s: Situation): string {
  const lead =
    s.aWins === s.bWins
      ? `Level at ${s.aWins} rounds each.`
      : s.aWins > s.bWins
        ? `${a.name} leads the rounds ${s.aWins}-${s.bWins}.`
        : `${b.name} leads the rounds ${s.bWins}-${s.aWins}.`;
  return [
    `=== THE FIGHT, RIGHT NOW ===`,
    `Round ${s.round} of 6. ${lead}`,
    `${a.name} morale ${s.aMorale}/100 (${band(s.aMorale)}).`,
    `${b.name} morale ${s.bMorale}/100 (${band(s.bMorale)}).`,
    `This is a live card duel being fought on these stats — not a real BattleBots match. Describe it as the contest on screen.`,
  ].join("\n");
}

interface Ctx {
  a: Bot;
  b: Bot;
  mode: AiMode;
  /** The stat just played, if any. */
  stat?: TrumpKey | null;
  /** Which bot the copy should be aimed at. */
  target?: "a" | "b" | null;
  /** Where the fight stands, when this is a live read rather than a preview. */
  situation?: Situation | null;
}

/**
 * Extra rules for the two modes that are supposed to *sting*.
 *
 * Trash talk was coming back three or four sentences long and sounding like a
 * press release — "a formidable machine, though its record suggests…" — which
 * is the opposite of trash talk. Length is the root of it: give a model room
 * for a second sentence and it uses the first to set up and the second to
 * qualify, and the insult drowns.
 *
 * So the length cap is stated as the hard constraint it is, in three different
 * ways (one sentence, a word count, "if it's longer it's wrong"), the hedging
 * vocabulary is banned outright, and the openers models reach for when they are
 * about to be polite are named and forbidden. The examples are there for
 * *rhythm* — short, one clean hit, no wind-up.
 */
const BURN_RULES = `
HOW IT MUST SOUND:
- ONE sentence. Hard cap 16 words. If it is longer than that, it is wrong.
- Talk like a person in a crowd, not a broadcaster. Contractions, street rhythm.
- Land the hit and stop. No wind-up, no set-up clause, no "and that's why".
- Cheeky and rude beats clever and long. Mock it. Be a bit mean about it.
- Best ammunition is one of its real numbers, said like an insult, not a stat.
- NEVER hedge: no "arguably", "statistically", "impressive", "formidable",
  "one might", "to be fair", "however", "that said".
- NEVER open with "Ah,", "Well,", "Look,", "Listen,", "Oh,", "Hey," or the
  robot's name followed by a comma.
- No compliment sandwich. No advice. No summing up. No emoji, no hashtags.
- Punching at the machine, never at the people who built it. Keep it clean —
  rude, not crude: no swearing, nothing sexual, nothing about anyone's body.
Rhythm to copy (invented bots, do not reuse the words):
- "Three wins in nine fights and you brought that mouth with you?"
- "You get knocked out in twelve seconds, mate. Twelve."
- "Cute wedge. Shame about the losing."
`.trim();

const VOICE: Record<AiMode, string> = {
  taunt: `You are talking smack for one robot, straight at the other robot's face, second person. Cocky playground stuff.\n\n${BURN_RULES}`,
  analyse:
    "You are a dry, expert fight analyst. Say who the numbers favour and why, naming the specific stats that decide it. Neutral and precise. 2 sentences, max 45 words.",
  predict:
    "You are a bookmaker. Call a winner outright, give a rough confidence, and name the one stat that swings it. Commit to a pick — no fence-sitting. 2 sentences, max 40 words.",
  roast: `You are a savage insult comic, roasting one robot to its face using its real failures as ammunition. Merciless, funny, personal about the machine.\n\n${BURN_RULES}`,
};

/**
 * Angles of attack, rotated at random for the burns.
 *
 * With nothing but "insult that robot", a model finds the single most obvious
 * hook in the stat block and returns it every single time — three presses of
 * Trash Talk in a row came back with the same sentence about the same win
 * rate. Temperature does not fix that; it is not being random, it is being
 * *right*, repeatedly. Naming a different piece of ammunition each time is
 * what actually moves it, and it costs one line of prompt.
 */
const ANGLES = [
  "Go at its win-loss record.",
  "Go at how long it takes to finish a fight.",
  "Go at the number of times it has been knocked out.",
  "Go at its weapon.",
  "Go at its name.",
  "Go at where it sits in the standings.",
  "Go at one specific fight from its log.",
  "Ignore its stats — brag about your own record instead.",
  "Go at how few knockouts it has.",
];

export function buildMessages({ a, b, mode, stat, target, situation }: Ctx) {
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
    situation ? situationBlock(a, b, situation) : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  // For the burns this is ammunition on the table, not a topic sentence: made
  // mandatory, every taunt opened by reciting the stat that had just been
  // played, which is a scoreboard reading rather than an insult.
  const focus = !stat
    ? ""
    : mode === "taunt" || mode === "roast"
      ? `The round just fought was "${TRUMP_BY_KEY[stat].label}" — use it if it helps, drop it if it doesn't.`
      : `The stat just played was "${TRUMP_BY_KEY[stat].label}" (${TRUMP_BY_KEY[stat].hint}). Centre the line on it.`;

  const aim =
    target === "a"
      ? `Aim this at ${a.name}.`
      : target === "b"
        ? `Aim this at ${b.name}.`
        : `The matchup is ${a.name} vs ${b.name}.`;

  // Repeated last, because the end of the prompt is the part a model listens
  // to hardest — and length is the single instruction this mode keeps losing.
  const burn = mode === "taunt" || mode === "roast";
  const brevity = burn
    ? `${ANGLES[Math.floor(Math.random() * ANGLES.length)]} One sentence. Max 16 words. Go.`
    : situation
      ? // A live read has to be about *this* round, not about the matchup in
        // the abstract — otherwise it is the pre-fight preview again, arriving
        // four rounds too late to be commentary.
        "Read the fight as it stands right now. Lead with what has just changed, then say what it means for the rounds still to come. 2 sentences, max 40 words."
      : "";

  return [
    {
      role: "system" as const,
      content: `${VOICE[mode]}\n\n${GROUND_RULES}`,
    },
    {
      role: "user" as const,
      content: `${context}\n\n${aim} ${focus}\n\n${brevity}`.trim(),
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
