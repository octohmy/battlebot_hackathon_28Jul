import type { Side } from "@/lib/store";

/**
 * The two corners.
 *
 * One definition, because the side colour is load-bearing in a dozen places —
 * card trim, meters, radar marks, the announcer's "in the red corner", the
 * damage overlay. Divergent hex literals across files is how a demo ends up
 * with two slightly different blues on screen at once.
 *
 * These two are a validated categorical pair against the panel surface
 * (`#101317`): deuteranope ΔE 23.7, normal-vision ΔE 34.9, both well clear of
 * the floor, and both inside the dark-mode lightness band. Anything reassigned
 * here must be re-validated as a pair, not picked by eye.
 */
export const SIDE: Record<Side, { color: string; deep: string; corner: string }> = {
  a: { color: "#e10600", deep: "#8f0400", corner: "Red corner" },
  b: { color: "#2f8fc9", deep: "#14618f", corner: "Blue corner" },
};

export const sideColor = (side: Side) => SIDE[side].color;

/** Neutral ink and surface tokens, for charts drawn in SVG. */
export const INK = {
  primary: "#e8ecf1",
  secondary: "#9aa4b0",
  muted: "#5a5f66",
  grid: "#2a3038",
  surface: "#101317",
};
