"use client";

import { create } from "zustand";
import { bell, impact, riser, whoosh } from "@/lib/synth";

/**
 * Broadcast cuts: the thing a sports channel does instead of a page load.
 *
 * A stinger sweeps in and covers the screen completely, the swap happens
 * behind it, and it sweeps back off to reveal whatever is now there. Because
 * the screen is opaque at the moment of the cut, the swap does not have to be
 * seamless — it has to be *hidden*, which is a much easier bar and is exactly
 * how television does it.
 *
 * This is a custom overlay rather than the View Transitions API on purpose.
 * View transitions cross-fade or slide the browser's own snapshots of the old
 * and new documents, which is right for a shared-element morph and wrong for
 * this: a broadcast stinger is a *graphic* — an angled bar with stripes and a
 * channel bug — that has to exist in front of both. It also has to work for
 * in-app screen changes (roster → fight, fight → final) that are state changes
 * rather than navigations, and those are not transitions the browser sees.
 *
 * Timings are exported because the sound design has to hit the same marks: the
 * impact lands on the frame the wipe closes, not a rough 400ms later.
 */

export type Stinger =
  /** Angled bar sweeping across. The default cut between pages. */
  | "wipe"
  /** Shutters slamming closed from top and bottom. Entering a fight. */
  | "slam"
  /** Fast glitch flash. Light changes that still want punctuation. */
  | "cut";

export type CurtainPhase = "idle" | "cover" | "hold" | "reveal";

export const TIMING: Record<Stinger, { cover: number; hold: number; reveal: number }> = {
  wipe: { cover: 360, hold: 190, reveal: 400 },
  slam: { cover: 300, hold: 320, reveal: 420 },
  cut: { cover: 130, hold: 90, reveal: 150 },
};

interface BroadcastState {
  phase: CurtainPhase;
  kind: Stinger;
  /** Big type on the covering panel — "FIGHT", "INTEL", "FINAL". */
  label: string | null;
  sub: string | null;
  set: (patch: Partial<BroadcastState>) => void;
}

export const useBroadcast = create<BroadcastState>((set) => ({
  phase: "idle",
  kind: "wipe",
  label: null,
  sub: null,
  set: (patch) => set(patch),
}));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One cut at a time; a second request while covered is dropped, not queued. */
let busy = false;

export interface CutOptions {
  kind?: Stinger;
  label?: string | null;
  sub?: string | null;
  /**
   * Runs while the screen is fully covered. This is where the navigation or
   * the state change goes — anything visually jarring is invisible here.
   */
  onCovered?: () => void | Promise<void>;
}

export async function cut({
  kind = "wipe",
  label = null,
  sub = null,
  onCovered,
}: CutOptions = {}): Promise<void> {
  if (busy) {
    // Still do the work, just without a second overlapping animation.
    await onCovered?.();
    return;
  }
  busy = true;

  const t = TIMING[kind];
  const { set } = useBroadcast.getState();

  try {
    set({ phase: "cover", kind, label, sub });
    if (kind === "cut") {
      whoosh(0.16, "up");
    } else {
      whoosh(t.cover / 1000, "up");
      if (kind === "slam") riser(t.cover / 1000);
    }

    await sleep(t.cover);

    // Land the hit on the frame the panel closes.
    impact(kind === "slam" ? 1 : 0.7);
    if (kind === "slam") bell();

    set({ phase: "hold" });
    await onCovered?.();
    await sleep(t.hold);

    set({ phase: "reveal" });
    whoosh((t.reveal / 1000) * 0.9, "down");
    await sleep(t.reveal);

    set({ phase: "idle", label: null, sub: null });
  } finally {
    busy = false;
  }
}

/** True while a cut is covering the screen, for anything that should pause. */
export function isCutting(): boolean {
  return busy;
}
