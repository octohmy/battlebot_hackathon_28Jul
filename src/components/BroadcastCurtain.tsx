"use client";

import { useSyncExternalStore } from "react";
import Wordmark from "@/components/Wordmark";
import { TIMING, useBroadcast, type CurtainPhase, type Stinger } from "@/lib/broadcast";

/**
 * The stinger graphic itself.
 *
 * Lives in the root layout so it survives the navigation it is covering — if
 * it were inside a page it would be unmounted by the very route change it
 * exists to hide.
 *
 * Each phase gets its own keyframe animation and is keyed by phase so the
 * animation restarts cleanly rather than trying to interpolate from wherever
 * the last one stopped. Durations come from the same constants the sound
 * design uses, so the impact hits on the frame the panel closes.
 */

/**
 * A stinger is a physical object being thrown across the screen, so it wants
 * weight, not a soft UI easing. It accelerates hard out of rest and decelerates
 * into place. A true ease-in was tried first and read as a stall followed by a
 * snap: the panel sat off-screen for most of its duration, then teleported.
 */
const EASE_IN = "cubic-bezier(0.5, 0, 0.1, 1)";
const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";

const REDUCED = "(prefers-reduced-motion: reduce)";

/**
 * Whether to travel or simply appear.
 *
 * Reduced motion does not mean "no stinger" — the panel still has to cover the
 * screen or the cut it is hiding becomes visible. It means the panel arrives
 * by fading rather than by flying across the viewport.
 */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      if (typeof window === "undefined") return () => {};
      const mq = window.matchMedia(REDUCED);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
}

/** Picks the animation for a phase, honouring the motion preference. */
function anim(
  phase: CurtainPhase,
  reduced: boolean,
  inName: string,
  outName: string,
  t: { cover: number; reveal: number },
): string {
  if (phase === "cover") {
    return `${reduced ? "stinger-fade-in" : inName} ${t.cover}ms ${reduced ? "linear" : EASE_IN} forwards`;
  }
  if (phase === "reveal") {
    return `${reduced ? "stinger-fade-out" : outName} ${t.reveal}ms ${reduced ? "linear" : EASE_OUT} forwards`;
  }
  return "none";
}

/** Diagonal hazard stripes, the leading edge of every panel. */
const HAZARD =
  "repeating-linear-gradient(-45deg, #e10600 0 14px, #07080a 14px 28px)";

function Bug({
  label,
  sub,
  lift = 0,
}: {
  label: string | null;
  sub: string | null;
  /** Rems to raise the block, to clear a seam running through the middle. */
  lift?: number;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center">
      <div className="text-center" style={{ transform: `translateY(-${lift}rem)` }}>
        <Wordmark stacked className="text-4xl sm:text-6xl" />
        {label && (
          <div
            className="display mt-2 text-3xl leading-none text-bb-red sm:text-5xl"
            style={{ textShadow: "0 0 32px #e1060099" }}
          >
            {label}
          </div>
        )}
        {sub && <div className="label mt-2 !text-[10px]">{sub}</div>}
      </div>
    </div>
  );
}

function Wipe({ phase, label, sub }: { phase: CurtainPhase; label: string | null; sub: string | null }) {
  const t = TIMING.wipe;
  const reduced = usePrefersReducedMotion();
  const animation = anim(phase, reduced, "stinger-wipe-in", "stinger-wipe-out", t);

  return (
    <div
      key={phase}
      className="absolute -inset-y-[15%] -inset-x-[25%]"
      style={{
        animation,
        transform: phase === "hold" ? "translateX(0) skewX(-9deg)" : undefined,
        background: "#07080a",
        borderLeft: "10px solid transparent",
        borderRight: "10px solid transparent",
        borderImage: `${HAZARD} 10`,
      }}
    >
      {/* A red leading edge, so the sweep has a direction you can see. */}
      <div
        aria-hidden
        className="absolute inset-y-0 right-0 w-16"
        style={{ background: "linear-gradient(90deg, transparent, #e10600)" }}
      />
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 w-3"
        style={{ background: HAZARD }}
      />
      <div style={{ transform: "skewX(9deg)" }} className="absolute inset-0">
        <Bug label={label} sub={sub} />
      </div>
    </div>
  );
}

function Slam({ phase, label, sub }: { phase: CurtainPhase; label: string | null; sub: string | null }) {
  const t = TIMING.slam;
  const reduced = usePrefersReducedMotion();
  const shutter = (side: "top" | "bottom") =>
    anim(
      phase,
      reduced,
      side === "top" ? "stinger-slam-top-in" : "stinger-slam-bottom-in",
      side === "top" ? "stinger-slam-top-out" : "stinger-slam-bottom-out",
      t,
    );

  return (
    <div key={phase} className="absolute inset-0">
      {(["top", "bottom"] as const).map((side) => (
        <div
          key={side}
          className="absolute inset-x-0 h-1/2"
          style={{
            [side]: 0,
            animation: shutter(side),
            transform: phase === "hold" ? "translateY(0)" : undefined,
            background: "#07080a",
            [side === "top" ? "borderBottom" : "borderTop"]: `6px solid transparent`,
            borderImage: `${HAZARD} 6`,
          }}
        />
      ))}
      {/* The bug only exists once the shutters have met. */}
      {(phase === "hold" || phase === "reveal") && (
        <div
          className="absolute inset-0"
          style={{
            animation:
              phase === "reveal"
                ? `stinger-fade-out ${t.reveal * 0.4}ms linear forwards`
                : `stinger-pop-in 220ms ${EASE_OUT} both`,
          }}
        >
          <Bug label={label} sub={sub} lift={5} />
        </div>
      )}
    </div>
  );
}

function Cut({ phase }: { phase: CurtainPhase }) {
  const t = TIMING.cut;
  return (
    <div
      key={phase}
      className="absolute inset-0"
      style={{
        background:
          "linear-gradient(90deg, #e1060055, #e8ecf1cc 45%, #2f8fc955)",
        mixBlendMode: "screen",
        animation:
          phase === "cover"
            ? `stinger-fade-in ${t.cover}ms linear forwards`
            : phase === "reveal"
              ? `stinger-fade-out ${t.reveal}ms linear forwards`
              : "none",
        opacity: phase === "hold" ? 1 : undefined,
      }}
    />
  );
}

const PANELS: Record<
  Stinger,
  (p: { phase: CurtainPhase; label: string | null; sub: string | null }) => React.ReactNode
> = {
  wipe: Wipe,
  slam: Slam,
  cut: Cut,
};

export default function BroadcastCurtain() {
  const { phase, kind, label, sub } = useBroadcast();
  if (phase === "idle") return null;

  const Panel = PANELS[kind];
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[100] overflow-hidden"
    >
      <Panel phase={phase} label={label} sub={sub} />
    </div>
  );
}
