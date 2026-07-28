/**
 * Weapon taxonomy.
 *
 * Provenance matters here: the whole pitch of this app is that the numbers and
 * claims are real, so every weapon type records where it came from.
 *
 *  - "official"  scraped verbatim from the bot's battlebots.com/robot/<slug>/
 *                page ("Type:" field). Safe to state as fact.
 *  - "editorial" battlebots.com leaves "Type:" blank for these bots, so this is
 *                filled from general knowledge of the machine. Treat as a best
 *                guess: the UI labels it, and the AI prompts are told not to
 *                assert it confidently.
 *
 * If the hackathon API exposes an authoritative weapon field, replace the
 * editorial entries and flip their source to "official".
 */

export type WeaponClass =
  | "vertical"
  | "horizontal"
  | "drum"
  | "hammer-saw"
  | "flipper"
  | "lifter"
  | "modular"
  | "unclassified";

export type WeaponSource = "official" | "editorial";

export interface WeaponInfo {
  /** Verbatim descriptor for display. */
  label: string;
  /** Normalized bucket for meta analysis. */
  class: WeaponClass;
  source: WeaponSource;
}

export const WEAPON_LABELS: Record<WeaponClass, string> = {
  vertical: "Vertical Spinner",
  horizontal: "Horizontal Spinner",
  drum: "Drum Spinner",
  "hammer-saw": "Hammer Saw",
  flipper: "Flipper",
  lifter: "Lifter",
  modular: "Modular",
  unclassified: "Unclassified",
};

/** Brand-adjacent accent per weapon class, used by charts and card trim. */
export const WEAPON_COLORS: Record<WeaponClass, string> = {
  vertical: "#E10600",
  horizontal: "#3AA0DC",
  drum: "#F5A623",
  "hammer-saw": "#B14AED",
  flipper: "#33D17A",
  lifter: "#FF6B9D",
  modular: "#9AA0A6",
  unclassified: "#5A5F66",
};

export const WEAPONS: Record<string, WeaponInfo> = {
  // ── Scraped verbatim from battlebots.com ──────────────────────────────
  bloodsport: { label: "Bar spinner (horizontal)", class: "horizontal", source: "official" },
  cobalt: { label: "Disc spinner (vertical)", class: "vertical", source: "official" },
  copperhead: { label: "Drum spinner", class: "drum", source: "official" },
  "death-roll": { label: "Disc spinner (vertical)", class: "vertical", source: "official" },
  "end-game": { label: "Bar spinner (vertical)", class: "vertical", source: "official" },
  huge: { label: "Bar spinner (vertical)", class: "vertical", source: "official" },
  hypershock: { label: "Disc spinner (vertical)", class: "vertical", source: "official" },
  jackpot: { label: "Disc spinner (vertical)", class: "vertical", source: "official" },
  madcatter: { label: "Disc spinner (vertical)", class: "vertical", source: "official" },
  malice: { label: "Horizontal Drum Spinner", class: "drum", source: "official" },
  minotaur: { label: "Drum spinner", class: "drum", source: "official" },
  ribbot: { label: "Modular", class: "modular", source: "official" },
  skorpios: { label: "Hammer Saw", class: "hammer-saw", source: "official" },
  switchback: { label: "Articulated Drum Spinner", class: "drum", source: "official" },
  terrortops: { label: "Lifter + Vertical Disk Spinner", class: "vertical", source: "official" },
  tombstone: { label: "Bar spinner (horizontal)", class: "horizontal", source: "official" },
  valkyrie: { label: "Disc spinner (horizontal)", class: "horizontal", source: "official" },
  "witch-doctor": { label: "Disc spinner (vertical)", class: "vertical", source: "official" },
  banshee: { label: "Flipper", class: "flipper", source: "official" },

  // ── "Type:" blank on battlebots.com — filled editorially ──────────────
  disarray: { label: "Horizontal spinner", class: "horizontal", source: "editorial" },
  "golden-fury": { label: "Vertical spinner", class: "vertical", source: "editorial" },
  magnitude: { label: "Drum spinner", class: "drum", source: "editorial" },
  manta: { label: "Vertical spinner", class: "vertical", source: "editorial" },
  orbitron: { label: "Horizontal spinner", class: "horizontal", source: "editorial" },
  "the-twins": { label: "Vertical spinner (x2)", class: "vertical", source: "editorial" },

  // ── Alternates, no listed type ────────────────────────────────────────
  calypso: { label: "Unlisted", class: "unclassified", source: "editorial" },
  nemesis: { label: "Unlisted", class: "unclassified", source: "editorial" },
};

export function weaponFor(slug: string): WeaponInfo {
  return (
    WEAPONS[slug] ?? { label: "Unlisted", class: "unclassified", source: "editorial" }
  );
}
