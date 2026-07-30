/**
 * Who each machine sounds like.
 *
 * A fight has two mouths in it, and running both through one voice made the
 * trash talk read as a narrator describing an argument rather than as two
 * robots having one. So every bot is assigned a voice, deterministically from
 * its slug — Copperhead sounds like Copperhead in every fight it appears in,
 * this session and the next — and the two corners are always given different
 * ones.
 *
 * Each profile carries two things, because there are two engines behind it:
 *
 *  - `id` — an ElevenLabs voice from this account, used when there is budget.
 *  - `prefer` / `pitch` / `rate` — shaping for the browser's own speech
 *    synthesis, which is what actually speaks when there is not. That fallback
 *    is not a downgrade to silence: it is free, offline, unmetered, and it
 *    still gives the two corners audibly different voices, which is the part
 *    that matters.
 *
 * Isomorphic on purpose: the API route validates an incoming voice id against
 * this pool, so a caller cannot bill the account for an arbitrary voice.
 */

export interface FighterVoice {
  /** ElevenLabs voice id on this account. */
  id: string;
  /** Shown in the UI so you can see who is speaking. */
  name: string;
  /** What it sounds like, in a couple of words. */
  character: string;
  /** Browser voices to reach for first, best match to worst. */
  prefer: string[];
  /** Browser-speech shaping, so two bots on one system voice still differ. */
  pitch: number;
  rate: number;
}

/**
 * The fighters' voices.
 *
 * Chosen from the account's `characters_animation` and heavier conversational
 * voices rather than the narration ones — this is somebody shouting across a
 * BattleBox, not an audiobook. Ordered so that any two adjacent entries are
 * obviously different from each other, because adjacent is exactly what two
 * bots drawn from a shuffled roster often are.
 */
export const FIGHTER_VOICES: FighterVoice[] = [
  {
    id: "SOYHLrjzK2X1ezoPC6cr",
    name: "Harry",
    character: "Fierce warrior",
    prefer: ["Alex", "Google UK English Male", "Daniel", "Aaron"],
    pitch: 0.8,
    rate: 1.08,
  },
  {
    id: "FGY2WhTYpPnrIDTdsKH5",
    name: "Laura",
    character: "Quirky, all attitude",
    prefer: ["Samantha", "Google US English", "Karen", "Victoria"],
    pitch: 1.35,
    rate: 1.16,
  },
  {
    id: "N2lVS1w4EtoT3dr4eOWO",
    name: "Callum",
    character: "Husky trickster",
    prefer: ["Fred", "Ralph", "Google UK English Male", "Alex"],
    pitch: 0.68,
    rate: 0.98,
  },
  {
    id: "cgSgspJ2msm6clMCkdW9",
    name: "Jessica",
    character: "Playful and bright",
    prefer: ["Moira", "Tessa", "Google UK English Female", "Samantha"],
    pitch: 1.22,
    rate: 1.1,
  },
  {
    id: "pNInz6obpgDQGcFmaJgB",
    name: "Adam",
    character: "Dominant, firm",
    prefer: ["Aaron", "Alex", "Google US English", "Daniel"],
    pitch: 0.88,
    rate: 1.02,
  },
  {
    id: "IKne3meq5aSn9XLyUdCD",
    name: "Charlie",
    character: "Australian, energetic",
    prefer: ["Karen", "Rishi", "Google UK English Male", "Fred"],
    pitch: 1.05,
    rate: 1.2,
  },
  {
    id: "EkK5I93UQWFDigLMpZcX",
    name: "James",
    character: "Husky and bold",
    prefer: ["Rishi", "Daniel", "Alex", "Google UK English Male"],
    pitch: 0.75,
    rate: 1.04,
  },
  {
    id: "Nftb3M9uCFmFbmOa6zpe",
    name: "Marcus",
    character: "Authoritative, deep",
    prefer: ["Ralph", "Fred", "Aaron", "Alex"],
    pitch: 0.62,
    rate: 0.95,
  },
];

/**
 * The analyst at the desk.
 *
 * Deliberately outside the fighters' pool and deliberately a broadcaster: the
 * desk is the one voice in the room that is not in the fight, and it should
 * never be mistaken for one of the two machines slagging each other off.
 */
export const DESK_VOICE: FighterVoice = {
  id: "onwK4e9ZLuTAKqWW03F9",
  name: "Daniel",
  character: "Steady broadcaster",
  prefer: ["Daniel", "Google UK English Male", "Alex", "Rishi"],
  pitch: 0.95,
  rate: 1.0,
};

/** Stable small hash, so a bot keeps its voice between sessions. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** The voice a given bot always speaks in. */
export function voiceFor(slug: string): FighterVoice {
  return FIGHTER_VOICES[hash(slug) % FIGHTER_VOICES.length];
}

/**
 * The two corners' voices, guaranteed distinct.
 *
 * Two bots hashing to the same voice is not rare with a pool of eight and a
 * roster of twenty-four, and a fight where both machines sound identical is
 * the exact problem this whole module exists to fix — so the blue corner walks
 * along the pool until it finds one that is not red's.
 */
export function voicesFor(aSlug: string, bSlug: string): Record<"a" | "b", FighterVoice> {
  const a = voiceFor(aSlug);
  let b = voiceFor(bSlug);
  if (b.id === a.id) {
    const from = FIGHTER_VOICES.indexOf(b);
    b = FIGHTER_VOICES[(from + 1 + (hash(bSlug) % (FIGHTER_VOICES.length - 1))) % FIGHTER_VOICES.length];
    if (b.id === a.id) b = FIGHTER_VOICES[(FIGHTER_VOICES.indexOf(a) + 1) % FIGHTER_VOICES.length];
  }
  return { a, b };
}

/** Whether an id may be billed to this account. Used by the API route. */
export function isKnownVoice(id: string): boolean {
  return id === DESK_VOICE.id || FIGHTER_VOICES.some((v) => v.id === id);
}
