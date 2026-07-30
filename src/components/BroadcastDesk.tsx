"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Bot } from "@/lib/bbpl/client";
import { prefetchLine, speakLine } from "@/lib/commentary";
import { DOMINANT, severityOf } from "@/lib/scoring";
import { SIDE } from "@/lib/theme";
import { MAX_FEELINGS, MAX_ROUNDS, scoreboard, useArena } from "@/lib/store";

/**
 * The commentary box.
 *
 * Analyse and Predict used to sit in the weapon rack next to Roast, which was
 * wrong on both counts: they are not fired at anybody and they cost nobody
 * anything, and burying an opinion behind a button means it is only ever heard
 * by someone who already knew to press it. They are commentary — so they live
 * where commentary lives, on permanent display between the two corners, and
 * they arrive on their own at the moments a broadcast would use them.
 *
 * **The call** is the bookmaker's line, fetched the instant a matchup exists
 * and locked in before the bell. It is voiced as the closing beat of the
 * walk-in, which is exactly where a real pre-fight prediction goes.
 *
 * **The read** is live analysis, refetched with the actual state of the fight —
 * the round, the scoreline, both morale readings — and it fires when something
 * has happened worth reading: a round taken by a mile, the halfway mark, or a
 * machine going on the ropes. It never fires twice for the same reason, and it
 * never speaks over the ring announcer, because it waits for the round's own
 * call to finish first.
 */

/** How long the round announcer needs before a read can talk over the top. */
const AFTER_ANNOUNCER_MS = 3400;

interface Trigger {
  id: string;
  label: string;
}

/** The first sentence — falls back to the whole thing if there isn't one. */
function headline(text: string): string {
  const t = text.trim();
  const end = t.search(/[.!?](\s|$)/);
  return end > 20 ? t.slice(0, end + 1) : t;
}

export default function BroadcastDesk({
  a,
  b,
  onSubtitle,
}: {
  a: Bot;
  b: Bot;
  onSubtitle: (text: string) => void;
}) {
  const desk = useArena((s) => s.desk);
  const setDesk = useArena((s) => s.setDesk);
  const phase = useArena((s) => s.phase);
  const round = useArena((s) => s.round);
  const playedRounds = useArena((s) => s.playedRounds);
  const feelings = useArena((s) => s.feelings);
  const lastResult = useArena((s) => s.lastResult);

  const matchup = `${a.slug}:${b.slug}`;
  /** Triggers already spent, so a read never repeats itself. */
  const fired = useRef<Set<string>>(new Set());
  const abort = useRef<AbortController | null>(null);
  /** A read waiting for the announcer to stop talking. */
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (pending.current) clearTimeout(pending.current);
      abort.current?.abort();
    },
    [],
  );

  const score = scoreboard(playedRounds);
  const aMorale = feelings[a.slug] ?? MAX_FEELINGS;
  const bMorale = feelings[b.slug] ?? MAX_FEELINGS;

  // ── The call ────────────────────────────────────────────────────────────
  // Fetched once per matchup, before anybody has done anything, because a
  // prediction that arrives after round three is not a prediction.
  useEffect(() => {
    fired.current = new Set();
    const ctl = new AbortController();

    void (async () => {
      try {
        const res = await fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ a: a.slug, b: b.slug, mode: "predict" }),
          signal: ctl.signal,
        });
        if (!res.ok) return;
        const text = (await res.text()).trim();
        if (ctl.signal.aborted || text.length < 12) return;
        useArena.getState().setDesk({ call: text });
        // Warm the voice: the walk-in is going to ask for this in a few seconds.
        prefetchLine(text);
      } catch {
        // No call is a quiet failure — the box just shows the fight instead.
      }
    })();

    return () => ctl.abort();
  }, [a.slug, b.slug, matchup]);

  // ── The read ────────────────────────────────────────────────────────────
  const fetchRead = useCallback(
    async (trigger: Trigger, speak: boolean) => {
      abort.current?.abort();
      const ctl = new AbortController();
      abort.current = ctl;
      setDesk({ loading: true, readLabel: trigger.label });

      try {
        const res = await fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            a: a.slug,
            b: b.slug,
            mode: "analyse",
            situation: {
              round: Math.min(playedRounds.length, MAX_ROUNDS),
              aWins: score.a,
              bWins: score.b,
              aMorale,
              bMorale,
            },
          }),
          signal: ctl.signal,
        });
        if (!res.ok || !res.body) {
          setDesk({ loading: false });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setDesk({ read: acc });
        }
        setDesk({ read: acc.trim(), loading: false });

        if (speak && acc.trim().length > 12) {
          onSubtitle(acc.trim());
          // Only the headline is spoken unprompted. A co-commentator's first
          // sentence is the point and the second is the supporting detail —
          // and the bespoke voice is metered, so an automatic read that costs
          // half as much survives twice as many fights before it degrades to
          // subtitles. The whole read is still there on ▶ Play.
          void speakLine(headline(acc));
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") setDesk({ loading: false });
      }
    },
    [a.slug, b.slug, score.a, score.b, aMorale, bMorale, playedRounds.length, setDesk, onSubtitle],
  );

  // What, if anything, is worth saying right now.
  useEffect(() => {
    if (phase !== "resolve" || !lastResult) return;

    const n = playedRounds.length;
    const onTheRopes =
      aMorale > 0 && aMorale <= 30 ? a : bMorale > 0 && bMorale <= 30 ? b : null;

    const trigger: Trigger | null =
      lastResult.outcome !== "tie" && severityOf(lastResult) > DOMINANT
        ? { id: `dominant-${n}`, label: `Round ${n} · taken by a mile` }
        : onTheRopes
          ? { id: `ropes-${onTheRopes.slug}`, label: `${onTheRopes.name} on the ropes` }
          : n === Math.floor(MAX_ROUNDS / 2)
            ? { id: "halfway", label: "Halfway" }
            : null;

    if (!trigger || fired.current.has(trigger.id)) return;
    fired.current.add(trigger.id);

    // Wait for the ring announcer's call on the round to finish. Two voices at
    // once is not two pieces of commentary, it is neither of them.
    //
    // The timer is held in a ref and *not* cleared by this effect's cleanup.
    // It was, and that quietly meant a player who hit Continue inside three
    // seconds never heard a read at all — the phase change tore the timer down
    // while the trigger stayed marked as spent.
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(() => {
      const now = useArena.getState().phase;
      // The final call owns the end of the fight; nothing talks over it.
      if (now === "select" || now === "aftermath") return;
      void fetchRead(trigger, true);
    }, AFTER_ANNOUNCER_MS);
  }, [phase, lastResult, playedRounds.length, aMorale, bMorale, a, b, fetchRead]);

  const leaderColour =
    score.a === score.b ? "#9aa4b0" : score.a > score.b ? SIDE.a.color : SIDE.b.color;

  return (
    <section className="border border-bb-steel bg-bb-black/40">
      <div className="flex items-center justify-between border-b border-bb-steel px-2 py-1">
        <span className="label !text-[9px] !text-bb-bone">Broadcast desk</span>
        <span className="label !text-[8px] !tracking-normal text-bb-steel">
          AI commentary
        </span>
      </div>

      {/* ── The call: locked in before the bell ── */}
      <div className="border-b border-bb-steel/50 px-2 py-1.5">
        <div className="mb-0.5 flex items-baseline justify-between gap-2">
          <span className="label !text-[8px] !text-bb-amber">The call</span>
          <SpeakButton text={desk.call} onSubtitle={onSubtitle} />
        </div>
        {desk.call ? (
          <p className="text-[11px] leading-snug text-bb-bone">{desk.call}</p>
        ) : (
          <p className="text-[10px] leading-snug text-bb-steel">
            Taking a view on the fight…
          </p>
        )}
      </div>

      {/* ── The read: live, and only when there is something to read ── */}
      <div className="px-2 py-1.5">
        <div className="mb-0.5 flex items-baseline justify-between gap-2">
          <span className="label !text-[8px]" style={{ color: leaderColour }}>
            The read
          </span>
          {desk.readLabel && (
            <span className="label !text-[8px] !tracking-normal text-bb-steel">
              {desk.readLabel}
            </span>
          )}
          <SpeakButton text={desk.read} onSubtitle={onSubtitle} />
        </div>
        {desk.read ? (
          <p className="text-[11px] leading-snug text-bb-chrome">
            {desk.read}
            {desk.loading && (
              <span className="ml-0.5 inline-block h-3 w-1 translate-y-0.5 animate-pulse bg-bb-red" />
            )}
          </p>
        ) : (
          <p className="text-[10px] leading-snug text-bb-steel">
            {desk.loading
              ? "Reading the fight…"
              : `Watching. Round ${round} of ${MAX_ROUNDS}.`}
          </p>
        )}
      </div>
    </section>
  );
}

/** Hear it again. Absent until there is something to hear. */
function SpeakButton({
  text,
  onSubtitle,
}: {
  text: string;
  onSubtitle: (text: string) => void;
}) {
  if (!text) return null;
  return (
    <button
      onClick={() => {
        onSubtitle(text);
        void speakLine(text);
      }}
      className="label shrink-0 !text-[8px] text-bb-steel transition-colors hover:text-bb-bone"
      title="Hear this again"
    >
      ▶ Play
    </button>
  );
}
